import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: BalancePage,
})

function BalancePage() {
  return (
    <div className="flex flex-col gap-4">
      <section className="card flex items-start justify-between">
        <div>
          <p className="micro">Projected balance · today</p>
          <p className="display mt-2">$0.00</p>
          <p className="mono mt-2 text-[12px] text-ink-3">Add an anchor balance to get started.</p>
        </div>
      </section>

      <section className="card">
        <p className="micro mb-3">Chart</p>
        <div className="h-80 rounded-field border border-dashed border-line-2 grid place-items-center text-ink-3 text-[12px]">
          ChartLine — projection over horizon
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="micro">Between now &amp; then</p>
        </div>
        <div className="card">
          <p className="micro">On this day</p>
        </div>
        <div className="card">
          <p className="micro">Low point ahead</p>
        </div>
      </section>
    </div>
  )
}
