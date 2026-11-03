/**
 * WriteBackReviewModal: the write-back confirm gate (spec 004).
 *
 * Lists every change waiting to reach the store, grouped per product, and
 * every conflict where both sides changed since the last sync. Nothing is
 * written until the merchant confirms. Cancel closes the review without any
 * write request.
 */
import { useState } from "react"
import type {
  ChangeResolution,
  PendingChange,
  ProductWriteGroup,
} from "../sync/conflict"
import { WRITE_FIELD_LABELS, groupPushesByProduct } from "../sync/conflict"
import type { NormalizedProductField } from "../providers"
import { Modal } from "../components/ui/Modal"
import { WriteBackDiff } from "../components/sync/WriteBackDiff"
import { ConflictResolutionModal } from "./ConflictResolutionModal"
import styles from "../assets/styles/module/WriteBackReviewModal.module.css"

/** One change plus the flag marking it as a two-sided conflict. */
interface ReviewRow {
  change: PendingChange
  isConflict: boolean
}

interface WriteBackReviewModalProps {
  /** Every pending change collected after the pull. */
  changes: PendingChange[]
  /** Product display names keyed by store product id. */
  names: Record<string, string>
  /** Called with the reviewed changes when the merchant confirms. */
  onConfirm: (changes: PendingChange[]) => void
  /** Called when the merchant abandons the write-back. */
  onCancel: () => void
}

/** Product name for the review tables, with a safe fallback. */
export function writeBackProductName(
  names: Record<string, string>,
  itemWooId: string
): string {
  return names[itemWooId] ?? `Product ${itemWooId}`
}

/** One line status for a conflict, shown under its diff row. */
export function conflictStatusText(resolution: ChangeResolution): string {
  if (resolution === "pending") {
    return "Unresolved. The store value is kept."
  }
  if (resolution === "keep-woo") {
    return "Keeps the store value."
  }
  return "Sends the Framer value."
}

/** Pluralize a count the UX way: "1 change", "2 changes". */
function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** Pull the change back out of a review row for engine calls. */
function changeOf(row: ReviewRow): PendingChange {
  return row.change
}

/** Render the confirm gate for one write-back run. */
export function WriteBackReviewModal(props: WriteBackReviewModalProps) {
  const { changes, names, onConfirm, onCancel } = props
  const [rows, setRows] = useState<ReviewRow[]>(
    changes.map(function toRow(change: PendingChange): ReviewRow {
      return { change, isConflict: change.resolution === "pending" }
    })
  )
  const [resolving, setResolving] = useState(false)

  const conflictRows = rows.filter(function isConflictRow(
    row: ReviewRow
  ): boolean {
    return row.isConflict
  })
  const pushRows = rows.filter(function isPushRow(row: ReviewRow): boolean {
    return row.change.resolution === "push"
  })
  const pushGroups = groupPushesByProduct(pushRows.map(changeOf))

  function handleResolve(
    itemWooId: string,
    field: NormalizedProductField,
    resolution: "push" | "keep-woo"
  ): void {
    setRows(function applyResolution(current: ReviewRow[]): ReviewRow[] {
      return current.map(function updateRow(row: ReviewRow): ReviewRow {
        if (row.change.itemWooId === itemWooId && row.change.field === field) {
          return { ...row, change: { ...row.change, resolution } }
        }
        return row
      })
    })
  }

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={function confirmWriteBack() {
          onConfirm(rows.map(changeOf))
        }}
      >
        {pushRows.length > 0
          ? `Send ${formatCount(pushRows.length, "change")} to the store`
          : "Done"}
      </button>
    </>
  )

  return (
    <Modal
      title="Review Changes"
      onClose={function handleReviewClose() {
        if (resolving) {
          setResolving(false)
          return
        }
        onCancel()
      }}
      footer={footer}
    >
      <>
        <p>Review the changes that will be sent to your store.</p>
        <p className="muted small">
          {formatCount(pushRows.length, "change")} ready to send.
          {conflictRows.length > 0
            ? ` ${formatCount(conflictRows.length, "conflict")} to resolve.`
            : ""}
        </p>
        {pushGroups.length > 0 ? (
          <section className={styles.reviewSection}>
            <h3 className={styles.reviewTitle}>Changes to Send</h3>
            <div className={styles.diffHead} aria-hidden="true">
              <span>Field</span>
              <span>In your store</span>
              <span>In Framer</span>
            </div>
            {pushGroups.map(function renderGroup(group: ProductWriteGroup) {
              return (
                <div className={styles.productGroup} key={group.itemWooId}>
                  <h4 className={styles.productHeading}>
                    {writeBackProductName(names, group.itemWooId)}
                  </h4>
                  {group.changes.map(function renderChange(
                    change: PendingChange
                  ) {
                    return (
                      <WriteBackDiff
                        key={change.field}
                        fieldLabel={WRITE_FIELD_LABELS[change.field]}
                        storeValue={change.wooValue}
                        framerValue={change.framerValue}
                      />
                    )
                  })}
                </div>
              )
            })}
          </section>
        ) : null}
        {conflictRows.length > 0 ? (
          <section className={styles.reviewSection}>
            <h3 className={styles.reviewTitle}>Conflicts</h3>
            <div className={styles.diffHead} aria-hidden="true">
              <span>Field</span>
              <span>In your store</span>
              <span>In Framer</span>
            </div>
            <ul className={styles.conflictList}>
              {conflictRows.map(function renderConflict(row: ReviewRow) {
                const change = row.change
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
                    <span className={styles.conflictStatus}>
                      {conflictStatusText(change.resolution)}
                    </span>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={function openResolution() {
                setResolving(true)
              }}
            >
              Resolve conflicts
            </button>
          </section>
        ) : null}
        {resolving ? (
          <ConflictResolutionModal
            conflicts={conflictRows.map(changeOf)}
            names={names}
            onResolve={handleResolve}
            onDone={function closeResolution() {
              setResolving(false)
            }}
          />
        ) : null}
      </>
    </Modal>
  )
}
