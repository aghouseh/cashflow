import posthog from 'posthog-js'

export function initPostHog() {
  // No-op: PostHogProvider in __root.tsx handles initialization
}

export function trackPageView() {
  // No-op: PostHogProvider auto-captures pageviews
}

export function track(event: string, props?: Record<string, unknown>) {
  posthog.capture(event, props)
}
