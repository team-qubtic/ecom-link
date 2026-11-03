/**
 * Framer bridge: the single import point for the Framer plugin SDK.
 *
 * Importing `@framer/plugin` directly stalls forever outside the Framer
 * canvas: the SDK waits for an editor handshake that never arrives in a
 * plain browser tab, so every module in the import chain hangs and the app
 * never renders (empty root, no error). The bridge only loads the real SDK
 * when the page runs embedded in the Framer editor (`window.self !==
 * window.top`) and hands back a warning stub in a standalone browser, which
 * keeps the localhost:5174 preview working.
 *
 * Under vitest the bridge resolves the SDK through the normal module
 * registry, so the per-file `vi.mock("@framer/plugin", ...)` declarations
 * keep feeding the CMS doubles to the storage layer.
 */
import type { framer as FramerHost } from "@framer/plugin"

/** True when the page is embedded in the Framer editor canvas. */
export function runsInsideFramer(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top
  } catch {
    // Reading window.top across origins can throw in odd embeds; assume the
    // SDK is safe to load there rather than degrading to the stub.
    return true
  }
}

/** True when the module graph is executing under vitest. */
export function runsUnderVitest(): boolean {
  const env = import.meta.env as ImportMetaEnv & { VITEST?: boolean }
  return Boolean(env && env.VITEST)
}

/**
 * Any SDK property reached outside the canvas resolves to a function that
 * warns instead of crashing the preview UI.
 */
function createOutsideStub(): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, property) {
      // Never advertise thenable behavior; the stub is not a promise.
      if (property === "then") {
        return undefined
      }
      return function stubMethod() {
        console.warn(
          `framer.${String(property)} is not available outside the Framer canvas.`
        )
      }
    },
  })
}

async function loadFramer(): Promise<typeof FramerHost> {
  if (runsInsideFramer() || runsUnderVitest()) {
    const module = await import("@framer/plugin")
    return module.framer
  }
  return createOutsideStub() as typeof FramerHost
}

export const framer: typeof FramerHost = await loadFramer()
