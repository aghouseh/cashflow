import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { readAnchor } from '../lib/data/anchor'
import { listEntries } from '../lib/data/entry'
import { useDbReady } from '../lib/db/ready'
import type { Anchor, Entry } from '../lib/db/schema'
import { requireAnchor } from '../lib/route-guards'

export const Route = createFileRoute('/')({
  beforeLoad: requireAnchor,
  component: BalancePage,
})

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function BalancePage() {
  const ready = useDbReady()
  const [anchor, setAnchor] = useState<Anchor | undefined>()
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    Promise.all([readAnchor(), listEntries()]).then(([a, e]) => {
      if (cancelled) return
      setAnchor(a)
      setEntries(e)
    })
    return () => {
      cancelled = true
    }
  }, [ready])

  const incomeCount = entries.filter((e) => e.kind === 'IN').length
  const expenseCount = entries.filter((e) => e.kind === 'OUT').length

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex items-start justify-between">
        <div>
          <p className="micro">Projected balance · today</p>
          <p className="display mt-2">
            {anchor ? USD.format(anchor.balance) : '—'}
          </p>
          <p className="mono mt-2 text-[12px] text-ink-3">
            {anchor
              ? `As of ${anchor.asOf}${anchor.accountLabel ? ` · ${anchor.accountLabel}` : ''}`
              : 'Loading…'}
          </p>
        </div>
      </section>

      <section className="card">
        <p className="micro mb-3">Chart</p>
        <div className="h-80 rounded-field border border-dashed border-line-2 grid place-items-center text-ink-3 text-[12px]">
          ChartLine — projection over horizon (not built yet)
        </div>
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
          <p className="micro">Total entries</p>
          <p className="display-sm mt-2">{entries.length}</p>
        </div>
      </section>

      <section className="card">
        <p className="micro mb-3">Stored entries (raw)</p>
        {entries.length === 0 ? (
          <p className="text-[12px] text-ink-3">No entries.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-[12px]">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span className="text-ink">
                  <span className={e.kind === 'IN' ? 'text-in-ink' : 'text-out-ink'}>
                    {e.kind === 'IN' ? '↑' : '↓'}
                  </span>{' '}
                  {e.name}
                </span>
                <span className="mono text-ink-2">
                  {USD.format(e.amount)}
                  {e.rrule ? ` · ${e.rrule}` : ' · one-time'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
