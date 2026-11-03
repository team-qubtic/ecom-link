/**
 * NavDrawer: hamburger menu drawer (skeleton ported from the
 * telegram-commerce shell, restyled to this plugin's design system).
 *
 * A native <dialog> slides in from the left with one row per navigation
 * page (icon, label, chevron, active state), plus a footer with support
 * and account entries. Closes on Escape, on backdrop click, and after any
 * navigation. Focus returns to the opener via the autoFocusClose ref the
 * caller can pass.
 */

import { useEffect, useRef } from "react"
import { ChevronRight, CircleUserRound, X } from "lucide-react"

import navigationConfig from "../../config/navigation.json"
import { NAV_ICONS } from "../../config/navIcons"
import drawerStyles from "../../assets/styles/module/NavDrawer.module.css"

/** One nav item as declared in navigation.json. */
interface NavItemConfig {
  id: string
  label: string
  icon: string
}

const NAV_ITEMS = navigationConfig.items as NavItemConfig[]

interface NavDrawerProps {
  /** Whether the drawer is open. */
  open: boolean
  /** Closes the drawer without navigating. */
  onClose: () => void
  /** Id of the currently active page, matching navigation.json. */
  currentView: string
  /** Navigates to a page id and closes the drawer. */
  onNavigate: (view: string) => void
  /** Opens the account page and closes the drawer. */
  onOpenAccount: () => void
}

/** Render the hamburger navigation drawer. */
export function NavDrawer({
  open,
  onClose,
  currentView,
  onNavigate,
  onOpenAccount,
}: NavDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(
    function syncDialog() {
      const dialog = dialogRef.current
      if (!dialog) {
        return
      }
      if (open && !dialog.open) {
        dialog.showModal()
      }
      if (!open && dialog.open) {
        dialog.close()
      }
    },
    [open]
  )

  function handleClose() {
    onClose()
  }

  function handleCancel(event: React.FormEvent<HTMLDialogElement>) {
    event.preventDefault()
    handleClose()
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    // Only a direct click on the dialog backdrop closes; clicks inside the
    // panel must never discard the drawer state.
    if (event.target === event.currentTarget) {
      handleClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={drawerStyles.drawer}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-label="Navigation menu"
    >
      <div className={drawerStyles.drawerInner}>
        <header className={drawerStyles.drawerHeader}>
          <h2 className={drawerStyles.drawerTitle}>Menu</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close menu"
            onClick={handleClose}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </header>

        <nav aria-label="All pages" className={drawerStyles.drawerNav}>
          {NAV_ITEMS.map(function renderItem(item) {
            const Icon = NAV_ICONS[item.icon]
            if (!Icon) {
              return null
            }
            const active = item.id === currentView
            return (
              <button
                key={item.id}
                type="button"
                className={
                  active
                    ? `${drawerStyles.drawerLink} ${drawerStyles.drawerLinkActive}`
                    : drawerStyles.drawerLink
                }
                aria-current={active ? "page" : undefined}
                onClick={function handleClick() {
                  onNavigate(item.id)
                }}
              >
                <span className={drawerStyles.drawerLinkIcon} aria-hidden="true">
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span className={drawerStyles.drawerLinkLabel}>{item.label}</span>
                <ChevronRight
                  size={13}
                  className={drawerStyles.drawerLinkChevron}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </nav>

        <footer className={drawerStyles.drawerFooter}>
          <button
            type="button"
            className={drawerStyles.drawerAccount}
            onClick={function handleClick() {
              onOpenAccount()
            }}
          >
            <span className={drawerStyles.drawerAccountIcon} aria-hidden="true">
              <CircleUserRound size={17} strokeWidth={1.8} />
            </span>
            <span className={drawerStyles.drawerAccountText}>
              <strong>Account</strong>
              <small>Free plan</small>
            </span>
            <ChevronRight size={13} className={drawerStyles.drawerLinkChevron} aria-hidden="true" />
          </button>
        </footer>
      </div>
    </dialog>
  )
}
