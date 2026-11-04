/**
 * App Settings Storage - global sync automation preferences
 *
 * Unlike per-connection sync settings, these are project-wide preferences
 * (auto-sync toggle and frequency) stored as ONE plugin data item (kind
 * "app_settings") with connection_id "global". Reading is defensive: any
 * error or malformed payload yields the documented defaults, so a broken
 * write can never crash the app or the auto-sync loop.
 */
import {
  fieldValue,
  readPluginDataItems,
  writePluginDataItems,
} from "./internal"

/** Selectable auto-sync intervals, mirroring the settings dropdown order. */
export const SYNC_FREQUENCIES = [
  "1 minute",
  "1 hour",
  "6 hours",
  "12 hours",
  "24 hours",
] as const

export type SyncFrequency = (typeof SYNC_FREQUENCIES)[number]

/** Global sync automation preferences. */
export interface AppSyncSettings {
  autoSync: boolean
  syncFrequency: SyncFrequency
  /** Start time of the last automatic sync, or null before the first one. */
  lastAutoSyncAt: string | null
}

/** The documented defaults: auto-sync off until the merchant enables it. */
export const DEFAULT_APP_SETTINGS: AppSyncSettings = {
  autoSync: false,
  syncFrequency: "1 hour",
  lastAutoSyncAt: null,
}

/** Convert a frequency label into its interval in milliseconds. */
export function parseSyncFrequencyMs(frequency: SyncFrequency | string): number {
  const map: Record<string, number> = {
    "1 minute": 60_000,
    "1 hour": 3_600_000,
    "6 hours": 21_600_000,
    "12 hours": 43_200_000,
    "24 hours": 86_400_000,
  }
  return map[frequency] ?? 3_600_000
}

function isSyncFrequency(value: unknown): value is SyncFrequency {
  return (
    typeof value === "string" &&
    (SYNC_FREQUENCIES as readonly string[]).includes(value)
  )
}

/** Merge a partial payload onto the defaults, keeping known keys only. */
function hydrateAppSettings(raw: unknown): AppSyncSettings {
  const base = DEFAULT_APP_SETTINGS
  if (typeof raw !== "object" || raw === null) {
    return base
  }
  const record = raw as Record<string, unknown>
  return {
    autoSync: record.autoSync === true,
    syncFrequency: isSyncFrequency(record.syncFrequency)
      ? record.syncFrequency
      : base.syncFrequency,
    lastAutoSyncAt:
      typeof record.lastAutoSyncAt === "string" && record.lastAutoSyncAt !== ""
        ? record.lastAutoSyncAt
        : null,
  }
}

/**
 * Read the global sync automation settings. Reading never creates the
 * internal collection, and any error falls back to the defaults.
 */
export async function getAppSyncSettings(): Promise<AppSyncSettings> {
  try {
    const items = await readPluginDataItems("app_settings", "global")
    const first = items[0]
    if (!first) {
      return DEFAULT_APP_SETTINGS
    }
    try {
      return hydrateAppSettings(JSON.parse(fieldValue(first, "payload")))
    } catch {
      return DEFAULT_APP_SETTINGS
    }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

/** Save the global sync automation settings, updating the item in place. */
export async function saveAppSyncSettings(
  settings: AppSyncSettings
): Promise<void> {
  const existing = await readPluginDataItems("app_settings", "global")
  const previous = existing[0]
  await writePluginDataItems([
    {
      ...(previous ? { id: previous.id } : {}),
      kind: "app_settings",
      connectionId: "global",
      payload: JSON.stringify({
        autoSync: settings.autoSync,
        syncFrequency: settings.syncFrequency,
        lastAutoSyncAt: settings.lastAutoSyncAt,
      }),
      syncedAt: new Date().toISOString(),
    },
  ])
}
