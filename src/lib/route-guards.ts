import { redirect } from '@tanstack/react-router'
import { readAnchor } from './data/anchor'
import { initDb } from './db/init'

// Route gates. SPA mode means these run client-side, so it's safe to touch
// SQLocal here. Each gate awaits initDb() so the schema exists by the time
// we SELECT.

export async function requireAnchor(): Promise<void> {
  // SSR/prerender has no OPFS — skip the check, let client-side rerun handle it.
  if (typeof window === 'undefined') return
  await initDb()
  const existing = await readAnchor()
  if (!existing) {
    throw redirect({ to: '/onboarding' })
  }
}

export async function redirectIfAnchored(): Promise<void> {
  if (typeof window === 'undefined') return
  await initDb()
  const existing = await readAnchor()
  if (existing) {
    throw redirect({ to: '/' })
  }
}
