/**
 * Storefront component builders: pure functions that turn store products
 * into declarative NodeSpec trees for the canvas bridge to materialize.
 *
 * Compatibility discipline: every attribute here has been confirmed to
 * render in the target Framer runtime (plain frames, numeric sizes,
 * backgroundColor fills, single borderRadius values, stack layout with
 * gap and padding, uploaded images, raw text content). Gradients, border
 * objects, per-corner radii, fit-content sizing, and absolute overlays
 * are deliberately NOT used, because they failed or went unconfirmed in
 * the editor. Everything is static structure and real content; the
 * merchant styles and wires the result on the canvas afterwards.
 */
import { STOREFRONT_THEME } from "./theme"
import type { StorefrontTheme } from "./theme"
import type { FrameSpec, NodeSpec } from "./types"
import type { StorefrontProduct } from "./productData"

/**
 * The price block of one product: the live price, plus a lime sale chip
 * and a muted "was" value when the product is discounted. Empty price
 * values render nothing.
 */
export function buildPriceBlock(
  product: StorefrontProduct,
  theme: StorefrontTheme = STOREFRONT_THEME
): NodeSpec[] {
  const parts: NodeSpec[] = []
  if (product.price !== "") {
    parts.push({
      kind: "text",
      name: "Price",
      text: product.price,
      role: "price",
    })
  }
  if (
    product.onSale &&
    product.regularPrice !== "" &&
    product.regularPrice !== product.price
  ) {
    parts.push(buildSaleChip(theme))
    parts.push({
      kind: "text",
      name: "Was price",
      text: `Was ${product.regularPrice}`,
      role: "small",
    })
  }
  return parts
}

/** The lime "SALE" chip with fixed sizing the runtime renders reliably. */
export function buildSaleChip(theme: StorefrontTheme = STOREFRONT_THEME): FrameSpec {
  return {
    kind: "frame",
    name: "Sale chip",
    stack: { direction: "horizontal" },
    width: theme.chipWidth,
    height: theme.chipHeight,
    radius: theme.chipHeight / 2,
    fill: theme.lime,
    children: [{ kind: "text", name: "Sale label", text: "SALE", role: "chip" }],
  }
}

/**
 * The stock badge of one product: a quiet gray pill with a status dot and
 * label, sized by the flow layout around it.
 */
export function buildStockBadge(
  product: StorefrontProduct,
  theme: StorefrontTheme = STOREFRONT_THEME
): FrameSpec {
  const tone = stockTone(product.stockStatus, theme)
  return {
    kind: "frame",
    name: "Stock badge",
    stack: { direction: "horizontal", gap: 6, padding: 5 },
    radius: theme.chipHeight / 2,
    fill: theme.surfaceDim,
    children: [
      {
        kind: "frame",
        name: "Stock dot",
        width: 8,
        height: 8,
        radius: 4,
        fill: tone.color,
        children: [],
      },
      {
        kind: "text",
        name: "Stock label",
        text: tone.label,
        role: "small",
      },
    ],
  }
}

/** The add to cart button: dark fill, bold label, linked to the store. */
export function buildAddToCart(
  product: StorefrontProduct,
  theme: StorefrontTheme = STOREFRONT_THEME,
  width: number = theme.buttonWidth
): FrameSpec {
  return {
    kind: "frame",
    name: "Add to cart",
    stack: { direction: "horizontal" },
    width,
    height: theme.buttonHeight,
    radius: theme.radiusSmall,
    fill: theme.accent,
    link: product.permalink,
    children: [
      { kind: "text", name: "Button label", text: "Add to cart", role: "button" },
    ],
  }
}

/** The image well of one card: neutral fill behind the product photo. */
function buildCardImage(
  product: StorefrontProduct,
  theme: StorefrontTheme
): FrameSpec {
  return {
    kind: "frame",
    name: "Product image",
    width: theme.cardImageSize,
    height: theme.cardImageSize,
    radius: theme.radiusSmall,
    fill: theme.surfaceDim,
    imageUrl: product.imageUrl,
    imageAlt: product.name,
    children: [],
  }
}

/**
 * One product card: a white padded frame holding a rounded photo well
 * above the full marketplace field set: category eyebrow, name, price
 * with sale chip, availability, short description, star rating, and the
 * add to cart button. Only rendering-confirmed attributes are used.
 */
export function buildProductCard(
  product: StorefrontProduct,
  theme: StorefrontTheme = STOREFRONT_THEME
): FrameSpec {
  const body: NodeSpec[] = []
  if (product.category !== "") {
    body.push({
      kind: "text",
      name: "Category eyebrow",
      text: product.category.toUpperCase(),
      role: "eyebrow",
    })
  }
  if (product.name !== "") {
    body.push({
      kind: "text",
      name: "Product name",
      text: product.name,
      role: "name",
    })
  }
  const priceParts = buildPriceBlock(product, theme)
  if (priceParts.length > 0) {
    body.push({
      kind: "frame",
      name: "Price row",
      stack: { direction: "horizontal", gap: 10 },
      children: priceParts,
    })
  }
  const availability = availabilityPhrase(product.stockStatus)
  if (availability !== "") {
    body.push({
      kind: "text",
      name: "Availability",
      text: availability,
      role: "small",
    })
  }
  const shortDescription = truncateForCard(product.description, 80)
  if (shortDescription !== "") {
    body.push({
      kind: "text",
      name: "Short description",
      text: shortDescription,
      role: "body",
    })
  }
  const ratingRow = buildRatingRow(product)
  if (ratingRow !== null) {
    body.push(ratingRow)
  }
  body.push(
    buildAddToCart(product, theme, theme.cardWidth - theme.cardPadding * 2)
  )
  return {
    kind: "frame",
    name: product.name === "" ? "Product card" : product.name,
    stack: { direction: "vertical", gap: theme.cardBodyGap, padding: theme.cardPadding },
    width: theme.cardWidth,
    height: theme.cardHeight,
    fill: theme.surface,
    radius: theme.radius,
    children: [
      buildCardImage(product, theme),
      {
        kind: "frame",
        name: "Card body",
        stack: { direction: "vertical", gap: theme.cardBodyGap, padding: theme.cardBodyPadding },
        children: body,
      },
    ],
  }
}

/** Clamp one description to a card-sized snippet with an ellipsis. */
function truncateForCard(text: string, maxChars: number): string {
  const plain = text.trim()
  if (plain.length <= maxChars) {
    return plain
  }
  return plain.slice(0, maxChars).trimEnd() + "…"
}

/** The muted availability sentence, or empty for unknown statuses. */
function availabilityPhrase(stockStatus: string): string {
  const normalized = stockStatus.trim().toLowerCase()
  if (normalized === "instock") {
    return "In stock"
  }
  if (normalized === "onbackorder") {
    return "Available on backorder"
  }
  if (normalized === "outofstock") {
    return "Currently sold out"
  }
  return ""
}

/**
 * The star rating row: orange stars with empty stars filling out five,
 * plus the review count. Null when the product carries no rating.
 */
export function buildRatingRow(product: StorefrontProduct): FrameSpec | null {
  if (product.rating === null || product.rating <= 0) {
    return null
  }
  const rounded = Math.max(0, Math.min(5, Math.round(product.rating)))
  const rowChildren: NodeSpec[] = [
    {
      kind: "text",
      name: "Stars",
      text: "★".repeat(rounded) + "☆".repeat(5 - rounded),
      role: "stars",
    },
  ]
  if (product.ratingCount !== null) {
    rowChildren.push({
      kind: "text",
      name: "Rating count",
      text: `(${product.ratingCount})`,
      role: "small",
    })
  }
  return {
    kind: "frame",
    name: "Rating row",
    stack: { direction: "horizontal", gap: 6 },
    children: rowChildren,
  }
}

/**
 * The product listing: an uppercase eyebrow, a heavy section title, and
 * rows of product cards. Rows are horizontal stacks (three cards each)
 * inside the listing's vertical stack; Framer grid frames collapsed rows
 * in the editor, so no grid layout is used. The light gray backdrop makes
 * the white cards read against it.
 */
export function buildProductListing(
  products: StorefrontProduct[],
  theme: StorefrontTheme = STOREFRONT_THEME
): FrameSpec {
  // Rows live inside the listing's 40px padding, so their width is the
  // content width, not the frame width (overflow otherwise).
  const contentWidth = theme.pageWidth - 80
  const rows = buildCardRows(products, theme, theme.gridColumns, contentWidth)
  // Fixed heights everywhere: rows and the listing frame itself, because
  // auto-height stacks collapse in the runtime.
  const headerHeight = 78
  const rowsHeight = rowsHeightOf(rows.length, theme.cardHeight, theme.gridGap)
  return {
    kind: "frame",
    name: "Product listing",
    stack: { direction: "vertical", gap: theme.gridGap, padding: 40 },
    width: theme.pageWidth,
    height: 40 + headerHeight + theme.gridGap + rowsHeight + 40,
    fill: theme.surfaceDim,
    radius: theme.radius,
    children: [
      {
        kind: "frame",
        name: "Listing header",
        stack: { direction: "vertical", gap: 4 },
        width: contentWidth,
        height: headerHeight,
        children: [
          { kind: "text", name: "Eyebrow", text: "Catalog", role: "eyebrow" },
          { kind: "text", name: "Listing title", text: "Products", role: "title" },
        ],
      },
      ...rows,
    ],
  }
}

/** Total height of n stacked rows of the given card height with gaps. */
export function rowsHeightOf(
  rowCount: number,
  rowHeight: number,
  gap: number
): number {
  if (rowCount <= 0) {
    return 0
  }
  return rowCount * rowHeight + (rowCount - 1) * gap
}

/** Split products into horizontal card rows of the given column count. */
function buildCardRows(
  products: StorefrontProduct[],
  theme: StorefrontTheme,
  columns: number,
  rowWidth: number
): NodeSpec[] {
  const rows: NodeSpec[] = []
  for (let start = 0; start < products.length; start += columns) {
    const slice = products.slice(start, start + columns)
    rows.push({
      kind: "frame",
      name: `Listing row ${rows.length + 1}`,
      stack: { direction: "horizontal", gap: theme.gridGap },
      width: rowWidth,
      height: theme.cardHeight,
      children: slice.map(function toCard(product) {
        return buildProductCard(product, theme)
      }),
    })
  }
  return rows
}

/** Category names with product counts, most used first. */
function categoryCounts(
  products: StorefrontProduct[]
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const product of products) {
    if (product.category === "") {
      continue
    }
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(function toEntry(entry) {
      return { name: entry[0], count: entry[1] }
    })
    .sort(function byCount(a, b) {
      return b.count - a.count
    })
}

/** One checkbox row: the box, the label, and an optional count. */
function buildFilterRow(
  label: string,
  count: number | null,
  checked: boolean,
  theme: StorefrontTheme
): FrameSpec {
  const boxChildren: NodeSpec[] = checked
    ? [{ kind: "text", name: "Check mark", text: "✓", role: "pill" }]
    : []
  const rowChildren: NodeSpec[] = [
    {
      kind: "frame",
      name: "Checkbox",
      stack: { direction: "horizontal" },
      width: 16,
      height: 16,
      radius: 4,
      fill: checked ? theme.lime : theme.surfaceDim,
      children: boxChildren,
    },
    { kind: "text", name: "Filter label", text: label, role: "small" },
  ]
  if (count !== null) {
    rowChildren.push({
      kind: "text",
      name: "Filter count",
      text: `(${count})`,
      role: "small",
    })
  }
  return {
    kind: "frame",
    name: "Filter row",
    stack: { direction: "horizontal", gap: 8 },
    width: theme.sidebarWidth - 32,
    children: rowChildren,
  }
}

/** One sidebar section: uppercase header, optional divider, rows. */
function buildFilterSection(
  title: string,
  rows: NodeSpec[],
  theme: StorefrontTheme
): FrameSpec {
  const children: NodeSpec[] = [
    { kind: "text", name: "Section title", text: title.toUpperCase(), role: "eyebrow" },
    ...rows,
  ]
  return {
    kind: "frame",
    name: `Filter section ${title}`,
    stack: { direction: "vertical", gap: 8 },
    width: theme.sidebarWidth - 32,
    children,
  }
}

/** A thin separator frame between sidebar sections. */
function buildDivider(theme: StorefrontTheme): FrameSpec {
  return {
    kind: "frame",
    name: "Divider",
    width: theme.sidebarWidth - 32,
    height: 1,
    fill: theme.border,
    children: [],
  }
}

/**
 * The product listing with a filter sidebar, in the marketplace style:
 * results toolbar, FILTERS panel (category counts from the synced
 * products, price tiers, rating rows), and a compact card grid.
 *
 * The sidebar is the DESIGN of a filter panel with real category data;
 * static canvas layers cannot filter, so live filtering comes from
 * binding a Framer CMS list (a site-side feature) instead of these rows.
 */
export function buildFilterableListing(
  products: StorefrontProduct[],
  theme: StorefrontTheme = STOREFRONT_THEME
): FrameSpec {
  // Compact cards leave room for the sidebar.
  const gridWidth = theme.pageWidth - 64 - theme.sidebarWidth - 24
  const compactTheme: StorefrontTheme = {
    ...theme,
    cardWidth: theme.compactCardWidth,
    cardImageSize: theme.compactImageSize,
    cardHeight: theme.compactCardHeight,
  }
  const gridRows = buildCardRows(
    products,
    compactTheme,
    theme.gridColumns,
    gridWidth
  )
  // Fixed heights down the whole chain: rows carry the compact card
  // height, the grid column and content row sum them, and the listing
  // frame totals everything. Auto heights collapse in the runtime.
  const gridHeight = rowsHeightOf(
    gridRows.length,
    compactTheme.cardHeight,
    theme.gridGap
  )
  const contentHeight = Math.max(gridHeight, 240)
  const categories = categoryCounts(products).slice(0, 6)
  const categoryRows = categories.map(function toRow(category, index) {
    return buildFilterRow(category.name, category.count, index === 0, theme)
  })
  const priceTiers = ["Under 50", "50 to 100", "100 to 200", "200 and above"]
  const priceRows = priceTiers.map(function toRow(tier, index) {
    return buildFilterRow(tier, null, index === 0, theme)
  })
  const ratingRows = [5, 4, 3, 2].map(function toRow(stars, index) {
    return buildFilterRow(
      "★".repeat(stars) + "☆".repeat(5 - stars),
      null,
      index === 0,
      theme
    )
  })
  const sidebar: FrameSpec = {
    kind: "frame",
    name: "Filter sidebar",
    stack: { direction: "vertical", gap: 28, padding: 16 },
    width: theme.sidebarWidth,
    height: contentHeight,
    fill: theme.surface,
    radius: theme.radius,
    children: [
      {
        kind: "frame",
        name: "Filters header",
        stack: { direction: "horizontal", gap: 12 },
        width: theme.sidebarWidth - 32,
        children: [
          { kind: "text", name: "Filters title", text: "FILTERS", role: "eyebrow" },
          { kind: "text", name: "Clear all", text: "Clear all", role: "small" },
        ],
      },
      buildFilterSection("Category", categoryRows, theme),
      buildDivider(theme),
      buildFilterSection("Price", priceRows, theme),
      buildDivider(theme),
      buildFilterSection("Rating", ratingRows, theme),
    ],
  }
  return {
    kind: "frame",
    name: "Filterable listing",
    stack: { direction: "vertical", gap: 24, padding: 32 },
    width: theme.pageWidth,
    height: 32 + 36 + 24 + contentHeight + 32,
    fill: theme.surfaceDim,
    radius: theme.radius,
    children: [
      {
        kind: "frame",
        name: "Results toolbar",
        stack: { direction: "horizontal", gap: 24 },
        width: theme.pageWidth - 64,
        height: 36,
        children: [
          {
            kind: "text",
            name: "Results count",
            text: `Showing ${products.length} products`,
            role: "small",
          },
          {
            kind: "frame",
            name: "View toggles",
            stack: { direction: "horizontal", gap: 8 },
            children: [
              {
                kind: "frame",
                name: "Grid view toggle",
                stack: { direction: "horizontal" },
                width: 32,
                height: 32,
                radius: theme.radiusSmall,
                fill: theme.lime,
                children: [{ kind: "text", name: "Grid icon", text: "▦", role: "chip" }],
              },
              {
                kind: "frame",
                name: "List view toggle",
                stack: { direction: "horizontal" },
                width: 32,
                height: 32,
                radius: theme.radiusSmall,
                fill: theme.surfaceDim,
                children: [{ kind: "text", name: "List icon", text: "≡", role: "chip" }],
              },
            ],
          },
          {
            kind: "frame",
            name: "Sort pill",
            stack: { direction: "horizontal" },
            width: 200,
            height: 36,
            radius: theme.radiusSmall,
            fill: theme.surface,
            children: [
              { kind: "text", name: "Sort label", text: "Sort by: Most popular", role: "small" },
            ],
          },
        ],
      },
      {
        kind: "frame",
        name: "Listing content",
        stack: { direction: "horizontal", gap: 24 },
        width: theme.pageWidth - 64,
        height: contentHeight,
        children: [
          sidebar,
          {
            kind: "frame",
            name: "Product grid",
            stack: { direction: "vertical", gap: theme.gridGap },
            width: gridWidth,
            height: gridHeight,
            children: gridRows,
          },
        ],
      },
    ],
  }
}

/**
 * The product page: gallery column with a neutral image well and
 * thumbnail row beside an info column with an eyebrow, heavy title, price
 * row, stock pill, description, and the add to cart button.
 */
export function buildProductPage(
  product: StorefrontProduct,
  theme: StorefrontTheme = STOREFRONT_THEME
): FrameSpec {
  const info: NodeSpec[] = []
  const eyebrow = product.category !== "" ? product.category : "Product"
  info.push({ kind: "text", name: "Eyebrow", text: eyebrow, role: "eyebrow" })
  if (product.name !== "") {
    info.push({ kind: "text", name: "Page title", text: product.name, role: "title" })
  }
  const priceParts = buildPriceBlock(product, theme)
  if (priceParts.length > 0) {
    info.push({
      kind: "frame",
      name: "Price row",
      stack: { direction: "horizontal", gap: 12 },
      children: priceParts,
    })
  }
  info.push(buildStockBadge(product, theme))
  if (product.description !== "") {
    info.push({
      kind: "text",
      name: "Description",
      text: product.description,
      role: "body",
    })
  }
  info.push(buildAddToCart(product, theme))

  const galleryChildren: NodeSpec[] = [
    {
      kind: "frame",
      name: "Main image",
      width: theme.pageColumn,
      height: theme.pageColumn,
      radius: theme.radiusMedium,
      fill: theme.surfaceDim,
      imageUrl: product.imageUrl,
      imageAlt: product.name,
      children: [],
    },
  ]
  if (product.galleryUrls.length > 0) {
    galleryChildren.push({
      kind: "frame",
      name: "Gallery thumbs",
      stack: { direction: "horizontal", gap: 12 },
      children: product.galleryUrls.map(function toThumb(url, index) {
        return {
          kind: "frame",
          name: `Gallery image ${index + 1}`,
          width: 96,
          height: 96,
          radius: theme.radiusSmall,
          fill: theme.surfaceDim,
          imageUrl: url,
          imageAlt: product.name,
          children: [],
        } satisfies FrameSpec
      }),
    })
  }
  return {
    kind: "frame",
    name: "Product page",
    stack: { direction: "horizontal", gap: 48 },
    width: theme.pageWidth,
    fill: theme.surface,
    radius: theme.radius,
    children: [
      {
        kind: "frame",
        name: "Gallery",
        stack: { direction: "vertical", gap: 12 },
        width: theme.pageColumn,
        children: galleryChildren,
      },
      {
        kind: "frame",
        name: "Info",
        stack: { direction: "vertical", gap: 16 },
        width: theme.pageColumn,
        children: info,
      },
    ],
  }
}

/** One composite spec for the insert flows that take a single tree. */
export function wrapSpecs(name: string, children: NodeSpec[]): FrameSpec {
  return {
    kind: "frame",
    name,
    stack: { direction: "horizontal", gap: 10 },
    children,
  }
}

/** Label and color for one raw stock status value. */
function stockTone(status: string, theme: StorefrontTheme): { label: string; color: string } {
  const normalized = status.trim().toLowerCase()
  if (normalized === "instock") {
    return { label: "In stock", color: theme.inStock }
  }
  if (normalized === "onbackorder") {
    return { label: "Backorder", color: theme.backorder }
  }
  return { label: "Sold out", color: theme.outOfStock }
}
