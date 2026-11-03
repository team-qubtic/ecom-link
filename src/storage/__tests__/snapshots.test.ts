/**
 * Tests for snapshot storage: round trips keyed by platform product id,
 * in-place updates per product, chunked writes for larger batches, and
 * tolerance of corrupted payloads.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { getInternalCollection, resetFakeCms } from "./fakeCms"
import { PLUGIN_KIND_SNAPSHOT, writePluginDataItems } from "../internal"
import { getSnapshots, writeSnapshots } from "../snapshots"
import type { SnapshotEntry } from "../snapshots"

vi.mock("@framer/plugin", async () => {
  const mod = await import("./fakeCms")
  return { framer: mod.sharedCms }
})

const CONNECTION_ID = "conn-1"

beforeEach(function resetState() {
  resetFakeCms()
})

describe("getSnapshots", () => {
  it("returns an empty map when nothing is saved", async () => {
    const snapshots = await getSnapshots(CONNECTION_ID)
    expect(snapshots.size).toBe(0)
  })

  it("skips snapshots with corrupted payloads", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_SNAPSHOT,
        connectionId: CONNECTION_ID,
        itemRef: "101",
        payload: "{broken",
      },
    ])
    await writeSnapshots(CONNECTION_ID, [
      { itemWooId: "102", values: { price: 5 } },
    ])

    const snapshots = await getSnapshots(CONNECTION_ID)
    expect(snapshots.size).toBe(1)
    expect(snapshots.has("101")).toBe(false)
  })
})

describe("writeSnapshots", () => {
  it("round trips snapshots keyed by product id", async () => {
    await writeSnapshots(CONNECTION_ID, [
      { itemWooId: "101", values: { name: "Shirt", price: 19.5 } },
      { itemWooId: "102", values: { name: "Mug", price: 8 } },
    ])

    const snapshots = await getSnapshots(CONNECTION_ID)
    expect(snapshots.size).toBe(2)
    expect(snapshots.get("101")).toEqual({ name: "Shirt", price: 19.5 })
    expect(snapshots.get("102")).toEqual({ name: "Mug", price: 8 })
  })

  it("updates the snapshot of a product in place", async () => {
    await writeSnapshots(CONNECTION_ID, [
      { itemWooId: "101", values: { price: 10 } },
    ])
    await writeSnapshots(CONNECTION_ID, [
      { itemWooId: "101", values: { price: 12 } },
    ])

    const collection = getInternalCollection()
    expect(collection?.items.length).toBe(1)

    const snapshots = await getSnapshots(CONNECTION_ID)
    expect(snapshots.size).toBe(1)
    expect(snapshots.get("101")).toEqual({ price: 12 })
  })

  it("handles batches larger than one chunk", async () => {
    const entries: SnapshotEntry[] = []
    for (let index = 1; index <= 60; index += 1) {
      entries.push({ itemWooId: `${100 + index}`, values: { position: index } })
    }
    await writeSnapshots(CONNECTION_ID, entries)

    const collection = getInternalCollection()
    expect(collection?.items.length).toBe(60)

    const snapshots = await getSnapshots(CONNECTION_ID)
    expect(snapshots.size).toBe(60)
    expect(snapshots.get("160")).toEqual({ position: 60 })
  })
})
