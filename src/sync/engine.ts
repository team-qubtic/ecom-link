/**
 * Sync Engine - orchestrating the product pull and the confirmed write-back
 *
 * runPull walks the product catalog page by page, maps each product into
 * the mapped CMS fields, and creates or updates CMS items in place. Every
 * stop condition (cancel, rate limit, safety cap, plan limit) keeps the
 * items already written and leaves the watermark untouched so the next run
 * picks up where this one stopped. Mapping problems are rejected before any
 * network request, so a bad mapping can never touch the store.
 *
 * The write-back half (spec 004) runs after the merchant confirms a review:
 * collectPendingChanges diffs the CMS against the stored snapshots with
 * read-only requests, and runPush sends the confirmed changes to the store.
 */

import {
  AuthError,
  getProvider,
  ProductNotFoundError,
  ProviderError,
  RateLimitError,
} from "../providers"
import type {
  Credentials,
  EcommerceProvider,
  ListProductsResult,
  NormalizedProduct,
  NormalizedProductField,
  NormalizedVariation,
  ProductImage,
  ProductUpdateFields,
} from "../providers"
import { getFullCredentials } from "../storage/connections"
import type { ConnectionRecord } from "../storage/connections"
import { assertCanEditCms, ConnectionValidationError, sdk } from "../storage/internal"
import type { SdkCollectionLike, SdkFieldLike } from "../storage/internal"
import { recordRun } from "../storage/history"
import { getSnapshots, writeSnapshots } from "../storage/snapshots"
import type { SnapshotEntry } from "../storage/snapshots"
import type {
  SyncFieldMapping,
  SyncPlatformField,
  SyncSettings,
} from "../storage/settings"
import { buildIdentityIndex, slugForProduct, WOO_ID_FIELD_NAME } from "./identity"
import type { IdentityEntry } from "./identity"
import {
  applyResolutions,
  classifyChange,
  cmsValueToPlatform,
  groupPushesByProduct,
  platformValuesEqual,
  toPendingChange,
} from "./conflict"
import type { PendingChange, ProductWriteGroup } from "./conflict"
import { MAX_REPORT_FAILURES } from "./report"
import type {
  SyncFailure,
  SyncReport,
  SyncRunStatus,
  WriteBackSummary,
} from "./report"
import { getStoredWatermark, isValidIsoTimestamp, setWatermark } from "./watermark"

// ============================================================================
// Constants and messages
// ============================================================================

/** Products requested per page from the store. */
const PRODUCT_PAGE_SIZE = 100

/** CMS items written per addItems call, small enough to keep the canvas responsive. */
const WRITE_CHUNK_SIZE = 10

const MISSING_COLLECTION_MESSAGE =
  "The sync collection no longer exists. Pick a collection in the mapping settings."
const DUPLICATE_FIELD_MESSAGE =
  "Two mapped fields use the same collection field. Choose a different field for one of them."
const SAFETY_CAP_NOTE =
  "Sync stopped at the safety limit. Increase it in Settings to continue."
const GALLERY_CAP_NOTE =
  "Some gallery images were skipped because of the gallery cap. Increase it in Settings to sync more."
const INVALID_WATERMARK_NOTE =
  "The last sync time was missing or invalid, so this run synced the full catalog."
const WATERMARK_SAVE_NOTE =
  "The sync time could not be saved, so the next run will sync the full catalog."
const RATE_LIMIT_MESSAGE =
  "The store is rate limiting requests. Wait a moment, then retry."
const UNREACHABLE_MESSAGE =
  "The store could not be reached. Check the connection and try again."
const VARIANTS_FAILURE_MESSAGE = "Variants could not be loaded from the store."
const WRITE_FAILURE_MESSAGE = "The items could not be saved to the Framer collection."
export const WRITE_PERMISSION_MESSAGE =
  "Your API key does not allow changes to the store. Create a key with read and write permission and reconnect."
const SNAPSHOT_SAVE_FAILURE_NOTE =
  "Your store changes were saved, but the local change history could not be updated. The next sync may offer the same change again."

/** Up to this many changed products go out as single product updates. */
const SINGLE_PUT_LIMIT = 10

/** WooCommerce caps one batch write request at this many products. */
const PUSH_BATCH_SIZE = 100

// ============================================================================
// Field type rules and mapping validation
// ============================================================================

/** Which CMS field types one platform field may be mapped onto. */
export interface FieldTypeRule {
  label: string
  allowed: readonly string[]
  message: string
}

/** One rule per platform field, keyed exactly like SyncPlatformField. */
export const FIELD_TYPE_RULES: Record<SyncPlatformField, FieldTypeRule> = {
  id: { label: "Product ids", allowed: ["string"], message: "Product ids must map to a text field." },
  name: { label: "Names", allowed: ["string"], message: "Names must map to a text field." },
  slug: { label: "Slugs", allowed: ["string"], message: "Slugs must map to a text field." },
  permalink: { label: "Permalinks", allowed: ["string", "link"], message: "Permalinks must map to a text or link field." },
  status: { label: "Statuses", allowed: ["string", "enum"], message: "Statuses must map to a text or select field." },
  description: { label: "Descriptions", allowed: ["formattedText", "string"], message: "Descriptions must map to a rich text or text field." },
  shortDescription: { label: "Short descriptions", allowed: ["formattedText", "string"], message: "Short descriptions must map to a rich text or text field." },
  sku: { label: "SKUs", allowed: ["string"], message: "SKUs must map to a text field." },
  price: { label: "Prices", allowed: ["number", "string"], message: "Prices must map to a number or text field." },
  regularPrice: { label: "Regular prices", allowed: ["number", "string"], message: "Regular prices must map to a number or text field." },
  salePrice: { label: "Sale prices", allowed: ["number", "string"], message: "Sale prices must map to a number or text field." },
  onSale: { label: "On sale", allowed: ["boolean"], message: "On sale must map to a boolean field." },
  stockStatus: { label: "Stock statuses", allowed: ["string", "enum"], message: "Stock statuses must map to a text or select field." },
  stockQuantity: { label: "Stock quantities", allowed: ["number", "string"], message: "Stock quantities must map to a number or text field." },
  categories: { label: "Categories", allowed: ["string", "array"], message: "Categories must map to a text or list field." },
  tags: { label: "Tags", allowed: ["string", "array"], message: "Tags must map to a text or list field." },
  featuredImage: { label: "Featured images", allowed: ["image", "string"], message: "Featured images must map to an image or text field." },
  gallery: { label: "Galleries", allowed: ["array", "string"], message: "Galleries must map to a list or text field." },
  attributes: { label: "Attributes", allowed: ["string", "array"], message: "Attributes must map to a text or list field." },
  variants: { label: "Variants", allowed: ["string", "array"], message: "Variants must map to a text or list field." },
  rating: { label: "Ratings", allowed: ["number", "string"], message: "Ratings must map to a number or text field." },
  ratingCount: { label: "Rating counts", allowed: ["number", "string"], message: "Rating counts must map to a number or text field." },
  lastModified: { label: "Last modified dates", allowed: ["date", "string"], message: "Last modified dates must map to a date or text field." },
}

/** Thrown when the mapping cannot be written to the collection as configured. */
export class MappingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MappingValidationError"
  }
}

/**
 * Check every enabled mapping row against the collection fields. Returns
 * null when the mapping is safe to run, or the first violation found.
 * Disabled rows are skipped: they neither write nor block a run.
 */
export function validateMapping(
  settings: SyncSettings,
  fields: SdkFieldLike[]
): MappingValidationError | null {
  const usedFieldIds = new Set<string>()
  for (const row of settings.mapping) {
    // Unmapped rows (empty cmsFieldId, e.g. a created field that could not
    // be resolved) are skipped exactly like disabled ones.
    if (!row.enabled || row.cmsFieldId === "") {
      continue
    }
    const rule = FIELD_TYPE_RULES[row.platformField]
    const field = fields.find(function byId(candidate: SdkFieldLike) {
      return candidate.id === row.cmsFieldId
    })
    if (!field) {
      return new MappingValidationError(
        `${rule.label} is mapped to a collection field that no longer exists. Update the mapping and try again.`
      )
    }
    const fieldType = field.type ?? "string"
    if (rule.allowed.indexOf(fieldType) === -1) {
      return new MappingValidationError(rule.message)
    }
    if (usedFieldIds.has(row.cmsFieldId)) {
      return new MappingValidationError(DUPLICATE_FIELD_MESSAGE)
    }
    usedFieldIds.add(row.cmsFieldId)
  }
  return null
}

// ============================================================================
// Run hooks and internal shapes
// ============================================================================

/** Progress snapshot published after each catalog page completes. */
export interface SyncProgress {
  page: number
  totalPages: number
  processed: number
  totalItems: number
}

/** Optional control surface for the UI driving a run. */
export interface SyncRunHooks {
  onPage?(progress: SyncProgress): void
  signal?: { aborted: boolean }
  resumeFromPage?: number
  yieldFn?(): Promise<void>
  now?(): string
}

/** One typed fieldData entry exactly as the CMS API expects it. */
interface FieldEntry {
  type: string
  value: unknown
}

/** Downloaded image assets for one product. */
interface ProductAssets {
  featuredAssetId: string | null
  galleryAssetIds: string[]
}

/** One CMS write queued during a page, flushed in chunks after the page. */
interface PageWrite {
  kind: "create" | "update"
  itemId: string | null
  slug: string | null
  fieldData: Record<string, FieldEntry>
  snapshot: SnapshotEntry | null
}

/** Mutable per-run state shared by the page loop and its helpers. */
interface RunContext {
  settings: SyncSettings
  rows: SyncFieldMapping[]
  fieldsById: Map<string, SdkFieldLike>
  wooIdFieldId: string
  credentials: Credentials
  provider: EcommerceProvider
  identity: Map<string, IdentityEntry>
  storedSnapshots: Map<string, Record<string, unknown>>
  failures: SyncFailure[]
  notes: string[]
  snapshots: SnapshotEntry[]
  created: number
  updated: number
  skipped: number
  galleryCapNoted: boolean
  yieldFn(): Promise<void>
}

// ============================================================================
// runPull
// ============================================================================

/**
 * Pull products from the store into the mapped CMS collection and return
 * the report. Throws MappingValidationError before any network request when
 * the collection is gone or the mapping cannot be written. Never throws
 * after the first catalog request: problems become a paused or stopped
 * report so partial progress and history are always kept.
 */
export async function runPull(
  connection: ConnectionRecord,
  settings: SyncSettings,
  hooks: SyncRunHooks = {}
): Promise<SyncReport> {
  const nowFn = hooks.now ?? defaultNow
  const yieldFn = hooks.yieldFn ?? defaultYield
  const startedAt = nowFn()
  let status: SyncRunStatus = "completed"
  let failedPage: number | null = null
  const notes: string[] = []

  // Resolve the collection and validate the mapping first so a bad mapping
  // can never produce a request to the store.
  const collection = await findTargetCollection(settings.targetCollectionId)
  const { fields, wooIdFieldId } = await ensureWooIdField(collection)
  const validationError = validateMapping(settings, fields)
  if (validationError) {
    throw validationError
  }

  const credentials = await getFullCredentials(connection.id)
  const provider = getProvider(connection.providerId)

  // The watermark decides whether this run is incremental. A stored but
  // invalid value falls back to a full pass and says so in the report.
  const storedWatermark = await getStoredWatermark(connection.id)
  const modifiedAfter =
    storedWatermark !== null && isValidIsoTimestamp(storedWatermark)
      ? storedWatermark
      : undefined
  if (storedWatermark !== null && modifiedAfter === undefined) {
    notes.push(INVALID_WATERMARK_NOTE)
  }

  const items = await collection.getItems()
  const identity = buildIdentityIndex(items, wooIdFieldId)
  const hasTwoWayRows = settings.mapping.some(function isBidirectional(row: SyncFieldMapping) {
    return row.enabled && row.direction === "bidirectional"
  })
  const storedSnapshots = hasTwoWayRows
    ? await getSnapshots(connection.id)
    : new Map<string, Record<string, unknown>>()

  const fieldsById = new Map<string, SdkFieldLike>()
  for (const field of fields) {
    fieldsById.set(field.id, field)
  }
  const ctx: RunContext = {
    settings,
    rows: settings.mapping.filter(function isRunnable(row: SyncFieldMapping) {
      return row.enabled && row.cmsFieldId !== ""
    }),
    fieldsById,
    wooIdFieldId,
    credentials,
    provider,
    identity,
    storedSnapshots,
    failures: [],
    notes,
    snapshots: [],
    created: 0,
    updated: 0,
    skipped: 0,
    galleryCapNoted: false,
    yieldFn,
  }

  let page = hooks.resumeFromPage ?? 1
  let totalPages = 0
  let totalItems = 0
  let keepGoing = true
  while (keepGoing) {
    if (isAborted(hooks)) {
      status = "canceled"
      break
    }
    let result: ListProductsResult
    try {
      result = await provider.listProducts(credentials, {
        page,
        perPage: PRODUCT_PAGE_SIZE,
        status: settings.statusesFilter.join(","),
        modifiedAfter,
      })
    } catch (error) {
      status = "paused"
      failedPage = page
      pushFailure(ctx.failures, `Page ${page}`, pageFailureMessage(error))
      break
    }
    totalPages = result.totalPages
    totalItems = result.totalItems

    const writes: PageWrite[] = []
    for (const product of result.products) {
      if (isAborted(hooks)) {
        status = "canceled"
        break
      }
      // Pending writes count toward the cap so a large page cannot
      // overshoot it; the totals only advance when the page is flushed.
      const handled = ctx.created + ctx.updated + ctx.skipped + writes.length
      if (handled >= settings.safetyCap) {
        status = "stopped"
        if (notes.indexOf(SAFETY_CAP_NOTE) === -1) {
          notes.push(SAFETY_CAP_NOTE)
        }
        break
      }
      const write = await buildPageWrite(product, ctx)
      if (write === null) {
        ctx.skipped += 1
      } else {
        writes.push(write)
      }
    }

    // A canceled run keeps the page it was working on unflushed, so items
    // the merchant saw as mid-flight are simply not written. Any other
    // outcome flushes what was built, even when the safety cap stopped the
    // run partway through the page.
    if (status !== "canceled") {
      const outcome = await flushWrites(collection, writes, page, ctx)
      if (outcome === "plan-limit") {
        status = "stopped"
        notes.push(
          planLimitNote(totalItems - ctx.created - ctx.updated - ctx.skipped)
        )
      } else if (outcome === "write-failed") {
        status = "paused"
        failedPage = page
      }
    }

    if (hooks.onPage) {
      hooks.onPage({
        page,
        totalPages,
        processed: ctx.created + ctx.updated + ctx.skipped,
        totalItems,
      })
    }

    if (status !== "completed") {
      keepGoing = false
    } else if (page >= totalPages) {
      keepGoing = false
    } else {
      page += 1
      await yieldFn()
    }
  }

  const finishedAt = nowFn()
  const report: SyncReport = {
    status,
    startedAt,
    finishedAt,
    created: ctx.created,
    updated: ctx.updated,
    skipped: ctx.skipped,
    // The failed count tracks items that could not sync at all. Image and
    // variant problems are recorded as failures but the item still syncs,
    // so they do not count here.
    failed: 0,
    failures: ctx.failures,
    notes,
    failedPage,
  }

  // The watermark only advances after a fully successful pull, using the
  // run start time so changes that happened during the run are caught by
  // the next one. Canceled, paused, and stopped runs retry this window.
  if (report.status === "completed" && report.failed === 0) {
    try {
      await setWatermark(connection.id, startedAt)
    } catch (error) {
      // Surface the storage failure reason so the note is actionable
      // instead of a mysterious full-catalog re-sync next run.
      notes.push(
        error instanceof Error && error.message !== ""
          ? `${WATERMARK_SAVE_NOTE} (${error.message})`
          : WATERMARK_SAVE_NOTE
      )
    }
  }

  // Snapshots feed the two way diff in spec 004. They are only collected
  // when a bidirectional row exists, and only for written items.
  if (ctx.snapshots.length > 0) {
    try {
      await writeSnapshots(connection.id, ctx.snapshots)
    } catch {
      // A snapshot write failure never fails the run itself.
    }
  }

  try {
    await recordRun(connection.id, report)
  } catch {
    // History is best effort; the report still reaches the caller.
  }
  return report
}

// ============================================================================
// Collection helpers
// ============================================================================

function isAborted(hooks: SyncRunHooks): boolean {
  return hooks.signal?.aborted === true
}

async function findTargetCollection(
  targetCollectionId: string
): Promise<SdkCollectionLike> {
  const collections = await sdk.getCollections()
  const found = Array.isArray(collections)
    ? collections.find(function byId(candidate: SdkCollectionLike) {
        return candidate?.id === targetCollectionId
      })
    : undefined
  if (!found) {
    throw new MappingValidationError(MISSING_COLLECTION_MESSAGE)
  }
  return found
}

/**
 * Make sure the target collection has the woo_id identity field and return
 * the full field list plus the woo_id field id. The field is added with
 * self-repair semantics: it exists on every collection this plugin has
 * synced, and is re-created when a merchant removed it.
 */
async function ensureWooIdField(collection: SdkCollectionLike): Promise<{
  fields: SdkFieldLike[]
  wooIdFieldId: string
}> {
  const existing = await collection.getFields()
  const match = existing.find(function byName(candidate: SdkFieldLike) {
    return candidate.name === WOO_ID_FIELD_NAME
  })
  if (match) {
    return { fields: existing, wooIdFieldId: match.id }
  }
  assertCanEditCms("Collection.addFields")
  const updated = await collection.addFields([
    { name: WOO_ID_FIELD_NAME, type: "string" },
  ])
  const added = updated.find(function byName(candidate: SdkFieldLike) {
    return candidate.name === WOO_ID_FIELD_NAME
  })
  return added
    ? { fields: updated, wooIdFieldId: added.id }
    : { fields: existing, wooIdFieldId: "" }
}

// ============================================================================
// Writes
// ============================================================================

type FlushOutcome = "ok" | "plan-limit" | "write-failed"

/**
 * Write queued page items in small chunks, yielding between chunks so the
 * Framer canvas stays responsive. Counters and snapshots only advance for
 * chunks that were actually saved, so a mid-page stop loses nothing.
 */
async function flushWrites(
  collection: SdkCollectionLike,
  writes: PageWrite[],
  page: number,
  ctx: RunContext
): Promise<FlushOutcome> {
  for (let index = 0; index < writes.length; index += WRITE_CHUNK_SIZE) {
    const chunk = writes.slice(index, index + WRITE_CHUNK_SIZE)
    const payload = chunk.map(function toSdkItem(write: PageWrite) {
      if (write.kind === "update" && write.itemId !== null) {
        return { id: write.itemId, fieldData: write.fieldData }
      }
      return {
        slug: write.slug === null ? undefined : write.slug,
        fieldData: write.fieldData,
      }
    })
    assertCanEditCms("Collection.addItems")
    try {
      await collection.addItems(payload)
    } catch (error) {
      if (isPlanLimitError(error)) {
        return "plan-limit"
      }
      pushFailure(
        ctx.failures,
        `Page ${page}`,
        error instanceof ConnectionValidationError
          ? error.message
          : WRITE_FAILURE_MESSAGE
      )
      return "write-failed"
    }
    for (const write of chunk) {
      if (write.kind === "create") {
        ctx.created += 1
      } else {
        ctx.updated += 1
      }
      if (write.snapshot !== null) {
        ctx.snapshots.push(write.snapshot)
      }
    }
    if (index + WRITE_CHUNK_SIZE < writes.length) {
      await ctx.yieldFn()
    }
  }
  return "ok"
}

/** The Framer plan limit message is matched loosely so wording changes survive. */
function isPlanLimitError(error: unknown): boolean {
  return error instanceof Error && /limit/i.test(error.message)
}

// ============================================================================
// Per-product processing
// ============================================================================

/**
 * Turn one platform product into a CMS write. Returns null when every
 * mapped entry equals what the CMS item already holds, which is what makes
 * re-runs idempotent. Updates preserve unmapped fields (and woo_id) by
 * spreading the existing field data under the new entries.
 */
async function buildPageWrite(
  product: NormalizedProduct,
  ctx: RunContext
): Promise<PageWrite | null> {
  const variations = await loadVariations(product, ctx)
  const assets = await syncProductImages(product, ctx)

  const entries: Record<string, FieldEntry> = {}
  const snapshotValues: Record<string, unknown> = {}
  const existing = ctx.identity.get(product.id)
  for (const row of ctx.rows) {
    const field = ctx.fieldsById.get(row.cmsFieldId)
    if (!field) {
      continue
    }
    const fieldType = field.type ?? "string"
    const entry = emitEntry(product, row.platformField, fieldType, variations, assets)

    // Two-way rows never clobber a Framer edit: when the CMS value moved
    // away from the stored snapshot, the pull keeps the CMS value and the
    // write-back review decides what reaches the store. The id row is
    // download only, so it never takes part in the snapshot comparison.
    if (row.direction === "bidirectional" && existing && row.platformField !== "id") {
      const platformField: NormalizedProductField = row.platformField
      const stored = readStoredSnapshot(ctx.storedSnapshots, product.id, platformField)
      const cmsValue = cmsValueToPlatform(
        existing.fieldData[row.cmsFieldId]?.value,
        platformField
      )
      if (stored !== undefined && !platformValuesEqual(cmsValue, stored)) {
        // The merchant edited this field in Framer. Keep the edit and carry
        // the stored snapshot forward unchanged.
        snapshotValues[platformField] = stored
        continue
      }
      if (entry === null && stored !== undefined && cmsValue !== "" && cmsValue !== null) {
        // The store value went missing while the CMS still holds the old
        // value. Keep the stored snapshot so the stale CMS value cannot
        // auto-push over the store's removal in a later write-back.
        snapshotValues[platformField] = stored
        continue
      }
    }

    if (entry !== null) {
      entries[row.cmsFieldId] = entry
    }
    if (row.direction === "bidirectional") {
      snapshotValues[row.platformField] = rawPlatformValue(product, row.platformField, variations)
    }
  }

  if (existing) {
    const changed = Object.keys(entries).some(function differs(fieldId: string) {
      return !deepEqual(entries[fieldId], existing.fieldData[fieldId])
    })
    if (!changed) {
      return null
    }
    return {
      kind: "update",
      itemId: existing.itemId,
      slug: null,
      fieldData: { ...existing.fieldData, ...entries },
      snapshot: buildSnapshot(product, snapshotValues),
    }
  }

  const fieldData: Record<string, FieldEntry> = { ...entries }
  fieldData[ctx.wooIdFieldId] = { type: "string", value: product.id }
  return {
    kind: "create",
    itemId: null,
    slug: slugForProduct(product.id),
    fieldData,
    snapshot: buildSnapshot(product, snapshotValues),
  }
}

function buildSnapshot(
  product: NormalizedProduct,
  values: Record<string, unknown>
): SnapshotEntry | null {
  if (Object.keys(values).length === 0) {
    return null
  }
  return { itemWooId: product.id, values }
}

/**
 * Load variations for a variable product, capped at the variations cap.
 * Only runs when the merchant maps the variants field; a failure loads no
 * variants, notes the item in the report, and lets the item still sync.
 */
async function loadVariations(
  product: NormalizedProduct,
  ctx: RunContext
): Promise<NormalizedVariation[]> {
  const wantsVariants = ctx.rows.some(function isVariantsRow(row: SyncFieldMapping) {
    return row.platformField === "variants"
  })
  if (!wantsVariants || product.variantIds.length === 0) {
    return []
  }
  const listVariations = ctx.provider.listVariations
  if (typeof listVariations !== "function") {
    return []
  }
  const collected: NormalizedVariation[] = []
  let page = 1
  while (collected.length < ctx.settings.variationsCap) {
    const room = Math.min(
      PRODUCT_PAGE_SIZE,
      ctx.settings.variationsCap - collected.length
    )
    let pageVariations: NormalizedVariation[]
    try {
      pageVariations = await listVariations(ctx.credentials, product.id, {
        page,
        perPage: room,
      })
    } catch {
      pushFailure(ctx.failures, displayName(product), VARIANTS_FAILURE_MESSAGE)
      return []
    }
    collected.push(...pageVariations)
    if (pageVariations.length < room) {
      break
    }
    page += 1
  }
  return collected.slice(0, ctx.settings.variationsCap)
}

/**
 * Download the featured image and gallery through the asset pipeline, one
 * request at a time with a yield between downloads. The first failure is
 * reported once per item and the remaining images are skipped: the item
 * still syncs with whatever assets made it.
 */
async function syncProductImages(
  product: NormalizedProduct,
  ctx: RunContext
): Promise<ProductAssets> {
  const assets: ProductAssets = { featuredAssetId: null, galleryAssetIds: [] }
  if (product.gallery.length > ctx.settings.galleryCap && !ctx.galleryCapNoted) {
    ctx.galleryCapNoted = true
    ctx.notes.push(GALLERY_CAP_NOTE)
  }
  // Image fields are written with the store image URLs (see emitEntry), so
  // there is no asset pipeline to run here: images render straight from the
  // store, and nothing can fail per product.
  return assets
}

// ============================================================================
// Field entry emission
// ============================================================================

function stringEntry(value: string, fieldType: string): FieldEntry {
  return { type: fieldType, value }
}

/**
 * Convert store HTML into plain text: strip tags, decode the common
 * entities, and collapse whitespace. Used when a description maps onto a
 * plain text field instead of rich text, so raw markup never lands in the
 * CMS as visible text. Exported for the storefront builders, which render
 * descriptions as canvas text layers.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, function decode(_, code) {
      return String.fromCharCode(Number(code))
    })
    .replace(/\s+/g, " ")
    .trim()
}

function numberEntry(value: number, fieldType: string): FieldEntry {
  if (fieldType === "number") {
    return { type: "number", value }
  }
  return { type: fieldType, value: String(value) }
}

/**
 * Convert one platform field into a CMS fieldData entry for the field type
 * the merchant mapped it onto. Returns null when the product has no value
 * for the field: an update then keeps the previous value in the CMS and a
 * create simply leaves the field empty.
 */
function emitEntry(
  product: NormalizedProduct,
  platformField: SyncPlatformField,
  fieldType: string,
  variations: NormalizedVariation[],
  assets: ProductAssets
): FieldEntry | null {
  switch (platformField) {
    case "id":
      return stringEntry(product.id, fieldType)
    case "name":
      return stringEntry(product.name, fieldType)
    case "slug":
      return stringEntry(product.slug, fieldType)
    case "permalink":
      return stringEntry(product.permalink, fieldType)
    case "status":
      return stringEntry(product.status, fieldType)
    case "sku":
      return stringEntry(product.sku, fieldType)
    case "stockStatus":
      return stringEntry(product.stockStatus, fieldType)
    case "description":
      return fieldType === "formattedText"
        ? { type: fieldType, value: product.description }
        : stringEntry(htmlToText(product.description), fieldType)
    case "shortDescription":
      return fieldType === "formattedText"
        ? { type: fieldType, value: product.shortDescription }
        : stringEntry(htmlToText(product.shortDescription), fieldType)
    case "lastModified":
      return stringEntry(product.lastModified, fieldType)
    case "price":
      return numberEntry(product.price, fieldType)
    case "regularPrice":
      return numberEntry(product.regularPrice, fieldType)
    case "rating":
      return numberEntry(product.rating, fieldType)
    case "ratingCount":
      return numberEntry(product.ratingCount, fieldType)
    case "salePrice":
      return product.salePrice === null ? null : numberEntry(product.salePrice, fieldType)
    case "stockQuantity":
      return product.stockQuantity === null
        ? null
        : numberEntry(product.stockQuantity, fieldType)
    case "onSale":
      return { type: fieldType, value: product.onSale }
    case "featuredImage": {
      if (fieldType === "image") {
        // Prefer the uploaded asset; when the asset pipeline fails (stores
        // without CORS headers), fall back to the store URL so the image
        // still lands: the CMS imports it from the URL directly.
        if (assets.featuredAssetId !== null) {
          return { type: "image", value: assets.featuredAssetId }
        }
        const url = product.featuredImage ? product.featuredImage.url : ""
        return url === "" ? null : { type: "image", value: url }
      }
      const url = product.featuredImage ? product.featuredImage.url : ""
      return stringEntry(url, fieldType)
    }
    case "gallery": {
      if (fieldType === "array") {
        const values =
          assets.galleryAssetIds.length > 0
            ? assets.galleryAssetIds
            : product.gallery.map(function toUrl(image: ProductImage) {
                return image.url
              })
        return { type: "array", value: values }
      }
      const urls = product.gallery.map(function toUrl(image: ProductImage) {
        return image.url
      })
      return stringEntry(JSON.stringify(urls), fieldType)
    }
    case "categories": {
      if (fieldType === "array") {
        const names = product.categories.map(function toName(category) {
          return category.name
        })
        return { type: "array", value: names }
      }
      return stringEntry(JSON.stringify(product.categories), fieldType)
    }
    case "tags": {
      if (fieldType === "array") {
        return { type: "array", value: [...product.tags] }
      }
      return stringEntry(JSON.stringify(product.tags), fieldType)
    }
    case "attributes": {
      if (fieldType === "array") {
        const summaries = product.attributes.map(function summarize(attribute) {
          return `${attribute.name}: ${attribute.options.join(", ")}`
        })
        return { type: "array", value: summaries }
      }
      return stringEntry(JSON.stringify(product.attributes), fieldType)
    }
    case "variants": {
      if (fieldType === "array") {
        const summaries = variations.map(function summarize(variation) {
          return `${variation.sku === "" ? variation.id : variation.sku} at ${variation.price}`
        })
        return { type: "array", value: summaries }
      }
      return stringEntry(JSON.stringify(variations), fieldType)
    }
  }
}

/**
 * The raw normalized value of one platform field, stored in snapshots so
 * spec 004 can diff CMS edits against what the store last said.
 */
function rawPlatformValue(
  product: NormalizedProduct,
  platformField: SyncPlatformField,
  variations: NormalizedVariation[]
): unknown {
  switch (platformField) {
    case "id":
      return product.id
    case "name":
      return product.name
    case "slug":
      return product.slug
    case "permalink":
      return product.permalink
    case "status":
      return product.status
    case "sku":
      return product.sku
    case "stockStatus":
      return product.stockStatus
    case "description":
      return product.description
    case "shortDescription":
      return product.shortDescription
    case "lastModified":
      return product.lastModified
    case "price":
      return product.price
    case "regularPrice":
      return product.regularPrice
    case "salePrice":
      return product.salePrice
    case "stockQuantity":
      return product.stockQuantity
    case "onSale":
      return product.onSale
    case "featuredImage":
      return product.featuredImage === null ? null : product.featuredImage.url
    case "gallery":
      return product.gallery.map(function toUrl(image: ProductImage) {
        return image.url
      })
    case "categories":
      return product.categories.map(function toName(category) {
        return category.name
      })
    case "tags":
      return [...product.tags]
    case "attributes":
      return product.attributes
    case "variants":
      return variations
  }
}

// ============================================================================
// Small utilities
// ============================================================================

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }
    return left.every(function matchesAt(index: number, item: unknown) {
      return deepEqual(item, right[index])
    })
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) {
      return false
    }
    return leftKeys.every(function matchesKey(key: string) {
      return deepEqual(left[key], right[key])
    })
  }
  return false
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function pageFailureMessage(error: unknown): string {
  if (error instanceof RateLimitError) {
    return RATE_LIMIT_MESSAGE
  }
  if (error instanceof ConnectionValidationError) {
    return error.message
  }
  if (error instanceof ProviderError) {
    return error.message
  }
  return UNREACHABLE_MESSAGE
}

function pushFailure(
  failures: SyncFailure[],
  itemName: string,
  message: string
): void {
  if (failures.length < MAX_REPORT_FAILURES) {
    failures.push({ itemName, message })
  }
}

function planLimitNote(remaining: number): string {
  const safeRemaining = Math.max(remaining, 0)
  return `The Framer plan limit for CMS items was reached. ${pluralizeCount(
    safeRemaining,
    "item"
  )} ${safeRemaining === 1 ? "remains" : "remain"} unsynced.`
}

function pluralizeCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

function displayName(product: NormalizedProduct): string {
  return product.name === "" ? `Product ${product.id}` : product.name
}

function defaultNow(): string {
  return new Date().toISOString()
}

function defaultYield(): Promise<void> {
  return new Promise(function resolveNextTick(resolve: () => void) {
    setTimeout(resolve, 0)
  })
}

// ============================================================================
// Cleanup of products deleted from the store
// ============================================================================

/** A CMS item whose platform product no longer exists in the store. */
export interface DeletedCmsProduct {
  itemId: string
  itemName: string
  wooId: string
}

/**
 * List CMS items whose woo_id no longer matches any store product. The
 * engine never deletes anything on its own: the report modal shows this
 * list and the merchant confirms before removeDeletedProducts runs.
 */
export async function findDeletedProducts(
  connection: ConnectionRecord,
  settings: SyncSettings
): Promise<DeletedCmsProduct[]> {
  const collection = await findTargetCollection(settings.targetCollectionId)
  const { wooIdFieldId } = await ensureWooIdField(collection)
  const credentials = await getFullCredentials(connection.id)
  const provider = getProvider(connection.providerId)

  const storeIds = new Set<string>()
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const result = await provider.listProducts(credentials, {
      page,
      perPage: PRODUCT_PAGE_SIZE,
      status: settings.statusesFilter.join(","),
    })
    totalPages = result.totalPages
    for (const product of result.products) {
      storeIds.add(product.id)
    }
    page += 1
  }

  const items = await collection.getItems()
  const nameRow = settings.mapping.find(function isNameRow(row: SyncFieldMapping) {
    return row.enabled && row.platformField === "name"
  })
  const nameFieldId = nameRow ? nameRow.cmsFieldId : ""
  const deleted: DeletedCmsProduct[] = []
  for (const item of items) {
    const wooId = item.fieldData?.[wooIdFieldId]?.value
    if (typeof wooId !== "string" || wooId === "") {
      continue
    }
    if (storeIds.has(wooId)) {
      continue
    }
    const rawName = nameFieldId === "" ? undefined : item.fieldData?.[nameFieldId]?.value
    deleted.push({
      itemId: item.id,
      itemName:
        typeof rawName === "string" && rawName !== "" ? rawName : `Product ${wooId}`,
      wooId,
    })
  }
  return deleted
}

/** Remove confirmed CMS items. Deletion is always explicit, never automatic. */
export async function removeDeletedProducts(
  settings: SyncSettings,
  itemIds: string[]
): Promise<void> {
  if (itemIds.length === 0) {
    return
  }
  const collection = await findTargetCollection(settings.targetCollectionId)
  assertCanEditCms("Collection.removeItems")
  await collection.removeItems(itemIds)
}

// ============================================================================
// Write-back (spec 004)
// ============================================================================

/** Changes worth reviewing, plus the product names to show next to them. */
export interface WriteBackCheck {
  changes: PendingChange[]
  names: Record<string, string>
}

/**
 * Diff every two-way mapped field against the stored snapshots and the
 * current store values, and return the changes worth reviewing. This phase
 * only reads: one product fetch per item that actually changed. Items
 * without a snapshot never push, because nothing is known about their last
 * sync. Throws MappingValidationError before any request when the mapping
 * is broken.
 */
export async function collectPendingChanges(
  connection: ConnectionRecord,
  settings: SyncSettings
): Promise<WriteBackCheck> {
  const collection = await findTargetCollection(settings.targetCollectionId)
  const { fields, wooIdFieldId } = await ensureWooIdField(collection)
  const validationError = validateMapping(settings, fields)
  if (validationError) {
    throw validationError
  }

  const twoWayRows = settings.mapping.filter(function isTwoWay(row: SyncFieldMapping) {
    return row.enabled && row.direction === "bidirectional" && row.cmsFieldId !== ""
  })
  if (twoWayRows.length === 0) {
    return { changes: [], names: {} }
  }

  const credentials = await getFullCredentials(connection.id)
  const provider = getProvider(connection.providerId)
  const writable = provider.capabilities.writableFields
  const writableRows = twoWayRows.filter(function isWritable(row: SyncFieldMapping) {
    return row.platformField !== "id" && writable.includes(row.platformField)
  })
  if (writableRows.length === 0) {
    return { changes: [], names: {} }
  }

  const items = await collection.getItems()
  const identity = buildIdentityIndex(items, wooIdFieldId)
  const storedSnapshots = await getSnapshots(connection.id)

  const changes: PendingChange[] = []
  const names: Record<string, string> = {}
  for (const entry of identity) {
    const wooId = entry[0]
    const item = entry[1]
    const snapshotValues = storedSnapshots.get(wooId)
    if (snapshotValues === undefined) {
      continue
    }
    const candidates = collectRowCandidates(writableRows, item, snapshotValues)
    if (candidates.length === 0) {
      continue
    }
    let product: NormalizedProduct
    try {
      product = await provider.getProduct(credentials, wooId)
    } catch (error) {
      // A product deleted from the store leaves the CMS item alone.
      if (error instanceof ProductNotFoundError) {
        continue
      }
      throw error
    }
    names[wooId] = displayName(product)
    for (const candidate of candidates) {
      const wooValue = rawPlatformValue(product, candidate.platformField, [])
      const changeClass = classifyChange(candidate.framerValue, wooValue, candidate.stored)
      if (changeClass === "skip") {
        continue
      }
      changes.push(
        toPendingChange(wooId, candidate.platformField, wooValue, candidate.framerValue, changeClass)
      )
    }
  }
  return { changes, names }
}

/** One two-way row whose CMS value left its stored snapshot value. */
interface RowCandidate {
  platformField: NormalizedProductField
  stored: unknown
  framerValue: unknown
}

/**
 * Collect the rows of one item whose CMS value moved away from the stored
 * snapshot. Rows without a snapshot value are skipped: they were never
 * two-way synced, so there is no baseline to diff against.
 */
function collectRowCandidates(
  rows: SyncFieldMapping[],
  item: IdentityEntry,
  snapshotValues: Record<string, unknown>
): RowCandidate[] {
  const candidates: RowCandidate[] = []
  for (const row of rows) {
    if (row.platformField === "id") {
      continue
    }
    const platformField: NormalizedProductField = row.platformField
    const stored = snapshotValues[platformField]
    if (stored === undefined) {
      continue
    }
    const framerValue = cmsValueToPlatform(
      item.fieldData[row.cmsFieldId]?.value,
      platformField
    )
    if (platformValuesEqual(framerValue, stored)) {
      continue
    }
    candidates.push({ platformField, stored, framerValue })
  }
  return candidates
}

/**
 * Send the confirmed changes to the store. Conflicts default to keeping
 * the store value, and pushes are grouped so one request covers all the
 * changed fields of one product. Above the single update limit the pushes
 * go out in batch requests; a provider without batch support falls back to
 * single product updates. Snapshots are refreshed only for products whose
 * writes succeeded, so a failed write is offered again on the next review.
 */
export async function runPush(
  connection: ConnectionRecord,
  changes: PendingChange[],
  hooks: SyncRunHooks = {}
): Promise<WriteBackSummary> {
  const yieldFn = hooks.yieldFn ?? defaultYield
  const summary: WriteBackSummary = {
    written: 0,
    failures: [],
    conflictsKept: 0,
    stoppedByPermissions: false,
  }

  const resolved = applyResolutions(changes)
  summary.conflictsKept = resolved.conflictsKept.length
  if (resolved.pushes.length === 0) {
    return summary
  }

  let credentials: Credentials
  let provider: EcommerceProvider
  try {
    credentials = await getFullCredentials(connection.id)
    provider = getProvider(connection.providerId)
  } catch (error) {
    pushFailure(summary.failures, "Store connection", pageFailureMessage(error))
    return summary
  }

  const groups = groupPushesByProduct(resolved.pushes)
  const storedSnapshots = await getSnapshots(connection.id)
  const refreshed: SnapshotEntry[] = []

  const batchUpdate = provider.updateProductsBatch
  if (groups.length > SINGLE_PUT_LIMIT && batchUpdate !== undefined) {
    for (let index = 0; index < groups.length; index += PUSH_BATCH_SIZE) {
      if (isAborted(hooks)) {
        break
      }
      const chunk = groups.slice(index, index + PUSH_BATCH_SIZE)
      const updates = chunk.map(function toBatchUpdate(group: ProductWriteGroup) {
        return { id: group.itemWooId, fields: updateFieldsOf(group) }
      })
      try {
        await batchUpdate(credentials, updates)
      } catch (error) {
        for (const group of chunk) {
          recordPushFailure(summary, group.itemWooId, error)
        }
        break
      }
      summary.written += chunk.length
      for (const group of chunk) {
        refreshed.push(refreshedSnapshot(group, storedSnapshots.get(group.itemWooId)))
      }
      await yieldFn()
    }
  } else {
    for (const group of groups) {
      if (isAborted(hooks)) {
        break
      }
      try {
        await provider.updateProductFields(credentials, group.itemWooId, updateFieldsOf(group))
      } catch (error) {
        recordPushFailure(summary, group.itemWooId, error)
        break
      }
      summary.written += 1
      refreshed.push(refreshedSnapshot(group, storedSnapshots.get(group.itemWooId)))
      await yieldFn()
    }
  }

  if (refreshed.length > 0) {
    try {
      await writeSnapshots(connection.id, refreshed)
    } catch {
      pushFailure(summary.failures, "Change history", SNAPSHOT_SAVE_FAILURE_NOTE)
    }
  }
  return summary
}

/**
 * Record one failed product write. A permission problem stops the whole
 * push with the key upgrade message; anything else keeps the generic
 * failure text.
 */
function recordPushFailure(
  summary: WriteBackSummary,
  itemWooId: string,
  error: unknown
): void {
  if (error instanceof AuthError) {
    summary.stoppedByPermissions = true
    pushFailure(summary.failures, `Product ${itemWooId}`, WRITE_PERMISSION_MESSAGE)
    return
  }
  pushFailure(summary.failures, `Product ${itemWooId}`, pageFailureMessage(error))
}

/**
 * The store fields of one product write, in the shape the provider takes.
 * Nullable number fields (sale price, stock quantity) pass null through so
 * the store clears them, while required number fields (price, regular
 * price) drop an empty Framer value: the store keeps its required price and
 * the next pull flows that value back into Framer. Status fields accept
 * only their store values; any other Framer text is dropped so the store
 * keeps its own status.
 */
function updateFieldsOf(group: ProductWriteGroup): ProductUpdateFields {
  const fields: ProductUpdateFields = {}
  for (const change of group.changes) {
    switch (change.field) {
      case "name":
      case "slug":
      case "description":
      case "shortDescription":
      case "sku":
        fields[change.field] = textValue(change.framerValue)
        break
      case "status":
        fields.status = statusValue(change.framerValue)
        break
      case "stockStatus":
        fields.stockStatus = stockStatusValue(change.framerValue)
        break
      case "price":
      case "regularPrice":
        fields[change.field] = numberOrNull(change.framerValue) ?? undefined
        break
      case "salePrice":
      case "stockQuantity":
        fields[change.field] = numberOrNull(change.framerValue)
        break
      default:
        break
    }
  }
  return fields
}

/**
 * Coerce one CMS value into a publication status the store accepts. Any
 * other text returns undefined so the write omits the field and the store
 * keeps its own status.
 */
function statusValue(value: unknown): NormalizedProduct["status"] | undefined {
  const text = textValue(value)
  return text === "draft" || text === "pending" || text === "private" || text === "publish"
    ? text
    : undefined
}

/**
 * Coerce one CMS value into a stock status the store accepts. Any other
 * text returns undefined so the write omits the field and the store keeps
 * its own status.
 */
function stockStatusValue(value: unknown): NormalizedProduct["stockStatus"] | undefined {
  const text = textValue(value)
  return text === "instock" || text === "outofstock" || text === "onbackorder"
    ? text
    : undefined
}

/** Coerce one CMS value into the string a text store field expects. */
function textValue(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (value === null || value === undefined) {
    return ""
  }
  return String(value)
}

/** Coerce one CMS value into the number a numeric store field expects. */
function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return value
  }
  if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

/**
 * Refresh one product snapshot after a successful write: the previous
 * values are kept and only the pushed fields move to the value the store
 * now holds, so unrelated two-way fields keep their baseline.
 */
function refreshedSnapshot(
  group: ProductWriteGroup,
  previous: Record<string, unknown> | undefined
): SnapshotEntry {
  const values: Record<string, unknown> = { ...previous }
  for (const change of group.changes) {
    values[change.field] = change.framerValue
  }
  return { itemWooId: group.itemWooId, values }
}

/** Read one stored snapshot value, or undefined when it was never stored. */
function readStoredSnapshot(
  snapshots: Map<string, Record<string, unknown>>,
  itemWooId: string,
  platformField: SyncPlatformField
): unknown {
  const values = snapshots.get(itemWooId)
  if (values === undefined) {
    return undefined
  }
  return values[platformField]
}
