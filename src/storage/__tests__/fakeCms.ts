/**
 * Fake "@framer/plugin" CMS for storage and sync engine tests
 *
 * Tests mock the module with:
 *
 *   vi.mock("@framer/plugin", async () => {
 *     const mod = await import("./fakeCms")
 *     return { framer: mod.sharedCms }
 *   })
 *
 * The fake reproduces the SDK behaviors the storage layer depends on:
 * fieldData keyed by field id, addItems updating in place when an id is
 * present and creating (slug required) otherwise, the synchronous
 * isAllowedTo permission guard, and an addImage asset pipeline with
 * selectable per-URL failures. resetFakeCms() in beforeEach restores the
 * default state.
 */

export interface FakeField {
  id: string
  name: string
  type: string
}

export interface FakeItem {
  id: string
  slug?: string
  fieldData: Record<string, { type: string; value: unknown }>
}

interface FakeCmsState {
  collections: FakeCollection[]
  allowed: boolean
  checkedMethods: Set<string>
  failingImageUrls: Set<string>
  planLimitCollectionId: string | null
  assetCounter: number
}

const state: FakeCmsState = {
  collections: [],
  allowed: true,
  checkedMethods: new Set(),
  failingImageUrls: new Set(),
  planLimitCollectionId: null,
  assetCounter: 0,
}

/** A fake collection with the same method surface as the SDK class. */
export class FakeCollection {
  readonly id: string
  readonly name: string
  readonly fields: FakeField[]
  readonly items: FakeItem[]
  private nextFieldId = 1
  private nextItemId = 1

  constructor(name: string) {
    this.id = `collection-${state.collections.length + 1}`
    this.name = name
    this.fields = []
    this.items = []
  }

  async getFields(): Promise<FakeField[]> {
    return this.fields.map(function copy(field) {
      return { ...field }
    })
  }

  async addFields(
    fields: Array<{ name: string; type: string }>
  ): Promise<FakeField[]> {
    for (const field of fields) {
      const exists = this.fields.some(function named(current) {
        return current.name === field.name
      })
      if (!exists) {
        this.fields.push({
          id: `field-${this.id}-${this.nextFieldId}`,
          name: field.name,
          type: field.type,
        })
        this.nextFieldId += 1
      }
    }
    return this.getFields()
  }

  async getItems(): Promise<FakeItem[]> {
    return this.items.map(function copy(item) {
      return {
        id: item.id,
        slug: item.slug,
        fieldData: { ...item.fieldData },
      }
    })
  }

  async addItems(
    items: Array<{
      id?: string
      slug?: string
      fieldData?: Record<string, { type: string; value: unknown }>
    }>
  ): Promise<void> {
    if (state.planLimitCollectionId === this.id) {
      throw new Error("The current Framer plan has reached its CMS item limit")
    }
    for (const item of items) {
      if (item.id) {
        const existing = this.items.find(function hasId(current) {
          return current.id === item.id
        })
        if (!existing) {
          throw new Error(`FakeCollection: no item with id ${item.id}`)
        }
        existing.fieldData = { ...(item.fieldData ?? {}) }
        continue
      }
      if (!item.slug) {
        throw new Error("FakeCollection: creating an item requires a slug")
      }
      this.items.push({
        id: `item-${this.id}-${this.nextItemId}`,
        slug: item.slug,
        fieldData: { ...(item.fieldData ?? {}) },
      })
      this.nextItemId += 1
    }
  }

  async removeItems(itemIds: string[]): Promise<void> {
    for (const itemId of itemIds) {
      const index = this.items.findIndex(function hasId(current) {
        return current.id === itemId
      })
      if (index >= 0) {
        this.items.splice(index, 1)
      }
    }
  }
}

/** The object tests inject in place of the real "@framer/plugin" export. */
export const sharedCms = {
  async getCollections() {
    return state.collections.slice()
  },

  async createCollection(name: string) {
    const collection = new FakeCollection(name)
    state.collections.push(collection)
    return collection
  },

  isAllowedTo(...methods: string[]) {
    for (const method of methods) {
      state.checkedMethods.add(method)
    }
    return state.allowed
  },

  async addImage(url: string) {
    if (state.failingImageUrls.has(url)) {
      throw new Error(`Could not download the image at ${url}`)
    }
    state.assetCounter += 1
    return { id: `asset-${state.assetCounter}` }
  },
}

/** Restore the default state. Call this in beforeEach. */
export function resetFakeCms(): void {
  state.collections = []
  state.allowed = true
  state.checkedMethods = new Set()
  state.failingImageUrls = new Set()
  state.planLimitCollectionId = null
}

/** Simulate an account that cannot edit CMS collections. */
export function setPermissionAllowed(allowed: boolean): void {
  state.allowed = allowed
}

/** Make addImage fail for the given URLs (per-URL failure injection). */
export function failImageAt(...urls: string[]): void {
  for (const url of urls) {
    state.failingImageUrls.add(url)
  }
}

/** Make addItems throw a plan-limit style error for one collection. */
export function failAddItemsForCollection(collectionId: string): void {
  state.planLimitCollectionId = collectionId
}

/** The methods isAllowedTo has been asked about so far. */
export function checkedMethods(): Set<string> {
  return new Set(state.checkedMethods)
}

/** Find a collection by name in the current fake state. */
export function findCollectionByName(name: string): FakeCollection | undefined {
  return state.collections.find(function named(collection) {
    return collection.name === name
  })
}

/** Convenience accessor for the internal plugin data collection. */
export function getInternalCollection(): FakeCollection | undefined {
  return findCollectionByName("Ecom-Link Internal")
}
