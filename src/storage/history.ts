/**
 * Run History Storage - the last few sync reports per connection
 *
 * Each finished run (completed, canceled, paused, or stopped) is stored as
 * one plugin data item (kind "sync_history") whose payload is the serialized
 * SyncReport. Only the newest MAX_HISTORY_RUNS records are kept; older ones
 * are removed after every write so the internal collection grows slowly.
 */
import type { SyncReport } from "../sync/report"
import {
  PLUGIN_KIND_HISTORY,
  fieldValue,
  readPluginDataItems,
  removePluginDataItems,
  writePluginDataItems,
} from "./internal"

/** How many past runs to keep per connection. */
export const MAX_HISTORY_RUNS = 5

/** One stored run: its item id, its finish time, and the full report. */
export interface SyncRunRecord {
  id: string
  finishedAt: string
  report: SyncReport
}

/**
 * Read and sort all run records of one connection, newest first. Corrupted
 * payloads are skipped so one bad row cannot hide the rest of the history.
 */
async function readRunRecords(connectionId: string): Promise<SyncRunRecord[]> {
  const items = await readPluginDataItems(PLUGIN_KIND_HISTORY, connectionId)
  const records: SyncRunRecord[] = []
  for (const item of items) {
    try {
      const report = JSON.parse(fieldValue(item, "payload")) as SyncReport
      records.push({
        id: item.id,
        finishedAt: fieldValue(item, "synced_at") || report.finishedAt,
        report,
      })
    } catch {
      // Skip the corrupted entry and keep reading.
    }
  }
  records.sort(function newestFirst(a, b) {
    if (a.finishedAt === b.finishedAt) {
      return 0
    }
    return a.finishedAt < b.finishedAt ? 1 : -1
  })
  return records
}

/** List the newest runs of one connection, newest first. */
export async function listRunHistory(
  connectionId: string
): Promise<SyncRunRecord[]> {
  const records = await readRunRecords(connectionId)
  return records.slice(0, MAX_HISTORY_RUNS)
}

/**
 * Store one finished run and prune everything past the newest
 * MAX_HISTORY_RUNS records. addItems returns void, so the prune re-reads the
 * collection to learn the ids of the records that were just created.
 */
export async function recordRun(
  connectionId: string,
  report: SyncReport
): Promise<void> {
  await writePluginDataItems([
    {
      kind: PLUGIN_KIND_HISTORY,
      connectionId,
      payload: JSON.stringify(report),
      syncedAt: report.finishedAt,
    },
  ])
  const records = await readRunRecords(connectionId)
  const overflow = records.slice(MAX_HISTORY_RUNS)
  if (overflow.length > 0) {
    await removePluginDataItems(
      overflow.map(function idOf(record) {
        return record.id
      })
    )
  }
}
