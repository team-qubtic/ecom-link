/**
 * CatalogueView: sync analytics across the whole plugin.
 *
 * Every number here comes from real state: product counts from sync
 * snapshots, run results from the stored sync history, and store identity
 * from the saved connections. Works for every connection, aggregated into
 * totals plus a per-store breakdown.
 */

import { useEffect, useState } from "react"
import {
  ArrowUpRight,
  DatabaseArrowDown,
  Package,
} from "lucide-react"

import pageStyles from "../assets/styles/module/Dashboard.module.css"
import catalogueStyles from "../assets/styles/module/Catalogue.module.css"
import { BrandMark } from "../components/ui/BrandMark"
import { MenuButton } from "../components/ui/MenuButton"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import { AccountButton } from "../components/ui/AccountButton"
import {
  listConnections,
  type ConnectionRecord,
} from "../storage/connections"
import { getSyncSettings } from "../storage/settings"
import { getSnapshots } from "../storage/snapshots"
import { listRunHistory } from "../storage/history"
import type { SyncRunRecord } from "../storage/history"

interface CatalogueViewProps {
  onConnect: () => void
  /** Opens the Connections page (sync runs from there). */
  onViewConnections: () => void
  /** Opens the navigation drawer. */
  onOpenMenu: () => void
  /** Opens the account page. */
  onOpenAccount: () => void
}

/** Analytics for one store connection. */
interface StoreAnalytics {
  connection: ConnectionRecord
  productCount: number
  mappedFields: number
  collectionName: string | null
  runs: SyncRunRecord[]
}

/** Whole-plugin analytics state. */
type CatalogueState =
  | { status: "loading" }
  | { status: "noStore" }
  | {
      status: "ready"
      stores: StoreAnalytics[]
      totalProducts: number
      totalRuns: number
      recentRuns: Array<{ connection: ConnectionRecord; record: SyncRunRecord }>
      lastSyncAt: string | null
    }

/** "Just now", "5m ago", "3h ago", "2d ago", then a plain date. */
function formatTimeAgo(iso: string): string {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) {
    return "Unknown"
  }
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) {
    return "Just now"
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 7) {
    return `${days}d ago`
  }
  return new Date(timestamp).toLocaleDateString()
}

/** Chip class for a run status. */
function runStatusBadgeClass(status: SyncRunRecord["report"]["status"]): string {
  if (status === "completed") {
    return "badge badge-success"
  }
  if (status === "paused") {
    return "badge badge-warning"
  }
  return "badge badge-neutral"
}

/**
 * Load analytics for every saved connection: snapshot counts, mapped field
 * counts, saved collection names, and the newest runs for the activity feed.
 */
async function loadCatalogueAnalytics(): Promise<{
  stores: StoreAnalytics[]
  totalProducts: number
  totalRuns: number
  recentRuns: Array<{ connection: ConnectionRecord; record: SyncRunRecord }>
  lastSyncAt: string | null
}> {
  const all = await listConnections()
  const stores: StoreAnalytics[] = []
  const runs: Array<{ connection: ConnectionRecord; record: SyncRunRecord }> = []
  let totalProducts = 0
  let totalRuns = 0
  let lastSyncAt: string | null = null

  for (const connection of all) {
    let productCount = 0
    let mappedFields = 0
    let collectionName: string | null = null
    let connectionRuns: SyncRunRecord[] = []
    try {
      const settings = await getSyncSettings(connection.id)
      if (settings) {
        mappedFields = settings.mapping.filter(function mapped(row) {
          return row.enabled && row.cmsFieldId !== ""
        }).length
        collectionName = settings.targetCollectionName ?? null
      }
    } catch {
      // Settings read failures leave the counts at zero for this store.
    }
    try {
      const snapshots = await getSnapshots(connection.id)
      productCount = snapshots.size
    } catch {
      // No snapshots yet for this store.
    }
    try {
      connectionRuns = await listRunHistory(connection.id)
    } catch {
      // No runs recorded yet for this store.
    }
    totalProducts += productCount
    totalRuns += connectionRuns.length
    for (const record of connectionRuns) {
      runs.push({ connection, record })
      if (lastSyncAt === null || record.finishedAt > lastSyncAt) {
        lastSyncAt = record.finishedAt
      }
    }
    stores.push({
      connection,
      productCount,
      mappedFields,
      collectionName,
      runs: connectionRuns,
    })
  }

  const recentRuns = runs
    .slice()
    .sort(function byNewest(a, b) {
      return a.record.finishedAt < b.record.finishedAt ? 1 : -1
    })
    .slice(0, 8)

  return { stores, totalProducts, totalRuns, recentRuns, lastSyncAt }
}

/** Render the catalogue analytics page. */
export function CatalogueView({
  onConnect,
  onViewConnections,
  onOpenMenu,
  onOpenAccount,
}: CatalogueViewProps) {
  const [state, setState] = useState<CatalogueState>({ status: "loading" })

  useEffect(
    function loadCatalogue() {
      let cancelled = false
      async function load() {
        try {
          const all = await listConnections()
          if (cancelled) {
            return
          }
          if (all.length === 0) {
            setState({ status: "noStore" })
            return
          }
          const analytics = await loadCatalogueAnalytics()
          if (cancelled) {
            return
          }
          setState({
            status: "ready",
            stores: analytics.stores,
            totalProducts: analytics.totalProducts,
            totalRuns: analytics.totalRuns,
            recentRuns: analytics.recentRuns,
            lastSyncAt: analytics.lastSyncAt,
          })
        } catch {
          if (!cancelled) {
            setState({ status: "noStore" })
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
            <DatabaseArrowDown size={15} strokeWidth={2.2} />
          </span>
          <div className={pageStyles.headerText}>
            <h1 className={pageStyles.pageTitle}>Catalogue</h1>
          </div>
        </div>
        <div className={pageStyles.headerActions}>
          <HelpTooltip text="Live analytics for your synced stores: products, runs, and where the data lands. Numbers update after every sync." />
          <AccountButton onOpen={onOpenAccount} />
        </div>
      </header>

      <main className={pageStyles.page}>
        <div className={pageStyles.pageContent}>
          {state.status === "loading" ? (
            <div className={pageStyles.loadingRow}>
              <span className={pageStyles.spinner} aria-hidden="true" />
              <span>Loading catalogue.</span>
            </div>
          ) : null}

          {state.status === "noStore" ? (
            <section className={`${pageStyles.heroCard} ${pageStyles.heroCardEmpty}`}>
              <span className={pageStyles.heroIconWrap} aria-hidden="true">
                <Package size={20} strokeWidth={1.8} />
              </span>
              <div className={pageStyles.heroText}>
                <h2 className={pageStyles.heroTitle}>No catalogue yet</h2>
                <p className={pageStyles.heroDescription}>
                  Connect a store and sync products to see your analytics here.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={onConnect}
              >
                Connect a store
              </button>
            </section>
          ) : null}

          {state.status === "ready" ? (
            <>
              {/* Analytics overview: four real totals. */}
              <div className={catalogueStyles.statsGrid}>
                <div className={catalogueStyles.statTile}>
                  <span className={catalogueStyles.statValue}>
                    {state.totalProducts}
                  </span>
                  <span className={catalogueStyles.statLabel}>
                    {state.totalProducts === 1
                      ? "Product synced"
                      : "Products synced"}
                  </span>
                </div>
                <div className={catalogueStyles.statTile}>
                  <span className={catalogueStyles.statValue}>
                    {state.stores.length}
                  </span>
                  <span className={catalogueStyles.statLabel}>
                    {state.stores.length === 1
                      ? "Store connected"
                      : "Stores connected"}
                  </span>
                </div>
                <div className={catalogueStyles.statTile}>
                  <span className={catalogueStyles.statValue}>
                    {state.totalRuns}
                  </span>
                  <span className={catalogueStyles.statLabel}>
                    {state.totalRuns === 1 ? "Sync run" : "Sync runs"}
                  </span>
                </div>
                <div className={catalogueStyles.statTile}>
                  <span className={catalogueStyles.statValue}>
                    {state.lastSyncAt ? formatTimeAgo(state.lastSyncAt) : "Never"}
                  </span>
                  <span className={catalogueStyles.statLabel}>Last sync</span>
                </div>
              </div>

              {/* Per-store breakdown. */}
              <section className={pageStyles.section}>
                <h2 className={pageStyles.sectionTitle}>Stores</h2>
                <div className={catalogueStyles.storeList}>
                  {state.stores.map(function renderStore(store) {
                    return (
                      <div
                        key={store.connection.id}
                        className={catalogueStyles.storeRow}
                      >
                        <BrandMark
                          provider={store.connection.providerId}
                          size={32}
                        />
                        <div className={catalogueStyles.storeInfo}>
                          <span className={catalogueStyles.storeName}>
                            {store.connection.storeHost}
                          </span>
                          <span className={catalogueStyles.storeMeta}>
                            {store.productCount === 1
                              ? "1 product"
                              : `${store.productCount} products`}
                            {" · "}
                            {store.mappedFields === 1
                              ? "1 field mapped"
                              : `${store.mappedFields} fields mapped`}
                            {store.collectionName
                              ? ` · ${store.collectionName}`
                              : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={onViewConnections}
                        >
                          <ArrowUpRight size={13} aria-hidden="true" />
                          Open
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Recent sync activity across every store. */}
              <section className={pageStyles.section}>
                <h2 className={pageStyles.sectionTitle}>
                  Recent sync activity
                  <HelpTooltip text="The newest sync runs across all your stores, newest first, with their outcomes." />
                </h2>
                <div className={catalogueStyles.activityList}>
                  {state.recentRuns.length === 0 ? (
                    <p className="muted small">No sync runs recorded yet.</p>
                  ) : (
                    state.recentRuns.map(function renderRun(entry) {
                      const report = entry.record.report
                      return (
                        <div
                          key={`${entry.connection.id}-${entry.record.id}`}
                          className={catalogueStyles.activityRow}
                        >
                          <BrandMark
                            provider={entry.connection.providerId}
                            size={24}
                          />
                          <div className={catalogueStyles.activityMain}>
                            <div className={catalogueStyles.activityTop}>
                              <span className={catalogueStyles.activityHost}>
                                {entry.connection.storeHost}
                              </span>
                              <span className={catalogueStyles.activityTime}>
                                {formatTimeAgo(entry.record.finishedAt)}
                              </span>
                            </div>
                            <div className={catalogueStyles.activityMeta}>
                              <span className={runStatusBadgeClass(report.status)}>
                                <span className="badge-dot" aria-hidden="true" />
                                {report.status}
                              </span>
                              <span className={catalogueStyles.activityResult}>
                                {report.created === 1
                                  ? "1 created"
                                  : `${report.created} created`}
                                {" · "}
                                {report.updated === 1
                                  ? "1 updated"
                                  : `${report.updated} updated`}
                                {report.failed > 0
                                  ? ` · ${report.failed} failed`
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              {state.totalProducts > 0 ? (
                <section className={pageStyles.section}>
                  <h2 className={pageStyles.sectionTitle}>
                    Where to find products
                  </h2>
                  <div className={catalogueStyles.stepsCard}>
                    <div className={catalogueStyles.stepRow}>
                      <span
                        className={catalogueStyles.stepNumber}
                        aria-hidden="true"
                      >
                        1
                      </span>
                      <p className="muted small">
                        Open the CMS panel in Framer and find the collection
                        created for this store.
                      </p>
                    </div>
                    <div className={catalogueStyles.stepRow}>
                      <span
                        className={catalogueStyles.stepNumber}
                        aria-hidden="true"
                      >
                        2
                      </span>
                      <p className="muted small">
                        Drop the collection onto the canvas to lay out products.
                      </p>
                    </div>
                    <div className={catalogueStyles.stepRow}>
                      <span
                        className={catalogueStyles.stepNumber}
                        aria-hidden="true"
                      >
                        3
                      </span>
                      <p className="muted small">
                        Sync again any time to pull new products and stock
                        changes.
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className={pageStyles.section}>
                <div className={`${pageStyles.heroCard} ${pageStyles.heroCardEmpty}`}>
                  <div className={pageStyles.heroText}>
                    <h2 className={pageStyles.heroTitle}>Need another store?</h2>
                    <p className={pageStyles.heroDescription}>
                      Connect more WooCommerce stores and their analytics show
                      up here too.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={onConnect}
                  >
                    Connect a store
                  </button>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </>
  )
}
