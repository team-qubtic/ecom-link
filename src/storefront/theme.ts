/**
 * Canvas design tokens for storefront inserts, following the modern
 * ecommerce language of the Framefic/Connectfic component set: white
 * cards with hairline borders and generous 24px radii, lime accent chips,
 * uppercase pill badges, heavy 800-weight prices with tight tracking, and
 * Inter as the type family. One source of truth so the five generated
 * components read as one product family, and so the text styles created
 * in the project under the "Ecom Link/" prefix restyle coherently.
 */
import type { TextRole } from "./types"

/** Colors and dimensions shared by every storefront insert. */
export const STOREFRONT_THEME = {
  ink: "rgba(17, 17, 17, 1)",
  inkSecondary: "rgba(155, 155, 155, 1)",
  inverseText: "rgba(255, 255, 255, 1)",
  surface: "rgba(255, 255, 255, 1)",
  surfaceDim: "rgba(248, 248, 248, 1)",
  imageGradientFrom: "rgba(255, 255, 255, 1)",
  imageGradientTo: "rgba(250, 250, 250, 1)",
  border: "rgba(229, 229, 229, 1)",
  accent: "rgba(26, 26, 26, 1)",
  accentBorder: "rgba(26, 26, 26, 1)",
  lime: "rgba(184, 243, 29, 1)",
  limeTo: "rgba(228, 255, 122, 1)",
  limeInk: "rgba(43, 43, 43, 1)",
  pillDark: "rgba(26, 26, 26, 1)",
  sale: "rgba(198, 40, 40, 1)",
  inStock: "rgba(27, 127, 77, 1)",
  inStockDim: "rgba(27, 127, 77, 0.1)",
  outOfStock: "rgba(138, 138, 138, 1)",
  outOfStockDim: "rgba(138, 138, 138, 0.12)",
  backorder: "rgba(178, 106, 0, 1)",
  backorderDim: "rgba(178, 106, 0, 0.1)",
  stars: "rgba(245, 166, 35, 1)",
  radius: 16,
  radiusMedium: 18,
  radiusSmall: 10,
  cardWidth: 340,
  cardHeight: 590,
  cardPadding: 12,
  cardImageSize: 316,
  cardBodyPadding: 12,
  cardBodyGap: 6,
  pageWidth: 1200,
  pageColumn: 560,
  gridColumns: 3,
  gridGap: 28,
  sidebarWidth: 260,
  compactCardWidth: 265,
  compactCardHeight: 510,
  compactImageSize: 241,
  buttonWidth: 240,
  buttonHeight: 52,
  chipWidth: 64,
  chipHeight: 24,
  chipCornerInset: 14,
}

export type StorefrontTheme = typeof STOREFRONT_THEME

/** Inter as the storefront type family; resolved through getFont per insert. */
export const FONT_FAMILY = "Inter"

/**
 * Text roles as project text style definitions. One insert creates each
 * missing style once and reuses it for every text node with that role, so
 * editing the style later restyles every storefront insert at once. Heavy
 * weights and tight tracking carry the Framefic-style hierarchy.
 */
export const TEXT_ROLES: Array<{
  role: TextRole
  styleName: string
  tag: "h1" | "h2" | "h3" | "p"
  fontSize: number
  fontWeight: 400 | 500 | 600 | 700 | 800
  color: string
  letterSpacing?: string
  lineHeight?: string
}> = [
  {
    role: "title",
    styleName: "Ecom Link/Title",
    tag: "h1",
    fontSize: 40,
    fontWeight: 800,
    color: STOREFRONT_THEME.ink,
    letterSpacing: "-0.03em",
    lineHeight: "1.1",
  },
  {
    role: "name",
    styleName: "Ecom Link/Product name",
    tag: "h3",
    fontSize: 15,
    fontWeight: 600,
    color: STOREFRONT_THEME.ink,
    lineHeight: "1.4",
  },
  {
    role: "eyebrow",
    styleName: "Ecom Link/Eyebrow",
    tag: "p",
    fontSize: 13,
    fontWeight: 600,
    color: STOREFRONT_THEME.inkSecondary,
    letterSpacing: "0.05em",
  },
  {
    role: "price",
    styleName: "Ecom Link/Price",
    tag: "p",
    fontSize: 18,
    fontWeight: 700,
    color: STOREFRONT_THEME.ink,
  },
  {
    role: "stars",
    styleName: "Ecom Link/Stars",
    tag: "p",
    fontSize: 12,
    fontWeight: 400,
    color: STOREFRONT_THEME.stars,
  },
  {
    role: "body",
    styleName: "Ecom Link/Body",
    tag: "p",
    fontSize: 15,
    fontWeight: 500,
    color: STOREFRONT_THEME.inkSecondary,
    lineHeight: "1.6",
  },
  {
    role: "small",
    styleName: "Ecom Link/Small",
    tag: "p",
    fontSize: 13,
    fontWeight: 600,
    color: STOREFRONT_THEME.inkSecondary,
  },
  {
    role: "chip",
    styleName: "Ecom Link/Chip",
    tag: "p",
    fontSize: 12,
    fontWeight: 700,
    color: STOREFRONT_THEME.limeInk,
    letterSpacing: "0.08em",
  },
  {
    role: "pill",
    styleName: "Ecom Link/Pill",
    tag: "p",
    fontSize: 12,
    fontWeight: 600,
    color: STOREFRONT_THEME.inverseText,
  },
  {
    role: "button",
    styleName: "Ecom Link/Button",
    tag: "p",
    fontSize: 15,
    fontWeight: 700,
    color: STOREFRONT_THEME.inverseText,
  },
]
