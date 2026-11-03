/**
 * Tests for the WooCommerce REST client: typed error classification,
 * retry with backoff, auth transport, the CORS preflight probe
 * (spec 002 acceptance criteria 2, 3, 4, and 7), product and
 * variation paging (spec 003), and write-back requests (spec 004).
 */

import { afterEach, expect, it, describe, vi } from "vitest"
import {
  AuthError,
  CorsError,
  NotWooError,
  TransientError,
  checkWriteAccess,
  fetchProductsPage,
  fetchUpdateProduct,
  fetchUpdateProductsBatch,
  fetchVariationsPage,
  toWooUpdatePayload,
  validateConnection,
} from "../client"
import { ProductNotFoundError, RateLimitError } from "../../types"
import type { ProductBatchUpdate } from "../../types"
import { wooCommerceProvider } from "../index"

const credentials = {
  storeUrl: "https://store.example.com",
  consumerKey: "ck_abcdef1234567890",
  consumerSecret: "cs_abcdef1234567890",
}

function instantSleep(): Promise<void> {
  return Promise.resolve()
}

function jsonResponse(status = 200): Response {
  return new Response("[]", {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function htmlResponse(status = 200): Response {
  return new Response("<html></html>", {
    status,
    headers: { "Content-Type": "text/html" },
  })
}

afterEach(function restoreFetch() {
  vi.unstubAllGlobals()
})

describe("validateConnection", () => {
  it("resolves when the store answers with JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      validateConnection(credentials, { sleepFn: instantSleep })
    ).resolves.toBeUndefined()
  })

  it("throws AuthError with the research sentence on 401", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401))
    vi.stubGlobal("fetch", fetchMock)
    const attempt = validateConnection(credentials, { sleepFn: instantSleep })
    await expect(attempt).rejects.toBeInstanceOf(AuthError)
    await expect(attempt).rejects.toThrow(
      "The connection failed. Check that your consumer key and secret are correct and have read access."
    )
  })

  it("throws AuthError on 403 as well", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(403))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      validateConnection(credentials, { sleepFn: instantSleep })
    ).rejects.toBeInstanceOf(AuthError)
  })

  it("throws NotWooError with the research sentence on 404", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404))
    vi.stubGlobal("fetch", fetchMock)
    const attempt = validateConnection(credentials, { sleepFn: instantSleep })
    await expect(attempt).rejects.toBeInstanceOf(NotWooError)
    await expect(attempt).rejects.toThrow(
      "This does not look like a WooCommerce REST API endpoint. Check the store URL."
    )
  })

  it("throws NotWooError when a 200 response is HTML, not the REST API", async () => {
    const fetchMock = vi.fn(async () => htmlResponse(200))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      validateConnection(credentials, { sleepFn: instantSleep })
    ).rejects.toBeInstanceOf(NotWooError)
  })

  it("throws CorsError when fetch rejects with a TypeError", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    vi.stubGlobal("fetch", fetchMock)
    const attempt = validateConnection(credentials, { sleepFn: instantSleep })
    await expect(attempt).rejects.toBeInstanceOf(CorsError)
    await expect(attempt).rejects.toThrow(
      "The browser blocked the connection to your store."
    )
  })

  it("retries a 429 with backoff and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      validateConnection(credentials, { sleepFn: instantSleep })
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws RateLimitError after three 429 responses", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      validateConnection(credentials, { sleepFn: instantSleep })
    ).rejects.toBeInstanceOf(RateLimitError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("throws TransientError after three 5xx responses", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      validateConnection(credentials, { sleepFn: instantSleep })
    ).rejects.toBeInstanceOf(TransientError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("sends Basic auth and never puts secrets in the URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200))
    vi.stubGlobal("fetch", fetchMock)
    await validateConnection(credentials, { sleepFn: instantSleep })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).not.toContain("consumer_key")
    expect(String(url)).not.toContain("consumer_secret")
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Basic /)
  })
})

describe("checkWriteAccess", () => {
  it("returns true when the store answers the preflight", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200))
    vi.stubGlobal("fetch", fetchMock)
    await expect(checkWriteAccess(credentials)).resolves.toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toContain("/wp-json/wc/v3/products")
    expect(init.method).toBe("OPTIONS")
  })

  it("returns false when the preflight is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(403)))
    await expect(checkWriteAccess(credentials)).resolves.toBe(false)
  })

  it("returns false when the preflight is blocked by the browser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      })
    )
    await expect(checkWriteAccess(credentials)).resolves.toBe(false)
  })
})

function responseWith(
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response("[]", {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

describe("fetchProductsPage", () => {
  it("builds the products URL with paging, status, GMT dates, and the watermark", async () => {
    const fetchMock = vi.fn(async () =>
      responseWith(200, { "X-WP-Total": "250", "X-WP-TotalPages": "3" })
    )
    vi.stubGlobal("fetch", fetchMock)
    const page = await fetchProductsPage(credentials, {
      page: 2,
      perPage: 100,
      status: "publish,draft",
      modifiedAfter: "2026-10-20T09:00:00.000Z",
    })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(String(url))
    expect(parsed.pathname).toBe("/wp-json/wc/v3/products")
    expect(parsed.searchParams.get("per_page")).toBe("100")
    expect(parsed.searchParams.get("page")).toBe("2")
    expect(parsed.searchParams.get("status")).toBe("publish,draft")
    expect(parsed.searchParams.get("dates_are_gmt")).toBe("true")
    expect(parsed.searchParams.get("modified_after")).toBe(
      "2026-10-20T09:00:00.000Z"
    )
    expect(page.totalItems).toBe(250)
    expect(page.totalPages).toBe(3)
    expect(page.rawProducts).toEqual([])
  })

  it("omits the status and watermark params when they carry no value", async () => {
    const fetchMock = vi.fn(async () => responseWith(200))
    vi.stubGlobal("fetch", fetchMock)
    await fetchProductsPage(credentials, {
      page: 1,
      perPage: 100,
      status: "",
      modifiedAfter: null,
    })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(String(url))
    expect(parsed.searchParams.get("status")).toBeNull()
    expect(parsed.searchParams.get("modified_after")).toBeNull()
    expect(parsed.searchParams.get("dates_are_gmt")).toBe("true")
  })

  it("clamps per_page to the Woo maximum and repairs invalid paging", async () => {
    const fetchMock = vi.fn(async () => responseWith(200))
    vi.stubGlobal("fetch", fetchMock)
    await fetchProductsPage(credentials, { page: 0, perPage: 500 })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(String(url))
    expect(parsed.searchParams.get("per_page")).toBe("100")
    expect(parsed.searchParams.get("page")).toBe("1")
  })

  it("keeps the default page size when perPage is invalid", async () => {
    const fetchMock = vi.fn(async () => responseWith(200))
    vi.stubGlobal("fetch", fetchMock)
    await fetchProductsPage(credentials, { perPage: 0 })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(String(url))
    expect(parsed.searchParams.get("per_page")).toBe("100")
  })

  it("throws NotWooError when the products endpoint answers 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseWith(404)))
    await expect(fetchProductsPage(credentials, {})).rejects.toThrow(
      NotWooError
    )
  })

  it("throws NotWooError when the store URL is empty", async () => {
    await expect(
      fetchProductsPage({ ...credentials, storeUrl: "" }, {})
    ).rejects.toThrow(NotWooError)
  })
})

describe("fetchVariationsPage", () => {
  it("builds the variations URL for one product and parses the totals", async () => {
    const fetchMock = vi.fn(async () =>
      responseWith(200, { "X-WP-Total": "7", "X-WP-TotalPages": "1" })
    )
    vi.stubGlobal("fetch", fetchMock)
    const page = await fetchVariationsPage(credentials, "123", {
      page: 1,
      perPage: 100,
    })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(String(url))
    expect(parsed.pathname).toBe("/wp-json/wc/v3/products/123/variations")
    expect(parsed.searchParams.get("per_page")).toBe("100")
    expect(parsed.searchParams.get("page")).toBe("1")
    expect(page.totalItems).toBe(7)
    expect(page.totalPages).toBe(1)
    expect(page.rawVariations).toEqual([])
  })

  it("throws ProductNotFoundError when the variations endpoint answers 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseWith(404)))
    await expect(fetchVariationsPage(credentials, "123", {})).rejects.toThrow(
      ProductNotFoundError
    )
  })
})

describe("retry backoff details", () => {
  it("prefers the Retry-After header over the exponential backoff", async () => {
    const delays: number[] = []
    async function recordingSleep(ms: number): Promise<void> {
      delays.push(ms)
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(responseWith(429, { "Retry-After": "2" }))
        .mockResolvedValueOnce(responseWith(200))
    )
    await validateConnection(credentials, { sleepFn: recordingSleep })
    expect(delays).toEqual([2000])
  })
})

describe("toWooUpdatePayload", () => {
  it("maps normalized fields to snake_case and prices to strings", () => {
    const payload = toWooUpdatePayload({
      name: "Renamed",
      slug: "renamed",
      status: "draft",
      description: "<p>New</p>",
      shortDescription: "Short",
      sku: "SKU-1",
      regularPrice: 21.99,
      salePrice: null,
      stockStatus: "outofstock",
      stockQuantity: 5,
    })
    expect(payload).toEqual({
      name: "Renamed",
      slug: "renamed",
      status: "draft",
      description: "<p>New</p>",
      short_description: "Short",
      sku: "SKU-1",
      regular_price: "21.99",
      sale_price: "",
      stock_status: "outofstock",
      manage_stock: true,
      stock_quantity: 5,
    })
  })

  it("disables stock management when the quantity is null", () => {
    expect(toWooUpdatePayload({ stockQuantity: null })).toEqual({
      manage_stock: false,
    })
  })

  it("omits unset fields and never sends the derived price", () => {
    expect(toWooUpdatePayload({})).toEqual({})
    expect(toWooUpdatePayload({ name: "Renamed", price: 21.99 })).toEqual({
      name: "Renamed",
    })
  })
})

describe("fetchUpdateProduct", () => {
  it("sends one PUT with only the changed fields", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200))
    vi.stubGlobal("fetch", fetchMock)

    await fetchUpdateProduct(credentials, "42", {
      name: "Renamed",
      regularPrice: 21.99,
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe(
      `${credentials.storeUrl}/wp-json/wc/v3/products/42`
    )
    expect(init.method).toBe("PUT")
    expect(new Headers(init.headers).get("Authorization")).toMatch(/^Basic /)
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Renamed",
      regular_price: "21.99",
    })
  })

  it("throws AuthError when the key lacks write permission", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401)))
    await expect(
      fetchUpdateProduct(credentials, "42", { name: "Renamed" })
    ).rejects.toThrow(AuthError)
  })

  it("throws ProductNotFoundError when the product is gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404)))
    await expect(
      fetchUpdateProduct(credentials, "42", { name: "Renamed" })
    ).rejects.toThrow(ProductNotFoundError)
  })
})

describe("fetchUpdateProductsBatch", () => {
  it("posts one batch request with the update array", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200))
    vi.stubGlobal("fetch", fetchMock)

    await fetchUpdateProductsBatch(credentials, [
      { id: "1", fields: { name: "Renamed A" } },
      { id: "2", fields: { regularPrice: 9.5 } },
    ])

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toBe(
      `${credentials.storeUrl}/wp-json/wc/v3/products/batch`
    )
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({
      update: [
        { id: "1", name: "Renamed A" },
        { id: "2", regular_price: "9.5" },
      ],
    })
  })
})

describe("wooCommerceProvider.updateProductsBatch", () => {
  it("splits 250 updates into three requests of at most 100", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200))
    vi.stubGlobal("fetch", fetchMock)
    const updates: ProductBatchUpdate[] = []
    for (let index = 1; index <= 250; index += 1) {
      updates.push({ id: String(index), fields: { name: `Product ${index}` } })
    }

    await wooCommerceProvider.updateProductsBatch(credentials, updates)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const sizes = fetchMock.mock.calls.map(function batchSize(call) {
      const init = (call as unknown as [string, RequestInit])[1]
      const body: { update: unknown[] } = JSON.parse(String(init.body))
      return body.update.length
    })
    expect(sizes).toEqual([100, 100, 50])
  })
})
