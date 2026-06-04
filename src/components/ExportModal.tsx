import { useState } from 'react'
import ModalShell from './vault/ModalShell'
import { exportJson, exportCsv } from '../lib/data/transfer'
import { track } from '../lib/analytics/index.js'

type Props = {
  open: boolean
  onClose: () => void
}

type Format = 'json' | 'csv'

export default function ExportModal({ open, onClose }: Props) {
  const [format, setFormat] = useState<Format>('json')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      const date = new Date().toISOString().slice(0, 10)
      if (format === 'json') {
        const data = await exportJson()
        download(
          JSON.stringify(data, null, 2),
          `cashflow-export-${date}.json`,
          'application/json',
        )
      } else {
        const csv = await exportCsv()
        download(csv, `cashflow-entries-${date}.csv`, 'text/csv')
      }
      track('data_exported', { format })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Export data">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-ink-2">
          Download a copy of your cashflow data.
        </p>

        {/* Format selector */}
        <fieldset className="flex flex-col gap-2">
          <legend className="micro mb-2">Format</legend>
          <FormatOption
            value="json"
            current={format}
            onSelect={setFormat}
            label="JSON — full export"
            hint="Entries, balance snapshot, and metadata. Use this for backups or moving between devices."
          />
          <FormatOption
            value="csv"
            current={format}
            onSelect={setFormat}
            label="CSV — entries only"
            hint="One row per entry. Open in a spreadsheet. Cadence is stored as an rrule string."
          />
        </fieldset>

        {error && <p role="alert" className="text-[12px] text-out-ink">{error}</p>}

        <footer className="flex justify-end gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-field px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            className="rounded-field bg-ink px-4 py-1.5 text-[13px] text-card disabled:opacity-40"
          >
            {busy ? 'Exporting…' : 'Download'}
          </button>
        </footer>
      </div>
    </ModalShell>
  )
}

function FormatOption({
  value,
  current,
  onSelect,
  label,
  hint,
}: {
  value: Format
  current: Format
  onSelect: (v: Format) => void
  label: string
  hint: string
}) {
  const active = value === current
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-field border p-3 transition-colors ${
        active ? 'border-ink bg-card-2' : 'border-line-2 hover:border-ink-3'
      }`}
    >
      <input
        type="radio"
        name="export-format"
        value={value}
        checked={active}
        onChange={() => onSelect(value)}
        className="mt-0.5 accent-ink"
      />
      <div>
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>
      </div>
    </label>
  )
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
