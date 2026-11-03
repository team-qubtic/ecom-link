/**
 * ConnectionModal: add or edit a store connection (spec 002).
 *
 * Flow: normalize the URL and check required fields locally, save through
 * the storage layer (which validates against the store through the provider
 * contract), then optionally probe write access when two-way sync is on.
 * Views never call the platform APIs directly; storage and the provider
 * contract do all of that.
 *
 * Upgrading a saved read connection to two-way (spec 004) requires fresh
 * read and write keys: blank key fields are rejected so the stored read
 * keys are never silently reused.
 */

import { useState } from "react"
import { Modal } from "../components/ui/Modal"
import { Switch } from "../components/ui/Switch"
import { HelpTooltip } from "../components/ui/HelpTooltip"
import { Field } from "../components/ui/Field"
import {
  CredentialFields,
  type CredentialErrors,
  type CredentialValues,
} from "../components/connection/CredentialFields"
import { CorsError, RateLimitError } from "../providers"
import {
  checkConnectionWriteAccess,
  normalizeStoreUrl,
  saveConnection,
  ConnectionValidationError,
  type ConnectionRecord,
  type KeyScope,
  type ValidationState,
} from "../storage/connections"

import connectionModalStyles from "../assets/styles/module/ConnectionModal.module.css"

/** Friendly labels for validation states. Raw enum values never show (rule 4). */
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
 * Turn any thrown error into one actionable sentence. Spec 007 will
 * centralize this mapping for the whole plugin; this covers the connection
 * flow until then.
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

interface ConnectionModalProps {
  /** Connection being edited, or null when adding a new one. */
  connection: ConnectionRecord | null
  onClose: () => void
  /** Called with the saved record so the dashboard can refresh. */
  onSaved: (record: ConnectionRecord) => void
}

/** Render the connect/edit connection modal with validation feedback. */
export function ConnectionModal({
  connection,
  onClose,
  onSaved,
}: ConnectionModalProps) {
  const [values, setValues] = useState<CredentialValues>({
    storeUrl: connection?.storeUrl ?? "",
    consumerKey: "",
    consumerSecret: "",
  })
  const [keyScope, setKeyScope] = useState<KeyScope>(
    connection?.keyScope ?? "read"
  )
  const [companionUrl, setCompanionUrl] = useState(
    connection?.companionPluginUrl ?? ""
  )
  const [errors, setErrors] = useState<CredentialErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [failureMessage, setFailureMessage] = useState<string | null>(null)
  const [corsBlocked, setCorsBlocked] = useState(false)
  const [savedRecord, setSavedRecord] = useState<ConnectionRecord | null>(null)
  const [writeBlocked, setWriteBlocked] = useState(false)

  function handleChange(name: keyof CredentialValues, value: string) {
    setValues(function update(previous) {
      return { ...previous, [name]: value }
    })
  }

  function handleTwoWayChange(next: boolean) {
    setKeyScope(next ? "read_write" : "read")
  }

  function handleCompanionUrl(value: string) {
    setCompanionUrl(value)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
    // Upgrading a saved read connection to two-way needs fresh keys: the
    // stored ones can only read, and blank fields would silently reuse them.
    if (connection && connection.keyScope === "read" && keyScope === "read_write") {
      if (values.consumerKey.trim() === "") {
        nextErrors.consumerKey = "Enter a consumer key with read and write permission."
      }
      if (values.consumerSecret.trim() === "") {
        nextErrors.consumerSecret =
          "Enter a consumer secret with read and write permission."
      }
    }
    if (nextErrors.storeUrl || nextErrors.consumerKey || nextErrors.consumerSecret) {
      setErrors(nextErrors)
      return
    }
    // The guard above returned on failure, so the ok branch carries the URL.
    const storeUrl = normalized.ok ? normalized.url : values.storeUrl.trim()
    setErrors({})
    setSubmitting(true)
    try {
      const saved = await saveConnection({
        id: connection?.id,
        providerId: connection?.providerId ?? "woocommerce",
        storeUrl,
        consumerKey: values.consumerKey.trim() || undefined,
        consumerSecret: values.consumerSecret.trim() || undefined,
        keyScope,
        companionPluginUrl: companionUrl.trim() || null,
      })
      setSavedRecord(saved)
      onSaved(saved)
      if (keyScope === "read_write") {
        // Preflight probe: warn before the merchant relies on write-back.
        const allowed = await checkConnectionWriteAccess(saved.id)
        setWriteBlocked(!allowed)
        if (allowed) {
          onClose()
        }
      } else {
        onClose()
      }
    } catch (error) {
      if (error instanceof ConnectionValidationError && error.fieldName) {
        setErrors({ [error.fieldName]: error.message })
      }
      setFailureMessage(formatErrorSentence(error))
      if (error instanceof CorsError) {
        setCorsBlocked(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const editing = connection !== null
  const upgradingKeys =
    editing &&
    connection !== null &&
    connection.keyScope === "read" &&
    keyScope === "read_write"
  const savedMasks = connection
    ? {
        consumerKey: connection.consumerKeyMasked,
        consumerSecret: connection.consumerSecretMasked,
      }
    : null
  const showCompanionField =
    corsBlocked ||
    companionUrl.trim() !== "" ||
    keyScope === "read_write" ||
    Boolean(connection?.companionPluginUrl)
  const submitLabel = submitting
    ? "Checking\u2026"
    : failureMessage
      ? "Try again"
      : editing
        ? "Save changes"
        : "Connect store"
  const finishedWithWarning = savedRecord !== null && writeBlocked

  return (
    <Modal
      title={editing ? "Edit Store Connection" : "Connect Store"}
      onClose={onClose}
      footer={
        finishedWithWarning ? (
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="connection-form"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitLabel}
            </button>
          </>
        )
      }
    >
      <form id="connection-form" className={connectionModalStyles.connectionForm} onSubmit={handleSubmit}>
        <CredentialFields
          values={values}
          errors={errors}
          onChange={handleChange}
          savedMasks={savedMasks}
          disabled={submitting}
        />
        <div className="toggle-row">
          <Switch
            checked={keyScope === "read_write"}
            onChange={handleTwoWayChange}
            label="Two-way sync"
            disabled={submitting}
          />
          <HelpTooltip text="Two-way sync sends your Framer edits back to the store. It needs keys with read and write permission, and every change is previewed before it is sent." />
        </div>
        {upgradingKeys ? (
          <div className="notice notice-warning" role="status">
            <h3 className="notice-title">Read and Write Keys Needed</h3>
            <p>
              Your saved keys can only read the store. Create a key with read
              and write permission in WooCommerce under Settings, Advanced,
              REST API, then paste the new key and secret here. Saving replaces
              the stored keys.
            </p>
          </div>
        ) : null}
        {showCompanionField ? (
          <Field
            id="connection-companion-url"
            label="Companion plugin URL"
            type="url"
            value={companionUrl}
            onChange={handleCompanionUrl}
            placeholder="https://store.example.com"
            helpText="The address of the store where the companion plugin is installed."
            disabled={submitting}
          />
        ) : null}
        {failureMessage ? (
          <div className="notice notice-error" role="alert">
            <p>{failureMessage}</p>
          </div>
        ) : null}
        {corsBlocked ? (
          <div className="notice notice-warning" role="status">
            <h3 className="notice-title">Connection Blocked by the Browser</h3>
            <p>
              WooCommerce does not allow direct browser requests by default.
              Install the free companion plugin to let the plugin talk to your
              store.
            </p>
            <ol className="notice-steps">
              <li>Install the Ecom-Link companion plugin on your WordPress site.</li>
              <li>Paste the companion plugin URL in the field above.</li>
              <li>Select Try again to check the connection.</li>
            </ol>
          </div>
        ) : null}
        {writeBlocked ? (
          <div className="notice notice-warning" role="status">
            <h3 className="notice-title">Two-Way Sync Blocked</h3>
            <p>
              The connection works, but the store does not allow browser
              updates (a CORS preflight check failed). Install the companion
              plugin on your store to enable two-way sync. Products can still
              sync one way.
            </p>
          </div>
        ) : null}
      </form>
    </Modal>
  )
}
