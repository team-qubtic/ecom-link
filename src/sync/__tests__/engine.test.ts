/**
 * Sync engine tests for spec 003 acceptance criteria 1 to 11: paged full
 * pulls, mapping validation before any store request, incremental
 * updates, cancellation, image failures, watermark fallback, rate limit
 * pause with resume, the safety cap, manual edit overwrite, the plan
 * limit note, and the report summary strings. Spec 004 adds the write-back
 * flow: change collection, single and batch pushes, conflict defaults,
 * snapshot idempotency, permission failures, and the one-way safety
 * rails.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  failAddItemsForCollection,
  failImageAt,
  resetFakeCms,
  sharedCms,
} from "../../storage/__tests__/fakeCms"
import type { FakeCollection } from "../../storage/__tests__/fakeCms"
import {
  AuthError,
  clearProviders,
  ProductNotFoundError,
  RateLimitError,
  registerProvider,
} from "../../providers"
import type {
  Credentials,
  EcommerceProvider,
  ListProductsQuery,
  ListProductsResult,
  NormalizedProduct,
  NormalizedProductField,
  ProductBatchUpdate,
  ProductUpdateFields,
} from "../../providers"
import { saveConnection } from "../../storage/connections"
import type { ConnectionRecord } from "../../storage/connections"
import { defaultSyncSettings } from "../../storage/settings"
import type { SyncFieldMapping, SyncSettings } from "../../storage/settings"
import {
  PLUGIN_KIND_WATERMARK,
  writePluginDataItems,
} from "../../storage/internal"
import {
  MappingValidationError,
  WRITE_PERMISSION_MESSAGE,
  collectPendingChanges,
  runPull,
  runPush,
} from "../engine"
import type { SyncRunHooks } from "../engine"
import { describeReport, reportStatusLabel } from "../report"
import type { SyncReport } from "../report"
import { getWatermark } from "../watermark"

vi.mock("@framer/plugin", async () => {
  const mod = await import("../../storage/__tests__/fakeCms")
  return { framer: mod.sharedCms }
})

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const PROVIDER_ID = "fake-woo"
const FIXED_NOW = "2026-10-20T09:00:00.000Z"
const STORE_URL = "https://store.example.com"

const IMAGE_FAILURE_MESSAGE =
  "The image could not be downloaded from the store."
const RATE_LIMIT_MESSAGE =
  "The store is rate limiting requests. Wait a moment, then retry."
const SAFETY_CAP_NOTE =
  "Sync stopped at the safety limit. Increase it in Settings to continue."
const INVALID_WATERMARK_NOTE =
  "The last sync time was missing or invalid, so this run synced the full catalog."
const PLAN_LIMIT_NOTE =
  "The Framer plan limit for CMS items was reached. 15 items remain unsynced."

interface RecordedPageRequest {
  page: number
  perPage: number
  status: string | undefined
  modifiedAfter: string | null | undefined
}

/**
 * Mutable provider state the fake reads on every call. Tests assign the
 * catalog and the rate limited pages, then assert on the recorded calls.
 */
const providerState: {
  products: NormalizedProduct[]
  rateLimitPages: number[]
  calls: RecordedPageRequest[]
} = {
  products: [],
  rateLimitPages: [],
  calls: [],
}

async function fakeListProducts(
  _credentials: Credentials,
  query?: ListProductsQuery
): Promise<ListProductsResult> {
  const page = query?.page ?? 1
  const perPage = query?.perPage ?? 25
  providerState.calls.push({
    page,
    perPage,
    status: query?.status,
    modifiedAfter: query?.modifiedAfter,
  })
  if (providerState.rateLimitPages.indexOf(page) !== -1) {
    throw new RateLimitError(PROVIDER_ID, 30)
  }
  const start = (page - 1) * perPage
  return {
    products: providerState.products
      .slice(start, start + perPage)
      .map(function copy(product) {
        return { ...product }
      }),
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(providerState.products.length / perPage)),
    totalItems: providerState.products.length,
  }
}

async function fakeGetProduct(
  _credentials: Credentials,
  id: string
): Promise<NormalizedProduct> {
  const found = providerState.products.find(function hasId(product) {
    return product.id === id
  })
  if (!found) {
    throw new ProductNotFoundError(PROVIDER_ID, id)
  }
  return { ...found }
}

function fakeMapProduct(raw: unknown): NormalizedProduct {
  return raw as NormalizedProduct
}

/**
 * EcommerceProvider<false> declares updateProductFields with type never,
 * so the fake is built without that method and then cast, matching the
 * documented read-only provider pattern in mockProvider.ts.
 */
const fakeProviderBase: Omit<
  EcommerceProvider<false>,
  "updateProductFields"
> = {
  id: PROVIDER_ID,
  displayName: "Fake Woo",
  capabilities: {
    supportsTwoWaySync: false,
    writableFields: [],
    supportsVariants: false,
    supportsCategories: true,
    supportsTags: true,
    supportsImages: true,
    maxPageSize: 100,
  },
  credentialSchema: [
    {
      key: "consumerKey",
      label: "Consumer key",
      type: "password",
      placeholder: "ck_",
      helpText: "The key the plugin uses to read the store.",
      required: true,
    },
  ],
  validateConnection: async function validateConnection(): Promise<void> {},
  listProducts: fakeListProducts,
  getProduct: fakeGetProduct,
  mapProduct: fakeMapProduct,
}

const fakeProvider = fakeProviderBase as EcommerceProvider<false>

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

function makeProduct(
  index: number,
  overrides: Partial<NormalizedProduct> = {}
): NormalizedProduct {
  const n = index + 1
  return {
    id: String(n),
    name: `Product ${n}`,
    slug: `product-${n}`,
    permalink: `${STORE_URL}/product/product-${n}/`,
    type: "simple",
    status: "publish",
    description: `<p>Description ${n}</p>`,
    shortDescription: `Short description ${n}`,
    sku: `SKU-${n}`,
    price: 10 + n,
    regularPrice: 10 + n,
    salePrice: null,
    onSale: false,
    stockStatus: "instock",
    stockQuantity: n,
    categories: [{ id: "9", name: "Bags", slug: "bags" }],
    tags: ["canvas"],
    featuredImage: null,
    gallery: [],
    attributes: [],
    variantIds: [],
    rating: 4.5,
    ratingCount: n,
    lastModified: "2026-10-01T12:30:00",
    ...overrides,
  }
}

function makeProducts(count: number): NormalizedProduct[] {
  const products: NormalizedProduct[] = []
  for (let index = 0; index < count; index += 1) {
    products.push(makeProduct(index))
  }
  return products
}

async function seedConnection(): Promise<ConnectionRecord> {
  return saveConnection({
    providerId: PROVIDER_ID,
    storeUrl: STORE_URL,
    consumerKey: "ck_test1234567890",
    consumerSecret: "cs_test1234567890",
    keyScope: "read",
  })
}

async function setupTargetCollection(
  fieldDefs: Array<{ name: string; type: string }>
): Promise<FakeCollection> {
  const collection = await sharedCms.createCollection("Products")
  await collection.addFields(fieldDefs)
  return collection
}

async function fieldId(
  collection: FakeCollection,
  name: string
): Promise<string> {
  const fields = await collection.getFields()
  const match = fields.find(function named(field) {
    return field.name === name
  })
  if (!match) {
    throw new Error(`Test setup expected a field named ${name}`)
  }
  return match.id
}

function row(
  platformField: SyncFieldMapping["platformField"],
  cmsFieldId: string
): SyncFieldMapping {
  return {
    platformField,
    cmsFieldId,
    direction: "platform-to-cms",
    enabled: true,
  }
}

function buildSettings(
  collectionId: string,
  rows: SyncFieldMapping[],
  overrides: Partial<SyncSettings> = {}
): SyncSettings {
  return {
    ...defaultSyncSettings(collectionId),
    mapping: rows,
    ...overrides,
  }
}

function baseHooks(): SyncRunHooks {
  return { yieldFn: async () => {}, now: () => FIXED_NOW }
}

beforeEach(function resetState() {
  resetFakeCms()
  providerState.products = []
  providerState.rateLimitPages = []
  providerState.calls = []
  clearProviders()
  registerProvider(fakeProvider)
})

// ---------------------------------------------------------------------------
// Acceptance criteria
// ---------------------------------------------------------------------------

describe("runPull", () => {
  describe("full catalog pull (AC1)", () => {
    it("requests the catalog in pages of 100 and creates one item per product", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(250)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("completed")
      expect(report.created).toBe(250)
      expect(providerState.calls.map((call) => call.page)).toEqual([1, 2, 3])
      expect(providerState.calls[0].perPage).toBe(100)

      const items = await collection.getItems()
      expect(items.length).toBe(250)
      const wooIdFieldId = await fieldId(collection, "woo_id")
      const wooIds = new Set(
        items.map((item) => item.fieldData[wooIdFieldId]?.value)
      )
      expect(wooIds.size).toBe(250)
    })

    it("advances the watermark to the run start time after a clean pull", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(3)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])

      await runPull(connection, settings, baseHooks())

      expect(await getWatermark(connection.id)).toBe(FIXED_NOW)
    })
  })

  describe("mapping validation (AC2)", () => {
    it("accepts price on a number field and description on a rich text field", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Price", type: "number" },
        { name: "Description", type: "formattedText" },
      ])
      providerState.products = makeProducts(1)
      const settings = buildSettings(collection.id, [
        row("price", await fieldId(collection, "Price")),
        row("description", await fieldId(collection, "Description")),
      ])

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("completed")
      expect(report.created).toBe(1)
      const items = await collection.getItems()
      const priceFieldId = await fieldId(collection, "Price")
      expect(items[0].fieldData[priceFieldId]).toEqual({
        type: "number",
        value: 11,
      })
    })

    it("rejects price on a boolean field before any store request", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Price", type: "boolean" },
      ])
      providerState.products = makeProducts(1)
      const settings = buildSettings(collection.id, [
        row("price", await fieldId(collection, "Price")),
      ])

      const attempt = runPull(connection, settings, baseHooks())
      await expect(attempt).rejects.toBeInstanceOf(MappingValidationError)
      await expect(attempt).rejects.toThrow(
        "Prices must map to a number or text field."
      )
      expect(providerState.calls.length).toBe(0)
    })
  })

  describe("incremental updates (AC3 and AC4)", () => {
    it("updates only the changed products on a second run", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
        { name: "Price", type: "number" },
        { name: "SKU", type: "string" },
      ])
      providerState.products = makeProducts(5)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
        row("price", await fieldId(collection, "Price")),
        row("sku", await fieldId(collection, "SKU")),
      ])
      await runPull(connection, settings, baseHooks())

      providerState.products[1] = {
        ...providerState.products[1],
        name: "Renamed B",
      }
      providerState.products[2] = {
        ...providerState.products[2],
        price: 99,
      }
      providerState.products[4] = {
        ...providerState.products[4],
        sku: "CHANGED",
      }

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("completed")
      expect(report.updated).toBe(3)
      expect(report.created).toBe(0)
      expect(report.skipped).toBe(2)
      expect(describeReport(report)[0]).toBe("3 items updated.")
      expect(providerState.calls[1].modifiedAfter).toBe(FIXED_NOW)
    })

    it("reports zero updates and creates no duplicates when nothing changed", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(5)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])
      await runPull(connection, settings, baseHooks())

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("completed")
      expect(report.updated).toBe(0)
      expect(report.created).toBe(0)
      expect(report.skipped).toBe(5)
      expect(describeReport(report)).toEqual([
        "0 items updated.",
        "0 items created.",
        "5 items skipped.",
      ])
      const items = await collection.getItems()
      expect(items.length).toBe(5)
    })
  })

  describe("cancellation (AC5)", () => {
    it("keeps the flushed pages, cancels cleanly, and leaves the watermark untouched", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(400)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])
      const signal = { aborted: false }
      const hooks: SyncRunHooks = {
        ...baseHooks(),
        signal,
        onPage: (progress) => {
          if (progress.page === 2) {
            signal.aborted = true
          }
        },
      }

      const report = await runPull(connection, settings, hooks)

      expect(report.status).toBe("canceled")
      expect(report.created).toBe(200)
      expect(providerState.calls.map((call) => call.page)).toEqual([1, 2])
      const items = await collection.getItems()
      expect(items.length).toBe(200)
      expect(await getWatermark(connection.id)).toBeNull()
    })
  })

  describe("image failures (AC6)", () => {
    it("still syncs the item, leaves the image field empty, and records one failure", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
        { name: "Photo", type: "image" },
      ])
      const imageUrl = `${STORE_URL}/wp-content/tote.jpg`
      providerState.products = [
        makeProduct(0, {
          featuredImage: { id: "501", url: imageUrl, alt: "Front", position: 0 },
        }),
      ]
      failImageAt(imageUrl)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
        row("featuredImage", await fieldId(collection, "Photo")),
      ])

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("completed")
      expect(report.created).toBe(1)
      expect(report.failures).toEqual([
        { itemName: "Product 1", message: IMAGE_FAILURE_MESSAGE },
      ])
      const items = await collection.getItems()
      const photoFieldId = await fieldId(collection, "Photo")
      expect(items[0].fieldData[photoFieldId]).toBeUndefined()
      expect(await getWatermark(connection.id)).toBe(FIXED_NOW)
    })
  })

  describe("watermark fallback (AC7)", () => {
    it("falls back to a full pass and notes it when the stored watermark is invalid", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(3)
      await writePluginDataItems([
        {
          kind: PLUGIN_KIND_WATERMARK,
          connectionId: connection.id,
          payload: "garbage",
        },
      ])
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("completed")
      expect(report.notes).toContain(INVALID_WATERMARK_NOTE)
      expect(providerState.calls[0].modifiedAfter).toBeUndefined()
    })

    it("starts a first run without a watermark and without a fallback note", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(2)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("completed")
      expect(report.notes).toEqual([])
      expect(providerState.calls[0].modifiedAfter).toBeUndefined()
      expect(report.created).toBe(2)
    })
  })

  describe("rate limiting (AC8)", () => {
    it("pauses on a rate limited page, lists the failure, and resumes from that page", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(250)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])
      providerState.rateLimitPages = [2]

      const first = await runPull(connection, settings, baseHooks())

      expect(first.status).toBe("paused")
      expect(first.failedPage).toBe(2)
      expect(first.created).toBe(100)
      expect(first.failures).toEqual([
        { itemName: "Page 2", message: RATE_LIMIT_MESSAGE },
      ])
      expect(await getWatermark(connection.id)).toBeNull()

      providerState.rateLimitPages = []
      const second = await runPull(connection, settings, {
        ...baseHooks(),
        resumeFromPage: 2,
      })

      expect(second.status).toBe("completed")
      expect(second.created).toBe(150)
      expect(second.updated).toBe(0)
      const items = await collection.getItems()
      expect(items.length).toBe(250)
      expect(await getWatermark(connection.id)).toBe(FIXED_NOW)
      expect(providerState.calls[2].page).toBe(2)
    })
  })

  describe("safety cap (AC9)", () => {
    it("stops at the cap, keeps the written items, and says so in the notes", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(250)
      const settings = buildSettings(
        collection.id,
        [row("name", await fieldId(collection, "Name"))],
        { safetyCap: 150 }
      )

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("stopped")
      expect(report.created).toBe(150)
      expect(report.notes).toContain(SAFETY_CAP_NOTE)
      const items = await collection.getItems()
      expect(items.length).toBe(150)
      expect(providerState.calls.map((call) => call.page)).toEqual([1, 2])
      expect(await getWatermark(connection.id)).toBeNull()
    })
  })

  describe("manual edits (AC10)", () => {
    it("overwrites a manually edited one way mapped field on the next sync", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(1)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])
      await runPull(connection, settings, baseHooks())

      const items = await collection.getItems()
      const nameFieldId = await fieldId(collection, "Name")
      await collection.addItems([
        {
          id: items[0].id,
          fieldData: {
            ...items[0].fieldData,
            [nameFieldId]: { type: "string", value: "Hand edited" },
          },
        },
      ])

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("completed")
      expect(report.updated).toBe(1)
      expect(describeReport(report)[0]).toBe("1 item updated.")
      const after = await collection.getItems()
      expect(after[0].fieldData[nameFieldId]).toEqual({
        type: "string",
        value: "Product 1",
      })
    })
  })

  describe("plan limit", () => {
    it("stops with the remaining count when the Framer plan limit is reached", async () => {
      const connection = await seedConnection()
      const collection = await setupTargetCollection([
        { name: "Name", type: "string" },
      ])
      providerState.products = makeProducts(15)
      failAddItemsForCollection(collection.id)
      const settings = buildSettings(collection.id, [
        row("name", await fieldId(collection, "Name")),
      ])

      const report = await runPull(connection, settings, baseHooks())

      expect(report.status).toBe("stopped")
      expect(report.created).toBe(0)
      expect(report.notes).toContain(PLAN_LIMIT_NOTE)
      const items = await collection.getItems()
      expect(items.length).toBe(0)
    })
  })

  describe("report summary strings (AC11)", () => {
    it("pluralizes item counts in the summary lines", () => {
      const report: SyncReport = {
        status: "completed",
        startedAt: FIXED_NOW,
        finishedAt: FIXED_NOW,
        created: 3,
        updated: 1,
        skipped: 0,
        failed: 2,
        failures: [],
        notes: [],
        failedPage: null,
      }
      expect(describeReport(report)).toEqual([
        "1 item updated.",
        "3 items created.",
        "2 items failed.",
      ])
    })

    it("labels every run status in plain words", () => {
      expect(reportStatusLabel("completed")).toBe("Completed")
      expect(reportStatusLabel("canceled")).toBe("Canceled")
      expect(reportStatusLabel("paused")).toBe("Paused")
      expect(reportStatusLabel("stopped")).toBe("Stopped early")
    })
  })
})

// ---------------------------------------------------------------------------
// Write-back test doubles (spec 004)
// ---------------------------------------------------------------------------

interface RecordedFieldUpdate {
  id: string
  fields: ProductUpdateFields
}

/** Mutable write-call log the fake write provider fills on every push. */
const writeState: {
  updates: RecordedFieldUpdate[]
  batchUpdates: RecordedFieldUpdate[][]
  updateError: Error | null
  batchError: Error | null
} = {
  updates: [],
  batchUpdates: [],
  updateError: null,
  batchError: null,
}

/** Every platform field the fake write provider accepts for write-back. */
const WRITE_STATE_FIELDS: NormalizedProductField[] = [
  "name",
  "slug",
  "status",
  "description",
  "shortDescription",
  "sku",
  "price",
  "regularPrice",
  "salePrice",
  "stockStatus",
  "stockQuantity",
]

async function fakeUpdateProductFields(
  _credentials: Credentials,
  id: string,
  fields: ProductUpdateFields
): Promise<NormalizedProduct> {
  if (writeState.updateError) {
    throw writeState.updateError
  }
  writeState.updates.push({ id, fields: { ...fields } })
  const found = providerState.products.find(function hasId(product) {
    return product.id === id
  })
  if (!found) {
    throw new ProductNotFoundError(PROVIDER_ID, id)
  }
  return { ...found }
}

async function fakeUpdateProductsBatch(
  _credentials: Credentials,
  updates: ProductBatchUpdate[]
): Promise<NormalizedProduct[]> {
  if (writeState.batchError) {
    throw writeState.batchError
  }
  const recorded = updates.map(function toRecorded(update) {
    return { id: update.id, fields: { ...update.fields } }
  })
  writeState.batchUpdates.push(recorded)
  const results: NormalizedProduct[] = []
  for (const update of updates) {
    const found = providerState.products.find(function hasId(product) {
      return product.id === update.id
    })
    if (!found) {
      throw new ProductNotFoundError(PROVIDER_ID, update.id)
    }
    results.push({ ...found })
  }
  return results
}

/**
 * Same provider id as the read-only fake, but with write support so the
 * collect and push paths run against a two-way capable provider.
 */
const fakeWriteProvider: EcommerceProvider<true> = {
  id: PROVIDER_ID,
  displayName: "Fake Woo",
  capabilities: {
    supportsTwoWaySync: true,
    writableFields: WRITE_STATE_FIELDS,
    supportsVariants: false,
    supportsCategories: true,
    supportsTags: true,
    supportsImages: true,
    maxPageSize: 100,
  },
  credentialSchema: [
    {
      key: "consumerKey",
      label: "Consumer key",
      type: "password",
      placeholder: "ck_",
      helpText: "The key the plugin uses to read the store.",
      required: true,
    },
  ],
  validateConnection: async function validateConnection(): Promise<void> {},
  listProducts: fakeListProducts,
  getProduct: fakeGetProduct,
  mapProduct: fakeMapProduct,
  updateProductFields: fakeUpdateProductFields,
  updateProductsBatch: fakeUpdateProductsBatch,
}

/** A bidirectional mapping row, the only direction collect reads. */
function twoWayRow(
  platformField: SyncFieldMapping["platformField"],
  cmsFieldId: string
): SyncFieldMapping {
  return {
    platformField,
    cmsFieldId,
    direction: "bidirectional",
    enabled: true,
  }
}

/** Simulate a Framer CMS edit by writing one field value in place. */
async function editItemField(
  collection: FakeCollection,
  itemId: string,
  cmsFieldId: string,
  value: string | number
): Promise<void> {
  const items = await collection.getItems()
  const target = items.find(function hasId(item) {
    return item.id === itemId
  })
  if (!target) {
    throw new Error(`Test setup expected an item with id ${itemId}`)
  }
  await collection.addItems([
    {
      id: target.id,
      fieldData: {
        ...target.fieldData,
        [cmsFieldId]: {
          type: typeof value === "number" ? "number" : "string",
          value,
        },
      },
    },
  ])
}

describe("write-back (spec 004)", () => {
  beforeEach(function registerWriteProvider() {
    writeState.updates = []
    writeState.batchUpdates = []
    writeState.updateError = null
    writeState.batchError = null
    clearProviders()
    registerProvider(fakeWriteProvider)
  })

  it("collects CMS edits as pending pushes without sending anything", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(2)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
    ])
    const nameField = await fieldId(collection, "Name")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    await editItemField(collection, items[0].id, nameField, "Hand edited")

    const check = await collectPendingChanges(connection, settings)
    expect(check.changes.length).toBe(1)
    expect(check.changes[0].itemWooId).toBe("1")
    expect(check.changes[0].field).toBe("name")
    expect(check.changes[0].framerValue).toBe("Hand edited")
    expect(check.changes[0].resolution).toBe("push")
    expect(check.names["1"]).toBe("Product 1")
    expect(writeState.updates.length).toBe(0)
    expect(writeState.batchUpdates.length).toBe(0)
  })

  it("returns an empty summary when the review confirms zero changes", async () => {
    const connection = await seedConnection()

    const summary = await runPush(connection, [])

    expect(summary).toEqual({
      written: 0,
      failures: [],
      conflictsKept: 0,
      stoppedByPermissions: false,
    })
    expect(writeState.updates.length).toBe(0)
    expect(writeState.batchUpdates.length).toBe(0)
  })

  it("sends one single update per product with only the changed fields", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(3)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
    ])
    const nameField = await fieldId(collection, "Name")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    for (const item of items) {
      await editItemField(collection, item.id, nameField, `Renamed ${item.id}`)
    }

    const check = await collectPendingChanges(connection, settings)
    expect(check.changes.length).toBe(3)
    const summary = await runPush(connection, check.changes)
    expect(summary.written).toBe(3)
    expect(summary.failures).toEqual([])
    expect(writeState.batchUpdates.length).toBe(0)
    expect(writeState.updates.length).toBe(3)
    for (const update of writeState.updates) {
      expect(Object.keys(update.fields)).toEqual(["name"])
    }
  })

  it("groups every changed field of one product into one update", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(1)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
      { name: "Price", type: "number" },
    ])
    const nameField = await fieldId(collection, "Name")
    const priceField = await fieldId(collection, "Price")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
      twoWayRow("price", priceField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    await editItemField(collection, items[0].id, nameField, "Renamed")
    await editItemField(collection, items[0].id, priceField, 99.5)

    const check = await collectPendingChanges(connection, settings)
    expect(check.changes.length).toBe(2)
    const summary = await runPush(connection, check.changes)
    expect(summary.written).toBe(1)
    expect(summary.failures).toEqual([])
    expect(writeState.updates.length).toBe(1)
    expect(writeState.updates[0].id).toBe("1")
    expect(writeState.updates[0].fields).toEqual({ name: "Renamed", price: 99.5 })
  })

  it("sends batch requests once the single update limit is passed", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(15)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
    ])
    const nameField = await fieldId(collection, "Name")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    for (let index = 0; index < items.length; index += 1) {
      await editItemField(
        collection,
        items[index].id,
        nameField,
        `Renamed ${index + 1}`
      )
    }

    const check = await collectPendingChanges(connection, settings)
    expect(check.changes.length).toBe(15)
    const summary = await runPush(connection, check.changes)
    expect(summary.written).toBe(15)
    expect(summary.failures).toEqual([])
    expect(writeState.updates.length).toBe(0)
    expect(writeState.batchUpdates.length).toBe(1)
    expect(writeState.batchUpdates[0].length).toBe(15)
    expect(writeState.batchUpdates[0][0].id).toBe("1")
    expect(writeState.batchUpdates[0][0].fields).toEqual({ name: "Renamed 1" })
  })

  it("keeps the store value for unresolved conflicts by default", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(2)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
    ])
    const nameField = await fieldId(collection, "Name")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    await editItemField(collection, items[0].id, nameField, "CMS only edit")
    await editItemField(collection, items[1].id, nameField, "Both sides edit")
    providerState.products[1] = makeProduct(1, { name: "Store side edit" })

    const check = await collectPendingChanges(connection, settings)
    expect(check.changes.length).toBe(2)
    const conflict = check.changes.find(function isConflict(change) {
      return change.itemWooId === "2"
    })
    expect(conflict?.resolution).toBe("pending")

    const summary = await runPush(connection, check.changes)
    expect(summary.conflictsKept).toBe(1)
    expect(summary.written).toBe(1)
    expect(summary.failures).toEqual([])
    expect(
      writeState.updates.map(function updatedId(update) {
        return update.id
      })
    ).toEqual(["1"])
    expect(writeState.updates[0].fields).toEqual({ name: "CMS only edit" })
  })

  it("refreshes snapshots so a confirmed change is offered only once", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(1)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
      { name: "Price", type: "number" },
    ])
    const nameField = await fieldId(collection, "Name")
    const priceField = await fieldId(collection, "Price")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
      twoWayRow("price", priceField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    await editItemField(collection, items[0].id, nameField, "Renamed 1")
    const firstCheck = await collectPendingChanges(connection, settings)
    expect(firstCheck.changes.length).toBe(1)
    const summary = await runPush(connection, firstCheck.changes)
    expect(summary.written).toBe(1)
    expect(summary.failures).toEqual([])

    const secondCheck = await collectPendingChanges(connection, settings)
    expect(secondCheck).toEqual({ changes: [], names: {} })

    await editItemField(collection, items[0].id, priceField, 55)
    const thirdCheck = await collectPendingChanges(connection, settings)
    expect(thirdCheck.changes.length).toBe(1)
    expect(thirdCheck.changes[0].field).toBe("price")
  })

  it("stops the push with the key upgrade message on a permission failure", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(1)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
    ])
    const nameField = await fieldId(collection, "Name")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    await editItemField(collection, items[0].id, nameField, "Renamed")
    const check = await collectPendingChanges(connection, settings)
    expect(check.changes.length).toBe(1)

    writeState.updateError = new AuthError()
    const summary = await runPush(connection, check.changes)
    expect(summary.stoppedByPermissions).toBe(true)
    expect(summary.written).toBe(0)
    expect(summary.failures.length).toBe(1)
    expect(summary.failures[0].itemName).toBe("Product 1")
    expect(summary.failures[0].message).toBe(WRITE_PERMISSION_MESSAGE)

    const recheck = await collectPendingChanges(connection, settings)
    expect(recheck.changes.length).toBe(1)
  })

  it("ignores fields mapped one-way when collecting edits", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(1)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
      { name: "Description", type: "formattedText" },
    ])
    const nameField = await fieldId(collection, "Name")
    const descriptionField = await fieldId(collection, "Description")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
      row("description", descriptionField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    await editItemField(collection, items[0].id, nameField, "Renamed")
    await editItemField(
      collection,
      items[0].id,
      descriptionField,
      "Edited description"
    )

    const check = await collectPendingChanges(connection, settings)
    expect(check.changes.length).toBe(1)
    expect(check.changes[0].field).toBe("name")
    const summary = await runPush(connection, check.changes)
    expect(summary.written).toBe(1)
    expect(writeState.updates[0].fields).toEqual({ name: "Renamed" })
  })

  it("skips CMS edits for products without a stored snapshot", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(2)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
    ])
    const nameField = await fieldId(collection, "Name")
    const oneWaySettings = buildSettings(collection.id, [
      row("name", nameField),
    ])
    await runPull(connection, oneWaySettings, baseHooks())

    const items = await collection.getItems()
    await editItemField(collection, items[0].id, nameField, "Hand edited")

    const twoWaySettings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
    ])
    const check = await collectPendingChanges(connection, twoWaySettings)
    expect(check).toEqual({ changes: [], names: {} })
  })

  it("leaves CMS items alone when the product was deleted from the store", async () => {
    const connection = await seedConnection()
    providerState.products = makeProducts(2)
    const collection = await setupTargetCollection([
      { name: "Name", type: "string" },
    ])
    const nameField = await fieldId(collection, "Name")
    const settings = buildSettings(collection.id, [
      twoWayRow("name", nameField),
    ])
    await runPull(connection, settings, baseHooks())

    const items = await collection.getItems()
    await editItemField(collection, items[0].id, nameField, "Hand edited")
    providerState.products = []

    const check = await collectPendingChanges(connection, settings)
    expect(check).toEqual({ changes: [], names: {} })
  })
})
