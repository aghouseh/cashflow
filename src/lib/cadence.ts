// Cadence chip rail → RFC 5545 RRULE string lookup.
//
// The chips in the mock map to a fixed set of common cadences. "Custom…"
// (out of scope for v1) will eventually open a full RRULE editor. One-time
// entries store `null` and rely on `entry.start_date` alone.
//
// Single source of truth — the cadence picker reads from this table; the
// projection engine treats `entry.rrule` as an opaque RRULE string and
// hands it to rrule.js to expand.

export type CadenceKey =
  | 'one-time'
  | 'weekly'
  | 'bi-weekly'
  | 'first-and-fifteenth'
  | 'monthly'
  | 'quarterly'
  | 'annual'

export type CadenceOption = {
  key: CadenceKey
  label: string
  rrule: string | null // null = one-time
}

export const CADENCES: ReadonlyArray<CadenceOption> = [
  { key: 'one-time', label: 'One-time', rrule: null },
  { key: 'weekly', label: 'Weekly', rrule: 'FREQ=WEEKLY' },
  { key: 'bi-weekly', label: 'Every 2 weeks', rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  {
    key: 'first-and-fifteenth',
    label: '1st & 15th',
    rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15',
  },
  { key: 'monthly', label: 'Monthly', rrule: 'FREQ=MONTHLY' },
  { key: 'quarterly', label: 'Quarterly', rrule: 'FREQ=MONTHLY;INTERVAL=3' },
  { key: 'annual', label: 'Annual', rrule: 'FREQ=YEARLY' },
]

export function findCadence(key: CadenceKey): CadenceOption {
  const found = CADENCES.find((c) => c.key === key)
  if (!found) throw new Error(`Unknown cadence key: ${key}`)
  return found
}
