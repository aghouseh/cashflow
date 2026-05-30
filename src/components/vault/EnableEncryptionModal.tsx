import { Children, cloneElement, isValidElement, useEffect, useId, useState } from 'react'
import { enableEncryption } from '../../lib/vault'
import { probeVaultStorage, type StorageProbeResult } from '../../lib/vault/storage-probe'
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
  const [probe, setProbe] = useState<StorageProbeResult | null>(null)

  useEffect(() => {
    if (!open) return
    probeVaultStorage().then(setProbe)
  }, [open])

  const tooShort = pass.length > 0 && pass.length < MIN_LEN
  const mismatch = confirm.length > 0 && pass !== confirm
  const opfsBlocked = probe !== null && !probe.opfsAvailable
  const canSubmit =
    pass.length >= MIN_LEN && pass === confirm && acknowledged && !busy && !opfsBlocked

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
      const msg = err instanceof Error ? err.message : String(err)
      const isStorageError = msg.toLowerCase().includes('clone') ||
        msg.toLowerCase().includes('opfs') ||
        msg.toLowerCase().includes('storage') ||
        msg.toLowerCase().includes('quota')
      setError(
        isStorageError
          ? "Your browser's storage isn't accessible here. Try a normal (non-incognito) window."
          : msg
      )
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
        {/* OPFS unavailable — hard block */}
        {opfsBlocked && (
          <div role="alert" className="rounded-field border border-out/30 bg-out-soft/60 p-3 text-[12px] leading-snug text-out-ink">
            <p className="font-medium">Not supported in this browser context.</p>
            <p className="mt-1">
              Encryption requires private local storage (OPFS) that isn't accessible
              here — likely because you're in a private or incognito window. Open
              cashflow in a normal browser window to enable encryption.
            </p>
          </div>
        )}

        {!opfsBlocked && (
          <>
            {/* Incognito warning — soft, OPFS works but data won't survive session */}
            {probe?.likelyIncognito && (
              <div role="status" className="rounded-field border border-amber/40 bg-amber-soft/60 p-3 text-[12px] leading-snug text-amber-ink">
                <p className="font-medium">Private browsing detected.</p>
                <p className="mt-1">
                  The encrypted vault is stored locally and will be lost when this
                  private window closes — along with any data inside it. Encryption is
                  safer to set up in a normal browser window.
                </p>
              </div>
            )}

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
                <p role="alert" className="mt-1 text-[11px] text-out-ink">Too short — at least {MIN_LEN} characters.</p>
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
                <p role="alert" className="mt-1 text-[11px] text-out-ink">Passphrases do not match.</p>
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

            {error && <p role="alert" className="text-[12px] text-out-ink">{error}</p>}
          </>
        )}

        <footer className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
            className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
          >
            {opfsBlocked ? 'Close' : 'Cancel'}
          </button>
          {!opfsBlocked && (
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-field bg-ink px-4 py-1.5 text-[13px] text-card disabled:opacity-40"
            >
              {busy ? 'Encrypting…' : 'Enable encryption'}
            </button>
          )}
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
  const id = useId()
  const kids = Children.toArray(children)
  const [first, ...rest] = kids
  return (
    <div>
      <label htmlFor={id} className="micro mb-1.5 block">{label}</label>
      {isValidElement(first) ? cloneElement(first as React.ReactElement, { id } as Record<string, unknown>) : first}
      {rest}
      {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
    </div>
  )
}
