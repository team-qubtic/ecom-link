/**
 * Sync Run Report - the pure model describing one sync run
 *
 * The engine fills a SyncReport as it works and hands it to three consumers:
 * the report modal shows it, history stores the last few runs, and the
 * watermark logic reads the status to decide whether the run counts as a
 * checkpoint. This module has no SDK or provider dependencies so it can be
 * unit tested and reused anywhere.
 */

/** How a sync run ended. */
export type SyncRunStatus = "completed" | "canceled" | "paused" | "stopped"

/** One item level problem, shown as an expandable row in the report modal. */
export interface SyncFailure {
  itemName: string
  message: string
}

/**
 * The outcome of one sync run. Counts are per item; failures are capped by
 * the engine so a broken catalog cannot produce an unbounded array.
 */
export interface SyncReport {
  status: SyncRunStatus
  startedAt: string
  finishedAt: string
  created: number
  updated: number
  skipped: number
  failed: number
  failures: SyncFailure[]
  notes: string[]
  /** Page the run paused on, so a retry can resume from it. */
  failedPage: number | null
  /** Outcome of the write-back phase, present when one ran (spec 004). */
  writeBack?: WriteBackSummary
}

/**
 * The write-back half of a sync run (spec 004), filled by runPush and
 * attached to the report after the merchant confirms the review. Conflicts
 * kept on the store value are counted, never written.
 */
export interface WriteBackSummary {
  /** Products written to the store. */
  written: number
  /** Item level problems, capped like the pull failures. */
  failures: SyncFailure[]
  /** Conflicts the merchant kept on the store value. */
  conflictsKept: number
  /** True when the store rejected the writes because the key cannot write. */
  stoppedByPermissions: boolean
}

/** Maximum failures kept on a report before the engine truncates the list. */
export const MAX_REPORT_FAILURES = 20

/** Short label for a status, used in the report modal header. */
export function reportStatusLabel(status: SyncRunStatus): string {
  switch (status) {
    case "completed":
      return "Completed"
    case "canceled":
      return "Canceled"
    case "paused":
      return "Paused"
    case "stopped":
      return "Stopped early"
  }
}

/** Pluralize a count the UX way: "1 item", "0 items", "3 items". */
function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/**
 * The summary count lines of a report. The updated and created lines are
 * always present (a "0 items updated." line is meaningful after a no-change
 * re-run), while skipped and failed lines only appear when nonzero.
 */
export function describeReport(report: SyncReport): string[] {
  const lines = [
    `${formatCount(report.updated, "item")} updated.`,
    `${formatCount(report.created, "item")} created.`,
  ]
  if (report.skipped > 0) {
    lines.push(`${formatCount(report.skipped, "item")} skipped.`)
  }
  if (report.failed > 0) {
    lines.push(`${formatCount(report.failed, "item")} failed.`)
  }
  return lines
}
