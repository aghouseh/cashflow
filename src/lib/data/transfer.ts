// Data portability: JSON export/import + CSV export.
//
// JSON format — versioned envelope:
//   { version: 1, exportedAt: ISO, snapshot: {...} | null, entries: [...] }
//
// CSV format — entries only, one row per entry. Lossy (rrule → cadence label);
// round-trip is not guaranteed. Export-only for now.
//
// Import modes:
//   merge    — inserts entries whose id doesn't exist locally; upserts snapshots
//              by as_of date. ID-based dedup: safe for backup-restore on the
//              same device. Cross-device merges may produce duplicates if the
//              same logical entry was created independently on each device.
//   overwrite — deletes all entries and snapshots, then inserts the imported
//               data verbatim. Destructive; caller must confirm.

import { db } from '../db/client'
import { entry, balanceSnapshot } from '../db/schema'
import { initDb } from '../db/init'
import { listEntries } from './entry'
import { listSnapshots } from './snapshot'
import { flush } from '../vault'
import type { Entry, BalanceSnapshot } from '../db/schema'

// ── Envelope type ────────────────────────────────────────────────────────────

export const EXPORT_VERSION = 1

export type CashflowExport = {
  version: typeof EXPORT_VERSION
  exportedAt: string // ISO 8601
  snapshot: BalanceSnapshot | null
  entries: Entry[]
}

export type ImportResult = {
  entriesAdded: number
  entriesSkipped: number // merge only — already existed by id
  snapshotWritten: boolean
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function exportJson(): Promise<CashflowExport> {
  await initDb()
  const snapshots = await listSnapshots()
  const entries = await listEntries()
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    snapshot: snapshots[0] ?? null, // most-recent snapshot only
    entries,
  }
}

export async function exportCsv(): Promise<string> {
  await initDb()
  const entries = await listEntries()

  const header = ['id', 'kind', 'name', 'amount', 'currency', 'start_date', 'end_date', 'rrule', 'paused', 'created_at']
  const rows = entries.map((e) =>
    [
      e.id,
      e.kind,
      csvCell(e.name),
      e.amount,
      e.currency,
      e.startDate,
      e.endDate ?? '',
      e.rrule ?? '',
      e.paused ? '1' : '0',
      e.createdAt,
    ].join(','),
  )

  return [header.join(','), ...rows].join('\n')
}

// ── Import ───────────────────────────────────────────────────────────────────

export async function importJson(
  data: unknown,
  mode: 'merge' | 'overwrite',
): Promise<ImportResult> {
  const parsed = parseExport(data)
  await initDb()

  if (mode === 'overwrite') {
    await db.delete(entry)
    await db.delete(balanceSnapshot)
  }

  // Snapshot: upsert by as_of (the unique key). In overwrite mode the table
  // is already empty so this is a plain insert.
  let snapshotWritten = false
  if (parsed.snapshot) {
    await db
      .insert(balanceSnapshot)
      .values(parsed.snapshot)
      .onConflictDoUpdate({
        target: balanceSnapshot.asOf,
        set: {
          balance: parsed.snapshot.balance,
          accountLabel: parsed.snapshot.accountLabel,
          updatedAt: parsed.snapshot.updatedAt,
        },
      })
    snapshotWritten = true
  }

  // Entries: in merge mode skip ids that already exist.
  let entriesAdded = 0
  let entriesSkipped = 0

  if (parsed.entries.length > 0) {
    if (mode === 'overwrite') {
      await db.insert(entry).values(parsed.entries)
      entriesAdded = parsed.entries.length
    } else {
      // Insert or ignore per row — sqlite's onConflictDoNothing skips
      // any row whose primary key already exists.
      await db
        .insert(entry)
        .values(parsed.entries)
        .onConflictDoNothing()
      // Drizzle sqlite-proxy doesn't expose rowsAffected, so count by
      // checking which imported ids now exist in the table.
      const existing = await db.select({ id: entry.id }).from(entry)
      const existingIds = new Set(existing.map((r) => r.id))
      entriesAdded = parsed.entries.filter((e) => existingIds.has(e.id)).length
      entriesSkipped = parsed.entries.length - entriesAdded
    }
  }

  await flush()

  return { entriesAdded, entriesSkipped, snapshotWritten }
}

// ── Validation ───────────────────────────────────────────────────────────────

class ImportError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'ImportError'
  }
}

function parseExport(raw: unknown): CashflowExport {
  if (!raw || typeof raw !== 'object') throw new ImportError('File is not a valid JSON object.')
  const d = raw as Record<string, unknown>

  if (d.version !== EXPORT_VERSION) {
    throw new ImportError(
      `Unsupported export version: ${String(d.version ?? 'missing')}. Expected ${EXPORT_VERSION}.`,
    )
  }
  if (!Array.isArray(d.entries)) throw new ImportError('Missing entries array.')

  const entries = d.entries.map((e, i) => parseEntry(e, i))
  const snapshot = d.snapshot != null ? parseSnapshot(d.snapshot, 'snapshot') : null

  return {
    version: EXPORT_VERSION,
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : new Date().toISOString(),
    snapshot,
    entries,
  }
}

function parseEntry(raw: unknown, idx: number): Entry {
  const label = `entries[${idx}]`
  if (!raw || typeof raw !== 'object') throw new ImportError(`${label} is not an object.`)
  const e = raw as Record<string, unknown>

  requireString(e, 'id', label)
  requireEnum(e, 'kind', ['IN', 'OUT'], label)
  requireString(e, 'name', label)
  requireNumber(e, 'amount', label)
  requireString(e, 'startDate', label)

  return {
    id: e.id as string,
    kind: e.kind as 'IN' | 'OUT',
    name: e.name as string,
    amount: e.amount as number,
    currency: typeof e.currency === 'string' ? e.currency : 'USD',
    startDate: e.startDate as string,
    endDate: typeof e.endDate === 'string' ? e.endDate : null,
    rrule: typeof e.rrule === 'string' ? e.rrule : null,
    paused: e.paused === true,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString(),
    updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : new Date().toISOString(),
  }
}

function parseSnapshot(raw: unknown, label: string): BalanceSnapshot {
  if (!raw || typeof raw !== 'object') throw new ImportError(`${label} is not an object.`)
  const s = raw as Record<string, unknown>

  requireString(s, 'id', label)
  requireNumber(s, 'balance', label)
  requireString(s, 'asOf', label)

  return {
    id: s.id as string,
    balance: s.balance as number,
    asOf: s.asOf as string,
    accountLabel: typeof s.accountLabel === 'string' ? s.accountLabel : null,
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
  }
}

// ── Validation helpers ───────────────────────────────────────────────────────

function requireString(obj: Record<string, unknown>, key: string, label: string) {
  if (typeof obj[key] !== 'string' || !(obj[key] as string).trim()) {
    throw new ImportError(`${label}.${key} must be a non-empty string.`)
  }
}

function requireNumber(obj: Record<string, unknown>, key: string, label: string) {
  if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key] as number)) {
    throw new ImportError(`${label}.${key} must be a finite number.`)
  }
}

function requireEnum(obj: Record<string, unknown>, key: string, values: string[], label: string) {
  if (!values.includes(obj[key] as string)) {
    throw new ImportError(`${label}.${key} must be one of: ${values.join(', ')}.`)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function csvCell(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

export { ImportError }
