import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { track } from '../lib/analytics/index.js'
import { useDbReady } from '../lib/db/ready'
import { writeSnapshot } from '../lib/data/snapshot'
import { createEntry } from '../lib/data/entry'
import { newId } from '../lib/id'
import { redirectIfSnapshotted } from '../lib/route-guards'
import { projectOne } from '../lib/projection'
import type { Entry } from '../lib/db/schema'
import OnboardingChart, { type ObDraftEntry, fmtMoneyOb } from '../components/onboarding/OnboardingChart'
import '../components/onboarding/onboarding.css'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: redirectIfSnapshotted,
  component: OnboardingPage,
})

// ── types ──────────────────────────────────────────────────────────────────

type ObCadenceKey = ObDraftEntry['cadenceKey']

type ObStep = 0 | 1 | 2 | 3 | 4  // welcome | balance | recurring | review | done

// ── constants ──────────────────────────────────────────────────────────────

const OB_CADENCES: Array<{ key: ObCadenceKey; label: string }> = [
  { key: 'monthly',   label: 'Monthly' },
  { key: 'bi-weekly', label: '2 weeks' },
  { key: 'weekly',    label: 'Weekly'  },
]

const OB_RRULE: Record<ObCadenceKey, string> = {
  monthly:    'FREQ=MONTHLY',
  'bi-weekly':'FREQ=WEEKLY;INTERVAL=2',
  weekly:     'FREQ=WEEKLY',
}

const OB_MONTHLY_FACTOR: Record<ObCadenceKey, number> = {
  monthly:    1,
  'bi-weekly':26 / 12,
  weekly:     52 / 12,
}

const SUGGEST_IN: Array<Omit<ObDraftEntry, 'id'>> = [
  { kind: 'IN',  name: 'Paycheck',   amount: 1900, cadenceKey: 'bi-weekly' },
  { kind: 'IN',  name: 'Side income',amount: 600,  cadenceKey: 'monthly'  },
]

const SUGGEST_OUT: Array<Omit<ObDraftEntry, 'id'>> = [
  { kind: 'OUT', name: 'Rent / Mortgage', amount: 1650, cadenceKey: 'monthly' },
  { kind: 'OUT', name: 'Groceries',       amount: 460,  cadenceKey: 'monthly' },
  { kind: 'OUT', name: 'Utilities',       amount: 180,  cadenceKey: 'monthly' },
  { kind: 'OUT', name: 'Subscriptions',   amount: 58,   cadenceKey: 'monthly' },
  { kind: 'OUT', name: 'Car / Transit',   amount: 240,  cadenceKey: 'monthly' },
  { kind: 'OUT', name: 'Insurance',       amount: 160,  cadenceKey: 'monthly' },
]

const SAMPLE_BALANCE = 4820
const SAMPLE_ENTRIES: ObDraftEntry[] = [
  { id: 's1', kind: 'IN',  name: 'Paycheck',        amount: 1900, cadenceKey: 'bi-weekly' },
  { id: 's2', kind: 'OUT', name: 'Rent / Mortgage',  amount: 1650, cadenceKey: 'monthly'  },
  { id: 's3', kind: 'OUT', name: 'Groceries',        amount: 460,  cadenceKey: 'monthly'  },
  { id: 's4', kind: 'OUT', name: 'Utilities',        amount: 180,  cadenceKey: 'monthly'  },
  { id: 's5', kind: 'OUT', name: 'Subscriptions',    amount: 58,   cadenceKey: 'monthly'  },
]

// ── small hooks ────────────────────────────────────────────────────────────

function useInView(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const kick = setTimeout(() => setN(x => x || 1), 120)
    const el = ref.current
    if (!el) return () => clearTimeout(kick)
    const io = new IntersectionObserver(ents => {
      ents.forEach(e => { if (e.isIntersecting) setN(x => x + 1) })
    }, { threshold: 0.2 })
    io.observe(el)
    return () => { clearTimeout(kick); io.disconnect() }
  }, [])
  return [ref, n]
}

function useCountUp(target: number, run: number, dur = 1100, delay = 250): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!run) return
    let raf: number, done = false
    let t0: number | null = null
    const ease = (x: number) => 1 - Math.pow(1 - x, 3)
    const tick = (t: number) => {
      if (t0 === null) t0 = t
      const e = Math.min(1, (t - t0 - delay) / dur)
      setV(e <= 0 ? 0 : ease(e) * target)
      if (e < 1) raf = requestAnimationFrame(tick); else done = true
    }
    raf = requestAnimationFrame(tick)
    const fb = setTimeout(() => { if (!done) setV(target) }, delay + dur + 400)
    return () => { cancelAnimationFrame(raf); clearTimeout(fb) }
  }, [run, target, dur, delay])
  return v
}

// ── helpers ────────────────────────────────────────────────────────────────

function monthlyNet(entries: ObDraftEntry[]): number {
  return entries.reduce((sum, e) => {
    return sum + (e.kind === 'IN' ? 1 : -1) * e.amount * OB_MONTHLY_FACTOR[e.cadenceKey]
  }, 0)
}

function todayIso(): string {
  return Temporal.Now.plainDateISO().toString()
}

// ── Steps progress indicator ───────────────────────────────────────────────

function StepProgress({ total, current }: { total: number; current: number }) {
  return (
    <div className="ob-steps" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`seg ${i < current ? 'past' : i === current ? 'cur' : ''}`}
        />
      ))}
    </div>
  )
}

// ── entry row ─────────────────────────────────────────────────────────────

function EntryRow({
  entry, onChange, onRemove,
}: {
  entry: ObDraftEntry
  onChange: (next: ObDraftEntry) => void
  onRemove: () => void
}) {
  const [amtFocus, setAmtFocus] = useState(false)
  const [amtDraft, setAmtDraft] = useState('')

  return (
    <div className="ob-entry-row">
      <button
        type="button"
        className={`ob-entry-dir ${entry.kind === 'IN' ? 'in' : 'out'}`}
        title={entry.kind === 'IN' ? 'Money in' : 'Money out'}
        onClick={() => onChange({ ...entry, kind: entry.kind === 'IN' ? 'OUT' : 'IN' })}
      >
        {entry.kind === 'IN' ? '↑' : '↓'}
      </button>

      <input
        className="ob-entry-name"
        type="text"
        value={entry.name}
        placeholder="Name this entry"
        onChange={e => onChange({ ...entry, name: e.target.value })}
      />

      <div className={`ob-entry-amt${amtFocus ? ' focus' : ''}`}>
        <span className="pfx">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={amtFocus ? amtDraft : (entry.amount ? entry.amount.toLocaleString('en-US') : '')}
          placeholder="0"
          onFocus={() => { setAmtFocus(true); setAmtDraft(entry.amount ? String(entry.amount) : '') }}
          onBlur={() => setAmtFocus(false)}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9.]/g, '')
            setAmtDraft(raw)
            onChange({ ...entry, amount: raw === '' ? 0 : Number(raw) })
          }}
        />
      </div>

      <div className="ob-entry-cad">
        {OB_CADENCES.map(c => (
          <button
            key={c.key}
            type="button"
            className={entry.cadenceKey === c.key ? 'on' : ''}
            onClick={() => onChange({ ...entry, cadenceKey: c.key })}
          >
            {c.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="ob-entry-del"
        title="Remove"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}

// ── big money input ────────────────────────────────────────────────────────

function MoneyInput({
  value, onChange, autoFocus,
}: {
  value: number
  onChange: (v: number) => void
  autoFocus?: boolean
}) {
  const [focus, setFocus] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <div className={`ob-field big${focus ? ' focus-within' : ''}`}>
      <span className="pfx">$</span>
      <input
        autoFocus={autoFocus}
        inputMode="decimal"
        value={focus ? draft : (value ? value.toLocaleString('en-US') : '')}
        placeholder="0"
        onFocus={() => { setFocus(true); setDraft(value ? String(value) : '') }}
        onBlur={() => setFocus(false)}
        onChange={e => {
          const raw = e.target.value.replace(/[^0-9.]/g, '')
          setDraft(raw)
          onChange(raw === '' ? 0 : Number(raw))
        }}
      />
    </div>
  )
}

// ── screen: welcome ────────────────────────────────────────────────────────

function ScreenWelcome({
  onSetup, onSample,
}: {
  onSetup: () => void
  onSample: () => void
}) {
  const [ref, run] = useInView()
  const sampleEnd = useMemo(() => {
    const proj = projectOne(
      { id: 'ob-preview', balance: SAMPLE_BALANCE, asOf: todayIso() },
      SAMPLE_ENTRIES.filter(e => e.amount > 0).map(e => ({
        id: e.id, kind: e.kind, name: e.name, amount: e.amount,
        currency: 'USD', startDate: todayIso(), endDate: null,
        rrule: OB_RRULE[e.cadenceKey], paused: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } satisfies Entry)),
      182,
    )
    return proj.series[proj.series.length - 1]
  }, [])
  const countedEnd = useCountUp(sampleEnd, run, 1300, 950)

  return (
    <div className="ob-welcome" ref={ref}>
      <div className="ob-welcome-text">
        <span className="ob-eyebrow">A clearer view of what's ahead</span>
        <h1 className="ob-hero">
          <span className="lead">See what's</span><br />coming.
        </h1>
        <p className="ob-lede">
          Cashflow takes today's balance and the paychecks and bills you already know about,
          then quietly draws your money{' '}
          <em style={{ fontStyle: 'normal', color: 'var(--cf-ink)' }}>forward</em>{' '}
          — so next month stops being a surprise.
        </p>
      </div>

      <div className="ob-proj-card">
        <div className="ob-proj-card-head">
          <span className="ob-eyebrow">A projection, roughly</span>
          <span className="ob-proj-end-val">{fmtMoneyOb(countedEnd)}</span>
        </div>
        <OnboardingChart
          w={592} h={150}
          startBalance={SAMPLE_BALANCE}
          entries={SAMPLE_ENTRIES}
          run={run}
          endLabel="~6 MONTHS"
        />
      </div>

      <div className="ob-welcome-ctas">
        <div className="ob-welcome-btns">
          <button
            type="button"
            className="ob-btn primary"
            style={{ minWidth: 200 }}
            onClick={onSetup}
          >
            Set up my balance →
          </button>
          <button type="button" className="ob-btn ghost" onClick={onSample}>
            Load sample data instead
          </button>
        </div>
        <div className="ob-chips">
          <span className="ob-chip"><span className="ob-dot" />About a minute</span>
          <span className="ob-chip"><span className="ob-dot" />Stays on your device</span>
          <span className="ob-chip"><span className="ob-dot" />Change anything later</span>
        </div>
      </div>
    </div>
  )
}

// ── screen: balance ────────────────────────────────────────────────────────

function ScreenBalance({
  balance, setBalance, label, setLabel, asOf, setAsOf, onBack, onNext,
}: {
  balance: number
  setBalance: (v: number) => void
  label: string
  setLabel: (v: string) => void
  asOf: string
  setAsOf: (v: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="ob-step-screen">
      <div className="ob-step-body">
        <div className="ob-step-pad">
          <div className="ob-step-head">
            <span className="ob-eyebrow">Cashflow setup · 1 of 3</span>
            <StepProgress total={3} current={0} />
          </div>
          <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 className="ob-h2">Where are you starting from?</h2>
              <p className="ob-lede" style={{ fontSize: 13.5 }}>
                Everything Cashflow draws is built forward from this one number.
                A ballpark is fine — you can change it whenever.
              </p>
            </div>

            <div>
              <span className="ob-field-label">Current balance</span>
              <MoneyInput value={balance} onChange={setBalance} autoFocus />
              <p className="ob-help">In dollars. Negatives are fine if you're underwater.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <span className="ob-field-label">As of</span>
                <div className="ob-field">
                  <input
                    type="date"
                    className="ob-field-text"
                    value={asOf}
                    onChange={e => setAsOf(e.target.value)}
                    data-1p-ignore
                    data-lpignore="true"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div>
                <span className="ob-field-label">
                  Account label{' '}
                  <span className="ob-optional">— optional</span>
                </span>
                <div className="ob-field">
                  <input
                    type="text"
                    className="ob-field-text"
                    value={label}
                    placeholder="Checking"
                    onChange={e => setLabel(e.target.value)}
                    data-1p-ignore
                    data-lpignore="true"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ob-step-foot">
        <button type="button" className="ob-back-btn" onClick={onBack}>← Back</button>
        <div className="ob-step-foot-right">
          <button type="button" className="ob-btn primary" onClick={onNext}>
            Continue →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── screen: recurring ─────────────────────────────────────────────────────

function ScreenRecurring({
  balance, entries, setEntries, onBack, onNext,
}: {
  balance: number
  entries: ObDraftEntry[]
  setEntries: React.Dispatch<React.SetStateAction<ObDraftEntry[]>>
  onBack: () => void
  onNext: () => void
}) {
  const [ref, run] = useInView()
  const has = entries.length > 0
  const net = monthlyNet(entries)

  const add = useCallback((template: Omit<ObDraftEntry, 'id'>) => {
    setEntries(es => [...es, { ...template, id: newId() }])
  }, [setEntries])

  const update = useCallback((id: string, next: ObDraftEntry) => {
    setEntries(es => es.map(e => e.id === id ? next : e))
  }, [setEntries])

  const remove = useCallback((id: string) => {
    setEntries(es => es.filter(e => e.id !== id))
  }, [setEntries])

  return (
    <div className="ob-step-screen">
      <div className="ob-step-body">
        <div className="ob-step-pad">
          <div className="ob-step-head">
            <span className="ob-eyebrow">Cashflow setup · 2 of 3</span>
            <StepProgress total={3} current={1} />
          </div>

          <div ref={ref} className="ob-recurring-grid">
            {/* left: entries + catalog */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 className="ob-h2">What comes in and goes out?</h2>
                <p className="ob-lede" style={{ fontSize: 13.5 }}>
                  The regulars — a paycheck, rent, a couple of bills.
                  Cashflow repeats each one forward on its own schedule.
                </p>
              </div>

              {has && (
                <div className="ob-entry-list">
                  {entries.map(e => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      onChange={next => update(e.id, next)}
                      onRemove={() => remove(e.id)}
                    />
                  ))}
                </div>
              )}

              <div className="ob-quick-wrap">
                <span className="ob-eyebrow">
                  {has ? 'Add another' : 'Tap to add — edit the details after'}
                </span>
                <div className="ob-quick-row">
                  {SUGGEST_IN.map(s => (
                    <button
                      key={s.name} type="button"
                      className="ob-quick-chip in"
                      onClick={() => add(s)}
                    >
                      <span className="pm">+</span>{s.name}
                    </button>
                  ))}
                  {SUGGEST_OUT.map(s => (
                    <button
                      key={s.name} type="button"
                      className="ob-quick-chip out"
                      onClick={() => add(s)}
                    >
                      <span className="pm">+</span>{s.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ob-quick-chip custom"
                    onClick={() => add({ kind: 'OUT', name: '', amount: 0, cadenceKey: 'monthly' })}
                  >
                    <span className="pm">+</span>Custom
                  </button>
                </div>
              </div>
            </div>

            {/* right: live preview */}
            <div className="ob-preview-panel">
              <div className="ob-preview-head">
                <span className="ob-eyebrow">Your projection so far</span>
                <span className="ob-live-label">Live</span>
              </div>
              <OnboardingChart
                w={360} h={158}
                startBalance={balance}
                entries={entries}
                run={run + entries.length}
                endLabel="~6 MONTHS OUT"
              />
              <div className="ob-net-row">
                <span className="ob-help" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                  Net per month
                </span>
                <span className={`ob-net-val ${net >= 0 ? 'pos' : 'neg'}`}>
                  {net >= 0 ? '+' : '−'}{fmtMoneyOb(Math.abs(net))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ob-step-foot">
        <button type="button" className="ob-back-btn" onClick={onBack}>← Back</button>
        <div className="ob-step-foot-right">
          {!has && (
            <span className="ob-help" style={{ margin: 0 }}>
              Add a few, or skip — you can add these any time.
            </span>
          )}
          <button type="button" className="ob-btn primary" onClick={onNext}>
            {has ? 'Continue →' : 'Skip for now →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── screen: review ─────────────────────────────────────────────────────────

function ScreenReview({
  balance, entries, onBack, onFinish,
}: {
  balance: number
  entries: ObDraftEntry[]
  onBack: () => void
  onFinish: () => void
}) {
  const [ref, run] = useInView()
  const net = monthlyNet(entries)

  const projected = useMemo(() => {
    const today = todayIso()
    const fakeEntries: Entry[] = entries.filter(e => e.amount > 0).map(e => ({
      id: e.id, kind: e.kind, name: e.name, amount: e.amount,
      currency: 'USD', startDate: today, endDate: null,
      rrule: OB_RRULE[e.cadenceKey], paused: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }))
    const proj = projectOne({ id: 'ob-preview', balance: balance || 0, asOf: today }, fakeEntries, 182)
    return proj.series[proj.series.length - 1]
  }, [balance, entries])

  return (
    <div className="ob-step-screen">
      <div className="ob-step-body">
        <div className="ob-step-pad">
          <div className="ob-step-head">
            <span className="ob-eyebrow">Cashflow setup · 3 of 3</span>
            <StepProgress total={3} current={2} />
          </div>

          <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720, margin: '0 auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <h2 className="ob-h2" style={{ fontSize: 27 }}>Here's your next six months.</h2>
              <p className="ob-lede" style={{ fontSize: 13.5 }}>
                Built from your balance and{' '}
                {entries.length > 0
                  ? `${entries.length} recurring ${entries.length === 1 ? 'entry' : 'entries'}`
                  : 'your starting balance'}.{' '}
                Scrub, adjust, and reconcile any time inside the app.
              </p>
            </div>

            <div style={{ background: 'var(--cf-surface)', border: '1px solid var(--cf-line)', borderRadius: 'var(--cf-radius-card)', padding: '18px 22px 10px' }}>
              <OnboardingChart
                w={672} h={220}
                startBalance={balance}
                entries={entries}
                run={run}
                endLabel="6 MONTHS OUT"
              />
            </div>

            <div className="ob-sum-grid">
              <div className="ob-sum-cell">
                <span className="k">Starting balance</span>
                <span className="v">{fmtMoneyOb(balance)}</span>
              </div>
              <div className="ob-sum-cell">
                <span className="k">Net per month</span>
                <span className={`v ${net >= 0 ? 'pos' : 'neg'}`}>
                  {net >= 0 ? '+' : '−'}{fmtMoneyOb(Math.abs(net))}
                </span>
              </div>
              <div className="ob-sum-cell">
                <span className="k">Projected · 6 mo</span>
                <span className="v">{fmtMoneyOb(projected)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ob-step-foot">
        <button type="button" className="ob-back-btn" onClick={onBack}>← Edit entries</button>
        <div className="ob-step-foot-right">
          <button type="button" className="ob-btn accent" onClick={onFinish}>
            Open Cashflow →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── screen: done ───────────────────────────────────────────────────────────

function ScreenDone({
  balance, entries, onEnter,
}: {
  balance: number
  entries: ObDraftEntry[]
  onEnter: () => void
}) {
  const [ref, run] = useInView()

  const projected = useMemo(() => {
    const today = todayIso()
    const fakeEntries: Entry[] = entries.filter(e => e.amount > 0).map(e => ({
      id: e.id, kind: e.kind, name: e.name, amount: e.amount,
      currency: 'USD', startDate: today, endDate: null,
      rrule: OB_RRULE[e.cadenceKey], paused: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }))
    const proj = projectOne({ id: 'ob-preview', balance: balance || 0, asOf: today }, fakeEntries, 182)
    return proj.series[proj.series.length - 1]
  }, [balance, entries])

  const counted = useCountUp(projected, run, 1100, 500)

  return (
    <div className="ob-done" ref={ref}>
      <div className="ob-done-check" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
        <h2 className="ob-h2" style={{ fontSize: 28 }}>You're all set.</h2>
        <p className="ob-lede">
          Your timeline is drawn through{' '}
          <strong style={{ color: 'var(--cf-ink)', fontWeight: 500 }}>
            {new Temporal.PlainDate(
              Temporal.Now.plainDateISO().year,
              Temporal.Now.plainDateISO().month,
              Temporal.Now.plainDateISO().day,
            ).add({ days: 182 }).toLocaleString('en-US', { month: 'long' })}
          </strong>.
          Projected balance six months out:
        </p>
        <div className="ob-done-amount">{fmtMoneyOb(counted)}</div>
      </div>
      <button type="button" className="ob-btn primary" style={{ minWidth: 220 }} onClick={onEnter}>
        Go to my dashboard →
      </button>
      <p className="ob-help" style={{ margin: 0 }}>
        Everything stays editable — add accounts, reconcile, or tweak entries whenever.
      </p>
    </div>
  )
}

// ── page root ──────────────────────────────────────────────────────────────

function OnboardingPage() {
  const ready = useDbReady()
  const navigate = useNavigate()

  const [step, setStep] = useState<ObStep>(0)
  const [balance, setBalance] = useState(0)
  const [label, setLabel] = useState('')
  const [asOf, setAsOf] = useState(todayIso)
  const [entries, setEntries] = useState<ObDraftEntry[]>([])
  const [busy, setBusy] = useState(false)
  const startedRef = useRef(false)

  if (!ready) {
    return (
      <div className="ob-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p className="ob-eyebrow">Initializing…</p>
      </div>
    )
  }

  if (!startedRef.current) {
    startedRef.current = true
    track('onboarding_started')
  }

  const loadSample = () => {
    setBalance(SAMPLE_BALANCE)
    setEntries(SAMPLE_ENTRIES.map(e => ({ ...e, id: newId() })))
    track('onboarding_sample_loaded')
    setStep(3)
  }

  async function finish() {
    if (busy) return
    setBusy(true)
    try {
      await writeSnapshot({
        balance,
        asOf,
        accountLabel: label.trim() || null,
      })
      const today = todayIso()
      for (const e of entries) {
        if (e.amount <= 0) continue
        await createEntry({
          kind: e.kind,
          name: e.name.trim() || (e.kind === 'IN' ? 'Income' : 'Expense'),
          amount: e.amount,
          startDate: today,
          rrule: OB_RRULE[e.cadenceKey],
        })
      }
      track('onboarding_complete')
      setStep(4)
    } catch {
      setBusy(false)
    }
  }

  let screen: React.ReactNode
  if (step === 0) {
    screen = <ScreenWelcome onSetup={() => setStep(1)} onSample={loadSample} />
  } else if (step === 1) {
    screen = (
      <ScreenBalance
        balance={balance} setBalance={setBalance}
        label={label} setLabel={setLabel}
        asOf={asOf} setAsOf={setAsOf}
        onBack={() => setStep(0)} onNext={() => setStep(2)}
      />
    )
  } else if (step === 2) {
    screen = (
      <ScreenRecurring
        balance={balance}
        entries={entries} setEntries={setEntries}
        onBack={() => setStep(1)} onNext={() => setStep(3)}
      />
    )
  } else if (step === 3) {
    screen = (
      <ScreenReview
        balance={balance} entries={entries}
        onBack={() => setStep(2)} onFinish={finish}
      />
    )
  } else {
    screen = (
      <ScreenDone
        balance={balance} entries={entries}
        onEnter={() => navigate({ to: '/' })}
      />
    )
  }

  return (
    <div className="ob-page">
      {/* key re-mounts to trigger the cross-fade animation on every step change */}
      <div className="ob-step-anim" key={step}>
        {screen}
      </div>
    </div>
  )
}
