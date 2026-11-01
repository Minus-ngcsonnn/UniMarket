import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../icons'
import Input from './Input'

/** Password field with a show/hide toggle. Accepts the same props as <Input>. */
export default function PasswordInput(props) {
  const [isVisible, setIsVisible] = useState(false)

  const toggle = (
    <button
      type="button"
      onClick={() => setIsVisible((visible) => !visible)}
      aria-label={isVisible ? 'Hide password' : 'Show password'}
      aria-pressed={isVisible}
      className="flex size-9 items-center justify-center rounded-control text-ink-muted transition-colors hover:text-ink"
    >
      {/* Icon shows the current state, as in Figma: crossed eye = hidden. */}
      {isVisible ? <EyeIcon className="size-4.5" /> : <EyeOffIcon className="size-4.5" />}
    </button>
  )

  return <Input {...props} type={isVisible ? 'text' : 'password'} endAdornment={toggle} />
}
