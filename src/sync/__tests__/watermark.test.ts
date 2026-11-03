/**
 * Tests for watermark storage: ISO validation, round trips, in-place
 * updates, and the null fallback that turns an invalid stored value into a
 * full sync pass.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { getInternalCollection, resetFakeCms } from "../../storage/__tests__/fakeCms"
import {
  PLUGIN_KIND_WATERMARK,
  writePluginDataItems,
} from "../../storage/internal"
import {
  getStoredWatermark,
  getWatermark,
  isValidIsoTimestamp,
  setWatermark,
} from "../watermark"

vi.mock("@framer/plugin", async () => {
  const mod = await import("../../storage/__tests__/fakeCms")
  return { framer: mod.sharedCms }
})

const CONNECTION_ID = "conn-1"

beforeEach(function resetState() {
  resetFakeCms()
})

describe("isValidIsoTimestamp", () => {
  it("accepts full UTC timestamps", () => {
    expect(isValidIsoTimestamp("2024-01-15T10:30:00.000Z")).toBe(true)
  })

  it("accepts date-only timestamps", () => {
    expect(isValidIsoTimestamp("2024-01-15")).toBe(true)
  })

  it("accepts minutes precision and zone offsets", () => {
    expect(isValidIsoTimestamp("2024-01-15T10:30Z")).toBe(true)
    expect(isValidIsoTimestamp("2024-01-15T10:30:00+02:00")).toBe(true)
  })

  it("rejects words, empty strings, and bare digits", () => {
    expect(isValidIsoTimestamp("not-a-date")).toBe(false)
    expect(isValidIsoTimestamp("")).toBe(false)
    expect(isValidIsoTimestamp("1712345678999")).toBe(false)
  })
})

describe("getWatermark", () => {
  it("returns null when nothing is stored", async () => {
    expect(await getWatermark(CONNECTION_ID)).toBeNull()
  })

  it("returns null for an invalid stored value", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_WATERMARK,
        connectionId: CONNECTION_ID,
        payload: "garbage",
      },
    ])
    expect(await getWatermark(CONNECTION_ID)).toBeNull()
  })

  it("trims a stored value before validating it", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_WATERMARK,
        connectionId: CONNECTION_ID,
        payload: "  2026-10-20T09:00:00.000Z  ",
      },
    ])
    expect(await getWatermark(CONNECTION_ID)).toBe("2026-10-20T09:00:00.000Z")
  })
})

describe("getStoredWatermark", () => {
  it("returns null when nothing is stored", async () => {
    expect(await getStoredWatermark(CONNECTION_ID)).toBeNull()
  })

  it("returns an invalid stored value as-is for the engine to report", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_WATERMARK,
        connectionId: CONNECTION_ID,
        payload: "garbage",
      },
    ])
    expect(await getStoredWatermark(CONNECTION_ID)).toBe("garbage")
  })
})

describe("setWatermark", () => {
  it("round trips a stored watermark", async () => {
    await setWatermark(CONNECTION_ID, "2026-10-20T09:00:00.000Z")
    expect(await getWatermark(CONNECTION_ID)).toBe("2026-10-20T09:00:00.000Z")
  })

  it("updates the watermark item in place", async () => {
    await setWatermark(CONNECTION_ID, "2026-10-20T09:00:00.000Z")
    await setWatermark(CONNECTION_ID, "2026-10-20T11:30:00.000Z")

    const collection = getInternalCollection()
    expect(collection?.items.length).toBe(1)
    expect(await getWatermark(CONNECTION_ID)).toBe("2026-10-20T11:30:00.000Z")
  })
})
