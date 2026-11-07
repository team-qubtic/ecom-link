# Ecom-Link Architecture

> Living document. The Architect agent updates it when a decision changes it. Specs in `.specs/` must stay consistent with this file.

## 1. What this is

A Framer plugin (React + TypeScript + Vite, `@framer/plugin` v4) that syncs product data between eCommerce platforms (WooCommerce first) and Framer CMS. Free app, MVP scope = `docs/FEATURES.md` M1–M11 only.

## 2. Layered, provider-based design

```
┌──────────────────────────────────────────────────┐
│ Views (src/views/*) + reusable UI (src/components/*)│  React, modals, Framer best practices
├──────────────────────────────────────────────────┤
│ Sync engine (src/sync/*)                          │  pull, push, identity, watermark,
│                                                   │  conflicts, reports, cancellation
├──────────────────────────────────────────────────┤
│ Provider layer (src/providers/*)                  │  EcommerceProvider contract;
│                                                   │  woocommerce is the only v1 impl
├──────────────────────────────────────────────────┤
│ Storage (src/storage/*)                           │  connections, snapshots, sync
│                                                   │  history in plugin data (per project)
├──────────────────────────────────────────────────┤
│ Framer Plugin API (@framer/plugin)                │  CMS, Assets, plugin data
└──────────────────────────────────────────────────┘
```

Dependency rule: views → sync → providers → platform APIs. Views never call platform APIs directly. The sync engine never imports a provider by name; it consumes the `EcommerceProvider` contract from `src/providers/types.ts`.

## 3. Folder structure

```
src/
  App.tsx                 # shell: dashboard + modal router state
  main.tsx
  components/
    ui/                   # Switch, HelpTooltip, Field, Button, Modal, etc.
    connection/           # ConnectionCard, CredentialFields
    mapping/              # FieldMappingRow, DirectionSwitch
    sync/                 # SyncProgress, SyncReportView, WriteBackDiff
  providers/
    types.ts              # EcommerceProvider, NormalizedProduct, capability flags
    registry.ts           # register/get providers by id
    woocommerce/
      client.ts           # REST client: pagination, retry, backoff, CORS errors
      mapper.ts           # Woo product JSON -> NormalizedProduct
      index.ts            # provider implementation
  sync/
    engine.ts             # runPull, runPush, orchestration, cancel
    identity.ts           # woo_id matching, create-vs-update
    watermark.ts          # last-sync watermark handling
    conflict.ts           # both-sides-changed detection + resolution results
    report.ts             # per-run report model, last N runs
  storage/
    connections.ts        # credentials in the internal CMS collection
                          # (masked reads), connection settings
    snapshots.ts          # per-item two-way field snapshots
    history.ts            # sync run history
  ai/
    contentAssist.ts      # missing-content detection, draft generation, apply
  views/
    Dashboard.tsx
    HelpGuide.tsx
    ConnectionModal.tsx
    MappingModal.tsx
    SyncReportModal.tsx
    WriteBackReviewModal.tsx
    ConflictResolutionModal.tsx
    SettingsModal.tsx
```

## 4. Key decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rationale                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D1  | No backend in MVP. Direct plugin → WooCommerce REST calls.                                                                                                                                                                                                                                                                                                                                                                                                                            | Free app, simple, honest. CORS handled via companion WP plugin guidance (spec 002). |
| D2  | Identity = platform product id stored in a CMS field (`woo_id`).                                                                                                                                                                                                                                                                                                                                                                                                                      | Items update in place; canvas bindings never break.                                 |
| D3  | Two-way sync is field-scoped, opt-in per field, preview-before-write.                                                                                                                                                                                                                                                                                                                                                                                                                 | Safety rails from `docs/RESEARCH.md` 8.1.                                           |
| D4  | Change detection: Woo side = `date_modified` watermark; Framer side = value snapshots per two-way field.                                                                                                                                                                                                                                                                                                                                                                              | Verified feasible in research section 8.1.                                          |
| D5  | Plugin-owned data (connections, snapshots, history) lives in a dedicated internal CMS collection ("Ecom-Link Internal") because `@framer/plugin` v4 has no plugin-scoped storage (verified 2026-10-03, `docs/API-NOTES.md`). Reads that reach views are masked; full secrets only ever travel to the store's own endpoint as Basic auth headers. Known MVP limitation: the collection is readable by project CMS users; accepted for the free MVP and flagged in the Security review. | Security and least privilege within the API surface Framer actually offers.         |
| D6  | Provider contract has capability flags (`supportsTwoWaySync`, writable fields list).                                                                                                                                                                                                                                                                                                                                                                                                  | Shopify/Wix/Webflow slot in without engine changes.                                 |
| D7  | Images downloaded through the asset pipeline into Framer assets.                                                                                                                                                                                                                                                                                                                                                                                                                      | External URLs break on publish (research 10.2).                                     |

## Interactive Storefront Catalog (Spec 009)

The Filterable listing insert uses `storefront/listingCatalog.ts` to read a public CMS snapshot, `listingModel.ts` for normalization-independent filter/search rules, and `ShoporaListing.tsx` with scoped styles for the responsive product listing section. `insertListing.ts` packages these into a standalone Framer code file with editable property controls. It creates a fresh component instance without deleting existing code or layers. The insert contains only the listing grid, search, filters, and related product interactions, not a site header, footer, navigation, or title banner. The plugin settings panel selects the collection and maps search/filter controls to public field IDs. `ListingConfig.title` defaults to `Products` and is exposed as **Catalog label** for the accessible section name, not a visible page title. Site-brand and header/footer settings are omitted; product-brand filters, currency, and page size remain configurable. No plugin SDK or authenticated store API is used on the published site. Snapshots are limited to 5,000 products and must be reinserted to refresh CMS changes. Existing generated inserts do not update with the plugin; to pick up the listing-only design, insert a new listing, transfer custom settings, and manually replace the old instance. Other insert types still use the existing native canvas builders.

## 5. Conventions (binding)

- Function declarations only (`function name() {}`); arrow functions only where `this` or inline callbacks demand it (INSTRUCTION.md §5).
- Reusable UI in `src/components/`; boolean toggles always `components/ui/Switch.tsx` (§6).
- Modals over routes in the MVP (§6); rules-on-routes applies only to future sync rules (F8).
- UX writing rules §7 and help doc rules §9 apply to every user-facing string and page.
- Specs: one numbered file per feature in `.specs/`, MVP first (§3).
