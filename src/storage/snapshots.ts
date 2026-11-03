/**
 * Snapshot Storage - the platform values each synced item had at last pull
 *
 * Two-way sync (spec 004) compares the CMS against these snapshots to tell
 * "changed in the CMS" apart from "changed on the platform". Spec 003 only
 * writes them; nothing reads them yet. One plugin data item (kind
 * "sync_snapshot") exists per synced product, keyed by item_ref.
 */
import {
  PLUGIN_KIND_SNAPSHOT,
  fieldValue,
  readPluginDataItems,
  writePluginDataItems,
} from "./internal"

/** One snapshot to write: the platform product id and its pulled values. */
export interface SnapshotEntry {
  itemWooId: string
  values: Record<string, unknown>
}

/** Writes are chunked so one addItems call stays small for big catalogs. */
const SNAPSHOT_CHUNK_SIZE = 50

/**
 * Load all snapshots of one connection as a map keyed by platform product
 * id. Corrupted payloads are skipped.
 */
export async function getSnapshots(
  connectionId: string
): Promise<Map<string, Record<string, unknown>>> {
  const items = await readPluginDataItems(PLUGIN_KIND_SNAPSHOT, connectionId)
  const snapshots = new Map<string, Record<string, unknown>>()
  for (const item of items) {
    const itemRef = fieldValue(item, "item_ref")
    if (!itemRef) {
      continue
    }
    try {
      const parsed = JSON.parse(
        fieldValue(item, "payload")
      ) as Record<string, unknown>
      snapshots.set(itemRef, parsed)
    } catch {
      // Skip the corrupted entry and keep reading.
    }
  }
  return snapshots
}

/**
 * Write snapshots, updating the existing item of a product in place when one
 * exists and creating it otherwise.
 */
export async function writeSnapshots(
  connectionId: string,
  entries: SnapshotEntry[]
): Promise<void> {
  if (entries.length === 0) {
    return
  }
  const existing = await readPluginDataItems(PLUGIN_KIND_SNAPSHOT, connectionId)
  const idByRef = new Map<string, string>()
  for (const item of existing) {
    const itemRef = fieldValue(item, "item_ref")
    if (itemRef) {
      idByRef.set(itemRef, item.id)
    }
  }
  const now = new Date().toISOString()
  for (let start = 0; start < entries.length; start += SNAPSHOT_CHUNK_SIZE) {
    const chunk = entries.slice(start, start + SNAPSHOT_CHUNK_SIZE)
    await writePluginDataItems(
      chunk.map(function toWrite(entry) {
        const existingId = idByRef.get(entry.itemWooId)
        return {
          ...(existingId ? { id: existingId } : {}),
          kind: PLUGIN_KIND_SNAPSHOT,
          connectionId,
          itemRef: entry.itemWooId,
          payload: JSON.stringify(entry.values),
          syncedAt: now,
        }
      })
    )
  }
}
