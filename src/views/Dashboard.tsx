/**
 * Dashboard: the plugin home.
 *
 * Shows the live status of the active store (or a connect prompt when no
 * store is linked), the supported platforms, what the plugin syncs, and
 * support links. Connection management lives on the Connections page,
 * reachable from the bottom nav or the hero's Manage action.
 */

import { useEffect, useState } from "react"
import {
  ArrowUpRight,
  Book,
  Lightbulb,
  MessageCircle,
  Package,
  RefreshCw,
  Sparkles,
  Store,
  LayoutDashboard
} from "lucide-react"

import pageStyles from "../assets/styles/module/Dashboard.module.css"
import { BrandMark } from "../components/ui/BrandMark"
import { MenuButton } from "../components/ui/MenuButton"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import { AccountButton } from "../components/ui/AccountButton"
import {
  getActiveConnection,
  listConnections,
  type ConnectionRecord,
} from "../storage/connections"

interface DashboardProps {
  onConnect: () => void
  /** Opens the Connections page (hero Manage action). */
  onViewConnections: () => void
  /** Opens the navigation drawer. */
  onOpenMenu: () => void
  /** Opens the account page. */
  onOpenAccount: () => void
}

/** "1 connection", "2 connections": pluralized counts, never lazy plural forms. */
export function formatCount(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`
}

/**
 * Supported platforms, ordered by availability. "wix" here matches the
 * BrandMark registry id; the display name is separate.
 */
const PLATFORMS = [
  { id: "woocommerce", name: "WooCommerce", description: "Products and inventory.", available: true },
  { id: "shopify", name: "Shopify", description: "Catalog import.", available: false },
  { id: "bigcommerce", name: "BigCommerce", description: "Catalog import.", available: false },
  { id: "wix", name: "Wix", description: "Catalog import.", available: false },
]

/** What the plugin actually does today, mirroring the shipped specs. */
const CAPABILITIES = [
  {
    id: "catalog",
    icon: <Package size={15} aria-hidden="true" />,
    title: "Product catalog",
    description: "Import products into Framer CMS collections.",
  },
  {
    id: "inventory",
    icon: <RefreshCw size={15} aria-hidden="true" />,
    title: "Two-way inventory",
    description: "Push stock changes back to your store.",
  },
  {
    id: "ai",
    icon: <Sparkles size={15} aria-hidden="true" />,
    title: "AI content assist",
    description: "Polish titles and descriptions while you sync.",
  },
]

/** Chip class for the hero status pill. */
function statusBadgeClass(state: ConnectionRecord["validationState"]): string {
  if (state === "valid") {
    return "badge badge-success"
  }
  if (state === "invalid") {
    return "badge badge-error"
  }
  return "badge badge-neutral"
}

/** Status chip copy for the hero status pill. */
function statusBadgeLabel(state: ConnectionRecord["validationState"]): string {
  if (state === "valid") {
    return "Connected"
  }
  if (state === "invalid") {
    return "Check failed"
  }
  return "Not checked"
}

/** Render the dashboard shell. */
export function Dashboard({ onConnect, onViewConnections, onOpenMenu, onOpenAccount }: DashboardProps) {
  const [active, setActive] = useState<ConnectionRecord | null>(null)
  const [connectionCount, setConnectionCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(
    function loadStoreStatus() {
      let cancelled = false
      async function load() {
        try {
          const all = await listConnections()
          const activeConnection = await getActiveConnection()
          if (!cancelled) {
            setActive(activeConnection)
            setConnectionCount(all.length)
            setLoading(false)
          }
        } catch {
          if (!cancelled) {
            setLoading(false)
          }
        }
      }
      void load()
      return function cleanup() {
        cancelled = true
      }
    },
    []
  )

  return (
    <>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBrand}>
          <MenuButton onOpen={onOpenMenu} />
          <span className={pageStyles.headerLogo} aria-hidden="true">
            <LayoutDashboard size={15} strokeWidth={2.2} />
          </span>
          <div className={pageStyles.headerText}>
            <h1 className={pageStyles.pageTitle}>Dashboard</h1>
          </div>
        </div>
        <div className={pageStyles.headerActions}>
          <HelpTooltip text="Connect a WooCommerce store and sync its products into Framer CMS collections." />
          <AccountButton onOpen={onOpenAccount} />
        </div>
      </header>

      <main className={pageStyles.page}>
        <div className={pageStyles.pageContent}>
        {/* Section 1: active store status */}
        {loading ? (
          <div className={`${pageStyles.heroCard} ${pageStyles.heroCardLoading}`} aria-hidden="true">
            <span className={`${pageStyles.heroSkeletonTile} ${pageStyles.skeleton}`} />
            <div className={pageStyles.heroSkeletonLines}>
              <span className={`${pageStyles.heroSkeletonLine} ${pageStyles.skeleton}`} />
              <span className={`${pageStyles.heroSkeletonLineShort} ${pageStyles.skeleton}`} />
            </div>
          </div>
        ) : active ? (
          <section className={`${pageStyles.heroCard} ${pageStyles.heroCardActive}`}>
            <div className={pageStyles.heroTop}>
              <BrandMark provider={active.providerId} size={40} />
              <div className={pageStyles.heroText}>
                <h2 className={pageStyles.heroTitle}>{active.storeHost}</h2>
                <div className={pageStyles.heroMeta}>
                  <span className={statusBadgeClass(active.validationState)}>
                    <span className="badge-dot" aria-hidden="true" />
                    {statusBadgeLabel(active.validationState)}
                  </span>
                  {connectionCount > 1 ? (
                    <span className="muted small">
                      {formatCount(connectionCount, "connection")}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={onViewConnections}
            >
              Manage
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </section>
        ) : (
          <section className={`${pageStyles.heroCard} ${pageStyles.heroCardEmpty}`}>
            <span className={pageStyles.heroIconWrap} aria-hidden="true">
              <Store size={20} strokeWidth={1.8} />
            </span>
            <div className={pageStyles.heroText}>
              <h2 className={pageStyles.heroTitle}>Connect your first store</h2>
              <p className={pageStyles.heroDescription}>
                Link WooCommerce to sync products and inventory into Framer.
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-small" onClick={onConnect}>
              Connect a store
            </button>
          </section>
        )}

        {/* Section 2: platforms */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>Platforms</h2>
          <div className={pageStyles.platformGrid}>
            {PLATFORMS.map(function renderPlatform(platform) {
              const shared = (
                <>
                  <BrandMark provider={platform.id} size={34} />
                  <div className={pageStyles.platformText}>
                    <span className={pageStyles.platformName}>{platform.name}</span>
                    <span className={pageStyles.platformDescription}>
                      {platform.description}
                    </span>
                  </div>
                </>
              )
              if (platform.available) {
                return (
                  <button
                    key={platform.id}
                    type="button"
                    className={`${pageStyles.platformTile} ${pageStyles.platformTileAvailable}`}
                    onClick={onConnect}
                  >
                    {shared}
                    <span className="badge badge-primary">Connect</span>
                  </button>
                )
              }
              return (
                <div
                  key={platform.id}
                  className={`${pageStyles.platformTile} ${pageStyles.platformTileSoon}`}
                  title={`${platform.name} support is coming soon.`}
                >
                  {shared}
                  <span className="badge badge-neutral">Coming Soon</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Section 3: capabilities */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>What you can sync</h2>
          <div className={pageStyles.capabilityList}>
            {CAPABILITIES.map(function renderCapability(capability) {
              return (
                <div key={capability.id} className={pageStyles.capabilityRow}>
                  <span className={pageStyles.capabilityIcon} aria-hidden="true">
                    {capability.icon}
                  </span>
                  <div className={pageStyles.capabilityText}>
                    <span className={pageStyles.capabilityTitle}>
                      {capability.title}
                    </span>
                    <span className={pageStyles.capabilityDescription}>
                      {capability.description}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Section 4: support */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>Support</h2>
          <div className={pageStyles.supportRow}>
            <a
              href="https://docs.example.com"
              target="_blank"
              rel="noopener noreferrer"
              className={pageStyles.supportChip}
            >
              <Book size={14} aria-hidden="true" />
              Docs
            </a>
            <a
              href="https://support.example.com"
              target="_blank"
              rel="noopener noreferrer"
              className={pageStyles.supportChip}
            >
              <MessageCircle size={14} aria-hidden="true" />
              Help
            </a>
            <a
              href="https://feedback.example.com"
              target="_blank"
              rel="noopener noreferrer"
              className={pageStyles.supportChip}
            >
              <Lightbulb size={14} aria-hidden="true" />
              Feedback
            </a>
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
