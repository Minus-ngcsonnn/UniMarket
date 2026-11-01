/** Horizontal rule with centered text, e.g. "or register with your email". */
export default function TextDivider({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-3 text-sm text-ink-muted ${className}`}>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="text-center">{children}</span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  )
}
