// @vitest-environment jsdom
/**
 * ComponentsView insert flow tests: the card grid, the outside-Framer
 * guard, the placeholder note, and the error notices all render from the
 * mocked canvas bridge and product loader.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@framer/plugin", () => ({
  framer: {},
  useIsAllowedTo: vi.fn(function useIsAllowedTo() {
    return true
  }),
}))

vi.mock("../../lib/framer", async function factory(importOriginal) {
  const actual = await importOriginal<typeof import("../../lib/framer")>()
  return {
    ...actual,
    runsInsideFramer: vi.fn(function runsInsideFramer() {
      return true
    }),
  }
})

vi.mock("../../lib/canvas", () => ({
  assertCanCreateNodes: vi.fn(function assertCanCreateNodes() {}),
  insertNodeTree: vi.fn(async function insertNodeTree() {}),
  CanvasPermissionError: class CanvasPermissionError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "CanvasPermissionError"
    }
  },
  CANVAS_PERMISSION_MESSAGE:
    "This Framer account cannot create canvas layers. Open the plugin with edit access to this project.",
  CANVAS_INSERT_FAILED_MESSAGE:
    "The component could not be placed on the canvas. Make sure the canvas is open, then try again.",
}))

const storefrontData = {
  products: [
    {
      id: "woo-1",
      name: "Trail jacket",
      price: "79",
      regularPrice: "79",
      onSale: false,
      stockStatus: "instock",
      category: "Outerwear",
      rating: 4.6,
      ratingCount: 121,
      permalink: "https://store.example.com/jacket",
      description: "A warm jacket.",
      imageUrl: "https://cdn.example.com/jacket.jpg",
      galleryUrls: [],
    },
  ],
  placeholder: true,
  collectionName: null,
}

vi.mock("../../storefront/productData", () => ({
  loadStorefrontProducts: vi.fn(async function loadStorefrontProducts() {
    return storefrontData
  }),
  LISTING_PRODUCT_CAP: 12,
}))

import { ComponentsView } from "../ComponentsView"
import { runsInsideFramer } from "../../lib/framer"
import {
  assertCanCreateNodes,
  insertNodeTree,
} from "../../lib/canvas"
import { loadStorefrontProducts } from "../../storefront/productData"

afterEach(function reset() {
  cleanup()
  vi.mocked(runsInsideFramer).mockReturnValue(true)
  vi.mocked(insertNodeTree).mockClear()
  vi.mocked(assertCanCreateNodes).mockClear()
})

function renderView() {
  return render(
    <ComponentsView onOpenMenu={function openMenu() {}} onOpenAccount={function openAccount() {}} />
  )
}

describe("ComponentsView", () => {
  it("renders six insert buttons and one coming soon card", () => {
    renderView()
    expect(screen.getAllByRole("button", { name: "Insert" })).toHaveLength(6)
    expect(screen.getAllByText("Available Soon")).toHaveLength(1)
  })

  it("disables inserts outside the Framer canvas", () => {
    vi.mocked(runsInsideFramer).mockReturnValue(false)
    renderView()
    for (const button of screen.getAllByRole("button", { name: "Insert" })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    expect(
      screen.getByText(/Open the plugin inside Framer/)
    ).toBeDefined()
  })

  it("inserts a component and notes placeholder content", async () => {
    renderView()
    fireEvent.click(screen.getAllByRole("button", { name: "Insert" })[0])
    await waitFor(function expectCalled() {
      expect(insertNodeTree).toHaveBeenCalledTimes(1)
    })
    expect(loadStorefrontProducts).toHaveBeenCalledTimes(1)
    await waitFor(function expectBadge() {
      expect(screen.getAllByText("Inserted")).toHaveLength(1)
    })
    expect(
      screen.getByText(/Placeholder content was used/)
    ).toBeDefined()
  })

  it("shows the error notice when the insert fails", async () => {
    vi.mocked(insertNodeTree).mockRejectedValueOnce(new Error("canvas unavailable"))
    renderView()
    fireEvent.click(screen.getAllByRole("button", { name: "Insert" })[0])
    await waitFor(function expectNotice() {
      expect(screen.getByText("canvas unavailable")).toBeDefined()
    })
  })

  it("shows the permission sentence when creation is not allowed", async () => {
    vi.mocked(assertCanCreateNodes).mockImplementation(function deny() {
      throw new Error(
        "This Framer account cannot create canvas layers. Open the plugin with edit access to this project."
      )
    })
    renderView()
    fireEvent.click(screen.getAllByRole("button", { name: "Insert" })[0])
    await waitFor(function expectNotice() {
      expect(
        screen.getByText(/cannot create canvas layers/)
      ).toBeDefined()
    })
    expect(insertNodeTree).not.toHaveBeenCalled()
  })
})
