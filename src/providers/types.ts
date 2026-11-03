/**
 * Provider Types - Platform-agnostic contracts for eCommerce integrations
 *
 * This module defines the core interfaces that all eCommerce providers must implement.
 * The provider pattern allows the plugin to support multiple platforms (WooCommerce,
 * Shopify, Wix, etc.) without changing the sync engine or UI logic.
 */

// ============================================================================
// Product Model
// ============================================================================

/**
 * Normalized product representation that all providers must map to.
 * This is the platform-neutral format used throughout the sync engine.
 */
export interface NormalizedProduct {
  /** Platform-specific product ID (e.g., WooCommerce product ID) */
  id: string
  /** Product name/title */
  name: string
  /** URL-friendly slug */
  slug: string
  /** Full URL to product page on the platform */
  permalink: string
  /** Product type (simple, variable, grouped, etc.) */
  type: string
  /** Publication status (draft, pending, private, publish) */
  status: "draft" | "pending" | "private" | "publish"
  /** Full HTML description */
  description: string
  /** Short description/excerpt */
  shortDescription: string
  /** Stock keeping unit */
  sku: string
  /** Current price (after discounts) */
  price: number
  /** Regular price (before discounts) */
  regularPrice: number
  /** Sale price (if on sale) */
  salePrice: number | null
  /** Whether product is currently on sale */
  onSale: boolean
  /** Stock status */
  stockStatus: "instock" | "outofstock" | "onbackorder"
  /** Current stock quantity (if managed) */
  stockQuantity: number | null
  /** Product categories */
  categories: ProductCategory[]
  /** Product tags */
  tags: string[]
  /** Featured/primary image */
  featuredImage: ProductImage | null
  /** Gallery images (excluding featured) */
  gallery: ProductImage[]
  /** Product attributes/variations */
  attributes: ProductAttribute[]
  /** IDs of all variants (for variable products) */
  variantIds: string[]
  /** Average rating (0-5) */
  rating: number
  /** Number of reviews */
  ratingCount: number
  /** Last modification timestamp (ISO 8601) */
  lastModified: string
}

/**
 * Product category reference
 */
export interface ProductCategory {
  id: string
  name: string
  slug: string
}

/**
 * Product image
 */
export interface ProductImage {
  id: string
  url: string
  alt: string
  /** Image position/order (0 = featured) */
  position: number
}

/**
 * Product attribute (e.g., Color, Size)
 */
export interface ProductAttribute {
  id: string
  name: string
  /** Attribute options (e.g., ["Red", "Blue", "Green"]) */
  options: string[]
  /** Whether this attribute is used for variations */
  isVariation: boolean
}

// ============================================================================
// Field Mapping
// ============================================================================

/**
 * Fields that can be synced between platform and Framer CMS
 */
export type NormalizedProductField =
  | "name"
  | "slug"
  | "status"
  | "description"
  | "shortDescription"
  | "sku"
  | "price"
  | "regularPrice"
  | "salePrice"
  | "onSale"
  | "stockStatus"
  | "stockQuantity"
  | "categories"
  | "tags"
  | "featuredImage"
  | "gallery"
  | "attributes"
  | "rating"
  | "ratingCount"
  | "permalink"
  | "lastModified"
  | "variants"

/**
 * Normalized product variation (one variant of a variable product)
 */
export interface NormalizedVariation {
  /** Platform-specific variation ID */
  id: string
  /** Stock keeping unit */
  sku: string
  /** Current price (after discounts) */
  price: number
  /** Regular price (before discounts) */
  regularPrice: number
  /** Sale price (if on sale) */
  salePrice: number | null
  /** Stock status */
  stockStatus: "instock" | "outofstock" | "onbackorder"
  /** Current stock quantity (if managed) */
  stockQuantity: number | null
  /** Attribute selections that define this variant */
  attributes: ProductAttribute[]
}

/**
 * Field mapping configuration
 * Maps platform fields to Framer CMS fields
 */
export interface FieldMapping {
  /** Platform field name */
  platformField: NormalizedProductField | string
  /** Framer CMS field name */
  cmsField: string
  /** Sync direction */
  direction: "platform-to-cms" | "cms-to-platform" | "bidirectional"
  /** Whether this mapping is enabled */
  enabled: boolean
}

// ============================================================================
// Provider Capabilities
// ============================================================================

/**
 * Provider capability flags
 * Indicates what features a provider supports
 */
export interface ProviderCapabilities {
  /** Whether provider supports two-way sync (write-back to platform) */
  supportsTwoWaySync: boolean
  /** List of fields that can be written back to the platform */
  writableFields: NormalizedProductField[]
  /** Whether provider supports product variants */
  supportsVariants: boolean
  /** Whether provider supports product categories */
  supportsCategories: boolean
  /** Whether provider supports product tags */
  supportsTags: boolean
  /** Whether provider supports product images */
  supportsImages: boolean
  /** Maximum products per page (for pagination) */
  maxPageSize: number
}

// ============================================================================
// Credentials
// ============================================================================

/**
 * Credential field definition
 * Used to dynamically render connection forms
 */
export interface CredentialField {
  /** Field identifier */
  key: string
  /** Display label */
  label: string
  /** Field type */
  type: "text" | "password" | "url"
  /** Placeholder text */
  placeholder?: string
  /** Help text */
  helpText?: string
  /** Whether this field is required */
  required: boolean
}

/**
 * Connection credentials (platform-specific)
 * Generic record to allow different auth methods per provider
 */
export type Credentials = Record<string, string>

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Query parameters for listing products
 */
export interface ListProductsQuery {
  /** Page number (1-indexed) */
  page?: number
  /** Items per page */
  perPage?: number
  /** Search term */
  search?: string
  /** Filter by status */
  status?: string
  /** Filter by category */
  category?: string
  /** Only products modified after this ISO 8601 timestamp (incremental sync) */
  modifiedAfter?: string
  /** Sort field */
  sortBy?: string
  /** Sort order */
  sortOrder?: "asc" | "desc"
}

/**
 * Query parameters for listing variations of one product
 */
export interface ListVariationsQuery {
  /** Page number (1-indexed) */
  page?: number
  /** Items per page */
  perPage?: number
}

/**
 * Result of listing products
 */
export interface ListProductsResult {
  /** Products on this page */
  products: NormalizedProduct[]
  /** Current page number */
  page: number
  /** Items per page */
  perPage: number
  /** Total number of pages */
  totalPages: number
  /** Total number of products */
  totalItems: number
}

/**
 * Fields that can be updated on a product
 */
export type ProductUpdateFields = Partial<
  Pick<
    NormalizedProduct,
    | "name"
    | "slug"
    | "status"
    | "description"
    | "shortDescription"
    | "sku"
    | "price"
    | "regularPrice"
    | "salePrice"
    | "stockStatus"
    | "stockQuantity"
  >
>

/**
 * One product update inside a batch write request
 */
export interface ProductBatchUpdate {
  /** Platform product ID to update */
  id: string
  /** Fields to update on this product */
  fields: ProductUpdateFields
}

/**
 * eCommerce provider interface
 * All platform adapters must implement this contract
 *
 * The generic type parameter TSupportsTwoWay encodes whether the provider
 * supports two-way sync at the type level, enabling compile-time enforcement
 * of the updateProductFields method availability.
 */
export interface EcommerceProvider<TSupportsTwoWay extends boolean = boolean> {
  /** Unique provider identifier (e.g., "woocommerce", "shopify") */
  id: string
  /** Display name shown in UI */
  displayName: string
  /** Provider capabilities */
  capabilities: Omit<ProviderCapabilities, "supportsTwoWaySync"> & {
    supportsTwoWaySync: TSupportsTwoWay
  }
  /** Credential schema for connection form */
  credentialSchema: CredentialField[]

  /**
   * Validate connection credentials
   * Tests if credentials are valid and connection works
   *
   * @param credentials - Platform-specific credentials
   * @returns Promise that resolves if valid, rejects with error if invalid
   */
  validateConnection(credentials: Credentials): Promise<void>

  /**
   * List products with pagination
   *
   * @param credentials - Platform-specific credentials
   * @param query - Pagination and filter options
   * @returns Paginated list of products
   */
  listProducts(
    credentials: Credentials,
    query?: ListProductsQuery
  ): Promise<ListProductsResult>

  /**
   * Get a single product by ID
   *
   * @param credentials - Platform-specific credentials
   * @param id - Platform product ID
   * @returns Product data
   */
  getProduct(
    credentials: Credentials,
    id: string
  ): Promise<NormalizedProduct>

  /**
   * List variations of a variable product, page by page. Optional because
   * platforms without variants (or adapters that have not implemented it
   * yet) simply omit it; the sync engine only calls it when the merchant
   * maps the variants field.
   *
   * @param credentials - Platform-specific credentials
   * @param productId - Platform product ID of the variable product
   * @param query - Pagination options (page and perPage)
   * @returns Variations on the requested page
   */
  listVariations?(
    credentials: Credentials,
    productId: string,
    query?: ListVariationsQuery
  ): Promise<NormalizedVariation[]>

  /**
   * Update specific fields on a product
   * Only available if TSupportsTwoWay is true
   * Only updates fields that are supported by the provider's capabilities
   *
   * @param credentials - Platform-specific credentials
   * @param id - Platform product ID
   * @param fields - Fields to update
   * @returns Updated product data
   */
  updateProductFields: TSupportsTwoWay extends true
    ? (
        credentials: Credentials,
        id: string,
        fields: ProductUpdateFields
      ) => Promise<NormalizedProduct>
    : never

  /**
   * Update several products in one request. Optional so providers can add
   * it later; the sync engine uses it when many products change at once and
   * falls back to single updates otherwise.
   *
   * @param credentials - Platform-specific credentials
   * @param updates - Products and fields to update
   * @returns Updated products in request order
   */
  updateProductsBatch?(
    credentials: Credentials,
    updates: ProductBatchUpdate[]
  ): Promise<NormalizedProduct[]>

  /**
   * Optional: check whether the platform allows browser write access for
   * these credentials (a CORS preflight probe). Providers without two-way
   * sync omit this method. Used by the connection flow (spec 002) to warn
   * that write-back will be blocked before the merchant enables it.
   */
  checkWriteAccess?(credentials: Credentials): Promise<boolean>

  /**
   * Map raw platform product data to normalized format
   * Used internally by the provider implementation
   *
   * @param raw - Raw product data from platform API
   * @returns Normalized product
   */
  mapProduct(raw: unknown): NormalizedProduct
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Base error class for provider errors
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly providerId: string
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

/**
 * Error thrown when provider is not found in registry
 */
export class ProviderNotFoundError extends ProviderError {
  constructor(providerId: string) {
    super(
      `Provider "${providerId}" not found. Available providers: ${getAvailableProviders()}`,
      "PROVIDER_NOT_FOUND",
      providerId
    )
    this.name = "ProviderNotFoundError"
  }
}

/**
 * Error thrown when credentials are invalid
 */
export class InvalidCredentialsError extends ProviderError {
  constructor(providerId: string, details?: string) {
    super(
      `Invalid credentials for ${providerId}${details ? `: ${details}` : ""}`,
      "INVALID_CREDENTIALS",
      providerId
    )
    this.name = "InvalidCredentialsError"
  }
}

/**
 * Error thrown when connection fails
 */
export class ConnectionError extends ProviderError {
  constructor(providerId: string, details?: string) {
    super(
      `Connection failed for ${providerId}${details ? `: ${details}` : ""}`,
      "CONNECTION_FAILED",
      providerId
    )
    this.name = "ConnectionError"
  }
}

/**
 * Error thrown when a product is not found
 */
export class ProductNotFoundError extends ProviderError {
  constructor(providerId: string, productId: string) {
    super(
      `Product "${productId}" not found in ${providerId}`,
      "PRODUCT_NOT_FOUND",
      providerId
    )
    this.name = "ProductNotFoundError"
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends ProviderError {
  constructor(
    providerId: string,
    public readonly retryAfter?: number
  ) {
    super(
      `Rate limit exceeded for ${providerId}${retryAfter ? `. Retry after ${retryAfter} seconds` : ""}`,
      "RATE_LIMIT_EXCEEDED",
      providerId
    )
    this.name = "RateLimitError"
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get list of available provider IDs
 * Used in error messages
 */
function getAvailableProviders(): string {
  // This will be populated by the registry
  return "woocommerce (register more providers via registerProvider)"
}
