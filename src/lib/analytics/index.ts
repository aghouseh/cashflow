import { initSentry, Sentry } from './sentry.js'
import { initPostHog, track, trackPageView } from './posthog.js'

export { initSentry, Sentry, initPostHog, track, trackPageView }

export function initAnalytics() {
  initSentry()
  initPostHog()
}
