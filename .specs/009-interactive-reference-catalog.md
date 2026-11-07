# 009. Interactive Reference Catalog

## Problem

The existing filterable listing creates static canvas layers. Its filter controls cannot change results, and fixed card dimensions produce a broken layout. Replace this insert with an interactive product listing section matching the grid and filters in the supplied Shopora reference, while leaving other insert types unchanged. The insert must fit into an existing page, not generate a full storefront page.

## Design and Data

- Listing section only: search, six collapsible sidebar filters, four desktop product columns, lavender image stages, prices/ratings, quick view, wishlist, sorting, and pagination. No site header, footer, navigation, or title banner.
- `ListingConfig.title` is an accessible catalog label, defaults to `Products`, and is edited as **Catalog label**, not rendered as a visible page title. No site-brand or header/footer visibility settings are exposed. Product-brand filters remain supported; currency and products per page remain configurable.
- Responsive container queries adapt the inserted component independently of the plugin's fixed 350px window.
- Generated components prefer fixed width and use a 1280px root fallback when Framer supplies no width or an automatic width. Inline-size containment cannot contribute intrinsic width during shrink-to-fit measurement. Preserve explicit numeric/percentage widths and other Framer styles; keep height automatic.
- Plugin settings select a public CMS collection and enabled filters, labels, display types, and CMS field IDs. Search fields are configurable.
- Read path: CMS collection and saved field mapping -> public normalized product snapshot. Include safe public scalar/list fields and resolved public reference labels. Never include internal collection records, credentials, or raw SDK objects.
- Write path: create a new code file and insert its component export. Do not overwrite existing files or delete previous canvas work. Expose equivalent editable Framer property controls, including CMS column options.
- Snapshot maximum: 5,000 items, with a visible error rather than truncation. Filter/search all snapshot products before pagination. No browser calls to the plugin SDK or authenticated WooCommerce API.
- Scope is explicitly requested extension of F3 for the product listing grid section only. Site chrome remains the responsibility of the surrounding Framer page. No checkout or account backend is implemented.

## Acceptance Criteria

1. Query words match configured search fields case-insensitively.
2. Options combine OR within a facet and AND across facets; disabled facets do not filter.
3. Rating/discount thresholds and nonoverlapping price buckets match numeric CMS values; missing values do not become zero.
4. Counts reflect remaining facets; clearing resets search, selected filters, and wishlist mode.
5. Sort, grid/list, pagination, show-more, mobile filters, wishlist, and Escape-dismissible quick view work.
6. Generated source is self-contained except React/Framer imports, has property controls, and embeds only public snapshot values.
7. Insertion checks permissions and retains prior user work on success and failure.
8. Empty selected CMS stays empty; internal collections cannot be selected; oversized catalogs fail clearly.
9. Missing/automatic width renders at 1280px even inside shrink-to-fit or absolute auto-width parents. Explicit 350px and 100% widths remain responsive without horizontal overflow; supplied style objects are not mutated.
10. The insert has no site header, footer, navigation, or title banner. Settings and generated property controls omit site-brand/header/footer options, retain product-brand filtering, and expose **Catalog label** for the accessible section name.

## Lifecycle

Uninstall/reinstall leaves inserted code files and layers intact. No paid-plan behavior or webhooks are added. Repeat insertion explicitly creates a fresh snapshot. CMS edits become visible only in a new insert; publish the desired instance afterward. Existing generated inserts also retain their original code, including any full-page chrome; insert a new listing and transfer custom settings before manually replacing the old instance to pick up listing-only changes.

## Validation

Unit tests cover filter logic, CMS normalization, component interactions, settings, generated source, and insertion API boundary. Browser geometry and actual Framer compilation require separate visual/host checks.
