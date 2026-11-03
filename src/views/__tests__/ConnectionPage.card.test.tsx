// @vitest-environment jsdom
/**
 * ConnectionPage form integration: the Store section heading renders above
 * its fields, keeping the labeled store URL input accessible on the page.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The real @framer/plugin module never resolves outside the Framer host,
// so render tests must mock it before importing views that reach storage.
// The permission hook must exist and allow editing so the form renders.
vi.mock("@framer/plugin", () => ({
  framer: {},
  useIsAllowedTo: vi.fn(function useIsAllowedTo() {
    return true
  }),
}))

import { ConnectionPage } from "../ConnectionPage"
import connectionPageStyles from "../../assets/styles/module/ConnectionPage.module.css"

afterEach(function cleanupDom() {
  cleanup()
})

describe("ConnectionPage Form", () => {
  it("renders the Store section with its labeled input", () => {
    const { container } = render(
      <ConnectionPage
        connection={null}
        onBack={function noop() {}}
        onSaved={function noop() {}}
      />
    )
    const section = container.querySelector(
      `section.${connectionPageStyles.formSection}`
    )
    expect(section).not.toBeNull()
    const heading = screen.getByText("Store")
    expect(heading).not.toBeNull()
    const input = section?.querySelector("input#storeUrl")
    expect(input).not.toBeNull()
  })
})
