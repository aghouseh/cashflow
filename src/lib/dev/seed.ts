// Dev-only seed. Wipes all data and loads a realistic multi-category budget
// so you can skip onboarding during development.
//
// Triggered by Shift+Alt+D anywhere in the app (see __root.tsx).
// Tree-shaken out of production builds by Vite (import.meta.env.DEV guard).

import { db } from '../db/client'
import { entry, balanceSnapshot } from '../db/schema'
import { initDb } from '../db/init'
import { writeSnapshot } from '../data/snapshot'
import { createEntry } from '../data/entry'

const R = {
  weekly:           'FREQ=WEEKLY',
  biweekly:         'FREQ=WEEKLY;INTERVAL=2',
  firstAndFifteenth:'FREQ=MONTHLY;BYMONTHDAY=1,15',
  monthly:          'FREQ=MONTHLY',
  quarterly:        'FREQ=MONTHLY;INTERVAL=3',
  annual:           'FREQ=YEARLY',
} as const

function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const TODAY = daysFromToday(0)

export async function seedDevData(): Promise<void> {
  await initDb()

  // Wipe existing
  await db.delete(entry)
  await db.delete(balanceSnapshot)

  // Anchor balance
  await writeSnapshot({
    balance: 12_450,
    asOf: TODAY,
    accountLabel: 'Chase · 4820',
  })

  // ── Income ────────────────────────────────────────────────────────────────

  const income: Array<Parameters<typeof createEntry>[0]> = [
    {
      kind: 'IN',
      name: 'Salary',
      amount: 4_200,
      startDate: TODAY,
      rrule: R.biweekly,
    },
    {
      kind: 'IN',
      name: 'Freelance',
      amount: 1_800,
      startDate: TODAY,
      rrule: R.monthly,
    },
    {
      kind: 'IN',
      name: 'Dividends',
      amount: 340,
      startDate: TODAY,
      rrule: R.quarterly,
    },
    {
      kind: 'IN',
      name: 'Side hustle',
      amount: 620,
      startDate: TODAY,
      rrule: R.monthly,
    },
  ]

  // ── Expenses ──────────────────────────────────────────────────────────────

  const expenses: Array<Parameters<typeof createEntry>[0]> = [
    // Housing
    { kind: 'OUT', name: 'Rent',                amount: 2_150, startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Renters insurance',   amount: 220,   startDate: TODAY, rrule: R.annual  },

    // Transport
    { kind: 'OUT', name: 'Car payment',         amount: 485,   startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Car insurance',       amount: 164,   startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Gas',                 amount: 75,    startDate: TODAY, rrule: R.biweekly },
    { kind: 'OUT', name: 'Car registration',    amount: 185,   startDate: daysFromToday(38), rrule: null },

    // Utilities
    { kind: 'OUT', name: 'Electric + gas',      amount: 140,   startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Internet',            amount: 65,    startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Phone',               amount: 120,   startDate: TODAY, rrule: R.monthly },

    // Food
    { kind: 'OUT', name: 'Groceries',           amount: 185,   startDate: TODAY, rrule: R.weekly  },
    { kind: 'OUT', name: 'Dining out',          amount: 210,   startDate: TODAY, rrule: R.monthly },

    // Health
    { kind: 'OUT', name: 'Health insurance',    amount: 285,   startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Gym',                 amount: 48,    startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Dentist',             amount: 150,   startDate: daysFromToday(22), rrule: null },
    { kind: 'OUT', name: 'Prescriptions',       amount: 35,    startDate: TODAY, rrule: R.monthly },

    // Subscriptions
    { kind: 'OUT', name: 'Streaming bundle',    amount: 45,    startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Spotify',             amount: 11,    startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Amazon Prime',        amount: 139,   startDate: TODAY, rrule: R.annual  },
    { kind: 'OUT', name: 'iCloud storage',      amount: 3,     startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Software tools',      amount: 28,    startDate: TODAY, rrule: R.monthly },

    // Debt
    { kind: 'OUT', name: 'Student loan',        amount: 385,   startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: 'Credit card',         amount: 200,   startDate: TODAY, rrule: R.firstAndFifteenth },

    // Savings / transfers
    { kind: 'OUT', name: 'Emergency fund',      amount: 300,   startDate: TODAY, rrule: R.monthly },
    { kind: 'OUT', name: '401k contribution',   amount: 500,   startDate: TODAY, rrule: R.biweekly },

    // Misc one-offs
    { kind: 'OUT', name: 'Birthday gifts',      amount: 80,    startDate: daysFromToday(14), rrule: null },
    { kind: 'OUT', name: 'Flight — summer trip',amount: 640,   startDate: daysFromToday(55), rrule: null },
  ]

  for (const e of [...income, ...expenses]) {
    await createEntry(e)
  }
}
