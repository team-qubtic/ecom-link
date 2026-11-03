/**
 * Provider Module - Platform provider abstraction layer
 *
 * This module exports all types, interfaces, and functions needed to work with
 * eCommerce providers. It provides a platform-agnostic interface that allows
 * the plugin to support multiple platforms (WooCommerce, Shopify, Wix, etc.)
 * without changing the sync engine or UI logic.
 *
 * @module providers
 */

// Side effect: register the built-in providers. WooCommerce is the only v1
// provider, and importing this barrel is all callers need to do.
import "./woocommerce"

// ============================================================================
// Type Exports
// ============================================================================

export type {
  NormalizedProduct,
  NormalizedProductField,
  NormalizedVariation,
  ProductCategory,
  ProductImage,
  ProductAttribute,
  FieldMapping,
  ProviderCapabilities,
  CredentialField,
  Credentials,
  ListProductsQuery,
  ListVariationsQuery,
  ListProductsResult,
  ProductUpdateFields,
  ProductBatchUpdate,
  EcommerceProvider,
} from "./types"

// ============================================================================
// Error Exports
// ============================================================================

export {
  ProviderError,
  ProviderNotFoundError,
  InvalidCredentialsError,
  ConnectionError,
  ProductNotFoundError,
  RateLimitError,
} from "./types"

// ============================================================================
// Registry Exports
// ============================================================================

export {
  registerProvider,
  getProvider,
  listProviders,
  hasProvider,
  clearProviders,
} from "./registry"

// ============================================================================
// WooCommerce Provider Exports
// ============================================================================

export {
  wooCommerceProvider,
  AuthError,
  NotWooError,
  CorsError,
  TransientError,
} from "./woocommerce"
