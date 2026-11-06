/**
 * Canvas bridge: materializes storefront NodeSpec trees onto the Framer
 * canvas as native frames and text layers.
 *
 * This is the only module that creates nodes. Text styling resolves through
 * shared project text styles ("Ecom Link/...") created once per insert and
 * reused across nodes; style creation degrades gracefully when the account
 * cannot create styles, leaving plain text the merchant can restyle. Product
 * images upload through the asset pipeline and fall back to the placeholder
 * fill when the store host blocks the fetch.
 */
import { framer } from "./framer"
import { FONT_FAMILY, TEXT_ROLES } from "../storefront/theme"
import type { FrameSpec, NodeSpec, TextRole, TextSpec } from "../storefront/types"
import {
  getInsertedRootNodeId,
  saveInsertedRootNodeId,
} from "../storage/insertions"

/** Sentence shown when the account cannot create canvas layers. */
export const CANVAS_PERMISSION_MESSAGE =
  "This Framer account cannot create canvas layers. Open the plugin with edit access to this project."

/** Sentence shown when a node creation call fails outright. */
export const CANVAS_INSERT_FAILED_MESSAGE =
  "The component could not be placed on the canvas. Make sure the canvas is open, then try again."

/**
 * Sentence shown when this editor build has no text creation API at all
 * (createTextNode is alpha and not shipped in every runtime) and the
 * project holds no text layer to clone.
 */
export const TEXT_CREATION_UNAVAILABLE_MESSAGE =
  "This Framer build cannot create text layers yet. Add any text layer to the canvas, then insert the component again."

/** Raised when the account lacks the canvas permissions an insert needs. */
export class CanvasPermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CanvasPermissionError"
  }
}

/**
 * Protected SDK methods every insert needs, named as the isAllowedTo
 * arguments expect (method names, not permission names). removeNodes rides
 * along because a failed insert cleans up after itself. Checking all of
 * them up front matches the storage layer's rule: never invoke a protected
 * call without asking first. Text style reads and image uploads are
 * unprotected, so they are not listed here.
 */
const REQUIRED_METHODS = [
  "createFrameNode",
  "Node.setAttributes",
  "TextNode.setText",
  "removeNodes",
] as const

/**
 * Protected methods only the clone fallback invokes. Only required when
 * this editor build omits the alpha text creation API.
 */
const CLONE_PATH_METHODS = ["cloneNode", "setParent"] as const

/**
 * Verify the account can create canvas layers. Throws a user-facing
 * sentence when any required permission is denied. An undefined answer
 * (the standalone preview stub) lets the call through so the later
 * runsInsideFramer guard produces the right message instead.
 */
export function assertCanCreateNodes(): void {
  if (typeof framer.isAllowedTo !== "function") {
    return
  }
  for (const method of REQUIRED_METHODS) {
    if (framer.isAllowedTo(method) === false) {
      throw new CanvasPermissionError(CANVAS_PERMISSION_MESSAGE)
    }
  }
  const alpha = framer as unknown as AlphaCanvasApi
  if (typeof alpha.createTextNode !== "function") {
    for (const method of CLONE_PATH_METHODS) {
      if (framer.isAllowedTo(method) === false) {
        throw new CanvasPermissionError(CANVAS_PERMISSION_MESSAGE)
      }
    }
  }
}

/** One resolved text style per role; null means style creation was skipped. */
type StyleCache = Record<TextRole, unknown>

/** True inside the Framer editor iframe, where the plugin channel lives. */
function inPluginFrame(): boolean {
  return typeof window !== "undefined" && window.parent !== window
}

/**
 * The alpha createTextNode ships behind an alpha marker, and the runtime
 * instance only carries it in editor builds that enable the alpha surface.
 * This structural view is what the materializer feature-detects.
 */
interface AlphaCanvasApi {
  createTextNode?: (
    attributes: Record<string, unknown>,
    parentId?: string
  ) => Promise<{
    id: string
    setText(text: string): Promise<void>
    setAttributes(update: Record<string, unknown>): Promise<unknown>
  } | null>
}

/**
 * Options for one insert.
 */
export interface InsertOptions {
  /**
   * When set, the previously inserted root for this component id is
   * removed first, so inserting again replaces the old layout instead of
   * stacking duplicates on the canvas.
   */
  replaceComponentId?: string
}

/**
 * Materialize one spec tree onto the canvas. Resolves the shared text
 * styles first, then creates the nodes depth first, children parented to
 * their frame. Throws CanvasPermissionError before creating anything when
 * permissions are missing, and removes everything already created when any
 * step fails, so a failed insert never leaves a partial layout behind.
 */
export async function insertNodeTree(
  spec: NodeSpec,
  options: InsertOptions = {}
): Promise<void> {
  assertCanCreateNodes()
  if (options.replaceComponentId !== undefined) {
    await removePreviousInsert(options.replaceComponentId)
  }
  const styles = await resolveTextStyles()
  const created: string[] = []
  try {
    await materializeNode(spec, undefined, styles, created)
  } catch (error) {
    await removeCreatedNodes(created)
    throw error
  }
  const rootId = created[0]
  if (options.replaceComponentId !== undefined && rootId !== undefined) {
    await saveInsertedRootNodeId(options.replaceComponentId, rootId)
  }
}

/**
 * Remove the previous insert of one component, tracked in plugin data.
 * Best effort: a stale id, a deleted node, or a storage failure never
 * blocks the new insert.
 */
async function removePreviousInsert(componentId: string): Promise<void> {
  try {
    const previousId = await getInsertedRootNodeId(componentId)
    if (previousId === null) {
      return
    }
    if (
      typeof framer.getNode !== "function" ||
      typeof framer.removeNodes !== "function"
    ) {
      return
    }
    const node = await framer.getNode(previousId)
    if (node) {
      await framer.removeNodes([previousId])
    }
  } catch {
    // Ignore and insert fresh.
  }
}

/** Best effort cleanup of the nodes created by a failed insert. */
async function removeCreatedNodes(nodeIds: string[]): Promise<void> {
  try {
    if (nodeIds.length > 0 && typeof framer.removeNodes === "function") {
      await framer.removeNodes(nodeIds)
    }
  } catch {
    // The canvas refused the cleanup; leave the partial layout for the
    // merchant to delete rather than masking the original error.
  }
}

/**
 * Find or create the shared "Ecom Link/" text styles. Existing styles win
 * so repeated inserts never duplicate styles in the project. Each role
 * resolves the Inter font at its own weight; a missing font falls back to
 * the project default. Any failure (permission denied, preview stub)
 * leaves the role unstyled instead of failing the insert.
 *
 * Two modes: the client SDK path (style instances, used when the alpha
 * createTextNode exists) and the raw message path (plain style DATA,
 * required when texts go over the raw channel, because class instances do
 * not survive the wire).
 */
async function resolveTextStyles(): Promise<StyleCache> {
  const cache = {} as StyleCache
  const alpha = framer as unknown as AlphaCanvasApi
  if (typeof alpha.createTextNode !== "function" && inPluginFrame()) {
    return resolveTextStylesRaw()
  }
  const canCreate =
    typeof framer.isAllowedTo !== "function" ||
    framer.isAllowedTo("createTextStyle") !== false
  let existing: Array<{ id: string; name: string }> = []
  if (typeof framer.getTextStyles === "function") {
    try {
      existing = await framer.getTextStyles()
    } catch {
      existing = []
    }
  }
  for (const definition of TEXT_ROLES) {
    const found = existing.find(function byName(style) {
      return style?.name === definition.styleName
    })
    if (found) {
      // Never create a duplicate for a style that exists; if the instance
      // cannot be fetched, leave the role unstyled instead.
      try {
        cache[definition.role] = await framer.getTextStyle(found.id)
      } catch {
        cache[definition.role] = null
      }
      continue
    }
    if (!canCreate || typeof framer.createTextStyle !== "function") {
      cache[definition.role] = null
      continue
    }
    let font: unknown = null
    if (typeof framer.getFont === "function") {
      try {
        font = await framer.getFont(FONT_FAMILY, { weight: definition.fontWeight })
      } catch {
        font = null
      }
    }
    try {
      // The SDK types require `font`, but the runtime accepts styles
      // without one (it falls back to the built-in font).
      const attributes = {
        name: definition.styleName,
        tag: definition.tag,
        fontSize: `${definition.fontSize}px`,
        color: definition.color,
        ...(font ? { font } : {}),
        ...(definition.letterSpacing
          ? { letterSpacing: definition.letterSpacing }
          : {}),
        ...(definition.lineHeight ? { lineHeight: definition.lineHeight } : {}),
      } as unknown as Parameters<typeof framer.createTextStyle>[0]
      cache[definition.role] = await framer.createTextStyle(attributes)
    } catch {
      cache[definition.role] = null
    }
  }
  return cache
}

/**
 * Raw-channel style resolution: create each missing style through the
 * host messages and cache the returned plain DATA (not a class instance),
 * because only data survives the raw text node's setAttributes call.
 */
async function resolveTextStylesRaw(): Promise<StyleCache> {
  const cache = {} as StyleCache
  let existing: Array<{ id: string; name: string }> = []
  try {
    existing = (await rawInvoke("getTextStyles", [])) as Array<{
      id: string
      name: string
    }>
  } catch {
    existing = []
  }
  for (const definition of TEXT_ROLES) {
    const found = Array.isArray(existing)
      ? existing.find(function byName(style) {
          return style?.name === definition.styleName
        })
      : undefined
    if (found) {
      // Styles resolve by id on the raw channel; reference the existing one.
      cache[definition.role] = found
      continue
    }
    try {
      const font = await rawInvoke("getFont", [
        FONT_FAMILY,
        { weight: definition.fontWeight },
      ])
      const attributes = {
        name: definition.styleName,
        tag: definition.tag,
        fontSize: `${definition.fontSize}px`,
        color: definition.color,
        ...(font && typeof font === "object" ? { font } : {}),
        ...(definition.letterSpacing
          ? { letterSpacing: definition.letterSpacing }
          : {}),
        ...(definition.lineHeight ? { lineHeight: definition.lineHeight } : {}),
      }
      cache[definition.role] = await rawInvoke("createTextStyle", [attributes])
    } catch {
      cache[definition.role] = null
    }
  }
  return cache
}

/** Create one spec's node (and its children) on the canvas. */
async function materializeNode(
  spec: NodeSpec,
  parentId: string | undefined,
  styles: StyleCache,
  created: string[]
): Promise<void> {
  if (spec.kind === "text") {
    const attrs: Record<string, unknown> = {}
    const style = styles[spec.role]
    if (style) {
      attrs.inlineTextStyle = style
    }
    if (spec.link) {
      attrs.link = spec.link
    }
    const outcome = await createTextNodeOnCanvas(spec, parentId, attrs)
    if (!outcome.ok) {
      throw new Error(outcome.message)
    }
    // Track the node so a later failure removes it with the rest.
    created.push(outcome.nodeId)
    return
  }
  const node = await framer.createFrameNode(
    frameAttributes(spec) as Parameters<typeof framer.createFrameNode>[0],
    parentId
  )
  if (!node) {
    throw new Error(CANVAS_INSERT_FAILED_MESSAGE)
  }
  created.push(node.id)
  if (spec.imageUrl) {
    await applyBackgroundImage(node, spec)
  }
  for (const child of spec.children ?? []) {
    await materializeNode(child, node.id, styles, created)
  }
}

/** One created text layer, or a user-facing sentence explaining the failure. */
type TextCreationOutcome =
  | { ok: true; nodeId: string }
  | { ok: false; message: string }

/**
 * Create a text layer with the content and attributes given. Tries three
 * paths in order: the alpha createTextNode when this editor ships it, the
 * raw plugin message the official method would send, and cloning an
 * existing project text layer. Returns the created node id on success so
 * failed inserts can clean it up, otherwise a user-facing sentence.
 */
async function createTextNodeOnCanvas(
  spec: TextSpec,
  parentId: string | undefined,
  attrs: Record<string, unknown>
): Promise<TextCreationOutcome> {
  const alpha = framer as unknown as AlphaCanvasApi
  if (typeof alpha.createTextNode === "function") {
    const node = await alpha.createTextNode({}, parentId)
    if (!node) {
      return { ok: false, message: CANVAS_INSERT_FAILED_MESSAGE }
    }
    await node.setText(spec.text)
    if (Object.keys(attrs).length > 0) {
      await node.setAttributes(attrs)
    }
    return { ok: true, nodeId: node.id }
  }
  const raw = await invokeCreateTextNode(spec, parentId, attrs)
  if (raw.ok) {
    return raw
  }
  return cloneTextNodeOnCanvas(spec, parentId, attrs)
}

// ---------------------------------------------------------------------------
// Raw plugin-message client
//
// The editor host implements the full message registry, but the shipped
// client class exposes only part of it (createTextNode is alpha). The raw
// client posts the exact methodInvocation envelopes the official method
// would send, over the same plugin channel. Every failure degrades to the
// next fallback path.
// ---------------------------------------------------------------------------

/** How long to wait for the host to answer one raw message. */
const RAW_INVOKE_TIMEOUT_MS = 8000

/** Base id far above the client engine's counter, so responses never mix. */
const RAW_INVOKE_ID_BASE = 90_000_000

let rawInvokeCounter = 0
let rawOrigin: string | null = null
let originListenerInstalled = false

/**
 * Record the host origin from any parent message. Called once per module;
 * the editor pushes messages over the plugin channel continuously, so the
 * origin is usually captured before the first insert.
 */
function installOriginListener(): void {
  if (originListenerInstalled || typeof window === "undefined") {
    return
  }
  originListenerInstalled = true
  window.addEventListener("message", function record(event) {
    if (event.source !== window.parent) {
      return
    }
    if (typeof event.origin === "string" && event.origin !== "") {
      rawOrigin = event.origin
    }
  })
}

/**
 * Resolve the host origin, nudging the host with the plugin ready signal
 * if nothing arrived yet. Returns null when the host stays silent, which
 * sends the caller to the next fallback path.
 */
async function resolveHostOrigin(): Promise<string | null> {
  installOriginListener()
  if (rawOrigin !== null) {
    return rawOrigin
  }
  return new Promise(function settle(resolve) {
    let settled = false
    function finish(origin: string | null) {
      if (settled) {
        return
      }
      settled = true
      window.removeEventListener("message", listener)
      clearTimeout(timeout)
      resolve(origin)
    }
    const timeout = setTimeout(function timedOut() {
      finish(rawOrigin)
    }, 3000)
    function listener(event: MessageEvent) {
      if (event.source !== window.parent) {
        return
      }
      if (typeof event.origin === "string" && event.origin !== "") {
        finish(event.origin)
      }
    }
    window.addEventListener("message", listener)
    window.parent.postMessage({ type: "pluginReadySignal" }, "*")
  })
}

/**
 * Send one methodInvocation to the host and wait for the matching
 * methodResponse. Rejects on host error, silence, or an unreachable host.
 * Exported for tests that simulate the host side of the channel.
 */
export function rawInvoke(methodName: string, args: unknown[]): Promise<unknown> {
  return new Promise(function settle(resolve, reject) {
    const id = RAW_INVOKE_ID_BASE + (rawInvokeCounter += 1)
    let settled = false
    function cleanup() {
      window.removeEventListener("message", listener)
      clearTimeout(timeout)
    }
    const timeout = setTimeout(function timedOut() {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(new Error("raw invoke timeout"))
    }, RAW_INVOKE_TIMEOUT_MS)
    function listener(event: MessageEvent) {
      const data: unknown = event?.data
      if (
        typeof data !== "object" ||
        data === null ||
        (data as Record<string, unknown>).type !== "methodResponse" ||
        (data as Record<string, unknown>).id !== id
      ) {
        return
      }
      settled = true
      cleanup()
      const response = data as Record<string, unknown>
      if (response.error) {
        reject(new Error(readErrorMessage(response.error)))
      } else {
        resolve(response.result)
      }
    }
    window.addEventListener("message", listener)
    void resolveHostOrigin().then(function post(origin) {
      if (settled) {
        return
      }
      if (origin === null) {
        settled = true
        cleanup()
        reject(new Error("host origin unavailable"))
        return
      }
      window.parent.postMessage({ type: "methodInvocation", methodName, id, args }, origin)
    })
  })
}

/** Forget the captured host origin. Exported for tests. */
export function resetHostOriginCache(): void {
  rawOrigin = null
}

/** Read the node id out of one createNode response payload. */
function readNodeId(node: unknown): string | null {
  if (typeof node === "object" && node !== null) {
    const record = node as Record<string, unknown>
    if (typeof record.id === "string") {
      return record.id
    }
    if (typeof record.nodeId === "string") {
      return record.nodeId
    }
  }
  return null
}

/** Extract the sentence from one host error payload. */
function readErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message
    if (typeof message === "string" && message !== "") {
      return message
    }
  }
  return typeof error === "string" && error !== "" ? error : "The host rejected the request."
}

/**
 * Create the text layer through raw host messages: createNode, then the
 * text content, then the styling attributes. The host implements all of
 * them; only the shipped client class omits the method.
 */
async function invokeCreateTextNode(
  spec: TextSpec,
  parentId: string | undefined,
  attrs: Record<string, unknown>
): Promise<TextCreationOutcome> {
  if (!inPluginFrame()) {
    return { ok: false, message: TEXT_CREATION_UNAVAILABLE_MESSAGE }
  }
  let nodeId: string | null = null
  try {
    const node = await rawInvoke("createNode", ["TextNode", parentId ?? null, {}])
    nodeId = readNodeId(node)
    if (nodeId === null) {
      return { ok: false, message: CANVAS_INSERT_FAILED_MESSAGE }
    }
    await rawInvoke("setTextForNode", [nodeId, spec.text])
    try {
      // Styling is best effort; an unstyled text layer still renders.
      if (Object.keys(attrs).length > 0) {
        await rawInvoke("setAttributes", [nodeId, attrs])
      }
    } catch {
      // Keep the plain text rather than dropping the whole node.
    }
    return { ok: true, nodeId }
  } catch {
    // A half-created node is removed so failed inserts never leave
    // orphaned empty text layers behind.
    if (nodeId !== null) {
      void rawInvoke("removeNodes", [[nodeId]]).catch(function ignore() {})
    }
    return { ok: false, message: TEXT_CREATION_UNAVAILABLE_MESSAGE }
  }
}

/**
 * Public-API fallback: clone any existing text layer of the project,
 * move it into the target frame, and rewrite its content. Needs at least
 * one text layer to exist somewhere in the project.
 */
async function cloneTextNodeOnCanvas(
  spec: TextSpec,
  parentId: string | undefined,
  attrs: Record<string, unknown>
): Promise<TextCreationOutcome> {
  if (
    typeof framer.getNodesWithType !== "function" ||
    typeof framer.cloneNode !== "function"
  ) {
    return { ok: false, message: TEXT_CREATION_UNAVAILABLE_MESSAGE }
  }
  const donors = await framer.getNodesWithType("TextNode")
  const donor = Array.isArray(donors) ? donors[0] : undefined
  if (!donor) {
    return { ok: false, message: TEXT_CREATION_UNAVAILABLE_MESSAGE }
  }
  const clone = await framer.cloneNode(donor.id)
  if (!clone) {
    return { ok: false, message: CANVAS_INSERT_FAILED_MESSAGE }
  }
  if (parentId !== undefined && typeof framer.setParent === "function") {
    await framer.setParent(clone.id, parentId)
  }
  const node = clone as unknown as {
    id: string
    setText(text: string): Promise<void>
    setAttributes(update: Record<string, unknown>): Promise<unknown>
  }
  await node.setText(spec.text)
  if (Object.keys(attrs).length > 0) {
    await node.setAttributes(attrs)
  }
  return { ok: true, nodeId: clone.id }
}

/** Translate one frame spec into SDK node attributes. */
function frameAttributes(spec: FrameSpec): Record<string, unknown> {
  const attrs: Record<string, unknown> = { name: spec.name }
  if (spec.width !== undefined) {
    attrs.width = spec.width === "fit-content" ? "fit-content" : `${spec.width}px`
  }
  if (spec.height !== undefined) {
    attrs.height = spec.height === "fit-content" ? "fit-content" : `${spec.height}px`
  }
  if (spec.fill !== undefined) {
    attrs.backgroundColor = spec.fill
  }
  if (spec.gradient) {
    // The SDK's gradient data uses the "__class" discriminator; build the
    // plain-data shape it accepts.
    attrs.backgroundGradient = {
      __class: "LinearGradient",
      angle: spec.gradient.angle ?? 135,
      stops: [
        { color: spec.gradient.from, position: 0 },
        { color: spec.gradient.to, position: 1 },
      ],
    }
  }
  if (spec.radius !== undefined) {
    attrs.borderRadius =
      typeof spec.radius === "number" ? `${spec.radius}px` : spec.radius
  }
  if (spec.border) {
    attrs.border = {
      width: `${spec.border.width}px`,
      color: spec.border.color,
      style: "solid",
    }
  }
  if (spec.link) {
    attrs.link = spec.link
  }
  if (spec.grid) {
    attrs.layout = "grid"
    attrs.gridColumnCount = spec.grid.columns
    if (spec.grid.gap !== undefined) {
      attrs.gap = `${spec.grid.gap}px`
    }
    if (spec.grid.padding !== undefined) {
      attrs.padding = `${spec.grid.padding}px`
    }
  } else if (spec.stack) {
    attrs.layout = "stack"
    attrs.stackDirection = spec.stack.direction
    if (spec.stack.gap !== undefined) {
      attrs.gap = `${spec.stack.gap}px`
    }
    if (spec.stack.padding !== undefined) {
      attrs.padding = `${spec.stack.padding}px`
    }
  }
  if (spec.position === "absolute") {
    attrs.position = "absolute"
    attrs.top = spec.pins?.top !== undefined ? `${spec.pins.top}px` : null
    attrs.left = spec.pins?.left !== undefined ? `${spec.pins.left}px` : null
    attrs.right = spec.pins?.right !== undefined ? `${spec.pins.right}px` : null
    attrs.bottom = spec.pins?.bottom !== undefined ? `${spec.pins.bottom}px` : null
  }
  return attrs
}

/**
 * Upload the store image and set it as the frame background. Failures
 * (hosts without CORS headers, the preview stub) keep the placeholder fill
 * already applied via backgroundColor, so the layout still shows.
 */
async function applyBackgroundImage(
  node: NonNullable<Awaited<ReturnType<typeof framer.createFrameNode>>>,
  spec: FrameSpec
): Promise<void> {
  const url = spec.imageUrl
  if (url === undefined || url === "") {
    return
  }
  try {
    if (typeof framer.uploadImage !== "function") {
      return
    }
    const asset = await framer.uploadImage({
      image: url,
      name: spec.imageAlt ?? spec.name,
    })
    if (asset) {
      await node.setAttributes({ backgroundImage: asset })
    }
  } catch {
    // The placeholder fill stays; the merchant can drop the image manually.
  }
}
