import { useRef, useState } from 'react'
import ModalShell from './vault/ModalShell'
import { importJson, type CashflowExport, EXPORT_VERSION, ImportError } from '../lib/data/transfer'
import { track } from '../lib/analytics/index.js'

type Props = {
  open: boolean
  onClose: () => void
  onImported: () => void // caller reloads data after successful import
}

type Mode = 'merge' | 'overwrite'
type Stage = 'pick' | 'preview' | 'confirm-overwrite' | 'done'

export default function ImportModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('pick')
  const [parsed, setParsed] = useState<CashflowExport | null>(null)
  const [mode, setMode] = useState<Mode>('merge')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStage('pick')
    setParsed(null)
    setMode('merge')
    setBusy(false)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    if (file.size > 10 * 1024 * 1024) {
      setError('File too large (max 10 MB).')
      return
    }

    try {
      const text = await file.text()
      const raw = JSON.parse(text) as unknown
      // Validate by running through parseExport via importJson dry-run isn't
      // available, so we do a lightweight pre-check here then let importJson
      // do full validation on submit.
      if (
        !raw ||
        typeof raw !== 'object' ||
        (raw as Record<string, unknown>).version !== EXPORT_VERSION
      ) {
        throw new ImportError(
          `Unsupported format or version. Expected a cashflow JSON export (version ${EXPORT_VERSION}).`,
        )
      }
      const data = raw as CashflowExport
      setParsed(data)
      setStage('preview')
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('File is not valid JSON.')
      } else {
        setError(err instanceof Error ? err.message : 'Could not read file.')
      }
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleImport() {
    if (!parsed) return
    if (mode === 'overwrite' && stage !== 'confirm-overwrite') {
      setStage('confirm-overwrite')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await importJson(parsed, mode)
      track('data_imported', { mode, entry_count: parsed.entries.length })
      setStage('done')
      onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
      setBusy(false)
    }
  }

  return (
    <ModalShell open={open} onClose={handleClose} title="Import data">
      {stage === 'pick' && (
        <PickStage fileRef={fileRef} onFileChange={onFileChange} error={error} onClose={handleClose} />
      )}
      {stage === 'preview' && parsed && (
        <PreviewStage
          data={parsed}
          mode={mode}
          onModeChange={setMode}
          onBack={reset}
          onImport={handleImport}
          busy={busy}
          error={error}
        />
      )}
      {stage === 'confirm-overwrite' && parsed && (
        <ConfirmOverwriteStage
          entryCount={parsed.entries.length}
          onBack={() => setStage('preview')}
          onConfirm={handleImport}
          busy={busy}
          error={error}
        />
      )}
      {stage === 'done' && (
        <DoneStage onClose={handleClose} />
      )}
    </ModalShell>
  )
}

// ── Stages ───────────────────────────────────────────────────────────────────

function PickStage({
  fileRef,
  onFileChange,
  error,
  onClose,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error: string | null
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Select a cashflow JSON export file. Only version {EXPORT_VERSION} files are supported.
      </p>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-line-2 px-6 py-8 text-center transition-colors hover:border-ink-3">
        <span className="text-[13px] font-medium text-ink">Choose file</span>
        <span className="text-[12px] text-ink-3">cashflow-export-*.json</span>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={onFileChange}
        />
      </label>
      {error && <p role="alert" className="text-[12px] text-out-ink">{error}</p>}
      <footer className="flex justify-end border-t border-line pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          Cancel
        </button>
      </footer>
    </div>
  )
}

function PreviewStage({
  data,
  mode,
  onModeChange,
  onBack,
  onImport,
  busy,
  error,
}: {
  data: CashflowExport
  mode: Mode
  onModeChange: (m: Mode) => void
  onBack: () => void
  onImport: () => void
  busy: boolean
  error: string | null
}) {
  const exportDate = new Date(data.exportedAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="rounded-card border border-line bg-card-2 px-4 py-3 text-[13px]">
        <p className="micro mb-2">File contents</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-ink-3">Exported</dt>
          <dd className="mono text-right">{exportDate}</dd>
          <dt className="text-ink-3">Entries</dt>
          <dd className="mono text-right">{data.entries.length}</dd>
          <dt className="text-ink-3">Balance snapshot</dt>
          <dd className="mono text-right">
            {data.snapshot
              ? `$${data.snapshot.balance.toLocaleString()} · ${data.snapshot.asOf}`
              : '—'}
          </dd>
        </dl>
      </div>

      {/* Mode selector */}
      <fieldset className="flex flex-col gap-2">
        <legend className="micro mb-2">How to import</legend>
        <ModeOption
          value="merge"
          current={mode}
          onSelect={onModeChange}
          label="Merge"
          hint="Adds entries that don't already exist (matched by ID). Your current data is kept. Safe to run multiple times."
        />
        <ModeOption
          value="overwrite"
          current={mode}
          onSelect={onModeChange}
          label="Overwrite"
          hint="Deletes all current entries and snapshots, then loads the imported file. Cannot be undone."
          destructive
        />
      </fieldset>

      {error && <p role="alert" className="text-[12px] text-out-ink">{error}</p>}

      <footer className="flex justify-between border-t border-line pt-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={busy}
          className={`rounded-field px-4 py-1.5 text-[13px] text-card disabled:opacity-40 ${
            mode === 'overwrite' ? 'bg-out-ink' : 'bg-ink'
          }`}
        >
          {busy ? 'Importing…' : mode === 'overwrite' ? 'Overwrite data…' : 'Import'}
        </button>
      </footer>
    </div>
  )
}

function ConfirmOverwriteStage({
  entryCount,
  onBack,
  onConfirm,
  busy,
  error,
}: {
  entryCount: number
  onBack: () => void
  onConfirm: () => void
  busy: boolean
  error: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-out bg-out-soft px-4 py-3">
        <p className="text-[13px] font-medium text-out-ink">This will permanently delete all current data.</p>
        <p className="mt-1 text-[12px] text-out-ink">
          All existing entries and balance snapshots will be removed and replaced
          with {entryCount} {entryCount === 1 ? 'entry' : 'entries'} from the import file.
          This cannot be undone.
        </p>
      </div>

      {error && <p role="alert" className="text-[12px] text-out-ink">{error}</p>}

      <footer className="flex justify-between border-t border-line pt-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-field bg-out-ink px-4 py-1.5 text-[13px] text-card disabled:opacity-40"
        >
          {busy ? 'Overwriting…' : 'Yes, delete and import'}
        </button>
      </footer>
    </div>
  )
}

function DoneStage({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-2">Import complete. Your data has been updated.</p>
      <footer className="flex justify-end border-t border-line pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-field bg-ink px-4 py-1.5 text-[13px] text-card"
        >
          Done
        </button>
      </footer>
    </div>
  )
}

// ── Mode option ───────────────────────────────────────────────────────────────

function ModeOption({
  value,
  current,
  onSelect,
  label,
  hint,
  destructive = false,
}: {
  value: Mode
  current: Mode
  onSelect: (v: Mode) => void
  label: string
  hint: string
  destructive?: boolean
}) {
  const active = value === current
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-field border p-3 transition-colors ${
        active
          ? destructive
            ? 'border-out bg-out-soft'
            : 'border-ink bg-card-2'
          : 'border-line-2 hover:border-ink-3'
      }`}
    >
      <input
        type="radio"
        name="import-mode"
        value={value}
        checked={active}
        onChange={() => onSelect(value)}
        className="mt-0.5"
      />
      <div>
        <p className={`text-[13px] font-medium ${active && destructive ? 'text-out-ink' : 'text-ink'}`}>
          {label}
        </p>
        <p className={`mt-0.5 text-[12px] ${active && destructive ? 'text-out-ink' : 'text-ink-3'}`}>
          {hint}
        </p>
      </div>
    </label>
  )
}
