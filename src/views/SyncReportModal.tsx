/**
 * SyncReportModal: outcome of one sync run (spec 003). Summarizes what was
 * updated, created, and skipped, lists the problems that need attention,
 * offers a retry that resumes from the failed page, and lets the merchant
 * clean up products that were deleted from the store.
 */
import { useState } from "react"
import type { ConnectionRecord } from "../storage/connections"
import type { SyncSettings } from "../storage/settings"
import { MAX_REPORT_FAILURES, describeReport, reportStatusLabel } from "../sync/report"
import type { SyncReport, SyncRunStatus } from "../sync/report"
import { WRITE_PERMISSION_MESSAGE, findDeletedProducts, removeDeletedProducts } from "../sync/engine"
import type { DeletedCmsProduct } from "../sync/engine"
import { Modal } from "../components/ui/Modal"
import styles from "../assets/styles/module/SyncReportModal.module.css"

/** The deleted-products cleanup widget moves through these states. */
type CleanupState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "list"; deleted: DeletedCmsProduct[] }
  | { kind: "removing"; deleted: DeletedCmsProduct[] }
  | { kind: "done"; removedCount: number }
  | { kind: "error"; message: string }

interface SyncReportModalProps {
  connection: ConnectionRecord
  settings: SyncSettings
  report: SyncReport
  onRetry: (page: number) => void
  onClose: () => void
}

/** Pluralize a count the UX way: "1 item", "2 items". */
function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** Formats the finish time. An invalid date renders as an empty string. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return `Finished ${date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
}

/** Maps a run status onto the badge classes shared with the dashboard. */
function statusBadgeClass(status: SyncRunStatus): string {
  if (status === "completed") {
    return "badge badge-success"
  }
  if (status === "canceled") {
    return "badge badge-neutral"
  }
  return "badge badge-warning"
}

export function SyncReportModal(props: SyncReportModalProps) {
  const { connection, settings, report, onRetry, onClose } = props
  const [showFailures, setShowFailures] = useState(false)
  const [cleanupState, setCleanupState] = useState<CleanupState>({ kind: "idle" })

  const canRetry = report.status === "paused" && report.failedPage !== null
  const retryPage = report.failedPage

  async function handleCheckDeleted(): Promise<void> {
    setCleanupState({ kind: "checking" })
    try {
      const deleted = await findDeletedProducts(connection, settings)
      setCleanupState({ kind: "list", deleted })
    } catch {
      setCleanupState({
        kind: "error",
        message: "Deleted products could not be checked. Try again.",
      })
    }
  }

  async function handleRemoveDeleted(deleted: DeletedCmsProduct[]): Promise<void> {
    setCleanupState({ kind: "removing", deleted })
    try {
      const itemIds = deleted.map(function itemIdOf(product: DeletedCmsProduct) {
        return product.itemId
      })
      await removeDeletedProducts(settings, itemIds)
      setCleanupState({ kind: "done", removedCount: deleted.length })
    } catch {
      setCleanupState({ kind: "error", message: "The items could not be removed. Try again." })
    }
  }

  function toggleFailures(): void {
    setShowFailures(!showFailures)
  }

  /** The cleanup widget renders one control per state. */
  function renderCleanup() {
    if (cleanupState.kind === "checking") {
      return <p className="muted">Checking…</p>
    }
    if (cleanupState.kind === "removing") {
      return <p className="muted">Removing…</p>
    }
    if (cleanupState.kind === "list") {
      if (cleanupState.deleted.length === 0) {
        return <p className="muted">No deleted products were found.</p>
      }
      return (
        <>
          <ul className={styles.deletedList}>
            {cleanupState.deleted.map(function renderDeletedItem(product: DeletedCmsProduct) {
              return (
                <li className={styles.deletedItem} key={product.itemId}>
                  {product.itemName}
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="btn btn-danger btn-small"
            onClick={function handleRemoveClick() {
              void handleRemoveDeleted(cleanupState.deleted)
            }}
          >
            Remove {formatCount(cleanupState.deleted.length, "item")}
          </button>
        </>
      )
    }
    if (cleanupState.kind === "done") {
      return (
        <p className={styles.successText}>
          {formatCount(cleanupState.removedCount, "item")} removed from the collection.
        </p>
      )
    }
    if (cleanupState.kind === "error") {
      return (
        <div className="notice notice-error" role="alert">
          <p>{cleanupState.message}</p>
        </div>
      )
    }
    return (
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={function handleCheckClick() {
          void handleCheckDeleted()
        }}
      >
        Check for deleted products
      </button>
    )
  }

  const footer =
    canRetry && retryPage !== null ? (
      <>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Done
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={function handleRetryClick() {
            onRetry(retryPage)
          }}
        >
          Retry from page {retryPage}
        </button>
      </>
    ) : (
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Done
      </button>
    )

  return (
    <Modal title="Sync Report" onClose={onClose} footer={footer}>
      <>
        <div className={styles.headerRow}>
          <span className={statusBadgeClass(report.status)}>{reportStatusLabel(report.status)}</span>
          <span className="muted small">{formatWhen(report.finishedAt)}</span>
        </div>
        <ul className={styles.summaryList}>
          {describeReport(report).map(function renderSummaryLine(line: string) {
            return <li key={line}>{line}</li>
          })}
        </ul>
        {canRetry && retryPage !== null ? (
          <p className="muted small">The sync paused on page {retryPage}. Retry resumes from that page.</p>
        ) : null}
        {report.notes.map(function renderNote(note: string) {
          return (
            <div className="notice notice-warning" role="status" key={note}>
              <p>{note}</p>
            </div>
          )
        })}
        {report.failures.length > 0 ? (
          <div className={styles.failures}>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              aria-expanded={showFailures}
              onClick={toggleFailures}
            >
              {showFailures ? "Hide problems" : `Show problems (${report.failures.length})`}
            </button>
            {showFailures ? (
              <>
                <ul className={styles.failureList}>
                  {report.failures.map(function renderFailure(failure, index: number) {
                    return (
                      <li className={styles.failureItem} key={`${failure.itemName}-${index}`}>
                        <span className={styles.failureName}>{failure.itemName}</span>
                        <span className="muted small">{failure.message}</span>
                      </li>
                    )
                  })}
                </ul>
                {report.failures.length >= MAX_REPORT_FAILURES ? (
                  <p className="muted small">Only the first {MAX_REPORT_FAILURES} problems are listed.</p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        {report.writeBack ? (
          <div className={styles.writeBack}>
            <h3 className={styles.cleanupTitle}>Store Changes</h3>
            <ul className={styles.summaryList}>
              <li>{formatCount(report.writeBack.written, "product")} written to the store.</li>
              {report.writeBack.conflictsKept > 0 ? (
                <li>{formatCount(report.writeBack.conflictsKept, "field")} kept the store value.</li>
              ) : null}
            </ul>
            {report.writeBack.stoppedByPermissions ? (
              <div className="notice notice-error" role="alert">
                <p>{WRITE_PERMISSION_MESSAGE}</p>
              </div>
            ) : null}
            {report.writeBack.failures.length > 0 ? (
              <ul className={styles.failureList}>
                {report.writeBack.failures.map(function renderWriteFailure(failure, index: number) {
                  return (
                    <li className={styles.failureItem} key={`${failure.itemName}-${index}`}>
                      <span className={styles.failureName}>{failure.itemName}</span>
                      <span className="muted small">{failure.message}</span>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className={styles.cleanup}>
          <h3 className={styles.cleanupTitle}>Deleted Products</h3>
          <p className="muted small">
            Products removed from the store stay in the collection until you clean them up here.
            Nothing is deleted without your confirmation.
          </p>
          {renderCleanup()}
        </div>
      </>
    </Modal>
  )
}
