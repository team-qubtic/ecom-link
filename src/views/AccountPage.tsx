/**
 * AccountPage: profile, sign-in, and subscription skeleton (ported from the
 * telegram-commerce account page, restyled to this plugin's design system).
 *
 * The account backend (Qubtic sign-in and billing) is not wired up yet, so
 * the page renders the signed-out skeleton: profile hero, sign-in card, and
 * the plan overview. The sign-in action reports that the account service is
 * coming soon; when the auth client lands, `begin()` style handlers plug in
 * where handleSignIn sits today.
 */

import { useEffect, useState } from "react"
import {
  Check,
  ChevronLeft,
  CircleUserRound,
  Crown,
  KeyRound,
  Sparkles,
} from "lucide-react"

import pageStyles from "../assets/styles/module/Dashboard.module.css"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import accountStyles from "../assets/styles/module/Account.module.css"

interface AccountPageProps {
  /** Returns to the page the account was opened from. */
  onBack: () => void
}

/** Current plan perks shown in the subscription skeleton. */
const FREE_PLAN_FEATURES = [
  "One store connection",
  "Product catalog sync",
  "Two-way inventory",
]

/** Pro plan teaser shown until billing is wired up. */
const PRO_PLAN_FEATURES = [
  "AI content assist",
  "Scheduled syncs",
  "Priority support",
]

/** Render the account page skeleton. */
export function AccountPage({ onBack }: AccountPageProps) {
  const [notice, setNotice] = useState<string | null>(null)

  // Reset the transient notice when navigating back.
  useEffect(
    function clearNoticeOnUnmount() {
      return function cleanup() {
        setNotice(null)
      }
    },
    []
  )

  function handleSignIn() {
    setNotice("Account sign-in is coming soon. Your settings stay on this device.")
  }

  return (
    <main className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBrand}>
          <button
            type="button"
            className={accountStyles.backButton}
            onClick={onBack}
            aria-label="Go back"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <div className={pageStyles.headerText}>
            <h1 className={pageStyles.pageTitle}>Account</h1>
          </div>
        </div>
        <div className={pageStyles.headerActions}>
          <HelpTooltip text="Accounts sync your plan across devices. Sign-in arrives with the Qubtic account service, so your settings stay on this device for now." />
        </div>
      </header>

      <div className={pageStyles.pageContent}>
        {/* Profile hero: avatar, plan badge, identity. */}
        <section className={accountStyles.heroCard}>
          <div className={accountStyles.avatarWrap}>
            <span className={accountStyles.avatarCircle} aria-hidden="true">
              <CircleUserRound size={26} strokeWidth={1.6} />
            </span>
            <span className={`${accountStyles.planBadge} ${accountStyles.planBadgeFree}`}>
              Free
            </span>
          </div>
          <h2 className={accountStyles.userName}>Guest</h2>
          <p className={accountStyles.userEmail}>Not signed in yet</p>
        </section>

        {/* Sign-in card: skeleton until the Qubtic auth client is wired up. */}
        <section className={pageStyles.section} aria-labelledby="signin-heading">
          <h2 className={pageStyles.sectionTitle} id="signin-heading">
            Get started
          </h2>
          <div className={accountStyles.signinCard}>
            <span className={accountStyles.signinIcon} aria-hidden="true">
              <KeyRound size={20} strokeWidth={1.8} />
            </span>
            <h3 className={accountStyles.signinTitle}>Sign in to Qubtic</h3>
            <p className={accountStyles.signinHelp}>
              Create your Qubtic account to sync your plan across devices and
              unlock Pro features.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={handleSignIn}
            >
              Create account / Sign in
            </button>
            {notice ? (
              <p className={accountStyles.signinNotice} role="status">
                {notice}
              </p>
            ) : null}
          </div>
        </section>

        {/* Subscription: current plan plus the Pro teaser. */}
        <section className={pageStyles.section} aria-labelledby="plan-heading">
          <h2 className={pageStyles.sectionTitle} id="plan-heading">
            Your subscription
          </h2>
          <div className={accountStyles.planGrid}>
            <div className={`${accountStyles.planCard} ${accountStyles.planCardCurrent}`}>
              <div className={accountStyles.planCardHead}>
                <span className={accountStyles.planName}>Free</span>
                <span className="badge badge-neutral">Current</span>
              </div>
              <ul className={accountStyles.planFeatures}>
                {FREE_PLAN_FEATURES.map(function renderFeature(feature) {
                  return (
                    <li key={feature} className={accountStyles.planFeature}>
                      <Check size={13} aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className={accountStyles.planCard}>
              <div className={accountStyles.planCardHead}>
                <span className={`${accountStyles.planName} ${accountStyles.planNamePro}`}>
                  <Crown size={13} aria-hidden="true" />
                  Pro
                </span>
                <span className="badge badge-warning">Coming soon</span>
              </div>
              <ul className={accountStyles.planFeatures}>
                {PRO_PLAN_FEATURES.map(function renderFeature(feature) {
                  return (
                    <li key={feature} className={accountStyles.planFeature}>
                      <Sparkles size={13} aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                className="btn btn-secondary btn-small btn-block"
                onClick={handleSignIn}
                disabled
              >
                Upgrade
              </button>
            </div>
          </div>
        </section>

        <footer className={pageStyles.pageFooter}>
          Ecom-Link · More apps from Qubtic are on the way.
        </footer>
      </div>
    </main>
  )
}
