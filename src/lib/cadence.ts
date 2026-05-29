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
  if (!found) {
    throw new Error(`Unknown cadence key: ${key}`)
  }
  return found
}

// Reverse lookup: RRULE string (or null = one-time) → its cadence option.
// Falls back to one-time for any unrecognized RRULE.
export function cadenceForRrule(rrule: string | null): CadenceOption {
  if (!rrule) {
    return CADENCES[0] // one-time
  }
  return CADENCES.find((c) => c.rrule === rrule) ?? CADENCES[0]
}

// Average number of occurrences per month for a cadence, used to normalize
// entry amounts into a comparable "per month" figure for the stat strip.
// One-time entries return 0 — they don't recur, so they don't contribute to
// a monthly run-rate.
const MONTHLY_FACTORS: Record<CadenceKey, number> = {
  'one-time': 0,
  weekly: 52 / 12,
  'bi-weekly': 26 / 12,
  'first-and-fifteenth': 2,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
}

export function monthlyFactorForRrule(rrule: string | null): number {
  return MONTHLY_FACTORS[cadenceForRrule(rrule).key]
}
