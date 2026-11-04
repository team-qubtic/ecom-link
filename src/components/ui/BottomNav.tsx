/**
 * BottomNav: floating bottom navigation bar.
 *
 * The active item renders as a gradient pill whose label slides open
 * horizontally (the label is always in the DOM and animates from zero
 * width, see BottomNav.module.css); inactive items render as icon-only
 * ghost buttons. Items are configured in src/config/navigation.json: add
 * or remove an entry there to change the nav bar, then register any new
 * icon name in NAV_ICONS below.
 */

import navigationConfig from "../../config/navigation.json"
import { NAV_ICONS } from "../../config/navIcons"
import styles from "../../assets/styles/module/BottomNav.module.css"

/** One nav item as declared in navigation.json. */
interface NavItemConfig {
  id: string
  label: string
  icon: string
}

const NAV_ITEMS = navigationConfig.items as NavItemConfig[]

interface BottomNavProps {
  /** Id of the currently active item, matching navigation.json. */
  currentView: string
  /** Called with the item id when the user taps a nav item. */
  onNavigate: (view: string) => void
}

/** Render the floating bottom navigation bar. */
export function BottomNav({ currentView, onNavigate }: BottomNavProps) {
  return (
    <nav className={styles.bottomNav} aria-label="Main navigation">
      <div className={styles.navBar}>
        {NAV_ITEMS.map(function renderItem(item) {
          const Icon = NAV_ICONS[item.icon]
          const active = item.id === currentView
          if (!Icon) {
            return null
          }
          return (
						<button
							key={item.id}
							type="button"
							className={
								active
									? `${styles.navItem} ${styles.navItemActive}`
									: styles.navItem
							}
							onClick={function handleClick() {
								onNavigate(item.id);
							}}
							aria-current={active ? "page" : undefined}
							aria-label={active ? undefined : item.label}
							title={item.label}
						>
							<Icon
								size={14}
								strokeWidth={active ? 2.2 : 1.8}
								aria-hidden="true"
							/>
							{/* Always rendered so the label can slide open horizontally;
                  hidden from assistive tech when the icon-only state already
                  carries the name via aria-label. */}
              <span
                className={styles.navItemLabel}
                aria-hidden={active ? undefined : true}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
