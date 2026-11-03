/**
 * Sync Settings Storage - per-connection sync configuration
 *
 * Settings live as one plugin data item (kind "sync_settings") per
 * connection, with the whole SyncSettings object serialized into the payload
 * field. Reading is defensive: corrupted JSON or a foreign shape yields null
 * so callers fall back to defaults instead of crashing mid sync.
 */
import type { NormalizedProductField } from "../providers"
import {
  PLUGIN_KIND_SETTINGS,
  fieldValue,
  readPluginDataItems,
  writePluginDataItems,
} from "./internal"

/**
 * Platform field of a mapping row. "id" is the locked identity row (the
 * woo_id field that matches CMS items to platform products); every other
 * value comes from the NormalizedProductField union.
 */
export type SyncPlatformField = NormalizedProductField | "id"

/** One mapping row: a platform field paired with a CMS field id. */
export interface SyncFieldMapping {
  platformField: SyncPlatformField
  cmsFieldId: string
  direction: "platform-to-cms" | "bidirectional"
  enabled: boolean
}

/** Sync configuration for one connection. */
export interface SyncSettings {
  targetCollectionId: string
  mapping: SyncFieldMapping[]
  defaultItemStatus: "draft" | "publish"
  statusesFilter: string[]
  safetyCap: number
  variationsCap: number
  galleryCap: number
}

/** Fresh settings for a collection, using the documented defaults. */
export function defaultSyncSettings(targetCollectionId: string): SyncSettings {
  return {
    targetCollectionId,
    mapping: [],
    defaultItemStatus: "draft",
    statusesFilter: ["publish"],
    safetyCap: 500,
    variationsCap: 30,
    galleryCap: 10,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isValidDirection(
  value: unknown
): value is SyncFieldMapping["direction"] {
  return value === "platform-to-cms" || value === "bidirectional"
}

/**
 * Parse the mapping rows. The platform field is accepted as any string so a
 * mapping saved by a future version (with a field this version does not know)
 * still loads instead of wiping the merchant's configuration.
 */
function parseMapping(value: unknown): SyncFieldMapping[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const rows: SyncFieldMapping[] = []
  for (const row of value) {
    if (!isRecord(row)) {
      return null
    }
    if (typeof row.platformField !== "string") {
      return null
    }
    if (typeof row.cmsFieldId !== "string") {
      return null
    }
    if (!isValidDirection(row.direction)) {
      return null
    }
    if (typeof row.enabled !== "boolean") {
      return null
    }
    rows.push({
      platformField: row.platformField as SyncPlatformField,
      cmsFieldId: row.cmsFieldId,
      direction: row.direction,
      enabled: row.enabled,
    })
  }
  return rows
}

/** Hydrate a parsed payload into full settings, or null when unusable. */
function hydrateSettings(raw: unknown): SyncSettings | null {
  if (!isRecord(raw)) {
    return null
  }
  if (typeof raw.targetCollectionId !== "string" || raw.targetCollectionId === "") {
    return null
  }
  const mapping = parseMapping(raw.mapping)
  if (mapping === null) {
    return null
  }
  const defaults = defaultSyncSettings(raw.targetCollectionId)
  const statusesFilter =
    Array.isArray(raw.statusesFilter) &&
    raw.statusesFilter.length > 0 &&
    raw.statusesFilter.every(function isString(value) {
      return typeof value === "string"
    })
      ? (raw.statusesFilter as string[])
      : defaults.statusesFilter
  return {
    targetCollectionId: raw.targetCollectionId,
    mapping,
    defaultItemStatus: raw.defaultItemStatus === "publish" ? "publish" : "draft",
    statusesFilter,
    safetyCap:
      typeof raw.safetyCap === "number" && raw.safetyCap > 0
        ? raw.safetyCap
        : defaults.safetyCap,
    variationsCap:
      typeof raw.variationsCap === "number" && raw.variationsCap > 0
        ? raw.variationsCap
        : defaults.variationsCap,
    galleryCap:
      typeof raw.galleryCap === "number" && raw.galleryCap > 0
        ? raw.galleryCap
        : defaults.galleryCap,
  }
}

/**
 * Read the settings of one connection, or null when nothing valid is saved.
 * Reading never creates the internal collection.
 */
export async function getSyncSettings(
  connectionId: string
): Promise<SyncSettings | null> {
  const items = await readPluginDataItems(PLUGIN_KIND_SETTINGS, connectionId)
  const first = items[0]
  if (!first) {
    return null
  }
  try {
    return hydrateSettings(JSON.parse(fieldValue(first, "payload")))
  } catch {
    return null
  }
}

/** Save the settings of one connection, updating the existing item in place. */
export async function saveSyncSettings(
  connectionId: string,
  settings: SyncSettings
): Promise<void> {
  const existing = await readPluginDataItems(PLUGIN_KIND_SETTINGS, connectionId)
  const previous = existing[0]
  await writePluginDataItems([
    {
      ...(previous ? { id: previous.id } : {}),
      kind: PLUGIN_KIND_SETTINGS,
      connectionId,
      payload: JSON.stringify(settings),
      syncedAt: new Date().toISOString(),
    },
  ])
}
