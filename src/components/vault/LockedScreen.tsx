// Full-screen app-blocking lock gate.
// When the local vault is encrypted and locked, this wraps the live app:
// the children render blurred + inert behind a frosted passphrase panel.
// The only way through is the correct passphrase — no nav, no peeking.
//
// Usage:
//   <LockedScreen onUnlocked={fn} compact={false}>
//     {liveApp}
//   </LockedScreen>
//
// ⚠️  Security: unlock() derives keys and decrypts via PBKDF2 — no plaintext
// comparison. Never store or compare the passphrase directly.

import { useEffect, useRef, useState } from 'react'
import { unlock } from '../../lib/vault'

// ── Glyphs ────────────────────────────────────────────────────────────────

function LockGlyph({ open = false, size = 24 }: { open?: boolean; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      {open ? (
        <path d="M8 10.5V7a4 4 0 0 1 7.6-1.7" />
      ) : (
        <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      )}
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <path d="M12 16.1v2.1" />
    </svg>
  )
}

function EyeGlyph({ off = false, size = 16 }: { off?: boolean; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 8S3.8 3.5 8 3.5 14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
      {off && <path d="M2.5 2.5l11 11" />}
    </svg>
  )
}

// ── Unlock hook ───────────────────────────────────────────────────────────

type LockState = 'locked' | 'revealing' | 'open'

function useUnlock(onUnlocked: () => void) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [state, setState] = useState<LockState>('locked')
  const [error, setError] = useState('')
  const [caps, setCaps] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!value || busy) return
    setBusy(true)
    try {
      await unlock(value)
      setError('')
      setState('revealing')
      setTimeout(() => {
        setState('open')
        onUnlocked()
      }, 560)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isWrongPass = msg.toLowerCase().includes('decrypt') ||
        msg.toLowerCase().includes('operation') ||
        msg.toLowerCase().includes('auth')
      console.error('[LockedScreen] unlock failed:', msg)
      setAttempts((a) => a + 1)
      setError(
        isWrongPass
          ? "That passphrase didn't unlock this device."
          : `Unlock error: ${msg}`
      )
      setShake(true)
      setValue('')
      setBusy(false)
      setTimeout(() => setShake(false), 440)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    setCaps(e.getModifierState('CapsLock'))
    if (e.key === 'Enter') void submit()
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value)
    if (error) setError('')
  }

  return { value, show, setShow, state, error, caps, attempts, shake, busy, submit, onKey, onChange }
}

// ── Lock panel ─────────────────────────────────────────────────────────────

type PanelProps = {
  u: ReturnType<typeof useUnlock>
  compact: boolean
}

function LockPanel({ u, compact }: PanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showHelp, setShowHelp] = useState(false)
  const opening = u.state !== 'locked'

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className={'lock-panel' + (compact ? ' compact' : '') + (u.shake ? ' shake' : '')}>
      <div className="lock-badge" style={{ marginBottom: 18 }}>
        <span className="dot" />
        ENCRYPTED · THIS DEVICE ONLY
      </div>

      <div className={'lock-mark' + (opening ? ' unlocked' : '')} style={{ marginBottom: 16 }}>
        <LockGlyph open={opening} size={compact ? 22 : 24} />
      </div>

      <h1 id="lock-heading" style={{ fontSize: compact ? 19 : 22, letterSpacing: '-0.015em', margin: '0 0 8px' }}>
        {opening ? 'Unlocking…' : 'Your data is locked'}
      </h1>

      <p
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          margin: '0 0 22px',
          maxWidth: 300,
          color: 'var(--cf-ink-2)',
        }}
      >
        cashflow keeps your balances and entries encrypted on this device. Enter
        your passphrase to unlock them.
      </p>

      {/* passphrase field */}
      <div className={'lock-field' + (u.error ? ' err' : '')} style={{ width: '100%' }}>
        <input
          ref={inputRef}
          id="lock-passphrase"
          className="lock-input"
          type={u.show ? 'text' : 'password'}
          aria-label="Passphrase"
          placeholder="Passphrase"
          value={u.value}
          autoComplete="off"
          spellCheck={false}
          disabled={opening}
          onChange={u.onChange}
          onKeyDown={u.onKey}
          onKeyUp={u.onKey}
        />
        <button
          className="lock-eye"
          type="button"
          tabIndex={-1}
          aria-label={u.show ? 'Hide passphrase' : 'Show passphrase'}
          onClick={() => u.setShow((s) => !s)}
        >
          <EyeGlyph off={u.show} />
        </button>
      </div>

      {/* status line — caps / error / attempts */}
      <div
        className={'lock-msg ' + (u.error ? 'err' : u.caps ? 'warn' : '')}
        style={{ width: '100%', justifyContent: 'flex-start', margin: '9px 0 16px' }}
        aria-live="assertive"
        aria-atomic="true"
      >
        {u.error ? (
          <>
            <span aria-hidden="true">✕</span>
            {u.error}
            {u.attempts > 1 ? ` (${u.attempts} tries)` : ''}
          </>
        ) : u.caps ? (
          <>
            <span aria-hidden="true">⇪</span>Caps Lock is on
          </>
        ) : (
          <span style={{ color: 'var(--cf-ink-3)' }}>
            Case-sensitive · stored only on this device
          </span>
        )}
      </div>

      <button
        className={'lock-unlock' + (opening ? ' ok' : '')}
        disabled={!u.value || opening}
        onClick={() => void u.submit()}
      >
        <LockGlyph open={opening} size={15} />
        {opening ? 'Unlocked' : 'Unlock'}
      </button>

      <button className="lock-link" style={{ marginTop: 16 }} onClick={() => setShowHelp((h) => !h)}>
        Forgot your passphrase?
      </button>

      {showHelp && (
        <p
          style={{
            fontFamily: 'var(--cf-font-mono)',
            fontSize: 10.5,
            lineHeight: 1.6,
            margin: '10px 0 0',
            maxWidth: 290,
            color: 'var(--cf-ink-3)',
          }}
        >
          Your passphrase is the only key — it never leaves this device and we
          can&apos;t reset it. Without it, this data can&apos;t be recovered. You can wipe
          this device&apos;s vault and start fresh from a backup.
        </p>
      )}
    </div>
  )
}

// ── LockedScreen wrapper ───────────────────────────────────────────────────

type Props = {
  children: React.ReactNode
  onUnlocked: () => void
  compact?: boolean
}

export default function LockedScreen({ children, onUnlocked, compact = false }: Props) {
  const u = useUnlock(onUnlocked)
  const sealed = u.state === 'locked'
  const revealing = u.state === 'revealing'

  return (
    <div className="lock-stage">
      {/* aria-hidden keeps AT out of the sealed content; CSS handles pointer-events */}
      <div
        className={'lock-content' + (sealed ? ' is-sealed' : revealing ? ' is-revealing' : '')}
        aria-hidden={sealed || revealing || undefined}
      >
        {children}
      </div>

      {u.state !== 'open' && (
        <>
          <div className={'lock-scrim' + (revealing ? ' fade-out' : '')} />
          <div
            className={'lock-center' + (revealing ? ' fade-out' : '')}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lock-heading"
          >
            <LockPanel u={u} compact={compact} />
          </div>
        </>
      )}
    </div>
  )
}
