/**
 * Storefront node spec: a declarative description of a canvas layout built
 * by the component builders (src/storefront/builders.ts) and materialized
 * onto the Framer canvas by the bridge (src/lib/canvas.ts). Specs are pure
 * data so the builders test without the SDK, and the bridge stays the only
 * place that touches node creation.
 */

/**
 * Semantic text role, resolved to a shared project text style ("Ecom
 * Link/...") on insert so all storefront inserts stay typographically
 * coherent and restyle together.
 */
export type TextRole =
  | "title"
  | "name"
  | "eyebrow"
  | "price"
  | "body"
  | "small"
  | "stars"
  | "chip"
  | "pill"
  | "button"

/** One text layer on the canvas. */
export interface TextSpec {
  kind: "text"
  name: string
  text: string
  /** Typography preset applied via the shared text style. */
  role: TextRole
  /** Optional link behind the text, e.g. a product permalink. */
  link?: string
}

/** Stack layout definition: direction plus spacing in pixels. */
export interface StackSpec {
  direction: "horizontal" | "vertical"
  gap?: number
  padding?: number
}

/** Grid layout definition: fixed column count plus spacing in pixels. */
export interface GridSpec {
  columns: number
  gap?: number
  padding?: number
}

/** Frame sizing mode for image placeholders and overlays. */
export interface PinsSpec {
  top?: number
  left?: number
  right?: number
  bottom?: number
}

/** Linear gradient fill, rendered through the frame's backgroundGradient. */
export interface GradientSpec {
  /** CSS color at position 0. */
  from: string
  /** CSS color at position 1. */
  to: string
  /** Gradient angle in degrees; 135 matches a corner sweep. */
  angle?: number
}

/** One frame layer; plain containers have no layout, children stack inside. */
export interface FrameSpec {
  kind: "frame"
  name: string
  /** Stack layout; omit for a frame without auto-layout. */
  stack?: StackSpec
  /** Grid layout; omit for a frame without auto-layout. Takes precedence over stack. */
  grid?: GridSpec
  /** Fixed width in pixels, or "fit-content" to hug the children. */
  width?: number | "fit-content"
  /** Fixed height in pixels, or "fit-content" to hug the children. */
  height?: number | "fit-content"
  /** Background fill; also the placeholder behind failed image uploads. */
  fill?: string
  /** Linear gradient fill; renders over fill and behind uploaded images. */
  gradient?: GradientSpec
  /** Corner radius in pixels, or a CSS string for per-corner radii. */
  radius?: number | string
  /** Hairline border around the frame. */
  border?: { width: number; color: string }
  /** Store image URL uploaded and set as the frame background on insert. */
  imageUrl?: string
  /** Alt text used when uploading imageUrl as an asset. */
  imageAlt?: string
  /** Optional link behind the frame, e.g. a product permalink. */
  link?: string
  /**
   * Absolute positioning inside the parent frame (for overlay pills), with
   * pixel pins from the parent's edges. Omit for normal stack/grid flow.
   */
  position?: "absolute"
  pins?: PinsSpec
  children?: NodeSpec[]
}

export type NodeSpec = FrameSpec | TextSpec
