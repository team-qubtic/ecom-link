# Ecom-Link Features

> Derived from `docs/RESEARCH.md`. This file is the source of truth for spec generation (INSTRUCTION.md section 3): MVP specs first, future features later.
>
> MVP scope: WooCommerce ↔ Framer, free app, reliable and simple, with AI features and two-way sync for inventory, pricing, and basic content included.

## MVP Features

These are the features required for the first usable release. Development focuses exclusively on these unless a future feature is technically required to support the MVP architecture (marked "architecture-required").

### M1. Platform Provider Abstraction (architecture-required)

A provider interface so WooCommerce is one implementation, not the whole app.

- `EcommerceProvider` contract: provider id, display name, capabilities, credential schema, validation, product fetching (paged), product → normalized product mapping, and an optional write path (single and batch product field updates) behind a `supportsTwoWaySync` capability flag.
- Normalized product model covering the fields in `docs/RESEARCH.md` section 9.
- Provider registry; "WooCommerce" is the only registered provider in v1.
- UI and sync engine depend only on the contract and normalized model.

### M2. Store Connection Manager

Connect a WooCommerce store from inside the plugin.

- Store URL input with normalization (HTTPS enforced, localhost dev exception).
- Consumer key / consumer secret inputs (`read` scope for one-way sync; `read_write` requested only when two-way sync is enabled, with a plain explanation of what it allows).
- Connection validation against a cheap endpoint with actionable error sentences.
- Credentials stored in plugin data for the project; masked display (`ck_••••1234`); disconnect clears them.
- Connection status card on the dashboard: store URL, status, last validation time.

### M3. Product Import into Framer CMS

One-time full import of the catalog into a CMS collection.

- Target selection: create a new collection (recommended schema) or map onto an existing one.
- Field mapping UI with type-aware suggestions (Woo field → CMS field), validated before sync (blocking messages on type mismatch).
- Per-field direction setting: one-way (Woo → Framer, default) or two-way (Switch), offered only for fields the provider can write.
- Default recommended schema: `woo_id`, title, slug, permalink, description (rich), short description, SKU, price, regular price, sale price, on sale (Switch/boolean), stock status, stock quantity, categories, tags, featured image, gallery, attributes JSON, variants JSON, rating, rating count, last modified.
- Fetch with pagination (`per_page=100`, honor `X-WP-TotalPages`), cancellable.
- Images downloaded into Framer assets (featured image and gallery), not left as external URLs.
- Imported items honor a default status setting (draft by default, publish optional).
- Filters: product statuses to include (default `publish`); optional on-sale-only and stock-status filters.
- First-sync safety cap (configurable item limit) for very large catalogs.

### M4. Incremental Re-Sync

Repeatable syncs that update only what changed.

- Watermark from Woo `date_modified` (GMT); incremental pass on "Sync now".
- Framer-side change detection through per-item snapshots of two-way field values, so local CMS edits are detected and queued for write-back (see M11).
- Stable identity via `woo_id`: matched items are updated in place, never deleted/recreated (canvas bindings never break).
- Idempotent re-runs (no duplicates).
- Fallback to full pass if the watermark is missing or invalid.
- Optional, explicit cleanup action: list items whose Woo products no longer exist and remove them on confirmation only.
- Sync report per run: created / updated / skipped / failed counts, expandable failure list, last N runs kept.

### M5. CORS Connection Helper

Because WooCommerce does not send CORS headers (research section 10.2).

- Automatic CORS failure detection during validation, with a plain-language explanation.
- Guidance path: install our free companion WordPress plugin (adds a locked-down CORS header for the Framer plugin origin only, and answers `OPTIONS` preflight so write-back works) or ask the host to allow the origin.
- Write-back preflight check: when two-way sync is enabled, validation also tests a CORS preflight (`OPTIONS`) and reports whether `PUT`/`POST` are allowed.
- Connection settings field for the companion plugin base URL once installed.
- Direct mode remains the default path; no backend is required for the core flow.

### M6. Help Guide (first run)

Required by INSTRUCTION.md section 4.

- Shows automatically on first install; reopenable from the help icon anytime.
- Covers: what the plugin does, what you need before starting (store URL, REST API keys with read scope, HTTPS), step-by-step key generation in WooCommerce (Settings → Advanced → REST API), how sync works, what happens to manual CMS edits on re-sync, where the docs live.
- Video tutorial placeholder included per docs conventions.

### M7. AI Content Assist (AI requirement for MVP)

Covers the "MVP includes AI features" directive.

- Detect synced items with empty short description / SEO title / SEO description.
- "Generate missing content" action per item and as a batch for the filtered set.
- AI drafts open in a review modal: editable before applying, apply writes only to the AI target fields.
- Woo-mapped fields are never overwritten by AI output.
- AI settings toggle (enable/disable) using the Switch component, with a transparency note about generated content.

### M8. Error Handling and Sync Reliability

- The error matrix from research section 6.4 implemented end to end: 401/403, bad URL, CORS, 429/5xx backoff (max 3 attempts), partial page failure with resume, image failure without item failure, field mismatch pre-validation.
- All errors as full actionable sentences; no raw codes or enums in UI.
- Progress UI during sync with cancel; partial progress persists on cancel.

### M9. Dashboard and Settings

- Dashboard: connection card, sync controls (Sync now, View report), last sync time, item cotwo-way sync toggle, unts, AI assist entry point.
- Settings: default item status (draft/publish), product statuses to sync, sync safety cap, AI toggle.
- Reusable UI components under `src/components/`; boolean toggles always use the Switch component; modals for all flows (no dedicated routes in MVP).

### M10. User-Facing Help Documentation

Per INSTRUCTION.md section 9, shipped with the MVP code:

- `docs/help/`: Getting Started, Connect Your WooCommerce Store, Sync Products, Sync Inventory Both Ways, Fix Connection Problems, AI Content Assist.
- Each page: you/your voice, visible screenshot placeholders, Video tutorial section, future-tense outcomes, no "we", no em-dashes.

### M11. Two-Way Sync (Framer → WooCommerce Write-Back)

Push edits made in Framer CMS back to WooCommerce, field by field.

- Writable fields in v1: stock quantity (with manage stock), regular price, sale price, SKU, name, description, short description, status, and weight. Images and variations stay read-only in v1.
- Per-field two-way direction in the mapping UI (Switch, default off).
- Change detection on both sides: Woo `date_modified` watermark plus stored snapshots of two-way field values; only changed fields are written, and snapshots refresh after a successful write.
- Outgoing changes are always previewed first ("Review changes" list showing field, current Woo value, new value) and applied only on explicit confirmation.
- Conflict resolution modal when a field changed on both sides since the last sync: choose the Woo value or the Framer value; unresolved conflicts default to the Woo value and appear in the sync report.
- Requires `read_write` API keys; permission errors on write produce a full-sentence explanation and the key upgrade path.
- CORS for writes is detected (failed preflight) with guidance to the companion plugin or proxy (extends M5).
- Safety rails: never deletes Woo products, never writes fields outside the enabled set, groups changes per product (one `PUT` per product, `POST /products/batch` for large sets), and the sync report includes write-back results (updated in Woo, failed).

## Future Features

Documented but **not implemented** during the MVP phase.

### F1. Additional Platform Providers

- Shopify provider (Storefront API, read-only, direct calls; first planned port; two-way via Admin API once the OAuth backend exists).
- Wix provider (requires OAuth backend).
- Webflow provider (platform risk noted; low priority).
- Other platforms (BigCommerce, Squarespace, PrestaShop, Magento).

### F2. Managed Proxy and Background Syncs

- Free managed proxy for CORS-free connections and Woo Application Authentication Endpoint (one-click key generation), and an authenticated write path for two-way sync on every platform.
- Scheduled/background syncs and webhook-driven syncs (product updated/deleted events) via the backend.

### F3. Storefront Component Library

- Drag-and-drop Product Listing, Product Page, Variant Selector, Price, Stock badge, Add to Cart link-out components wired to synced CMS data.
- Requested extension (spec 009): Filterable listing now inserts only an interactive Shopora-style product listing section with search, configurable CMS-column filters (including product brand), sorting, pagination, wishlist, and quick view. It does not add a site header, footer, navigation, or title banner. **Catalog label** (default **Products**) names the section for assistive technology; currency and page size remain configurable, without site-brand or header/footer settings. It uses a public CMS snapshot refreshed on insertion, not a live collection binding. Existing generated inserts must be replaced with a new insertion to pick up these changes; transfer custom settings before manually replacing the old instance. Other existing insert types remain unchanged.

### F4. Full Variant Sync

- Per-variant items or a proper variant structure (variable products' N+1 variations loop, per-product caps removed).
- Variation-level stock and price write-back to WooCommerce.

### F5. Cart and Checkout in Framer

- On-page cart and checkout using the WooCommerce Store API; payment integrations (Stripe, COD, etc.); heavy security review prerequisite.

### F6. AI Expansions

- Bulk AI pass with tone presets, product image alt-text generation, translation/localization of synced content, category-aware copy.

### F7. Multi-Store Support

- Multiple connections per project (agencies managing several client stores), per-connection collections.

### F8. Sync Rules and Scheduling

- Rule create/edit on dedicated routes (per INSTRUCTION.md section 6 exception): auto-publish rules, field transform rules, filter rules per collection.

### F9. Web Admin Dashboard

- External dashboard: connections across projects, sync history, alerts, team access.

### F10. Analytics

- Sync analytics (items synced over time, failure rates) and commerce insights surfaced in the plugin.

### F11. Advanced Write-Back

- Image and gallery upload from Framer assets to the WooCommerce media endpoint.
- Scheduled automatic two-way sync (no button press).
- Two-way sync for Shopify (Admin API inventory), Wix (Catalog API write), and Webflow once their providers and OAuth backends exist.
