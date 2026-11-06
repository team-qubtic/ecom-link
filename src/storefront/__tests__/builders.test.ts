/**
 * Storefront builder tests: the pure spec trees the canvas bridge
 * materializes. Sale pricing, the Framefic-style chips and pills, stock
 * tone mapping, link-outs, grid layout, and the placeholder content all
 * get asserted here without the SDK.
 */
import { describe, expect, it, vi } from "vitest"

// The product loader chains into the Framer bridge; stub the SDK so the
// import graph resolves outside the canvas.
vi.mock("@framer/plugin", () => ({ framer: {} }))

import {
  buildAddToCart,
  buildFilterableListing,
  buildPriceBlock,
  buildProductCard,
  buildProductListing,
  buildProductPage,
  buildStockBadge,
  rowsHeightOf,
  wrapSpecs,
} from "../builders"
import { placeholderData, LISTING_PRODUCT_CAP } from "../productData"
import type { StorefrontProduct } from "../productData"
import { STOREFRONT_THEME } from "../theme"
import type { FrameSpec, NodeSpec, TextSpec } from "../types"

function sampleProduct(overrides: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    id: "woo-1",
    name: "Trail jacket",
    price: "79",
    regularPrice: "79",
    onSale: false,
    stockStatus: "instock",
    category: "Outerwear",
    rating: 4.6,
    ratingCount: 121,
    permalink: "https://store.example.com/product/trail-jacket",
    description: "A warm jacket.",
    imageUrl: "https://cdn.example.com/jacket.jpg",
    galleryUrls: [],
    ...overrides,
  }
}

function textsOf(specs: NodeSpec[]): TextSpec[] {
  return specs.filter(function isText(spec): spec is TextSpec {
    return spec.kind === "text"
  })
}

function frameByName(specs: NodeSpec[], name: string): FrameSpec | undefined {
  return specs.find(function isNamed(spec) {
    return spec.kind === "frame" && spec.name === name
  }) as FrameSpec | undefined
}

/** The horizontal card rows of one listing spec. */
function listingRows(listing: FrameSpec): FrameSpec[] {
  return (listing.children ?? []).filter(function isRow(spec): spec is FrameSpec {
    return spec.kind === "frame" && spec.name.startsWith("Listing row")
  })
}

/**
 * Structural overflow guard: no child frame may be wider than its
 * parent's content area (width minus padding), and no horizontal row's
 * children may exceed it in sum. This is the bug class that produced the
 * collapsed listing layouts in the editor.
 */
function overflowIssues(spec: FrameSpec): string[] {
  const issues: string[] = []
  if (typeof spec.width !== "number") {
    return issues
  }
  const padding = spec.stack?.padding ?? spec.grid?.padding ?? 0
  const contentWidth = spec.width - padding * 2
  const sizedChildren = (spec.children ?? []).filter(function sized(
    child,
  ): child is FrameSpec {
    return child.kind === "frame" && typeof child.width === "number"
  })
  if (spec.stack?.direction === "horizontal" && sizedChildren.length > 0) {
    const gap = spec.stack.gap ?? 0
    const total =
      sizedChildren.reduce(function sum(total, child) {
        return total + (child.width as number)
      }, 0) +
      gap * (sizedChildren.length - 1)
    if (total > contentWidth) {
      issues.push(
        `${spec.name}: children span ${total}px over ${contentWidth}px content width`
      )
    }
  } else {
    for (const child of sizedChildren) {
      if ((child.width as number) > contentWidth) {
        issues.push(
          `${child.name} (${child.width}px) overflows ${spec.name} (content ${contentWidth}px)`
        )
      }
    }
  }
  for (const child of spec.children ?? []) {
    if (child.kind === "frame") {
      issues.push(...overflowIssues(child))
    }
  }
  return issues
}

describe("structure", () => {
  it("has no overflowing children in any builder output", () => {
    const data = placeholderData()
    const product = data.products[0]
    const trees: FrameSpec[] = [
      buildProductCard(product),
      buildProductListing(data.products),
      buildFilterableListing(data.products),
      buildProductPage(product),
      wrapSpecs("Price", buildPriceBlock(product)),
      buildStockBadge(product),
      buildAddToCart(product),
    ]
    for (const tree of trees) {
      expect(overflowIssues(tree)).toEqual([])
    }
  })
})

describe("buildPriceBlock", () => {
  it("renders a single price text for a regular product", () => {
    const parts = buildPriceBlock(sampleProduct())
    const texts = textsOf(parts)
    expect(parts).toHaveLength(1)
    expect(texts[0]?.text).toBe("79")
    expect(texts[0]?.role).toBe("price")
  })

  it("adds a lime sale chip and a was price for a discounted product", () => {
    const parts = buildPriceBlock(
      sampleProduct({ price: "49", regularPrice: "79", onSale: true })
    )
    const chip = frameByName(parts, "Sale chip")
    const texts = textsOf(parts)
    expect(chip?.fill).toBe(STOREFRONT_THEME.lime)
    // Fixed pixel sizing; the runtime renders this reliably.
    expect(chip?.width).toBe(STOREFRONT_THEME.chipWidth)
    expect(chip?.height).toBe(STOREFRONT_THEME.chipHeight)
    expect(texts.some(function isWas(text) {
      return text.text === "Was 79"
    })).toBe(true)
  })

  it("renders nothing when the price value is empty", () => {
    const parts = buildPriceBlock(sampleProduct({ price: "", regularPrice: "" }))
    expect(parts).toHaveLength(0)
  })

  it("skips the was price when the sale equals the regular price", () => {
    const parts = buildPriceBlock(
      sampleProduct({ price: "79", regularPrice: "79", onSale: true })
    )
    expect(parts).toHaveLength(1)
  })
})

describe("buildStockBadge", () => {
  it("shows a gray pill whose dot carries the in stock tone", () => {
    const badge = buildStockBadge(sampleProduct({ stockStatus: "instock" }))
    expect(badge.fill).toBe(STOREFRONT_THEME.surfaceDim)
    expect(badge.border).toBeUndefined()
    const dot = frameByName(badge.children ?? [], "Stock dot")
    expect(dot?.fill).toBe(STOREFRONT_THEME.inStock)
    const label = textsOf(badge.children ?? [])[0]
    expect(label?.text).toBe("In stock")
  })

  it("maps onbackorder to the backorder tone", () => {
    const badge = buildStockBadge(sampleProduct({ stockStatus: "onbackorder" }))
    const dot = frameByName(badge.children ?? [], "Stock dot")
    expect(dot?.fill).toBe(STOREFRONT_THEME.backorder)
    const label = textsOf(badge.children ?? [])[0]
    expect(label?.text).toBe("Backorder")
  })

  it("maps unknown and outofstock statuses to sold out", () => {
    for (const status of ["outofstock", "", "weird"]) {
      const badge = buildStockBadge(sampleProduct({ stockStatus: status }))
      const dot = frameByName(badge.children ?? [], "Stock dot")
      expect(dot?.fill).toBe(STOREFRONT_THEME.outOfStock)
      const label = textsOf(badge.children ?? [])[0]
      expect(label?.text).toBe("Sold out")
    }
  })
})

describe("buildAddToCart", () => {
  it("links the button to the product permalink", () => {
    const button = buildAddToCart(sampleProduct())
    expect(button.link).toBe("https://store.example.com/product/trail-jacket")
    expect(button.fill).toBe(STOREFRONT_THEME.accent)
    const label = textsOf(button.children ?? [])[0]
    expect(label?.text).toBe("Add to cart")
    expect(label?.role).toBe("button")
  })
})

describe("buildProductCard", () => {
  it("keeps the card chrome: white body, rounded corners, fixed height", () => {
    const card = buildProductCard(sampleProduct())
    expect(card.fill).toBe(STOREFRONT_THEME.surface)
    expect(card.border).toBeUndefined()
    expect(card.gradient).toBeUndefined()
    expect(card.radius).toBe(STOREFRONT_THEME.radius)
    expect(card.height).toBe(STOREFRONT_THEME.cardHeight)
  })

  it("gives the image well a neutral fill, fixed size, and no overlays", () => {
    const card = buildProductCard(
      sampleProduct({ onSale: true, price: "49", regularPrice: "79" })
    )
    const image = frameByName(card.children ?? [], "Product image")
    expect(image?.imageUrl).toBe("https://cdn.example.com/jacket.jpg")
    expect(image?.fill).toBe(STOREFRONT_THEME.surfaceDim)
    expect(image?.width).toBe(STOREFRONT_THEME.cardImageSize)
    expect(image?.children).toHaveLength(0)
  })

  it("shows the muted availability line from the stock status", () => {
    const card = buildProductCard(sampleProduct({ stockStatus: "instock" }))
    const body = frameByName(card.children ?? [], "Card body")
    const availability = textsOf(body?.children ?? []).find(function isAvailability(text) {
      return text.name === "Availability"
    })
    expect(availability?.text).toBe("In stock")
  })

  it("renders the orange star rating with the review count", () => {
    const card = buildProductCard(sampleProduct({ rating: 4.6, ratingCount: 121 }))
    const body = frameByName(card.children ?? [], "Card body")
    const ratingRow = frameByName(body?.children ?? [], "Rating row")
    const texts = textsOf(ratingRow?.children ?? [])
    expect(texts[0]?.role).toBe("stars")
    expect(texts[0]?.text).toBe("★★★★★")
    expect(texts[1]?.text).toBe("(121)")
  })

  it("rounds ratings and drops the count when unknown", () => {
    const card = buildProductCard(sampleProduct({ rating: 3.4, ratingCount: null }))
    const body = frameByName(card.children ?? [], "Card body")
    const ratingRow = frameByName(body?.children ?? [], "Rating row")
    const texts = textsOf(ratingRow?.children ?? [])
    expect(texts[0]?.text).toBe("★★★☆☆")
    expect(texts).toHaveLength(1)
  })

  it("omits the rating row when the product has no rating", () => {
    const card = buildProductCard(sampleProduct({ rating: null, ratingCount: null }))
    const body = frameByName(card.children ?? [], "Card body")
    expect(frameByName(body?.children ?? [], "Rating row")).toBeUndefined()
  })

  it("includes the truncated short description in the card body", () => {
    const card = buildProductCard(
      sampleProduct({
        description:
          "A warm jacket with many pockets and a hood and zippers and drawcords and a fleece lining that keeps you warm in every season.",
      })
    )
    const body = frameByName(card.children ?? [], "Card body")
    const description = textsOf(body?.children ?? []).find(function isDescription(text) {
      return text.name === "Short description"
    })
    expect(description?.text.startsWith("A warm jacket")).toBe(true)
    expect(description?.text.endsWith("…")).toBe(true)
    expect((description?.text.length ?? 0)).toBeLessThanOrEqual(81)
  })

  it("buttons the card with a full width add to cart", () => {
    const card = buildProductCard(sampleProduct())
    const body = frameByName(card.children ?? [], "Card body")
    const button = frameByName(body?.children ?? [], "Add to cart")
    expect(button?.width).toBe(STOREFRONT_THEME.cardWidth - STOREFRONT_THEME.cardPadding * 2)
    expect(button?.link).toBe("https://store.example.com/product/trail-jacket")
  })

  it("renders the sale chip inline in the price row", () => {
    const card = buildProductCard(
      sampleProduct({ onSale: true, price: "49", regularPrice: "79" })
    )
    const body = frameByName(card.children ?? [], "Card body")
    const priceRow = frameByName(body?.children ?? [], "Price row")
    expect(frameByName(priceRow?.children ?? [], "Sale chip")).toBeDefined()
  })

  it("keeps the name and price row in the card body", () => {
    const card = buildProductCard(sampleProduct())
    const body = frameByName(card.children ?? [], "Card body")
    const name = textsOf(body?.children ?? []).find(function isName(text) {
      return text.name === "Product name"
    })
    expect(name?.text).toBe("Trail jacket")
    const priceRow = frameByName(body?.children ?? [], "Price row")
    expect(priceRow?.children).toHaveLength(1)
  })

  it("omits the price row when no price is available", () => {
    const card = buildProductCard(sampleProduct({ price: "", regularPrice: "" }))
    const body = frameByName(card.children ?? [], "Card body")
    expect(frameByName(body?.children ?? [], "Price row")).toBeUndefined()
  })
})

describe("buildProductListing", () => {
  it("lays the cards out in rows under an eyebrow and heavy title", () => {
    const data = placeholderData()
    const listing = buildProductListing(data.products)
    expect(listing.width).toBe(STOREFRONT_THEME.pageWidth)
    // Light gray backdrop so the white cards read against it.
    expect(listing.fill).toBe(STOREFRONT_THEME.surfaceDim)
    const header = frameByName(listing.children ?? [], "Listing header")
    const headerTexts = textsOf(header?.children ?? [])
    expect(headerTexts[0]?.role).toBe("eyebrow")
    expect(headerTexts[1]?.text).toBe("Products")
    const rows = listingRows(listing)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.stack?.direction).toBe("horizontal")
      expect((row.children ?? []).length).toBeLessThanOrEqual(STOREFRONT_THEME.gridColumns)
    }
    const cardCount = rows.reduce(function total(count, row) {
      return count + (row.children ?? []).length
    }, 0)
    expect(cardCount).toBe(data.products.length)
  })

  it("splits products into rows of three", () => {
    const listing = buildProductListing(
      [1, 2, 3, 4, 5, 6, 7].map(function toProduct(n) {
        return sampleProduct({ id: `p-${n}` })
      })
    )
    const rows = listingRows(listing)
    expect(rows).toHaveLength(3)
    expect(rows[0]?.children).toHaveLength(3)
    expect(rows[1]?.children).toHaveLength(3)
    expect(rows[2]?.children).toHaveLength(1)
  })

  it("sizes rows to the content width inside the listing padding", () => {
    const listing = buildProductListing([sampleProduct()])
    const rows = listingRows(listing)
    expect(rows[0]?.width).toBe(STOREFRONT_THEME.pageWidth - 80)
  })
})

describe("buildFilterableListing", () => {
  const products = [
    sampleProduct({ id: "a", category: "Hoodies" }),
    sampleProduct({ id: "b", category: "Hoodies" }),
    sampleProduct({ id: "c", category: "T-shirts" }),
    sampleProduct({ id: "d", category: "" }),
  ]

  function sidebarOf(listing: FrameSpec): FrameSpec {
    const content = frameByName(listing.children ?? [], "Listing content")
    return frameByName(content?.children ?? [], "Filter sidebar") as FrameSpec
  }

  /** Texts inside one sidebar section's filter rows. */
  function rowTexts(section: FrameSpec): TextSpec[] {
    return (section.children ?? []).flatMap(function fromRow(spec) {
      return spec.kind === "frame" ? textsOf(spec.children ?? []) : []
    })
  }

  it("renders the toolbar with the product count and sort pill", () => {
    const listing = buildFilterableListing(products)
    const toolbar = frameByName(listing.children ?? [], "Results toolbar")
    const texts = textsOf(toolbar?.children ?? [])
    expect(texts.some(function isCount(text) {
      return text.text === "Showing 4 products"
    })).toBe(true)
    expect(frameByName(toolbar?.children ?? [], "Sort pill")).toBeDefined()
  })

  it("aggregates real category counts into the sidebar, most used first", () => {
    const listing = buildFilterableListing(products)
    const sidebar = sidebarOf(listing)
    const section = frameByName(sidebar.children ?? [], "Filter section Category")
    const labels = rowTexts(section ?? { kind: "frame", name: "x", children: [] })
    const hoodieRow = labels.findIndex(function isHoodies(text) {
      return text.text === "Hoodies"
    })
    const teeRow = labels.findIndex(function isTees(text) {
      return text.text === "T-shirts"
    })
    expect(hoodieRow).toBeGreaterThanOrEqual(0)
    expect(teeRow).toBeGreaterThan(hoodieRow)
    expect(labels.some(function isCount(text) {
      return text.text === "(2)"
    })).toBe(true)
  })

  it("offers price tiers and rating rows", () => {
    const listing = buildFilterableListing(products)
    const sidebar = sidebarOf(listing)
    const price = frameByName(sidebar.children ?? [], "Filter section Price")
    expect(rowTexts(price ?? { kind: "frame", name: "x", children: [] }).some(function isTier(text) {
      return text.text === "50 to 100"
    })).toBe(true)
    const rating = frameByName(sidebar.children ?? [], "Filter section Rating")
    expect(rowTexts(rating ?? { kind: "frame", name: "x", children: [] }).some(function isStars(text) {
      return text.text.startsWith("★★★★★")
    })).toBe(true)
  })

  it("marks the first checkbox of each section as checked", () => {
    const listing = buildFilterableListing(products)
    const sidebar = sidebarOf(listing)
    const section = frameByName(sidebar.children ?? [], "Filter section Category")
    const firstRow = frameByName(section?.children ?? [], "Filter row")
    const box = frameByName(firstRow?.children ?? [], "Checkbox")
    expect(box?.fill).toBe(STOREFRONT_THEME.lime)
    expect(textsOf(box?.children ?? [])[0]?.text).toBe("✓")
  })

  it("lays compact cards in a grid column beside the sidebar", () => {
    const listing = buildFilterableListing(
      [1, 2, 3, 4].map(function toProduct(n) {
        return sampleProduct({ id: `p-${n}`, category: "Gear" })
      })
    )
    const content = frameByName(listing.children ?? [], "Listing content")
    const grid = frameByName(content?.children ?? [], "Product grid")
    // The grid is a vertical column; rows nest inside it beside the sidebar.
    expect(grid?.stack?.direction).toBe("vertical")
    const rows = (grid?.children ?? []).filter(function isRow(spec): spec is FrameSpec {
      return spec.kind === "frame" && spec.name.startsWith("Listing row")
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]?.children).toHaveLength(3)
    const card = rows[0]?.children?.[0] as FrameSpec
    expect(card.width).toBe(STOREFRONT_THEME.compactCardWidth)
    expect(card.height).toBe(STOREFRONT_THEME.compactCardHeight)
    expect(rows[0]?.width).toBe(
      STOREFRONT_THEME.pageWidth - 64 - STOREFRONT_THEME.sidebarWidth - 24
    )
    // Fixed heights down the chain so the runtime cannot collapse rows.
    expect(rows[0]?.height).toBe(STOREFRONT_THEME.compactCardHeight)
    expect(grid?.height).toBe(
      rowsHeightOf(2, STOREFRONT_THEME.compactCardHeight, STOREFRONT_THEME.gridGap)
    )
    expect(listing.height).toBe(32 + 36 + 24 + (grid?.height as number) + 32)
  })
})

describe("buildProductPage", () => {
  it("composes gallery and info columns with a linked buy button", () => {
    const page = buildProductPage(
      sampleProduct({ galleryUrls: ["https://cdn.example.com/2.jpg"] })
    )
    const gallery = page.children?.[0] as FrameSpec
    const mainImage = gallery.children?.[0] as FrameSpec
    expect(mainImage.imageUrl).toBe("https://cdn.example.com/jacket.jpg")
    const info = page.children?.[1] as FrameSpec
    const title = textsOf(info.children ?? []).find(function isTitle(text) {
      return text.role === "title"
    })
    expect(title?.text).toBe("Trail jacket")
    const eyebrow = textsOf(info.children ?? []).find(function isEyebrow(text) {
      return text.role === "eyebrow"
    })
    expect(eyebrow?.text).toBe("Outerwear")
    const button = frameByName(info.children ?? [], "Add to cart")
    expect(button?.link).toBe("https://store.example.com/product/trail-jacket")
  })

  it("falls back to a generic eyebrow without a category", () => {
    const page = buildProductPage(sampleProduct({ category: "" }))
    const info = page.children?.[1] as FrameSpec
    const eyebrow = textsOf(info.children ?? []).find(function isEyebrow(text) {
      return text.role === "eyebrow"
    })
    expect(eyebrow?.text).toBe("Product")
  })

  it("skips gallery thumbs when no gallery urls exist", () => {
    const page = buildProductPage(sampleProduct({ galleryUrls: [] }))
    const gallery = page.children?.[0] as FrameSpec
    expect(gallery.children).toHaveLength(1)
  })

  it("renders one thumb per given gallery url", () => {
    const page = buildProductPage(
      sampleProduct({
        galleryUrls: ["1", "2", "3", "4", "5"].map(function url(n) {
          return `https://cdn.example.com/${n}.jpg`
        }),
      })
    )
    const gallery = page.children?.[0] as FrameSpec
    const thumbs = gallery.children?.[1] as FrameSpec
    expect(thumbs.children).toHaveLength(5)
  })
})

describe("placeholderData", () => {
  it("offers demo content marked as placeholder", () => {
    const data = placeholderData()
    expect(data.placeholder).toBe(true)
    expect(data.collectionName).toBeNull()
    expect(data.products.length).toBeGreaterThan(1)
    for (const product of data.products) {
      expect(product.id.startsWith("placeholder-")).toBe(true)
    }
  })

  it("includes a sale product and a sold out product", () => {
    const data = placeholderData()
    expect(data.products.some(function isSale(product) {
      return product.onSale
    })).toBe(true)
    expect(data.products.some(function isSoldOut(product) {
      return product.stockStatus === "outofstock"
    })).toBe(true)
  })

  it("caps listing inserts at twelve products", () => {
    expect(LISTING_PRODUCT_CAP).toBe(12)
  })
})
