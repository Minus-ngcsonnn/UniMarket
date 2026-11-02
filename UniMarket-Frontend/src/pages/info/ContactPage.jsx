import { useState } from 'react'
import { Link } from 'react-router'
import ContentPage from '../../components/content/ContentPage'
import { MailIcon, UserIcon } from '../../components/icons'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import useForm from '../../hooks/useForm'
import useTranslation from '../../i18n/useTranslation'
import { PATHS } from '../../routes/paths'
import { isBlank, isValidEmail } from '../../utils/validators'

const TOPICS = [
  { value: 'order', label: 'A problem with an order' },
  { value: 'listing', label: 'A question about a listing' },
  { value: 'report', label: 'Report a listing or user' },
  { value: 'account', label: 'My account or verification' },
  { value: 'other', label: 'Something else' },
]
const MESSAGE_MAX = 1000

function validateContact({ name, email, topic, message }) {
  const errors = {}
  if (isBlank(name)) errors.name = 'Please tell us your name.'
  if (isBlank(email)) errors.email = 'Email address is required so we can reply.'
  else if (!isValidEmail(email)) errors.email = 'Enter a valid email address.'
  if (isBlank(topic)) errors.topic = 'Choose what your message is about.'
  if (isBlank(message)) errors.message = 'Please write your message.'
  else if (message.trim().length < 15) errors.message = 'Add a little more detail so we can help.'
  return errors
}

/** Contact support. The support inbox needs the backend, so a valid message is not sent yet (and says so). */
export default function ContactPage() {
  const { t } = useTranslation()
  const [result, setResult] = useState(null)
  const form = useForm({
    initialValues: { name: '', email: '', topic: '', reference: '', message: '' },
    validate: validateContact,
    onSubmit: () => setResult('pending'),
  })

  return (
    <ContentPage eyebrow="Contact us" title="Get in touch" intro="Questions about an order, a listing or your account? Send us a message.">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="Your name" autoComplete="name" startIcon={<UserIcon className="size-4.5" />} {...form.getFieldProps('name')} />
            <Input label="Email address" type="email" autoComplete="email" placeholder="you@example.com" startIcon={<MailIcon className="size-4.5" />} {...form.getFieldProps('email')} />
          </div>
          <Select
            label="Topic"
            name="topic"
            placeholder={t('Choose a topic')}
            options={TOPICS}
            value={form.values.topic}
            onChange={(topic) => form.setFieldValue('topic', topic)}
            error={form.touched.topic ? form.errors.topic : undefined}
          />
          <Input label="Order number or listing ID (optional)" placeholder={t('e.g. UO-3001 or UM-2048')} {...form.getFieldProps('reference')} />
          <Textarea label="Message" rows={6} maxLength={MESSAGE_MAX} placeholder={t('Tell us what happened and how we can help.')} {...form.getFieldProps('message')} />
          <Button type="submit" size="lg" className="sm:w-fit" loading={form.isSubmitting}>
            {t('Send message')}
          </Button>
          {result && (
            <Alert variant="info" title="Messages can’t be sent yet">
              Your message looks good, but the support inbox will be connected together with the UniMarket backend. Nothing was sent.
            </Alert>
          )}
        </form>

        <aside className="flex flex-col gap-4">
          <div className="rounded-card bg-subtle p-5">
            <p className="font-semibold text-ink">{t('Quick answers')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('Many questions about orders, payments and selling are answered in the Help center.')}</p>
            <Link to={PATHS.help} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
              {t('Visit the Help center')} →
            </Link>
          </div>
          <div className="rounded-card bg-subtle p-5">
            <p className="font-semibold text-ink">{t('Feeling unsafe?')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('If you’re in danger on campus, contact campus security first. Then tell us what happened.')}</p>
            <Link to={PATHS.safety} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
              {t('Safety tips')} →
            </Link>
          </div>
        </aside>
      </div>
    </ContentPage>
  )
}
