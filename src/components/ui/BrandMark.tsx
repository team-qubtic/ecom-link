/**
 * BrandMark: simplified brand marks for supported store platforms.
 *
 * Each platform gets a brand-colored tile with a hand-drawn white glyph or
 * wordmark, so provider rows are recognizable at a glance instead of sharing
 * one generic lucide icon. The marks are simplified (a tile plus one glyph);
 * they are not official logos and stay deliberately abstract enough to avoid
 * impersonating them.
 *
 * Unknown provider ids fall back to a neutral Globe tile, so new providers
 * render fine before their mark is added here.
 */

import type { ReactNode } from "react"
import { Globe } from "lucide-react"

import brandStyles from "../../assets/styles/module/BrandMark.module.css"

/** One brand: tile color plus the glyph drawn inside a 24x24 viewBox. */
interface Brand {
  /** Tile background, from the platform's brand palette. */
  color: string
  /** Glyph or wordmark rendered white on the tile. */
  glyph: ReactNode
}

/**
 * Simplified marks. Wordmark-style platforms (Woo, wix) use styled text in
 * the SVG; glyph-style platforms (Shopify bag, Squarespace weave) use paths.
 */
const BRANDS: Record<string, Brand> = {
  woocommerce: {
    color: "#7f54b3",
    glyph: (
      <text
        x="12"
        y="12.7"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="8.2"
        fontWeight="700"
        letterSpacing="-0.3"
        fill="#ffffff"
      >
        Woo
      </text>
    ),
  },
  shopify: {
    color: "#95bf47",
    glyph: (
      <g fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {/* Bag body */}
        <path d="M6.2 8.4 L17.8 8.4 Q19.3 8.4 19 9.9 L17.9 17.9 Q17.6 19.6 15.9 19.6 L8.1 19.6 Q6.4 19.6 6.1 17.9 L5 9.9 Q4.7 8.4 6.2 8.4 Z" />
        {/* Handle */}
        <path d="M9.3 8.2 V6.9 A2.7 2.7 0 0 1 14.7 6.9 V8.2" />
        {/* Bag crease */}
        <path d="M9.5 12.4 L11.6 14.3 L14.5 11.4" opacity="0.55" />
      </g>
    ),
  },
  bigcommerce: {
    color: "#6e42f4",
    glyph: (
      <text
        x="12"
        y="12.6"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11.5"
        fontWeight="700"
        fill="#ffffff"
      >
        B
      </text>
    ),
  },
  wix: {
    color: "#3b66f5",
    glyph: (
      <text
        x="12"
        y="12.7"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="8"
        fontWeight="700"
        letterSpacing="0.2"
        fill="#ffffff"
      >
        wix
      </text>
    ),
  },
  squarespace: {
    color: "#232733",
    glyph: (
      <g transform="rotate(-45 12 12)" fill="#ffffff">
        <rect x="3.6" y="7.6" width="16.8" height="4.4" rx="2.2" opacity="0.5" />
        <rect x="3.6" y="12" width="16.8" height="4.4" rx="2.2" />
      </g>
    ),
  },
}

interface BrandMarkProps {
  /** Provider id, e.g. "woocommerce". Unknown ids render the neutral tile. */
  provider: string
  /** Tile edge length in px. The glyph scales with it. */
  size?: number
  /** Optional extra classes on the tile (e.g. a status tint). */
  className?: string
}

/** Render the brand tile for a provider id. */
export function BrandMark({ provider, size = 36, className }: BrandMarkProps) {
  const brand = BRANDS[provider]
  if (!brand) {
    return (
      <span
        className={className ? `${brandStyles.tile} ${brandStyles.tileNeutral} ${className}` : `${brandStyles.tile} ${brandStyles.tileNeutral}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Globe size={Math.round(size * 0.5)} strokeWidth={1.8} />
      </span>
    )
  }
  return (
    <span
      className={
        className
          ? `${brandStyles.tile} ${className}`
          : brandStyles.tile
      }
      style={{ width: size, height: size, background: brand.color }}
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.58)}
        height={Math.round(size * 0.58)}
        viewBox="0 0 24 24"
        role="presentation"
        style={{ display: "block" }}
      >
        {brand.glyph}
      </svg>
    </span>
  )
}

