// "Update balance" reconciliation dialog.
// User asserts their real balance as of a chosen date. The projection engine
// re-bases everything after that point from the asserted value.

import { useRef, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { X } from 'lucide-react'
import type { Projection } from '#/lib/projection'

type Props = {
  projection: Projection
  primaryAsOf: string // ISO date — the current anchor (today)
  onCommit: (balance: number, asOf: string) => Promise<void>
  onCancel: () => void
}

const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: -1 },
  { label: '3 days ago', days: -3 },
  { label: 'Last week', days: -7 },
] as const

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// Balance at a given dayIndex (relative to primary.asOf), drawn from the
// projection's series (forward) or pastSeries (backward).
function balanceAt(projection: Projection, dayIndex: number): number {
  if (dayIndex >= 0) {
    return projection.series[Math.min(dayIndex, projection.series.length - 1)]
  }
  const pastIdx = projection.pastDays + dayIndex
  if (pastIdx >= 0 && pastIdx < projection.pastSeries.length) {
    return projection.pastSeries[pastIdx]
  }
  return projection.series[0]
}

export default function ReconcileDialog({ projection, primaryAsOf, onCommit, onCancel }: Props) {
  const [selDays, setSelDays] = useState(0) // days from today
  const [amount, setAmount] = useState(() => projection.series[0].toFixed(2))
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const today = Temporal.PlainDate.from(primaryAsOf)
  const selDate = today.add({ days: selDays })
  const projected = balanceAt(projection, selDays)
  const asserted = parseAmount(amount)
  const drift = asserted - projected
  const driftPositive = drift >= 0

  // Follow projection when date changes and user hasn't typed
  function selectPreset(days: number) {
    setSelDays(days)
    if (!touched) {
      setAmount(balanceAt(projection, days).toFixed(2))
    }
  }

  async function commit() {
    setSaving(true)
    try {
      await onCommit(Math.round(asserted * 100) / 100, selDate.toString())
    } finally {
      setSaving(false)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void commit()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(26,26,23,0.32)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="flex w-[460px] max-w-full flex-col overflow-hidden rounded-[16px] border border-line bg-surface"
        style={{ boxShadow: 'var(--cf-shadow-modal)' }}
        onKeyDown={onKey}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] border border-accent/40 bg-accent-soft text-accent-ink">
              <SeamGlyph size={15} />
            </span>
            <div>
              <p className="micro">Balance snapshot</p>
              <h2 className="mt-0.5 text-[17px] font-medium">Update your real balance</h2>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="flex p-1.5 text-ink-3 transition-colors hover:text-ink"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* body */}
        <div className="flex flex-col gap-4 px-5 py-[18px]">
          {/* date presets */}
          <div>
            <p className="micro mb-2">As of</p>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => selectPreset(p.days)}
                  className={`rounded-chip border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    p.days === selDays
                      ? 'border-accent bg-accent-soft text-accent-ink'
                      : 'border-line-2 text-ink-2 hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <span className="rounded-chip border border-line-2 px-2.5 py-1 font-mono text-[11px] text-ink-3">
                {selDate.toString()}
              </span>
            </div>
          </div>

          {/* amount */}
          <div>
            <p className="micro mb-2">Actual balance</p>
            <div
              className="flex items-center gap-1 rounded-[12px] border border-line-2 bg-surface-2 px-4 py-3 transition-colors focus-within:border-accent focus-within:bg-surface"
              style={{ '--tw-shadow': `0 0 0 3px color-mix(in srgb, var(--cf-accent) 18%, transparent)` } as React.CSSProperties}
            >
              <span className="font-mono text-[26px] text-ink-3">$</span>
              <input
                ref={inputRef}
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setTouched(true) }}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent font-mono text-[30px] tracking-[-0.02em] text-ink outline-none placeholder:text-ink-4"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
          </div>

          {/* live diff */}
          <div
            className="grid items-center gap-2.5 rounded-[12px] border p-4"
            style={{
              gridTemplateColumns: '1fr auto 1fr',
              background: 'var(--cf-accent-soft)',
              borderColor: `color-mix(in srgb, var(--cf-accent) 50%, var(--cf-line-2))`,
              borderStyle: 'dashed',
            }}
          >
            <div className="flex flex-col gap-0.5">
              <p className="micro" style={{ color: 'var(--cf-ink-3)' }}>Projected here</p>
              <p className="font-mono text-[16px] text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {USD.format(projected)}
              </p>
            </div>
            <SeamGlyph size={16} className="text-accent-ink" />
            <div className="flex flex-col gap-0.5 text-right">
              <p className="micro" style={{ color: 'var(--cf-ink-3)' }}>Your actual</p>
              <p className="font-mono text-[16px] text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {USD.format(asserted)}
              </p>
            </div>
            <div className="col-span-full mt-1 text-center font-mono text-[12.5px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {Math.abs(drift) < 0.005
                ? <span className="text-ink-3">No change — matches projection</span>
                : <span className={driftPositive ? 'text-in-ink' : 'text-out-ink'}>
                    {driftPositive ? '▲' : '▼'} {USD.format(Math.abs(drift))} correction · re-bases everything after
                  </span>}
            </div>
          </div>

          <p className="font-mono text-[11px] leading-relaxed text-ink-3">
            A snapshot pins your real balance at a moment in time. The projection keeps your recurring entries but re-bases from this number forward.
          </p>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-field border border-line-2 px-4 py-2 text-[13px] text-ink-2 transition-colors hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => void commit()}
            disabled={saving}
            className="rounded-field border border-accent-ink bg-accent-ink px-4 py-2 text-[13px] text-surface transition-colors hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Set balance'}
          </button>
        </div>
      </div>
    </div>
  )
}

// The ≠-style reconcile glyph used on the button and dialog header.
export function SeamGlyph({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      className={className}
    >
      <path d="M2.5 6.2h11M2.5 9.8h11" />
      <path d="M11 2.5L5 13.5" />
    </svg>
  )
}
