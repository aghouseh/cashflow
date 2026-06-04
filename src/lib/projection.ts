// Projection engine — pure function.
//
//   (snapshots, entries, horizonDays) → Projection
//
// Multi-snapshot model:
//   snapshots[0] (oldest) = ORIGIN — the ghost series starts here.
//   snapshots[1..n]       = MARKS — each is a balance reconciliation.
//   snapshots[last]       = PRIMARY — series[0] anchors here (today's balance).
//
// `series[i]` is the running balance at end of day i from primary.asOf forward.
// `pastSeries[j]` is the actual balance j days after origin.asOf (up to primary).
//   pastSeries[pastDays] === primary.balance (the asserted value at today).
//   pastSeries[pastDays - 1] may differ — that gap IS the seam.
//
// Ghost series (origin → today + horizon, no drift corrections) lets the chart
// draw the "what would have happened" line alongside the actual.

import { Temporal } from '@js-temporal/polyfill'
import { rrulestr } from 'rrule'
import type { BalanceSnapshot, Entry } from '#/lib/db/schema'

export type ProjectionEvent = {
  entryId: string
  date: string   // YYYY-MM-DD
  dayIndex: number // days from primary.asOf; negative = past, positive = future
  amount: number   // signed: IN positive, OUT negative
  kind: 'IN' | 'OUT'
}

// A balance reconciliation mark — a point where the user asserted their
// real balance, correcting the projection's drift.
export type ReconcileMark = {
  snapshotId: string
  date: string      // YYYY-MM-DD of the assertion
  dayIndex: number  // days from primary.asOf (today). ≤ 0.
  before: number    // actual-line value just before this mark (= cumulative drift up to here)
  after: number     // user's asserted balance
  drift: number     // after − before (positive = balance higher than projected)
}

export type Projection = {
  events: ProjectionEvent[]
  series: number[]      // [0..horizonDays] from primary.asOf forward; re-based at each mark
  marks: ReconcileMark[]
  // Ghost series — pure single-origin projection, no drift applied.
  // ghostSeries[i] = balance at origin.asOf + i days, ignoring all reconcile marks.
  // Length: pastDays + horizonDays + 1 (covers the full chart domain).
  ghostSeries: number[]
  // Past window — non-empty when there are ≥ 2 snapshots.
  pastSeries: number[]  // actual values [0..pastDays]; index 0 = origin.asOf, last = primary.asOf
  pastDays: number      // 0 when single snapshot (no history to show)
}

export function project(
  snapshots: Pick<BalanceSnapshot, 'id' | 'balance' | 'asOf'>[],
  entries: Entry[],
  horizonDays: number,
): Projection {
  if (horizonDays < 0) throw new Error('horizonDays must be >= 0')
  if (snapshots.length === 0) throw new Error('at least one snapshot required')

  const sorted = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf))
  const origin = sorted[0]
  const primary = sorted[sorted.length - 1]
  const historicalSnaps = sorted.slice(1) // all after origin; last = primary mark

  const originDate = Temporal.PlainDate.from(origin.asOf)
  const primaryDate = Temporal.PlainDate.from(primary.asOf)
  const pastDays = originDate.until(primaryDate).total({ unit: 'day' })
  const horizonEnd = primaryDate.add({ days: horizonDays })

  // ── build ghost series from origin over the full domain ─────────────────
  // ghostDelta(d) = net scheduled cash on day d (0 = origin date, forward)
  // ghostAt(d) = origin.balance + sum of deltas for days 1..d
  const ghostDeltas = new Float64Array(pastDays + horizonDays + 1)
  for (const e of entries) {
    if (e.paused) continue
    const signed = e.amount * (e.kind === 'IN' ? 1 : -1)
    const occurrences = expandEntry(e, originDate.subtract({ days: 1 }), horizonEnd)
    for (const d of occurrences) {
      const dayIdx = originDate.until(d).total({ unit: 'day' })
      if (dayIdx >= 0 && dayIdx <= pastDays + horizonDays) {
        ghostDeltas[dayIdx] += signed
      }
    }
  }
  // ghostAt: absolute position in the ghost array
  const ghostAbs: number[] = new Array(pastDays + horizonDays + 1)
  ghostAbs[0] = origin.balance
  for (let i = 1; i < ghostAbs.length; i++) {
    ghostAbs[i] = ghostAbs[i - 1] + ghostDeltas[i]
  }
  // ghostAt(relativeToOrigin) helper
  const ghostAt = (d: number) => ghostAbs[Math.max(0, Math.min(ghostAbs.length - 1, d))]

  // ── compute marks from historical snapshots ──────────────────────────────
  let cumDrift = 0
  const marks: ReconcileMark[] = []

  for (const snap of historicalSnaps) {
    const snapDate = Temporal.PlainDate.from(snap.asOf)
    const originRelDay = originDate.until(snapDate).total({ unit: 'day' })
    const dayIndex = primaryDate.until(snapDate).total({ unit: 'day' }) // ≤ 0

    const before = ghostAt(originRelDay) + cumDrift
    const drift = snap.balance - before
    cumDrift += drift

    marks.push({
      snapshotId: snap.id,
      date: snap.asOf,
      dayIndex,
      before,
      after: snap.balance,
      drift,
    })
  }
  marks.sort((a, b) => a.dayIndex - b.dayIndex)

  // ── past series (actual, with drift applied at each mark) ────────────────
  // pastSeries[i] = actual balance at origin + i days
  const pastSeries: number[] = new Array(pastDays + 1)
  let pastDrift = 0
  const marksByOriginDay = new Map<number, ReconcileMark>()
  for (const m of marks) {
    const originRelDay = pastDays + m.dayIndex // dayIndex ≤ 0
    marksByOriginDay.set(originRelDay, m)
  }

  for (let i = 0; i <= pastDays; i++) {
    const m = marksByOriginDay.get(i)
    if (m) pastDrift = marks.slice(0, marks.indexOf(m) + 1).reduce((s, x) => s + x.drift, 0)
    pastSeries[i] = ghostAt(i) + pastDrift
  }

  // ── forward series (from primary.balance onward) ─────────────────────────
  // Collect future events (dayIndex > 0 relative to primary)
  const futureEvents: ProjectionEvent[] = []
  for (const e of entries) {
    if (e.paused) continue
    const signed = e.amount * (e.kind === 'IN' ? 1 : -1)
    const occurrences = expandEntry(e, primaryDate, horizonEnd)
    for (const d of occurrences) {
      const dayIndex = primaryDate.until(d).total({ unit: 'day' })
      if (dayIndex > 0) {
        futureEvents.push({ entryId: e.id, date: d.toString(), dayIndex, amount: signed, kind: e.kind })
      }
    }
  }

  // Collect past events (dayIndex ≤ 0 relative to primary, but after origin)
  const pastEvents: ProjectionEvent[] = []
  if (pastDays > 0) {
    for (const e of entries) {
      if (e.paused) continue
      const signed = e.amount * (e.kind === 'IN' ? 1 : -1)
      const occurrences = expandEntry(e, originDate.subtract({ days: 1 }), primaryDate)
      for (const d of occurrences) {
        const dayIndex = primaryDate.until(d).total({ unit: 'day' }) // negative
        if (dayIndex <= 0 && dayIndex >= -pastDays) {
          pastEvents.push({ entryId: e.id, date: d.toString(), dayIndex, amount: signed, kind: e.kind })
        }
      }
    }
  }

  const events = [...pastEvents, ...futureEvents].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex
    if (a.kind !== b.kind) return a.kind === 'IN' ? -1 : 1
    return a.entryId.localeCompare(b.entryId)
  })

  // Forward series from primary
  const series: number[] = new Array(horizonDays + 1)
  series[0] = primary.balance
  let running = primary.balance
  let ei = futureEvents.findIndex((e) => e.dayIndex > 0)
  if (ei < 0) ei = futureEvents.length
  const sortedFuture = [...futureEvents].sort((a, b) => a.dayIndex - b.dayIndex)
  let fei = 0
  for (let day = 1; day <= horizonDays; day++) {
    while (fei < sortedFuture.length && sortedFuture[fei].dayIndex === day) {
      running += sortedFuture[fei].amount
      fei++
    }
    series[day] = running
  }

  // ghostSeries: pure origin projection over the full domain (pastDays + horizonDays)
  const ghostSeries = Array.from(ghostAbs)

  return { events, series, marks, ghostSeries, pastSeries, pastDays }
}

// Convenience overload: single snapshot (backwards-compatible call sites).
export function projectOne(
  snapshot: Pick<BalanceSnapshot, 'id' | 'balance' | 'asOf'>,
  entries: Entry[],
  horizonDays: number,
): Projection {
  return project([snapshot], entries, horizonDays)
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

  if (!entry.rrule) {
    return inWindow(start) ? [start] : []
  }

  const dtstart = `DTSTART:${start.toString().replace(/-/g, '')}T000000Z`
  const rule = rrulestr(`${dtstart}\nRRULE:${entry.rrule}`)

  const fromDate = new Date(`${asOf.toString()}T00:00:00.000Z`)
  const toDate = new Date(`${horizonEnd.toString()}T00:00:00.000Z`)
  const occurrences = rule.between(fromDate, toDate, true)

  return occurrences
    .map((d) => Temporal.PlainDate.from(d.toISOString().slice(0, 10)))
    .filter(inWindow)
}
