import { AFFILIATION, UNIVERSITY_NAME_MAX_LENGTH } from '../../utils/authValidation'
import useAsyncData from '../../hooks/useAsyncData'
import { GraduationCapIcon } from '../icons'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Input from '../ui/Input'
import UniversityPicker from './UniversityPicker'
import useTranslation from '../../i18n/useTranslation'

/** The directory is ~45 kB: loaded only when the registration form is shown, in its own chunk. */
const loadDirectory = () => import('../../data/vnHigherEducationDirectory.json').then((module) => module.default.institutions)

/**
 * Registration affiliation (V003, nationwide). The student chooses EXACTLY ONE of:
 * - an official UniMarket campus (GET /api/campuses) → campusId;
 * - a university / academy / college from the Ministry-sourced directory → its canonical name as universityName
 *   (stored as self-declared — choosing from the list is not a student verification);
 * - "My university is not listed" → a name typed by hand → universityName.
 * Nothing is pre-selected and no campus is assigned automatically. (Registration no longer asks for a home area.)
 *
 * @param {object} form useForm() result with affiliationType, campusId, universityName, directoryId values
 * @param {{ data?: object[], error?: Error, isLoading: boolean, reload: () => void }} campuses
 */
export default function AffiliationFields({ form, campuses }) {
  const { t } = useTranslation()
  const directory = useAsyncData(loadDirectory, 'he-directory')
  const { affiliationType, campusId, universityName } = form.values

  let selection = null
  if (affiliationType === AFFILIATION.CAMPUS) {
    const campus = (campuses.data ?? []).find((c) => String(c.id) === String(campusId))
    selection = { kind: 'campus', label: campus ? `${campus.university} · ${campus.name}` : t('Official UniMarket campus') }
  } else if (affiliationType === AFFILIATION.DIRECTORY) {
    selection = { kind: 'directory', label: universityName }
  }

  function select(choice) {
    // One update: exactly one affiliation is ever set (never campusId and universityName together).
    form.setFieldValues({
      affiliationType:
        choice?.kind === 'campus' ? AFFILIATION.CAMPUS : choice?.kind === 'directory' ? AFFILIATION.DIRECTORY : choice?.kind === 'manual' ? AFFILIATION.UNIVERSITY : '',
      campusId: choice?.kind === 'campus' ? String(choice.campus.id) : '',
      directoryId: choice?.kind === 'directory' ? choice.institution.id : '',
      universityName: choice?.kind === 'directory' ? choice.institution.name : '',
    })
  }

  const pickerError = form.getError('affiliationType') ?? (affiliationType !== AFFILIATION.UNIVERSITY ? form.getError('campusId') : undefined)

  return (
    <div className="flex flex-col gap-4">
      {affiliationType === AFFILIATION.UNIVERSITY ? (
        <div className="flex flex-col gap-1.5">
          <Input
            label={t('University or college name')}
            placeholder={t('e.g. Trường Đại học Cần Thơ')}
            hint={t('Shown on your profile as self-declared. UniMarket does not verify enrolment.')}
            maxLength={UNIVERSITY_NAME_MAX_LENGTH + 20}
            autoComplete="organization"
            fieldSize="lg"
            startIcon={<GraduationCapIcon className="size-4.5" />}
            {...form.getFieldProps('universityName')}
          />
          <button type="button" onClick={() => select(null)} className="self-start text-xs font-medium text-primary hover:underline">
            {t('Back to the university list')}
          </button>
        </div>
      ) : (
        <UniversityPicker
          campuses={campuses.data}
          directory={directory.data}
          isLoading={directory.isLoading}
          selection={selection}
          onSelect={select}
          error={pickerError}
        />
      )}

      {(directory.error || campuses.error) && affiliationType !== AFFILIATION.UNIVERSITY && (
        <Alert variant="warning" title={t('Couldn’t load the full university list')}>
          <span className="flex flex-wrap items-center gap-2">
            {t('Try again, or type the name of your school instead.')}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (directory.error) directory.reload()
                if (campuses.error) campuses.reload()
              }}
            >
              {t('Try again')}
            </Button>
          </span>
        </Alert>
      )}
    </div>
  )
}
