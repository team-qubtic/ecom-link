/**
 * HelpTooltip: shared info icon plus tooltip (INSTRUCTION.md section 7, rule 3).
 *
 * Field-level help stays as one short sentence in helpText. Anything longer
 * rides this component next to the heading or row it explains.
 *
 * The bubble is centered on the trigger and clamped against the plugin canvas
 * edges, so it never spills outside the window whether the trigger sits at the
 * left edge of a heading or the right edge of a toggle row.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CircleHelp } from "lucide-react"

import helpTooltipStyles from "../../assets/styles/module/HelpTooltip.module.css"

interface HelpTooltipProps {
  /** The explanation. One to three sentences, ending with a period. */
  text: string
  /** Accessible name for the info button. Defaults to a generic label. */
  label?: string
}

/** Keep a viewport coordinate inside the canvas with an 8px breathing margin. */
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Render an info icon that shows a tooltip on hover and on keyboard focus,
 * so the same help reaches mouse and keyboard users.
 */
export function HelpTooltip({ text, label = "More information" }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)

  function show() {
    setPos(null)
    setOpen(true)
  }

  function hide() {
    setOpen(false)
  }

  // Measure after the bubble mounts: center it on the trigger, clamp it 8px
  // inside the canvas edges, and flip it above the trigger when there is no
  // room below. Offsets are stored relative to the trigger span, so ancestor
  // transforms or backdrop filters cannot skew the placement.
  useLayoutEffect(function placeBubble() {
    if (!open) return
    const button = buttonRef.current
    const bubble = bubbleRef.current
    if (!button || !bubble) return

    const buttonRect = button.getBoundingClientRect()
    const width = bubble.offsetWidth
    const height = bubble.offsetHeight
    const viewWidth = document.documentElement.clientWidth
    const viewHeight = document.documentElement.clientHeight
    // Room kept clear at the bottom for the sticky footer and bottom nav,
    // so the bubble never slides under them.
    const bottomChrome = 72

    const left = clamp(
      buttonRect.left + buttonRect.width / 2 - width / 2,
      8,
      Math.max(8, viewWidth - width - 8)
    )
    const belowTop = buttonRect.bottom + 8
    const aboveTop = buttonRect.top - height - 8
    const belowFits = belowTop + height <= viewHeight - bottomChrome
    const aboveFits = aboveTop >= 8
    let top = belowTop
    if (!belowFits && aboveFits) {
      top = aboveTop
    }
    top = clamp(top, 8, Math.max(8, viewHeight - height - 8))

    setPos({ left, top })
  }, [open])

  // The bubble does not follow scrolling content, so close it when the form
  // scrolls or the window resizes rather than leave it floating out of place.
  useEffect(function closeOnViewportChange() {
    if (!open) return
    function close() {
      setOpen(false)
    }
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return function cleanup() {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  return (
    <span ref={tooltipRef} className={helpTooltipStyles.helpTooltip}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button help-tooltip-button"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <CircleHelp size={14} aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <span
              ref={bubbleRef}
              className={helpTooltipStyles.helpTooltipBubble}
              role="tooltip"
              style={
                pos
                  ? { left: pos.left, top: pos.top }
                  : { visibility: "hidden" }
              }
            >
              {text}
            </span>,
            document.body
          )
        : null}
    </span>
  )
}
