import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import ChartLine from '../components/ChartLine'
import { readLatestSnapshot } from '../lib/data/snapshot'
import { listEntries } from '../lib/data/entry'
import { initDb } from '../lib/db/init'
import { project } from '../lib/projection'
import { requireSnapshot } from '../lib/route-guards'

const HORIZON_DAYS = 90

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
    const projection = project(snapshot, entries, HORIZON_DAYS)
    return { snapshot, entries, projection }
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

  const { snapshot, entries, projection } = data
  const { series, events } = projection

  const asOf = Temporal.PlainDate.from(snapshot.asOf)
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
              ? `As of ${snapshot.asOf}${snapshot.accountLabel ? ` · ${snapshot.accountLabel}` : ''}`
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
        <ChartLine
          series={series}
          events={events}
          asOf={snapshot.asOf}
          scrubOffset={scrubOffset}
          onScrubChange={setScrubOffset}
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

