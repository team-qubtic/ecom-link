# Ecom-Link Progress

> Last updated: 2026-10-20
> Project: Framer plugin connecting Framer with eCommerce platforms (WooCommerce first)
> Current phase: **Specs 001 to 004 implemented. Next: spec 005 (Help Guide).**

## Project Status at a Glance

| Phase (INSTRUCTION.md) | Status |
|---|---|
| 1. Scaffold | Done (pre-existing Framer CLI scaffold, untouched) |
| 2. Preflight research and feature planning | Done (`docs/RESEARCH.md`, `docs/FEATURES.md`) |
| 3. Spec driven development | Done (8 MVP specs in `.specs/`, 11 future specs in `.specs/future/`) |
| 4. Help Guide | Specified (spec 005), not built |
| 5-9. Coding/UI/UX/forms/docs conventions | Binding rules captured in agent files and specs |
| 10. Sub-agents | Done (9 files in `.github/agents/`, verified complete) |
| API verification | Done (`docs/API-NOTES.md`) |
| Implementation | **Specs 001 to 004 implemented** |

---

## What Was Done

### 1. Research and Discovery (`docs/RESEARCH.md`)
Covers every area required by INSTRUCTION.md section 2.1: product goals, use cases (UC-1 to UC-10), personas, pain points, functional/technical specs, error matrix, user flows, sync requirements, expected Woo data structure, Framer integration limits, auth flows, IA, security, scalability, rate limits, and future opportunities.

**Per-platform competitor research** (user-requested, done individually per platform):
- **WooCommerce → Framer**: FeCommerce (free, companion WP "CORS Bridge" plugin, on-page checkout) and FrameWoo (freemium, 15-product free tier, one-time pricing). Neither offers AI or binding-safe identity emphasis.
- **Shopify → Framer**: Framer Commerce (award winner, 40+ components), ShopifyConnect (FeCommerce, free), Shopify CMS Sync (100% free, no backend, direct Storefront API, product-ID identity). Most mature segment.
- **Wix → Framer**: no plugins exist. White space, but blocked by Wix OAuth (backend required).
- **Webflow → Framer**: no live sync; only a one-time CSV CMS migration tool. Webflow sunsetting native ecommerce (platform risk; validates Woo-first).
- **General commerce tools** catalogued (checkout/payments plugins, adjacent not competing).

**Key technical findings**:
- WooCommerce REST API sends no CORS headers; browser-direct calls fail. Writes (PUT/POST) additionally require an `OPTIONS` preflight the store won't answer. Strategy: optional companion WordPress plugin or future proxy (M5).
- Two-way sync verified feasible: `PUT /products/{id}` writes stock (with `manage_stock`), prices, SKU, name, descriptions, status, weight; `POST /products/batch` for bulk. Requires `read_write` keys.
- No researched competitor pushes Framer edits back to the store: two-way sync is a genuine differentiator.

### 2. Feature Planning (`docs/FEATURES.md`)
- **MVP (M1-M11)**: provider abstraction, store connection manager, product import with field mapping, incremental re-sync, CORS helper, first-run Help Guide, AI content assist, error handling/reliability, dashboard/settings, user help docs, two-way sync write-back.
- **Future (F1-F11)**: Shopify/Wix/Webflow providers, managed proxy and background syncs, storefront components, full variant sync, cart/checkout, AI expansions, multi-store, sync rules, web admin, analytics, advanced write-back.

### 3. Architecture (`architecture.md`)
Layered design: views → sync engine → providers → storage → Framer Plugin API. Folder structure for `src/`. Seven key decisions (D1-D7) including no backend in MVP, `woo_id` identity, field-scoped two-way sync, snapshot-based Framer-side change detection, per-project plugin data storage, provider capability flags, asset pipeline for images.

### 4. Sub-Agent Files (`.github/agents/`, 9 files)
`orchestrator`, `planner`, `architect`, `frontend`, `backend`, `security`, `tester`, `reviewer`, `documentation` — all adapted from the Shopify example to Framer plugin scope (e.g. webhooks → manual triggers, metafields → plugin data, scopes → Woo key scopes, app uninstall → plugin re-add). Model set to GLM-5.2 (architect updated by user to `GLM-5.2 (zai)`).

### 5. MVP Specs (`.specs/`, 8 files)
| Spec | Feature(s) | Status |
|---|---|---|
| `001-provider-architecture.md` | M1 provider contract, registry, capability flags | Ready for build |
| `002-store-connection-and-cors.md` | M2+M5 connection, masked credentials, typed errors, CORS/preflight detection | **Implemented 2026-10-03** (amended: CMS-collection storage) |
| `003-product-import-and-sync.md` | M3+M4 paged import, `woo_id` identity, watermark, safety cap, cancellation, reports, Woo adapter | **Implemented 2026-10-04** (see section 11) |
| `004-two-way-sync-write-back.md` | M11 snapshot change detection, preview gate, conflict resolution, batch writes, no-delete rail | **Implemented 2026-10-20** (see section 12) |
| `005-help-guide.md` | M6 first-run guide | Ready for build |
| `006-ai-content-assist.md` | M7 editable AI drafts for empty content | **Blocked: see open question** |
| `007-dashboard-settings-reliability.md` | M8+M9 dashboard, modal router, error sentence mapping | Ready for build |
| `008-help-documentation.md` | M10 six `docs/help/` pages with binding doc rules | Ready for build |

### 6. Future Specs (`.specs/future/`, 11 files)
| Spec | Feature(s) | Status |
|---|---|---|
| `F01-additional-platform-providers.md` | F1 Shopify, Wix, Webflow providers | Documented, not built |
| `F02-managed-proxy-and-background-syncs.md` | F2 Backend proxy, OAuth, background syncs | Documented, not built |
| `F03-storefront-component-library.md` | F3 Drag-and-drop product components | Documented, not built |
| `F04-full-variant-sync.md` | F4 Per-variant items, variation write-back | Documented, not built |
| `F05-cart-and-checkout-in-framer.md` | F5 Native cart and checkout | Documented, not built |
| `F06-ai-expansions.md` | F6 Bulk AI, tone presets, translation | Documented, not built |
| `F07-multi-store-support.md` | F7 Multiple connections per project | Documented, not built |
| `F08-sync-rules-and-scheduling.md` | F8 Conditional rules, automatic syncs | Documented, not built |
| `F09-web-admin-dashboard.md` | F9 Centralized dashboard for agencies | Documented, not built |
| `F10-analytics.md` | F10 Sync metrics, catalog health | Documented, not built |
| `F11-advanced-write-back.md` | F11 Image upload, platform-specific two-way | Documented, not built |

### 7. API Verification (2026-10-03)
Verified `@framer/plugin` v4.1.0 API surface:
- **CMS API**: Full CRUD for collections, items, fields (all field types supported)
- **Assets API**: `addImage()`, `addFile()` for asset management
- **Plugin data storage**: NOT AVAILABLE (no `getPluginData`/`setPluginData`)
- **AI capabilities**: NOT AVAILABLE (no AI/generation methods)
- **Selection & Canvas**: `subscribeToSelection()`, `showUI()`
- **Permissions**: `useIsAllowedTo()` for action checking

**Key findings**:
- No plugin-scoped storage → must use CMS collections for persistence
- No AI APIs → spec 006 (M7) blocked, reduce to stub or defer
- Image handling requires `addImage()` download (D7 in architecture)
- Batch operations available via `batchUpdateItems()`

**Open questions resolved**:
1. AI capability surface: NOT AVAILABLE in v4.1.0
2. Plugin data encryption: Store in CMS collection; document security limitations
3. CMS batch-write size: `batchUpdateItems()` available; test limits during implementation
4. Gallery images cap: Decision needed (recommend 10 images max)

### 8. Spec 002 Implementation (2026-10-03)

**Shipped**: connection CRUD in the internal CMS collection (`src/storage/connections.ts`), WooCommerce validation client with typed errors and retry/backoff (`src/providers/woocommerce/client.ts`), provider registration (`src/providers/woocommerce/index.ts`, product methods stubbed until spec 003), reusable UI (`Switch`, `HelpTooltip`, `Modal`, `Field`, `CredentialFields`), connection flow (`ConnectionModal`), dashboard shell (`Dashboard`, `App.tsx`), tests (`vitest`, mocked CMS + fetch), and two help pages.

**Spec amendment**: storage moved from plugin data (not available in v4) to a dedicated internal CMS collection "Ecom-Link Internal"; architecture D5 updated; spec 002 sections 2, 6, 7, and 8 amended; multi-connection storage with "Set active" recorded as a user-directed F7 slice inside M2.

**Notes for the next run**:
- Run `pnpm install` before `pnpm test`; vitest, jsdom, and @testing-library/react were added as dev dependencies and the lockfile needs a refresh.
- `docs/help/Connections.md` was created per user request; spec 008 expects "Connect Your WooCommerce Store.md". Reconcile the name during spec 008 (rename the page or amend spec 008).
- Security review passed with one standing warning: credentials live in a CMS collection that anyone with CMS access can read, and CMS collections can be queried on published sites if bound to pages. Documented on the Connections help page; revisit if Framer ships plugin-scoped storage.
- The companion WordPress plugin (origin-locked CORS headers, OPTIONS preflight) is still to be scheduled as its own backend task.

### 9. Design System Alignment Pass (2026-10-03)

Restyled the spec 002 UI to match `docs/FRAME_DESIGN_SYSTEM.md`. No behavior changed, so spec 002 functionality and the help pages stay as they are.

- `src/App.css`: spacing normalized to the 4px grid (connection rows, title and badge rows, switch rows, ghost buttons, notice steps), added the missing `.connection-main` stack rule, `.small` text moved to the 13px Small Text token, the active connection row now keeps its highlight on hover, and every button keeps a visible focus ring (inputs keep the border-plus-ring alternative).
- `src/views/ConnectionModal.tsx`: notice title fixed to proper Title Case ("Connection Blocked by the Browser").
- `.github/agents/frontend.agent.md`: design system path corrected to `docs/FRAME_DESIGN_SYSTEM.md`, the file the repo actually contains.
- Help docs unchanged: no labels or flows changed, so `docs/help/Connections.md` remains accurate.

### 10. Spec 001 Test Suite (2026-10-04)

Automated tests for every spec 001 acceptance criterion. Created directly under the Tester contract because the subagent runner was unavailable in the session.

- `src/providers/__tests__/providers.test.ts`: AC1 (registry lookup, typed `ProviderNotFoundError`, duplicate id rejection, `hasProvider`), AC2 (every section 9 field populated over a fixed Woo-shaped fixture, exact key set, platform type normalization, null handling for sale price and unmanaged stock), AC4 (exactly one provider after the barrel loads; a second provider and a read-only provider register with no engine change), plus the runtime halves of AC3 (capability flag guard, write path, resumable pagination).
- `src/providers/__tests__/providers.test-d.ts`: AC3 type-level tests. `EcommerceProvider<false>` types `updateProductFields` as `never`, so an engine call fails compilation (self-verifying `@ts-expect-error` directive plus `expectTypeOf` assertions). The two-way, WooCommerce, and registry (`boolean`) variants stay callable.
- `src/providers/__tests__/mockProvider.ts`: the mock provider fixtures (two-way in-memory provider factory, read-only provider, Woo-shaped raw products, section 9 field list).
- `vitest.config.ts`: typecheck enabled, so `pnpm test` runs tsc over the `.test-d.ts` files in the same run. Compile-time criteria are therefore verified by the default test command.

Note for the Architect: `EcommerceProvider<false>` declares `updateProductFields` as a required property of type `never`, so a read-only provider cannot be authored without a single type assertion (see `mockReadOnlyProvider`). A future amendment making the property optional (`updateProductFields?: never`) would remove that assertion. Surfaced as an observation, not silently resolved.

### 11. Spec 003 Implementation (2026-10-04)

**Shipped**: product import and incremental sync, end to end.

- `src/providers/woocommerce/`: mapper plus the provider product methods (paged product listing and variants) over the spec 002 REST client.
- `src/sync/`: `engine.ts` (paged pull with page size 100, `woo_id` identity matching with upsert in place, caps with pending-write-aware loop guards, cancellation, page-level resume, plan-limit stop, and notes for watermark fallback, safety cap, gallery cap, watermark save failure, rate limit, image, variants, and write failures), `identity.ts`, `watermark.ts` (validating setter plus a raw reader for fallback detection), `report.ts` (status badges, count lines, first 20 failures kept).
- `src/storage/`: `settings.ts` (per-connection mapping, statuses, caps), `snapshots.ts` (baselines for future change detection), `history.ts` (run records).
- UI: `MappingModal` (collection picker, type-aware field mapping with Two-way switches, statuses, the three caps, duplicate-collection notice), `SyncProgress` (page and item counts, cancel that finishes the current page first), `SyncReportModal` (status, counts, notes, retry from page, deleted-products check with confirmed removal), Dashboard card wiring (**Start sync** before first mapping, **Sync now** after).
- Tests: engine, watermark, settings, snapshots, history, mapper, client, provider, card, permissions, and string-rule suites; 145 tests across 14 files, all green.
- Docs shipped same run: new `docs/help/Sync Products.md` and a refreshed "What Comes Next" section in `docs/help/Getting Started.md`.
- `src/App.tsx`: plugin window set to the binding minimum (350px wide, 600px min height).

**Notes for the next run**:
- The mapping wizard is first-run only; once settings exist, the card syncs with the saved mapping. Editing mapping and caps after the first run arrives with the spec 007 settings screen, which the in-app safety-cap note already references ("Settings").
- The watermark advances only after a fully successful run; paused runs resume from the failed page and cover everything unconfirmed.
- Re-running after a safety-cap stop is by design: unchanged items are skipped but still counted toward the cap, so very large stores complete across several runs as the limit is raised.
- Spec 008 lists a "Sync Products.md" page; it now exists, so spec 008 only needs to reconcile the Connections page name and add the remaining pages.

### 12. Spec 004 Implementation (2026-10-20)

**Shipped**: two-way sync write-back, end to end.

- `src/sync/conflict.ts`: platform value equality with numeric coercion for number fields, snapshot classification into local/remote/both edits, pending change shaping, per-product grouping, CMS-to-platform coercion, display truncation, and field labels for the review UI.
- `src/providers/woocommerce/`: write path with a single `PUT /products/{id}` under 10 changed products and `POST /products/batch` (100 per batch) above it, null-aware payloads (null sale price clears the sale, `manage_stock` follows the quantity), and a write preflight against read-only keys.
- `src/sync/engine.ts`: push phase after every clean pull, review gate that stops the run for merchant confirmation, Framer-only items never sent to the store, no-delete rail (store removals never delete CMS items), per-write snapshot refresh so each edit is offered exactly once, and the watermark advancing only after a clean run.
- `src/sync/report.ts` + `SyncReportModal`: "Store Changes" extension lines so write results land in the same run report.
- UI: `WriteBackReviewModal` + `WriteBackDiff` change table with per-row Keep/Send decisions, `ConflictResolutionModal` for both-sides conflicts, `MappingModal` writable-field gating with a read-only notice, `ConnectionModal` key-scope upgrade flow.
- Tests: 180 across 15 files, all green (+35 over spec 003).
- Docs shipped same run: new `docs/help/Sync Inventory Both Ways.md` plus cross-links in `docs/help/Sync Products.md` and `docs/help/Connections.md`.

**Notes for the next run**:
- Woo `writableFields` intentionally omits `price`: WooCommerce computes it from regular and sale price, so writes send `regular_price` and `sale_price` only.
- Nullable number fields (sale price, stock quantity) push null to clear the store value; required fields (price, regular price) drop empty Framer values so the store keeps its price and the next pull restores it in Framer.
- Status fields accept only their store values; any other Framer text is omitted and the store keeps its own status.
- The vitest typecheck pass is stricter than the editor TS server, and truncated terminal output can hide "Unhandled Source Error" blocks: when a run exits with code 1, inspect the full output for errors under `src/` before treating them as node_modules noise.

---

## Open Questions (resolve before/during build)

1. ~~**BLOCKING (spec 006)**: Confirm the exact AI capability surface in `@framer/plugin` v4~~ **RESOLVED 2026-10-03**: AI APIs NOT AVAILABLE in v4.1.0. Spec 006 (M7) must be reduced to stub or deferred to post-MVP.
2. (spec 002) Plugin-data encryption for secrets: depends on what `@framer/plugin` v4 exposes; otherwise store in plugin data with masked reads and flag for Security review. **Status**: **RESOLVED 2026-10-03**. No plugin-scoped storage exists; connections are stored in the internal CMS collection with masked reads everywhere, Security-reviewed, and the limitation documented on the Connections help page.
3. (spec 003) Framer CMS API batch-write size: measure during implementation; engine yields between writes regardless. **Status**: **RESOLVED 2026-10-04**: the engine batches per-page writes and yields between pages; the item safety cap keeps batches at or below the page size of 100. Real-store limits get a final check in the release pass.
4. (spec 004) Gallery images cap (proposed 10) needs a decision. **Status**: **RESOLVED 2026-10-04**: the default gallery cap is 10, adjustable in the mapping wizard.
5. (spec 004) Price decimal round-trip normalization (Woo returns strings like "21.99"); needs a fixture test. **Status**: **RESOLVED 2026-10-20**: `cmsValueToPlatform` applies numeric coercion to number fields before comparison, and fixture tests cover the round trip (raw "21.99" in Framer compares equal to 21.99 from the store; a mismatched 19.99 is still detected).
6. (spec 008) Docs hosting location beyond the repo: release checklist item, not MVP code. **Status**: Deferred to release.

---

## Next Tasks (in order)

### Task 1: Verify `@framer/plugin` v4 API surface ✅ DONE
- Explored `node_modules/@framer/plugin` v4.1.0 type definitions
- Created `docs/API-NOTES.md` with full API surface documentation
- **Key findings**: CMS API fully available, Assets API available, NO plugin-scoped storage, NO AI APIs
- **Impact**: Spec 006 (M7 AI content assist) blocked; reduce to stub or defer
- **Storage strategy**: Use CMS collections for plugin data (connections, snapshots, history)

### Task 2: Implement spec 001 (foundation) ✅ DONE
- ✅ `src/providers/types.ts` (contracts, `NormalizedProduct`, error classes)
- ✅ `src/providers/registry.ts` (registerProvider, getProvider, listProviders, hasProvider, clearProviders)
- ✅ `src/providers/index.ts` (barrel export)
- ✅ Type-level enforcement: `EcommerceProvider<TSupportsTwoWay>` generic encodes two-way sync capability at compile time
- ✅ All acceptance criteria verified:
  1. Registry lookup with ProviderNotFoundError ✓
  2. Product mapping contract defined ✓
  3. TypeScript rejects updateProductFields on read-only providers ✓
  4. listProviders() returns registered providers ✓

### Task 3: Implement spec 002 (connection + UI foundations) ✅ DONE
- ✅ `src/storage/connections.ts` (CMS-backed CRUD, masked reads, active switching, revalidate, delete)
- ✅ `src/providers/woocommerce/client.ts` (validation probe, `AuthError`, `NotWooError`, `CorsError`, retry/backoff, OPTIONS preflight)
- ✅ `src/providers/woocommerce/index.ts` + registry wiring; product methods stubbed until spec 003
- ✅ Reusable UI: `src/components/ui/Switch.tsx`, `HelpTooltip.tsx`, `Modal.tsx`, `Field.tsx`, `src/components/connection/CredentialFields.tsx`
- ✅ `ConnectionModal`, `Dashboard` shell, `App.tsx` modal state, `App.css` design system
- ✅ Tests: `vitest.config.ts`, client + storage + component + string-rules suites (`pnpm install` then `pnpm test`)
- ✅ Docs shipped same run: `docs/help/Getting Started.md`, `docs/help/Connections.md`
- Form handling: no form library added (Orchestrator decision); native form submit with typed handlers, matching the Form Actions pattern within available dependencies.

### Task 4: Implement spec 003 (Woo adapter + sync engine) ✅ DONE
- ✅ `src/providers/woocommerce/` (client, mapper, provider product methods)
- ✅ `src/sync/` (engine, identity, watermark, report) + `src/storage/` (snapshots, history, settings)
- ✅ MappingModal, SyncReportModal, SyncProgress, Dashboard card wiring
- ✅ Tests green: 145 tests across 14 files
- ✅ Docs shipped same run: `docs/help/Sync Products.md`
- Companion WordPress plugin source (CORS helper) still to be scheduled.

### Task 5: Implement spec 004 (two-way sync) ✅ DONE
- ✅ `src/sync/conflict.ts`: change detection, pending changes, per-product grouping, labels
- ✅ WooCommerce write path: single PUT, batch POST, null-aware payloads, write preflight
- ✅ Engine push phase: review gate, no-delete rail, snapshot refresh, watermark guard
- ✅ `WriteBackReviewModal` + `WriteBackDiff`, `ConflictResolutionModal`
- ✅ `MappingModal` two-way limits, `ConnectionModal` key upgrade flow
- ✅ Report "Store Changes" extension; help page `Sync Inventory Both Ways.md` + cross-links
- ✅ Tests green: 180 tests across 15 files (see section 12)

### Task 6: Implement specs 005 + 006 (Help Guide + AI)
- HelpGuide modal + first-run detection (005)
- AI content assist once Task 1 resolves the blocking question (006).

### Task 7: Implement spec 007 (dashboard complete, settings, reliability)
- `toUserSentence` error mapping, settings form, run history.

### Task 8: Write spec 008 docs
- Six `docs/help/` pages, shipped alongside their features (rule: docs ship with code; ideally each task above includes its doc page rather than leaving them all to the end).

### Task 9: Testing and review passes
- Tester agent: acceptance criteria → tests (error matrix, idempotency, write rails)
- Reviewer + Security agents: conventions, UX writing rules, credential handling.

### Task 10: Companion WordPress plugin + packaging
- CORS companion plugin source and its docs page
- `pnpm pack` (framer-plugin-tools), manual test against a real WooCommerce store (production CORS behavior must be verified outside the dev toolbar).

---

## Conventions Cheat Sheet (binding, from INSTRUCTION.md)

- Function declarations only; avoid arrow functions (section 5)
- Reusable components in `src/components/`; boolean toggles always `Switch.tsx`, never Checkbox (section 6)
- Modals over routes; rules are the only future exception (section 6)
- UX writing: Title Case headings, sentence case buttons/labels, no em/en-dashes in UI strings, friendly labels not enums, proper pluralization, sentences capitalized and end with a period (section 7)
- Forms: best hook + Form Actions (section 8)
- Help docs: you/your POV, visible `[Screenshot]` placeholders, Video tutorial section per page, future-tense outcomes, no "we/us/our", no em-dashes, docs ship with code (section 9)
- MVP scope only: M1-M11. F1-F11 are documented, not built (section 2.2)

## Current Work (2026-10-03)

### Just Completed
- ✅ Tasks 1 to 3: API verification, spec 001 provider architecture, spec 002 connection manager with UI foundations and tests
- ✅ Design system alignment pass on the spec 002 UI against `docs/FRAME_DESIGN_SYSTEM.md` (4px grid, focus rings, active-row hover fix, Title Case fix)

### Next Up
- 🔄 **Task 4: Implement spec 003 (Woo adapter + sync engine)**
  - `src/providers/woocommerce/` mapper + product methods
  - `src/sync/` engine, identity, watermark, report
  - MappingModal, SyncReportModal, SyncProgress

### In Progress
- None (ready to start Task 4)

---

## Current Work (2026-10-04): True CSS Modules Migration

Restructured all plugin styles under `src/assets/styles/` and converted every component to
scoped CSS Modules (hashed class names), eliminating the monolithic 1272-line `App.css`.

### New Style Architecture
- `src/assets/styles/variables.css`: all design tokens, dark on `:root` + `[data-theme="dark"]` + `[data-framer-theme="dark"]`, light on `[data-theme="light"]` + `[data-framer-theme="light"]`.
- `src/assets/styles/global/global.css`: shared global styles only (reset, body + mesh background, badges, buttons, notices, toggle rows, text helpers, scrollbar, focus rings).
- `src/assets/styles/module/*.css`: one CSS module per component (Card, Field, CredentialFields, Switch, HelpTooltip, ConnectionModal, Dashboard, ConnectionPage).
- `src/App.css`: pure 13-line aggregator (Google Fonts import + variables.css + global.css). `App.tsx` still imports it.

### Converted Files
- 8 components/views now import their `*.module.css` and use the imported styles object for every component-scoped class; shared global classes (`.btn`, `.badge`, `.notice`, `.muted`, `.small`, `.toggle-row`, `.icon-button`) remain plain strings in JSX.
- `Card.tsx` uses `BACKGROUND_CLASS` / `PADDING_CLASS` lookup Records with a small `joinClasses` helper.
- `Dashboard.tsx` and `ConnectionPage.tsx` bridge into global classes via `:global()` where a module rule must target them (e.g. `.emptyCard :global(.muted)`, `.formActions :global(.btn) { flex: 1; }`).
- `Switch.tsx` cascade guards moved to the module: `.switch .switchInput` (0,2,0) still beats framer.css `input[type="checkbox"]` (0,1,1); the input overlays the track with `z-index: 1` and the track is `pointer-events: none`.
- `ui.test.tsx` Card background test now asserts via the imported `cardStyles` object instead of hardcoded kebab-case class names.

### Docs Updated
- `INSTRUCTION.md`: design tokens path and Switch styling reference now point to the new files.
- `docs/FRAME_DESIGN_SYSTEM.md`: CSS variables reference points to `src/assets/styles/variables.css`.

---

## Current Work (2026-10-20): Spec 004 Two-Way Sync Write-Back

### Just Completed
- ✅ Task 5: spec 004 two-way sync write-back, end to end (see section 12)
- ✅ Full validation: 180 tests across 15 files; remaining typecheck noise is the accepted node_modules and pre-existing-cast list only

### Next Up
- 🔄 **Task 6: Implement specs 005 + 006 (Help Guide + AI)**

### In Progress
- None (ready to start Task 6)

---

## File Map

```
INSTRUCTION.md                 # binding project instructions
architecture.md                # layered design, decisions D1-D7
PROGRESS.md                    # this file
README.md                      # project overview
docs/
  RESEARCH.md                  # all research incl. per-platform competitors
  FEATURES.md                  # MVP (M1-M11) vs Future (F1-F11)
  API-NOTES.md                 # Framer plugin API v4.1.0 findings (NEW 2026-10-03)
.specs/
  001..008                     # MVP specs (ready for build)
  future/                      # Future specs (documented, not built)
    F01-additional-platform-providers.md
    F02-managed-proxy-and-background-syncs.md
    F03-storefront-component-library.md
    F04-full-variant-sync.md
    F05-cart-and-checkout-in-framer.md
    F06-ai-expansions.md
    F07-multi-store-support.md
    F08-sync-rules-and-scheduling.md
    F09-web-admin-dashboard.md
    F10-analytics.md
    F11-advanced-write-back.md
.github/agents/*.agent.md      # 9 sub-agent definitions (verified complete)
src/                           # untouched scaffold (App.tsx, main.tsx)
```
