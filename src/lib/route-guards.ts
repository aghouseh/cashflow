import { redirect } from '@tanstack/react-router'
import { readLatestSnapshot } from './data/snapshot'
import { initDb } from './db/init'

// Route gates. SPA mode means these run client-side, so it's safe to touch
// SQLocal here. Each gate awaits initDb() so the schema exists by the time
// we SELECT.

export async function requireSnapshot(): Promise<void> {
  // SSR/prerender has no OPFS — skip the check, let client-side rerun handle it.
  if (typeof window === 'undefined') return
  await initDb()
  const existing = await readLatestSnapshot()
  if (!existing) {
    throw redirect({ to: '/onboarding' })
  }
}

export async function redirectIfSnapshotted(): Promise<void> {
  if (typeof window === 'undefined') return
  await initDb()
  const existing = await readLatestSnapshot()
  if (existing) {
    throw redirect({ to: '/' })
  }
}
