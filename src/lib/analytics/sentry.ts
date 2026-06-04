import * as Sentry from '@sentry/react'

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn || typeof window === 'undefined') return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tunnel: '/tunnel',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
  })
}

export { Sentry }
