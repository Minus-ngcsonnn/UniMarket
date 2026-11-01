/**
 * Simulated network delay for the sample APIs.
 * Dev helpers: add ?simulate=error or ?simulate=slow to the page URL to test error and loading states.
 */
export function simulateNetwork() {
  const mode = new URLSearchParams(window.location.search).get('simulate')
  const delay = mode === 'slow' ? 2500 : 300
  return new Promise((resolve, reject) => {
    setTimeout(() => (mode === 'error' ? reject(new Error('Simulated network error')) : resolve()), delay)
  })
}
