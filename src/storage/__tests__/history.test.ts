/**
 * Tests for run history storage: listing, newest-first ordering, pruning
 * past the retention limit, and tolerance of corrupted payloads.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { getInternalCollection, resetFakeCms } from "./fakeCms"
import { PLUGIN_KIND_HISTORY, writePluginDataItems } from "../internal"
import { listRunHistory, MAX_HISTORY_RUNS, recordRun } from "../history"
import type { SyncReport } from "../../sync/report"

vi.mock("@framer/plugin", async () => {
  const mod = await import("./fakeCms")
  return { framer: mod.sharedCms }
})

const CONNECTION_ID = "conn-1"

function makeReport(finishedAt: string, updated: number): SyncReport {
  return {
    status: "completed",
    startedAt: "2026-10-20T10:00:00.000Z",
    finishedAt,
    created: 0,
    updated,
    skipped: 0,
    failed: 0,
    failures: [],
    notes: [],
    failedPage: null,
  }
}

beforeEach(function resetState() {
  resetFakeCms()
})

describe("listRunHistory", () => {
  it("returns an empty list when nothing is recorded", async () => {
    expect(await listRunHistory(CONNECTION_ID)).toEqual([])
  })

  it("lists a recorded run with its report", async () => {
    const report = makeReport("2026-10-20T10:05:00.000Z", 3)
    await recordRun(CONNECTION_ID, report)

    const runs = await listRunHistory(CONNECTION_ID)
    expect(runs.length).toBe(1)
    expect(runs[0].report).toEqual(report)
    expect(runs[0].finishedAt).toBe("2026-10-20T10:05:00.000Z")
  })

  it("orders runs newest first and prunes past the limit", async () => {
    for (let index = 1; index <= 7; index += 1) {
      const stamp = `2026-10-20T10:00:0${index}.000Z`
      await recordRun(CONNECTION_ID, makeReport(stamp, index))
    }

    const runs = await listRunHistory(CONNECTION_ID)
    expect(runs.length).toBe(MAX_HISTORY_RUNS)
    expect(runs[0].finishedAt).toBe("2026-10-20T10:00:07.000Z")
    expect(runs[MAX_HISTORY_RUNS - 1].finishedAt).toBe("2026-10-20T10:00:03.000Z")

    const collection = getInternalCollection()
    expect(collection?.items.length).toBe(MAX_HISTORY_RUNS)
  })

  it("skips records with corrupted payloads", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_HISTORY,
        connectionId: CONNECTION_ID,
        payload: "{broken",
      },
    ])
    await recordRun(CONNECTION_ID, makeReport("2026-10-20T10:05:00.000Z", 2))

    const runs = await listRunHistory(CONNECTION_ID)
    expect(runs.length).toBe(1)
    expect(runs[0].report.updated).toBe(2)
  })

  it("keeps the history of different connections apart", async () => {
    await recordRun("conn-a", makeReport("2026-10-20T10:00:01.000Z", 1))
    await recordRun("conn-b", makeReport("2026-10-20T10:00:02.000Z", 2))

    expect((await listRunHistory("conn-a"))[0].report.updated).toBe(1)
    expect((await listRunHistory("conn-b"))[0].report.updated).toBe(2)
  })
})
