import { createFileRoute } from '@tanstack/react-router'
import { requireAnchor } from '../lib/route-guards'

export const Route = createFileRoute('/ledger')({
  beforeLoad: requireAnchor,
  component: LedgerPage,
})

function LedgerPage() {
  return (
    <div className="card">
      <p className="micro">Ledger</p>
      <p className="mt-2 text-[12px] text-ink-3">Not designed yet.</p>
    </div>
  )
}
