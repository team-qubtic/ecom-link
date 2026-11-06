// @vitest-environment jsdom
/**
 * Canvas bridge tests: the materializer walks a spec tree into SDK node
 * calls. Everything runs against a recording fake of the Framer host so no
 * canvas is needed; the suite asserts attribute translation, parenting,
 * text style reuse, image fallbacks, and the permission guard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The recording fake lives in one hoisted block: vi.mock factories are
 * lifted above every statement, so anything they close over must come from
 * the same hoisted scope.
 */
const {
  createdFrames,
  createdTexts,
  textContents,
  frameUpdates,
  textUpdates,
  uploads,
  stylesCreated,
  removedIds,
  state,
  base,
  framer,
  originalCreateTextNode,
} = vi.hoisted(function hoisted() {
  const createdFrames: Array<{ attrs: Record<string, unknown>; parentId?: string }> = []
  const createdTexts: Array<{ parentId?: string }> = []
  const textContents: string[] = []
  const frameUpdates: Array<Record<string, unknown>> = []
  const textUpdates: Array<Record<string, unknown>> = []
  const uploads: Array<Record<string, unknown>> = []
  const stylesCreated: Array<Record<string, unknown>> = []
  const removedIds: string[][] = []
  const state = {
    uploadShouldFail: false,
    nextNodeId: 0,
    donor: null as null | Record<string, unknown>,
    trackedNodes: new Set<string>(),
  }

  function makeNode(kind: string) {
    const updates = kind === "frame" ? frameUpdates : textUpdates
    const id = `${kind}-${(state.nextNodeId += 1)}`
    return {
      id,
      setText: vi.fn(async function setText(text: string) {
        textContents.push(text)
      }),
      setAttributes: vi.fn(async function setAttributes(update: Record<string, unknown>) {
        updates.push(update)
      }),
    }
  }

  const base = {
    isAllowedTo: function isAllowedTo(method: string): boolean {
      return typeof method === "string"
    },
    getTextStyles: async function getTextStyles() {
      return [] as Array<{ id: string; name: string }>
    },
    getTextStyle: async function getTextStyle(id: string) {
      return { id, name: id }
    },
    getFont: async function getFont(family: string, attrs?: Record<string, unknown>) {
      return { __class: "Font", family, weight: attrs?.weight ?? 400 }
    },
    createTextStyle: async function createTextStyle(attrs: Record<string, unknown>) {
      stylesCreated.push(attrs)
      return { id: `style-${stylesCreated.length}`, name: attrs.name }
    },
    createFrameNode: async function createFrameNode(
      attrs: Record<string, unknown>,
      parentId?: string
    ) {
      createdFrames.push({ attrs, parentId })
      return makeNode("frame")
    },
    createTextNode: async function createTextNode(
      _attrs: Record<string, unknown>,
      parentId?: string
    ) {
      createdTexts.push({ parentId })
      return makeNode("text")
    },
    getNodesWithType: async function getNodesWithType(type: string) {
      if (type === "TextNode" && state.donor) {
        return [makeNode("donor")]
      }
      return []
    },
    getNode: async function getNode(nodeId: string) {
      return state.trackedNodes.has(nodeId) ? { id: nodeId } : null
    },
    cloneNode: async function cloneNode(nodeId: string) {
      const node = makeNode("clone")
      void nodeId
      return node
    },
    setParent: async function setParent(nodeId: string, parentId: string) {
      void nodeId
      void parentId
    },
    removeNodes: async function removeNodes(ids: string[]) {
      removedIds.push(ids)
    },
    uploadImage: async function uploadImage(input: Record<string, unknown>) {
      uploads.push(input)
      if (state.uploadShouldFail) {
        throw new Error("no cors")
      }
      return { id: "asset-1", name: input.name }
    },
  }

  type FakeFn = ReturnType<typeof vi.fn>
  const framer: Record<string, FakeFn> = {
    isAllowedTo: vi.fn(base.isAllowedTo),
    getTextStyles: vi.fn(base.getTextStyles),
    getTextStyle: vi.fn(base.getTextStyle),
    getFont: vi.fn(base.getFont),
    createTextStyle: vi.fn(base.createTextStyle),
    createFrameNode: vi.fn(base.createFrameNode),
    createTextNode: vi.fn(base.createTextNode),
    getNodesWithType: vi.fn(base.getNodesWithType),
    cloneNode: vi.fn(base.cloneNode),
    setParent: vi.fn(base.setParent),
    removeNodes: vi.fn(base.removeNodes),
    uploadImage: vi.fn(base.uploadImage),
  }

  return {
    createdFrames,
    createdTexts,
    textContents,
    frameUpdates,
    textUpdates,
    uploads,
    stylesCreated,
    removedIds,
    state,
    base,
    framer,
    originalCreateTextNode: framer.createTextNode,
  }
})

vi.mock("../framer", () => ({ framer }))

/** Insertion tracking state, hoisted for the module factory below. */
const insertedRoots = vi.hoisted(function hoisted() {
  return new Map<string, string>()
})

vi.mock("../../storage/insertions", () => ({
  getInsertedRootNodeId: async function getInsertedRootNodeId(componentId: string) {
    return insertedRoots.get(componentId) ?? null
  },
  saveInsertedRootNodeId: async function saveInsertedRootNodeId(
    componentId: string,
    rootNodeId: string
  ) {
    insertedRoots.set(componentId, rootNodeId)
  },
}))

import {
  CANVAS_INSERT_FAILED_MESSAGE,
  CanvasPermissionError,
  assertCanCreateNodes,
  insertNodeTree,
  rawInvoke,
  resetHostOriginCache,
} from "../canvas"

/** Simulate one host message arriving from the parent frame. */
function postFromHost(data: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      origin: "https://framer.com",
      data,
    })
  )
}
import { STOREFRONT_THEME, TEXT_ROLES } from "../../storefront/theme"
import type { FrameSpec, TextSpec } from "../../storefront/types"

beforeEach(function reset() {
  createdFrames.length = 0
  createdTexts.length = 0
  textContents.length = 0
  frameUpdates.length = 0
  textUpdates.length = 0
  uploads.length = 0
  stylesCreated.length = 0
  removedIds.length = 0
  state.uploadShouldFail = false
  state.nextNodeId = 0
  state.donor = null
  state.trackedNodes.clear()
  insertedRoots.clear()
  framer.createTextNode = originalCreateTextNode
  framer.isAllowedTo = vi.fn(base.isAllowedTo)
  framer.getTextStyles = vi.fn(base.getTextStyles)
  framer.getTextStyle = vi.fn(base.getTextStyle)
  framer.createTextStyle = vi.fn(base.createTextStyle)
  framer.createFrameNode = vi.fn(base.createFrameNode)
  framer.getNodesWithType = vi.fn(base.getNodesWithType)
  framer.getNode = vi.fn(base.getNode)
  framer.cloneNode = vi.fn(base.cloneNode)
  framer.setParent = vi.fn(base.setParent)
  framer.removeNodes = vi.fn(base.removeNodes)
  framer.uploadImage = vi.fn(base.uploadImage)
})

function cardSpec(): FrameSpec {
  return {
    kind: "frame",
    name: "Card",
    stack: { direction: "vertical", gap: 10 },
    width: 320,
    radius: 12,
    fill: "rgba(255, 255, 255, 1)",
    children: [
      {
        kind: "frame",
        name: "Product image",
        width: 320,
        height: 320,
        radius: 12,
        fill: "rgba(240, 240, 240, 1)",
        imageUrl: "https://cdn.example.com/jacket.jpg",
        imageAlt: "Trail jacket",
        children: [],
      },
      {
        kind: "text",
        name: "Product name",
        text: "Trail jacket",
        role: "name",
        link: "https://store.example.com/jacket",
      },
    ],
  }
}

describe("assertCanCreateNodes", () => {
  it("passes when every required permission is granted", () => {
    expect(function noThrow() {
      assertCanCreateNodes()
    }).not.toThrow()
  })

  it("throws the canvas permission sentence when denied", () => {
    framer.isAllowedTo.mockImplementation(function check(method: string) {
      return method !== "createFrameNode"
    })
    expect(function shouldThrow() {
      assertCanCreateNodes()
    }).toThrow(CanvasPermissionError)
  })

  it("checks clone path permissions only when the alpha API is missing", () => {
    framer.createTextNode = undefined as never
    framer.isAllowedTo.mockImplementation(function check(method: string) {
      return method !== "setParent"
    })
    expect(function shouldThrow() {
      assertCanCreateNodes()
    }).toThrow(CanvasPermissionError)
  })

  it("does not require clone permissions when the alpha API exists", () => {
    framer.isAllowedTo.mockImplementation(function check(method: string) {
      return method !== "setParent"
    })
    expect(function noThrow() {
      assertCanCreateNodes()
    }).not.toThrow()
  })
})

describe("insertNodeTree", () => {
  it("walks the tree and parents children to their frame", async () => {
    await insertNodeTree(cardSpec())
    expect(createdFrames).toHaveLength(2)
    expect(createdTexts).toHaveLength(1)
    const card = createdFrames[0]
    expect(card.parentId).toBeUndefined()
    expect(card.attrs.name).toBe("Card")
    expect(card.attrs.width).toBe("320px")
    expect(card.attrs.borderRadius).toBe("12px")
    expect(card.attrs.layout).toBe("stack")
    expect(card.attrs.stackDirection).toBe("vertical")
    expect(card.attrs.gap).toBe("10px")
    const image = createdFrames[1]
    expect(image.parentId).not.toBeUndefined()
    expect(image.attrs.height).toBe("320px")
    const text = createdTexts[0]
    expect(text.parentId).not.toBeUndefined()
    expect(textContents).toContain("Trail jacket")
  })

  it("styles text with the shared role style and sets links", async () => {
    await insertNodeTree(cardSpec())
    expect(stylesCreated.length).toBe(TEXT_ROLES.length)
    const nameStyle = stylesCreated.find(function isNameStyle(style) {
      return style.name === "Ecom Link/Product name"
    })
    expect(nameStyle).toBeDefined()
    expect(textUpdates[0].inlineTextStyle).toBeDefined()
    expect(textUpdates[0].link).toBe("https://store.example.com/jacket")
  })

  it("resolves the storefront font at each role weight", async () => {
    await insertNodeTree(cardSpec())
    expect(framer.getFont).toHaveBeenCalled()
    const titleStyle = stylesCreated.find(function isTitleStyle(style) {
      return style.name === "Ecom Link/Title"
    })
    expect((titleStyle?.font as Record<string, unknown>).weight).toBe(800)
  })

  it("reuses existing project styles instead of duplicating them", async () => {
    framer.getTextStyles.mockImplementation(async function listStyles() {
      return TEXT_ROLES.map(function toExisting(definition, index) {
        return { id: `existing-${index}`, name: definition.styleName }
      })
    })
    framer.getTextStyle.mockImplementation(async function fetchStyle(id: string) {
      const index = Number(id.split("-")[1])
      return { id, name: TEXT_ROLES[index].styleName }
    })
    await insertNodeTree(cardSpec())
    expect(stylesCreated).toHaveLength(0)
    expect(framer.getTextStyle).toHaveBeenCalled()
    expect(textUpdates[0].inlineTextStyle).toEqual({
      id: "existing-1",
      name: "Ecom Link/Product name",
    })
  })

  it("uploads product images and sets the background asset", async () => {
    await insertNodeTree(cardSpec())
    expect(uploads).toHaveLength(1)
    expect(uploads[0].image).toBe("https://cdn.example.com/jacket.jpg")
    expect(frameUpdates.some(function isImage(update) {
      return update.backgroundImage !== undefined
    })).toBe(true)
  })

  it("keeps the placeholder fill when the upload fails", async () => {
    state.uploadShouldFail = true
    await insertNodeTree(cardSpec())
    const image = createdFrames[1]
    expect(image.attrs.backgroundColor).toBe("rgba(240, 240, 240, 1)")
    expect(frameUpdates.some(function isImage(update) {
      return update.backgroundImage !== undefined
    })).toBe(false)
  })

  it("renders grid layouts with the column count", async () => {
    const grid: FrameSpec = {
      kind: "frame",
      name: "Grid",
      grid: { columns: 3, gap: 24, padding: 32 },
      children: [],
    }
    await insertNodeTree(grid)
    const attrs = createdFrames[0].attrs
    expect(attrs.layout).toBe("grid")
    expect(attrs.gridColumnCount).toBe(3)
    expect(attrs.gap).toBe("24px")
    expect(attrs.padding).toBe("32px")
  })

  it("translates the Framefic chrome: borders, gradients, pins", async () => {
    const chip: FrameSpec = {
      kind: "frame",
      name: "Sale chip",
      stack: { direction: "horizontal" },
      radius: 999,
      fill: "rgba(184, 243, 29, 1)",
      gradient: {
        from: "rgba(184, 243, 29, 1)",
        to: "rgba(228, 255, 122, 1)",
        angle: 135,
      },
      border: { width: 1, color: "rgba(229, 229, 229, 1)" },
      position: "absolute",
      pins: { top: 14, left: 14 },
      children: [],
    }
    const card: FrameSpec = {
      kind: "frame",
      name: "Card",
      radius: "23px 23px 0px 0px",
      children: [chip],
    }
    await insertNodeTree(card)
    // The parent card is created first; the chip is its child.
    const chipAttrs = createdFrames[1].attrs
    expect(chipAttrs.borderRadius).toBe("999px")
    expect(chipAttrs.border).toEqual({
      width: "1px",
      color: "rgba(229, 229, 229, 1)",
      style: "solid",
    })
    expect(chipAttrs.backgroundGradient).toEqual({
      __class: "LinearGradient",
      angle: 135,
      stops: [
        { color: "rgba(184, 243, 29, 1)", position: 0 },
        { color: "rgba(228, 255, 122, 1)", position: 1 },
      ],
    })
    expect(chipAttrs.position).toBe("absolute")
    expect(chipAttrs.top).toBe("14px")
    expect(chipAttrs.left).toBe("14px")
    // The per-corner radius string passes through untouched.
    expect(createdFrames[0].attrs.borderRadius).toBe("23px 23px 0px 0px")
  })

  it("renders plain text without a style when style creation fails", async () => {
    framer.createTextStyle = vi.fn(async function fail() {
      throw new Error("denied")
    })
    const text: TextSpec = { kind: "text", name: "T", text: "Hello", role: "body" }
    await insertNodeTree(text)
    expect(textContents).toContain("Hello")
    // Nothing to apply, so the node is left untouched rather than updated.
    expect(textUpdates).toHaveLength(0)
  })

  it("clones an existing text layer when the alpha API is missing", async () => {
    framer.createTextNode = undefined as never
    state.donor = { id: "donor-1" }
    await insertNodeTree(cardSpec())
    expect(createdTexts).toHaveLength(0)
    expect(textContents).toContain("Trail jacket")
    expect(framer.setParent).toHaveBeenCalled()
    expect(textUpdates[0].inlineTextStyle).toBeDefined()
    expect(textUpdates[0].link).toBe("https://store.example.com/jacket")
  })

  it("reports the unavailable sentence when no text layer exists to clone", async () => {
    framer.createTextNode = undefined as never
    await expect(insertNodeTree(cardSpec())).rejects.toThrow(
      /cannot create text layers/
    )
    // The frames created before the failure are cleaned up.
    expect(removedIds).toHaveLength(1)
    expect(removedIds[0]).toHaveLength(2)
  })

  it("removes partial inserts when a later step fails", async () => {
    framer.createTextNode = undefined as never
    state.donor = { id: "donor-1" }
    framer.cloneNode = vi.fn(async function failClone() {
      return null
    })
    await expect(insertNodeTree(cardSpec())).rejects.toThrow(
      new RegExp(CANVAS_INSERT_FAILED_MESSAGE.slice(0, 20))
    )
    expect(removedIds).toHaveLength(1)
    expect(removedIds[0]).toHaveLength(2)
  })

  it("throws when the canvas refuses node creation", async () => {
    // The SDK types never return null here, but the runtime contract does.
    framer.createFrameNode.mockResolvedValue(null as never)
    await expect(insertNodeTree(cardSpec())).rejects.toThrow(
      /could not be placed/
    )
  })

  it("ships the documented theme shape", () => {
    expect(STOREFRONT_THEME.gridColumns).toBe(3)
    expect(TEXT_ROLES.length).toBeGreaterThanOrEqual(5)
  })
})

describe("replace on insert", () => {
  it("removes the tracked previous root before inserting again", async () => {
    await insertNodeTree(cardSpec(), { replaceComponentId: "listing" })
    const firstRoot = insertedRoots.get("listing")
    expect(firstRoot).toBeDefined()
    // The fake getNode only knows nodes added here, simulating a surviving
    // previous insert.
    state.trackedNodes.add(String(firstRoot))
    removedIds.length = 0
    await insertNodeTree(cardSpec(), { replaceComponentId: "listing" })
    expect(removedIds[0]).toEqual([firstRoot])
    expect(insertedRoots.get("listing")).not.toBe(firstRoot)
  })

  it("inserts without cleanup when no previous root is tracked", async () => {
    removedIds.length = 0
    await insertNodeTree(cardSpec(), { replaceComponentId: "stock" })
    expect(removedIds).toHaveLength(0)
    expect(insertedRoots.get("stock")).toBeDefined()
  })

  it("keeps the new insert when the tracked node no longer exists", async () => {
    insertedRoots.set("listing", "deleted-node")
    await insertNodeTree(cardSpec(), { replaceComponentId: "listing" })
    expect(removedIds).toHaveLength(0)
    expect(insertedRoots.get("listing")).toBeDefined()
  })
})

describe("rawInvoke", () => {
  beforeEach(function resetOrigin() {
    resetHostOriginCache()
  })

  /** Capture outgoing plugin messages instead of posting to jsdom. */
  function captureOutgoing(): { ids: () => unknown[]; restore: () => void } {
    const ids: unknown[] = []
    const spy = vi.spyOn(window, "postMessage").mockImplementation(function capture(data: unknown) {
      if (
        typeof data === "object" &&
        data !== null &&
        (data as Record<string, unknown>).type === "methodInvocation"
      ) {
        ids.push((data as Record<string, unknown>).id)
      }
      return true
    })
    return {
      ids: function getIds() {
        return ids
      },
      restore: function restore() {
        spy.mockRestore()
      },
    }
  }

  it("handshakes the host and resolves the method response", async () => {
    const capture = captureOutgoing()
    const pending = rawInvoke("createNode", ["TextNode", null, {}])
    await waitForMacrotask()
    // The host answers the ready signal, then the invocation by id.
    postFromHost({ type: "pluginReadyResponse", mode: "canvas" })
    await waitForMacrotask()
    const id = capture.ids()[0]
    expect(id).toBeDefined()
    postFromHost({ type: "methodResponse", id, result: { id: "text-9" } })
    await expect(pending).resolves.toEqual({ id: "text-9" })
    capture.restore()
  })

  it("rejects when the host reports an error", async () => {
    const capture = captureOutgoing()
    const pending = rawInvoke("createNode", ["TextNode", null, {}])
    await waitForMacrotask()
    postFromHost({ type: "pluginReadyResponse", mode: "canvas" })
    await waitForMacrotask()
    postFromHost({
      type: "methodResponse",
      id: capture.ids()[0],
      error: { message: "denied" },
    })
    await expect(pending).rejects.toThrow("denied")
    capture.restore()
  })

  it("rejects when the host stays silent", async () => {
    captureOutgoing()
    vi.useFakeTimers()
    try {
      const pending = rawInvoke("createNode", ["TextNode", null, {}])
      const assertion = expect(pending).rejects.toThrow()
      await vi.runAllTimersAsync()
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it("ignores responses meant for other ids", async () => {
    const capture = captureOutgoing()
    const pending = rawInvoke("createNode", ["TextNode", null, {}])
    await waitForMacrotask()
    postFromHost({ type: "pluginReadyResponse", mode: "canvas" })
    await waitForMacrotask()
    postFromHost({ type: "methodResponse", id: 1, result: "other" })
    postFromHost({ type: "methodResponse", id: capture.ids()[0], result: "mine" })
    await expect(pending).resolves.toBe("mine")
    capture.restore()
  })
})

/** Let the pending promise chain reach its message listener. */
async function waitForMacrotask(): Promise<void> {
  await new Promise(function nextTick(resolve) {
    setTimeout(resolve, 0)
  })
}
