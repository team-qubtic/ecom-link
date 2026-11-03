/**
 * Change Classification - deciding what flows back to the store (spec 004)
 *
 * Pure module: no SDK, no network, no storage. The engine feeds in three
 * values per item field (the Framer CMS value, the current store value, and
 * the last-synced snapshot value) and gets one of three outcomes:
 *
 * - push:     Framer changed since the last sync and the store did not.
 * - conflict: both sides changed since the last sync.
 * - skip:     Framer did not change, or no snapshot exists (first sync,
 *             reinstalled plugin). Missing snapshots never push: nothing is
 * known about the last sync, so writing would be a guess.
 */

import type { NormalizedProductField } from "../providers"

/** What should happen to one item field after comparing the three values. */
export type ChangeClass = "push" | "conflict" | "skip"

/** Resolution of one pending change, chosen by the merchant in the review. */
export type ChangeResolution = "pending" | "push" | "keep-woo"

/** One item field that may flow back to the store, in component state. */
export interface PendingChange {
  itemWooId: string
  field: NormalizedProductField
  wooValue: unknown
  framerValue: unknown
  resolution: ChangeResolution
}

/**
 * Compare two values where null and undefined both mean "no value". A null
 * snapshot value is a real value (a synced empty field), so only undefined
 * counts as missing.
 */
export function platformValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  const aMissing = a === null || a === undefined
  const bMissing = b === null || b === undefined
  return aMissing && bMissing
}

/**
 * Classify one item field. The snapshot decides everything: no snapshot
 * means skip, a matching Framer value means skip, a matching store value
 * means push, and any other combination means both sides moved.
 */
export function classifyChange(
  framerValue: unknown,
  wooValue: unknown,
  snapshotValue: unknown
): ChangeClass {
  if (snapshotValue === undefined) {
    return "skip"
  }
  if (platformValuesEqual(framerValue, snapshotValue)) {
    return "skip"
  }
  if (platformValuesEqual(wooValue, snapshotValue)) {
    return "push"
  }
  return "conflict"
}

/**
 * Wrap one classified field as a pending change. Conflicts start unresolved
 * ("pending"), everything else starts confirmed to push.
 */
export function toPendingChange(
  itemWooId: string,
  field: NormalizedProductField,
  wooValue: unknown,
  framerValue: unknown,
  changeClass: ChangeClass
): PendingChange {
  return {
    itemWooId,
    field,
    wooValue,
    framerValue,
    resolution: changeClass === "conflict" ? "pending" : "push",
  }
}

/**
 * The resolution that counts at push time. An unresolved conflict keeps the
 * store value, so closing the review without answering never writes.
 */
export function effectiveResolution(change: PendingChange): "push" | "keep-woo" {
  return change.resolution === "push" ? "push" : "keep-woo"
}

/** All confirmed changes split into the two groups the push and report need. */
export interface ResolvedChanges {
  pushes: PendingChange[]
  conflictsKept: PendingChange[]
}

/** Split changes by their effective resolution. */
export function applyResolutions(changes: PendingChange[]): ResolvedChanges {
  const pushes: PendingChange[] = []
  const conflictsKept: PendingChange[] = []
  for (const change of changes) {
    if (effectiveResolution(change) === "push") {
      pushes.push(change)
    } else {
      conflictsKept.push(change)
    }
  }
  return { pushes, conflictsKept }
}

/** All confirmed pushes for one product, in collection order. */
export interface ProductWriteGroup {
  itemWooId: string
  changes: PendingChange[]
}

/** Group pushes by product so each product becomes one write request. */
export function groupPushesByProduct(pushes: PendingChange[]): ProductWriteGroup[] {
  const groups = new Map<string, PendingChange[]>()
  for (const change of pushes) {
    const existing = groups.get(change.itemWooId)
    if (existing) {
      existing.push(change)
    } else {
      groups.set(change.itemWooId, [change])
    }
  }
  return Array.from(groups, function toGroup(entry) {
    return { itemWooId: entry[0], changes: entry[1] }
  })
}

/**
 * Platform fields compared and written as numbers. Prices round-trip through
 * String(number) on the wire, and JavaScript prints the shortest form that
 * converts back to the same number, so "21.99" never drifts.
 */
const NUMBER_PLATFORM_FIELDS: ReadonlySet<string> = new Set([
  "price",
  "regularPrice",
  "salePrice",
  "stockQuantity",
  "rating",
  "ratingCount",
])

/**
 * Convert one raw CMS field value into the platform value used for snapshot
 * comparison. Number fields accept numbers or numeric text ("21.99" maps to
 * 21.99); text fields stringify; missing values become null (numbers) or an
 * empty string (text).
 */
export function cmsValueToPlatform(
  raw: unknown,
  platformField: NormalizedProductField
): unknown {
  if (NUMBER_PLATFORM_FIELDS.has(platformField)) {
    if (raw === null || raw === undefined || raw === "") {
      return null
    }
    if (typeof raw === "number") {
      return raw
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (raw === null || raw === undefined) {
    return ""
  }
  return typeof raw === "string" ? raw : String(raw)
}

/** Singular labels for the review table. Plural labels live in the engine. */
export const WRITE_FIELD_LABELS: Record<NormalizedProductField, string> = {
  name: "Name",
  slug: "Slug",
  status: "Status",
  description: "Description",
  shortDescription: "Short description",
  sku: "SKU",
  price: "Price",
  regularPrice: "Regular price",
  salePrice: "Sale price",
  onSale: "On sale",
  stockStatus: "Stock status",
  stockQuantity: "Stock quantity",
  categories: "Categories",
  tags: "Tags",
  featuredImage: "Featured image",
  gallery: "Gallery",
  attributes: "Attributes",
  rating: "Rating",
  ratingCount: "Rating count",
  permalink: "Permalink",
  lastModified: "Last modified",
  variants: "Variants",
}

/** How long a value may get in the review table before it is cut off. */
const DISPLAY_VALUE_LIMIT = 80

/**
 * Render one value for the review table. Empty becomes "Empty" so an empty
 * field reads as a real choice, and long values are cut off with an ellipsis
 * so one long description cannot stretch the modal.
 */
export function formatPendingValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Empty"
  }
  let text: string
  if (typeof value === "string") {
    text = value
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value)
  } else {
    text = JSON.stringify(value)
  }
  if (text.length > DISPLAY_VALUE_LIMIT) {
    return `${text.slice(0, DISPLAY_VALUE_LIMIT - 1)}…`
  }
  return text
}
