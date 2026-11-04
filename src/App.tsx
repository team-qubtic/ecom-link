/**
 * App: plugin shell. Manages page-based navigation between dashboard and
 * connection forms (architecture: App owns page router state).
 */

import { useEffect, useRef, useState } from "react"
import { framer } from "./lib/framer"
import { runPull } from "./sync/engine"
import { LoaderCircle } from "lucide-react"
import "./App.css"
import { Dashboard } from "./views/Dashboard"
import { CatalogueView } from "./views/CatalogueView"
import { ComponentsView } from "./views/ComponentsView"
import { SettingsView } from "./views/SettingsView"
import { ConnectionsPage } from "./views/ConnectionsPage"
import { ConnectionPage } from "./views/ConnectionPage"
import { BottomNav } from "./components/ui/BottomNav"
import { NavDrawer } from "./components/ui/NavDrawer"
import type { ConnectionRecord } from "./storage/connections"
import {
  DEFAULT_APP_SETTINGS,
  getAppSyncSettings,
  parseSyncFrequencyMs,
  saveAppSyncSettings,
  type AppSyncSettings,
} from "./storage/appSettings"
import { getActiveConnection } from "./storage/connections"
import {
  deleteSyncSettings,
  getSyncSettings,
  targetCollectionExists,
} from "./storage/settings"
import { AccountPage } from "./views/AccountPage"

/** Current page view. */
type PageState =
  | { view: "dashboard" }
  | { view: "catalogue" }
  | { view: "components" }
  | { view: "account" }
  | { view: "settings" }
  | { view: "add" }
  | { view: "connections" }
  | { view: "edit"; connection: ConnectionRecord }

/**
 * Standalone browser preview: when the page is opened with a ?view= query
 * (e.g. /?view=add), the plugin runs outside the Framer canvas. Skip the
 * bridge entirely and boot straight into that page so the UI can be
 * previewed in a plain browser tab at localhost:5174.
 */
function getPreviewView(): PageState | null {
  if (typeof window === "undefined") {
    return null
  }
  const view = new URLSearchParams(window.location.search).get("view")
  if (view === "add") {
    return { view: "add" }
  }
  if (view === "catalogue") {
    return { view: "catalogue" }
  }
  if (view === "components") {
    return { view: "components" }
  }
  if (view === "settings") {
    return { view: "settings" }
  }
  if (view === "account") {
    return { view: "account" }
  }
  return null
}

const previewView = getPreviewView()

if (!previewView) {
  framer.showUI({
    position: "top right",
    width: 350,
    minHeight: 600,
    resizable: "height",
  })
}

export function App() {
  const [page, setPage] = useState<PageState>(
    previewView ?? { view: "dashboard" }
  )
  const [dataVersion, setDataVersion] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  // Global sync automation preferences (auto sync toggle + frequency).
  const [appSettings, setAppSettings] = useState<AppSyncSettings>(
    DEFAULT_APP_SETTINGS
  )
  const [appSettingsLoaded, setAppSettingsLoaded] = useState(false)
  /** "syncing" while the automatic headless run is in flight. */
  const [autoSyncStatus, setAutoSyncStatus] = useState<"idle" | "syncing">(
    "idle"
  )
  const autoSyncBusyRef = useRef(false)

  useEffect(
    function loadAppSettings() {
      void getAppSyncSettings().then(function loaded(settings) {
        setAppSettings(settings)
        setAppSettingsLoaded(true)
      })
    },
    []
  )

  useEffect(
    function persistAppSettings() {
      if (!appSettingsLoaded) return
      void saveAppSyncSettings(appSettings).catch(function ignore() {
        // Keep the in-memory values when the write fails; retried on the
        // next change.
      })
    },
    [appSettings, appSettingsLoaded]
  )

  function handleAppSettingsChange(next: AppSyncSettings) {
    setAppSettings(next)
  }

  // ── Auto-sync engine (headless) ────────────────────────────────────────
  // Lives at the app level so it runs on every page. Runs the active
  // connection's pull directly through the engine: no modals, no write-back
  // (that stays a reviewed, manual action). A small pill in the corner
  // shows that a run is in flight. A single self-rescheduling timer drives
  // the cadence, so timers can never stack up.
  useEffect(
    function runAutoSyncLoop() {
      // No runsInsideFramer guard: with no stores connected the tick is a
      // harmless no-op, and this keeps auto-sync observable in the preview.
      if (!appSettings.autoSync) {
        return
      }
      let cancelled = false
      let timer: number | undefined

      async function runTick() {
        document.documentElement.dataset.autosyncTick = new Date().toISOString();
        if (cancelled || autoSyncBusyRef.current) return
        autoSyncBusyRef.current = true
        setAutoSyncStatus("syncing")
        try {
          const active = await getActiveConnection()
          if (!active) return
          const settings = await getSyncSettings(active.id)
          // Never mapped: the merchant starts the first sync manually, so
          // the wizard can collect the collection and mapping.
          if (!settings) return
          const exists = await targetCollectionExists(
            settings.targetCollectionId
          )
          if (!exists) {
            // Silently drop stale settings; the next manual sync reopens
            // the wizard with an explanation.
            await deleteSyncSettings(active.id)
            return
          }
          await runPull(active, settings, {})
        } catch {
          // Run failures are recorded in history and shown on the
          // Connections page; the next tick retries.
        } finally {
          setAutoSyncStatus("idle")
          setAppSettings(function stamp(current) {
            return { ...current, lastAutoSyncAt: new Date().toISOString() }
          })
        }
      }

      function scheduleNext() {
        document.documentElement.dataset.autosyncSchedule = new Date().toISOString();
        if (cancelled) return
        timer = window.setTimeout(function fire() {
          void runTick().finally(scheduleNext)
        }, parseSyncFrequencyMs(appSettings.syncFrequency))
      }

      // First run right away, then every interval.
      timer = window.setTimeout(function fire() {
        void runTick().finally(scheduleNext)
      }, 2_000)

      return function cleanup() {
        cancelled = true
        if (timer !== undefined) {
          window.clearTimeout(timer)
        }
      }
    },
    // Only the toggle and frequency restart the cycle; the stamp updates
    // never do, so the cadence stays stable.
    [appSettings.autoSync, appSettings.syncFrequency]
  )
  // The account page is reachable from any page via the drawer; remember
  // where it was opened from so its back button returns there.
  const [accountReturnView, setAccountReturnView] = useState("dashboard")

  function handleOpenAccount() {
    if (page.view !== "account") {
      setAccountReturnView(page.view === "edit" ? "connections" : page.view)
    }
    setMenuOpen(false)
    setPage({ view: "account" })
  }

  function handleOpenAdd() {
    setPage({ view: "add" })
  }

  function handleOpenEdit(connection: ConnectionRecord) {
    setPage({ view: "edit", connection })
  }

  function handleBackFromAdd() {
    setPage({ view: "dashboard" })
  }

  function handleBackFromEdit() {
    setPage({ view: "connections" })
  }

  function handleSavedFromAdd() {
    setDataVersion(function bump(version) {
      return version + 1
    })
    setPage({ view: "connections" })
  }

  function handleSavedFromEdit() {
    setDataVersion(function bump(version) {
      return version + 1
    })
    setPage({ view: "connections" })
  }

  function handleNavigate(view: string) {
    if (view === "add") {
      setPage({ view: "add" })
    } else if (view === "connections") {
      setPage({ view: "connections" })
    } else if (view === "catalogue") {
      setPage({ view: "catalogue" })
    } else if (view === "components") {
      setPage({ view: "components" })
    } else if (view === "settings") {
      setPage({ view: "settings" })
    } else if (view === "account") {
      setPage({ view: "account" })
    } else {
      setPage({ view: "dashboard" })
    }
  }

  const currentView =
    page.view === "add" ? "add"
      : page.view === "connections" ? "connections"
      : page.view === "edit" ? "connections"
      : page.view === "catalogue" ? "catalogue"
      : page.view === "components" ? "components"
      : page.view === "settings" ? "settings"
      : page.view === "account" ? "account"
      : "dashboard"

  const nav = <BottomNav currentView={currentView} onNavigate={handleNavigate} />

  function handleDrawerNavigate(view: string) {
    setMenuOpen(false)
    handleNavigate(view)
  }

  let content
  if (page.view === "components") {
    content = (
      <ComponentsView
        onOpenMenu={function openMenu() {
          setMenuOpen(true)
        }}
        onOpenAccount={handleOpenAccount}
      />
    )
  } else if (page.view === "account") {
    content = (
      <AccountPage
        onBack={function handleAccountBack() {
          handleNavigate(accountReturnView)
        }}
      />
    )
  } else if (page.view === "add") {
    content = (
      <ConnectionPage
        connection={null}
        onBack={handleBackFromAdd}
        onSaved={handleSavedFromAdd}
      />
    )
  } else if (page.view === "edit") {
    content = (
      <ConnectionPage
        connection={page.connection}
        onBack={handleBackFromEdit}
        onSaved={handleSavedFromEdit}
      />
    )
  } else if (page.view === "connections") {
    content = (
      <ConnectionsPage
        dataVersion={dataVersion}
        onConnect={handleOpenAdd}
        onEdit={handleOpenEdit}
        onOpenMenu={function openMenu() {
          setMenuOpen(true)
        }}
        onOpenAccount={handleOpenAccount}
      />
    )
  } else if (page.view === "catalogue") {
    content = (
      <CatalogueView
        onConnect={handleOpenAdd}
        onViewConnections={function openConnections() {
          setPage({ view: "connections" })
        }}
        onOpenMenu={function openMenu() {
          setMenuOpen(true)
        }}
        onOpenAccount={handleOpenAccount}
      />
    )
  } else if (page.view === "settings") {
    content = (
      <SettingsView
        onOpenMenu={function openMenu() {
          setMenuOpen(true)
        }}
        onOpenAccount={handleOpenAccount}
        appSettings={appSettings}
        onAppSettingsChange={handleAppSettingsChange}
      />
    )
  } else {
    content = (
      <Dashboard
        onConnect={handleOpenAdd}
        onViewConnections={function openConnections() {
          setPage({ view: "connections" })
        }}
        onOpenMenu={function openMenu() {
          setMenuOpen(true)
        }}
        onOpenAccount={handleOpenAccount}
      />
    )
  }

  return (
    <div className="app-shell">
      <main className="app-shell-content">{content}</main>
      {nav}
      {autoSyncStatus === "syncing" ? (
        <div className="auto-sync-pill" role="status">
          <LoaderCircle size={13} className="auto-sync-spin" aria-hidden="true" />
          Syncing…
        </div>
      ) : null}

      <NavDrawer
        open={menuOpen}
        onClose={function closeMenu() {
          setMenuOpen(false)
        }}
        currentView={currentView}
        onNavigate={handleDrawerNavigate}
        onOpenAccount={handleOpenAccount}
      />
    </div>
  )
}
