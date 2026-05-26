import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { readAnchor } from '../lib/data/anchor'
import { listEntries } from '../lib/data/entry'
import { initDb } from '../lib/db/init'
import { project } from '../lib/projection'
import { requireAnchor } from '../lib/route-guards'

const HORIZON_DAYS = 90

export const Route = createFileRoute('/')({
  beforeLoad: requireAnchor,
  loader: async () => {
    // SSR/prerender has no OPFS — return a sentinel and let the client re-run.
    if (typeof window === 'undefined') return null
    await initDb()
    const [anchor, entries] = await Promise.all([readAnchor(), listEntries()])
    if (!anchor) throw new Error('anchor missing after requireAnchor')
    const projection = project(anchor, entries, HORIZON_DAYS)
    return { anchor, entries, projection }
  },
  component: BalancePage,
})

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function BalancePage() {
  const data = Route.useLoaderData()
  const [scrubOffset, setScrubOffset] = useState(0)

  if (!data) {
    return (
      <div className="card text-[12px] text-ink-3">Loading…</div>
    )
  }

  const { anchor, entries, projection } = data
  const { series, events } = projection

  const asOf = Temporal.PlainDate.from(anchor.asOf)
  const scrubDate = asOf.add({ days: scrubOffset })
  const balanceNow = series[0]
  const balanceAtScrub = series[scrubOffset]
  const netChange = balanceAtScrub - balanceNow

  const min = Math.min(...series)
  const lowestIdx = series.indexOf(min)
  const lowestDate = asOf.add({ days: lowestIdx })

  const eventsOnScrubDay = events.filter((e) => e.dayIndex === scrubOffset)

  const incomeCount = entries.filter((e) => e.kind === 'IN' && !e.paused).length
  const expenseCount = entries.filter((e) => e.kind === 'OUT' && !e.paused).length

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex items-start justify-between">
        <div>
          <p className="micro">Projected balance · {scrubOffset === 0 ? 'today' : scrubDate.toString()}</p>
          <p className="display mt-2">{USD.format(balanceAtScrub)}</p>
          <p className="mono mt-2 text-[12px] text-ink-3">
            {scrubOffset === 0
              ? `As of ${anchor.asOf}${anchor.accountLabel ? ` · ${anchor.accountLabel}` : ''}`
              : `${netChange >= 0 ? '+' : ''}${USD.format(netChange)} vs today · day +${scrubOffset}`}
          </p>
        </div>
        <div className="text-right text-[12px] text-ink-3">
          <p className="micro">Lowest point</p>
          <p className="mono mt-1 text-ink-2">{USD.format(min)}</p>
          <p className="mono mt-1">{lowestDate.toString()}</p>
        </div>
      </section>

      <section className="card">
        <p className="micro mb-3">Projection · next {HORIZON_DAYS} days</p>
        <Sparkline series={series} scrubOffset={scrubOffset} />
        <input
          type="range"
          min={0}
          max={HORIZON_DAYS}
          value={scrubOffset}
          onChange={(e) => setScrubOffset(Number(e.target.value))}
          className="mt-3 w-full accent-amber-500"
        />
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
          <p className="micro">Events in horizon</p>
          <p className="display-sm mt-2">{events.length}</p>
        </div>
      </section>

      <section className="card">
        <p className="micro mb-3">
          {scrubOffset === 0 ? 'Events on today' : `Events on ${scrubDate.toString()}`}
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
    </div>
  )
}

function Sparkline({ series, scrubOffset }: { series: number[]; scrubOffset: number }) {
  const width = 800
  const height = 200
  const padX = 8
  const padY = 8
  const max = Math.max(...series)
  const min = Math.min(...series)
  const range = max - min || 1
  const stepX = (width - padX * 2) / (series.length - 1)
  const yFor = (v: number) => padY + (1 - (v - min) / range) * (height - padY * 2)
  const path = series
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${padX + i * stepX} ${yFor(v)}`)
    .join(' ')
  const scrubX = padX + scrubOffset * stepX
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-48 w-full rounded-field border border-line-2 bg-card-2"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-ink-2" />
      <line
        x1={scrubX}
        y1={padY}
        x2={scrubX}
        y2={height - padY}
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-amber-500"
      />
      <circle cx={scrubX} cy={yFor(series[scrubOffset])} r={4} className="fill-amber-500" />
    </svg>
  )
}
