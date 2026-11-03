/**
 * WooCommerce REST Client: Connection Validation And CORS Detection
 *
 * The plugin talks to WooCommerce directly from the browser (architecture D1).
 * WooCommerce does not send CORS headers, so a plain store will reject browser
 * requests. That rejection surfaces as a TypeError from fetch, and this client
 * translates it into a CorsError that carries companion plugin guidance
 * (spec 002, feature M5).
 *
 * Conventions: function declarations only (INSTRUCTION.md section 5). Error
 * messages are full user-facing sentences (section 7). Raw error codes never
 * appear in the UI.
 */

import {
  ProductNotFoundError,
  ProviderError,
  RateLimitError,
  type Credentials,
  type ProductBatchUpdate,
  type ProductUpdateFields,
} from "../types"

// ============================================================================
// Typed Connection Errors
// ============================================================================

/**
 * 401 or 403 from the probe: the keys are wrong or lack read permission.
 * Message comes verbatim from the research error matrix (section 6.4).
 */
export class AuthError extends ProviderError {
  constructor() {
    super(
      "The connection failed. Check that your consumer key and secret are correct and have read access.",
      "AUTH_FAILED",
      "woocommerce"
    )
    this.name = "AuthError"
  }
}

/**
 * 404 or a non-JSON response: the URL is not a WooCommerce REST API endpoint.
 */
export class NotWooError extends ProviderError {
  constructor() {
    super(
      "This does not look like a WooCommerce REST API endpoint. Check the store URL.",
      "NOT_WOOCOMMERCE",
      "woocommerce"
    )
    this.name = "NotWooError"
  }
}

/**
 * Network TypeError: the browser blocked the request (CORS) before it reached
 * the store. The message guides the merchant to the companion WordPress plugin
 * or a host-side origin fix.
 */
export class CorsError extends ProviderError {
  constructor() {
    super(
      "The browser blocked the connection to your store. WooCommerce does not allow direct browser requests by default. Install the free companion plugin on your store, or ask your host to allow requests from Framer, then try again.",
      "CORS_BLOCKED",
      "woocommerce"
    )
    this.name = "CorsError"
  }
}

/**
 * 5xx responses that exhausted every retry attempt.
 */
export class TransientError extends ProviderError {
  constructor() {
    super(
      "The store could not be reached. Check that your store is online, then try again.",
      "TRANSIENT",
      "woocommerce"
    )
    this.name = "TransientError"
  }
}

// ============================================================================
// Retry With Backoff
// ============================================================================

/** Options for retry behavior. Both exist so tests can run without delays. */
export interface RetryOptions {
  /** Injectable sleep function so tests can skip real backoff waits. */
  sleepFn?: (ms: number) => Promise<void>
  /** Total attempts including the first one. Spec cap: 3. */
  maxAttempts?: number
}

const DEFAULT_MAX_ATTEMPTS = 3

function defaultSleep(ms: number): Promise<void> {
  return new Promise(function resolveLater(resolve) {
    setTimeout(resolve, ms)
  })
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * Fetch with exponential backoff on 429 and 5xx (research section 6.4).
 * Retries at most the configured number of attempts, then throws
 * RateLimitError (429) or TransientError (5xx). Non-retryable responses
 * return as-is so the caller can classify them. Fetch rejections propagate
 * untouched; the caller decides whether they mean CORS.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const sleepFn = options.sleepFn ?? defaultSleep
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  let attempt = 1
  for (;;) {
    const response = await fetch(url, init)
    if (!isRetryableStatus(response.status)) {
      return response
    }
    if (attempt >= maxAttempts) {
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("Retry-After"))
        const retryAfter =
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds
            : undefined
        throw new RateLimitError("woocommerce", retryAfter)
      }
      throw new TransientError()
    }
    // Prefer the server's Retry-After hint over our own backoff when present.
    const retryAfterHeader = Number(response.headers.get("Retry-After"))
    const backoffMs = 1000 * Math.pow(2, attempt - 1)
    const waitMs =
      Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : backoffMs
    await sleepFn(waitMs)
    attempt += 1
  }
}

// ============================================================================
// Auth
// ============================================================================

/**
 * Basic auth header from the consumer key and secret. Query-string auth is
 * never used because it leaks secrets into URLs and server logs (research
 * section 11.1).
 */
export function toBasicAuthHeader(
  consumerKey: string,
  consumerSecret: string
): string {
  return `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}`
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

// ============================================================================
// Validation Probe And Preflight
// ============================================================================

/**
 * Validate a connection with one cheap request (spec 002 section 3):
 * GET {storeUrl}/wp-json/wc/v3/products?per_page=1 with Basic auth.
 *
 * Throws AuthError (401/403), NotWooError (404 or HTML), CorsError (network
 * TypeError), RateLimitError (429 after retries), or TransientError (5xx
 * after retries). Resolves when the store answers with JSON.
 */
export async function validateConnection(
  credentials: Credentials,
  options: RetryOptions = {}
): Promise<void> {
  const storeUrl = stripTrailingSlash(String(credentials.storeUrl ?? ""))
  if (storeUrl === "") {
    // An empty URL is a wrong-URL case, not worth a separate error type.
    throw new NotWooError()
  }
  const probeUrl = `${storeUrl}/wp-json/wc/v3/products?per_page=1`
  const init: RequestInit = {
    method: "GET",
    headers: {
      Authorization: toBasicAuthHeader(
        String(credentials.consumerKey ?? ""),
        String(credentials.consumerSecret ?? "")
      ),
    },
  }
  let response: Response
  try {
    response = await fetchWithRetry(probeUrl, init, options)
  } catch (error) {
    // A blocked or failed network call rejects with a TypeError in browsers.
    if (error instanceof TypeError) {
      throw new CorsError()
    }
    throw error
  }
  if (response.status === 401 || response.status === 403) {
    throw new AuthError()
  }
  const contentType = response.headers.get("Content-Type") ?? ""
  if (response.status === 404 || !contentType.toLowerCase().includes("json")) {
    throw new NotWooError()
  }
}

/**
 * CORS preflight probe for write-back (M5): an OPTIONS request to the
 * products endpoint. Returns true only when the store answers the preflight
 * successfully, which means browser PUT and POST requests can proceed.
 */
export async function checkWriteAccess(
  credentials: Credentials
): Promise<boolean> {
  const storeUrl = stripTrailingSlash(String(credentials.storeUrl ?? ""))
  if (storeUrl === "") {
    return false
  }
  const preflightUrl = `${storeUrl}/wp-json/wc/v3/products`
  try {
    const response = await fetch(preflightUrl, { method: "OPTIONS" })
    return response.ok
  } catch {
    return false
  }
}

// ============================================================================
// Product Listing (spec 003)
// ============================================================================

/** WooCommerce caps every products request at 100 items per page. */
const WOO_MAX_PER_PAGE = 100

/** Query shape for one page of products, straight from the sync engine. */
export interface WooProductsQuery {
  /** 1-indexed page number. */
  page?: number
  /** Items per page, clamped to the Woo maximum of 100. */
  perPage?: number
  /** Comma-joined product statuses to include, for example "publish,draft". */
  status?: string
  /**
   * ISO timestamp from the sync watermark. Null or empty means a full
   * first pass, so the client omits modified_after entirely.
   */
  modifiedAfter?: string | null
}

/**
 * One page of raw product payloads plus the paging totals Woo reports in
 * the X-WP-Total and X-WP-TotalPages response headers. Products stay raw
 * here; the mapper in the provider layer normalizes them.
 */
export interface WooProductsPage {
  rawProducts: unknown[]
  totalItems: number
  totalPages: number
}

/** Paging totals parsed from the X-WP-Total and X-WP-TotalPages headers. */
function readTotals(response: Response): { totalItems: number; totalPages: number } {
  const total = Number(response.headers.get("X-WP-Total"))
  const totalPages = Number(response.headers.get("X-WP-TotalPages"))
  return {
    totalItems: Number.isFinite(total) && total > 0 ? total : 0,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 0,
  }
}

function clampPerPage(perPage: number | undefined): number {
  if (typeof perPage !== "number" || !Number.isFinite(perPage) || perPage < 1) {
    return WOO_MAX_PER_PAGE
  }
  return Math.min(Math.floor(perPage), WOO_MAX_PER_PAGE)
}

function clampPage(page: number | undefined): number {
  if (typeof page !== "number" || !Number.isFinite(page) || page < 1) {
    return 1
  }
  return Math.floor(page)
}

/**
 * Shared request pipeline for product endpoints: Basic auth header, retry
 * with backoff, and the same error classification as validateConnection.
 * Reads use the defaults; write-back (spec 004) passes a PUT or POST
 * method and a JSON body. A 404 is left to the caller because it means a
 * wrong URL on collection endpoints but a missing product on item
 * endpoints.
 */
async function requestWooJson(
  url: string,
  credentials: Credentials,
  options: RetryOptions,
  request: { method?: "GET" | "PUT" | "POST"; body?: unknown } = {}
): Promise<{ response: Response; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: toBasicAuthHeader(
      String(credentials.consumerKey ?? ""),
      String(credentials.consumerSecret ?? "")
    ),
  }
  if (request.body !== undefined) {
    headers["Content-Type"] = "application/json"
  }
  const init: RequestInit = {
    method: request.method ?? "GET",
    headers,
  }
  if (request.body !== undefined) {
    init.body = JSON.stringify(request.body)
  }
  let response: Response
  try {
    response = await fetchWithRetry(url, init, options)
  } catch (error) {
    // A blocked or failed network call rejects with a TypeError in browsers.
    if (error instanceof TypeError) {
      throw new CorsError()
    }
    throw error
  }
  if (response.status === 401 || response.status === 403) {
    throw new AuthError()
  }
  const contentType = response.headers.get("Content-Type") ?? ""
  if (!contentType.toLowerCase().includes("json")) {
    throw new NotWooError()
  }
  return { response, body: await response.json() }
}

/**
 * Fetch one page of products (spec 003 section 5):
 * GET /wp-json/wc/v3/products with per_page, page, status, dates_are_gmt,
 * and modified_after when the watermark is set. Paging totals come back
 * from the X-WP-Total and X-WP-TotalPages headers.
 */
export async function fetchProductsPage(
  credentials: Credentials,
  query: WooProductsQuery = {},
  options: RetryOptions = {}
): Promise<WooProductsPage> {
  const storeUrl = stripTrailingSlash(String(credentials.storeUrl ?? ""))
  if (storeUrl === "") {
    throw new NotWooError()
  }
  const params = new URLSearchParams()
  params.set("per_page", String(clampPerPage(query.perPage)))
  params.set("page", String(clampPage(query.page)))
  if (query.status !== undefined && query.status !== "") {
    params.set("status", query.status)
  }
  params.set("dates_are_gmt", "true")
  if (query.modifiedAfter !== undefined && query.modifiedAfter !== null && query.modifiedAfter !== "") {
    params.set("modified_after", query.modifiedAfter)
  }
  const url = `${storeUrl}/wp-json/wc/v3/products?${params.toString()}`
  const { response, body } = await requestWooJson(url, credentials, options)
  if (response.status === 404) {
    throw new NotWooError()
  }
  return {
    rawProducts: Array.isArray(body) ? body : [],
    ...readTotals(response),
  }
}

/**
 * Fetch one product by ID. Throws ProductNotFoundError when the store no
 * longer has the product, so callers can decide whether that is expected.
 */
export async function fetchProduct(
  credentials: Credentials,
  productId: string,
  options: RetryOptions = {}
): Promise<unknown> {
  const storeUrl = stripTrailingSlash(String(credentials.storeUrl ?? ""))
  if (storeUrl === "") {
    throw new NotWooError()
  }
  const url = `${storeUrl}/wp-json/wc/v3/products/${encodeURIComponent(productId)}`
  const { response, body } = await requestWooJson(url, credentials, options)
  if (response.status === 404) {
    throw new ProductNotFoundError("woocommerce", productId)
  }
  return body
}

/** Query shape for one page of variations of a single product. */
export interface WooVariationsQuery {
  /** 1-indexed page number. */
  page?: number
  /** Items per page, clamped to the Woo maximum of 100. */
  perPage?: number
}

/**
 * One page of raw variation payloads plus the reported page count, used by
 * the sync engine to cap how many variations it stores per product.
 */
export interface WooVariationsPage {
  rawVariations: unknown[]
  totalItems: number
  totalPages: number
}

/**
 * Fetch one page of variations for a variable product (spec 003 section 5):
 * GET /wp-json/wc/v3/products/{id}/variations with per_page and page.
 * Throws ProductNotFoundError when the product no longer exists.
 */
export async function fetchVariationsPage(
  credentials: Credentials,
  productId: string,
  query: WooVariationsQuery = {},
  options: RetryOptions = {}
): Promise<WooVariationsPage> {
  const storeUrl = stripTrailingSlash(String(credentials.storeUrl ?? ""))
  if (storeUrl === "") {
    throw new NotWooError()
  }
  const params = new URLSearchParams()
  params.set("per_page", String(clampPerPage(query.perPage)))
  params.set("page", String(clampPage(query.page)))
  const url = `${storeUrl}/wp-json/wc/v3/products/${encodeURIComponent(
    productId
  )}/variations?${params.toString()}`
  const { response, body } = await requestWooJson(url, credentials, options)
  if (response.status === 404) {
    throw new ProductNotFoundError("woocommerce", productId)
  }
  return {
    rawVariations: Array.isArray(body) ? body : [],
    ...readTotals(response),
  }
}

// ============================================================================
// Product Writes (spec 004)
// ============================================================================

/**
 * Convert normalized update fields to the snake_case shape the WooCommerce
 * REST API expects. Prices become strings because Woo treats every decimal
 * field as a string; Number.prototype.toString prints the shortest value
 * that parses back to the same number, so "21.99" survives a round trip.
 * The price field itself is derived by WooCommerce from regular_price and
 * sale_price, so it never appears in a write payload.
 */
export function toWooUpdatePayload(
  fields: ProductUpdateFields
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (fields.name !== undefined) {
    payload.name = fields.name
  }
  if (fields.slug !== undefined) {
    payload.slug = fields.slug
  }
  if (fields.status !== undefined) {
    payload.status = fields.status
  }
  if (fields.description !== undefined) {
    payload.description = fields.description
  }
  if (fields.shortDescription !== undefined) {
    payload.short_description = fields.shortDescription
  }
  if (fields.sku !== undefined) {
    payload.sku = fields.sku
  }
  if (fields.regularPrice !== undefined) {
    payload.regular_price = toWooPriceString(fields.regularPrice)
  }
  if (fields.salePrice !== undefined) {
    payload.sale_price = toWooPriceString(fields.salePrice)
  }
  if (fields.stockStatus !== undefined) {
    payload.stock_status = fields.stockStatus
  }
  if (fields.stockQuantity !== undefined) {
    if (fields.stockQuantity === null) {
      payload.manage_stock = false
    } else {
      payload.manage_stock = true
      payload.stock_quantity = fields.stockQuantity
    }
  }
  return payload
}

/** Woo wants decimal fields as strings, and an empty string clears them. */
function toWooPriceString(value: number | null): string {
  if (value === null) {
    return ""
  }
  return String(value)
}

/**
 * Update fields on one product (spec 004 section 3):
 * PUT /wp-json/wc/v3/products/{id} with only the changed fields. Throws
 * ProductNotFoundError when the store no longer has the product.
 */
export async function fetchUpdateProduct(
  credentials: Credentials,
  productId: string,
  fields: ProductUpdateFields,
  options: RetryOptions = {}
): Promise<unknown> {
  const storeUrl = stripTrailingSlash(String(credentials.storeUrl ?? ""))
  if (storeUrl === "") {
    throw new NotWooError()
  }
  const url = `${storeUrl}/wp-json/wc/v3/products/${encodeURIComponent(productId)}`
  const { response, body } = await requestWooJson(url, credentials, options, {
    method: "PUT",
    body: toWooUpdatePayload(fields),
  })
  if (response.status === 404) {
    throw new ProductNotFoundError("woocommerce", productId)
  }
  return body
}

/**
 * Update many products in one request (spec 004 section 3):
 * POST /wp-json/wc/v3/products/batch with an update array. WooCommerce
 * answers with the same shape, and the provider layer maps the products
 * found in body.update. Callers keep each request within the batch cap.
 */
export async function fetchUpdateProductsBatch(
  credentials: Credentials,
  updates: ProductBatchUpdate[],
  options: RetryOptions = {}
): Promise<unknown> {
  const storeUrl = stripTrailingSlash(String(credentials.storeUrl ?? ""))
  if (storeUrl === "") {
    throw new NotWooError()
  }
  const url = `${storeUrl}/wp-json/wc/v3/products/batch`
  const { body } = await requestWooJson(url, credentials, options, {
    method: "POST",
    body: {
      update: updates.map(function toBatchEntry(update) {
        return { id: update.id, ...toWooUpdatePayload(update.fields) }
      }),
    },
  })
  return body
}
