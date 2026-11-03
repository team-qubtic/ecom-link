/**
 * AccountButton: header pill opening the account page (skeleton ported
 * from the telegram-commerce header action, restyled to this plugin's
 * design system). Shows the current plan as a badge inside the pill;
 * until the auth client lands, that is always Free.
 */

import { CircleUserRound } from "lucide-react"

import styles from "../../assets/styles/module/AccountButton.module.css"

interface AccountButtonProps {
  /** Opens the account page. */
  onOpen: () => void
}

/** Render the header account button with plan badge. */
export function AccountButton({ onOpen }: AccountButtonProps) {
  return (
    <button
      type="button"
      className={styles.accountButton}
      onClick={onOpen}
      aria-label="Open account"
      title="Open account"
    >
      <CircleUserRound size={15} strokeWidth={1.9} aria-hidden="true" />
      <span className={styles.accountButtonBadge}>Free</span>
    </button>
  )
}
