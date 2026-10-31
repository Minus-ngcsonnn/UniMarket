import BackendStatus from '../components/BackendStatus'

/** Initial landing page used to confirm the project setup. */
export default function HomePage() {
  return (
    <main className="home">
      <h1>Welcome to UniMarket</h1>
      <p className="subtitle">Project initialized successfully</p>
      <BackendStatus />
    </main>
  )
}
