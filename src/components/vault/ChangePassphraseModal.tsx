import { useId, useState } from 'react'
import { changePassphrase } from '../../lib/vault'
import ModalShell from './ModalShell'

type Props = {
  open: boolean
  onClose: () => void
}

const MIN_LEN = 12

export default function ChangePassphraseModal({ open, onClose }: Props) {
  const [oldPass, setOldPass] = useState('')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const oldId = useId()
  const passId = useId()
  const confirmId = useId()

  const tooShort = pass.length > 0 && pass.length < MIN_LEN
  const mismatch = confirm.length > 0 && pass !== confirm
  const canSubmit =
    oldPass.length > 0 && pass.length >= MIN_LEN && pass === confirm && !busy

  function reset() {
    setOldPass('')
    setPass('')
    setConfirm('')
    setBusy(false)
    setError(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await changePassphrase(oldPass, pass)
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change passphrase')
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
      title="Change passphrase"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor={oldId} className="micro mb-1.5 block">Current passphrase</label>
          <input
            id={oldId}
            type="password"
            autoComplete="current-password"
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
            className="input"
            autoFocus
          />
        </div>

        <div>
          <label htmlFor={passId} className="micro mb-1.5 block">New passphrase</label>
          <input
            id={passId}
            type="password"
            autoComplete="new-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="input"
            aria-describedby={tooShort ? `${passId}-err` : undefined}
          />
          {tooShort && (
            <p id={`${passId}-err`} role="alert" className="mt-1 text-[11px] text-out-ink">
              Too short — at least {MIN_LEN} characters.
            </p>
          )}
        </div>

        <div>
          <label htmlFor={confirmId} className="micro mb-1.5 block">Confirm new passphrase</label>
          <input
            id={confirmId}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
            aria-describedby={mismatch ? `${confirmId}-err` : undefined}
          />
          {mismatch && (
            <p id={`${confirmId}-err`} role="alert" className="mt-1 text-[11px] text-out-ink">Passphrases do not match.</p>
          )}
        </div>

        {error && <p role="alert" className="text-[12px] text-out-ink">{error}</p>}

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
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </ModalShell>
  )
}
