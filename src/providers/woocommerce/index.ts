/**
 * WooCommerce Provider
 *
 * Registers the WooCommerce implementation of the EcommerceProvider contract.
 * Spec 003 ships connection validation, paged product listing, the raw to
 * normalized mapper, and variation listing. Spec 004 adds write-back:
 * single product updates and batched updates through the same client.
 */

import type {
  Credentials,
  EcommerceProvider,
  ListProductsQuery,
  ListProductsResult,
  ListVariationsQuery,
  NormalizedProduct,
  NormalizedVariation,
  ProductBatchUpdate,
  ProductUpdateFields,
} from "../types"
import { hasProvider, registerProvider } from "../registry"
import {
  fetchProduct,
  fetchProductsPage,
  fetchUpdateProduct,
  fetchUpdateProductsBatch,
  fetchVariationsPage,
  validateConnection,
  checkWriteAccess,
  AuthError,
  NotWooError,
  CorsError,
  TransientError,
} from "./client"
import { mapWooProduct, mapWooVariation } from "./mapper"

// Re-export the typed connection errors so consumers can import them from
// the provider barrel without reaching into the client module.
export { AuthError, NotWooError, CorsError, TransientError }

/**
 * List one page of products (spec 003 section 5). The client fetches the
 * raw page plus the X-WP paging headers, and the mapper normalizes every
 * payload into the provider neutral model.
 */
async function listProducts(
  credentials: Credentials,
  query: ListProductsQuery = {}
): Promise<ListProductsResult> {
  const page = await fetchProductsPage(credentials, {
    page: query.page,
    perPage: query.perPage,
    status: query.status,
    modifiedAfter: query.modifiedAfter ?? null,
  })
  return {
    products: page.rawProducts.map(mapWooProduct),
    page: query.page ?? 1,
    perPage: query.perPage ?? 100,
    totalPages: page.totalPages,
    totalItems: page.totalItems,
  }
}

/** Fetch one product by its platform ID and normalize it. */
async function getProduct(
  credentials: Credentials,
  id: string
): Promise<NormalizedProduct> {
  const raw = await fetchProduct(credentials, id)
  return mapWooProduct(raw)
}

/**
 * List one page of variations of a variable product. The sync engine only
 * calls this when the merchant maps the variants field, and caps the pages
 * it requests through the variations setting (spec 003 section 5).
 */
async function listVariations(
  credentials: Credentials,
  productId: string,
  query: ListVariationsQuery = {}
): Promise<NormalizedVariation[]> {
  const page = await fetchVariationsPage(credentials, productId, {
    page: query.page,
    perPage: query.perPage,
  })
  return page.rawVariations.map(mapWooVariation)
}

/**
 * Update fields on one product (spec 004 section 3). The client sends only
 * the changed fields as a PUT, and the mapper normalizes the response so
 * the caller sees the stored result.
 */
async function updateProductFields(
  credentials: Credentials,
  id: string,
  fields: ProductUpdateFields
): Promise<NormalizedProduct> {
  const raw = await fetchUpdateProduct(credentials, id, fields)
  return mapWooProduct(raw)
}

/** WooCommerce caps each batch request at 100 products. */
const WOO_BATCH_LIMIT = 100

/** Read the update array from a WooCommerce batch response body. */
function batchUpdateList(body: unknown): unknown[] {
  if (typeof body === "object" && body !== null && "update" in body) {
    const update: unknown = body.update
    if (Array.isArray(update)) {
      return update
    }
  }
  return []
}

/**
 * Update many products (spec 004 section 3). Requests are split into
 * chunks of 100 because WooCommerce caps batch size, and every response's
 * update array is normalized in request order.
 */
async function updateProductsBatch(
  credentials: Credentials,
  updates: ProductBatchUpdate[]
): Promise<NormalizedProduct[]> {
  const products: NormalizedProduct[] = []
  for (let index = 0; index < updates.length; index += WOO_BATCH_LIMIT) {
    const chunk = updates.slice(index, index + WOO_BATCH_LIMIT)
    const body = await fetchUpdateProductsBatch(credentials, chunk)
    products.push(...batchUpdateList(body).map(mapWooProduct))
  }
  return products
}

/**
 * The WooCommerce provider instance. Capabilities describe what the platform
 * supports (architecture D6); write-back itself stays gated behind the
 * merchant's preview confirmation in the sync flow.
 */
export const wooCommerceProvider: EcommerceProvider<true> = {
  id: "woocommerce",
  displayName: "WooCommerce",
  capabilities: {
    supportsTwoWaySync: true,
    // Writable set from FEATURES.md M11, limited to fields the normalized
    // model carries. Weight joins when the model grows.
    writableFields: [
      "name",
      "slug",
      "status",
      "description",
      "shortDescription",
      "sku",
      "regularPrice",
      "salePrice",
      "stockStatus",
      "stockQuantity",
    ],
    supportsVariants: true,
    supportsCategories: true,
    supportsTags: true,
    supportsImages: true,
    maxPageSize: 100,
  },
  credentialSchema: [
    {
      key: "storeUrl",
      label: "Store URL",
      type: "url",
      placeholder: "https://store.example.com",
      helpText: "The address of your WooCommerce store, starting with https://.",
      required: true,
    },
    {
      key: "consumerKey",
      label: "Consumer key",
      type: "password",
      placeholder: "ck_1234567890abcdef",
      helpText:
        "Create API keys in WooCommerce under Settings, Advanced, REST API.",
      required: true,
    },
    {
      key: "consumerSecret",
      label: "Consumer secret",
      type: "password",
      placeholder: "cs_1234567890abcdef",
      helpText: "The secret shown next to your consumer key.",
      required: true,
    },
  ],
  validateConnection,
  listProducts,
  getProduct,
  updateProductFields,
  updateProductsBatch,
  mapProduct: mapWooProduct,
  listVariations,
  checkWriteAccess,
}

// Self-register once, so importing the provider barrel is all callers need.
// The guard keeps hot reloads and test setups from double-registering.
if (!hasProvider(wooCommerceProvider.id)) {
  registerProvider(wooCommerceProvider)
}
