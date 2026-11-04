// @vitest-environment jsdom
/**
 * MappingModal wizard integration: the full-page wizard renders the
 * collection source choice, and the create-new flow builds a CMS collection
 * named after the store, adds the mapped fields, and saves the collection
 * name with the connection settings.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

vi.mock("@framer/plugin", () => ({
  framer: {},
  useIsAllowedTo: vi.fn(function useIsAllowedTo() {
    return true
  }),
}))

// Capture the CMS calls the wizard makes against the SDK boundary.
const createdCollections: Array<{ name: string; fields: Array<{ name: string; type: string }> }> = []
const savedSettings: Array<Record<string, unknown>> = []

function makeCollection(id: string, name: string, fields: Array<{ name: string; type: string }>) {
  return {
    id,
    name,
    getFields: async () => fields.map(function clone(field) {
      return { ...field }
    }),
    addFields: async function addFields(incoming: Array<{ name: string; type: string }>) {
      createdCollections
        .filter(function matchesCreated(created) {
          return created.name === name
        })
        .forEach(function pushFields(created) {
          created.fields.push(...incoming)
        })
      return incoming.map(function toField(field, index) {
        return { id: `${id}-f-${field.name.toLowerCase()}-${index}`, name: field.name, type: field.type }
      })
    },
    getItems: async () => [],
    addItems: async () => {},
    removeItems: async () => {},
  }
}

const existingCollections = [
  makeCollection("col-blog", "Blog", [{ name: "Title", type: "string" }]),
]

vi.mock("../../storage/internal", async function factory(importOriginal) {
  const actual = await importOriginal<typeof import("../../storage/internal")>()
  return {
    ...actual,
    sdk: {
      getCollections: async () => existingCollections,
      createCollection: async function createCollection(name: string) {
        createdCollections.push({ name, fields: [] })
        return makeCollection(`col-new-${createdCollections.length}`, name, [])
      },
      isAllowedTo: () => true,
    },
  }
})

vi.mock("../../storage/settings", async function factory(importOriginal) {
  const actual = await importOriginal<typeof import("../../storage/settings")>()
  return {
    ...actual,
    saveSyncSettings: async function recordSave(connectionId: string, settings: unknown) {
      savedSettings.push({ connectionId, settings })
    },
  }
})

import { MappingModal } from "../MappingModal"
import type { ConnectionRecord } from "../../storage/connections"

const connection: ConnectionRecord = {
  id: "conn-1",
  providerId: "woocommerce",
  storeUrl: "https://mystore.com",
  storeHost: "mystore.com",
  consumerKeyMasked: "ck_••••1234",
  consumerSecretMasked: "cs_••••5678",
  keyScope: "read_write",
  companionPluginUrl: null,
  validationState: "valid",
  lastValidatedAt: null,
  isActive: true,
}

afterEach(function cleanupDom() {
  cleanup()
  createdCollections.length = 0
  savedSettings.length = 0
})

describe("MappingModal wizard", () => {
  it("renders as a full-page wizard with the source choice", async () => {
    render(
      <MappingModal
        connection={connection}
        onStart={function noop() {}}
        onClose={function noop() {}}
      />
    )
    await waitFor(function settled() {
      expect(screen.getByText("Existing collection")).not.toBeNull()
    })
    // The wizard portals into the app shell (body in tests) so it fills the
    // window above the bottom nav.
    expect(document.querySelector("[class*='wizardPage']")).not.toBeNull()
  })

  it("creates a new collection named after the store and saves it", async () => {
    const started: Array<{ targetCollectionId: string; targetCollectionName?: string }> = []
    const { container } = render(
      <MappingModal
        connection={connection}
        onStart={function onStart(settings) {
          started.push(settings)
        }}
        onClose={function noop() {}}
      />
    )
    // Switch to the create-new source
    const createOption = await screen.findByRole("button", {
      name: /New collection/,
    })
    createOption.click()
    const nameInput = await screen.findByDisplayValue("ecom-link-woo-mystore")
    expect(nameInput).not.toBeNull()
    // Start the sync: creates the collection and saves settings
    const startButton = screen.getByRole("button", { name: /Create and Sync/ })
    startButton.click()
    await waitFor(function done() {
      expect(started.length).toBe(1)
    })
    expect(createdCollections[0].name).toBe("ecom-link-woo-mystore")
    expect(createdCollections[0].fields.length).toBeGreaterThan(0)
    const settings = started[0]
    expect(settings.targetCollectionName).toBe("ecom-link-woo-mystore")
    expect(String(settings.targetCollectionId)).toContain("col-new")
    void container
    void savedSettings
  })
})
