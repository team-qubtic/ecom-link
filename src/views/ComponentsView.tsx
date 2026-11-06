/**
 * ComponentsView: storefront component library (spec F03, first pass).
 *
 * Five of the six planned components insert onto the canvas in one click:
 * the builder produces the layout from the synced product data and the
 * canvas bridge materializes it as native frames and text. The variant
 * selector needs interactivity static layers cannot provide, so it stays a
 * planned card. Inserts degrade to placeholder content when no store is
 * synced yet.
 */

import { useState } from "react"
import {
  ArrowUpRight,
  BadgeCheck,
  Component,
  FileText,
  LayoutGrid,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
} from "lucide-react"

import pageStyles from "../assets/styles/module/Dashboard.module.css"
import componentsStyles from "../assets/styles/module/Components.module.css"
import { MenuButton } from "../components/ui/MenuButton"
import { AccountButton } from "../components/ui/AccountButton"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import { runsInsideFramer } from "../lib/framer"
import {
  assertCanCreateNodes,
  insertNodeTree,
} from "../lib/canvas"
import {
  buildAddToCart,
  buildFilterableListing,
  buildPriceBlock,
  buildProductListing,
  buildProductPage,
  buildStockBadge,
  wrapSpecs,
} from "../storefront/builders"
import { loadStorefrontProducts } from "../storefront/productData"
import { STOREFRONT_THEME } from "../storefront/theme"
import type { FrameSpec } from "../storefront/types"

interface ComponentsViewProps {
  /** Opens the navigation drawer. */
  onOpenMenu: () => void
  /** Opens the account page. */
  onOpenAccount: () => void
}

/** Storefront components, mirroring spec F03. Available ones insert on click. */
const COMPONENTS = [
  {
    id: "listing",
    icon: <LayoutGrid size={16} aria-hidden="true" />,
    name: "Product listing",
    description: "Grid or list layout with filters.",
    available: true,
  },
  {
    id: "filter-listing",
    icon: <SlidersHorizontal size={16} aria-hidden="true" />,
    name: "Filterable listing",
    description: "Store grid with a filter sidebar.",
    available: true,
  },
  {
    id: "page",
    icon: <FileText size={16} aria-hidden="true" />,
    name: "Product page",
    description: "Images, variants, and add to cart.",
    available: true,
  },
  {
    id: "price",
    icon: <Tag size={16} aria-hidden="true" />,
    name: "Price",
    description: "Sale prices with strikethrough logic.",
    available: true,
  },
  {
    id: "stock",
    icon: <BadgeCheck size={16} aria-hidden="true" />,
    name: "Stock badge",
    description: "In stock, low stock, and sold out.",
    available: true,
  },
  {
    id: "cart",
    icon: <ShoppingCart size={16} aria-hidden="true" />,
    name: "Add to cart",
    description: "Links to your store checkout.",
    available: true,
  },
  {
    id: "variants",
    icon: <Component size={16} aria-hidden="true" />,
    name: "Variant selector",
    description: "Swatches for color, size, and more.",
    available: false,
  },
]

const INSERT_FAILED_MESSAGE =
  "The component could not be inserted. Check the canvas is open, then try again."

/** Insert lifecycle for one component at a time. */
type InsertPhase =
  | { kind: "idle" }
  | { kind: "inserting"; componentId: string }
  | { kind: "inserted"; componentId: string }

/** Render the storefront component library page. */
export function ComponentsView({
  onOpenMenu,
  onOpenAccount,
}: ComponentsViewProps) {
  const [phase, setPhase] = useState<InsertPhase>({ kind: "idle" })
  const [problem, setProblem] = useState("")
  const [placeholderNote, setPlaceholderNote] = useState(false)
  const insideFramer = runsInsideFramer()

  /**
   * Build the spec for one component from the synced products and hand it
   * to the canvas bridge. Data loads here (not on mount) so the page stays
   * instant and the data is fresh at insert time.
   */
  async function handleInsert(componentId: string) {
    setProblem("")
    setPlaceholderNote(false)
    setPhase({ kind: "inserting", componentId })
    try {
      assertCanCreateNodes()
      const data = await loadStorefrontProducts()
      const product = data.products[0]
      let spec: FrameSpec
      if (componentId === "listing") {
        spec = buildProductListing(data.products, STOREFRONT_THEME)
      } else if (componentId === "filter-listing") {
        spec = buildFilterableListing(data.products, STOREFRONT_THEME)
      } else if (componentId === "page") {
        spec = buildProductPage(product, STOREFRONT_THEME)
      } else if (componentId === "price") {
        spec = wrapSpecs("Price", buildPriceBlock(product, STOREFRONT_THEME))
      } else if (componentId === "stock") {
        spec = buildStockBadge(product, STOREFRONT_THEME)
      } else if (componentId === "cart") {
        spec = buildAddToCart(product, STOREFRONT_THEME)
      } else {
        setPhase({ kind: "idle" })
        return
      }
      await insertNodeTree(spec, { replaceComponentId: componentId })
      setPlaceholderNote(data.placeholder)
      setPhase({ kind: "inserted", componentId })
    } catch (error) {
      setPhase({ kind: "idle" })
      setProblem(
        error instanceof Error && error.message !== ""
          ? error.message
          : INSERT_FAILED_MESSAGE
      )
    }
  }

  return (
    <>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBrand}>
          <MenuButton onOpen={onOpenMenu} />
          <span className={pageStyles.headerLogo} aria-hidden="true">
            <Component size={15} strokeWidth={2.2} />
          </span>
          <div className={pageStyles.headerText}>
            <h1 className={pageStyles.pageTitle}>Components</h1>
          </div>
        </div>
        <div className={pageStyles.headerActions}>
          <HelpTooltip text="Storefront components insert as native canvas layers pre-filled with your synced products. Restyle them on the canvas and wire them to your CMS fields." />
          <AccountButton onOpen={onOpenAccount} />
        </div>
      </header>

      <main className={pageStyles.page}>
        <div className={pageStyles.pageContent}>
        {!insideFramer ? (
          <div className="notice notice-warning" role="status">
            <p>Open the plugin inside Framer to insert components on the canvas.</p>
          </div>
        ) : null}
        {problem !== "" ? (
          <div className="notice notice-error" role="alert">
            <p>{problem}</p>
          </div>
        ) : null}

        {/* Intro: what an insert does. */}
        <section className={pageStyles.heroCard}>
          <span className={pageStyles.heroIconWrap} aria-hidden="true">
            <Component size={20} strokeWidth={1.8} />
          </span>
          <div className={pageStyles.heroText}>
            <h2 className={pageStyles.heroTitle}>Insert components on the canvas</h2>
            <p className={pageStyles.heroDescription}>
              One click places a ready layout next to your selection. Inserts
              come pre-filled with your synced products, or placeholder
              content before your first sync.
            </p>
          </div>
        </section>
        {placeholderNote ? (
          <p className="muted small" role="status">
            Placeholder content was used because no products are synced yet.
          </p>
        ) : null}

        {/* Components grid. */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>Components</h2>
          <div className={componentsStyles.componentGrid}>
            {COMPONENTS.map(function renderComponent(component) {
              const inserting =
                phase.kind === "inserting" && phase.componentId === component.id
              const inserted =
                phase.kind === "inserted" && phase.componentId === component.id
              return (
                <div
                  key={component.id}
                  className={componentsStyles.componentCard}
                >
                  <span className={componentsStyles.componentIcon} aria-hidden="true">
                    {component.icon}
                  </span>
                  <div className={pageStyles.platformText}>
                    <span className={pageStyles.platformName}>
                      {component.name}
                    </span>
                    <span className={pageStyles.platformDescription}>
                      {component.description}
                    </span>
                  </div>
                  {component.available ? (
                    inserted ? (
                      <span className="badge badge-success">
                        <BadgeCheck size={11} aria-hidden="true" />
                        Inserted
                      </span>
                    ) : (
                      <div className={componentsStyles.componentActions}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!insideFramer || (phase.kind === "inserting")}
                          onClick={function insert() {
                            void handleInsert(component.id)
                          }}
                        >
                          {inserting ? "Inserting…" : "Insert"}
                        </button>
                      </div>
                    )
                  ) : (
                    <span className="badge badge-neutral">
                      <ArrowUpRight size={11} aria-hidden="true" />
                      Available Soon
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <footer className={pageStyles.pageFooter}>
          Ecom-Link · More apps from Qubtic are on the way.
        </footer>
      </div>
      </main>
    </>
  )
}
