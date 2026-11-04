/**
 * SettingsView: plugin account access, about information, and support
 * links. Everything shown here reflects real state: the CMS permission
 * comes from the Framer SDK bridge and the version from package.json.
 */

import { Book, ChevronRight, CircleUserRound, Lightbulb, MessageCircle, Settings, ShieldCheck } from "lucide-react"

import pageStyles from "../assets/styles/module/Dashboard.module.css"
import settingsStyles from "../assets/styles/module/Settings.module.css"
import { MenuButton } from "../components/ui/MenuButton"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import { AccountButton } from "../components/ui/AccountButton"
import { useCanEditCms } from "../lib/permissions"
import { version } from "../../package.json"

interface SettingsViewProps {
  /** Opens the navigation drawer. */
  onOpenMenu: () => void
  /** Opens the account page (header action and Account row). */
  onOpenAccount: () => void
}

/** Render the settings page. */
export function SettingsView({ onOpenMenu, onOpenAccount }: SettingsViewProps) {
  // Reactive CMS permission: mirrors what the sync and save flows enforce.
  const canEditCms = useCanEditCms()

  return (
    <>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBrand}>
          <MenuButton onOpen={onOpenMenu} />
          <span className={pageStyles.headerLogo} aria-hidden="true">
            <Settings size={15} strokeWidth={2.2} />
          </span>
          <div className={pageStyles.headerText}>
            <h1 className={pageStyles.pageTitle}>Settings</h1>
          </div>
        </div>
        <div className={pageStyles.headerActions}>
          <HelpTooltip text="Access is granted by your Framer account. Sync preferences live on each connection." />
          <AccountButton onOpen={onOpenAccount} />
        </div>
      </header>

      <main className={pageStyles.page}>
        <div className={pageStyles.pageContent}>
        {/* Section 0: account entry */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>Account</h2>
          <button
            type="button"
            className={settingsStyles.accountRow}
            onClick={onOpenAccount}
          >
            <span className={settingsStyles.accountRowIcon} aria-hidden="true">
              <CircleUserRound size={17} strokeWidth={1.8} />
            </span>
            <span className={settingsStyles.accountRowText}>
              <span className={pageStyles.capabilityTitle}>Profile and plan</span>
              <span className={pageStyles.capabilityDescription}>
                Signed out · Free plan
              </span>
            </span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </section>

        {/* Section 1: account access */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>Access</h2>
          <div className={settingsStyles.accessCard}>
            <div className={settingsStyles.accessRow}>
              <span
                className={`${pageStyles.capabilityIcon} ${
                  canEditCms
                    ? settingsStyles.accessIconOk
                    : settingsStyles.accessIconBlocked
                }`}
                aria-hidden="true"
              >
                <ShieldCheck size={15} />
              </span>
              <div className={pageStyles.capabilityText}>
                <span className={pageStyles.capabilityTitle}>
                  CMS editing
                </span>
                <span className={pageStyles.capabilityDescription}>
                  {canEditCms
                    ? "This Framer account can create and edit CMS collections."
                    : "This Framer account cannot edit CMS collections, so syncing stays read-only."}
                </span>
              </div>
              {canEditCms ? (
                <span className="badge badge-success">
                  <span className="badge-dot" aria-hidden="true" />
                  Allowed
                </span>
              ) : (
                <span className="badge badge-error">
                  <span className="badge-dot" aria-hidden="true" />
                  Blocked
                </span>
              )}
            </div>
            <p className={settingsStyles.accessFootnote}>
              {canEditCms
                ? "Connecting a store and running syncs is available."
                : "Reopen the plugin after your account gains CMS access, or ask the workspace owner."}
            </p>
          </div>
        </section>

        {/* Section 2: about */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>About</h2>
          <div className={settingsStyles.aboutCard}>
            <div className={settingsStyles.aboutRow}>
              <span className={pageStyles.capabilityTitle}>Version</span>
              <span className="muted small">v{version}</span>
            </div>
            <div className={settingsStyles.aboutRow}>
              <span className={pageStyles.capabilityTitle}>Developer</span>
              <span className="muted small">Qubtic</span>
            </div>
          </div>
        </section>

        {/* Section 3: support */}
        <section className={pageStyles.section}>
          <h2 className={pageStyles.sectionTitle}>Support</h2>
          <div className={pageStyles.supportRow}>
            <a
              href="https://docs.example.com"
              target="_blank"
              rel="noopener noreferrer"
              className={pageStyles.supportChip}
            >
              <Book size={14} aria-hidden="true" />
              Docs
            </a>
            <a
              href="https://support.example.com"
              target="_blank"
              rel="noopener noreferrer"
              className={pageStyles.supportChip}
            >
              <MessageCircle size={14} aria-hidden="true" />
              Help
            </a>
            <a
              href="https://feedback.example.com"
              target="_blank"
              rel="noopener noreferrer"
              className={pageStyles.supportChip}
            >
              <Lightbulb size={14} aria-hidden="true" />
              Feedback
            </a>
          </div>
        </section>

        <footer className={pageStyles.pageFooter}>
          Ecom-Link · More apps from Qubtic are on the way.
        </footer>
      </div>
      </main>
    </>
  )
}
