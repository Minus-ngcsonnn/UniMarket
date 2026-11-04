import { useId, useState } from 'react'
import { REPORT_REASONS } from '../../constants/moderation'
import useForm from '../../hooks/useForm'
import { accountService } from '../../services/account/accountService'
import { REPORT_DETAILS_MAX, validateReport } from '../../utils/reviewValidation'
import { FlagIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import FieldError from '../ui/FieldError'
import Modal from '../ui/Modal'
import Textarea from '../ui/Textarea'
import useTranslation from '../../i18n/useTranslation'

/**
 * Report a listing or a student to the admins (Business Plan: admins handle violation reports).
 * A CONVERSATION report lets the admin who handles it read that chat.
 * @param {{ type: 'LISTING'|'USER'|'CONVERSATION', id: string|number, label: string }} target
 */
export default function ReportDialog({ target, onClose }) {
  const { t } = useTranslation()
  const titleId = useId()
  const reasonErrorId = `${titleId}-reason-error`
  const [result, setResult] = useState(null) // { saved }
  const [submitError, setSubmitError] = useState(null)

  const form = useForm({
    initialValues: { reason: '', details: '' },
    validate: validateReport,
    onSubmit: async (values) => {
      setSubmitError(null)
      try {
        setResult(await accountService.createReport({ targetType: target.type, targetId: target.id, ...values }))
      } catch (reportError) {
        setSubmitError(reportError.message)
      }
    },
  })
  const reasonError = form.touched.reason ? form.errors.reason : undefined

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
            <FlagIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {target.type === 'LISTING' ? t('Report this listing') : target.type === 'CONVERSATION' ? t('Report this conversation') : t('Report this student')}
            </h2>
            <p className="truncate text-sm text-ink-muted">{target.label}</p>
          </div>
        </div>

        {result ? (
          <Alert variant={result.saved ? 'success' : 'warning'} title={result.saved ? 'Report sent' : 'Preview only: report not sent'}>
            {result.saved
              ? 'Thanks. An admin will review it. You won’t see who handles it, but action is taken when rules are broken.'
              : 'Reporting will work once the UniMarket backend is connected. Nothing was sent and no admin was notified.'}
          </Alert>
        ) : (
          <form id={`${titleId}-form`} noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
            <fieldset aria-describedby={reasonError ? reasonErrorId : undefined} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-ink">{t("What’s wrong?")}</legend>
              {REPORT_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-2 has-focus-visible:ring-primary/30 ${
                    reasonError ? 'border-danger' : 'border-line hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={reason.value}
                    checked={form.values.reason === reason.value}
                    onChange={() => form.setFieldValue('reason', reason.value)}
                    className="size-4 accent-primary"
                  />
                  <span className="text-ink">{t(reason.label)}</span>
                </label>
              ))}
              <FieldError id={reasonErrorId}>{reasonError}</FieldError>
            </fieldset>
            <Textarea
              label={form.values.reason === 'OTHER' ? 'Details' : 'Details (optional)'}
              rows={3}
              maxLength={REPORT_DETAILS_MAX}
              placeholder={t("What happened? Admins see this with the report.")}
              {...form.getFieldProps('details')}
            />
            {submitError && <Alert variant="danger">{submitError}</Alert>}
            <p className="text-xs text-ink-muted">{t("False reports may lead to action on your account. In an emergency, contact campus security.")}</p>
          </form>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {result ? t('Close') : t('Cancel')}
          </Button>
          {!result && (
            <Button type="submit" form={`${titleId}-form`} variant="danger" loading={form.isSubmitting}>
              {t("Send report")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
