import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Pencil, Trash2, Pause, Play } from 'lucide-react'
import ImportModal from '../components/ImportModal'
import ExportModal from '../components/ExportModal'
import {
  createEntry,
  updateEntry,
  deleteEntry,
  setEntryPaused,
  listEntries,
} from '../lib/data/entry'
import { initDb } from '../lib/db/init'
import {
  CADENCES,
  type CadenceKey,
  cadenceForRrule,
  findCadence,
  monthlyFactorForRrule,
} from '../lib/cadence'
import type { Entry } from '../lib/db/schema'
import { requireSnapshot } from '../lib/route-guards'
import { listSnapshots } from '../lib/data/snapshot'
import type { BalanceSnapshot } from '../lib/db/schema'

export const Route = createFileRoute('/entries')({
  beforeLoad: requireSnapshot,
  loader: async () => {
    if (typeof window === 'undefined') {
      return null
    }
    await initDb()
    const [entries, snapshots] = await Promise.all([listEntries(), listSnapshots()])
    return { entries, snapshots }
  },
  component: EntriesPage,
})

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function today() {
  return new Date().toISOString().slice(0, 10)
}

type FormState = {
  id: string | null // null = creating
  kind: 'IN' | 'OUT'
  name: string
  amount: string
  cadence: CadenceKey
  startDate: string
  endDate: string
}

function blankForm(kind: 'IN' | 'OUT'): FormState {
  return {
    id: null,
    kind,
    name: '',
    amount: '',
    cadence: 'monthly',
    startDate: today(),
    endDate: '',
  }
}

function formFromEntry(e: Entry): FormState {
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    amount: String(e.amount),
    cadence: cadenceForRrule(e.rrule).key,
    startDate: e.startDate,
    endDate: e.endDate ?? '',
  }
}

function EntriesPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [form, setForm] = useState<FormState | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)

  if (!data) {
    return <div className="card text-[12px] text-ink-3">Loading…</div>
  }

  const { entries, snapshots } = data
  const active = entries.filter((e) => !e.paused)

  const monthlyIn = active
    .filter((e) => e.kind === 'IN')
    .reduce((sum, e) => sum + e.amount * monthlyFactorForRrule(e.rrule), 0)
  const monthlyOut = active
    .filter((e) => e.kind === 'OUT')
    .reduce((sum, e) => sum + e.amount * monthlyFactorForRrule(e.rrule), 0)

  const incomeRecurring = entries.filter((e) => e.kind === 'IN' && e.rrule)
  const expenseRecurring = entries.filter((e) => e.kind === 'OUT' && e.rrule)
  const oneOffs = entries.filter((e) => !e.rrule)

  async function onSave() {
    if (!form) {
      return
    }
    const payload = {
      kind: form.kind,
      name: form.name.trim(),
      amount: Number(form.amount),
      startDate: form.startDate,
      endDate: form.endDate.trim() || null,
      rrule: findCadence(form.cadence).rrule,
    }
    if (form.id) {
      await updateEntry(form.id, payload)
    } else {
      await createEntry(payload)
    }
    setForm(null)
    await router.invalidate()
  }

  async function onDelete(id: string) {
    await deleteEntry(id)
    if (form?.id === id) {
      setForm(null)
    }
    await router.invalidate()
  }

  async function onTogglePause(e: Entry) {
    await setEntryPaused(e.id, !e.paused)
    await router.invalidate()
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="micro">Entries</p>
          <h1 className="text-[22px] font-medium tracking-tight">Recurring &amp; scheduled</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="rounded-field border border-line-2 px-3 py-1.5 text-[12px] text-ink-2 hover:bg-card-2 hover:text-ink"
          >
            Import…
          </button>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="rounded-field border border-line-2 px-3 py-1.5 text-[12px] text-ink-2 hover:bg-card-2 hover:text-ink"
          >
            Export…
          </button>
          <button
            type="button"
            onClick={() => setForm(blankForm('OUT'))}
            className="rounded-field border border-line-2 px-3 py-1.5 text-[12px] text-ink hover:bg-card-2"
          >
            + New entry
          </button>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="micro">Monthly income</p>
          <p className="display-sm mt-2 text-in-ink">{USD.format(monthlyIn)}</p>
        </div>
        <div className="card">
          <p className="micro">Monthly expense</p>
          <p className="display-sm mt-2 text-out-ink">{USD.format(monthlyOut)}</p>
        </div>
        <div className="card">
          <p className="micro">Net per month</p>
          <p className="display-sm mt-2">{USD.format(monthlyIn - monthlyOut)}</p>
        </div>
      </section>

      {form && (
        <EntryForm
          form={form}
          onChange={setForm}
          onSave={onSave}
          onCancel={() => setForm(null)}
        />
      )}

      <EntryGroup
        label="Income · recurring"
        entries={incomeRecurring}
        onEdit={(e) => setForm(formFromEntry(e))}
        onDelete={onDelete}
        onTogglePause={onTogglePause}
      />
      <EntryGroup
        label="Expenses · recurring"
        entries={expenseRecurring}
        onEdit={(e) => setForm(formFromEntry(e))}
        onDelete={onDelete}
        onTogglePause={onTogglePause}
      />
      <EntryGroup
        label="One-offs · scheduled"
        entries={oneOffs}
        onEdit={(e) => setForm(formFromEntry(e))}
        onDelete={onDelete}
        onTogglePause={onTogglePause}
      />

      <SnapshotList snapshots={snapshots} />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={async () => { setShowImport(false); await router.invalidate() }}
      />
      <ExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
      />
    </div>
  )
}

function EntryGroup({
  label,
  entries,
  onEdit,
  onDelete,
  onTogglePause,
}: {
  label: string
  entries: Entry[]
  onEdit: (e: Entry) => void
  onDelete: (id: string) => void
  onTogglePause: (e: Entry) => void
}) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <p className="micro">{label}</p>
        <p className="micro">{entries.length}</p>
      </div>
      {entries.length === 0 ? (
        <p className="text-[12px] text-ink-3">No entries yet.</p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0"
            >
              <span className="flex items-center gap-2 text-[13px]">
                <span className={e.kind === 'IN' ? 'text-in-ink' : 'text-out-ink'}>
                  {e.kind === 'IN' ? '↑' : '↓'}
                </span>
                <span className={e.paused ? 'text-ink-3 line-through' : 'text-ink'}>
                  {e.name}
                </span>
                <span className="mono text-[11px] text-ink-3">
                  {cadenceForRrule(e.rrule).label}
                  {e.rrule ? '' : ` · ${e.startDate}`}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="mono text-[13px] text-ink-2">{USD.format(e.amount)}</span>
                <span className="flex items-center gap-1.5 text-ink-3">
                  <button
                    type="button"
                    onClick={() => onTogglePause(e)}
                    aria-label={e.paused ? `Resume ${e.name}` : `Pause ${e.name}`}
                    className="rounded-field p-1 transition-colors hover:text-ink"
                  >
                    {e.paused ? <Play size={13} /> : <Pause size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(e)}
                    aria-label={`Edit ${e.name}`}
                    className="rounded-field p-1 transition-colors hover:text-ink"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(e.id)}
                    aria-label={`Delete ${e.name}`}
                    className="rounded-field p-1 transition-colors hover:text-out-ink"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EntryForm({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: FormState
  onChange: (next: FormState) => void
  onSave: () => void
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const amountNum = Number(form.amount)
  const canSave =
    form.name.trim() !== '' && !Number.isNaN(amountNum) && form.amount.trim() !== '' && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) {
      return
    }
    setBusy(true)
    try {
      await onSave()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4" autoComplete="off">
      <div className="flex items-center justify-between">
        <p className="micro">{form.id ? 'Edit entry' : 'New entry'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={form.kind === 'IN'}
          onClick={() => onChange({ ...form, kind: 'IN' })}
          className={`rounded-field border px-3 py-2 text-[13px] transition-colors ${
            form.kind === 'IN'
              ? 'border-in bg-in-soft text-in-ink'
              : 'border-line-2 text-ink-2 hover:text-ink'
          }`}
        >
          ↑ Income
        </button>
        <button
          type="button"
          aria-pressed={form.kind === 'OUT'}
          onClick={() => onChange({ ...form, kind: 'OUT' })}
          className={`rounded-field border px-3 py-2 text-[13px] transition-colors ${
            form.kind === 'OUT'
              ? 'border-out bg-out-soft text-out-ink'
              : 'border-line-2 text-ink-2 hover:text-ink'
          }`}
        >
          ↓ Expense
        </button>
      </div>

      <Field label="Name" id="entry-name">
        <input
          id="entry-name"
          type="text"
          name="cashflow-entry-name"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder={form.kind === 'IN' ? 'e.g. Paycheck' : 'e.g. Rent'}
          className="input"
          autoFocus
        />
      </Field>

      <Field label="Amount" id="entry-amount">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mono text-ink-3">$</span>
          <input
            id="entry-amount"
            type="text"
            inputMode="decimal"
            name="cashflow-entry-amount"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={form.amount}
            onChange={(e) => onChange({ ...form, amount: e.target.value })}
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
              aria-pressed={form.cadence === c.key}
              onClick={() => onChange({ ...form, cadence: c.key })}
              className={`rounded-chip border px-3 py-1 text-[12px] transition-colors ${
                form.cadence === c.key
                  ? 'border-ink bg-ink text-card'
                  : 'border-line-2 text-ink-2 hover:text-ink'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={form.cadence === 'one-time' ? 'Date' : 'Starting'} id="entry-start">
          <input
            id="entry-start"
            type="date"
            name="cashflow-entry-start-date"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={form.startDate}
            onChange={(e) => onChange({ ...form, startDate: e.target.value })}
            className="input"
          />
        </Field>
        {form.cadence !== 'one-time' && (
          <Field label="Ends" hint="Optional" id="entry-end">
            <input
              id="entry-end"
              type="date"
              name="cashflow-entry-end-date"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={form.endDate}
              onChange={(e) => onChange({ ...form, endDate: e.target.value })}
              className="input"
            />
          </Field>
        )}
      </div>

      <footer className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-field bg-ink px-4 py-1.5 text-[13px] text-card disabled:opacity-40"
        >
          {busy ? 'Saving…' : form.id ? 'Save changes' : 'Add entry'}
        </button>
      </footer>
    </form>
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
      <label htmlFor={id} className="micro mb-1.5 block">
        {label}
        {hint && <span className="ml-1.5 normal-case text-ink-4">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ── Balance snapshots listing ─────────────────────────────────────────────────
// Read-only audit trail of every reconcile point. Sorted newest first.

function SnapshotList({ snapshots }: { snapshots: BalanceSnapshot[] }) {
  if (snapshots.length === 0) return null

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="micro">Balance snapshots · {snapshots.length}</p>
      </div>

      <div className="flex flex-col">
        {snapshots.map((s, i) => {
          const prev = snapshots[i + 1]
          const drift = prev ? s.balance - prev.balance : null
          const driftSign = drift != null ? (drift >= 0 ? '+' : '−') : null
          return (
            <div
              key={s.id}
              className="flex items-baseline justify-between border-b border-line py-2.5 last:border-b-0"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[12.5px] text-ink-2">
                  {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(s.asOf + 'T00:00:00'))}
                </span>
                {s.accountLabel && (
                  <span className="font-mono text-[11px] text-ink-3">{s.accountLabel}</span>
                )}
              </div>
              <div className="flex items-baseline gap-3">
                {drift != null && Math.abs(drift) >= 0.01 && (
                  <span className={`font-mono text-[11.5px] ${drift >= 0 ? 'text-in-ink' : 'text-out-ink'}`}>
                    {driftSign}{USD.format(Math.abs(drift))}
                  </span>
                )}
                <span className="font-mono text-[13.5px] font-medium text-ink">
                  {USD.format(s.balance)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
