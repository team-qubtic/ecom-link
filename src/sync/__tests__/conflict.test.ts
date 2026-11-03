/**
 * Change classification tests for spec 004: the three-value comparison
 * that decides what flows back to the store, resolution defaults, push
 * grouping, CMS value conversion, and review table formatting.
 */

import { describe, expect, it } from "vitest"

import type { NormalizedProductField } from "../../providers"
import {
  applyResolutions,
  classifyChange,
  cmsValueToPlatform,
  effectiveResolution,
  formatPendingValue,
  groupPushesByProduct,
  platformValuesEqual,
  toPendingChange,
} from "../conflict"
import type { PendingChange } from "../conflict"

/** Build a change quickly; only the assertions under test fill every field. */
function change(
  itemWooId: string,
  field: NormalizedProductField,
  resolution: PendingChange["resolution"]
): PendingChange {
  return {
    itemWooId,
    field,
    wooValue: null,
    framerValue: null,
    resolution,
  }
}

describe("platformValuesEqual", () => {
  it("treats identical primitives as equal", () => {
    expect(platformValuesEqual("Same", "Same")).toBe(true)
    expect(platformValuesEqual(21.99, 21.99)).toBe(true)
    expect(platformValuesEqual(null, null)).toBe(true)
  })

  it("treats null and undefined as equally missing", () => {
    expect(platformValuesEqual(null, undefined)).toBe(true)
    expect(platformValuesEqual(undefined, null)).toBe(true)
  })

  it("does not coerce across types or empties", () => {
    expect(platformValuesEqual(null, "")).toBe(false)
    expect(platformValuesEqual(21.99, "21.99")).toBe(false)
    expect(platformValuesEqual(0, null)).toBe(false)
    expect(platformValuesEqual("", "Edited")).toBe(false)
  })
})

describe("classifyChange", () => {
  it("skips when there is no stored snapshot", () => {
    expect(classifyChange("Edited", "Same", undefined)).toBe("skip")
  })

  it("skips when the CMS value still matches the snapshot", () => {
    expect(classifyChange("Same", "Store moved", "Same")).toBe("skip")
  })

  it("pushes when only the CMS value moved", () => {
    expect(classifyChange("Edited", "Same", "Same")).toBe("push")
  })

  it("reports a conflict when both sides moved", () => {
    expect(classifyChange("CMS edit", "Store edit", "Same")).toBe("conflict")
  })
})

describe("toPendingChange", () => {
  it("marks conflicts as pending and pushes as ready", () => {
    expect(
      toPendingChange("1", "name", "Store edit", "CMS edit", "conflict")
        .resolution
    ).toBe("pending")
    expect(
      toPendingChange("1", "name", "Same", "CMS edit", "push").resolution
    ).toBe("push")
  })
})

describe("effectiveResolution", () => {
  it("defaults unresolved conflicts to keeping the store value", () => {
    expect(effectiveResolution(change("1", "name", "pending"))).toBe("keep-woo")
    expect(effectiveResolution(change("1", "name", "keep-woo"))).toBe("keep-woo")
    expect(effectiveResolution(change("1", "name", "push"))).toBe("push")
  })
})

describe("applyResolutions", () => {
  it("splits changes into pushes and kept conflicts in order", () => {
    const pushA = change("1", "name", "push")
    const conflictB = change("2", "price", "pending")
    const pushC = change("2", "name", "push")

    const resolved = applyResolutions([pushA, conflictB, pushC])

    expect(resolved.pushes).toEqual([pushA, pushC])
    expect(resolved.conflictsKept).toEqual([conflictB])
  })

  it("returns empty lists when nothing is offered", () => {
    expect(applyResolutions([])).toEqual({ pushes: [], conflictsKept: [] })
  })
})

describe("groupPushesByProduct", () => {
  it("groups changes by product in first-seen order", () => {
    const groups = groupPushesByProduct([
      change("2", "name", "push"),
      change("1", "name", "push"),
      change("2", "price", "push"),
    ])

    expect(groups.map((group) => group.itemWooId)).toEqual(["2", "1"])
    expect(groups[0].changes.map((entry) => entry.field)).toEqual([
      "name",
      "price",
    ])
  })
})

describe("cmsValueToPlatform", () => {
  it("converts numeric strings and empties on number fields", () => {
    expect(cmsValueToPlatform("21.99", "price")).toBe(21.99)
    expect(cmsValueToPlatform(5, "stockQuantity")).toBe(5)
    expect(cmsValueToPlatform("", "price")).toBe(null)
    expect(cmsValueToPlatform(null, "price")).toBe(null)
    expect(cmsValueToPlatform("not a number", "price")).toBe(null)
  })

  it("normalizes missing and non-string values on text fields", () => {
    expect(cmsValueToPlatform(null, "name")).toBe("")
    expect(cmsValueToPlatform(undefined, "status")).toBe("")
    expect(cmsValueToPlatform(42, "name")).toBe("42")
    expect(cmsValueToPlatform("Draft", "status")).toBe("Draft")
  })
})

describe("formatPendingValue", () => {
  it("labels empty values and stringifies the rest", () => {
    expect(formatPendingValue(null)).toBe("Empty")
    expect(formatPendingValue(undefined)).toBe("Empty")
    expect(formatPendingValue("")).toBe("Empty")
    expect(formatPendingValue("Plain text")).toBe("Plain text")
    expect(formatPendingValue(21.99)).toBe("21.99")
    expect(formatPendingValue({ sku: "SKU-1" })).toBe('{"sku":"SKU-1"}')
  })

  it("keeps text at the display limit and cuts longer text", () => {
    const atLimit = "a".repeat(80)
    expect(formatPendingValue(atLimit)).toBe(atLimit)

    const cut = formatPendingValue("b".repeat(81))
    expect(cut.length).toBe(80)
    expect(cut.startsWith("b".repeat(79))).toBe(true)
    expect(cut.endsWith("…")).toBe(true)
  })
})
