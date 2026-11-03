/**
 * Identity - matching CMS items to platform products by woo_id
 *
 * A synced CMS item always carries its platform product id in the woo_id
 * field. The identity index built here lets the engine update items in
 * place instead of duplicating them on every run, which is what makes
 * repeated and resumed syncs idempotent.
 */

import type { SdkItemLike } from "../storage/internal"

/** The CMS field name the engine keys product identity on. */
export const WOO_ID_FIELD_NAME = "woo_id"

/** One CMS item indexed by its platform product id. */
export interface IdentityEntry {
  /** CMS item id, used to update the item in place. */
  itemId: string
  /** Id keyed field data of the item, normalized for writes and diffs. */
  fieldData: Record<string, { type: string; value: unknown }>
}

/**
 * Normalize raw SDK field data into full entries so updates and deep
 * compares always work with the same shape. Items created by this plugin
 * already store explicit types; hand made items may not.
 */
function normalizeEntries(
  fieldData: Record<string, { type?: string; value?: unknown }>
): Record<string, { type: string; value: unknown }> {
  const normalized: Record<string, { type: string; value: unknown }> = {}
  for (const key of Object.keys(fieldData)) {
    const entry = fieldData[key]
    normalized[key] = {
      type: entry?.type ?? "string",
      value: entry?.value ?? "",
    }
  }
  return normalized
}

/**
 * Build a woo_id to item index. Items without a woo_id value are skipped,
 * and when two items somehow share a woo_id the first one wins so a run can
 * never write the same product into two places.
 */
export function buildIdentityIndex(
  items: SdkItemLike[],
  wooIdFieldId: string
): Map<string, IdentityEntry> {
  const index = new Map<string, IdentityEntry>()
  for (const item of items) {
    const rawEntry = item.fieldData?.[wooIdFieldId]
    const wooId = rawEntry?.value
    if (typeof wooId !== "string" || wooId === "") {
      continue
    }
    if (!index.has(wooId)) {
      index.set(wooId, {
        itemId: item.id,
        fieldData: normalizeEntries(item.fieldData ?? {}),
      })
    }
  }
  return index
}

/** Deterministic slug for a created CMS item: woo- followed by product id. */
export function slugForProduct(wooId: string): string {
  return `woo-${wooId}`
}
