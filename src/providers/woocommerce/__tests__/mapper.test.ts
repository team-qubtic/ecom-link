/**
 * Tests for the WooCommerce mapper: normalized field mapping, money and
 * stock parsing, defensive fallbacks, and variation attribute flattening
 * (spec 003, feature M4).
 */

import { describe, expect, it } from "vitest"
import { mapWooProduct, mapWooVariation } from "../mapper"

function rawProduct(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 101,
    name: "Canvas Tote",
    slug: "canvas-tote",
    permalink: "https://store.example.com/product/canvas-tote/",
    type: "simple",
    status: "publish",
    description: "<p>A roomy tote.</p>",
    short_description: "<p>Roomy.</p>",
    sku: "CT-001",
    price: "16.99",
    regular_price: "21.99",
    sale_price: "16.99",
    on_sale: true,
    stock_status: "instock",
    manage_stock: true,
    stock_quantity: 14,
    categories: [{ id: 9, name: "Bags", slug: "bags" }],
    tags: [{ id: 31, name: "canvas", slug: "canvas" }],
    images: [
      {
        id: 501,
        src: "https://store.example.com/tote.jpg",
        alt: "Front",
        position: 0,
      },
      {
        id: 502,
        src: "https://store.example.com/tote-side.jpg",
        alt: "Side",
        position: 1,
      },
      {
        id: 503,
        src: "https://store.example.com/tote-back.jpg",
        alt: "Back",
        position: 2,
      },
    ],
    attributes: [
      { id: 1, name: "Color", options: ["Natural", "Black"], variation: false },
    ],
    variations: [201, 202],
    average_rating: "4.5",
    rating_count: 27,
    date_modified: "2026-10-01T12:30:00",
    date_modified_gmt: "2026-10-01T10:30:00",
    ...overrides,
  }
}

function rawVariation(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 201,
    sku: "CT-001-NAT",
    price: "16.99",
    regular_price: "21.99",
    sale_price: "",
    stock_status: "instock",
    manage_stock: false,
    stock_quantity: null,
    attributes: [{ id: 1, name: "Color", option: "Natural" }],
    ...overrides,
  }
}

describe("mapWooProduct", () => {
  it("throws for payloads that are not objects", () => {
    for (const candidate of [null, undefined, "tote", 42, true]) {
      expect(() => mapWooProduct(candidate)).toThrow(
        "The raw product payload must be an object."
      )
    }
  })

  it("maps the core catalog fields onto the normalized model", () => {
    const product = mapWooProduct(rawProduct())
    expect(product.id).toBe("101")
    expect(product.name).toBe("Canvas Tote")
    expect(product.slug).toBe("canvas-tote")
    expect(product.sku).toBe("CT-001")
    expect(product.type).toBe("simple")
    expect(product.status).toBe("publish")
    expect(product.stockStatus).toBe("instock")
    expect(product.stockQuantity).toBe(14)
    expect(product.variantIds).toEqual(["201", "202"])
    expect(product.rating).toBe(4.5)
    expect(product.ratingCount).toBe(27)
    expect(product.lastModified).toBe("2026-10-01T10:30:00")
    expect(product.categories).toEqual([{ id: "9", name: "Bags", slug: "bags" }])
    expect(product.tags).toEqual(["canvas"])
  })

  it("splits images into the featured image and the gallery", () => {
    const product = mapWooProduct(rawProduct())
    expect(product.featuredImage).toEqual({
      id: "501",
      url: "https://store.example.com/tote.jpg",
      alt: "Front",
      position: 0,
    })
    expect(product.gallery.map((image) => image.id)).toEqual(["502", "503"])
  })

  it("parses money fields and reports the sale flag", () => {
    const product = mapWooProduct(rawProduct())
    expect(product.price).toBe(16.99)
    expect(product.regularPrice).toBe(21.99)
    expect(product.salePrice).toBe(16.99)
    expect(product.onSale).toBe(true)
  })

  it("falls back to the regular price and drops an empty sale price", () => {
    const product = mapWooProduct(
      rawProduct({ price: "", sale_price: "", on_sale: false })
    )
    expect(product.price).toBe(21.99)
    expect(product.salePrice).toBeNull()
    expect(product.onSale).toBe(false)
  })

  it("infers on sale when the sale price undercuts the regular price", () => {
    const product = mapWooProduct(
      rawProduct({ price: "10", sale_price: "10", on_sale: false })
    )
    expect(product.salePrice).toBe(10)
    expect(product.onSale).toBe(true)
  })

  it("falls back to draft and instock when the status values are missing", () => {
    const raw = rawProduct()
    delete raw.status
    delete raw.stock_status
    const product = mapWooProduct(raw)
    expect(product.status).toBe("draft")
    expect(product.stockStatus).toBe("instock")
  })

  it("keeps stock quantity null unless the store manages numeric stock", () => {
    const unmanaged = mapWooProduct(rawProduct({ manage_stock: false }))
    expect(unmanaged.stockQuantity).toBeNull()
    const textStock = mapWooProduct(rawProduct({ stock_quantity: "14" }))
    expect(textStock.stockQuantity).toBeNull()
  })

  it("falls back to the local modified date when the GMT one is absent", () => {
    const raw = rawProduct()
    delete raw.date_modified_gmt
    const product = mapWooProduct(raw)
    expect(product.lastModified).toBe("2026-10-01T12:30:00")
  })

  it("flattens attributes and keeps only string options", () => {
    const product = mapWooProduct(
      rawProduct({
        attributes: [
          {
            id: 1,
            name: "Color",
            options: ["Natural", 7, null],
            variation: true,
          },
        ],
      })
    )
    expect(product.attributes).toEqual([
      { id: "1", name: "Color", options: ["Natural"], isVariation: true },
    ])
  })

  it("returns an empty image set when the payload has no images", () => {
    const raw = rawProduct()
    delete raw.images
    const product = mapWooProduct(raw)
    expect(product.featuredImage).toBeNull()
    expect(product.gallery).toEqual([])
  })
})

describe("mapWooVariation", () => {
  it("throws for payloads that are not objects", () => {
    for (const candidate of [null, undefined, "natural", 42]) {
      expect(() => mapWooVariation(candidate)).toThrow(
        "The raw variation payload must be an object."
      )
    }
  })

  it("maps a full variation payload", () => {
    const variation = mapWooVariation(rawVariation())
    expect(variation.id).toBe("201")
    expect(variation.sku).toBe("CT-001-NAT")
    expect(variation.price).toBe(16.99)
    expect(variation.regularPrice).toBe(21.99)
    expect(variation.salePrice).toBeNull()
    expect(variation.stockStatus).toBe("instock")
    expect(variation.stockQuantity).toBeNull()
    expect(variation.attributes).toEqual([
      { id: "1", name: "Color", options: ["Natural"], isVariation: true },
    ])
  })

  it("maps an empty variation option to an empty options list", () => {
    const variation = mapWooVariation(
      rawVariation({
        attributes: [{ id: 1, name: "Color", option: "" }],
      })
    )
    expect(variation.attributes[0]?.options).toEqual([])
  })

  it("passes managed stock and sale prices through", () => {
    const variation = mapWooVariation(
      rawVariation({
        manage_stock: true,
        stock_quantity: 5,
        sale_price: "12",
        stock_status: "outofstock",
      })
    )
    expect(variation.stockQuantity).toBe(5)
    expect(variation.salePrice).toBe(12)
    expect(variation.stockStatus).toBe("outofstock")
  })
})


describe("real store payloads", () => {
  it("uses the first image as featured when the payload has no position field", () => {
    // Real WooCommerce REST payloads carry no position field at all: the
    // featured image is simply the first entry of the images array.
    const raw = {
      id: 37,
      name: "WordPress Pennant",
      slug: "wordpress-pennant",
      status: "publish",
      price: "11.05",
      regular_price: "11.05",
      sale_price: "",
      stock_status: "instock",
      description: "<p>Pellentesque habitant morbi.</p>",
      images: [
        {
          id: 60,
          src: "https://store.example/wp-content/uploads/pennant-1.jpg",
          name: "pennant-1.jpg",
          alt: "",
        },
        {
          id: 61,
          src: "https://store.example/wp-content/uploads/pennant-2.jpg",
          name: "pennant-2.jpg",
          alt: "",
        },
      ],
    }

    const product = mapWooProduct(raw)

    expect(product.featuredImage?.url).toBe(
      "https://store.example/wp-content/uploads/pennant-1.jpg"
    )
    expect(product.gallery.map((image) => image.url)).toEqual([
      "https://store.example/wp-content/uploads/pennant-2.jpg",
    ])
    // Empty alt falls back to the cleaned-up file name.
    expect(product.featuredImage?.alt).toBe("pennant 1")
  })
})
