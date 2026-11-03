# Framer Plugin Design System

> **Status note (2026-11):** The palette below is the legacy reference. The
> shipped design system is "Obsidian Studio", defined entirely by CSS custom
> properties in `src/assets/styles/variables.css` (indigo-violet accent,
> near-solid surfaces, hairline borders, glass reserved for chrome). Prefer
> the tokens in `variables.css` over the hex values in this document. The
> plugin intentionally does not import `framer.css`; controls are styled by
> this system alone.

This document defines the design system for the Ecom-Link Framer plugin. All UI components must follow these guidelines.

## Design Principles

1. **Clean and Minimal**: Framer's aesthetic is clean, modern, and uncluttered
2. **Clear Hierarchy**: Use typography, spacing, and color to establish visual hierarchy
3. **Consistent Spacing**: Use the 4px grid system for all spacing
4. **Accessible**: Meet WCAG 2.1 AA standards for contrast and interaction
5. **Responsive**: Components must work within the plugin window (340x540px default)

## Color Palette

### Primary Colors
- **Primary**: `#0366d6` (Framer blue) - Use for primary actions, links, active states
- **Primary Hover**: `#0256b9` - Darker shade for hover states
- **Primary Light**: `#f1f8ff` - Light background for primary elements

### Neutral Colors
- **Background**: `#fafafa` - Main background
- **Surface**: `#ffffff` - Cards, modals, elevated surfaces
- **Surface Subtle**: `#f8f9fa` - Subtle background variations
- **Border**: `#e1e4e8` - Default borders
- **Border Strong**: `#d1d5da` - Emphasized borders

### Text Colors
- **Text**: `#24292e` - Primary text
- **Text Secondary**: `#586069` - Secondary text, descriptions
- **Text Muted**: `#6a737d` - Help text, placeholders

### Status Colors
- **Success**: `#28a745` - Success states, connected
- **Success Light**: `#dcffe4` - Success backgrounds
- **Danger**: `#d73a49` - Errors, destructive actions
- **Danger Light**: `#ffeef0` - Error backgrounds
- **Warning**: `#ffd33d` - Warnings, cautions
- **Warning Light**: `#fff5b1` - Warning backgrounds

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, 
             Helvetica, Arial, sans-serif;
```

### Type Scale
- **Page Title**: 18px, font-weight 600, letter-spacing -0.01em
- **Section Title**: 16px, font-weight 600, letter-spacing -0.01em
- **Card Title**: 15px, font-weight 600, letter-spacing -0.01em
- **Body Text**: 14px, font-weight 400, line-height 1.5
- **Small Text**: 13px, font-weight 400, line-height 1.5
- **Help Text**: 12px, font-weight 400, line-height 1.4
- **Tiny Text**: 11px, font-weight 400, line-height 1.3

### Font Weights
- **Regular**: 400 - Body text
- **Medium**: 500 - Labels, buttons, emphasis
- **Semibold**: 600 - Headings, titles

## Spacing System

Use a 4px grid system. Common spacing values:
- **4px**: Tight spacing, icon padding
- **8px**: Small gaps, badge padding
- **12px**: Component padding, list gaps
- **16px**: Section spacing, card padding
- **20px**: Page padding, modal padding
- **24px**: Large section gaps

## Border Radius

- **Small**: 4px - Badges, small elements
- **Default**: 6px - Buttons, inputs, cards
- **Large**: 8px - Modals, large cards

## Shadows

### Small Shadow
```css
box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
```
Use for: Cards, subtle elevation

### Default Shadow
```css
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
```
Use for: Hover states, dropdowns

### Large Shadow
```css
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.04);
```
Use for: Modals, tooltips, popovers

## Components

### Buttons

#### Primary Button
- Background: `#0366d6`
- Text: `#ffffff`
- Padding: 8px 14px
- Font: 13px, font-weight 500
- Border radius: 6px
- Hover: Background `#0256b9`, add shadow

#### Secondary Button
- Background: `#ffffff`
- Border: 1px solid `#d1d5da`
- Text: `#24292e`
- Hover: Background `#f8f9fa`, border `#6a737d`

#### Ghost Button
- Background: transparent
- Text: `#586069`
- Hover: Background `#f8f9fa`, text `#24292e`

#### Danger Button
- Background: `#d73a49`
- Text: `#ffffff`
- Hover: Background `#cb2431`

#### Button Sizes
- **Default**: 13px font, 8px 14px padding
- **Small**: 12px font, 5px 10px padding

### Form Fields

#### Input Fields
- Background: `#ffffff`
- Border: 1px solid `#d1d5da`
- Padding: 8px 10px
- Font: 13px
- Border radius: 6px
- Focus: Border `#0366d6`, shadow `0 0 0 2px #f1f8ff`
- Error: Border `#d73a49`, shadow `0 0 0 2px #ffeef0`

#### Labels
- Font: 13px, font-weight 500
- Color: `#24292e`
- Margin bottom: 6px

#### Help Text
- Font: 12px
- Color: `#6a737d`
- Line height: 1.4

#### Error Text
- Font: 12px
- Color: `#d73a49`
- Line height: 1.4

### Switch Toggle

#### Track
- Width: 36px
- Height: 22px
- Border radius: 999px
- Off: Background `#d1d5da`
- On: Background `#0366d6`

#### Thumb
- Width: 18px
- Height: 18px
- Border radius: 50%
- Background: `#ffffff`
- Shadow: `0 2px 4px rgba(0, 0, 0, 0.2)`
- Position: 2px from edge, translateX(14px) when on

### Cards

#### Default Card
- Background: `#ffffff`
- Border: 1px solid `#e1e4e8`
- Border radius: 8px
- Padding: 16px
- Shadow: `0 1px 2px rgba(0, 0, 0, 0.04)`
- Hover: Shadow `0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)`

### Modals

#### Overlay
- Background: `rgba(0, 0, 0, 0.5)`
- Animation: Fade in 0.2s

#### Modal Container
- Background: `#ffffff`
- Border radius: 8px
- Max width: 360px
- Max height: 90vh
- Shadow: Large shadow
- Animation: Slide up 0.2s

#### Modal Header
- Padding: 16px 20px
- Border bottom: 1px solid `#e1e4e8`
- Title: 16px, font-weight 600

#### Modal Body
- Padding: 20px

#### Modal Footer
- Padding: 16px 20px
- Border top: 1px solid `#e1e4e8`
- Align: flex-end
- Gap: 10px

### Badges

#### Default Badge
- Font: 12px, font-weight 500
- Padding: 3px 8px
- Border radius: 4px
- Line height: 1.2

#### Badge Variants
- **Primary**: Text `#0366d6`, background `#f1f8ff`, border `#0366d6`
- **Success**: Text `#28a745`, background `#dcffe4`, border `#28a745`
- **Danger**: Text `#d73a49`, background `#ffeef0`, border `#d73a49`
- **Neutral**: Text `#586069`, background `#f8f9fa`, border `#e1e4e8`

### Notices/Alerts

#### Default Notice
- Border radius: 6px
- Padding: 12px
- Border: 1px solid
- Gap: 8px between elements

#### Notice Variants
- **Error**: Background `#ffeef0`, border `#d73a49`, text `#cb2431`
- **Warning**: Background `#fff5b1`, border `#ffd33d`, text `#735c0f`

### Tooltips

#### Tooltip Bubble
- Background: `#24292e`
- Text: `#ffffff`
- Font: 12px
- Padding: 10px 12px
- Border radius: 6px
- Width: 240px
- Shadow: Large shadow
- Animation: Fade in 0.15s

### Icon Buttons

#### Default Icon Button
- Size: 24px × 24px
- Border radius: 6px
- Background: transparent
- Color: `#6a737d`
- Hover: Background `#f8f9fa`, color `#24292e`
- Active: Scale 0.95

## Layout Patterns

### Dashboard Layout
```
┌─────────────────────────────┐
│ Header (border bottom)      │
├─────────────────────────────┤
│                             │
│ Content (scrollable)        │
│ - Cards with 16px gap       │
│ - Padding: 20px             │
│                             │
└─────────────────────────────┘
```

### Connection Card Layout
```
┌─────────────────────────────┐
│ Title Row                   │
│ [Host]          [Badge]     │
│                             │
│ [Badge] [Badge]             │
│                             │
│ [Action] [Action] [Action]  │
└─────────────────────────────┘
```

## Animation Guidelines

### Timing
- **Fast**: 0.15s - Hover states, tooltips
- **Normal**: 0.2s - Modals, overlays
- **Slow**: 0.3s - Complex transitions

### Easing
Use `ease` for most animations. For more natural motion:
```css
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
```

### Common Animations
- **Fade in**: `opacity: 0 → 1`
- **Slide up**: `transform: translateY(10px) → translateY(0)`
- **Scale down**: `transform: scale(1) → scale(0.95)` (active states)

## Accessibility

### Color Contrast
- Text on backgrounds: Minimum 4.5:1 ratio
- Large text (18px+): Minimum 3:1 ratio
- UI components: Minimum 3:1 ratio

### Focus States
- All interactive elements must have visible focus
- Use `outline: 2px solid #0366d6; outline-offset: 2px;`
- Never remove focus styles without providing alternatives

### Keyboard Navigation
- All actions must be keyboard accessible
- Use semantic HTML elements
- Provide visible focus indicators

## Common Mistakes to Avoid

1. **Don't use em-dashes** in UI strings. Use periods, colons, or parentheses
2. **Don't mix font weights** inconsistently. Follow the type scale
3. **Don't skip spacing grid**. Always use multiples of 4px
4. **Don't use raw colors**. Always use CSS variables
5. **Don't forget hover states**. All interactive elements need hover feedback
6. **Don't ignore focus states**. Keyboard navigation is critical
7. **Don't use shadows excessively**. Reserve for elevation hierarchy
8. **Don't mix border radius**. Use the defined scale consistently

## CSS Variables Reference

All design tokens are available as CSS variables in `src/assets/styles/variables.css`:

```css
/* Colors */
var(--el-primary)
var(--el-primary-hover)
var(--el-primary-light)
var(--el-bg)
var(--el-surface)
var(--el-surface-subtle)
var(--el-border)
var(--el-border-strong)
var(--el-text)
var(--el-text-secondary)
var(--el-text-muted)
var(--el-danger)
var(--el-danger-hover)
var(--el-danger-light)
var(--el-success)
var(--el-success-light)
var(--el-warning)
var(--el-warning-light)

/* Spacing */
var(--el-radius-sm)
var(--el-radius)
var(--el-radius-lg)

/* Shadows */
var(--el-shadow-sm)
var(--el-shadow)
var(--el-shadow-lg)
```

## Examples

### Creating a New Card Component
```tsx
function MyCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-heading-row">
        <h3 className="card-title">{title}</h3>
      </div>
      {children}
    </div>
  )
}
```

### Creating a New Button Variant
```css
.btn-custom {
  color: var(--el-text);
  background: var(--el-surface-subtle);
  border-color: var(--el-border);
}

.btn-custom:not(:disabled):hover {
  background: var(--el-border);
  border-color: var(--el-text-muted);
}
```

### Creating a New Badge
```tsx
function StatusBadge({ status }: { status: "active" | "inactive" }) {
  const className = status === "active" ? "badge badge-success" : "badge badge-neutral"
  const label = status === "active" ? "Active" : "Inactive"
  
  return <span className={className}>{label}</span>
}
```

## Resources

- [Framer Plugin Documentation](https://www.framer.com/developers/plugins/)
- [Framer Brand Guidelines](https://www.framer.com/brand)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
