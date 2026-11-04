/**
 * CatalogueView: browse the products a connection has synced into Framer.
 *
 * The catalogue mirrors sync snapshots (one snapshot entry per synced
 * product), so the counts here are real. Products themselves live in the
 * Framer CMS collection; this page shows the catalogue summary and routes
 * the merchant to the right next action.
 */

import { useEffect, useState } from "react"
import { ArrowUpRight, DatabaseArrowDown, Package, RefreshCw } from "lucide-react"

import pageStyles from "../assets/styles/module/Dashboard.module.css"
import catalogueStyles from "../assets/styles/module/Catalogue.module.css"
import { BrandMark } from "../components/ui/BrandMark"
import { MenuButton } from "../components/ui/MenuButton"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import { AccountButton } from "../components/ui/AccountButton"
import {
  getActiveConnection,
  listConnections,
  type ConnectionRecord,
} from "../storage/connections"
import { getSyncSettings } from "../storage/settings"
import { getSnapshots } from "../storage/snapshots"

interface CatalogueViewProps {
  onConnect: () => void
  /** Opens the Connections page (sync runs from there). */
  onViewConnections: () => void
  /** Opens the navigation drawer. */
  onOpenMenu: () => void
  /** Opens the account page. */
  onOpenAccount: () => void
}

/** What the catalogue page knows about the store right now. */
type CatalogueState =
  | { status: "loading" }
  | { status: "noStore" }
  | { status: "neverSynced"; connection: ConnectionRecord }
  | { status: "ready"; connection: ConnectionRecord; productCount: number }

/** Render the catalogue page. */
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
          const active = (await getActiveConnection()) ?? all[0]
          const settings = await getSyncSettings(active.id)
          if (cancelled) {
            return
          }
          if (settings === null) {
            setState({ status: "neverSynced", connection: active })
            return
          }
          const snapshots = await getSnapshots(active.id)
          if (cancelled) {
            return
          }
          setState({
            status: "ready",
            connection: active,
            productCount: snapshots.size,
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
          <HelpTooltip text="Products sync into a Framer CMS collection. This page tracks how many items each store has synced." />
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
                Connect a store and sync products to browse them here.
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

        {state.status === "neverSynced" ? (
          <section className={`${pageStyles.heroCard} ${pageStyles.heroCardEmpty}`}>
            <span className={pageStyles.heroIconWrap} aria-hidden="true">
              <RefreshCw size={20} strokeWidth={1.8} />
            </span>
            <div className={pageStyles.heroText}>
              <h2 className={pageStyles.heroTitle}>Run your first sync</h2>
              <p className={pageStyles.heroDescription}>
                Choose the fields to sync from{" "}
                {state.connection.storeHost}, then run a sync to fill the
                catalogue.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={onViewConnections}
            >
              Open connections
            </button>
          </section>
        ) : null}

        {state.status === "ready" ? (
          <section className={`${pageStyles.heroCard} ${pageStyles.heroCardActive}`}>
            <div className={pageStyles.heroTop}>
              <BrandMark provider={state.connection.providerId} size={40} />
              <div className={pageStyles.heroText}>
                <h2 className={pageStyles.heroTitle}>
                  {state.connection.storeHost}
                </h2>
                <div className={pageStyles.heroMeta}>
                  <span className="badge badge-primary">
                    <span className="badge-dot" aria-hidden="true" />
                    {state.productCount === 1
                      ? "1 product synced"
                      : `${state.productCount} products synced`}
                  </span>
                </div>
              </div>
            </div>
            <div className={catalogueStyles.catalogueHint}>
              <p className="muted small">
                Products live in your Framer CMS collection. Edits there sync
                back on the next run.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={onViewConnections}
              >
                Manage
                <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : null}

        {state.status === "ready" && state.productCount > 0 ? (
          <section className={pageStyles.section}>
            <h2 className={pageStyles.sectionTitle}>Where to find products</h2>
            <div className={catalogueStyles.stepsCard}>
              <div className={catalogueStyles.stepRow}>
                <span className={catalogueStyles.stepNumber} aria-hidden="true">
                  1
                </span>
                <p className="muted small">
                  Open the CMS panel in Framer and find the collection created
                  for this store.
                </p>
              </div>
              <div className={catalogueStyles.stepRow}>
                <span className={catalogueStyles.stepNumber} aria-hidden="true">
                  2
                </span>
                <p className="muted small">
                  Drop the collection onto the canvas to lay out products.
                </p>
              </div>
              <div className={catalogueStyles.stepRow}>
                <span className={catalogueStyles.stepNumber} aria-hidden="true">
                  3
                </span>
                <p className="muted small">
                  Run a sync again any time to pull new products and stock
                  changes.
                </p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
      </main>
    </>
  )
}
