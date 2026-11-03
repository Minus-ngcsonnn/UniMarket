import { useState } from 'react'

/**
 * Minimal form state + validation helper.
 *
 * Errors appear for a field after it is blurred (touched) or after a submit attempt,
 * so users are not shown errors while typing for the first time.
 *
 * @param {object} options
 * @param {object} options.initialValues e.g. { email: '', password: '' }
 * @param {(values: object) => object} options.validate returns { fieldName: message } for invalid fields
 * @param {(values: object) => (void|Promise<void>)} options.onSubmit called only when validation passes
 */
export default function useForm({ initialValues, validate, onSubmit }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Errors returned by the server for specific fields; each one disappears when its field changes.
  const [serverErrors, setServerErrorsState] = useState({})

  function clearServerError(name) {
    setServerErrorsState((current) => {
      if (!(name in current)) return current
      const rest = { ...current }
      delete rest[name]
      return rest
    })
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    const nextValues = { ...values, [name]: type === 'checkbox' ? checked : value }
    setValues(nextValues)
    clearServerError(name)
    // Re-validate live only after the field has been touched, so fixes are confirmed immediately.
    if (touched[name]) setErrors(validate(nextValues))
  }

  function handleBlur(event) {
    const { name } = event.target
    setTouched((current) => ({ ...current, [name]: true }))
    setErrors(validate(values))
  }

  /**
   * Sets a value from a custom control (photo uploader, Select, radio group) and marks it touched,
   * so its error updates immediately.
   */
  function setFieldValue(name, value) {
    const nextValues = { ...values, [name]: value }
    setValues(nextValues)
    clearServerError(name)
    setTouched((current) => ({ ...current, [name]: true }))
    setErrors(validate(nextValues))
  }

  /** Sets several values at once (e.g. a choice that changes related fields) and marks them touched. */
  function setFieldValues(partial) {
    const nextValues = { ...values, ...partial }
    setValues(nextValues)
    Object.keys(partial).forEach(clearServerError)
    setTouched((current) => ({ ...current, ...Object.fromEntries(Object.keys(partial).map((name) => [name, true])) }))
    setErrors(validate(nextValues))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (isSubmitting) return // ignore double submits while a request is running
    const form = event.currentTarget
    const nextErrors = validate(values)
    setErrors(nextErrors)
    setTouched(Object.fromEntries(Object.keys(values).map((name) => [name, true])))

    const firstInvalidField = Object.keys(values).find((name) => nextErrors[name])
    if (firstInvalidField) {
      const element = form.elements.namedItem(firstInvalidField)
      // Radio groups return a RadioNodeList: focus its first option.
      const target = element instanceof RadioNodeList ? element[0] : element
      target?.focus()
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(values)
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Props to spread onto <Input>/<PasswordInput>: name, value, onChange, onBlur, error. */
  function getFieldProps(name) {
    return {
      name,
      value: values[name],
      onChange: handleChange,
      onBlur: handleBlur,
      error: (touched[name] ? errors[name] : undefined) ?? serverErrors[name],
    }
  }

  /**
   * Shows errors returned by the server, e.g. { email: 'An account with this email already exists.' }.
   * Field names must match the form's value names; each error disappears when its field changes.
   */
  function setServerErrors(fieldErrors) {
    setServerErrorsState(fieldErrors ?? {})
  }

  /**
   * Re-runs validation on the current values, e.g. after a rule changes.
   * Pass the new validate function when the rule depends on state that has not re-rendered yet.
   */
  function revalidate(validateFn = validate) {
    setErrors(validateFn(values))
  }

  /** Props to spread onto <Checkbox>: name, checked, onChange, onBlur, error. */
  function getCheckboxProps(name) {
    return {
      name,
      checked: Boolean(values[name]),
      onChange: handleChange,
      onBlur: handleBlur,
      error: (touched[name] ? errors[name] : undefined) ?? serverErrors[name],
    }
  }

  /** Current error of any field (client rule after a touch / submit, otherwise the server's). */
  function getError(name) {
    return (touched[name] ? errors[name] : undefined) ?? serverErrors[name]
  }

  return { values, errors, touched, isSubmitting, handleSubmit, getFieldProps, getCheckboxProps, setFieldValue, setFieldValues, revalidate, setServerErrors, getError }
}
