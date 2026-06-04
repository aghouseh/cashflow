import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import ChartStrip, { type ChartWindow } from '../components/ChartStrip'
import { SeamGlyph } from '../components/ReconcileDialog'
import { listSnapshots, writeSnapshot } from '../lib/data/snapshot'
import { listEntries } from '../lib/data/entry'
import { initDb } from '../lib/db/init'
import { project } from '../lib/projection'
import { requireSnapshot } from '../lib/route-guards'

// Loader pre-computes the full long-range projection once. Window + page are
// pure render state — slicing is cheap, recomputing the projection is not
// needed when the user pages through.
const HORIZON_DAYS_MAX = 3650 // 10 years

type WindowKey = '30d' | '90d' | '6mo' | '1yr' | '2yr'

const WINDOW_PRESETS: ReadonlyArray<{ key: WindowKey; label: string; days: number }> = [
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '6mo', label: '6mo', days: 180 },
  { key: '1yr', label: '1yr', days: 365 },
  { key: '2yr', label: '2yr', days: 730 },
]

const DEFAULT_WINDOW: WindowKey = '90d'

function windowDaysFor(key: WindowKey): number {
  return WINDOW_PRESETS.find((w) => w.key === key)!.days
}

export const Route = createFileRoute('/')({
  beforeLoad: requireSnapshot,
  loader: async () => {
    // SSR/prerender has no OPFS — return a sentinel and let the client re-run.
    if (typeof window === 'undefined') return null
    await initDb()
    const [snapshots, entries] = await Promise.all([
      listSnapshots(),
      listEntries(),
    ])
    if (snapshots.length === 0) throw new Error('snapshot missing after requireSnapshot')
    const snapshot = snapshots[0] // listSnapshots returns desc; [0] = most recent
    const projection = project(snapshots, entries, HORIZON_DAYS_MAX)
    return { snapshot, snapshots, entries, projection }
  },
  component: BalancePage,
})

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function BalancePage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [windowKey, setWindowKey] = useState<WindowKey>(DEFAULT_WINDOW)
  const [pageIndex, setPageIndex] = useState(0)
  const initialScrub = Math.floor(windowDaysFor(DEFAULT_WINDOW) / 2)
  const [scrubOffset, setScrubOffset] = useState(initialScrub)
  const [showReconcile, setShowReconcile] = useState(false)
  // Shared with ChartStrip so the arrow controls drive the same scroll snap.
  const chartScrollRef = useRef<HTMLDivElement | null>(null)

  function pageByArrow(delta: 1 | -1) {
    const el = chartScrollRef.current
    if (el) el.scrollBy({ left: delta * el.clientWidth, behavior: 'smooth' })
  }

  if (!data) {
    return <div className="card text-[12px] text-ink-3">Loading…</div>
  }

  const { snapshot, entries, projection } = data

  async function commitReconcile(balance: number, asOf: string) {
    await writeSnapshot({ balance, asOf })
    setShowReconcile(false)
    await router.invalidate()
  }
  const { series: fullSeries, events: fullEvents } = projection

  const windowDays = windowDaysFor(windowKey)
  const windowStart = pageIndex * windowDays
  // Max page = last full window that still fits inside HORIZON_DAYS_MAX.
  const maxPage = Math.max(0, Math.floor((HORIZON_DAYS_MAX - windowDays) / windowDays))

  const windowSeries = fullSeries.slice(windowStart, windowStart + windowDays + 1)
  // Clamp scrub if user changed window and the old offset is now out of range.
  const clampedScrub = Math.min(scrubOffset, windowSeries.length - 1)

  function buildWindow(pageOffset: number): ChartWindow | undefined {
    const idx = pageIndex + pageOffset
    if (idx < 0 || idx > maxPage) return undefined
    const start = idx * windowDays
    return {
      series: fullSeries.slice(start, start + windowDays + 1),
      events: fullEvents,
      dayOffset: start,
    }
  }

  const currentWindow = buildWindow(0)!
  const prevWindow = buildWindow(-1)
  const nextWindow = buildWindow(1)

  const asOf = Temporal.PlainDate.from(snapshot.asOf)
  const absoluteScrubDay = windowStart + clampedScrub
  const scrubDate = asOf.add({ days: absoluteScrubDay })
  const windowEndDate = asOf.add({ days: windowStart + windowDays })
  const windowStartDate = asOf.add({ days: windowStart })

  const balanceNow = fullSeries[0]
  const balanceAtScrub = fullSeries[absoluteScrubDay]
  const netChange = balanceAtScrub - balanceNow

  const windowMin = Math.min(...windowSeries)
  const lowestIdxInWindow = windowSeries.indexOf(windowMin)
  const lowestDate = asOf.add({ days: windowStart + lowestIdxInWindow })

  const eventsOnScrubDay = fullEvents.filter((e) => e.dayIndex === absoluteScrubDay)

  const incomeCount = entries.filter((e) => e.kind === 'IN' && !e.paused).length
  const expenseCount = entries.filter((e) => e.kind === 'OUT' && !e.paused).length
  const windowEventsCount = fullEvents.filter(
    (e) => e.dayIndex >= windowStart && e.dayIndex <= windowStart + windowDays,
  ).length

  function changeWindow(next: WindowKey) {
    if (next === windowKey) return
    setWindowKey(next)
    setPageIndex(0)
    setScrubOffset(Math.floor(windowDaysFor(next) / 2))
    // Page resets to 0 → current window is the first slide. Snap the scroll
    // container back to the left after the new slides render.
    requestAnimationFrame(() => {
      if (chartScrollRef.current) chartScrollRef.current.scrollLeft = 0
    })
  }

  function changePage(delta: number) {
    const next = pageIndex + delta
    if (next < 0 || next > maxPage) return
    setPageIndex(next)
    // Land in the middle of the new window so the tooltip stays visible.
    setScrubOffset(Math.floor(windowDays / 2))
  }

  function goToToday() {
    setPageIndex(0)
    setScrubOffset(0) // day 0 = today
    requestAnimationFrame(() => {
      if (chartScrollRef.current) chartScrollRef.current.scrollLeft = 0
    })
  }

  const isToday = absoluteScrubDay === 0

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex items-start justify-between">
        <div>
          <p className="micro">
            Projected balance · {isToday ? 'today' : scrubDate.toString()}
          </p>
          <p className="display mt-2">{USD.format(balanceAtScrub)}</p>
          <p className="mono mt-2 text-[12px] text-ink-3">
            {isToday
              ? `As of ${snapshot.asOf}${snapshot.accountLabel ? ` · ${snapshot.accountLabel}` : ''}`
              : `${netChange >= 0 ? '+' : ''}${USD.format(netChange)} vs today · day +${absoluteScrubDay}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button
            type="button"
            onClick={() => setShowReconcile(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-field border px-3 py-1.5 font-mono text-[11.5px] transition-colors hover:opacity-80"
            style={{
              borderColor: `color-mix(in srgb, var(--cf-accent) 55%, var(--cf-line-2))`,
              background: 'var(--cf-accent-soft)',
              color: 'var(--cf-accent-ink)',
            }}
          >
            <SeamGlyph size={12} />
            Update balance
          </button>
          {projection.marks.length > 0 && (
            <p className="micro text-right text-ink-3">
              {projection.marks.length} reconciled {projection.marks.length === 1 ? 'point' : 'points'}
            </p>
          )}
          <div className="text-right text-[12px] text-ink-3">
            <p className="micro">Lowest in window</p>
            <p className="mono mt-1 text-ink-2">{USD.format(windowMin)}</p>
            <p className="mono mt-1">{lowestDate.toString()}</p>
          </div>
        </div>
      </section>

      {/* Inline reconcile drawer — slides in below the hero, replaces the v1 modal. */}
      {showReconcile && (
        <BalanceInlineDrawer
          projection={projection}
          primaryAsOf={snapshot.asOf}
          onCommit={commitReconcile}
          onCancel={() => setShowReconcile(false)}
        />
      )}

      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <p className="micro">Window</p>
            <div className="flex items-center gap-1">
              {WINDOW_PRESETS.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  aria-pressed={w.key === windowKey}
                  onClick={() => changeWindow(w.key)}
                  className={`rounded-chip border px-2.5 py-1 text-[11px] transition-colors ${
                    w.key === windowKey
                      ? 'border-ink bg-ink text-card'
                      : 'border-line-2 text-ink-2 hover:text-ink'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToToday}
              disabled={pageIndex === 0 && absoluteScrubDay === 0}
              className="flex items-center gap-1.5 rounded-field border border-line-2 px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-2"
            >
              <RotateCcw size={12} aria-hidden />
              Today
            </button>
            <button
              type="button"
              onClick={() => pageByArrow(-1)}
              disabled={pageIndex === 0}
              aria-label="Previous window"
              className="rounded-field border border-line-2 p-1 text-ink-2 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-2"
            >
              <ChevronLeft size={14} />
            </button>
            <p className="mono text-[11px] text-ink-2">
              {windowStartDate.toString()} → {windowEndDate.toString()}
            </p>
            <button
              type="button"
              onClick={() => pageByArrow(1)}
              disabled={pageIndex >= maxPage}
              aria-label="Next window"
              className="rounded-field border border-line-2 p-1 text-ink-2 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-2"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <ChartStrip
          asOf={snapshot.asOf}
          current={currentWindow}
          prev={prevWindow}
          next={nextWindow}
          scrubOffset={clampedScrub}
          onScrubChange={setScrubOffset}
          onPageChange={changePage}
          scrollRef={chartScrollRef}
          pastSeries={projection.pastDays > 0 ? projection.pastSeries : undefined}
          marks={projection.marks.length > 0 ? projection.marks : undefined}
        />
      </section>

      <section className="card">
        <p className="micro mb-3">
          {isToday ? 'Events on today' : `Events on ${scrubDate.toString()}`}
        </p>
        {eventsOnScrubDay.length === 0 ? (
          <p className="text-[12px] text-ink-3">No events.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-[12px]">
            {eventsOnScrubDay.map((ev) => {
              const entry = entries.find((x) => x.id === ev.entryId)
              return (
                <li key={ev.entryId + ev.date} className="flex items-center justify-between gap-3">
                  <span className="text-ink">
                    <span className={ev.kind === 'IN' ? 'text-in-ink' : 'text-out-ink'}>
                      {ev.kind === 'IN' ? '↑' : '↓'}
                    </span>{' '}
                    {entry?.name ?? ev.entryId}
                  </span>
                  <span className="mono text-ink-2">{USD.format(ev.amount)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="micro">Recurring income</p>
          <p className="display-sm mt-2">{incomeCount}</p>
        </div>
        <div className="card">
          <p className="micro">Recurring expense</p>
          <p className="display-sm mt-2">{expenseCount}</p>
        </div>
        <div className="card">
          <p className="micro">Events in window</p>
          <p className="display-sm mt-2">{windowEventsCount}</p>
        </div>
      </section>
    </div>
  )
}

// ── Inline reconcile drawer (Balance view) ───────────────────────────────────
// Renders as a card in the normal document flow, directly below the hero.
// Corrections are always for PAST dates — never today or primary date.
// Presets are relative to calendar today, clamped to before the primary snapshot.

const CORRECTION_DAY_OFFSETS = [-1, -3, -7, -14] as const
const CORRECTION_PRESET_LABELS: Record<number, string> = {
  '-1': 'Yesterday',
  '-3': '3 days ago',
  '-7': 'Last week',
  '-14': '2 weeks ago',
}

function correctedProjectedAt(
  projection: import('../lib/projection').Projection,
  primaryDate: Temporal.PlainDate,
  selDate: Temporal.PlainDate,
): number {
  // dayIndex of selDate relative to primary
  const dayIndex = primaryDate.until(selDate).total({ unit: 'day' })
  if (dayIndex >= 0) return projection.series[Math.min(dayIndex, projection.series.length - 1)]
  const idx = projection.pastDays + dayIndex
  return idx >= 0 && idx < projection.pastSeries.length ? projection.pastSeries[idx] : projection.series[0]
}

function BalanceInlineDrawer({
  projection,
  primaryAsOf,
  onCommit,
  onCancel,
}: {
  projection: import('../lib/projection').Projection
  primaryAsOf: string
  onCommit: (balance: number, asOf: string) => Promise<void>
  onCancel: () => void
}) {
  const primaryDate = Temporal.PlainDate.from(primaryAsOf)
  const calToday = Temporal.Now.plainDateISO()
  // Correction date must be strictly before primaryDate to create a seam, not overwrite it.
  const maxOffset = primaryDate.until(calToday).total({ unit: 'day' }) - 1 // at most yesterday relative to primary
  const clampedInitial = Math.min(-1, maxOffset >= 0 ? -1 : maxOffset)

  const calYesterday = calToday.subtract({ days: 1 })
  const [selDayOffset, setSelDayOffset] = useState(clampedInitial)
  const selDate = calToday.add({ days: selDayOffset })
  const projected = correctedProjectedAt(projection, primaryDate, selDate)
  const [amount, setAmount] = useState(() => projected.toFixed(2))
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const asserted = Number(amount.replace(/[^0-9.\-]/g, ''))
  const drift = Number.isFinite(asserted) ? asserted - projected : 0
  const driftPositive = drift >= 0

  function applyDate(d: Temporal.PlainDate) {
    const offset = Math.min(-1, Math.round(calToday.until(d).total({ unit: 'day' })))
    setSelDayOffset(offset)
    const clamped = calToday.add({ days: offset })
    if (!touched) setAmount(correctedProjectedAt(projection, primaryDate, clamped).toFixed(2))
  }

  function selectPreset(offset: number) {
    setSelDayOffset(offset)
    const d = calToday.add({ days: offset })
    if (!touched) setAmount(correctedProjectedAt(projection, primaryDate, d).toFixed(2))
  }

  async function commit() {
    if (!Number.isFinite(asserted)) return
    setSaving(true)
    try { await onCommit(Math.round(asserted * 100) / 100, selDate.toString()) }
    finally { setSaving(false) }
  }

  const DOW3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const dateLabel = `${DOW3[selDate.dayOfWeek - 1]} · ${selDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <section
      className="rounded-[14px] border p-5"
      style={{
        borderColor: `color-mix(in srgb, var(--cf-accent) 55%, var(--cf-line-2))`,
        background: 'var(--cf-surface)',
        boxShadow: `0 4px 16px color-mix(in srgb, var(--cf-accent) 12%, transparent)`,
      }}
    >
      {/* Header: ≠ RECONCILE BALANCE | date chip + presets */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-accent-ink"><SeamGlyph size={13} /></span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-accent-ink">
            Reconcile Balance
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="relative">
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
                  offset === selDayOffset
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

      {/* Large dollar input */}
      <div
        className="mb-4 flex items-center gap-1.5 rounded-xl border px-4 py-3 transition-colors focus-within:border-accent"
        style={{ borderColor: 'var(--cf-line-2)', background: 'var(--cf-surface-2)' }}
      >
        <span className="font-mono text-[26px] text-ink-3">$</span>
        <input
          autoFocus
          inputMode="decimal"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setTouched(true) }}
          className="min-w-0 flex-1 bg-transparent font-mono text-[28px] tracking-[-0.02em] text-ink outline-none placeholder:text-ink-4"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') onCancel() }}
        />
      </div>

      {/* Diff panel */}
      <div
        className="mb-4 grid items-center gap-2.5 rounded-[10px] border p-4"
        style={{
          gridTemplateColumns: '1fr auto 1fr',
          background: 'var(--cf-accent-soft)',
          borderColor: `color-mix(in srgb, var(--cf-accent) 50%, var(--cf-line-2))`,
          borderStyle: 'dashed',
        }}
      >
        <div className="flex flex-col gap-0.5">
          <p className="micro text-ink-3">Projected here</p>
          <p className="font-mono text-[15px] text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {USD.format(projected)}
          </p>
        </div>
        <span className="text-accent-ink"><SeamGlyph size={16} /></span>
        <div className="flex flex-col gap-0.5 text-right">
          <p className="micro text-ink-3">Your actual</p>
          <p className="font-mono text-[15px] text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Number.isFinite(asserted) ? USD.format(asserted) : '—'}
          </p>
        </div>
        <div className="col-span-full text-center font-mono text-[12px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
          className="cursor-pointer rounded-field border border-line-2 px-4 py-2 text-[13px] text-ink-2 transition-colors hover:text-ink"
        >Cancel</button>
        <button
          type="button" onClick={() => void commit()} disabled={saving || !Number.isFinite(asserted)}
          className="cursor-pointer rounded-field px-4 py-2 text-[13px] text-accent-on transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--cf-accent-ink)', border: '1px solid var(--cf-accent-ink)' }}
        >{saving ? 'Saving…' : 'Set balance'}</button>
      </div>
    </section>
  )
}
