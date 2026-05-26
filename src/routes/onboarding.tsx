import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useDbReady } from '../lib/db/ready'
import { writeAnchor } from '../lib/data/anchor'
import { createEntry } from '../lib/data/entry'
import { CADENCES, type CadenceKey, findCadence } from '../lib/cadence'

import { redirectIfAnchored } from '../lib/route-guards'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: redirectIfAnchored,
  component: OnboardingPage,
})

type Step = 'anchor' | 'income' | 'expense'

function OnboardingPage() {
  const ready = useDbReady()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('anchor')

  if (!ready) {
    return <p className="micro mt-12 text-center">Initializing…</p>
  }

  function next() {
    if (step === 'anchor') setStep('income')
    else if (step === 'income') setStep('expense')
    else navigate({ to: '/' })
  }

  return (
    <div className="mx-auto mt-8 flex max-w-130 flex-col gap-4">
      <StepPip step={step} />
      {step === 'anchor' && <AnchorStep onDone={next} />}
      {step === 'income' && <EntryStep kind="IN" onDone={next} onSkip={next} />}
      {step === 'expense' && <EntryStep kind="OUT" onDone={next} onSkip={next} />}
    </div>
  )
}

const STEPS: ReadonlyArray<{ key: Step; label: string }> = [
  { key: 'anchor', label: 'Anchor' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expenses' },
]

function StepPip({ step }: { step: Step }) {
  const activeIdx = STEPS.findIndex((s) => s.key === step)
  return (
    <div className="flex items-center justify-between">
      <p className="micro">Cashflow setup · {activeIdx + 1} of 3</p>
      <ol className="flex items-center gap-1.5" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === activeIdx ? 'step' : undefined}
            className={`h-1.5 w-6 rounded-full ${
              i <= activeIdx ? 'bg-ink' : 'bg-line-2'
            }`}
          />
        ))}
      </ol>
    </div>
  )
}

function AnchorStep({ onDone }: { onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [balance, setBalance] = useState('')
  const [asOf, setAsOf] = useState(today)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = Number(balance)
  const canSubmit = !Number.isNaN(amount) && balance.trim() !== '' && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await writeAnchor({
        balance: amount,
        asOf,
        accountLabel: label.trim() || null,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save anchor')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4">
      <header>
        <h1 className="text-[20px] font-medium tracking-tight">
          What's in the account today?
        </h1>
        <p className="mt-1 text-[12px] text-ink-2">
          Cashflow projects forward from this single number. You can change it any time.
        </p>
      </header>

      <Field label="Current balance" hint="In dollars. Negatives are fine if you're underwater.">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mono text-ink-3">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0.00"
            className="input pl-7 text-right tabular-nums"
            autoFocus
          />
        </div>
      </Field>

      <Field label="As of">
        <input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          className="input"
        />
      </Field>

      <Field label="Account label" hint="Optional. Helpful if you'll add other accounts later.">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Chase · 4820"
          className="input"
        />
      </Field>

      {error && <p className="text-[12px] text-out-ink">{error}</p>}

      <footer className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-field bg-ink px-4 py-1.5 text-[13px] text-card disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Continue →'}
        </button>
      </footer>
    </form>
  )
}

function EntryStep({
  kind,
  onDone,
  onSkip,
}: {
  kind: 'IN' | 'OUT'
  onDone: () => void
  onSkip: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [cadence, setCadence] = useState<CadenceKey>('monthly')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountNum = Number(amount)
  const canSubmit =
    name.trim() !== '' && !Number.isNaN(amountNum) && amount.trim() !== '' && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await createEntry({
        kind,
        name: name.trim(),
        amount: amountNum,
        startDate,
        rrule: findCadence(cadence).rrule,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry')
      setBusy(false)
    }
  }

  const heading = kind === 'IN' ? 'Add a recurring income' : 'Add a recurring expense'
  const blurb =
    kind === 'IN'
      ? 'Paychecks, transfers in, anything you expect to land regularly.'
      : 'Rent, subscriptions, card payments — anything that leaves on a schedule.'
  const placeholder = kind === 'IN' ? 'e.g. Paycheck' : 'e.g. Rent'

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4">
      <header>
        <h1 className="text-[20px] font-medium tracking-tight">{heading}</h1>
        <p className="mt-1 text-[12px] text-ink-2">{blurb}</p>
      </header>

      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="input"
          autoFocus
        />
      </Field>

      <Field label="Amount">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mono text-ink-3">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input pl-7 text-right tabular-nums"
          />
        </div>
      </Field>

      <Field label="Cadence">
        <div className="flex flex-wrap gap-1.5">
          {CADENCES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCadence(c.key)}
              className={`rounded-chip border px-3 py-1 text-[12px] transition-colors ${
                cadence === c.key
                  ? 'border-ink bg-ink text-card'
                  : 'border-line-2 text-ink-2 hover:text-ink'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={cadence === 'one-time' ? 'Date' : 'Starting'}>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="input"
        />
      </Field>

      {error && <p className="text-[12px] text-out-ink">{error}</p>}

      <footer className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          Skip this step
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-field bg-ink px-4 py-1.5 text-[13px] text-card disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save & continue →'}
        </button>
      </footer>
    </form>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="micro mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
    </div>
  )
}
