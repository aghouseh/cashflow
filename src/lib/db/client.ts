import { SQLocalDrizzle } from 'sqlocal/drizzle'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from './schema'

// SQLocal's constructor creates a Web Worker. Imports are safe on the server;
// actually instantiating one is not. We defer construction until the first
// call so the module can be imported during SSR without crashing.

let instance: SQLocalDrizzle | null = null

function client(): SQLocalDrizzle {
  if (instance) return instance
  if (typeof window === 'undefined') {
    throw new Error('SQLocal is browser-only and must not be touched during SSR')
  }
  instance = new SQLocalDrizzle({ databasePath: 'cashflow.sqlite3' })
  return instance
}

// Drizzle's sqlite-proxy wants both a single-statement driver and a batch
// driver. SQLocalDrizzle exposes both on the instance.
export const db = drizzle(
  async (sql, params, method) => client().driver(sql, params, method),
  async (queries) => client().batchDriver(queries),
  { schema },
)

// Exposed for the vault module to read/write the raw SQLite file when toggling
// encryption (load to encrypt on enable, overwrite with decrypted blob on unlock).
export const databaseFile = {
  read: () => client().getDatabaseFile(),
  write: (file: File | Blob | ArrayBuffer | Uint8Array) =>
    client().overwriteDatabaseFile(file),
}

export type DB = typeof db
