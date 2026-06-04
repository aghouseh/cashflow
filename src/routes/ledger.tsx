import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Temporal } from '@js-temporal/polyfill'
import { listSnapshots, writeSnapshot } from '../lib/data/snapshot'
import { listEntries } from '../lib/data/entry'
import { initDb } from '../lib/db/init'
import { project, type Projection, type ProjectionEvent, type ReconcileMark } from '../lib/projection'
import { cadenceForRrule } from '../lib/cadence'
import { requireSnapshot } from '../lib/route-guards'
import { SeamGlyph } from '../components/ReconcileDialog'

// Ledger = vertical mirror of Balance. Time runs top→bottom; scrolling scrubs.
// A focus line sits ~42% down the viewport; whichever event sits under it is
// the focused day, which drives the right-rail readout.

const LEDGER_HORIZON_DAYS = 730 // 2 years of register
const ANCHOR_H = 76
const HEADER_H = 40
const ROW_H = 56
const SEAM_H = 56 // reconcile mark row
const FOCUS_FRACTION = 0.42

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// Temporal dayOfWeek: 1 = Monday … 7 = Sunday.
const DOW3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function fmtSigned(n: number): string {
  const sign = n >= 0 ? '+' : '−'
  return `${sign}${USD.format(Math.abs(n))}`
}

type AnchorItem = { type: 'anchor'; y: number; h: number }
type HeaderItem = { type: 'header'; y: number; h: number; label: string; net: number }
type EventItem = {
  type: 'event'
  y: number
  h: number
  event: ProjectionEvent
  run: number      // running balance after this event
  name: string
  cadenceLabel: string
  past: boolean    // true = event is in the past (dayIndex ≤ 0)
}
type ReconcileItem = { type: 'reconcile'; y: number; h: number; mark: ReconcileMark }
type LedgerItem = AnchorItem | HeaderItem | EventItem | ReconcileItem

type LedgerModel = {
  items: LedgerItem[]
  eventItems: EventItem[]
  totalH: number
  anchorY: number  // y-position of the anchor row (TODAY)
}

function buildModel(
  primaryBalance: number,
  events: ProjectionEvent[],
  nameById: Map<string, string>,
  cadenceById: Map<string, string>,
  marks: ReconcileMark[] = [],
  pastSeries: number[] = [],
  pastDays: number = 0,
): LedgerModel {
  const pastEvents = events.filter((e) => e.dayIndex <= 0)
  const futureEvents = events.filter((e) => e.dayIndex > 0)

  // Running balance for future events (forward from primaryBalance).
  const futureRunning: number[] = []
  let bal = primaryBalance
  for (const e of futureEvents) {
    bal += e.amount
    futureRunning.push(bal)
  }

  // Per-month net for future header rows.
  const monthNetFuture = new Map<string, number>()
  for (const e of futureEvents) {
    const key = e.date.slice(0, 7)
    monthNetFuture.set(key, (monthNetFuture.get(key) ?? 0) + e.amount)
  }

  const items: LedgerItem[] = []
  let y = 0

  // ── past section (oldest → newest, ending at today) ──────────────────────
  // Merge past events and marks by dayIndex so seams appear at their exact date.
  if (pastDays > 0) {
    // Collect all unique dayIndices in the past window.
    const daySet = new Set<number>()
    for (const e of pastEvents) daySet.add(e.dayIndex)
    for (const m of marks) daySet.add(m.dayIndex)

    const sortedDays = [...daySet].sort((a, b) => a - b) // ascending (most negative first)
    const marksByDay = new Map(marks.map((m) => [m.dayIndex, m]))

    // Group past events by dayIndex.
    const eventsByDay = new Map<number, ProjectionEvent[]>()
    for (const e of pastEvents) {
      const arr = eventsByDay.get(e.dayIndex) ?? []
      arr.push(e)
      eventsByDay.set(e.dayIndex, arr)
    }

    // Month headers for past section.
    let pastCurKey: string | null = null

    for (const dayIdx of sortedDays) {
      const dayEvents = eventsByDay.get(dayIdx) ?? []
      const mark = marksByDay.get(dayIdx)

      // Month header — check the first event on this day (or mark date if no events).
      const sampleDate = dayEvents[0]?.date ?? mark?.date
      if (sampleDate) {
        const key = sampleDate.slice(0, 7)
        if (key !== pastCurKey) {
          const d = Temporal.PlainDate.from(sampleDate)
          items.push({
            type: 'header', y, h: HEADER_H,
            label: `${MONTHS_LONG[d.month - 1]} ${d.year}`,
            net: 0, // past months don't show a net (actuals, not projections)
          })
          y += HEADER_H
          pastCurKey = key
        }
      }

      // Seam row on the mark's day (before any events on that day).
      if (mark) {
        items.push({ type: 'reconcile', y, h: SEAM_H, mark })
        y += SEAM_H
      }

      // Past event rows — use end-of-day pastSeries value as running balance.
      const pIdx = pastDays + dayIdx // index into pastSeries
      const runBal = pIdx >= 0 && pIdx < pastSeries.length ? pastSeries[pIdx] : primaryBalance
      for (const e of dayEvents) {
        items.push({
          type: 'event', y, h: ROW_H,
          event: e, run: runBal,
          name: nameById.get(e.entryId) ?? e.entryId,
          cadenceLabel: cadenceById.get(e.entryId) ?? '',
          past: true,
        })
        y += ROW_H
      }
    }
  }

  // ── anchor row (TODAY) ───────────────────────────────────────────────────
  const anchorY = y
  items.push({ type: 'anchor', y, h: ANCHOR_H })
  y += ANCHOR_H

  // ── future section ───────────────────────────────────────────────────────
  let curKey: string | null = null
  futureEvents.forEach((e, i) => {
    const key = e.date.slice(0, 7)
    if (key !== curKey) {
      const d = Temporal.PlainDate.from(e.date)
      items.push({
        type: 'header', y, h: HEADER_H,
        label: `${MONTHS_LONG[d.month - 1]} ${d.year}`,
        net: monthNetFuture.get(key) ?? 0,
      })
      y += HEADER_H
      curKey = key
    }
    items.push({
      type: 'event', y, h: ROW_H,
      event: e, run: futureRunning[i],
      name: nameById.get(e.entryId) ?? e.entryId,
      cadenceLabel: cadenceById.get(e.entryId) ?? '',
      past: false,
    })
    y += ROW_H
  })

  const totalH = y + 48
  const eventItems = items.filter((it): it is EventItem => it.type === 'event')
  return { items, eventItems, totalH, anchorY }
}

export const Route = createFileRoute('/ledger')({
  beforeLoad: requireSnapshot,
  loader: async () => {
    if (typeof window === 'undefined') {
      return null
    }
    await initDb()
    const [snapshots, entries] = await Promise.all([listSnapshots(), listEntries()])
    if (snapshots.length === 0) {
      throw new Error('snapshot missing after requireSnapshot')
    }
    const snapshot = snapshots[0] // most recent
    const projection = project(snapshots, entries, LEDGER_HORIZON_DAYS)
    const { events, marks, pastSeries, pastDays } = projection
    const nameById = new Map(entries.map((e) => [e.id, e.name]))
    const cadenceById = new Map(
      entries.map((e) => [e.id, cadenceForRrule(e.rrule).label]),
    )
    const model = buildModel(snapshot.balance, events, nameById, cadenceById, marks, pastSeries, pastDays)
    return { snapshot, model, projection }
  },
  component: LedgerPage,
})

function LedgerPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [viewH, setViewH] = useState(560)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const [inserterOpen, setInserterOpen] = useState(false)

  const items = data?.model.items ?? []
  const anchorY = data?.model.anchorY ?? 0
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller,
    estimateSize: (i) => items[i]?.h ?? ROW_H,
    overscan: 6,
    // Position the anchor (TODAY) at the focus line on first render.
    // viewH isn't known yet, so use a fixed 560px estimate (typical mobile/desktop).
    initialOffset: Math.max(0, anchorY - Math.round(560 * FOCUS_FRACTION)),
  })

  if (!data) {
    return <div className="card text-[12px] text-ink-3">Loading…</div>
  }

  const { snapshot, model, projection } = data
  const { series, events, marks } = projection
  const { eventItems, totalH } = model
  const asOf = Temporal.PlainDate.from(snapshot.asOf)
  const scrollOffset = virtualizer.scrollOffset ?? 0
  const focusY = scrollOffset + viewH * FOCUS_FRACTION

  let focused: EventItem | null = null
  for (const it of eventItems) {
    if (it.y <= focusY) focused = it
    else break
  }

  const focusedDay = focused ? focused.event.dayIndex : 0
  const focusedBal = focused ? focused.run : snapshot.balance
  const focusedDate = asOf.add({ days: focusedDay })
  const delta = focusedBal - snapshot.balance

  // Pass actual focused date to form; it clamps internally to before calToday.

  async function commitInline(balance: number, snapshotAsOf: string) {
    await writeSnapshot({ balance, asOf: snapshotAsOf })
    setInserterOpen(false)
    await router.invalidate()
  }

  let betweenIn = 0, betweenOut = 0
  for (const e of events) {
    if (e.dayIndex > focusedDay) break
    if (e.amount >= 0) betweenIn += e.amount
    else betweenOut += e.amount
  }

  const lowIdx = series.indexOf(Math.min(...series))
  const jumps = [
    { key: 'today', label: 'Today', day: 0 },
    { key: '1mo', label: '+1 mo', day: 30 },
    { key: '3mo', label: '+3 mo', day: 90 },
    { key: '6mo', label: '+6 mo', day: 180 },
    { key: 'low', label: 'Low point', day: lowIdx },
  ]

  function viewportRef(el: HTMLDivElement | null) {
    if (!el) return
    setViewH(el.clientHeight)
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }

  function scrollToY(y: number) {
    const top = Math.max(0, Math.min(y - viewH * FOCUS_FRACTION, totalH - viewH))
    virtualizer.scrollToOffset(top, { behavior: 'smooth' })
  }

  function scrollToDay(day: number) {
    const it = eventItems.find((x) => x.event.dayIndex >= day) ?? eventItems.at(-1)
    if (it) scrollToY(it.y)
  }

  function scrollToMark(dayIndex: number) {
    // Find the reconcile item closest to the given dayIndex.
    const it = model.items.find((x) => x.type === 'reconcile' && (x as ReconcileItem).mark.dayIndex === dayIndex)
    if (it) scrollToY(it.y)
  }

  function stepEvent(dir: 1 | -1) {
    const idx = focused ? eventItems.indexOf(focused) : -1
    const nextIdx = Math.max(0, Math.min(idx + dir, eventItems.length - 1))
    const it = eventItems[nextIdx]
    if (it) scrollToY(it.y)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); stepEvent(1) }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); stepEvent(-1) }
  }

  return (
    <div className="flex flex-col">
      {/* Header: 2-col grid matching the body layout so CTA aligns to ledger column edge */}
      <div className="grid grid-cols-[1fr_296px] items-end gap-[18px] pb-3">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="micro">Ledger · every movement</p>
            <h1 className="text-[19px] font-medium tracking-tight">Scroll the timeline</h1>
          </div>
          <button
            type="button"
            onClick={() => setInserterOpen(true)}
            className="inline-flex cursor-pointer flex-none items-center gap-1.5 rounded-field px-3 py-1.5 font-mono text-[11.5px] transition-colors hover:opacity-80"
            style={{
              border: `1px solid color-mix(in srgb, var(--cf-accent) 55%, var(--cf-line-2))`,
              background: 'var(--cf-accent-soft)',
              color: 'var(--cf-accent-ink)',
            }}
          >
            <SeamGlyph size={12} />
            Update balance
          </button>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="micro">Focused on</p>
          <p className="mono text-[13px] text-ink-2">
            {focusedDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_296px] items-start gap-[18px]">
        <div className="flex flex-col">
          <div className="ld-grid rounded-t-card border border-b-0 border-line bg-card px-4 py-2.5">
            <span className="micro">Date</span>
            <span />
            <span className="micro">Movement</span>
            <span className="micro text-right">Amount</span>
            <span className="micro text-right">Balance</span>
          </div>

          {/* overflow: visible so the gutter ≠ icon can bleed past the right edge.
              The inner scroller has rounded-b-card to clip the scrolled rows. */}
          <div
            ref={viewportRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="relative h-[calc(100dvh-13rem)] overflow-visible rounded-b-card border border-line bg-card outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--cf-line-2)]"
          >
            <div
              ref={setScroller}
              className="ld-scroll h-full overflow-y-auto overflow-x-hidden rounded-b-card"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const it = items[vi.index]
                  const style = {
                    position: 'absolute' as const,
                    top: 0, left: 0, right: 0,
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  }
                  if (it.type === 'anchor') return (
                    <div key={vi.key} style={style}>
                      <AnchorRow h={it.h} balance={snapshot.balance} asOf={asOf} label={snapshot.accountLabel} />
                    </div>
                  )
                  if (it.type === 'header') return (
                    <div key={vi.key} style={style}><HeaderRow item={it} /></div>
                  )
                  if (it.type === 'reconcile') return (
                    <div key={vi.key} style={style}><SeamRow item={it} asOf={asOf} /></div>
                  )
                  return (
                    <div key={vi.key} style={style}>
                      <EventRow item={it} focused={focused?.event === it.event} />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="ld-fade-top pointer-events-none absolute inset-x-0 top-0 z-[2] h-6" />
            <div className="ld-fade-bot pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-6" />

            {/* Focus playhead: diamond + line. -translate-y-1/2 centers on focus Y. */}
            <div
              className="pointer-events-none absolute inset-x-0 z-3 -translate-y-1/2 flex items-center"
              style={{ top: viewH * FOCUS_FRACTION }}
            >
              <span className="ld-focus-diamond" />
              <span className="h-px flex-1 bg-accent opacity-80" />
            </div>

            {/* Gutter ≠ button — straddles the right edge, centered on focus Y. */}
            {!inserterOpen && (
              <div
                className="pointer-events-none absolute z-4 left-0 -right-3.75 -translate-y-1/2 flex items-center justify-end"
                style={{ top: viewH * FOCUS_FRACTION }}
              >
                <button
                  type="button"
                  onClick={() => setInserterOpen(true)}
                  title="Update balance here"
                  className="pointer-events-auto flex size-[30px] cursor-pointer flex-none items-center justify-center rounded-full transition-colors hover:opacity-80"
                  style={{
                    background: 'var(--cf-surface)',
                    border: `1px solid color-mix(in srgb, var(--cf-accent) 55%, var(--cf-line-2))`,
                    color: 'var(--cf-accent-ink)',
                    boxShadow: '0 2px 8px rgba(26,26,23,.12)',
                  }}
                >
                  <SeamGlyph size={13} />
                </button>
              </div>
            )}

            {/* Inline reconcile form — floats near the focus line */}
            {inserterOpen && (
              <LedgerInlineForm
                projection={projection}
                primaryDate={asOf}
                initialDate={focusedDate}
                focusY={viewH * FOCUS_FRACTION}
                onCommit={commitInline}
                onCancel={() => setInserterOpen(false)}
              />
            )}
          </div>
        </div>

        <Readout
          focusedDay={focusedDay}
          focusedBal={focusedBal}
          focusedDate={focusedDate}
          delta={delta}
          betweenIn={betweenIn}
          betweenOut={betweenOut}
          jumps={jumps}
          marks={marks}
          onJump={scrollToDay}
          onJumpToMark={scrollToMark}
        />
      </div>
    </div>
  )
}

// Correction presets — shared between Balance and Ledger forms.
const CORRECTION_DAY_OFFSETS = [-1, -3, -7, -14] as const
const CORRECTION_PRESET_LABELS: Record<number, string> = {
  '-1': 'Yesterday', '-3': '3 days ago', '-7': 'Last week', '-14': '2 weeks ago',
}

function correctionProjectedAt(
  projection: Projection,
  primaryDate: Temporal.PlainDate,
  selDate: Temporal.PlainDate,
): number {
  const dayIndex = primaryDate.until(selDate).total({ unit: 'day' })
  if (dayIndex >= 0) return projection.series[Math.min(dayIndex, projection.series.length - 1)]
  const idx = projection.pastDays + dayIndex
  return idx >= 0 && idx < projection.pastSeries.length ? projection.pastSeries[idx] : projection.series[0]
}

// Compact inline reconcile form — floats near the ledger focus line.
function LedgerInlineForm({
  projection,
  primaryDate,
  initialDate,
  focusY,
  onCommit,
  onCancel,
}: {
  projection: Projection
  primaryDate: Temporal.PlainDate
  initialDate: Temporal.PlainDate  // the focused row's actual date; clamped to before today
  focusY: number
  onCommit: (balance: number, asOf: string) => Promise<void>
  onCancel: () => void
}) {
  const calToday = Temporal.Now.plainDateISO()
  const calYesterday = calToday.subtract({ days: 1 })
  // Calendar offset from today to the focused date (negative = past).
  // Clamp to ≤ -1: corrections are seam-only, never write to primary or future.
  const rawCalOffset = calToday.until(initialDate).total({ unit: 'day' })
  const [selOffset, setSelOffset] = useState(Math.min(-1, Math.round(rawCalOffset)))
  const selDate = calToday.add({ days: selOffset })
  const projected = correctionProjectedAt(projection, primaryDate, selDate)
  const [amount, setAmount] = useState(() => projected.toFixed(2))
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const asserted = Number(amount.replace(/[^0-9.\-]/g, ''))
  const drift = Number.isFinite(asserted) ? asserted - projected : 0
  const driftPositive = drift >= 0

  function applyDate(d: Temporal.PlainDate) {
    const offset = Math.min(-1, Math.round(calToday.until(d).total({ unit: 'day' })))
    setSelOffset(offset)
    const clamped = calToday.add({ days: offset })
    if (!touched) setAmount(correctionProjectedAt(projection, primaryDate, clamped).toFixed(2))
  }

  function selectPreset(offset: number) {
    setSelOffset(offset)
    const d = calToday.add({ days: offset })
    if (!touched) setAmount(correctionProjectedAt(projection, primaryDate, d).toFixed(2))
  }

  async function commit() {
    if (!Number.isFinite(asserted)) return
    setSaving(true)
    try { await onCommit(Math.round(asserted * 100) / 100, selDate.toString()) }
    finally { setSaving(false) }
  }

  const dateLabel = `${DOW3[selDate.dayOfWeek - 1]} · ${selDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div
      className="absolute z-6 mx-3.5 rounded-xl border p-4"
      style={{
        top: Math.max(8, focusY - 80),
        left: 0, right: 0,
        borderColor: `color-mix(in srgb, var(--cf-accent) 60%, var(--cf-line-2))`,
        background: 'var(--cf-surface)',
        boxShadow: '0 18px 44px rgba(26,26,23,.22)',
      }}
    >
      {/* Header: ≠ RECONCILE BALANCE | date chip + presets */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-accent-ink"><SeamGlyph size={13} /></span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-accent-ink">
            Reconcile Balance
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="relative">
            {/* Hidden native date input — showPicker() opens the calendar */}
            <input
              ref={dateInputRef}
              type="date"
              value={selDate.toString()}
              max={calYesterday.toString()}
              min={calToday.subtract({ years: 2 }).toString()}
              tabIndex={-1}
              onChange={(e) => { if (e.target.value) applyDate(Temporal.PlainDate.from(e.target.value)) }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker()}
              className="relative flex items-center gap-1 rounded-chip border px-2.5 py-1 font-mono text-[11px]"
              style={{
                borderColor: `color-mix(in srgb, var(--cf-accent) 50%, var(--cf-line-2))`,
                color: 'var(--cf-accent-ink)',
                background: 'var(--cf-accent-soft)',
              }}
            >
              {dateLabel}
              <span className="ml-0.5 opacity-50">▾</span>
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {CORRECTION_DAY_OFFSETS.map((offset) => (
              <button
                key={offset}
                type="button"
                onClick={() => selectPreset(offset)}
                className={`cursor-pointer rounded-chip border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  offset === selOffset
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line-2 text-ink-3 hover:text-ink'
                }`}
              >
                {CORRECTION_PRESET_LABELS[offset]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dollar input */}
      <div
        className="mb-3 flex items-center gap-1.5 rounded-xl border px-3 py-2 transition-colors focus-within:border-accent"
        style={{ borderColor: 'var(--cf-line-2)', background: 'var(--cf-surface-2)' }}
      >
        <span className="font-mono text-[22px] text-ink-3">$</span>
        <input
          autoFocus
          inputMode="decimal"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setTouched(true) }}
          className="min-w-0 flex-1 bg-transparent font-mono text-[24px] tracking-[-0.02em] text-ink outline-none placeholder:text-ink-4"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') onCancel() }}
        />
      </div>

      {/* Diff panel */}
      <div
        className="mb-3 grid items-center gap-2 rounded-[10px] border p-3"
        style={{
          gridTemplateColumns: '1fr auto 1fr',
          background: 'var(--cf-accent-soft)',
          borderColor: `color-mix(in srgb, var(--cf-accent) 50%, var(--cf-line-2))`,
          borderStyle: 'dashed',
        }}
      >
        <div className="flex flex-col gap-0.5">
          <p className="micro text-ink-3">Projected here</p>
          <p className="font-mono text-[13px] text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {USD.format(projected)}
          </p>
        </div>
        <span className="text-accent-ink"><SeamGlyph size={14} /></span>
        <div className="flex flex-col gap-0.5 text-right">
          <p className="micro text-ink-3">Your actual</p>
          <p className="font-mono text-[13px] text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Number.isFinite(asserted) ? USD.format(asserted) : '—'}
          </p>
        </div>
        <div className="col-span-full text-center font-mono text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.abs(drift) < 0.01
            ? <span className="text-ink-3">No change — matches projection</span>
            : <span className={driftPositive ? 'text-in-ink' : 'text-out-ink'}>
                {driftPositive ? '▲' : '▼'} {USD.format(Math.abs(drift))} correction · re-bases everything after
              </span>}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2">
        <button
          type="button" onClick={onCancel}
          className="cursor-pointer rounded-field border border-line-2 px-3 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:text-ink"
        >Cancel</button>
        <button
          type="button" onClick={() => void commit()} disabled={saving}
          className="cursor-pointer rounded-field px-3 py-1.5 text-[12.5px] text-accent-on transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--cf-accent-ink)', border: '1px solid var(--cf-accent-ink)' }}
        >{saving ? 'Saving…' : 'Set balance'}</button>
      </div>
    </div>
  )
}

function AnchorRow({
  h,
  balance,
  asOf,
  label,
}: {
  h: number
  balance: number
  asOf: Temporal.PlainDate
  label: string | null
}) {
  return (
    <div
      style={{ height: h }}
      className="grid grid-cols-[64px_1fr_auto] items-center border-b border-line bg-linear-to-b from-card-2 to-card px-4"
    >
      <div className="flex justify-center">
        <span className="size-2.75 rounded-full bg-ink shadow-[0_0_0_4px_var(--cf-surface),0_0_0_5px_var(--cf-line-2)]" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="micro">Today · starting balance</span>
        <span className="mono text-[13px] text-ink-2">
          {asOf.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {label ? ` · ${label}` : ''}
        </span>
      </div>
      <span className="mono text-[18px] text-ink">{USD.format(balance)}</span>
    </div>
  )
}

function HeaderRow({ item }: { item: HeaderItem }) {
  return (
    <div
      style={{ height: item.h }}
      className="flex items-center gap-3 border-y border-line bg-card-2 px-4"
    >
      <span className="micro">{item.label}</span>
      <span className="h-px flex-1 bg-line" />
      <span className="mono text-[11.5px] text-ink-3">net {fmtSigned(item.net)}</span>
    </div>
  )
}

function EventRow({ item, focused }: { item: EventItem; focused: boolean }) {
  const d = Temporal.PlainDate.from(item.event.date)
  const isIn = item.event.kind === 'IN'
  // Past events: muted styling — lighter ink, faded amount colors.
  const pastCls = item.past ? 'opacity-60' : ''
  return (
    <div style={{ height: item.h }}>
      <div
        className={`ld-grid h-full border-b border-line px-4 transition-colors ${pastCls} ${
          focused ? 'bg-amber-soft shadow-[inset_3px_0_0_var(--cf-accent)]' : ''
        }`}
      >
        <div className="flex flex-col leading-[1.1]">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-3">
            {DOW3[d.dayOfWeek - 1]}
          </span>
          <span className="mono text-[15px] text-ink">{d.day}</span>
        </div>
        <div className="relative flex h-full items-center justify-center">
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line-2" />
          <span
            className="relative z-1 size-2.25 rounded-full border-[1.5px] bg-card"
            style={{ borderColor: isIn ? 'var(--cf-in)' : 'var(--cf-out)' }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[13.5px]">{item.name}</span>
          <span className="micro text-ink-3">{item.cadenceLabel}</span>
        </div>
        <div className={`mono text-right text-[13.5px] ${isIn ? 'text-in-ink' : 'text-out-ink'}`}>
          {fmtSigned(item.event.amount)}
        </div>
        {/* Lift emphasis on focused future events: bold + accent dot. Past events: plain. */}
        {focused && !item.past ? (
          <div className="mono flex items-center justify-end gap-1.5 text-right text-[13px]">
            <span className="size-1.25 flex-none rounded-full bg-accent" />
            <span className="font-semibold text-ink">{USD.format(item.run)}</span>
          </div>
        ) : (
          <div className="mono text-right text-[13px] text-ink-2">{USD.format(item.run)}</div>
        )}
      </div>
    </div>
  )
}

function SeamRow({ item, asOf }: { item: ReconcileItem; asOf: Temporal.PlainDate }) {
  const { mark } = item
  const date = asOf.add({ days: mark.dayIndex })
  const d = date
  const isPositive = mark.drift >= 0
  return (
    <div
      className="ld-grid px-4"
      style={{
        height: SEAM_H,
        background: 'color-mix(in srgb, var(--cf-accent-soft) 60%, var(--cf-surface))',
        borderTop: '1px dashed var(--cf-accent)',
        borderBottom: '1px dashed var(--cf-accent)',
      }}
    >
      <div className="flex flex-col leading-[1.1]">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-3">
          {DOW3[d.dayOfWeek - 1]}
        </span>
        <span className="mono text-[15px] text-ink">{d.day}</span>
      </div>
      {/* broken spine with diamond */}
      <div className="relative flex h-full items-center justify-center">
        <span className="absolute top-0 h-[30%] w-px bg-line-2" style={{ left: '50%', transform: 'translateX(-50%)' }} />
        <span className="absolute bottom-0 h-[30%] w-px bg-line-2" style={{ left: '50%', transform: 'translateX(-50%)' }} />
        <span
          className="relative z-1 h-2.75 w-2.75"
          style={{
            background: 'var(--cf-surface)',
            border: '1.6px solid var(--cf-accent)',
            transform: 'rotate(45deg)',
          }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-widest text-accent-ink">
          Balance reconciled
        </span>
        <span className="font-mono text-[11.5px] text-ink-3">
          manual snapshot · was {USD.format(mark.before)}
        </span>
      </div>
      <div className={`mono text-right text-[12.5px] ${isPositive ? 'text-in-ink' : 'text-out-ink'}`}>
        {isPositive ? '▲' : '▼'} {USD.format(Math.abs(mark.drift))}
      </div>
      <div className="mono text-right text-[14px] font-semibold text-accent-ink">
        {USD.format(mark.after)}
      </div>
    </div>
  )
}

function Readout({
  focusedDay, focusedBal, focusedDate, delta,
  betweenIn, betweenOut, jumps, marks, onJump, onJumpToMark,
}: {
  focusedDay: number
  focusedBal: number
  focusedDate: Temporal.PlainDate
  delta: number
  betweenIn: number
  betweenOut: number
  jumps: { key: string; label: string; day: number }[]
  marks: ReconcileMark[]
  onJump: (day: number) => void
  onJumpToMark: (dayIndex: number) => void
}) {
  const sign = delta > 0 ? 'in' : delta < 0 ? 'out' : null
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
      <div className="card flex flex-col">
        <p className="micro">At this point {focusedDay === 0 ? '· today' : focusedDay > 0 ? `· in ${focusedDay} days` : `· ${-focusedDay} days ago`}</p>
        <p className="display-sm mt-2.5">{USD.format(focusedBal)}</p>
        <p className="mono mt-2 text-[12.5px] text-ink-2">
          {focusedDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
        {sign && (
          <p className={`mono mt-1 text-[12.5px] ${sign === 'in' ? 'text-in-ink' : 'text-out-ink'}`}>
            {sign === 'in' ? '↗' : '↘'} {fmtSigned(delta)} vs today
          </p>
        )}
      </div>

      <div className="card">
        <p className="micro mb-3">Between now &amp; here</p>
        <div className="flex flex-col gap-1.5 text-[12px]">
          <Kv k="Income" v={fmtSigned(betweenIn)} cls="text-in-ink" />
          <Kv k="Expenses" v={fmtSigned(betweenOut)} cls="text-out-ink" />
          <span className="my-1 h-px bg-line" />
          <Kv k="Net" v={fmtSigned(betweenIn + betweenOut)} bold />
        </div>
      </div>

      {/* Reconciled points — click to scroll to that seam in the ledger. */}
      <div
        className="rounded-xl border p-4"
        style={{
          borderColor: marks.length > 0
            ? `color-mix(in srgb, var(--cf-accent) 40%, var(--cf-line))`
            : 'var(--cf-line)',
          background: marks.length > 0 ? 'var(--cf-accent-soft)' : 'var(--cf-surface)',
        }}
      >
        <p className="micro mb-3" style={{ color: marks.length > 0 ? 'var(--cf-accent-ink)' : undefined }}>
          Reconciled points · {marks.length}
        </p>
        {marks.length === 0 ? (
          <p className="font-mono text-[12px] text-ink-3">None yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {marks.map((m) => (
              <button
                key={m.snapshotId}
                type="button"
                onClick={() => onJumpToMark(m.dayIndex)}
                className="grid cursor-pointer items-baseline gap-2.5 text-left font-mono text-[11.5px] transition-opacity hover:opacity-75"
                style={{ gridTemplateColumns: 'auto 1fr auto' }}
              >
                <span className="text-ink-2">
                  {Temporal.PlainDate.from(m.date).toLocaleString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className={m.drift >= 0 ? 'text-in-ink' : 'text-out-ink'}>
                  {m.drift >= 0 ? '▲' : '▼'} {USD.format(Math.abs(m.drift))}
                </span>
                <span className="font-semibold text-accent-ink">{USD.format(m.after)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <p className="micro mb-3">Jump</p>
        <div className="flex flex-wrap gap-1.5">
          {jumps.map((j) => (
            <button
              key={j.key}
              type="button"
              onClick={() => onJump(j.day)}
              className={`rounded-chip border px-2.5 py-1 text-[11px] transition-colors ${
                j.day === focusedDay
                  ? 'border-ink bg-ink text-card'
                  : 'border-line-2 text-ink-2 hover:text-ink'
              }`}
            >
              {j.label}
            </button>
          ))}
        </div>
        <p className="micro mt-3.5 flex items-center gap-1.5">
          Step <kbd className="ld-key">↑</kbd>
          <kbd className="ld-key">↓</kbd> by event
        </p>
      </div>
    </div>
  )
}

function Kv({ k, v, cls, bold }: { k: string; v: string; cls?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'text-ink' : 'text-ink-2'}>{k}</span>
      <span className={`mono ${cls ?? 'text-ink'} ${bold ? 'font-medium' : ''}`}>{v}</span>
    </div>
  )
}
