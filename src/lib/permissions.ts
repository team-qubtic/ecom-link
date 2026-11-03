/**
 * Permission bridge: reactive CMS edit permission for views.
 *
 * Framer decides protected calls per user ability, so a save can fail with
 * "Insufficient permissions" even though the form is valid. The official
 * guidance is to gate the UI with the SDK's useIsAllowedTo hook, which
 * re-renders whenever the host grants or revokes permission.
 *
 * The hook lives in the real `@framer/plugin` module, which stalls in a
 * standalone browser tab (see the Framer bridge), so this module loads it
 * under the same rules: real hook inside Framer or vitest, none outside.
 * Without a hook the bridge reports "allowed" and the storage guards in
 * connections.ts produce the user-facing message instead.
 */
import { runsInsideFramer, runsUnderVitest } from "./framer"

/** Loosely typed hook signature: method names in, allowed out. */
type PermissionHook = (...methods: string[]) => boolean

async function loadPermissionHook(): Promise<PermissionHook | null> {
  if (!runsInsideFramer() && !runsUnderVitest()) {
    return null
  }
  const module = await import("@framer/plugin")
  if (typeof module.useIsAllowedTo !== "function") {
    return null
  }
  // Widen the SDK's literal-union signature the same way the storage layer
  // widens isAllowedTo; the method names are checked in connections tests.
  return module.useIsAllowedTo as unknown as PermissionHook
}

const sdkUseIsAllowedTo = await loadPermissionHook()

/**
 * The protected CMS methods a connection save touches. isAllowedTo answers
 * true only when every method is allowed, so one denied method blocks.
 */
export const CMS_EDIT_METHODS = [
  "createCollection",
  "Collection.addFields",
  "Collection.addItems",
  "Collection.removeItems",
] as const

/**
 * True when the current account may edit CMS collections. Reactive: call in
 * render and the component updates when the host changes the answer.
 */
export function useCanEditCms(): boolean {
  if (typeof sdkUseIsAllowedTo !== "function") {
    return true
  }
  return sdkUseIsAllowedTo(...CMS_EDIT_METHODS)
}
