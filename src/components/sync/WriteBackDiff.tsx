/**
 * WriteBackDiff: one field row for the write-back review tables (spec 004).
 *
 * Shows the field label next to the two competing values: the current store
 * value and the Framer value that would be written. Conflict rows get the
 * warning treatment so they stand out from plain pushes.
 */
import { formatPendingValue } from "../../sync/conflict"
import styles from "../../assets/styles/module/WriteBackReviewModal.module.css"

interface WriteBackDiffProps {
  /** Singular field label from WRITE_FIELD_LABELS. */
  fieldLabel: string
  /** The value currently in the store. */
  storeValue: unknown
  /** The value currently in the Framer collection. */
  framerValue: unknown
  /** True when both sides changed since the last sync. */
  conflicting?: boolean
}

/** Render one diff row. Pure, no state. */
export function WriteBackDiff({
  fieldLabel,
  storeValue,
  framerValue,
  conflicting,
}: WriteBackDiffProps) {
  const rowClass = conflicting
    ? `${styles.diffRow} ${styles.diffRowConflict}`
    : styles.diffRow
  return (
    <div className={rowClass}>
      <span className={styles.diffField}>{fieldLabel}</span>
      <span className={styles.diffValueStore}>
        {formatPendingValue(storeValue)}
      </span>
      <span className={styles.diffValue}>{formatPendingValue(framerValue)}</span>
    </div>
  )
}
