// @vitest-environment jsdom
/**
 * ConnectionPage CMS permission gating: when the Framer account cannot edit
 * CMS collections the page shows the blocked notice and disables submitting,
 * and when it can the form stays fully usable.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The real @framer/plugin module never resolves outside the Framer host, so
// render tests must mock it before importing views that reach storage. The
// spy lets each test report a different permission verdict.
vi.mock("@framer/plugin", () => ({
  framer: {},
  useIsAllowedTo: vi.fn(function useIsAllowedTo() {
    return false
  }),
}))

import { useIsAllowedTo } from "@framer/plugin"
import { ConnectionPage } from "../ConnectionPage"
import { CMS_PERMISSION_MESSAGE } from "../../storage/connections"

afterEach(function cleanupDom() {
  cleanup()
})

describe("ConnectionPage CMS permission gating", () => {
  it("shows the blocked notice and disables Connect store when denied", () => {
    vi.mocked(useIsAllowedTo).mockReturnValue(false)
    render(
      <ConnectionPage
        connection={null}
        onBack={function noop() {}}
        onSaved={function noop() {}}
      />
    )
    expect(screen.getByText("CMS Editing Blocked")).toBeTruthy()
    expect(screen.getByText(CMS_PERMISSION_MESSAGE)).toBeTruthy()
    const submit = screen.getByRole("button", { name: "Connect store" })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it("keeps the form usable when every CMS method is allowed", () => {
    vi.mocked(useIsAllowedTo).mockReturnValue(true)
    render(
      <ConnectionPage
        connection={null}
        onBack={function noop() {}}
        onSaved={function noop() {}}
      />
    )
    expect(screen.queryByText("CMS Editing Blocked")).toBeNull()
    const submit = screen.getByRole("button", { name: "Connect store" })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
  })
})
