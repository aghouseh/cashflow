import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { track } from '../lib/analytics/index.js'
import { useRef, useState } from 'react'
import { seedDevData } from '../lib/dev/seed'
import { useDbReady } from '../lib/db/ready'
import { writeSnapshot } from '../lib/data/snapshot'
import { createEntry, updateEntry } from '../lib/data/entry'
import { CADENCES, type CadenceKey, findCadence } from '../lib/cadence'

import { redirectIfSnapshotted } from '../lib/route-guards'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: redirectIfSnapshotted,
  component: OnboardingPage,
})

type Step = 'snapshot' | 'income' | 'expense'

type SnapshotDraft = {
  balance: string
  asOf: string
  label: string
}

type EntryDraft = {
  name: string
  amount: string
  startDate: string
  cadence: CadenceKey
}

const today = () => new Date().toISOString().slice(0, 10)

const DEFAULT_BALANCE = '0.00'
const DEFAULT_LABEL = 'Checking'
const DEFAULT_AMOUNT = '0.00'
const DEFAULT_INCOME_NAME = 'Paycheck'
const DEFAULT_EXPENSE_NAME = 'Rent'

const emptyEntryDraft = (defaultName: string): EntryDraft => ({
  name: defaultName,
  amount: DEFAULT_AMOUNT,
  startDate: today(),
  cadence: 'monthly',
})

function OnboardingPage() {
  const ready = useDbReady()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('snapshot')

  const [snapshotDraft, setSnapshotDraft] = useState<SnapshotDraft>({
    balance: DEFAULT_BALANCE,
    asOf: today(),
    label: DEFAULT_LABEL,
  })
  const [incomeDraft, setIncomeDraft] = useState<EntryDraft>(emptyEntryDraft(DEFAULT_INCOME_NAME))
  const [expenseDraft, setExpenseDraft] = useState<EntryDraft>(emptyEntryDraft(DEFAULT_EXPENSE_NAME))
  const [incomeId, setIncomeId] = useState<string | null>(null)
  const [expenseId, setExpenseId] = useState<string | null>(null)
  const startedRef = useRef(false)

  if (!ready) {
    return <p className="micro mt-12 text-center">Initializing…</p>
  }

  if (!startedRef.current) {
    startedRef.current = true
    track('onboarding_started')
  }

  function next() {
    if (step === 'snapshot') setStep('income')
    else if (step === 'income') setStep('expense')
    else {
      track('onboarding_complete')
      navigate({ to: '/' })
    }
  }

  function back() {
    if (step === 'expense') setStep('income')
    else if (step === 'income') setStep('snapshot')
  }

  return (
    <div className="mx-auto mt-8 flex max-w-130 flex-col gap-4">
      {import.meta.env.DEV && <DevSeedBanner onSeed={() => navigate({ to: '/' })} />}
      <StepPip step={step} />
      {step === 'snapshot' && (
        <SnapshotStep
          draft={snapshotDraft}
          onDraftChange={setSnapshotDraft}
          onDone={next}
        />
      )}
      {step === 'income' && (
        <EntryStep
          kind="IN"
          draft={incomeDraft}
          onDraftChange={setIncomeDraft}
          entryId={incomeId}
          onEntryIdChange={setIncomeId}
          onDone={next}
          onSkip={next}
          onBack={back}
        />
      )}
      {step === 'expense' && (
        <EntryStep
          kind="OUT"
          draft={expenseDraft}
          onDraftChange={setExpenseDraft}
          entryId={expenseId}
          onEntryIdChange={setExpenseId}
          onDone={next}
          onSkip={next}
          onBack={back}
        />
      )}
    </div>
  )
}

const STEPS: ReadonlyArray<{ key: Step; label: string }> = [
  { key: 'snapshot', label: 'Balance' },
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

function SnapshotStep({
  draft,
  onDraftChange,
  onDone,
}: {
  draft: SnapshotDraft
  onDraftChange: (next: SnapshotDraft) => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = Number(draft.balance)
  const canSubmit = !Number.isNaN(amount) && draft.balance.trim() !== '' && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await writeSnapshot({
        balance: amount,
        asOf: draft.asOf,
        accountLabel: draft.label.trim() || null,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save balance')
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card flex flex-col gap-4"
      autoComplete="off"
    >
      <header>
        <h1 className="text-[20px] font-medium tracking-tight">
          What's in the account today?
        </h1>
        <p className="mt-1 text-[12px] text-ink-2">
          Cashflow projects forward from this single number. You can change it any time.
        </p>
      </header>

      <Field label="Current balance" hint="In dollars. Negatives are fine if you're underwater." id="ob-balance">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mono text-ink-3">$</span>
          <input
            // `type="text"` + `inputMode="decimal"` is the standard money-input
            // pattern: numeric keyboard on mobile, no native spinner buttons,
            // no locale-dependent stepping behavior of `type="number"`.
            id="ob-balance"
            type="text"
            inputMode="decimal"
            name="cashflow-snapshot-balance"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={draft.balance}
            onChange={(e) => onDraftChange({ ...draft, balance: e.target.value })}
            onFocus={(e) => { if (e.target.value === DEFAULT_BALANCE) e.target.select() }}
            placeholder="0.00"
            className="input pl-7 text-right tabular-nums"
            autoFocus
          />
        </div>
      </Field>

      <Field label="As of" id="ob-asof">
        <input
          id="ob-asof"
          type="date"
          name="cashflow-snapshot-as-of"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={draft.asOf}
          onChange={(e) => onDraftChange({ ...draft, asOf: e.target.value })}
          className="input"
        />
      </Field>

      <Field label="Account label" hint="Optional. Helpful if you'll add other accounts later." id="ob-label">
        <input
          id="ob-label"
          type="text"
          name="cashflow-snapshot-account-label"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={draft.label}
          onChange={(e) => onDraftChange({ ...draft, label: e.target.value })}
          onFocus={(e) => { if (e.target.value === DEFAULT_LABEL) e.target.select() }}
          placeholder="e.g. Chase · 4820"
          className="input"
        />
      </Field>

      {error && <p role="alert" className="text-[12px] text-out-ink">{error}</p>}

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
  draft,
  onDraftChange,
  entryId,
  onEntryIdChange,
  onDone,
  onSkip,
  onBack,
}: {
  kind: 'IN' | 'OUT'
  draft: EntryDraft
  onDraftChange: (next: EntryDraft) => void
  entryId: string | null
  onEntryIdChange: (id: string) => void
  onDone: () => void
  onSkip: () => void
  onBack: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountNum = Number(draft.amount)
  const canSubmit =
    draft.name.trim() !== '' && !Number.isNaN(amountNum) && draft.amount.trim() !== '' && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const payload = {
        kind,
        name: draft.name.trim(),
        amount: amountNum,
        startDate: draft.startDate,
        rrule: findCadence(draft.cadence).rrule,
      }
      if (entryId) {
        await updateEntry(entryId, payload)
      } else {
        const row = await createEntry(payload)
        onEntryIdChange(row.id)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry')
      setBusy(false)
    }
  }

  const heading = kind === 'IN' ? 'Add a recurring income' : 'Add a recurring expense'
  const blurb =
    kind === 'IN'
      ? 'Paychecks, transfers in, anything you expect to land regularly. You can add more later from the Entries page.'
      : 'Rent, subscriptions, card payments — anything that leaves on a schedule. You can add more later from the Entries page.'
  const placeholder = kind === 'IN' ? 'e.g. Paycheck' : 'e.g. Rent'
  const nameSlot = kind === 'IN' ? 'income' : 'expense'

  return (
    <form
      onSubmit={onSubmit}
      className="card flex flex-col gap-4"
      autoComplete="off"
    >
      <header>
        <h1 className="text-[20px] font-medium tracking-tight">{heading}</h1>
        <p className="mt-1 text-[12px] text-ink-2">{blurb}</p>
      </header>

      <Field label="Amount" id={`ob-${nameSlot}-amount`}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mono text-ink-3">$</span>
          <input
            id={`ob-${nameSlot}-amount`}
            type="text"
            inputMode="decimal"
            name={`cashflow-entry-${nameSlot}-amount`}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={draft.amount}
            onChange={(e) => onDraftChange({ ...draft, amount: e.target.value })}
            onFocus={(e) => { if (e.target.value === DEFAULT_AMOUNT) e.target.select() }}
            placeholder="0.00"
            className="input pl-7 text-right tabular-nums"
            autoFocus
          />
        </div>
      </Field>

      <Field label="Name" id={`ob-${nameSlot}-name`}>
        <input
          id={`ob-${nameSlot}-name`}
          type="text"
          name={`cashflow-entry-${nameSlot}-name`}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={draft.name}
          onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
          onFocus={(e) => { if (e.target.value === placeholder) e.target.select() }}
          placeholder={placeholder}
          className="input"
        />
      </Field>

      <Field label="Cadence">
        <div className="flex flex-wrap gap-1.5">
          {CADENCES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={draft.cadence === c.key}
              onClick={() => onDraftChange({ ...draft, cadence: c.key })}
              className={`rounded-chip border px-3 py-1 text-[12px] transition-colors ${
                draft.cadence === c.key
                  ? 'border-ink bg-ink text-card'
                  : 'border-line-2 text-ink-2 hover:text-ink'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={draft.cadence === 'one-time' ? 'Date' : 'Starting'} id={`ob-${nameSlot}-start`}>
        <input
          id={`ob-${nameSlot}-start`}
          type="date"
          name={`cashflow-entry-${nameSlot}-start-date`}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={draft.startDate}
          onChange={(e) => onDraftChange({ ...draft, startDate: e.target.value })}
          className="input"
        />
      </Field>

      {error && <p role="alert" className="text-[12px] text-out-ink">{error}</p>}

      <footer className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
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
            {busy ? 'Saving…' : entryId ? 'Update & continue →' : 'Save & continue →'}
          </button>
        </div>
      </footer>
    </form>
  )
}

function DevSeedBanner({ onSeed }: { onSeed: () => void }) {
  const [busy, setBusy] = useState(false)

  async function handleSeed() {
    setBusy(true)
    await seedDevData()
    onSeed()
  }

  return (
    <div className="flex items-center justify-between rounded-card border border-dashed border-amber bg-amber-soft/40 px-4 py-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-amber-ink mono">Dev</p>
        <p className="text-[12px] text-ink-2">Load realistic sample budget — 4 income + 26 expense entries</p>
      </div>
      <button
        type="button"
        onClick={handleSeed}
        disabled={busy}
        className="rounded-field border border-amber bg-amber-soft px-3 py-1.5 text-[12px] font-medium text-amber-ink transition-colors hover:bg-amber/20 disabled:opacity-50"
      >
        {busy ? 'Loading…' : 'Seed data →'}
      </button>
    </div>
  )
}

function Field({
  label,
  hint,
  id,
  children,
}: {
  label: string
  hint?: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="micro mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
    </div>
  )
}
