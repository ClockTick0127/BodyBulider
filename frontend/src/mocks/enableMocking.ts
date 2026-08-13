export const isMockingEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW === 'true'

export async function enableMocking() {
  if (!isMockingEnabled) return

  const { worker } = await import('./browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
}
