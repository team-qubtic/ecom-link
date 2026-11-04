/**
 * ConnectionPage: full-page form for adding or editing a store connection.
 *
 * A single-column form with sectioned groups: platform row, store details,
 * credentials, and the two-way sync toggle with its companion endpoint
 * field. Actions sit in a sticky glass footer so they stay reachable while
 * the form scrolls.
 */

import { useState } from "react"
import { Switch } from "../components/ui/Switch"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import { Field } from "../components/ui/Field"
import { ArrowLeft, CheckCircle2, KeyRound, RefreshCw, Store } from "lucide-react"
import { BrandMark } from "../components/ui/BrandMark"
import {
  CredentialFields,
  type CredentialErrors,
  type CredentialValues,
} from "../components/connection/CredentialFields"
import { CorsError, RateLimitError } from "../providers"
import { useCanEditCms } from "../lib/permissions"
import {
  CMS_PERMISSION_MESSAGE,
  checkConnectionWriteAccess,
  normalizeStoreUrl,
  saveConnection,
  ConnectionValidationError,
  type ConnectionRecord,
  type KeyScope,
  type ValidationState,
} from "../storage/connections"

import pageStyles from "../assets/styles/module/Dashboard.module.css"
import connectionPageStyles from "../assets/styles/module/ConnectionPage.module.css"

/** Friendly labels for validation states. */
export const CONNECTION_STATE_LABELS: Record<ValidationState, string> = {
  valid: "Connected",
  invalid: "Connection failed",
  unvalidated: "Not checked yet",
}

/** Friendly labels for key scopes. */
export const KEY_SCOPE_LABELS: Record<KeyScope, string> = {
  read: "Read only",
  read_write: "Read and write",
}

/**
 * Turn any thrown error into one actionable sentence.
 */
export function formatErrorSentence(error: unknown): string {
  if (error instanceof RateLimitError) {
    return "The store is limiting requests right now. Wait a moment, then try again."
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "Something went wrong. Try again."
}

interface ConnectionPageProps {
  /** Connection being edited, or null when adding a new one. */
  connection: ConnectionRecord | null
  onBack: () => void
  /** Called with the saved record so the dashboard can refresh. */
  onSaved: (record: ConnectionRecord) => void
}

/** Section heading row: small icon tile, label, optional help. */
function FormSectionHeader({
  icon,
  title,
  helpText,
}: {
  icon: React.ReactNode
  title: string
  helpText?: string
}) {
  return (
    <div className={connectionPageStyles.sectionHeader}>
      <span className={connectionPageStyles.sectionIcon} aria-hidden="true">
        {icon}
      </span>
      <h2 className={connectionPageStyles.sectionTitle}>{title}</h2>
      {helpText ? <HelpTooltip text={helpText} /> : null}
    </div>
  )
}

/** Render the connect/edit connection page with validation feedback. */
export function ConnectionPage({
  connection,
  onBack,
  onSaved,
}: ConnectionPageProps) {
  const [values, setValues] = useState<CredentialValues>({
    storeUrl: connection?.storeUrl ?? "",
    consumerKey: "",
    consumerSecret: "",
  })
  const [keyScope, setKeyScope] = useState<KeyScope>(
    connection?.keyScope ?? "read"
  )
  const [ companionUrl, setCompanionUrl] = useState(
    connection?.companionPluginUrl ?? ""
  )
  const [errors, setErrors] = useState<CredentialErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [failureMessage, setFailureMessage] = useState<string | null>(null)
  const [corsBlocked, setCorsBlocked] = useState(false)
  const [savedRecord, setSavedRecord] = useState<ConnectionRecord | null>(null)
  const [writeBlocked, setWriteBlocked] = useState(false)
  // Reactive CMS permission: Framer denies protected calls per account, so
  // the save button and a notice must reflect what the host allows now.
  const canEditCms = useCanEditCms()

  function handleChange(name: keyof CredentialValues, value: string) {
    setValues(function update(previous) {
      return { ...previous, [name]: value }
    })
  }

  function handleTwoWayChange(next: boolean) {
    setKeyScope(next ? "read_write" : "read")
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFailureMessage(null)
    setCorsBlocked(false)
    setWriteBlocked(false)
    setSavedRecord(null)
    // Local, instant checks: URL shape and, for new connections, non-empty keys.
    const nextErrors: CredentialErrors = {}
    const normalized = normalizeStoreUrl(values.storeUrl)
    if (!normalized.ok) {
      nextErrors.storeUrl = normalized.message
    }
    if (!connection) {
      if (values.consumerKey.trim() === "") {
        nextErrors.consumerKey = "Enter the consumer key from WooCommerce."
      }
      if (values.consumerSecret.trim() === "") {
        nextErrors.consumerSecret = "Enter the consumer secret from WooCommerce."
      }
    }
    if (
      nextErrors.storeUrl ||
      nextErrors.consumerKey ||
      nextErrors.consumerSecret
    ) {
      setErrors(nextErrors)
      return
    }
    // The guard above returned on failure, so the ok branch carries the URL.
    const storeUrl = normalized.ok ? normalized.url : values.storeUrl.trim()
    setErrors({})
    setSubmitting(true)

    try {
      const record = await saveConnection({
        id: connection?.id,
        providerId: connection?.providerId ?? "woocommerce",
        storeUrl,
        consumerKey: values.consumerKey.trim() || undefined,
        consumerSecret: values.consumerSecret.trim() || undefined,
        keyScope,
        companionPluginUrl: companionUrl.trim() || null,
      })
      setSavedRecord(record)
      onSaved(record)
      if (keyScope === "read_write" && record.companionPluginUrl) {
        // Preflight probe through the saved item. Returns false when the
        // store cannot answer preflights, so the merchant is warned before
        // relying on write-back.
        setWriteBlocked(!(await checkConnectionWriteAccess(record.id)))
      }
    } catch (error) {
      if (error instanceof CorsError) {
        setCorsBlocked(true)
        setFailureMessage(
          "The browser blocked the request. Install the companion plugin or enable CORS on your store."
        )
      } else {
        if (error instanceof ConnectionValidationError && error.fieldName) {
          setErrors({ [error.fieldName]: error.message })
        }
        setFailureMessage(formatErrorSentence(error))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isEdit = connection !== null
  const pageTitle = isEdit ? "Edit Connection" : "Connect Store"

  return (
    <div className={connectionPageStyles.connectionPage}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBrand}>
          <button
            type="button"
            className={connectionPageStyles.backButton}
            onClick={onBack}
            disabled={submitting}
            aria-label="Go back"
          >
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
          <div className={pageStyles.headerText}>
            <h1 className={pageStyles.pageTitle}>{pageTitle}</h1>
          </div>
        </div>
        <HelpTooltip text="Generate API keys in WooCommerce under Settings, Advanced, REST API." />
      </header>

      <form
        id="connect-store-form"
        className={connectionPageStyles.connectionPageForm}
        onSubmit={handleSubmit}
      >
        {/* Platform row: shows what is being connected. */}
        <div className={connectionPageStyles.platformRow}>
          <BrandMark provider={connection?.providerId ?? "woocommerce"} size={32} />
          <div className={connectionPageStyles.platformInfo}>
            <span className={connectionPageStyles.platformName}>
              WooCommerce
            </span>
            <span className={connectionPageStyles.platformHint}>
              {isEdit ? "Connected platform" : "Available now"}
            </span>
          </div>
          {savedRecord ? (
            <span className="badge badge-success">
              <CheckCircle2 size={11} aria-hidden="true" />
              Saved
            </span>
          ) : (
            <span className="badge badge-primary">Step 1 of 1</span>
          )}
        </div>

        <section className={connectionPageStyles.formSection}>
          <FormSectionHeader
            icon={<Store size={13} aria-hidden="true" />}
            title="Store"
            helpText="Where your WooCommerce store lives."
          />
          <Field
            id="storeUrl"
            label="Store URL"
            value={values.storeUrl}
            onChange={(value) => handleChange('storeUrl', value)}
            type="url"
            placeholder="https://store.example.com"
            helpText="The full URL of your WooCommerce store."
            error={errors.storeUrl}
            disabled={submitting}
            autoComplete="url"
          />
        </section>

        <section className={connectionPageStyles.formSection}>
          <FormSectionHeader
            icon={<KeyRound size={13} aria-hidden="true" />}
            title="API credentials"
            helpText="Generate these in WooCommerce → Settings → Advanced → REST API."
          />
          <CredentialFields
            values={values}
            onChange={handleChange}
            errors={errors}
            disabled={submitting}
            savedMasks={
              connection
                ? {
                      consumerKey: connection.consumerKeyMasked,
                      consumerSecret: connection.consumerSecretMasked,
                  }
                : null
            }
          />
        </section>

        {/* Two-way sync: setting row + conditional companion endpoint. */}
        <section className={connectionPageStyles.formSection}>
          <div className={connectionPageStyles.settingCard}>
            <div className={connectionPageStyles.settingHeader}>
              <span
                className={`${connectionPageStyles.sectionIcon} ${connectionPageStyles.sectionIconAccent}`}
                aria-hidden="true"
              >
                <RefreshCw size={13} />
              </span>
              <div className={connectionPageStyles.settingText}>
                <h2 className={connectionPageStyles.sectionTitle}>
                  Two-way sync
                </h2>
                <p className={connectionPageStyles.settingDescription}>
                  Push product edits from Framer back to your store.
                </p>
              </div>
              <Switch
                checked={keyScope === 'read_write'}
                onChange={handleTwoWayChange}
                ariaLabel='Two-way sync'
                disabled={submitting}
              />
            </div>

            {keyScope === 'read_write' ? (
              <div className={connectionPageStyles.settingBody}>
                <Field
                  id='companionUrl'
                  label='Companion plugin URL'
                  value={companionUrl}
                  onChange={(value) =>
                      setCompanionUrl(value)
                  }
                  type='url'
                  placeholder='https://store.example.com/wp-json/ecom-link/v1'
                  helpText='The REST API endpoint of the companion WordPress plugin.'
                  error={errors.companionUrl}
                  disabled={submitting}
                />
              </div>
            ) : null}
          </div>
        </section>

        {!canEditCms ? (
            <div
                className='notice notice-error'
                role='alert'>
            <h3 className='notice-title'>CMS Editing Blocked</h3>
            <p>{CMS_PERMISSION_MESSAGE}</p>
          </div>
        ) : null}

        {failureMessage ? (
            <div
                className='notice notice-error'
                role='alert'>
            <h3 className='notice-title'>Connection failed</h3>
            <p>{failureMessage}</p>
          </div>
        ) : null}

        {corsBlocked ? (
            <div
                className='notice notice-warning'
                role='status'>
            <h3 className='notice-title'>
                Connection Blocked by the Browser
            </h3>
            <p>
              WooCommerce does not allow direct browser requests by
              default. Install the free companion plugin to let the
              plugin talk to your store.
            </p>
            <ol className='notice-steps'>
              <li>
                  Download the companion plugin from the Ecom-Link
                  documentation.
              </li>
              <li>
                  Install and activate it on your WordPress site.
              </li>
              <li>
                  Copy the companion URL shown after activation and
                  paste it into the Two-way sync field.
              </li>
            </ol>
          </div>
        ) : null}

        {writeBlocked ? (
            <div
                className='notice notice-warning'
                role='status'>
            <h3 className='notice-title'>Two-Way Sync Blocked</h3>
            <p>
                The companion plugin did not respond. Two-way sync
                will not work until the endpoint is reachable.
            </p>
          </div>
        ) : null}

        {savedRecord ? (
            <div
                className='notice notice-success'
                role='status'>
            <h3 className='notice-title'>Connection saved</h3>
            <p>
                Your store is connected. You can now sync products
                from your WooCommerce catalog.
            </p>
          </div>
        ) : null}
      </form>

      {/* Sticky action bar: always reachable while the form scrolls. */}
      <footer className={pageStyles.formActions}>
        <button
          type='button'
          className='btn btn-secondary'
          onClick={onBack}
          disabled={submitting}>
          Cancel
        </button>
        <button
          type='submit'
          form='connect-store-form'
          className='btn btn-primary'
          disabled={submitting || !canEditCms}>
          {submitting
              ? 'Connecting...'
              : isEdit
                ? 'Save changes'
                : 'Connect store'}
      </button>
      </footer>
    </div>
  );
}
