import { sql } from 'drizzle-orm'
import { db } from './client'

// Greenfield bootstrap. CREATE TABLE IF NOT EXISTS is idempotent so this
// can run on every boot. When the schema needs to evolve, swap this for
// a versioned migration runner — drizzle-kit's SQL output + a tiny
// `_migrations` table is the natural upgrade path.
//
// Goes through drizzle via `sql.raw` so we keep one query path through the
// ORM. The template-tag form (sql`...`) parameterizes interpolated values;
// for pure DDL with embedded literals like 'singleton' and CURRENT_TIMESTAMP,
// `sql.raw` is the right tool — it ships the string verbatim with no params.

const STATEMENTS = [
  // Discovery-phase rewrite: drop the old singleton `anchor` table on any
  // device that still has it. Idempotent — no-op on fresh installs.
  `DROP TABLE IF EXISTS anchor`,
  `CREATE TABLE IF NOT EXISTS balance_snapshot (
    id TEXT PRIMARY KEY,
    balance REAL NOT NULL,
    as_of TEXT NOT NULL UNIQUE,
    account_label TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS entry (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('IN','OUT')),
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    start_date TEXT NOT NULL,
    end_date TEXT,
    rrule TEXT,
    paused INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tag (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS entry_tag (
    entry_id TEXT NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
  )`,
]

let initialized: Promise<void> | null = null

export function initDb(): Promise<void> {
  if (initialized) return initialized
  initialized = (async () => {
    for (const stmt of STATEMENTS) {
      await db.run(sql.raw(stmt))
    }
  })()
  return initialized
}
