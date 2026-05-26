import { createFileRoute } from '@tanstack/react-router'
import { requireAnchor } from '../lib/route-guards'

export const Route = createFileRoute('/entries')({
  beforeLoad: requireAnchor,
  component: EntriesPage,
})

function EntriesPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="micro">Entries</p>
          <h1 className="text-[22px] font-medium tracking-tight">Recurring &amp; scheduled</h1>
        </div>
        <button
          type="button"
          className="rounded-chip border border-line-2 px-3 py-1.5 text-[12px] text-ink hover:bg-card-2"
        >
          + New entry
        </button>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="micro">Monthly income</p>
          <p className="display-sm mt-2">$0</p>
        </div>
        <div className="card">
          <p className="micro">Monthly expense</p>
          <p className="display-sm mt-2">$0</p>
        </div>
        <div className="card">
          <p className="micro">Net per month</p>
          <p className="display-sm mt-2">$0</p>
        </div>
      </section>

      <section className="card">
        <p className="micro mb-3">Income · recurring</p>
        <p className="text-[12px] text-ink-3">No entries yet.</p>
      </section>

      <section className="card">
        <p className="micro mb-3">Expenses · recurring</p>
        <p className="text-[12px] text-ink-3">No entries yet.</p>
      </section>

      <section className="card">
        <p className="micro mb-3">One-offs · upcoming</p>
        <p className="text-[12px] text-ink-3">No entries yet.</p>
      </section>
    </div>
  )
}
