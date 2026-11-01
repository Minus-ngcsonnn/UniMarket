import { Link } from 'react-router'
import { PATHS } from '../../routes/paths'
import { ShoppingBagIcon } from '../icons'

const VARIANTS = {
  default: { tile: 'bg-primary text-white', text: 'text-ink' }, // on white backgrounds
  inverse: { tile: 'bg-white text-primary', text: 'text-white' }, // on blue / navy backgrounds
}

/** UniMarket logo (bag tile + wordmark) linking to the homepage. */
export default function Logo({ variant = 'default', className = '' }) {
  const { tile, text } = VARIANTS[variant]

  return (
    <Link to={PATHS.home} className={`inline-flex shrink-0 items-center gap-2.5 ${className}`}>
      <span className={`flex size-9 items-center justify-center rounded-lg ${tile}`}>
        <ShoppingBagIcon className="size-5" />
      </span>
      <span className={`text-xl tracking-tight sm:text-2xl ${text}`}>UniMarket</span>
    </Link>
  )
}
