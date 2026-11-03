/**
 * CredentialFields: the consumer key and secret inputs shared by every
 * connection form. Views render the store URL field themselves, so its layout
 * can differ between the page and modal flows.
 *
 * Reusable for both add and edit flows. In edit mode, savedMasks renders a
 * "leave empty to keep" placeholder so stored secrets never round-trip into
 * component state.
 */

import { Field } from "../ui/Field"

import credentialStyles from "../../assets/styles/module/CredentialFields.module.css"

export interface CredentialValues {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
}

export interface CredentialErrors {
  storeUrl?: string
  consumerKey?: string
  consumerSecret?: string
  /** Companion plugin URL error, set by views that collect the URL. */
  companionUrl?: string
}

interface CredentialFieldsProps {
  values: CredentialValues
  errors: CredentialErrors
  /** Called with the field name and its new value on every keystroke. */
  onChange: (name: keyof CredentialValues, value: string) => void
  /** When present (edit mode), empty inputs keep the stored secrets. */
  savedMasks?: { consumerKey: string; consumerSecret: string } | null
  disabled?: boolean
}

/**
 * Render the consumer key and secret inputs with consistent labels, help
 * text, and error slots.
 */
export function CredentialFields({
  values,
  errors,
  onChange,
  savedMasks = null,
  disabled = false,
}: CredentialFieldsProps) {
  function handleConsumerKey(value: string) {
    onChange("consumerKey", value)
  }

  function handleConsumerSecret(value: string) {
    onChange("consumerSecret", value)
  }

  return (
    <div className={credentialStyles.credentialFields}>
      <Field
        id="connection-consumer-key"
        label="Consumer key"
        type="password"
        value={values.consumerKey}
        onChange={handleConsumerKey}
        placeholder={
          savedMasks
            ? `Leave empty to keep ${savedMasks.consumerKey}.`
            : "ck_1234567890abcdef"
        }
        helpText="Create API keys in WooCommerce under Settings, Advanced, REST API."
        error={errors.consumerKey}
        disabled={disabled}
        autoComplete="off"
      />
      <Field
        id="connection-consumer-secret"
        label="Consumer secret"
        type="password"
        value={values.consumerSecret}
        onChange={handleConsumerSecret}
        placeholder={
          savedMasks
            ? `Leave empty to keep ${savedMasks.consumerSecret}.`
            : "cs_1234567890abcdef"
        }
        helpText="The secret shown next to your consumer key."
        error={errors.consumerSecret}
        disabled={disabled}
        autoComplete="off"
      />
    </div>
  )
}
