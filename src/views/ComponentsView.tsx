/**
 * ComponentsView: storefront component library skeleton (spec F03).
 *
 * The six planned storefront components are listed with their scope; the
 * library itself is future work, so every card carries a Coming soon badge
 * and there is no insertion flow yet.
 */

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

interface ComponentsViewProps {
  /** Opens the navigation drawer. */
  onOpenMenu: () => void
  /** Opens the account page. */
  onOpenAccount: () => void
}

/** Planned storefront components, mirroring spec F03. */
const PLANNED_COMPONENTS = [
  {
    id: "listing",
    icon: <LayoutGrid size={16} aria-hidden="true" />,
    name: "Product listing",
    description: "Grid or list layout with filters.",
  },
  {
    id: "page",
    icon: <FileText size={16} aria-hidden="true" />,
    name: "Product page",
    description: "Images, variants, and add to cart.",
  },
  {
    id: "variants",
    icon: <SlidersHorizontal size={16} aria-hidden="true" />,
    name: "Variant selector",
    description: "Swatches for color, size, and more.",
  },
  {
    id: "price",
    icon: <Tag size={16} aria-hidden="true" />,
    name: "Price",
    description: "Sale prices with strikethrough logic.",
  },
  {
    id: "stock",
    icon: <BadgeCheck size={16} aria-hidden="true" />,
    name: "Stock badge",
    description: "In stock, low stock, and sold out.",
  },
  {
    id: "cart",
    icon: <ShoppingCart size={16} aria-hidden="true" />,
    name: "Add to cart",
    description: "Links to your store checkout.",
  },
]

/** Render the components library skeleton page. */
export function ComponentsView({
  onOpenMenu,
  onOpenAccount,
}: ComponentsViewProps) {
  return (
    <main className={pageStyles.page}>
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
          <HelpTooltip text="Storefront components auto-bind to synced CMS products and drop straight onto the canvas. The library is in development." />
          <AccountButton onOpen={onOpenAccount} />
        </div>
      </header>

      <div className={pageStyles.pageContent}>
        {/* Status notice: the library ships after the sync engine. */}
        <section className={`${pageStyles.heroCard} ${pageStyles.heroCardEmpty}`}>
          <span className={pageStyles.heroIconWrap} aria-hidden="true">
            <Component size={20} strokeWidth={1.8} />
          </span>
          <div className={pageStyles.heroText}>
            <h2 className={pageStyles.heroTitle}>The library is in development</h2>
            <p className={pageStyles.heroDescription}>
              Sync a store first, then drop these components onto the canvas.
              They auto-bind to your synced products.
            </p>
          </div>
        </section>

        {/* Planned components grid. */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>Planned components</h2>
          <div className={componentsStyles.componentGrid}>
            {PLANNED_COMPONENTS.map(function renderComponent(component) {
              return (
                <div
                  key={component.id}
                  className={componentsStyles.componentCard}
                  title={`${component.name} is coming soon.`}
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
                  <span className="badge badge-neutral">
                    <ArrowUpRight size={11} aria-hidden="true" />
                    Soon
                  </span>
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
  )
}
