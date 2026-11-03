/**
 * Static UX-writing rules tests (INSTRUCTION.md section 7) plus the help doc
 * binding rules (section 9) for every page that exists so far.
 *
 * The scan covers all of src, comments included, which is stricter than the
 * rule requires and catches accidental dash characters early.
 */

import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if (/\.(ts|tsx|md)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

const srcDir = join(process.cwd(), "src")
const helpDir = join(process.cwd(), "docs", "help")
const EM_DASH = "\u2014"
const EN_DASH = "\u2013"
// Built from a string so this file does not contain the forbidden substring.
const LAZY_PLURAL_PATTERN = new RegExp("\\(s\\)")

describe("UX writing rules across src", () => {
  it("contains no em-dash or en-dash characters anywhere", () => {
    for (const file of collectSourceFiles(srcDir)) {
      const content = readFileSync(file, "utf8")
      expect(content.includes(EM_DASH), `${file} contains an em-dash`).toBe(
        false
      )
      expect(content.includes(EN_DASH), `${file} contains an en-dash`).toBe(
        false
      )
    }
  })

  it("never uses lazy pluralization like connection-plus-parenthesis-sus-parenthesis-s", () => {
    for (const file of collectSourceFiles(srcDir)) {
      const content = readFileSync(file, "utf8")
      expect(
        LAZY_PLURAL_PATTERN.test(content),
        `${file} uses lazy pluralization`
      ).toBe(false)
    }
  })
})

describe("help documentation rules", () => {
  it("follows the binding rules on every page", () => {
    const pages = collectSourceFiles(helpDir).filter(
      function isMarkdown(file) {
        return file.endsWith(".md")
      }
    )
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      const content = readFileSync(page, "utf8")
      expect(content.includes(EM_DASH), `${page} contains an em-dash`).toBe(
        false
      )
      expect(
        /\b(we|us|our)\b/.test(content),
        `${page} uses we, us, or our`
      ).toBe(false)
      expect(
        content.includes("Video tutorial"),
        `${page} lacks a Video tutorial section`
      ).toBe(true)
      expect(
        content.includes("[Add"),
        `${page} lacks a visible placeholder`
      ).toBe(true)
    }
  })
})
