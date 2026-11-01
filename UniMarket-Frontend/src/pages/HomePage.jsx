import BackendStatus from '../components/BackendStatus'

/** Initial landing page used to confirm the project setup. */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center sm:py-24">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Welcome to <span className="text-primary">UniMarket</span>
      </h1>
      <p className="mb-8 text-ink-muted">Project initialized successfully</p>
      <BackendStatus />
    </main>
  )
}
