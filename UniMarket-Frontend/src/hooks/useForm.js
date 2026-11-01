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

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    const nextValues = { ...values, [name]: type === 'checkbox' ? checked : value }
    setValues(nextValues)
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
    setTouched((current) => ({ ...current, [name]: true }))
    setErrors(validate(nextValues))
  }

  async function handleSubmit(event) {
    event.preventDefault()
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
      error: touched[name] ? errors[name] : undefined,
    }
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
      error: touched[name] ? errors[name] : undefined,
    }
  }

  return { values, errors, touched, isSubmitting, handleSubmit, getFieldProps, getCheckboxProps, setFieldValue, revalidate }
}
