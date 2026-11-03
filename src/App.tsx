/**
 * App: plugin shell. Manages page-based navigation between dashboard and
 * connection forms (architecture: App owns page router state).
 */

import { useState } from "react"
import { framer } from "./lib/framer"
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
