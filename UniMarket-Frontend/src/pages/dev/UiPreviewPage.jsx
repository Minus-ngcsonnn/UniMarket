import { useState } from 'react'
import PageContainer from '../../components/layout/PageContainer'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Input from '../../components/ui/Input'
import LoadingState from '../../components/ui/LoadingState'
import Pagination from '../../components/ui/Pagination'
import PasswordInput from '../../components/ui/PasswordInput'
import useForm from '../../hooks/useForm'
import { hasMinLength, isBlank, isValidEmail } from '../../utils/validators'

/**
 * DEVELOPMENT ONLY: visual catalogue of the shared UI components (route /dev/ui).
 * It is not registered in production builds. It is not a product screen.
 */
function validateSample(values) {
  const errors = {}
  if (isBlank(values.email)) errors.email = 'Email is required.'
  else if (!isValidEmail(values.email)) errors.email = 'Enter a valid email address.'
  if (isBlank(values.password)) errors.password = 'Password is required.'
  else if (!hasMinLength(values.password, 8)) errors.password = 'Password must be at least 8 characters.'
  return errors
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}

export default function UiPreviewPage() {
  const [submitted, setSubmitted] = useState(null)
  const [page, setPage] = useState(1)
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: validateSample,
    onSubmit: (values) => setSubmitted(values.email),
  })

  return (
    <PageContainer as="main" width="lg" className="flex flex-col gap-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">UI components</h1>
        <p className="text-sm text-ink-muted">Development preview of shared components. Not part of the product.</p>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Form fields and validation">
        <form noValidate onSubmit={form.handleSubmit} className="flex max-w-md flex-col gap-4">
          <Input label="Email" type="email" autoComplete="email" required hint="Format check only." {...form.getFieldProps('email')} />
          <PasswordInput label="Password" autoComplete="new-password" required {...form.getFieldProps('password')} />
          <Input label="Disabled field" value="Read only" disabled readOnly />
          <Button type="submit" loading={form.isSubmitting}>
            Validate
          </Button>
          {submitted && (
            <Alert variant="success" title="Validation passed">
              Sample value: {submitted}. Nothing was sent anywhere.
            </Alert>
          )}
        </form>
      </Section>

      <Section title="Pagination (128 items, 9 per page)">
        <div data-testid="pagination-demo">
          <Pagination page={page} pageSize={9} total={128} onPageChange={setPage} />
        </div>
      </Section>

      <Section title="Alerts">
        <Alert variant="info" title="Info">Informational message.</Alert>
        <Alert variant="success" title="Success">Action completed.</Alert>
        <Alert variant="warning" title="Warning">Something needs attention.</Alert>
        <Alert variant="danger" title="Error">Something failed.</Alert>
      </Section>

      <Section title="Loading, error and empty states">
        <div className="grid gap-4 md:grid-cols-3">
          <LoadingState />
          <ErrorState onRetry={() => {}} />
          <EmptyState title="No items yet" description="Items will appear here." />
        </div>
      </Section>
    </PageContainer>
  )
}
