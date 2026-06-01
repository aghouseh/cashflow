import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Temporal } from '@js-temporal/polyfill'
import { listSnapshots } from '../lib/data/snapshot'
import { listEntries } from '../lib/data/entry'
import { initDb } from '../lib/db/init'
import { project, type ProjectionEvent, type ReconcileMark } from '../lib/projection'
import { cadenceForRrule } from '../lib/cadence'
import { requireSnapshot } from '../lib/route-guards'

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
  run: number
  name: string
  cadenceLabel: string
}
type ReconcileItem = { type: 'reconcile'; y: number; h: number; mark: ReconcileMark }
type LedgerItem = AnchorItem | HeaderItem | EventItem | ReconcileItem

type LedgerModel = {
  items: LedgerItem[]
  eventItems: EventItem[]
  totalH: number
}

function buildModel(
  startBalance: number,
  events: ProjectionEvent[],
  nameById: Map<string, string>,
  cadenceById: Map<string, string>,
  marks: ReconcileMark[] = [],
): LedgerModel {
  // Separate past (dayIndex ≤ 0) from future (dayIndex > 0) events.
  // Both arrive sorted ascending by dayIndex from the projection engine.
  const futureEvents = events.filter((e) => e.dayIndex > 0)

  // Running balance for future events (forward from startBalance).
  const futureRunning: number[] = []
  let bal = startBalance
  for (const e of futureEvents) {
    bal += e.amount
    futureRunning.push(bal)
  }

  // Per-month net for future header rows.
  const monthNet = new Map<string, number>()
  for (const e of futureEvents) {
    const key = e.date.slice(0, 7)
    monthNet.set(key, (monthNet.get(key) ?? 0) + e.amount)
  }

  const items: LedgerItem[] = []
  let y = 0

  // ── anchor row (today) ───────────────────────────────────────────────────
  items.push({ type: 'anchor', y, h: ANCHOR_H })
  y += ANCHOR_H

  // ── reconcile marks at dayIndex ≤ 0 (past / today) ──────────────────────
  // Show them in ascending order (oldest first, i.e. most negative dayIndex first).
  // In the ledger scroll they appear right after the anchor at the top.
  const pastMarks = [...marks].sort((a, b) => a.dayIndex - b.dayIndex)
  for (const m of pastMarks) {
    items.push({ type: 'reconcile', y, h: SEAM_H, mark: m })
    y += SEAM_H
  }

  // ── future section ───────────────────────────────────────────────────────
  let curKey: string | null = null
  futureEvents.forEach((e, i) => {
    const key = e.date.slice(0, 7)
    if (key !== curKey) {
      const d = Temporal.PlainDate.from(e.date)
      items.push({
        type: 'header',
        y,
        h: HEADER_H,
        label: `${MONTHS_LONG[d.month - 1]} ${d.year}`,
        net: monthNet.get(key) ?? 0,
      })
      y += HEADER_H
      curKey = key
    }
    items.push({
      type: 'event',
      y,
      h: ROW_H,
      event: e,
      run: futureRunning[i],
      name: nameById.get(e.entryId) ?? e.entryId,
      cadenceLabel: cadenceById.get(e.entryId) ?? '',
    })
    y += ROW_H
  })

  const totalH = y + 48
  const eventItems = items.filter((it): it is EventItem => it.type === 'event')
  return { items, eventItems, totalH }
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
    const { events, series, marks } = projection
    const nameById = new Map(entries.map((e) => [e.id, e.name]))
    const cadenceById = new Map(
      entries.map((e) => [e.id, cadenceForRrule(e.rrule).label]),
    )
    const model = buildModel(snapshot.balance, events, nameById, cadenceById, marks)
    return { snapshot, model, series, events }
  },
  component: LedgerPage,
})

function LedgerPage() {
  const data = Route.useLoaderData()
  const [viewH, setViewH] = useState(560)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)

  // Hooks must run unconditionally — derive items before the data guard so the
  // virtualizer can be created in all cases (count 0 when there's no data yet).
  const items = data?.model.items ?? []
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller,
    estimateSize: (i) => items[i]?.h ?? ROW_H,
    overscan: 6,
  })

  if (!data) {
    return <div className="card text-[12px] text-ink-3">Loading…</div>
  }

  const { snapshot, model, series, events } = data
  const { eventItems, totalH } = model
  const asOf = Temporal.PlainDate.from(snapshot.asOf)
  const scrollOffset = virtualizer.scrollOffset ?? 0
  const focusY = scrollOffset + viewH * FOCUS_FRACTION

  // Event currently under the focus line.
  let focused: EventItem | null = null
  for (const it of eventItems) {
    if (it.y <= focusY) {
      focused = it
    } else {
      break
    }
  }

  const focusedDay = focused ? focused.event.dayIndex : 0
  const focusedBal = focused ? focused.run : snapshot.balance
  const focusedDate = asOf.add({ days: focusedDay })
  const delta = focusedBal - snapshot.balance

  // Income / expense / net between today and the focused day.
  let betweenIn = 0
  let betweenOut = 0
  for (const e of events) {
    if (e.dayIndex > focusedDay) {
      break
    }
    if (e.amount >= 0) {
      betweenIn += e.amount
    } else {
      betweenOut += e.amount
    }
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
    if (!el) {
      return
    }
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
    if (it) {
      scrollToY(it.y)
    }
  }

  function stepEvent(dir: 1 | -1) {
    const idx = focused ? eventItems.indexOf(focused) : -1
    const nextIdx = Math.max(0, Math.min(idx + dir, eventItems.length - 1))
    const it = eventItems[nextIdx]
    if (it) {
      scrollToY(it.y)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      stepEvent(1)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      stepEvent(-1)
    }
  }

  return (
    <div className="flex flex-col">
      <header className="flex items-end justify-between pb-3">
        <div className="flex flex-col gap-1">
          <p className="micro">Ledger · every movement</p>
          <h1 className="text-[19px] font-medium tracking-tight">Scroll the timeline forward</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="micro">Focused on</p>
          <p className="mono text-[13px] text-ink-2">
            {focusedDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_296px] items-start gap-[18px]">
        <div className="flex flex-col">
          <div className="ld-grid rounded-t-card border border-b-0 border-line bg-card px-4 py-2.5">
            <span className="micro">Date</span>
            <span />
            <span className="micro">Movement</span>
            <span className="micro text-right">Amount</span>
            <span className="micro text-right">Balance</span>
          </div>

          <div
            ref={viewportRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="relative h-[calc(100dvh-13rem)] overflow-hidden rounded-b-card border border-line bg-card outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--cf-line-2)]"
          >
            <div
              ref={setScroller}
              className="ld-scroll h-full overflow-y-auto overflow-x-hidden"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const it = items[vi.index]
                  const style = {
                    position: 'absolute' as const,
                    top: 0,
                    left: 0,
                    right: 0,
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  }
                  if (it.type === 'anchor') {
                    return (
                      <div key={vi.key} style={style}>
                        <AnchorRow
                          h={it.h}
                          balance={snapshot.balance}
                          asOf={asOf}
                          label={snapshot.accountLabel}
                        />
                      </div>
                    )
                  }
                  if (it.type === 'header') {
                    return (
                      <div key={vi.key} style={style}>
                        <HeaderRow item={it} />
                      </div>
                    )
                  }
                  if (it.type === 'reconcile') {
                    return (
                      <div key={vi.key} style={style}>
                        <SeamRow item={it} asOf={asOf} />
                      </div>
                    )
                  }
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

            <div
              className="pointer-events-none absolute inset-x-0 z-[3] flex items-center"
              style={{ top: viewH * FOCUS_FRACTION }}
            >
              <span className="ld-focus-diamond" />
              <span className="h-px flex-1 bg-amber opacity-85" />
              <span className="ld-focus-tag mono">
                {focusedDate.toLocaleString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
                {USD.format(focusedBal)}
              </span>
            </div>
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
          onJump={scrollToDay}
        />
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
      className="grid grid-cols-[64px_1fr_auto] items-center border-b border-line bg-gradient-to-b from-card-2 to-card px-4"
    >
      <div className="flex justify-center">
        <span className="size-[11px] rounded-full bg-ink shadow-[0_0_0_4px_var(--cf-surface),0_0_0_5px_var(--cf-line-2)]" />
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
  return (
    <div style={{ height: item.h }}>
      <div
        className={`ld-grid h-full border-b border-line px-4 transition-colors ${
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
            className="relative z-[1] size-[9px] rounded-full border-[1.5px] bg-card"
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
        <div className="mono text-right text-[13px] text-ink-2">{USD.format(item.run)}</div>
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
        background: 'color-mix(in oklch, var(--cf-accent-soft) 60%, var(--cf-surface))',
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
          className="relative z-[1] h-[11px] w-[11px]"
          style={{
            background: 'var(--cf-surface)',
            border: '1.6px solid var(--cf-accent)',
            transform: 'rotate(45deg)',
          }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
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
  focusedDay,
  focusedBal,
  focusedDate,
  delta,
  betweenIn,
  betweenOut,
  jumps,
  onJump,
}: {
  focusedDay: number
  focusedBal: number
  focusedDate: Temporal.PlainDate
  delta: number
  betweenIn: number
  betweenOut: number
  jumps: { key: string; label: string; day: number }[]
  onJump: (day: number) => void
}) {
  const sign = delta > 0 ? 'in' : delta < 0 ? 'out' : null
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
      <div className="card flex flex-col">
        <p className="micro">At this point {focusedDay === 0 ? '· today' : `· in ${focusedDay} days`}</p>
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
