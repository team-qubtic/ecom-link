/**
 * ConnectionsPage: manages every saved store connection.
 *
 * Owns the connection list with per-connection actions (sync, set active,
 * revalidate, edit, disconnect) and the whole sync flow: mapping wizard,
 * live progress modal, write-back review, and the final report. All data
 * flows through the storage layer; no platform calls happen here.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Pencil, RefreshCw, Star, Trash2 } from "lucide-react"

import pageStyles from "../assets/styles/module/Dashboard.module.css"
import { Modal } from "../components/ui/Modal"
import { BrandMark } from "../components/ui/BrandMark"
import { MenuButton } from "../components/ui/MenuButton"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import { AccountButton } from "../components/ui/AccountButton"
import {
  CMS_PERMISSION_MESSAGE,
  deleteConnection,
  listConnections,
  revalidateConnection,
  setActiveConnection,
  type ConnectionRecord,
  type ValidationState,
} from "../storage/connections"
import { useCanEditCms } from "../lib/permissions"
import {
  CONNECTION_STATE_LABELS,
  KEY_SCOPE_LABELS,
  formatErrorSentence,
} from "./ConnectionModal"
import { formatCount } from "./Dashboard"
import { SyncProgress } from "../components/sync/SyncProgress"
import { collectPendingChanges, runPull, runPush } from "../sync/engine"
import type { SyncProgress as SyncProgressSnapshot, WriteBackCheck } from "../sync/engine"
import type { PendingChange } from "../sync/conflict"
import type { SyncReport } from "../sync/report"
import { getSyncSettings } from "../storage/settings"
import type { SyncSettings } from "../storage/settings"
import { MappingModal } from "./MappingModal"
import { SyncReportModal } from "./SyncReportModal"
import { WriteBackReviewModal } from "./WriteBackReviewModal"

interface ConnectionsPageProps {
  /** Bumped by the app shell whenever a save changes the data. */
  dataVersion: number
  onConnect: () => void
  onEdit: (connection: ConnectionRecord) => void
  /** Opens the navigation drawer. */
  onOpenMenu: () => void
  /** Opens the account page. */
  onOpenAccount: () => void
}

/** Copy of a report with one extra note line. Used when the write-back leg
 * of a sync cannot run, so the report explains why nothing was sent. */
function addReportNote(report: SyncReport, note: string): SyncReport {
  return { ...report, notes: [...report.notes, note] }
}

function stateBadgeClass(state: ValidationState): string {
  if (state === "valid") {
    return "badge badge-success"
  }
  if (state === "invalid") {
    return "badge badge-error"
  }
  return "badge badge-neutral"
}

function formatLastChecked(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return "Not checked yet."
  }
  const formatted = date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  return `Last checked ${formatted}.`
}

/** Where a sync run is in its lifecycle. This page owns the whole
 * flow: the mapping wizard, the live progress modal, and the report after. */
type SyncPhase =
  | { kind: "idle" }
  | { kind: "mapping"; connection: ConnectionRecord }
  | {
      kind: "running"
      connection: ConnectionRecord
      settings: SyncSettings
      progress: SyncProgressSnapshot | null
      cancelRequested: boolean
    }
  | {
      kind: "report"
      connection: ConnectionRecord
      settings: SyncSettings
      report: SyncReport
    }
  | {
      kind: "writeReview"
      connection: ConnectionRecord
      settings: SyncSettings
      pullReport: SyncReport
      changes: PendingChange[]
      names: Record<string, string>
    }

/** Render the connections manager. */
export function ConnectionsPage({ dataVersion, onConnect, onEdit, onOpenMenu, onOpenAccount }: ConnectionsPageProps) {
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyChecking, setBusyChecking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingDisconnect, setPendingDisconnect] =
    useState<ConnectionRecord | null>(null)
  const [syncPhase, setSyncPhase] = useState<SyncPhase>({ kind: "idle" })
  const [syncReady, setSyncReady] = useState<Record<string, boolean>>({})
  const abortSignalRef = useRef<{ aborted: boolean } | null>(null)

  /** Reactive CMS permission check: false when the account cannot edit CMS
   * collections, so every write action stays disabled until it returns. */
  const canEditCms = useCanEditCms()

  const load = useCallback(async function loadConnections() {
    setLoading(true)
    setLoadError(null)
    try {
      const loaded = await listConnections()
      setConnections(loaded)
      const ready: Record<string, boolean> = {}
      for (const connection of loaded) {
        ready[connection.id] = (await getSyncSettings(connection.id)) !== null
      }
      setSyncReady(ready)
    } catch {
      setLoadError(
        "Connections could not be loaded. Close and reopen the plugin, then try again."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(
    function loadOnMountAndRefresh() {
      void load()
    },
    [load, dataVersion]
  )

  async function handleSetActive(connection: ConnectionRecord) {
    setBusyId(connection.id)
    setActionError(null)
    try {
      await setActiveConnection(connection.id)
      await load()
    } catch {
      setActionError("The active connection could not be changed. Try again.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleRevalidate(connection: ConnectionRecord) {
    setBusyId(connection.id)
    setBusyChecking(true)
    setActionError(null)
    try {
      await revalidateConnection(connection.id)
      await load()
    } catch (error) {
      setActionError(formatErrorSentence(error))
      await load()
    } finally {
      setBusyChecking(false)
      setBusyId(null)
    }
  }

  async function handleDisconnect() {
    const target = pendingDisconnect
    if (!target) {
      return
    }
    setBusyId(target.id)
    setActionError(null)
    try {
      await deleteConnection(target.id)
      setPendingDisconnect(null)
      await load()
    } catch {
      setActionError("The connection could not be removed. Try again.")
    } finally {
      setBusyId(null)
    }
  }

  function beginSync(
    connection: ConnectionRecord,
    settings: SyncSettings,
    resumeFromPage?: number
  ) {
    const signal = { aborted: false }
    abortSignalRef.current = signal
    setSyncPhase({
      kind: "running",
      connection,
      settings,
      progress: null,
      cancelRequested: false,
    })
    void runSync(connection, settings, signal, resumeFromPage)
  }

  async function runSync(
    connection: ConnectionRecord,
    settings: SyncSettings,
    signal: { aborted: boolean },
    resumeFromPage?: number
  ): Promise<void> {
    let report: SyncReport
    try {
      report = await runPull(connection, settings, {
        onPage: function handlePage(progress: SyncProgressSnapshot) {
          setSyncPhase(function applyPageProgress(current: SyncPhase) {
            if (current.kind !== "running") {
              return current
            }
            return { ...current, progress }
          })
        },
        signal,
        resumeFromPage,
      })
    } catch (error) {
      abortSignalRef.current = null
      setSyncPhase({ kind: "idle" })
      setActionError(
        error instanceof Error ? error.message : "The sync could not start. Try again."
      )
      return
    }
    abortSignalRef.current = null
    if (report.status !== "completed" || connection.keyScope !== "read_write") {
      setSyncPhase({ kind: "report", connection, settings, report })
      return
    }
    let check: WriteBackCheck
    try {
      check = await collectPendingChanges(connection, settings)
    } catch {
      setSyncPhase({
        kind: "report",
        connection,
        settings,
        report: addReportNote(
          report,
          "Two-way changes could not be checked, so nothing was sent to the store."
        ),
      })
      return
    }
    if (check.changes.length === 0) {
      setSyncPhase({ kind: "report", connection, settings, report })
      return
    }
    setSyncPhase({
      kind: "writeReview",
      connection,
      settings,
      pullReport: report,
      changes: check.changes,
      names: check.names,
    })
  }

  async function handleStartSync(connection: ConnectionRecord) {
    setActionError(null)
    let settings: SyncSettings | null
    try {
      settings = await getSyncSettings(connection.id)
    } catch {
      setActionError("The sync settings could not be loaded. Try again.")
      return
    }
    if (settings === null) {
      setSyncPhase({ kind: "mapping", connection })
      return
    }
    beginSync(connection, settings)
  }

  function handleCancelSync() {
    if (abortSignalRef.current !== null) {
      abortSignalRef.current.aborted = true
    }
    setSyncPhase(function requestCancel(current: SyncPhase) {
      if (current.kind !== "running") {
        return current
      }
      return { ...current, cancelRequested: true }
    })
  }

  function handleRetryFromPage(page: number) {
    if (syncPhase.kind !== "report") {
      return
    }
    beginSync(syncPhase.connection, syncPhase.settings, page)
  }

  function handleCloseReport() {
    if (syncPhase.kind === "report") {
      const finishedId = syncPhase.connection.id
      setSyncReady(function markReady(map: Record<string, boolean>) {
        return { ...map, [finishedId]: true }
      })
    }
    setSyncPhase({ kind: "idle" })
  }

  async function handleConfirmWriteBack(resolved: PendingChange[]): Promise<void> {
    if (syncPhase.kind !== "writeReview") {
      return
    }
    const { connection, settings, pullReport } = syncPhase
    try {
      const writeBack = await runPush(connection, resolved)
      setSyncPhase({
        kind: "report",
        connection,
        settings,
        report: { ...pullReport, writeBack },
      })
    } catch {
      setSyncPhase({
        kind: "report",
        connection,
        settings,
        report: addReportNote(
          pullReport,
          "Write-back could not start. Nothing was sent to the store."
        ),
      })
    }
  }

  function handleCancelWriteBack(): void {
    if (syncPhase.kind !== "writeReview") {
      return
    }
    const { connection, settings, pullReport } = syncPhase
    setSyncPhase({
      kind: "report",
      connection,
      settings,
      report: addReportNote(
        pullReport,
        "Write-back was canceled. Nothing was sent to the store."
      ),
    })
  }

  function renderConnection(connection: ConnectionRecord) {
    const busy = busyId === connection.id
    return (
      <li
        key={connection.id}
        className={
          connection.isActive
            ? `${pageStyles.connectionCard} ${pageStyles.connectionCardActive}`
            : pageStyles.connectionCard
        }
      >
        <div className={pageStyles.connectionTop}>
          <BrandMark provider={connection.providerId} size={36} />
          <div className={pageStyles.connectionMain}>
            <div className={pageStyles.connectionTitleRow}>
              <span className={pageStyles.connectionHost}>{connection.storeHost}</span>
              {connection.isActive ? (
                <span className="badge badge-primary">
                  <span className="badge-dot" aria-hidden="true" />
                  Active
                </span>
              ) : null}
            </div>
            <div className={pageStyles.connectionBadges}>
              <span className={stateBadgeClass(connection.validationState)}>
                <span className="badge-dot" aria-hidden="true" />
                {CONNECTION_STATE_LABELS[connection.validationState]}
              </span>
              <span className="badge badge-neutral">
                {KEY_SCOPE_LABELS[connection.keyScope]}
              </span>
            </div>
          </div>
        </div>
        <p className={pageStyles.connectionMeta}>
          {connection.lastValidatedAt
            ? formatLastChecked(connection.lastValidatedAt)
            : "Not checked yet."}
        </p>
        <div className={pageStyles.connectionActions}>
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={busyId !== null || !canEditCms || syncPhase.kind !== "idle"}
            onClick={function handleClick() {
              void handleStartSync(connection)
            }}
          >
            <RefreshCw size={12} aria-hidden="true" />
            {syncReady[connection.id] ? "Sync now" : "Start sync"}
          </button>
          {!connection.isActive ? (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy || !canEditCms}
              aria-label={`Set ${connection.storeHost} as the active store`}
              onClick={function handleClick() {
                void handleSetActive(connection)
              }}
            >
              <Star size={12} aria-hidden="true" />
              Set active
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={busy || !canEditCms}
            onClick={function handleClick() {
              void handleRevalidate(connection)
            }}
          >
            {busy && busyChecking ? "Checking\u2026" : "Revalidate"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            disabled={busy}
            aria-label={`Edit ${connection.storeHost}`}
            title="Edit connection"
            onClick={function handleClick() {
              onEdit(connection)
            }}
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-ghost-danger"
            disabled={busy || !canEditCms}
            aria-label={`Disconnect ${connection.storeHost}`}
            title="Disconnect"
            onClick={function handleClick() {
              setPendingDisconnect(connection)
            }}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>
      </li>
    )
  }

  return (
    <>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBrand}>
          <MenuButton onOpen={onOpenMenu} />
          <span className={pageStyles.headerLogo} aria-hidden="true">
            <Link size={15} strokeWidth={2.2} />
          </span>
          <div className={pageStyles.headerText}>
            <h1 className={pageStyles.pageTitle}>Connections</h1>
          </div>
        </div>
        <div className={pageStyles.headerActions}>
          <HelpTooltip text="Sync products from a connected store into Framer CMS collections." />
          <AccountButton onOpen={onOpenAccount} />
        </div>
      </header>

      <main className={pageStyles.page}>
        <div className={pageStyles.pageContent}>
        {!canEditCms ? (
          <div className="notice notice-error" role="alert">
            <h3 className="notice-title">CMS Editing Blocked</h3>
            <p>{CMS_PERMISSION_MESSAGE}</p>
          </div>
        ) : null}
        {loadError ? (
          <div className="notice notice-error" role="alert">
            <p>{loadError}</p>
          </div>
        ) : null}
        {actionError ? (
          <div className="notice notice-error" role="alert">
            <p>{actionError}</p>
          </div>
        ) : null}

        {loading ? (
          <div className={pageStyles.loadingRow}>
            <span className={pageStyles.spinner} aria-hidden="true" />
            <span>Loading connections.</span>
          </div>
        ) : connections.length > 0 ? (
          <section className={pageStyles.listCard}>
            <div className={pageStyles.listHeadingRow}>
              <h2 className={pageStyles.listTitle}>Your connections</h2>
              <span className="muted small">
                {formatCount(connections.length, "connection")}
              </span>
            </div>
            <ul className={pageStyles.connectionList}>
              {connections.map(renderConnection)}
            </ul>
          </section>
        ) : (
          <section className={`${pageStyles.heroCard} ${pageStyles.heroCardEmpty}`}>
            <span className={pageStyles.heroIconWrap} aria-hidden="true">
              <Link size={20} strokeWidth={1.8} />
            </span>
            <div className={pageStyles.heroText}>
              <h2 className={pageStyles.heroTitle}>No stores connected yet</h2>
              <p className={pageStyles.heroDescription}>
                Connect a store to start syncing products into Framer.
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
        )}

        {pendingDisconnect ? (
          <Modal
            title="Disconnect Store?"
            onClose={function handleClose() {
              setPendingDisconnect(null)
            }}
            footer={
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId !== null}
                  onClick={function handleClose() {
                    setPendingDisconnect(null)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busyId !== null || !canEditCms}
                  onClick={function handleConfirm() {
                    void handleDisconnect()
                  }}
                >
                  Disconnect
                </button>
              </>
            }
          >
            <p>
              This removes the stored keys for{" "}
              {pendingDisconnect.storeHost}. Products already synced stay in
              your CMS collection. Syncing stops until you connect again.
            </p>
          </Modal>
        ) : null}
        {syncPhase.kind === "mapping" ? (
          <MappingModal
            connection={syncPhase.connection}
            onStart={function handleMappingStart(settings: SyncSettings) {
              if (syncPhase.kind !== "mapping") {
                return
              }
              beginSync(syncPhase.connection, settings)
            }}
            onClose={function closeMapping() {
              setSyncPhase({ kind: "idle" })
            }}
          />
        ) : null}
        {syncPhase.kind === "running" ? (
          <Modal title="Syncing Products" onClose={handleCancelSync}>
            <SyncProgress
              progress={syncPhase.progress}
              cancelRequested={syncPhase.cancelRequested}
              onCancel={handleCancelSync}
            />
          </Modal>
        ) : null}
        {syncPhase.kind === "report" ? (
          <SyncReportModal
            connection={syncPhase.connection}
            settings={syncPhase.settings}
            report={syncPhase.report}
            onRetry={handleRetryFromPage}
            onClose={handleCloseReport}
          />
        ) : null}
        {syncPhase.kind === "writeReview" ? (
          <WriteBackReviewModal
            changes={syncPhase.changes}
            names={syncPhase.names}
            onConfirm={function handleConfirmed(changes: PendingChange[]) {
              void handleConfirmWriteBack(changes)
            }}
            onCancel={handleCancelWriteBack}
          />
        ) : null}
      </div>
      </main>
    </>
  )
}
