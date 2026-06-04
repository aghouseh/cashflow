import { useState } from 'react'
import { unlock } from '../../lib/vault'
import ModalShell from './ModalShell'
import { track } from '../../lib/analytics/index.js'

type Props = {
  open: boolean
  onClose: () => void
}

export default function UnlockModal({ open, onClose }: Props) {
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPass('')
    setBusy(false)
    setError(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pass || busy) return
    setBusy(true)
    setError(null)
    try {
      await unlock(pass)
      track('vault_unlocked')
      reset()
      onClose()
    } catch {
      setError('Incorrect passphrase')
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
      title="Unlock vault"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="unlock-pass" className="micro mb-1.5 block">Passphrase</label>
          <input
            id="unlock-pass"
            type="password"
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="input"
            autoFocus
            aria-describedby={error ? 'unlock-pass-err' : undefined}
          />
          {error && <p id="unlock-pass-err" role="alert" className="mt-1 text-[12px] text-out-ink">{error}</p>}
        </div>

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
            disabled={!pass || busy}
            className="rounded-field bg-ink px-4 py-1.5 text-[13px] text-card disabled:opacity-40"
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </footer>
      </form>
    </ModalShell>
  )
}
