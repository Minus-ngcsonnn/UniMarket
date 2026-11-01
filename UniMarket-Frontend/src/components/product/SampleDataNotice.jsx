import { isSampleData } from '../../services/products/productService'
import { InfoIcon } from '../icons'

/**
 * Small banner shown while the app uses sample (mock) product data, so sample listings and
 * preview-only actions are never mistaken for real marketplace data. Renders nothing otherwise.
 */
export default function SampleDataNotice({ children, className = '' }) {
  if (!isSampleData) return null
  return (
    <p role="note" className={`flex items-start gap-2 rounded-control border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-ink ${className}`}>
      <InfoIcon className="mt-px size-4 shrink-0 text-warning" />
      <span>
        <span className="font-semibold">Sample data.</span>{' '}
        {children ?? 'Listings shown here are examples for development. The product API isn’t connected yet.'}
      </span>
    </p>
  )
}
