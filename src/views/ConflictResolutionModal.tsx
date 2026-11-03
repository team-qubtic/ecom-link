/**
 * ConflictResolutionModal: deciding conflicts before write-back (spec 004).
 *
 * One card per field that changed in both the store and Framer. The merchant
 * picks which value wins. Unresolved conflicts keep the store value, so
 * closing early never writes anything risky.
 */
import type { PendingChange } from "../sync/conflict"
import { WRITE_FIELD_LABELS } from "../sync/conflict"
import type { NormalizedProductField } from "../providers"
import { Modal } from "../components/ui/Modal"
import { WriteBackDiff } from "../components/sync/WriteBackDiff"
import { conflictStatusText, writeBackProductName } from "./WriteBackReviewModal"
import styles from "../assets/styles/module/WriteBackReviewModal.module.css"

interface ConflictResolutionModalProps {
  /** Every conflict from the review, resolved or not. */
  conflicts: PendingChange[]
  /** Product display names keyed by store product id. */
  names: Record<string, string>
  /** Called when the merchant picks a side for one field. */
  onResolve: (
    itemWooId: string,
    field: NormalizedProductField,
    resolution: "push" | "keep-woo"
  ) => void
  /** Returns to the review modal. */
  onDone: () => void
}

/** Pluralize a count the UX way: "1 conflict", "2 conflicts". */
function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** Render the decision cards for every conflict. */
export function ConflictResolutionModal(props: ConflictResolutionModalProps) {
  const { conflicts, names, onResolve, onDone } = props
  const resolvedCount = conflicts.filter(function isDecided(
    change: PendingChange
  ): boolean {
    return change.resolution !== "pending"
  }).length

  const footer = (
    <button type="button" className="btn btn-primary" onClick={onDone}>
      Done
    </button>
  )

  return (
    <Modal title="Resolve Conflicts" onClose={onDone} footer={footer}>
      <>
        <p>
          These fields changed in both your store and in Framer since the last
          sync. Choose the value to keep for each field.
        </p>
        <p className="muted small">
          {resolvedCount} of {formatCount(conflicts.length, "conflict")}{" "}
          resolved. Unresolved fields keep the store value.
        </p>
        <ul className={styles.conflictList}>
          {conflicts.map(function renderConflict(change: PendingChange) {
            return (
              <li
                className={styles.conflictItem}
                key={`${change.itemWooId}-${change.field}`}
              >
                <h4 className={styles.productHeading}>
                  {writeBackProductName(names, change.itemWooId)}
                </h4>
                <WriteBackDiff
                  fieldLabel={WRITE_FIELD_LABELS[change.field]}
                  storeValue={change.wooValue}
                  framerValue={change.framerValue}
                  conflicting
                />
                <div className={styles.conflictActions}>
                  <button
                    type="button"
                    className={
                      change.resolution === "keep-woo"
                        ? "btn btn-primary btn-small"
                        : "btn btn-secondary btn-small"
                    }
                    onClick={function keepStoreValue() {
                      onResolve(change.itemWooId, change.field, "keep-woo")
                    }}
                  >
                    Keep store value
                  </button>
                  <button
                    type="button"
                    className={
                      change.resolution === "push"
                        ? "btn btn-primary btn-small"
                        : "btn btn-secondary btn-small"
                    }
                    onClick={function pushToStore() {
                      onResolve(change.itemWooId, change.field, "push")
                    }}
                  >
                    Push to store
                  </button>
                </div>
                <span className={styles.conflictStatus}>
                  {conflictStatusText(change.resolution)}
                </span>
              </li>
            )
          })}
        </ul>
      </>
    </Modal>
  )
}
