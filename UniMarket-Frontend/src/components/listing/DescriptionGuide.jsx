import { CATEGORIES } from '../../constants/categories'
import { PlusIcon, SparklesIcon } from '../icons'
import useTranslation from '../../i18n/useTranslation'

/**
 * What buyers want to know, per category. Each prompt becomes a "Label: " line in the description.
 * Based on the questions students typically ask about second-hand items.
 */
const PROMPTS = {
  textbooks: ['Title & author', 'Edition / year', 'Course code (e.g. MAE101)', 'Notes or highlighting', 'Cover & page condition'],
  electronics: ['Brand & model', 'Specs (RAM, storage, size…)', 'Battery health', 'What’s included', 'Faults or repairs', 'Warranty left'],
  'dorm-items': ['What it is & size', 'Age / how long used', 'Power use (if electric)', 'Wear or damage', 'Bulky? (for delivery)'],
  fashion: ['Brand', 'Size & fit', 'Material', 'Times worn', 'Stains, marks or damage'],
  'study-gear': ['Brand & model', 'Allowed in exams?', 'What’s included', 'Wear or damage'],
}
const DEFAULT_PROMPTS = ['What it is', 'Condition details', 'What’s included', 'Why you’re selling']

/** Next description after adding a "Label: " line (on a new line when there is text already). */
function appendLine(description, label) {
  const trimmed = description.replace(/\s+$/, '')
  return `${trimmed}${trimmed ? '\n' : ''}${label}: `
}

/**
 * Helps sellers write a useful description: category-specific prompts that insert "Label: " lines,
 * and a template with all of them. The seller fills in the details after each colon.
 *
 * @param {string} categorySlug currently selected category ('' = none yet)
 * @param {string} description current description text
 * @param {(next: string) => void} onChange sets the new description and moves the caret to its end
 */
export default function DescriptionGuide({ categorySlug, description, onChange }) {
  const { t } = useTranslation()
  // Prompts follow the interface language; they become text the seller then edits.
  const prompts = (PROMPTS[categorySlug] ?? DEFAULT_PROMPTS).map((label) => t(label))
  const categoryName = CATEGORIES.find((c) => c.slug === categorySlug)?.name
  const missing = prompts.filter((label) => !description.includes(`${label}:`))

  return (
    <div className="flex flex-col gap-3 rounded-control border border-primary/15 bg-primary-soft/60 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <SparklesIcon className="size-4 text-primary" />
          {categoryName ? t('What buyers ask about {category}', { category: t(categoryName).toLowerCase() }) : t('What buyers want to know')}
        </p>
        {description.trim() === '' && (
          <button
            type="button"
            onClick={() => onChange(prompts.map((label) => `${label}: `).join('\n'))}
            className="min-h-6 py-1 text-xs font-semibold text-primary hover:underline"
          >
            {t("Use a template")}
          </button>
        )}
      </div>

      {missing.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t("Add a detail to your description")}>
          {missing.map((label) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => onChange(appendLine(description, label))}
                className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-surface px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
              >
                <PlusIcon className="size-3" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-success">{t("Great, you’ve covered everything buyers usually ask.")}</p>
      )}

      <p className="text-xs text-ink-muted">
        {t("Be specific and honest about wear or missing parts. Clear descriptions get fewer questions and sell faster.")}
      </p>
    </div>
  )
}
