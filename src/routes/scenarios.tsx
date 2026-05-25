import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/scenarios')({
  component: ScenariosPage,
})

function ScenariosPage() {
  return (
    <div className="card">
      <p className="micro">Scenarios</p>
      <p className="mt-2 text-[12px] text-ink-3">Out of scope for v1.</p>
    </div>
  )
}
