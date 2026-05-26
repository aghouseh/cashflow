import { useEffect, useState } from 'react'
import { initDb } from './init'

// One-shot DB readiness gate. Components that need to query the DB should
// wait on this so they don't fire SELECTs against tables that haven't
// been created yet. initDb() is itself idempotent + cached.

export function useDbReady(): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    initDb().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return ready
}
