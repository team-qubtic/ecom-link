/**
 * Shared infrastructure for plugin-owned data in the internal CMS collection.
 *
 * Framer plugin SDK v4 has no plugin-scoped storage, so everything the plugin
 * persists (connections, sync settings, watermark, snapshots, run history)
 * lives as items in a dedicated internal collection named "Ecom-Link
 * Internal" (architecture decision D5). This module owns the SDK boundary:
 * the class-shaped subset of the API this storage layer depends on, the
 * permission guard, find-or-create of the internal collection, and the field
 * name to field ID translation the SDK requires (fieldData is keyed by field
 * ID, never by name).
 *
 * Plugin data items other than connections use a generic five-field
 * vocabulary so new kinds never need schema migrations: kind, connection_id,
 * item_ref, payload (a JSON string), and synced_at. Settings, watermark,
 * snapshots, and history each store their structured data inside payload.
 */
import { framer } from "../lib/framer"

/**
 * Raised when an account without CMS edit access reaches a protected SDK
 * call, and for other storage-level validation problems. Lives here so every
 * storage module throws the same error class; connections.ts re-exports it.
 */
export class ConnectionValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldName?: "storeUrl" | "consumerKey" | "consumerSecret"
  ) {
    super(message)
    this.name = "ConnectionValidationError"
  }
}

/** Sentence shown when the account cannot edit CMS collections. */
export const CMS_PERMISSION_MESSAGE =
  "This Framer account cannot edit CMS collections. Open the plugin with edit access to this project."

/** Name of the internal collection that holds all plugin-owned data. */
export const INTERNAL_COLLECTION_NAME = "Ecom-Link Internal"

/** The subset of the Framer Field class this storage layer depends on. */
export interface SdkFieldLike {
  id: string
  name: string
  type?: string
}

/** An item as the SDK returns it: fieldData keyed by field ID, not name. */
export interface SdkItemLike {
  id: string
  slug?: string
  fieldData?: Record<string, { type?: string; value?: unknown }>
}

/** The subset of the Framer Collection class this storage layer depends on. */
export interface SdkCollectionLike {
  id: string
  name: string
  getFields(): Promise<SdkFieldLike[]>
  addFields(
    fields: Array<{ name: string; type: string }>
  ): Promise<SdkFieldLike[]>
  getItems(): Promise<SdkItemLike[]>
  addItems(
    items: Array<{
      id?: string
      slug?: string
      fieldData?: Record<string, { type: string; value: unknown }>
    }>
  ): Promise<void>
  removeItems(itemIds: string[]): Promise<void>
}

/** The subset of the Framer plugin API this storage layer depends on. */
export interface SdkApi {
  getCollections(): Promise<SdkCollectionLike[]>
  createCollection(name: string): Promise<SdkCollectionLike>
  /** Synchronous permission check required before protected SDK calls. */
  isAllowedTo?(...methods: string[]): boolean
  /** Adds an image from a URL and returns an asset with its id. */
  addImage?(url: string, options?: { altText?: string }): Promise<{ id: string }>
}

export const sdk = framer as unknown as SdkApi

/**
 * Framer guards protected SDK calls behind a permission check. Calling one
 * without first asking framer.isAllowedTo logs "Invoking protected message
 * type ... without checking permission first" and can fail outright, so
 * every protected call goes through this guard. Throws a user-facing
 * sentence when the account cannot edit CMS collections. An undefined
 * answer (the standalone browser preview stub) lets the call through so
 * the later stub guard produces the right message instead.
 */
export function assertCanEditCms(method: string): void {
  if (typeof sdk.isAllowedTo !== "function") {
    return
  }
  if (sdk.isAllowedTo(method) === false) {
    throw new ConnectionValidationError(CMS_PERMISSION_MESSAGE)
  }
}

/**
 * An internal-collection item with fieldData keyed by field name. Modules
 * outside the SDK boundary address fields by name only.
 */
export interface PluginDataItem {
  id: string
  slug?: string
  fieldData: Record<string, { type?: string; value?: unknown }>
}

/** Field name and ID mappings for one collection. */
export interface FieldMaps {
  nameById: Map<string, string>
  idByName: Map<string, string>
}

/**
 * Find the internal collection without creating anything (used by reads). A
 * non-array response (the standalone browser preview stub) means nothing is
 * saved yet.
 */
export async function findInternalCollection(): Promise<SdkCollectionLike | null> {
  const collections = await sdk.getCollections()
  if (!Array.isArray(collections)) {
    return null
  }
  return (
    collections.find(function hasName(collection) {
      return collection?.name === INTERNAL_COLLECTION_NAME
    }) ?? null
  )
}

/** Create any missing fields from the given spec (self-repair on access). */
export async function ensureInternalFields(
  collection: SdkCollectionLike,
  fields: Array<{ name: string; type: string }>
): Promise<void> {
  const existing = await collection.getFields()
  const existingNames = new Set(
    existing.map(function nameOf(field) {
      return field.name
    })
  )
  const missing = fields.filter(function notPresent(field) {
    return !existingNames.has(field.name)
  })
  if (missing.length > 0) {
    assertCanEditCms("Collection.addFields")
    await collection.addFields(missing)
  }
}

/**
 * Find or create the internal collection, creating any fields from the given
 * spec that are missing. Callers pass the fields their kind needs; the union
 * of all specs accumulates in the collection over time.
 */
export async function ensureInternalCollection(
  fields: Array<{ name: string; type: string }>
): Promise<SdkCollectionLike> {
  const existing = await findInternalCollection()
  if (existing) {
    await ensureInternalFields(existing, fields)
    return existing
  }
  assertCanEditCms("createCollection")
  const created = await sdk.createCollection(INTERNAL_COLLECTION_NAME)
  if (!created || typeof created.getFields !== "function") {
    // Out-of-contract response (the standalone browser preview stub).
    throw new ConnectionValidationError(
      "Open the plugin inside Framer to save plugin data."
    )
  }
  await ensureInternalFields(created, fields)
  return created
}

/** Load the field name and ID mappings for one collection. */
export async function loadFieldMaps(
  collection: SdkCollectionLike
): Promise<FieldMaps> {
  const fields = await collection.getFields()
  const nameById = new Map<string, string>()
  const idByName = new Map<string, string>()
  for (const field of fields) {
    nameById.set(field.id, field.name)
    idByName.set(field.name, field.id)
  }
  return { nameById, idByName }
}

/** Rewrite ID-keyed SDK fieldData into the name-keyed shape used here. */
export function toNameKeyed(
  fieldData: SdkItemLike["fieldData"],
  nameById: Map<string, string>
): PluginDataItem["fieldData"] {
  const result: PluginDataItem["fieldData"] = {}
  for (const [fieldId, entry] of Object.entries(fieldData ?? {})) {
    result[nameById.get(fieldId) ?? fieldId] = entry
  }
  return result
}

/**
 * Wrap name-keyed field values into ID-keyed SDK fieldData. Types come from
 * the given field spec so they can never drift from the schema.
 */
export function toIdKeyed(
  values: Record<string, unknown>,
  idByName: Map<string, string>,
  fields: Array<{ name: string; type: string }>
): Record<string, { type: string; value: unknown }> {
  const result: Record<string, { type: string; value: unknown }> = {}
  for (const [name, value] of Object.entries(values)) {
    const definition = fields.find(function named(field) {
      return field.name === name
    })
    result[idByName.get(name) ?? name] = {
      type: definition ? definition.type : "string",
      value,
    }
  }
  return result
}

/** Read a string field value from a name-keyed item (empty when unset). */
export function fieldValue(item: PluginDataItem, fieldName: string): string {
  const entry = item.fieldData[fieldName]
  return typeof entry?.value === "string" ? entry.value : ""
}

/** Read a boolean field value from a name-keyed item. */
export function fieldBool(item: PluginDataItem, fieldName: string): boolean {
  return item.fieldData[fieldName]?.value === true
}

// ---------------------------------------------------------------------------
// Generic plugin data items (settings, watermark, snapshots, history)
// ---------------------------------------------------------------------------

/** Item kinds stored in the internal collection. */
export const PLUGIN_KIND_SETTINGS = "sync_settings"
export const PLUGIN_KIND_WATERMARK = "watermark"
export const PLUGIN_KIND_HISTORY = "sync_history"
export const PLUGIN_KIND_SNAPSHOT = "sync_snapshot"

/**
 * Schema of the generic plugin data fields. All structured data rides in
 * payload as JSON so new kinds never require new CMS fields.
 */
export const PLUGIN_DATA_FIELDS: Array<{ name: string; type: string }> = [
  { name: "kind", type: "string" },
  { name: "connection_id", type: "string" },
  { name: "item_ref", type: "string" },
  { name: "payload", type: "string" },
  { name: "synced_at", type: "string" },
]

/** Generate a unique slug for a plugin data item creation. */
function pluginDataSlug(kind: string, connectionId: string, itemRef: string): string {
  const stamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  const connectionPart = connectionId ? `-${connectionId.slice(0, 8)}` : ""
  const refPart = itemRef ? `-${itemRef.slice(0, 24)}` : ""
  return `${kind}${connectionPart}${refPart}-${stamp}${random}`
}

/**
 * Read every plugin data item of one kind for one connection, newest first
 * by creation. Returns an empty list when nothing is saved yet, so callers
 * never need to create the internal collection just to read.
 */
export async function readPluginDataItems(
  kind: string,
  connectionId: string
): Promise<PluginDataItem[]> {
  const collection = await findInternalCollection()
  if (!collection) {
    return []
  }
  const maps = await loadFieldMaps(collection)
  const items = await collection.getItems()
  const matches: PluginDataItem[] = []
  for (const item of items) {
    const nameKeyed = toNameKeyed(item.fieldData, maps.nameById)
    const record: PluginDataItem = {
      id: item.id,
      slug: item.slug,
      fieldData: nameKeyed,
    }
    if (fieldValue(record, "kind") !== kind) {
      continue
    }
    if (fieldValue(record, "connection_id") !== connectionId) {
      continue
    }
    matches.push(record)
  }
  return matches
}

/** One plugin data item to create (no id) or update in place (id). */
export interface PluginDataWrite {
  id?: string
  kind: string
  connectionId: string
  itemRef?: string
  payload: string
  syncedAt?: string
}

/**
 * Create or update plugin data items in one batched write. Every item sends
 * the full five-field set because the SDK does not document merge semantics
 * for updates. addItems returns void, so callers that need the created IDs
 * re-read with readPluginDataItems afterwards.
 */
export async function writePluginDataItems(
  writes: PluginDataWrite[]
): Promise<void> {
  if (writes.length === 0) {
    return
  }
  const collection = await ensureInternalCollection(PLUGIN_DATA_FIELDS)
  const maps = await loadFieldMaps(collection)
  assertCanEditCms("Collection.addItems")
  await collection.addItems(
    writes.map(function toSdkItem(write) {
      const values: Record<string, unknown> = {
        kind: write.kind,
        connection_id: write.connectionId,
        item_ref: write.itemRef ?? "",
        payload: write.payload,
        synced_at: write.syncedAt ?? "",
      }
      const fieldData = toIdKeyed(values, maps.idByName, PLUGIN_DATA_FIELDS)
      if (write.id) {
        return { id: write.id, fieldData }
      }
      return {
        slug: pluginDataSlug(write.kind, write.connectionId, write.itemRef ?? ""),
        fieldData,
      }
    })
  )
}

/** Remove plugin data items by id (after the permission guard). */
export async function removePluginDataItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) {
    return
  }
  const collection = await findInternalCollection()
  if (!collection) {
    return
  }
  assertCanEditCms("Collection.removeItems")
  await collection.removeItems(itemIds)
}
