/**
 * WooCommerce Product Mapper
 *
 * Translates raw WooCommerce REST JSON payloads into the normalized product
 * model from providers/types (spec 003, feature M4). The mapper is pure: no
 * network, no storage, no Framer SDK. Defensive parsing applies to every
 * field, so odd store data never crashes a sync run: missing or malformed
 * values fall back to empty strings, zero, or null instead of throwing.
 *
 * Conventions: function declarations only (INSTRUCTION.md section 5).
 */

import type {
  NormalizedProduct,
  NormalizedVariation,
  ProductAttribute,
  ProductCategory,
  ProductImage,
} from "../types"

// ============================================================================
// Status Unions
// ============================================================================

const PRODUCT_STATUSES = ["draft", "pending", "private", "publish"] as const
type ProductStatus = (typeof PRODUCT_STATUSES)[number]

const STOCK_STATUSES = ["instock", "outofstock", "onbackorder"] as const
type StockStatus = (typeof STOCK_STATUSES)[number]

function isProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value)
}

function isStockStatus(value: string): value is StockStatus {
  return (STOCK_STATUSES as readonly string[]).includes(value)
}

// ============================================================================
// Value Parsers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/**
 * Parse a Woo money string into a number. Empty and missing values map to
 * null because the normalized model treats them as absent.
 */
function toMoneyOrNull(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Parse a platform numeric value that must end up as a plain number. */
function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  const parsed = toMoneyOrNull(value)
  if (parsed !== null) {
    return parsed
  }
  return 0
}

/**
 * Stock quantity only exists when the store manages stock for this product.
 * Anything else maps to null so the CMS field can stay empty.
 */
function toStockQuantity(raw: Record<string, unknown>): number | null {
  return raw.manage_stock === true && typeof raw.stock_quantity === "number"
    ? raw.stock_quantity
    : null
}

// ============================================================================
// Images, Categories, Tags, Attributes
// ============================================================================

function toNormalizedImage(raw: unknown): ProductImage | null {
  if (!isRecord(raw)) {
    return null
  }
  const alt = toStringOrEmpty(raw.alt)
  const name = toStringOrEmpty(raw.name)
  return {
    id: String(raw.id ?? ""),
    url: toStringOrEmpty(raw.src),
    // Real store payloads often leave alt empty; the file name reads better
    // than nothing for accessibility.
    alt: alt !== "" ? alt : nameToAlt(name),
    position: toNumberOrZero(raw.position),
  }
}

/** "hoodie-with-zipper-2.jpg" becomes "hoodie with zipper 2". */
function nameToAlt(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
}

/** Type guard so the gallery narrows to images only, never null holes. */
function isPresentImage(image: ProductImage | null): image is ProductImage {
  return image !== null
}

function toCategories(raw: unknown): ProductCategory[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap(function toCategory(candidate) {
    if (!isRecord(candidate)) {
      return []
    }
    return [
      {
        id: String(candidate.id ?? ""),
        name: toStringOrEmpty(candidate.name),
        slug: toStringOrEmpty(candidate.slug),
      },
    ]
  })
}

function toTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap(function toTagName(candidate) {
    if (!isRecord(candidate)) {
      return []
    }
    return [toStringOrEmpty(candidate.name)]
  })
}

/** Product attributes carry an options array of every possible value. */
function toAttributes(raw: unknown): ProductAttribute[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap(function toAttribute(candidate) {
    if (!isRecord(candidate)) {
      return []
    }
    return [
      {
        id: String(candidate.id ?? ""),
        name: toStringOrEmpty(candidate.name),
        options: Array.isArray(candidate.options)
          ? candidate.options.filter(function isString(option) {
              return typeof option === "string"
            })
          : [],
        isVariation: candidate.variation === true,
      },
    ]
  })
}

/**
 * Variation attributes carry a single selected option string instead of the
 * full options array, and they always count as variation attributes.
 */
function toVariationAttributes(raw: unknown): ProductAttribute[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap(function toVariationAttribute(candidate) {
    if (!isRecord(candidate)) {
      return []
    }
    const option = toStringOrEmpty(candidate.option)
    return [
      {
        id: String(candidate.id ?? ""),
        name: toStringOrEmpty(candidate.name),
        options: option === "" ? [] : [option],
        isVariation: true,
      },
    ]
  })
}

function toIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter(function isPresent(candidate) {
      return candidate !== undefined && candidate !== null
    })
    .map(function toId(candidate) {
      return String(candidate)
    })
}

/**
 * Last modification time for the sync watermark. The client requests GMT
 * dates, so date_modified_gmt is preferred and date_modified is the
 * fallback for stores or fixtures that only send the local one.
 */
function toLastModified(raw: Record<string, unknown>): string {
  const gmtModified = toStringOrEmpty(raw.date_modified_gmt)
  if (gmtModified !== "") {
    return gmtModified
  }
  return toStringOrEmpty(raw.date_modified)
}

// ============================================================================
// mapWooProduct
// ============================================================================

/**
 * Map one raw WooCommerce product JSON payload to the normalized model.
 * Throws only when the payload is not an object at all; every field inside
 * is parsed defensively.
 */
export function mapWooProduct(raw: unknown): NormalizedProduct {
  if (!isRecord(raw)) {
    throw new Error("The raw product payload must be an object.")
  }

  const regularPrice = toNumberOrZero(raw.regular_price)
  const salePrice = toMoneyOrNull(raw.sale_price)
  const price = toMoneyOrNull(raw.price) ?? regularPrice
  const rawImages = Array.isArray(raw.images) ? raw.images : []
  const images = rawImages.map(toNormalizedImage).filter(isPresentImage)

  // WooCommerce orders images with the featured product image first, and
  // the REST payload carries no explicit position field. When any image
  // declares position 0 it wins; otherwise the first image is featured and
  // the rest become the gallery.
  const hasExplicitPositions = rawImages.some(function declaresPosition(candidate) {
    return isRecord(candidate) && typeof candidate.position === "number"
  })
  const featuredImage = hasExplicitPositions
    ? (images.find(function isFeatured(image) {
        return image.position === 0
      }) ?? null)
    : (images[0] ?? null)
  const featuredId = featuredImage?.id ?? null
  const gallery = images.filter(function isNotFeatured(image) {
    return featuredId === null || image.id !== featuredId
  })

  const rawStatus = toStringOrEmpty(raw.status)
  const status = isProductStatus(rawStatus) ? rawStatus : "draft"
  const rawStockStatus = toStringOrEmpty(raw.stock_status)
  const stockStatus = isStockStatus(rawStockStatus) ? rawStockStatus : "instock"

  return {
    id: String(raw.id ?? ""),
    name: toStringOrEmpty(raw.name),
    slug: toStringOrEmpty(raw.slug),
    permalink: toStringOrEmpty(raw.permalink),
    type: toStringOrEmpty(raw.type),
    status,
    description: toStringOrEmpty(raw.description),
    shortDescription: toStringOrEmpty(raw.short_description),
    sku: toStringOrEmpty(raw.sku),
    price,
    regularPrice,
    salePrice,
    onSale:
      raw.on_sale === true ||
      (salePrice !== null && salePrice < regularPrice),
    stockStatus,
    stockQuantity: toStockQuantity(raw),
    categories: toCategories(raw.categories),
    tags: toTags(raw.tags),
    featuredImage,
    gallery,
    attributes: toAttributes(raw.attributes),
    variantIds: toIdList(raw.variations),
    rating: toNumberOrZero(raw.average_rating),
    ratingCount: toNumberOrZero(raw.rating_count),
    lastModified: toLastModified(raw),
  }
}

// ============================================================================
// mapWooVariation
// ============================================================================

/**
 * Map one raw WooCommerce variation JSON payload to the normalized model.
 * The sync engine stores variations as JSON on the variants field.
 */
export function mapWooVariation(raw: unknown): NormalizedVariation {
  if (!isRecord(raw)) {
    throw new Error("The raw variation payload must be an object.")
  }

  const regularPrice = toNumberOrZero(raw.regular_price)
  const salePrice = toMoneyOrNull(raw.sale_price)
  const rawStockStatus = toStringOrEmpty(raw.stock_status)

  return {
    id: String(raw.id ?? ""),
    sku: toStringOrEmpty(raw.sku),
    price: toMoneyOrNull(raw.price) ?? regularPrice,
    regularPrice,
    salePrice,
    stockStatus: isStockStatus(rawStockStatus) ? rawStockStatus : "instock",
    stockQuantity: toStockQuantity(raw),
    attributes: toVariationAttributes(raw.attributes),
  }
}
