/**
 * SyncProgress: live progress readout for one running sync (spec 003).
 *
 * Shows the page the engine is working on, how many items were processed,
 * and the Cancel button that flips the abort signal the engine checks
 * between pages. Items already written are kept when the run stops.
 */

import type { SyncProgress as SyncProgressSnapshot } from "../../sync/engine"
import styles from "../../assets/styles/module/SyncProgress.module.css"

interface SyncProgressProps {
  /** Latest engine progress, or null before the first page returns. */
  progress: SyncProgressSnapshot | null
  /** True after the user canceled, while the engine finishes the page. */
  cancelRequested: boolean
  /** Ask the engine to stop after the current page. */
  onCancel: () => void
}

/** Pluralize a count the UX way: "1 item", "0 items", "3 items". */
function formatItems(count: number): string {
  return count === 1 ? "1 item" : `${count} items`
}

/** The headline line for the current moment of the run. */
function statusLine(progress: SyncProgressSnapshot | null, cancelRequested: boolean): string {
  if (cancelRequested) {
    return "Finishing the current page, then stopping."
  }
  if (progress === null) {
    return "Starting sync."
  }
  return `Syncing page ${progress.page} of ${progress.totalPages}.`
}

/**
 * Render the progress readout: status line, processed count, progress bar,
 * and the cancel control.
 */
export function SyncProgress({ progress, cancelRequested, onCancel }: SyncProgressProps) {
  const percent =
    progress !== null && progress.totalItems > 0
      ? Math.round((progress.processed / progress.totalItems) * 100)
      : null

  return (
    <div className={styles.progress}>
      <div className={styles.statusRow}>
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.statusText}>{statusLine(progress, cancelRequested)}</p>
      </div>
      {progress !== null && progress.totalItems > 0 ? (
        <p className={styles.countText}>
          {`${progress.processed} of ${formatItems(progress.totalItems)} processed.`}
        </p>
      ) : null}
      <div
        className={styles.barTrack}
        role="progressbar"
        aria-valuenow={percent === null ? undefined : percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Sync progress"
      >
        <div className={styles.barFill} style={{ width: `${percent ?? 0}%` }} />
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={onCancel}
        disabled={cancelRequested}
      >
        {cancelRequested ? "Canceling…" : "Cancel"}
      </button>
    </div>
  )
}
