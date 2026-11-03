/**
 * Tests for sync settings storage: defaults, round trips, the single-item
 * upsert behavior, and defensive reading of corrupted or foreign payloads.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { getInternalCollection, resetFakeCms } from "./fakeCms"
import { PLUGIN_KIND_SETTINGS, writePluginDataItems } from "../internal"
import {
  defaultSyncSettings,
  getSyncSettings,
  saveSyncSettings,
} from "../settings"
import type { SyncSettings } from "../settings"

vi.mock("@framer/plugin", async () => {
  const mod = await import("./fakeCms")
  return { framer: mod.sharedCms }
})

const CONNECTION_ID = "conn-1"

beforeEach(function resetState() {
  resetFakeCms()
})

describe("defaultSyncSettings", () => {
  it("fills the documented defaults", () => {
    expect(defaultSyncSettings("col-1")).toEqual({
      targetCollectionId: "col-1",
      mapping: [],
      defaultItemStatus: "draft",
      statusesFilter: ["publish"],
      safetyCap: 500,
      variationsCap: 30,
      galleryCap: 10,
    })
  })
})

describe("getSyncSettings", () => {
  it("returns null when nothing is saved", async () => {
    expect(await getSyncSettings(CONNECTION_ID)).toBeNull()
  })

  it("does not create the internal collection when reading", async () => {
    await getSyncSettings(CONNECTION_ID)
    expect(getInternalCollection()).toBeUndefined()
  })

  it("returns null when the payload is not JSON", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_SETTINGS,
        connectionId: CONNECTION_ID,
        payload: "{not json",
      },
    ])
    expect(await getSyncSettings(CONNECTION_ID)).toBeNull()
  })

  it("returns null when the payload is not a settings object", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_SETTINGS,
        connectionId: CONNECTION_ID,
        payload: JSON.stringify({ mapping: [] }),
      },
    ])
    expect(await getSyncSettings(CONNECTION_ID)).toBeNull()
  })

  it("returns null when a mapping row is malformed", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_SETTINGS,
        connectionId: CONNECTION_ID,
        payload: JSON.stringify({
          targetCollectionId: "col-1",
          mapping: [
            {
              platformField: "name",
              direction: "platform-to-cms",
              enabled: true,
            },
          ],
        }),
      },
    ])
    expect(await getSyncSettings(CONNECTION_ID)).toBeNull()
  })

  it("hydrates defaults for a minimal payload", async () => {
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_SETTINGS,
        connectionId: CONNECTION_ID,
        payload: JSON.stringify({ targetCollectionId: "col-2", mapping: [] }),
      },
    ])
    expect(await getSyncSettings(CONNECTION_ID)).toEqual(
      defaultSyncSettings("col-2")
    )
  })

  it("keeps mapping rows that use unknown platform fields", async () => {
    const mapping = [
      {
        platformField: "someFutureField",
        cmsFieldId: "f-1",
        direction: "platform-to-cms",
        enabled: true,
      },
    ]
    await writePluginDataItems([
      {
        kind: PLUGIN_KIND_SETTINGS,
        connectionId: CONNECTION_ID,
        payload: JSON.stringify({
          targetCollectionId: "col-3",
          mapping,
        }),
      },
    ])
    const settings = await getSyncSettings(CONNECTION_ID)
    expect(settings?.mapping).toEqual(mapping)
  })
})

describe("saveSyncSettings", () => {
  it("round trips a full settings object", async () => {
    const settings: SyncSettings = {
      targetCollectionId: "col-7",
      mapping: [
        {
          platformField: "id",
          cmsFieldId: "f-woo-id",
          direction: "platform-to-cms",
          enabled: true,
        },
        {
          platformField: "price",
          cmsFieldId: "f-price",
          direction: "bidirectional",
          enabled: true,
        },
        {
          platformField: "description",
          cmsFieldId: "f-desc",
          direction: "platform-to-cms",
          enabled: false,
        },
      ],
      defaultItemStatus: "publish",
      statusesFilter: ["publish", "draft"],
      safetyCap: 120,
      variationsCap: 9,
      galleryCap: 4,
    }
    await saveSyncSettings(CONNECTION_ID, settings)
    expect(await getSyncSettings(CONNECTION_ID)).toEqual(settings)
  })

  it("saves twice into one settings item", async () => {
    const first = defaultSyncSettings("col-1")
    first.safetyCap = 100
    await saveSyncSettings(CONNECTION_ID, first)

    const second = defaultSyncSettings("col-1")
    second.safetyCap = 200
    await saveSyncSettings(CONNECTION_ID, second)

    const collection = getInternalCollection()
    expect(collection?.items.length).toBe(1)
    expect(await getSyncSettings(CONNECTION_ID)).toEqual(second)
  })

  it("keeps the settings of different connections apart", async () => {
    await saveSyncSettings("conn-a", defaultSyncSettings("col-1"))
    await saveSyncSettings("conn-b", defaultSyncSettings("col-2"))
    expect((await getSyncSettings("conn-a"))?.targetCollectionId).toBe("col-1")
    expect((await getSyncSettings("conn-b"))?.targetCollectionId).toBe("col-2")
  })
})
