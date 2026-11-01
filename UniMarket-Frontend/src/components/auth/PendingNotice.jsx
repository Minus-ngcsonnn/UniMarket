import Alert from '../ui/Alert'

/**
 * Messages shown when a form is valid but the feature it needs is not built yet.
 * No request is sent and nothing is stored: there is no fake login or session.
 */
const NOTICES = {
  signIn: {
    title: 'Sign-in isn’t connected yet',
    text: 'Your details look valid, but UniMarket accounts are still being built. Nothing was sent or saved.',
  },
  forgotPassword: {
    title: 'Password reset isn’t available yet',
    text: 'It will be added together with account sign-in.',
  },
  verifyCode: {
    title: 'Verification isn’t connected yet',
    text: 'The code format is valid, but codes can only be checked once the UniMarket backend is ready. Nothing was sent.',
  },
  resendCode: {
    title: 'Resending codes isn’t available yet',
    text: 'Verification emails will be sent once the UniMarket backend is ready.',
  },
}

export default function PendingNotice({ type }) {
  if (!type) return null
  const { title, text } = NOTICES[type]
  return (
    <Alert variant="info" title={title}>
      {text}
    </Alert>
  )
}
