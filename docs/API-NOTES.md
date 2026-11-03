# Framer Plugin API v4.1.0 - Key Findings

> Verified: 2026-10-03. Re-verified 2026-10-19 against `node_modules/@framer/plugin/dist/index.d.ts` after a typia assertion crash traced the CMS notes to an imagined API surface.

## CMS API (Collections)

**Available**: Full CMS CRUD operations through a **class-shaped** API. Collections and items are class instances with methods; there are no free functions like `framer.createItem` or `framer.getItems(collectionId)`. All SDK inputs are runtime-asserted with typia, so passing a wrong shape throws `Error on typia.createAssert(): invalid type on $input[0], expect to be string` instead of a helpful message.

### Collections
- `framer.getCollections()` - list all collections as `Collection[]`
- `framer.createCollection(name: string)` - create collection. The name is a plain string, not an object
- `collection.setAsActive()` - select this collection in the Framer UI
- `collection.navigateTo()` - reveal the collection in the editor

### Collection Fields
- `collection.getFields()` - list fields as `Field[]`
- `collection.addFields(fields: CreateField[])` - create fields, e.g. `[{ type: "string", name: "Name" }]`
- `collection.removeFields(fieldIds: string[])` - remove fields by ID
- `collection.setFieldOrder(fieldIds: string[])` - reorder fields
- `field.setAttributes({ name })` - rename a field

### Collection Items
- `collection.getItems()` - list all items as `CollectionItem[]`. No pagination options exist
- `collection.addItems(items: CollectionItemInput[])` - create or update many items in one call. An item with an `id` updates that item; an item without an `id` is created and requires a unique `slug`. Returns `void`, so re-read with `getItems()` to learn created IDs
- `collection.removeItems(itemIds: string[])` - remove items by ID
- `collectionItem.setAttributes({ slug, fieldData })` - update one item
- `collectionItem.remove()` - remove one item

### Field Data Keys

`fieldData` is keyed by **field ID**, never by field name. Read `collection.getFields()` first, build a name to ID map, and translate on every read and write. Typed entries look like `{ type: "string", value: "Text" }`, `{ type: "number", value: 29.99 }`, and `{ type: "boolean", value: true }`.

### Field Types Supported
- `string` - text
- `number` - numeric
- `boolean` - true/false
- `date` - date/time
- `formattedText` - HTML/rich text
- `image` - image asset
- `file` - file asset
- `link` - URL
- `color` - color value
- `enum` - dropdown/select
- `collectionReference` - reference to other collection item
- `multiCollectionReference` - multiple references
- `array` - array of items

## Assets API

**Available**: Image and file asset management

- `framer.addImage(url, options?)` - add image from URL
- `framer.addFile(url, options?)` - add file from URL
- `framer.getAsset(id)` - get asset metadata
- `framer.deleteAsset(id)` - delete asset

**Image options**: `altText`, `preferredImageRendering`, `resolution`

## Plugin Data Storage

**Partially available.** There is no project-wide `framer.setPluginData`, but collections and items carry per-node plugin data:

- `collection.setPluginData(key, value: string | null)` / `collection.getPluginData(key)`
- `collectionItem.setPluginData(key, value: string | null)` / `collectionItem.getPluginData(key)`

**Current workaround in use**: connection records live as items in a dedicated CMS collection named "Ecom-Link Internal", with fields keyed by name and translated to field IDs at the SDK boundary (see `src/storage/connections.ts`).

**Security note**: Plugin data stored in CMS is visible to users with CMS access. For MVP (free app), this is acceptable. Future: consider per-node plugin data for secrets if size limits allow, or Framer's managed collection API if it adds plugin-scoped storage.

## AI Capabilities

**NOT AVAILABLE** in public API v4.1.0. No AI/generation methods found.

**Impact on spec 006**: AI content assist (M7) must be reduced to a stub or removed from MVP. The feature can be re-enabled when Framer adds AI APIs or via external API integration (out of scope for free MVP).

## Other APIs

### Selection & Canvas
- `framer.subscribeToSelection(callback)` - track selection changes
- `framer.getSelectedNodes()` - get current selection
- `framer.showUI(options)` - show plugin UI panel

### Permissions
- `framer.isAllowedTo(...methods)` - synchronous boolean check, **required before every protected call**
- `framer.subscribeToIsAllowedTo(...methods, callback)` - subscribe to permission changes
- `useIsAllowedTo(...methods)` - React hook version (re-renders on change)
- Protected methods must be checked first or the SDK errors with `Invoking protected message type "..." without checking permission first`. Strings used by this plugin: `"createCollection"`, `"Collection.addFields"`, `"Collection.addItems"`, `"Collection.removeItems"`
- Permission is per project and per account: "Plugins can do only what the user can", so a viewer-only account gets `false` even when the call itself is shaped correctly
- **In use in this plugin**: `assertCanEditCms()` in `src/storage/connections.ts` runs the synchronous `framer.isAllowedTo(...)` check before every write, and `useCanEditCms()` in `src/lib/permissions.ts` bridges the reactive `useIsAllowedTo(...)` hook into views so write actions are disabled and a "CMS Editing Blocked" notice shows while the account lacks edit access

### Notifications
- `framer.notify(message, options?)` - show toast notifications

### UI
- `framer.showUI({ position, width, height })` - show plugin panel
- Positions: `"top right"`, `"top left"`, `"bottom right"`, `"bottom left"`

## Key Differences from Shopify

1. **No plugin-scoped storage** - must use CMS collections for persistence
2. **No AI APIs** - spec 006 blocked
3. **No webhooks** - manual sync triggers only (already in architecture)
4. **No metafields** - use CMS fields instead
5. **Asset pipeline** - images must be downloaded and added via `addImage()` (D7 in architecture)

## Recommendations

1. **Storage strategy**: Create a hidden CMS collection "Ecom-Link Internal" for plugin data
2. **AI feature**: Mark as blocked in PROGRESS.md; reduce to stub or defer to post-MVP
3. **Image handling**: Use `framer.addImage()` for all product images (D7)
4. **Batch operations**: Use `collection.addItems(items[])` for efficient sync. It creates and updates in one call
5. **Pagination**: `getItems()` has no pagination options; it returns everything. Load size must be tested during implementation

## Open Questions (Resolved)

1. ~~AI capability surface~~: **NOT AVAILABLE** in v4.1.0. Spec 006 blocked.
2. ~~Plugin data encryption~~: Store in CMS collection; document security limitations
3. ~~CMS batch-write size~~: `collection.addItems(items[])` accepts arrays; test limits during implementation
4. ~~Gallery images cap~~: Decision needed (recommend 10 images max)

---

## CMS API Usage Patterns

### Reading Collections and Items

**List all collections**:
```typescript
const collections = await framer.getCollections()
// Returns: Collection[] with id, name, getFields(), getItems(), addItems()
```

**Find a collection by name**:
```typescript
const internal = collections.find((c) => c.name === "Ecom-Link Internal")
```

**List items and fields together** (fieldData is keyed by field ID):
```typescript
const [fields, items] = await Promise.all([
  collection.getFields(),
  collection.getItems(),
])
const nameById = new Map(fields.map((f) => [f.id, f.name]))
```

### Creating and Updating Items

**Create items** (each new item needs a unique slug):
```typescript
await collection.addItems([
  {
    slug: "product-123",
    fieldData: {
      [nameField.id]: { type: "string", value: "Product Name" },
      [priceField.id]: { type: "number", value: 29.99 },
      [featuredField.id]: { type: "boolean", value: true },
    },
  },
])
```

**Update items in the same call** by including an `id`. The SDK does not document merge semantics for fieldData on update, so send the complete field set every time:
```typescript
await collection.addItems([
  {
    id: existingItem.id,
    fieldData: {
      [nameField.id]: { type: "string", value: "Updated Name" },
      [priceField.id]: { type: "number", value: 39.99 },
    },
  },
])
```

**Note**: `addItems` returns `void`. To learn the ID of a created item, re-read `getItems()` and match on the unique slug you generated.

### Deletion

**`removeItems`** - Remove many items in one call:
```typescript
await collection.removeItems([item1.id, item2.id])
```

## Field Type Mapping

For WooCommerce → Framer CMS mapping:

| WooCommerce Field | Framer Field Type | Notes |
|-------------------|-------------------|-------|
| name | string | Product name |
| slug | string | URL slug |
| status | enum | draft/pending/private/publish |
| featured | boolean | Is featured product |
| description | formattedText | Full HTML description |
| short_description | formattedText | Excerpt |
| sku | string | Stock keeping unit |
| price | number | Current price |
| regular_price | number | Regular price |
| sale_price | number | Sale price |
| on_sale | boolean | Is on sale |
| stock_status | enum | instock/outofstock/onbackorder |
| manage_stock | boolean | Stock management enabled |
| stock_quantity | number | Stock count |
| weight | number | Product weight |
| categories | array | Category references |
| tags | array | Tag strings |
| images | image | Product images (featured + gallery) |
| date_modified | date | Last modified timestamp |

## Identity Strategy

**Decision (D2)**: Store WooCommerce product ID in a CMS field called `woo_id` (string type).

**Rationale**:
- Items update in place; canvas bindings never break
- Enables two-way sync with conflict detection
- Simple lookup: query items where `woo_id` matches

**Implementation**:
```typescript
// Create item with woo_id
await collection.addItems([
  {
    slug: `woo-${wooId}`,
    fieldData: {
      [wooIdField.id]: { type: "string", value: "123" },
      [nameField.id]: { type: "string", value: "Product Name" },
      // ... other fields
    },
  },
])

// Find existing item by woo_id
const [fields, items] = await Promise.all([
  collection.getFields(),
  collection.getItems(),
])
const wooField = fields.find((f) => f.name === "woo_id")
const existing = items.find(
  (item) => wooField && item.fieldData[wooField.id]?.value === "123"
)
```

## Image Handling

**Decision (D7)**: Download images through asset pipeline into Framer assets.

**Rationale**:
- External URLs break on publish
- Framer assets are optimized and CDN-hosted
- Required for reliable product display

**Implementation**:
```typescript
// Download and add image
const imageAsset = await framer.addImage(
  "https://example.com/product.jpg",
  { altText: "Product Name" }
)

// Use in item field
await collection.addItems([
  {
    id: existingItem.id,
    fieldData: {
      [imageField.id]: { type: "image", value: imageAsset.id },
    },
  },
])
```

**Gallery images**: Store as array of image IDs (max 10 recommended).

## Error Handling

Common errors and handling:

| Error | Cause | Handling |
|-------|-------|----------|
| `Error on typia.createAssert(): invalid type on $input[N]` | SDK input shape mismatch, such as passing an object where the SDK expects a string | Check the call site against the class-shaped API above |
| Collection not found | Invalid collection ID | Show connection setup UI |
| Permission denied | Plugin lacks CMS access | Request permissions |
| Rate limit | Too many API calls | Implement retry with backoff |
| Invalid field type | Schema mismatch | Validate field types before write |
| Item not found | Deleted externally | Create new item or show error |

## Next Steps

1. Implement provider types (spec 001)
2. Build WooCommerce adapter using these APIs
3. Create sync engine with pagination and batching
4. Implement two-way sync with snapshot comparison
5. Build UI for connection setup and field mapping
