/**
 * Tests for connection storage: URL normalization, masking, key format
 * checks, CMS-backed CRUD, validation gating, active switching, and
 * disconnect cleanup (spec 002 acceptance criteria 1, 2, 4, 5, 6, and 9).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// The Framer CMS API is faked in memory so storage tests run anywhere. The
// fake mirrors the class-shaped SDK surface: collections carry getFields,
// addFields, getItems, addItems, and removeItems, createCollection takes the
// name as a plain string, and item fieldData is keyed by field ID.
const { fakeCms, resetFakeCms } = vi.hoisted(() => {
  interface FakeField {
    id: string
    name: string
    type: string
  }
  interface FakeItem {
    id: string
    slug: string
    fieldData: Record<string, { type: string; value: unknown }>
  }
  interface FakeCollectionState {
    id: string
    name: string
    fields: FakeField[]
    items: FakeItem[]
  }

  function createState() {
    return {
      collections: [] as FakeCollectionState[],
      nextCollectionId: 1,
      nextFieldId: 1,
      nextItemId: 1,
    }
  }

  let state = createState()
  // Methods whose permission was checked, mirroring the SDK contract.
  const checkedMethods = new Set<string>()

  function reset() {
    state = createState()
    checkedMethods.clear()
  }

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }

  // The SDK rejects protected calls that were not permission-checked first.
  function assertChecked(method: string) {
    if (!checkedMethods.has(method)) {
      throw new Error(
        `Invoking protected method "${method}" without checking permission first.`
      )
    }
  }

  /** Expose one collection through the same class-shaped API as the SDK. */
  function toCollectionApi(entry: FakeCollectionState) {
    return {
      id: entry.id,
      name: entry.name,
      async getFields() {
        return clone(entry.fields)
      },
      async addFields(fields: Array<{ name: string; type: string }>) {
        assertChecked("Collection.addFields")
        const created = fields.map(function createField(field) {
          const full = {
            id: `field-${state.nextFieldId}`,
            name: field.name,
            type: field.type,
          }
          state.nextFieldId += 1
          return full
        })
        entry.fields.push(...clone(created))
        return clone(created)
      },
      async getItems() {
        return clone(entry.items)
      },
      async addItems(
        items: Array<{
          id?: string
          slug?: string
          fieldData?: FakeItem["fieldData"]
        }>
      ) {
        assertChecked("Collection.addItems")
        for (const input of items) {
          if (input.id) {
            const item = entry.items.find(function hasId(candidate) {
              return candidate.id === input.id
            })
            if (!item) {
              throw new Error(`Item ${input.id} not found`)
            }
            if (input.slug) {
              item.slug = input.slug
            }
            // Mirror the strictest SDK reading: updates replace fieldData.
            item.fieldData = clone(input.fieldData ?? item.fieldData)
          } else {
            if (!input.slug) {
              throw new Error("Slug is required when adding an item.")
            }
            entry.items.push({
              id: `item-${state.nextItemId}`,
              slug: input.slug,
              fieldData: clone(input.fieldData ?? {}),
            })
            state.nextItemId += 1
          }
        }
      },
      async removeItems(itemIds: string[]) {
        assertChecked("Collection.removeItems")
        entry.items = entry.items.filter(function kept(item) {
          return !itemIds.includes(item.id)
        })
      },
    }
  }

  const fakeCms = {
    isAllowedTo(...methods: string[]) {
      for (const method of methods) {
        checkedMethods.add(method)
      }
      return true
    },
    async getCollections() {
      return state.collections.map(toCollectionApi)
    },
    async createCollection(name: string) {
      assertChecked("createCollection")
      if (typeof name !== "string") {
        throw new Error("createCollection expects the collection name string.")
      }
      const entry: FakeCollectionState = {
        id: `col-${state.nextCollectionId}`,
        name,
        fields: [],
        items: [],
      }
      state.nextCollectionId += 1
      state.collections.push(entry)
      return toCollectionApi(entry)
    },
  }

  return { fakeCms, resetFakeCms: reset }
})

vi.mock("@framer/plugin", () => ({ framer: fakeCms }))

import { clearProviders, registerProvider } from "../../providers"
import { AuthError } from "../../providers"
import type { EcommerceProvider } from "../../providers"
import {
  ConnectionValidationError,
  deleteConnection,
  getActiveConnection,
  listConnections,
  maskSecret,
  normalizeStoreUrl,
  revalidateConnection,
  saveConnection,
  setActiveConnection,
  validateKeyFormat,
  type SaveConnectionInput,
} from "../connections"

// Fake provider behavior, controlled per test.
const providerState = {
  fail: null as Error | null,
  writeAccess: true,
}
let lastCredentials: Record<string, string> | null = null

const fakeProvider: EcommerceProvider<true> = {
  id: "woocommerce",
  displayName: "WooCommerce (test)",
  capabilities: {
    supportsTwoWaySync: true,
    writableFields: [],
    supportsVariants: false,
    supportsCategories: false,
    supportsTags: false,
    supportsImages: false,
    maxPageSize: 100,
  },
  credentialSchema: [],
  async validateConnection(credentials) {
    lastCredentials = { ...credentials }
    if (providerState.fail) {
      throw providerState.fail
    }
  },
  async listProducts() {
    throw new Error("not used in this suite")
  },
  async getProduct() {
    throw new Error("not used in this suite")
  },
  async updateProductFields() {
    throw new Error("not used in this suite")
  },
  mapProduct(): never {
    throw new Error("not used in this suite")
  },
  async checkWriteAccess() {
    return providerState.writeAccess
  },
}

beforeEach(function resetWorld() {
  resetFakeCms()
  providerState.fail = null
  providerState.writeAccess = true
  lastCredentials = null
  clearProviders()
  registerProvider(fakeProvider)
})

function validInput(): SaveConnectionInput {
  return {
    providerId: "woocommerce",
    storeUrl: "https://store.example.com",
    consumerKey: "ck_abcdef12345678",
    consumerSecret: "cs_abcdef12345678",
    keyScope: "read",
  }
}

/** Read the raw stored items with fieldData keyed by field name. */
async function storedItems(): Promise<
  Array<{ id: string; fieldData: Record<string, unknown> }>
> {
  const collections = await fakeCms.getCollections()
  const internal = collections.find(function hasName(collection) {
    return collection.name === "Ecom-Link Internal"
  })
  if (!internal) {
    return []
  }
  const fields = await internal.getFields()
  const nameById = new Map(
    fields.map(function toPair(field) {
      return [field.id, field.name] as const
    })
  )
  const items = await internal.getItems()
  return items.map(function toNameKeyed(item) {
    const fieldData: Record<string, unknown> = {}
    for (const [fieldId, entry] of Object.entries(item.fieldData ?? {})) {
      fieldData[nameById.get(fieldId) ?? fieldId] = entry.value
    }
    return { id: item.id, fieldData }
  })
}

describe("normalizeStoreUrl", () => {
  it("adds https when the protocol is missing", () => {
    expect(normalizeStoreUrl("store.example.com")).toEqual({
      ok: true,
      url: "https://store.example.com",
    })
  })

  it("blocks plain http outside localhost with the exact sentence", () => {
    expect(normalizeStoreUrl("http://store.example.com")).toEqual({
      ok: false,
      message: "Store addresses must use HTTPS.",
    })
  })

  it("allows http for localhost development", () => {
    expect(normalizeStoreUrl("http://localhost:8080")).toEqual({
      ok: true,
      url: "http://localhost:8080",
    })
  })

  it("strips trailing slashes", () => {
    expect(normalizeStoreUrl("https://store.example.com/")).toEqual({
      ok: true,
      url: "https://store.example.com",
    })
  })

  it("strips a pasted wp-json base", () => {
    expect(normalizeStoreUrl("https://store.example.com/wp-json")).toEqual({
      ok: true,
      url: "https://store.example.com",
    })
  })

  it("rejects garbage with a helpful sentence", () => {
    expect(normalizeStoreUrl("not a url")).toEqual({
      ok: false,
      message:
        "Enter a valid store address, such as https://store.example.com.",
    })
  })
})

describe("maskSecret", () => {
  it("keeps the prefix and the last four characters", () => {
    expect(maskSecret("ck_abcd12345678")).toBe("ck_\u2022\u2022\u2022\u20225678")
  })

  it("masks short secrets without a tail", () => {
    expect(maskSecret("cs_1234")).toBe("cs_\u2022\u2022\u2022\u2022")
  })
})

describe("validateKeyFormat", () => {
  it("accepts ck_ and cs_ prefixes", () => {
    expect(validateKeyFormat("ck_abc", "cs_abc")).toEqual({
      ok: true,
      message: null,
    })
  })

  it("rejects anything else with one sentence", () => {
    expect(validateKeyFormat("bad_abc", "cs_abc")).toEqual({
      ok: false,
      message:
        "Consumer keys start with ck_ and secrets start with cs_. Check the keys you generated in WooCommerce.",
    })
  })
})

describe("saveConnection", () => {
  it("saves and returns a masked record only (AC5)", async () => {
    const record = await saveConnection(validInput())
    expect(record.consumerKeyMasked).toBe("ck_\u2022\u2022\u2022\u20225678")
    const serialized = JSON.stringify(await listConnections())
    expect(serialized).not.toContain("ck_abcdef12345678")
    expect(serialized).not.toContain("cs_abcdef12345678")
  })

  it("creates the internal collection with the full field schema", async () => {
    await saveConnection(validInput())
    const collections = await fakeCms.getCollections()
    const internal = collections.find(
      function hasName(collection) {
        return collection.name === "Ecom-Link Internal"
      }
    )
    expect(internal).toBeDefined()
    const fields = await internal!.getFields()
    const names = fields.map(function nameOf(field) {
      return field.name
    })
    expect(names).toEqual(
      expect.arrayContaining([
        "provider_id",
        "store_url",
        "consumer_key",
        "consumer_secret",
        "key_scope",
        "companion_plugin_url",
        "validation_state",
        "last_validated_at",
        "is_active",
      ])
    )
  })

  it("blocks http saves before any validation call (AC1)", async () => {
    const input = { ...validInput(), storeUrl: "http://store.example.com" }
    await expect(saveConnection(input)).rejects.toBeInstanceOf(
      ConnectionValidationError
    )
    expect(lastCredentials).toBeNull()
    expect(await listConnections()).toEqual([])
  })

  it("saves nothing when the store rejects the keys (AC2)", async () => {
    providerState.fail = new AuthError()
    await expect(saveConnection(validInput())).rejects.toBeInstanceOf(AuthError)
    expect(await listConnections()).toEqual([])
  })

  it("rejects wrong key prefixes before any network call", async () => {
    const input = { ...validInput(), consumerKey: "bad_prefix1234" }
    await expect(saveConnection(input)).rejects.toBeInstanceOf(
      ConnectionValidationError
    )
    expect(lastCredentials).toBeNull()
    expect(await listConnections()).toEqual([])
  })

  it("keeps stored secrets when editing with blank values", async () => {
    const created = await saveConnection(validInput())
    const edited = await saveConnection({
      id: created.id,
      providerId: "woocommerce",
      storeUrl: "https://renamed.example.com",
      consumerKey: "",
      consumerSecret: "",
      keyScope: "read",
    })
    expect(edited.storeUrl).toBe("https://renamed.example.com")
    // The validation call reused the stored secrets, not blanks.
    expect(lastCredentials?.consumerKey).toBe("ck_abcdef12345678")
    const items = await storedItems()
    expect(items[0]?.fieldData.consumer_key).toBe("ck_abcdef12345678")
  })
})

describe("multiple connections", () => {
  it("activates the first connection and switches on demand (AC9)", async () => {
    const first = await saveConnection(validInput())
    const second = await saveConnection({
      ...validInput(),
      storeUrl: "https://second.example.com",
    })
    expect(first.isActive).toBe(true)
    expect(second.isActive).toBe(false)
    await setActiveConnection(second.id)
    const active = await getActiveConnection()
    expect(active?.id).toBe(second.id)
    const all = await listConnections()
    const activeCount = all.filter(function isActive(connection) {
      return connection.isActive
    }).length
    expect(activeCount).toBe(1)
  })

  it("delete clears the record and promotes the next connection (AC6)", async () => {
    await saveConnection(validInput())
    const second = await saveConnection({
      ...validInput(),
      storeUrl: "https://second.example.com",
      consumerKey: "ck_second98765432",
      consumerSecret: "cs_second98765432",
      companionPluginUrl: "https://bridge.example.com",
    })
    await setActiveConnection(second.id)
    await deleteConnection(second.id)
    const remaining = await listConnections()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].isActive).toBe(true)
    expect(remaining[0].storeHost).toBe("store.example.com")
    const items = await storedItems()
    const serialized = JSON.stringify(items)
    expect(serialized).not.toContain("bridge.example.com")
    expect(serialized).not.toContain("cs_second98765432")
  })
})

describe("revalidateConnection", () => {
  it("records a valid state on success and invalid on failure", async () => {
    const created = await saveConnection(validInput())
    const valid = await revalidateConnection(created.id)
    expect(valid.validationState).toBe("valid")

    providerState.fail = new AuthError()
    await expect(revalidateConnection(created.id)).rejects.toBeInstanceOf(
      AuthError
    )
    const all = await listConnections()
    expect(all[0].validationState).toBe("invalid")
    expect(all[0].lastValidatedAt).not.toBeNull()
  })
})
