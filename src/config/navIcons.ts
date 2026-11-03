/**
 * NavIcons: shared icon registry for navigation surfaces.
 *
 * Both the bottom bar (BottomNav) and the hamburger drawer (NavDrawer) read
 * their icon names from navigation.json and resolve them here, so one
 * registry governs every navigation surface. Add an icon name to
 * navigation.json and register it below.
 */

import { Component, DatabaseArrowDown, Home, Link, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export const NAV_ICONS: Record<string, LucideIcon> = {
  Home,
  DatabaseArrowDown,
  Component,
  Link,
  Settings,
}
