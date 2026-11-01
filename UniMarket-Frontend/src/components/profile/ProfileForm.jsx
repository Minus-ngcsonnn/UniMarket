import { useState } from 'react'
import { CAMPUSES, CAMPUS_KEYS, UNIVERSITY_NAME } from '../../constants/product'
import useForm from '../../hooks/useForm'
import { accountService } from '../../services/account/accountService'
import { PROFILE_LIMITS, validateProfile } from '../../utils/profileValidation'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'

const CAMPUS_OPTIONS = CAMPUS_KEYS.map((key) => ({ value: key, label: `${UNIVERSITY_NAME} · ${CAMPUSES[key].label}` }))

/**
 * Edit the public profile (name, programme, campus, bio). The email is changed through verification,
 * not here. Until the backend exists, saving is a preview: nothing is stored.
 * @param {() => void} onCancel
 */
export default function ProfileForm({ profile, onCancel }) {
  const [result, setResult] = useState(null) // { saved } | { error }

  const form = useForm({
    initialValues: { name: profile.name, programme: profile.programme ?? '', campus: profile.campus, bio: profile.bio ?? '' },
    validate: validateProfile,
    onSubmit: async (values) => {
      setResult(null)
      try {
        setResult(await accountService.updateProfile(values))
      } catch (saveError) {
        setResult({ error: saveError.message })
      }
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <Input label="Display name" required maxLength={PROFILE_LIMITS.name} hint="Your real name helps buyers and sellers trust you." {...form.getFieldProps('name')} />
      <Input label="Programme and year" maxLength={PROFILE_LIMITS.programme} placeholder="e.g. Software Engineering · Year 2" {...form.getFieldProps('programme')} />
      <Select
        label="Campus"
        name="campus"
        options={CAMPUS_OPTIONS}
        value={form.values.campus}
        onChange={(campus) => form.setFieldValue('campus', campus)}
        error={form.touched.campus ? form.errors.campus : undefined}
      />
      <Textarea label="About you" rows={4} maxLength={PROFILE_LIMITS.bio} placeholder="What do you usually sell? When do you reply?" hint="Don’t share phone numbers or bank details. Keep all payments on UniMarket." {...form.getFieldProps('bio')} />

      <div aria-live="polite" className="empty:hidden">
        {result?.error && <Alert variant="danger">{result.error}</Alert>}
        {result && !result.error && (
          <Alert variant={result.saved ? 'success' : 'warning'} title={result.saved ? 'Profile saved' : 'Preview only: changes not saved'}>
            {result.saved ? 'Other students now see your updated profile.' : 'Your changes are valid. Saving will work once the UniMarket backend and sign-in are connected.'}
          </Alert>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        <Button type="submit" loading={form.isSubmitting}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
