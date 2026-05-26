// Projection engine — pure function.
//
//   (anchor, entries, horizonDays) → { events, series }
//
// `series[i]` is the running balance at end of day `i` (0-indexed from
// anchor.asOf). `series[0] === anchor.balance` — anchor.asOf is treated as
// "balance is known as of today, before tomorrow's events", so the expansion
// window is *strictly after* asOf, up to and including asOf + horizonDays.
//
// Recurrence: opaque RFC 5545 RRULE strings, expanded via rrule.js. One-time
// entries (`rrule == null`) emit a single event at `startDate` if it falls in
// the window. Paused entries skip entirely. `endDate` clips occurrences.

import { Temporal } from '@js-temporal/polyfill'
import { rrulestr } from 'rrule'
import type { Anchor, Entry } from '#/lib/db/schema'

export type ProjectionEvent = {
  entryId: string
  date: string // YYYY-MM-DD
  dayIndex: number // 1..horizonDays
  amount: number // signed: IN positive, OUT negative
  kind: 'IN' | 'OUT'
}

export type Projection = {
  events: ProjectionEvent[]
  series: number[] // length horizonDays + 1; series[0] = anchor.balance
}

export function project(
  anchor: Pick<Anchor, 'balance' | 'asOf'>,
  entries: Entry[],
  horizonDays: number,
): Projection {
  if (horizonDays < 0) throw new Error('horizonDays must be >= 0')

  const asOf = Temporal.PlainDate.from(anchor.asOf)
  const horizonEnd = asOf.add({ days: horizonDays })

  const events: ProjectionEvent[] = []

  for (const e of entries) {
    if (e.paused) continue
    const signed = e.amount * (e.kind === 'IN' ? 1 : -1)
    const occurrences = expandEntry(e, asOf, horizonEnd)
    for (const d of occurrences) {
      const dayIndex = asOf.until(d).total({ unit: 'day' })
      events.push({
        entryId: e.id,
        date: d.toString(),
        dayIndex,
        amount: signed,
        kind: e.kind,
      })
    }
  }

  events.sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex
    if (a.kind !== b.kind) return a.kind === 'IN' ? -1 : 1
    return a.entryId.localeCompare(b.entryId)
  })

  const series: number[] = new Array(horizonDays + 1)
  series[0] = anchor.balance
  let running = anchor.balance
  let ei = 0
  for (let day = 1; day <= horizonDays; day++) {
    while (ei < events.length && events[ei].dayIndex === day) {
      running += events[ei].amount
      ei++
    }
    series[day] = running
  }

  return { events, series }
}

function expandEntry(
  entry: Entry,
  asOf: Temporal.PlainDate,
  horizonEnd: Temporal.PlainDate,
): Temporal.PlainDate[] {
  const start = Temporal.PlainDate.from(entry.startDate)
  const end = entry.endDate ? Temporal.PlainDate.from(entry.endDate) : null

  const inWindow = (d: Temporal.PlainDate) =>
    Temporal.PlainDate.compare(d, asOf) > 0 &&
    Temporal.PlainDate.compare(d, horizonEnd) <= 0 &&
    (end === null || Temporal.PlainDate.compare(d, end) <= 0)

  // One-time
  if (!entry.rrule) {
    return inWindow(start) ? [start] : []
  }

  // Recurring — build a self-contained RRULE string (DTSTART + RRULE)
  const dtstart = `DTSTART:${start.toString().replace(/-/g, '')}T000000Z`
  const rule = rrulestr(`${dtstart}\nRRULE:${entry.rrule}`)

  const fromDate = new Date(`${asOf.toString()}T00:00:00.000Z`)
  const toDate = new Date(`${horizonEnd.toString()}T00:00:00.000Z`)
  const occurrences = rule.between(fromDate, toDate, true)

  return occurrences
    .map((d) => Temporal.PlainDate.from(d.toISOString().slice(0, 10)))
    .filter(inWindow)
}
