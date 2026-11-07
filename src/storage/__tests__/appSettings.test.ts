/**
 * Tests for app settings storage: defaults, round trips through the fake
 * CMS, frequency parsing, and defensive reading of corrupted payloads.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { getInternalCollection, resetFakeCms } from "./fakeCms"
import { writePluginDataItems } from "../internal"
import {
  DEFAULT_APP_SETTINGS,
  getAppSyncSettings,
  parseSyncFrequencyMs,
  saveAppSyncSettings,
} from "../appSettings"

vi.mock("@framer/plugin", async () => {
  const mod = await import("./fakeCms")
  return { framer: mod.sharedCms }
})

beforeEach(function resetState() {
  resetFakeCms()
})

describe("parseSyncFrequencyMs", () => {
  it("maps every documented frequency", () => {
    expect(parseSyncFrequencyMs("1 minute")).toBe(60_000)
    expect(parseSyncFrequencyMs("1 hour")).toBe(3_600_000)
    expect(parseSyncFrequencyMs("6 hours")).toBe(21_600_000)
    expect(parseSyncFrequencyMs("12 hours")).toBe(43_200_000)
    expect(parseSyncFrequencyMs("24 hours")).toBe(86_400_000)
  })

  it("falls back to one hour for unknown frequencies", () => {
    expect(parseSyncFrequencyMs("every blue moon")).toBe(3_600_000)
  })
})

describe("app settings round trip", () => {
  it("reads the documented defaults when nothing is saved", async () => {
    expect(await getAppSyncSettings()).toEqual(DEFAULT_APP_SETTINGS)
  })

  it("saves and reads back automation settings", async () => {
    await saveAppSyncSettings({
      autoSync: true,
      syncFrequency: "6 hours",
      lastAutoSyncAt: "2026-11-05T10:00:00Z",
    })

    expect(await getAppSyncSettings()).toEqual({
      autoSync: true,
      syncFrequency: "6 hours",
      lastAutoSyncAt: "2026-11-05T10:00:00Z",
    })
  })

  it("updates the same item in place on repeated saves", async () => {
    await saveAppSyncSettings(DEFAULT_APP_SETTINGS)
    await saveAppSyncSettings({
      autoSync: true,
      syncFrequency: "1 minute",
      lastAutoSyncAt: null,
    })

    const settings = await getAppSyncSettings()
    expect(settings.autoSync).toBe(true)
    expect(settings.syncFrequency).toBe("1 minute")

    // The upsert keeps exactly one app settings item in the internal
    // collection (fieldData is keyed by field id, hence the kind lookup).
    const internal = await getInternalCollection()
    expect(internal).not.toBeNull()
    expect(
      internal.items.filter(function isAppSettings(item) {
        return Object.values(item.fieldData).some(function isKind(entry) {
          return entry.type === "string" && entry.value === "app_settings"
        })
      })
    ).toHaveLength(1)
  })
})

describe("defensive reading", () => {
  it("falls back to defaults on corrupted payloads", async () => {
    await writePluginDataItems([
      {
        kind: "app_settings",
        connectionId: "global",
        payload: "{ not json at all",
      },
    ])

    expect(await getAppSyncSettings()).toEqual(DEFAULT_APP_SETTINGS)
  })

  it("ignores items for other connections", async () => {
    await writePluginDataItems([
      {
        kind: "app_settings",
        connectionId: "conn-9",
        payload: JSON.stringify({ autoSync: true, syncFrequency: "24 hours" }),
      },
    ])

    expect(await getAppSyncSettings()).toEqual(DEFAULT_APP_SETTINGS)
  })
})
