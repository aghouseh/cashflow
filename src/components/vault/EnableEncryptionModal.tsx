import { useState } from 'react'
import { enableEncryption } from '../../lib/vault'
import ModalShell from './ModalShell'

type Props = {
  open: boolean
  onClose: () => void
}

const MIN_LEN = 12

export default function EnableEncryptionModal({ open, onClose }: Props) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = pass.length > 0 && pass.length < MIN_LEN
  const mismatch = confirm.length > 0 && pass !== confirm
  const canSubmit =
    pass.length >= MIN_LEN && pass === confirm && acknowledged && !busy

  function reset() {
    setPass('')
    setConfirm('')
    setAcknowledged(false)
    setError(null)
    setBusy(false)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await enableEncryption(pass)
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable encryption')
      setBusy(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Enable encryption"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="rounded-field border border-out/30 bg-out-soft/60 p-3 text-[12px] leading-snug text-out-ink">
          <p className="font-medium">This is one-way.</p>
          <p className="mt-1">
            Once encrypted, your data can only be opened with this passphrase. There is
            no recovery, no email reset. If you forget it, your data is gone.
            <strong> Write it down before continuing.</strong>
          </p>
        </div>

        <Field label="Passphrase" hint={`${MIN_LEN}+ characters. Use a phrase you'll remember.`}>
          <input
            type="password"
            autoComplete="new-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="input"
            autoFocus
          />
          {tooShort && (
            <p className="mt-1 text-[11px] text-out-ink">Too short — at least {MIN_LEN} characters.</p>
          )}
        </Field>

        <Field label="Confirm passphrase">
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
          />
          {mismatch && (
            <p className="mt-1 text-[11px] text-out-ink">Passphrases do not match.</p>
          )}
        </Field>

        <label className="flex items-start gap-2 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I have written down this passphrase. I understand there is no recovery if I lose it.
          </span>
        </label>

        {error && <p className="text-[12px] text-out-ink">{error}</p>}

        <footer className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
            className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-field bg-ink px-4 py-1.5 text-[13px] text-card disabled:opacity-40"
          >
            {busy ? 'Encrypting…' : 'Enable encryption'}
          </button>
        </footer>
      </form>
    </ModalShell>
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
