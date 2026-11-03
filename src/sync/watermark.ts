/**
 * Watermark Storage - the incremental sync checkpoint per connection
 *
 * The watermark is the start time of the last fully successful pull. The
 * next run asks the platform only for products modified after it. A stored
 * value that fails validation reads back as null, which makes the engine
 * fall back to one full pass (reported in the run notes) instead of
 * silently syncing nothing.
 */
import {
  PLUGIN_KIND_WATERMARK,
  fieldValue,
  readPluginDataItems,
  writePluginDataItems,
} from "../storage/internal"

/**
 * Shape check before Date.parse: a full ISO timestamp with optional time
 * and zone parts. Bare digit strings and other Date.parse party tricks are
 * rejected by the pattern.
 */
const ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

/** Whether a string is a plausible ISO 8601 timestamp. */
export function isValidIsoTimestamp(value: string): boolean {
  if (!ISO_PATTERN.test(value)) {
    return false
  }
  return !Number.isNaN(Date.parse(value))
}

/**
 * Read the raw stored watermark of one connection without validating it,
 * so callers can tell an invalid value from a missing one. Returns the
 * trimmed payload, or null when nothing is stored.
 */
export async function getStoredWatermark(
  connectionId: string
): Promise<string | null> {
  const items = await readPluginDataItems(PLUGIN_KIND_WATERMARK, connectionId)
  const first = items[0]
  if (!first) {
    return null
  }
  return fieldValue(first, "payload").trim()
}

/**
 * Read the watermark of one connection: a valid ISO timestamp or null when
 * nothing (or nothing valid) is stored.
 */
export async function getWatermark(connectionId: string): Promise<string | null> {
  const value = await getStoredWatermark(connectionId)
  return value !== null && isValidIsoTimestamp(value) ? value : null
}

/** Save the watermark of one connection, updating the existing item in place. */
export async function setWatermark(
  connectionId: string,
  iso: string
): Promise<void> {
  const existing = await readPluginDataItems(PLUGIN_KIND_WATERMARK, connectionId)
  const previous = existing[0]
  await writePluginDataItems([
    {
      ...(previous ? { id: previous.id } : {}),
      kind: PLUGIN_KIND_WATERMARK,
      connectionId,
      payload: iso,
      syncedAt: iso,
    },
  ])
}
