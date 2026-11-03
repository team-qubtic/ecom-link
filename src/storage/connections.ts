/**
 * Connection Storage (CMS-backed)
 *
 * @framer/plugin v4 has no plugin-scoped key-value storage (verified in
 * docs/API-NOTES.md), so connection records live as items in a dedicated
 * internal CMS collection named "Ecom-Link Internal" (architecture D5).
 *
 * Security contract:
 * - Views only ever receive ConnectionRecord values with masked keys
 *   ("ck_\u2022\u2022\u2022\u20221234"). Full secrets never leave this module except as
 *   Basic auth headers inside the provider's validateConnection call.
 * - Secrets are never logged and never placed in URLs.
 * - Known MVP limitation (flagged for the Security review): anyone with CMS
 *   access to this project can open the internal collection and read the
 *   stored key values. Disconnecting removes them.
 */

import { getProvider } from "../providers"
import type { Credentials } from "../providers"
import {
  ConnectionValidationError,
  assertCanEditCms,
  ensureInternalCollection,
  fieldBool,
  fieldValue,
  findInternalCollection,
  loadFieldMaps,
  toIdKeyed,
  toNameKeyed,
  type SdkCollectionLike,
} from "./internal"

// Re-exported for existing imports across views and tests; the single
// definition now lives in ./internal so every storage module throws the
// same error class.
export {
  ConnectionValidationError,
  CMS_PERMISSION_MESSAGE,
} from "./internal"

// ============================================================================
// Public Types
// ============================================================================

/** API key scope: read for one-way sync, read and write for two-way sync. */
export type KeyScope = "read" | "read_write"

/** Outcome of the last validation probe against the store. */
export type ValidationState = "unvalidated" | "valid" | "invalid"

/**
 * View-facing connection record. Secrets appear only as masked strings, so
 * this shape is safe to hand to any React component.
 */
export interface ConnectionRecord {
  /** CMS item id inside the internal collection. */
  id: string
  /** Provider id, "woocommerce" in v1. */
  providerId: string
  /** Normalized store URL, HTTPS enforced. */
  storeUrl: string
  /** Derived host, e.g. "store.example.com", for display. */
  storeHost: string
  /** Masked consumer key, e.g. "ck_\u2022\u2022\u2022\u20221234". */
  consumerKeyMasked: string
  /** Masked consumer secret. */
  consumerSecretMasked: string
  keyScope: KeyScope
  /** Set once the companion WordPress plugin is installed. */
  companionPluginUrl: string | null
  validationState: ValidationState
  /** ISO timestamp of the last validation probe. */
  lastValidatedAt: string | null
  /** Exactly one connection is active at any time. */
  isActive: boolean
}

/** Input for saveConnection. When editing, blank secrets keep stored ones. */
export interface SaveConnectionInput {
  /** Present when editing an existing connection. */
  id?: string
  providerId: string
  storeUrl: string
  /** Leave blank on edit to keep the stored key. */
  consumerKey?: string
  /** Leave blank on edit to keep the stored secret. */
  consumerSecret?: string
  keyScope: KeyScope
  companionPluginUrl?: string | null
}

/** Result of URL normalization: either a clean URL or a user-facing sentence. */
export type UrlNormalizationResult =
  | { ok: true; url: string }
  | { ok: false; message: string }

// ============================================================================
// Pure Helpers (exported for tests)
// ============================================================================

const HTTPS_BLOCKED_MESSAGE = "Store addresses must use HTTPS."
const INVALID_URL_MESSAGE =
  "Enter a valid store address, such as https://store.example.com."
const EMPTY_URL_MESSAGE = "Enter your store address."
const KEY_FORMAT_MESSAGE =
  "Consumer keys start with ck_ and secrets start with cs_. Check the keys you generated in WooCommerce."
const MISSING_CONNECTION_MESSAGE =
  "This connection no longer exists. Refresh the dashboard and try again."

const KEEP_PREFIX_LENGTH = 3
const MASK_BULLETS = "\u2022\u2022\u2022\u2022"

/** Dev-only localhost exception for the HTTPS rule (spec 002 section 7 AC1). */
function isLocalHost(hostName: string): boolean {
  const lowered = hostName.toLowerCase()
  return (
    lowered === "localhost" ||
    lowered === "127.0.0.1" ||
    lowered === "[::1]" ||
    lowered.endsWith(".localhost")
  )
}

/**
 * Normalize a store URL: trim, add https:// when the protocol is missing,
 * enforce HTTPS outside localhost, strip trailing slashes and any pasted
 * /wp-json REST suffix. Returns a user-facing sentence on failure.
 */
export function normalizeStoreUrl(rawUrl: string): UrlNormalizationResult {
  const trimmed = rawUrl.trim()
  if (trimmed === "") {
    return { ok: false, message: EMPTY_URL_MESSAGE }
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    return { ok: false, message: INVALID_URL_MESSAGE }
  }
  if (parsed.protocol !== "https:" && !isLocalHost(parsed.hostname)) {
    return { ok: false, message: HTTPS_BLOCKED_MESSAGE }
  }
  if (!parsed.hostname.includes(".") && !isLocalHost(parsed.hostname)) {
    return { ok: false, message: INVALID_URL_MESSAGE }
  }
  const pathWithoutSlashes = parsed.pathname.replace(/\/+$/, "")
  // Merchants often paste the REST base; keep only the store origin and path.
  const pathWithoutRestBase = pathWithoutSlashes.replace(
    /\/wp-json(\/wc(\/v3)?)?$/i,
    ""
  )
  return {
    ok: true,
    url: `${parsed.protocol}//${parsed.host}${pathWithoutRestBase}`,
  }
}

/**
 * Mask a credential for display: keep the recognizable prefix and the last
 * four characters, and hide everything between them.
 */
export function maskSecret(secret: string): string {
  const prefix = secret.slice(0, KEEP_PREFIX_LENGTH)
  const tail = secret.length > 8 ? secret.slice(-4) : ""
  return `${prefix}${MASK_BULLETS}${tail}`
}

/**
 * Check WooCommerce key prefixes (spec 002 section 4). Wrong prefixes almost
 * always mean the merchant pasted the wrong strings.
 */
export function validateKeyFormat(
  consumerKey: string,
  consumerSecret: string
): { ok: boolean; message: string | null } {
  if (consumerKey.startsWith("ck_") && consumerSecret.startsWith("cs_")) {
    return { ok: true, message: null }
  }
  return { ok: false, message: KEY_FORMAT_MESSAGE }
}

/** Extract "store.example.com" from a normalized store URL, for display. */
export function hostFromUrl(storeUrl: string): string {
  try {
    return new URL(storeUrl).host
  } catch {
    return storeUrl
  }
}

// ============================================================================
// Internal CMS Collection Access
//
// The SDK boundary (class-shaped API subset, permission guard, find or
// create of the "Ecom-Link Internal" collection, and field name to field
// ID translation) lives in ./internal.ts and is shared with the other
// plugin data modules. This file only keeps the connection field schema.
// ============================================================================

/**
 * An item of the internal collection with fieldData keyed by field name.
 * Everything in this module addresses fields by name.
 */
interface ConnectionItem {
  id: string
  fieldData: Record<string, { type?: string; value?: unknown }>
}

/** Schema of the internal collection. Names double as fieldData keys. */
const INTERNAL_FIELDS: Array<{ name: string; type: string }> = [
  { name: "name", type: "string" }, // store host, so items are recognizable in the CMS
  { name: "provider_id", type: "string" },
  { name: "store_url", type: "string" },
  { name: "consumer_key", type: "string" },
  { name: "consumer_secret", type: "string" },
  { name: "key_scope", type: "string" },
  { name: "companion_plugin_url", type: "string" },
  { name: "validation_state", type: "string" },
  { name: "last_validated_at", type: "string" },
  { name: "is_active", type: "boolean" },
]

function parseValidationState(value: string): ValidationState {
  return value === "valid" || value === "invalid" ? value : "unvalidated"
}

/**
 * Convert a raw CMS item into the masked, view-facing record. This is the
 * only path from stored secrets to anything a component can see.
 */
function toConnectionRecord(item: ConnectionItem): ConnectionRecord {
  const storeUrl = fieldValue(item, "store_url")
  return {
    id: item.id,
    providerId: fieldValue(item, "provider_id"),
    storeUrl,
    storeHost: hostFromUrl(storeUrl),
    consumerKeyMasked: maskSecret(fieldValue(item, "consumer_key")),
    consumerSecretMasked: maskSecret(fieldValue(item, "consumer_secret")),
    keyScope:
      fieldValue(item, "key_scope") === "read_write" ? "read_write" : "read",
    companionPluginUrl: fieldValue(item, "companion_plugin_url") || null,
    validationState: parseValidationState(fieldValue(item, "validation_state")),
    lastValidatedAt: fieldValue(item, "last_validated_at") || null,
    isActive: fieldBool(item, "is_active"),
  }
}

/**
 * Load all items of the internal collection with fieldData keyed by field
 * name.
 */
async function fetchItems(
  collection: SdkCollectionLike
): Promise<ConnectionItem[]> {
  const maps = await loadFieldMaps(collection)
  const items = await collection.getItems()
  return items.map(function toNamedItem(item) {
    return {
      id: item.id,
      fieldData: toNameKeyed(item.fieldData, maps.nameById),
    }
  })
}

async function findItemById(
  collection: SdkCollectionLike,
  itemId: string
): Promise<ConnectionItem | null> {
  const items = await fetchItems(collection)
  return (
    items.find(function hasId(item) {
      return item.id === itemId
    }) ?? null
  )
}

/** Look up one stored item by id without creating the collection. */
async function findStoredItem(itemId: string): Promise<ConnectionItem | null> {
  const collection = await findInternalCollection()
  return collection ? findItemById(collection, itemId) : null
}

/** Unwrap a name-keyed item into plain values for merging on update. */
function itemFieldValues(item: ConnectionItem): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(item.fieldData)) {
    values[name] = entry.value
  }
  return values
}

/**
 * Append a new item carrying the given name-keyed values and return it. The
 * slug combines the store host with a random suffix so slugs stay unique
 * even when the same store is connected twice.
 */
async function createConnectionItem(
  collection: SdkCollectionLike,
  values: Record<string, unknown>
): Promise<ConnectionItem> {
  const maps = await loadFieldMaps(collection)
  const hostSlug = String(values.name ?? "store")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const suffix = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`
  const slug = `${hostSlug || "store"}-${suffix}`
  assertCanEditCms("Collection.addItems")
  await collection.addItems([
    { slug, fieldData: toIdKeyed(values, maps.idByName, INTERNAL_FIELDS) },
  ])
  const items = await collection.getItems()
  const created = items.find(function hasSlug(item) {
    return item.slug === slug
  })
  if (!created) {
    throw new ConnectionValidationError(MISSING_CONNECTION_MESSAGE)
  }
  return {
    id: created.id,
    fieldData: toNameKeyed(created.fieldData, maps.nameById),
  }
}

/**
 * Rewrite an existing item with the merged result of its current values and
 * the given changes. The full field set is sent every time because the SDK
 * gives no merge guarantee for item updates.
 */
async function updateConnectionItem(
  collection: SdkCollectionLike,
  itemId: string,
  changes: Record<string, unknown>
): Promise<ConnectionItem> {
  const existing = await findItemById(collection, itemId)
  if (!existing) {
    throw new ConnectionValidationError(MISSING_CONNECTION_MESSAGE)
  }
  const maps = await loadFieldMaps(collection)
  const merged = { ...itemFieldValues(existing), ...changes }
  assertCanEditCms("Collection.addItems")
  await collection.addItems([
    { id: itemId, fieldData: toIdKeyed(merged, maps.idByName, INTERNAL_FIELDS) },
  ])
  const updated = await findItemById(collection, itemId)
  if (!updated) {
    throw new ConnectionValidationError(MISSING_CONNECTION_MESSAGE)
  }
  return updated
}

// ============================================================================
// Public Storage API
// ============================================================================

/**
 * List all saved connections as masked records. Returns an empty list when
 * the internal collection does not exist yet (nothing has been saved).
 */
export async function listConnections(): Promise<ConnectionRecord[]> {
  const collection = await findInternalCollection()
  if (!collection) {
    return []
  }
  const items = await fetchItems(collection)
  return items.map(toConnectionRecord)
}

/** Get the one active connection, or null when there is none. */
export async function getActiveConnection(): Promise<ConnectionRecord | null> {
  const connections = await listConnections()
  return (
    connections.find(function isActive(connection) {
      return connection.isActive
    }) ?? null
  )
}

/**
 * Full credentials for a connection. Reserved for the storage layer itself
 * and the sync engine in specs 003 and 004. Views must never call this.
 */
export async function getFullCredentials(
  connectionId: string
): Promise<Credentials> {
  const item = await findStoredItem(connectionId)
  if (!item) {
    throw new ConnectionValidationError(MISSING_CONNECTION_MESSAGE)
  }
  return {
    storeUrl: fieldValue(item, "store_url"),
    consumerKey: fieldValue(item, "consumer_key"),
    consumerSecret: fieldValue(item, "consumer_secret"),
  }
}

/**
 * Save (create or update) a connection. Normalizes the URL, checks key
 * prefixes, validates against the store through the provider contract, and
 * only then writes the item. Throws before saving anything when validation
 * fails, so a failed attempt never leaves a half-saved connection.
 * The first connection saved becomes the active one automatically.
 */
export async function saveConnection(
  input: SaveConnectionInput
): Promise<ConnectionRecord> {
  const normalized = normalizeStoreUrl(input.storeUrl)
  if (!normalized.ok) {
    throw new ConnectionValidationError(normalized.message, "storeUrl")
  }
  // Resolve secrets: new values when provided, stored values when editing.
  const editingItem = input.id ? await findStoredItem(input.id) : null
  let consumerKey = (input.consumerKey ?? "").trim()
  let consumerSecret = (input.consumerSecret ?? "").trim()
  if (editingItem) {
    if (consumerKey === "") {
      consumerKey = fieldValue(editingItem, "consumer_key")
    }
    if (consumerSecret === "") {
      consumerSecret = fieldValue(editingItem, "consumer_secret")
    }
  }
  const format = validateKeyFormat(consumerKey, consumerSecret)
  if (!format.ok) {
    throw new ConnectionValidationError(
      format.message ?? KEY_FORMAT_MESSAGE,
      "consumerKey"
    )
  }
  // Validate against the store before anything is written (spec 002 AC2).
  const credentials: Credentials = {
    storeUrl: normalized.url,
    consumerKey,
    consumerSecret,
  }
  await getProvider(input.providerId).validateConnection(credentials)
  // The collection is only created once the store has accepted the keys, so
  // a failed attempt never leaves a half-initialized collection behind.
  const collection = await ensureInternalCollection(INTERNAL_FIELDS)
  const nowIso = new Date().toISOString()
  const companionUrl = input.companionPluginUrl?.trim() ?? ""
  if (editingItem) {
    const updated = await updateConnectionItem(collection, editingItem.id, {
      name: hostFromUrl(normalized.url),
      provider_id: input.providerId,
      store_url: normalized.url,
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      key_scope: input.keyScope,
      companion_plugin_url: companionUrl,
      validation_state: "valid",
      last_validated_at: nowIso,
      is_active: fieldBool(editingItem, "is_active"),
    })
    return toConnectionRecord(updated)
  }
  // New connection: active when no other connection is active yet.
  const items = await fetchItems(collection)
  const hasActive = items.some(function anyActive(item) {
    return fieldBool(item, "is_active")
  })
  const created = await createConnectionItem(collection, {
    name: hostFromUrl(normalized.url),
    provider_id: input.providerId,
    store_url: normalized.url,
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
    key_scope: input.keyScope,
    companion_plugin_url: companionUrl,
    validation_state: "valid",
    last_validated_at: nowIso,
    is_active: !hasActive,
  })
  return toConnectionRecord(created)
}

/**
 * Re-run validation for a saved connection and store the outcome. Throws the
 * provider error after recording the invalid state, so callers can show the
 * exact sentence while the dashboard reflects reality.
 */
export async function revalidateConnection(
  connectionId: string
): Promise<ConnectionRecord> {
  const collection = await findInternalCollection()
  const item = collection ? await findItemById(collection, connectionId) : null
  if (!item || !collection) {
    throw new ConnectionValidationError(MISSING_CONNECTION_MESSAGE)
  }
  const credentials: Credentials = {
    storeUrl: fieldValue(item, "store_url"),
    consumerKey: fieldValue(item, "consumer_key"),
    consumerSecret: fieldValue(item, "consumer_secret"),
  }
  const nowIso = new Date().toISOString()
  try {
    await getProvider(fieldValue(item, "provider_id")).validateConnection(
      credentials
    )
    await updateConnectionItem(collection, item.id, {
      validation_state: "valid",
      last_validated_at: nowIso,
    })
  } catch (error) {
    await updateConnectionItem(collection, item.id, {
      validation_state: "invalid",
      last_validated_at: nowIso,
    })
    throw error
  }
  const refreshed = await findItemById(collection, connectionId)
  if (!refreshed) {
    throw new ConnectionValidationError(MISSING_CONNECTION_MESSAGE)
  }
  return toConnectionRecord(refreshed)
}

/**
 * Check write access (CORS preflight) for a saved connection through its
 * provider. Returns false when the provider cannot answer preflights or the
 * connection is missing; never throws.
 */
export async function checkConnectionWriteAccess(
  connectionId: string
): Promise<boolean> {
  const collection = await findInternalCollection()
  const item = collection ? await findItemById(collection, connectionId) : null
  if (!item || !collection) {
    return false
  }
  const provider = getProvider(fieldValue(item, "provider_id"))
  if (typeof provider.checkWriteAccess !== "function") {
    return false
  }
  return provider.checkWriteAccess({
    storeUrl: fieldValue(item, "store_url"),
    consumerKey: fieldValue(item, "consumer_key"),
    consumerSecret: fieldValue(item, "consumer_secret"),
  })
}

/**
 * Make exactly one connection active. Every other connection is deactivated
 * in the same pass so the invariant holds after any failure.
 */
export async function setActiveConnection(connectionId: string): Promise<void> {
  const collection = await findInternalCollection()
  if (!collection) {
    return
  }
  const items = await fetchItems(collection)
  for (const item of items) {
    const shouldBeActive = item.id === connectionId
    if (fieldBool(item, "is_active") !== shouldBeActive) {
      await updateConnectionItem(collection, item.id, {
        is_active: shouldBeActive,
      })
    }
  }
}

/**
 * Delete a connection. Deleting the item clears the credentials, the
 * companion plugin URL, and every other stored field (spec 002 AC5 and AC6).
 * If the deleted connection was active, the first remaining one takes over.
 * Snapshot and history cleanup for the removed store arrives with specs 003
 * and 004, which own those collections.
 */
export async function deleteConnection(connectionId: string): Promise<void> {
  const collection = await findInternalCollection()
  if (!collection) {
    return
  }
  const items = await fetchItems(collection)
  const target = items.find(function hasId(item) {
    return item.id === connectionId
  })
  if (!target) {
    return
  }
  const wasActive = fieldBool(target, "is_active")
  assertCanEditCms("Collection.removeItems")
  await collection.removeItems([connectionId])
  if (wasActive) {
    const remaining = items.filter(function notDeleted(item) {
      return item.id !== connectionId
    })
    const next = remaining[0]
    if (next) {
      await updateConnectionItem(collection, next.id, {
        is_active: true,
      })
    }
  }
}
