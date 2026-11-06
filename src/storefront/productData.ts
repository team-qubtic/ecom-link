/**
 * Storefront product loader: reads the synced product data of the active
 * connection so canvas inserts show real store content instead of blanks.
 *
 * Resolution follows the same chain the sync engine writes: active
 * connection, saved sync settings, target collection, then the mapped
 * fields per product. Every failure or gap degrades to placeholder content
 * instead of blocking the insert, so the layout stays demonstrable in a
 * project without a synced store.
 */
import { getActiveConnection } from "../storage/connections"
import { sdk } from "../storage/internal"
import type { SdkItemLike } from "../storage/internal"
import { getSyncSettings } from "../storage/settings"
import type { SyncSettings } from "../storage/settings"
import { htmlToText } from "../sync/engine"

/**
 * How many products one listing insert lays out at most, mirroring the
 * safety cap philosophy of the sync engine: keep the canvas responsive.
 */
export const LISTING_PRODUCT_CAP = 12

/** One display-ready product for the storefront builders. */
export interface StorefrontProduct {
  /** Store product id; placeholder ids start with "placeholder-". */
  id: string
  name: string
  /** The price the customer pays, formatted for display. */
  price: string
  /** The undiscounted price, shown as a "was" value on sale products. */
  regularPrice: string
  onSale: boolean
  /** Raw platform stock status; unknown values render as sold out. */
  stockStatus: string
  /** First category name, shown above the name on cards; empty when none. */
  category: string
  /** Average rating, 0 to 5; null when the store tracks none. */
  rating: number | null
  /** Review count shown beside the stars; null when unknown. */
  ratingCount: number | null
  permalink: string
  /** Store description converted to plain text. */
  description: string
  /** Featured image URL; empty when the store had none. */
  imageUrl: string
  /** Gallery image URLs, featured image excluded, capped for the page. */
  galleryUrls: string[]
}

/** Everything an insert needs, plus whether the content is real. */
export interface StorefrontData {
  products: StorefrontProduct[]
  /** True when the content is placeholder, not the synced collection. */
  placeholder: boolean
  /** Name of the synced collection when real data was used. */
  collectionName: string | null
}

/** Gallery image URLs carried per insert for the product page thumbs. */
const GALLERY_THUMB_CAP = 3

/**
 * Read the products of the active connection's synced collection. Returns
 * placeholder data (with `placeholder: true`) when no store is connected,
 * no sync settings exist, the collection is gone, or nothing usable is
 * synced yet.
 */
export async function loadStorefrontProducts(
  cap: number = LISTING_PRODUCT_CAP
): Promise<StorefrontData> {
  try {
    const connection = await getActiveConnection()
    if (!connection) {
      return placeholderData()
    }
    const settings = await getSyncSettings(connection.id)
    if (!settings) {
      return placeholderData()
    }
    const collections = await sdk.getCollections()
    const collection = Array.isArray(collections)
      ? collections.find(function byId(candidate) {
          return candidate?.id === settings.targetCollectionId
        })
      : undefined
    if (!collection) {
      return placeholderData()
    }
    const products = await readProducts(collection, settings, cap)
    if (products.length === 0) {
      return placeholderData()
    }
    return {
      products,
      placeholder: false,
      collectionName: typeof collection.name === "string" ? collection.name : null,
    }
  } catch {
    // Data problems never block an insert; placeholders keep it working.
    return placeholderData()
  }
}

/** Read, map, and cap the collection items into storefront products. */
async function readProducts(
  collection: {
    name?: string
    getItems(): Promise<SdkItemLike[]>
  },
  settings: SyncSettings,
  cap: number
): Promise<StorefrontProduct[]> {
  const items = await collection.getItems()
  if (!Array.isArray(items)) {
    return []
  }
  const fieldIdByPlatform = new Map<string, string>()
  for (const row of settings.mapping) {
    if (row.enabled && row.cmsFieldId !== "") {
      fieldIdByPlatform.set(row.platformField, row.cmsFieldId)
    }
  }
  const products: StorefrontProduct[] = []
  for (const item of items) {
    const product = toStorefrontProduct(item, fieldIdByPlatform)
    if (product !== null) {
      products.push(product)
    }
    if (products.length >= cap) {
      break
    }
  }
  return products
}

/**
 * Map one collection item into a display-ready product, or null when the
 * item holds neither a name nor a price (manual items that were never
 * synced from a store).
 */
function toStorefrontProduct(
  item: SdkItemLike,
  fieldIdByPlatform: Map<string, string>
): StorefrontProduct | null {
  const name = readText(item, fieldIdByPlatform.get("name"))
  const priceRaw = readText(item, fieldIdByPlatform.get("price"))
  if (name === "" && priceRaw === "") {
    return null
  }
  const regularRaw = readText(item, fieldIdByPlatform.get("regularPrice"))
  const saleRaw = readText(item, fieldIdByPlatform.get("salePrice"))
  const regularPrice = displayValue(regularRaw !== "" ? regularRaw : priceRaw)
  const onSale = saleRaw !== ""
  return {
    id: item.id,
    name: name === "" ? "Untitled product" : name,
    price: onSale
      ? displayValue(saleRaw)
      : displayValue(priceRaw !== "" ? priceRaw : regularPrice),
    regularPrice,
    onSale,
    stockStatus: readText(item, fieldIdByPlatform.get("stockStatus")),
    category: categoryValue(item, fieldIdByPlatform.get("categories")),
    rating: numberValue(readText(item, fieldIdByPlatform.get("rating"))),
    ratingCount: numberValue(readText(item, fieldIdByPlatform.get("ratingCount"))),
    permalink: readText(item, fieldIdByPlatform.get("permalink")),
    description: htmlToText(readText(item, fieldIdByPlatform.get("description"))),
    imageUrl: imageUrlValue(item, fieldIdByPlatform.get("featuredImage")),
    galleryUrls: galleryValue(item, fieldIdByPlatform.get("gallery")).slice(0, GALLERY_THUMB_CAP),
  }
}

/** Read one mapped field as a trimmed string; numbers pass through. */
function readText(item: SdkItemLike, fieldId: string | undefined): string {
  if (fieldId === undefined) {
    return ""
  }
  const value = item.fieldData?.[fieldId]?.value
  if (typeof value === "string") {
    return value.trim()
  }
  // Number-typed CMS fields (price, rating, stock quantity) hold raw
  // numbers; they display as strings instead of being dropped.
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return ""
}

/**
 * Format one raw price for display: numbers render normalized, and any
 * other non-empty value (formatted strings like "1,299.00") passes
 * through so prices never silently disappear from the inserts.
 */
function displayValue(raw: string): string {
  if (raw === "") {
    return ""
  }
  const money = moneyValue(raw)
  return money !== "" ? money : raw
}

/** Normalize one numeric price string; anything else yields an empty string. */
function moneyValue(raw: string): string {
  return raw !== "" && Number.isFinite(Number(raw)) ? String(Number(raw)) : ""
}

/** Parse one numeric field value, or null when it is not a number. */
function numberValue(raw: string): number | null {
  if (raw === "" || !Number.isFinite(Number(raw))) {
    return null
  }
  return Number(raw)
}

/** Read one mapped image field as a URL, whatever entry shape arrived. */
function imageUrlValue(item: SdkItemLike, fieldId: string | undefined): string {
  if (fieldId === undefined) {
    return ""
  }
  const value = item.fieldData?.[fieldId]?.value
  if (typeof value === "string") {
    return value.trim()
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const url = (value as Record<string, unknown>).url
    return typeof url === "string" ? url : ""
  }
  return ""
}

/** Read one mapped gallery field as URL strings, array or JSON encoded. */
function galleryValue(item: SdkItemLike, fieldId: string | undefined): string[] {
  if (fieldId === undefined) {
    return []
  }
  const value = item.fieldData?.[fieldId]?.value
  if (Array.isArray(value)) {
    return value.filter(function isUrl(entry): entry is string {
      return typeof entry === "string"
    })
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter(function isUrl(entry): entry is string {
          return typeof entry === "string"
        })
      }
    } catch {
      // Not JSON; treat as no gallery.
    }
  }
  return []
}

/**
 * Read the first category name from one mapped categories field. The sync
 * engine stores category objects ({ name, ... }) as an array or JSON, so
 * both shapes are accepted; anything else yields an empty string.
 */
function categoryValue(item: SdkItemLike, fieldId: string | undefined): string {
  if (fieldId === undefined) {
    return ""
  }
  const value = item.fieldData?.[fieldId]?.value
  let entries: unknown[] = []
  if (Array.isArray(value)) {
    entries = value
  } else if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) {
        entries = parsed
      }
    } catch {
      // Not JSON; treat as no categories.
    }
  }
  for (const entry of entries) {
    if (entry !== null && typeof entry === "object") {
      const name = (entry as Record<string, unknown>).name
      if (typeof name === "string" && name.trim() !== "") {
        return name.trim()
      }
    }
    if (typeof entry === "string" && entry.trim() !== "") {
      return entry.trim()
    }
  }
  return ""
}

/** Demo content used when no synced products are available. */
export function placeholderData(): StorefrontData {
  const base = {
    price: "",
    regularPrice: "",
    onSale: false,
    stockStatus: "instock",
    category: "Featured",
    rating: 4.5,
    ratingCount: 121,
    permalink: "",
    description:
      "This is placeholder content. Sync a store, then insert again to see your real products here.",
    imageUrl: "",
    galleryUrls: [],
  }
  const products: StorefrontProduct[] = [
    {
      ...base,
      id: "placeholder-1",
      name: "Sample product",
      price: "29",
      regularPrice: "29",
    },
    {
      ...base,
      id: "placeholder-2",
      name: "Sale product",
      price: "19",
      regularPrice: "39",
      onSale: true,
      category: "Sale",
    },
    {
      ...base,
      id: "placeholder-3",
      name: "Another product",
      price: "49",
      regularPrice: "49",
      category: "New in",
    },
    {
      ...base,
      id: "placeholder-4",
      name: "Sold out product",
      price: "59",
      regularPrice: "59",
      stockStatus: "outofstock",
      rating: null,
      ratingCount: null,
    },
    {
      ...base,
      id: "placeholder-5",
      name: "New arrival",
      price: "89",
      regularPrice: "89",
      category: "New in",
    },
    {
      ...base,
      id: "placeholder-6",
      name: "Bestseller",
      price: "24",
      regularPrice: "24",
      category: "Featured",
    },
  ]
  return { products, placeholder: true, collectionName: null }
}
