import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import ChartStrip, { type ChartWindow } from '../components/ChartStrip'
import { readLatestSnapshot } from '../lib/data/snapshot'
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
    const [snapshot, entries] = await Promise.all([
      readLatestSnapshot(),
      listEntries(),
    ])
    if (!snapshot) throw new Error('snapshot missing after requireSnapshot')
    const projection = project(snapshot, entries, HORIZON_DAYS_MAX)
    return { snapshot, entries, projection }
  },
  component: BalancePage,
})

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function BalancePage() {
  const data = Route.useLoaderData()
  const [windowKey, setWindowKey] = useState<WindowKey>(DEFAULT_WINDOW)
  const [pageIndex, setPageIndex] = useState(0)
  const initialScrub = Math.floor(windowDaysFor(DEFAULT_WINDOW) / 2)
  const [scrubOffset, setScrubOffset] = useState(initialScrub)
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
        <div className="text-right text-[12px] text-ink-3">
          <p className="micro">Lowest in window</p>
          <p className="mono mt-1 text-ink-2">{USD.format(windowMin)}</p>
          <p className="mono mt-1">{lowestDate.toString()}</p>
        </div>
      </section>

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
