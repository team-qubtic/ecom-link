import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App.tsx"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

/**
 * The Framer dev server injects a full screen notice for tabs that are not
 * embedded in the editor canvas. Any standalone browser tab is exactly that
 * case, so the notice goes back into hiding right after the injected script
 * reveals it on DOMContentLoaded. Inside the Framer iframe the injector
 * never shows the notice, so nothing changes there.
 */
function runsStandalone(): boolean {
  try {
    return typeof window !== "undefined" && window.self === window.top
  } catch {
    return false
  }
}

function hideStandaloneNotice(): void {
  if (!runsStandalone()) {
    return
  }
  const notice = document.getElementById("framer-environment-error")
  if (notice) {
    notice.style.display = "none"
  }
}

hideStandaloneNotice()
document.addEventListener("DOMContentLoaded", hideStandaloneNotice)
