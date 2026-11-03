/**
 * MenuButton: the hamburger trigger rendered in every page header. Opens
 * the NavDrawer owned by the app shell.
 */

import { Menu } from "lucide-react"

import styles from "../../assets/styles/module/NavDrawer.module.css"

interface MenuButtonProps {
  /** Opens the navigation drawer. */
  onOpen: () => void
}

/** Render the hamburger button. */
export function MenuButton({ onOpen }: MenuButtonProps) {
  return (
    <button
      type="button"
      className={styles.menuButton}
      aria-label="Open navigation menu"
      onClick={onOpen}
    >
      <Menu size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
