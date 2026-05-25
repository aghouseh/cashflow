import { SQLocalDrizzle } from 'sqlocal/drizzle'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from './schema'

// SQLocal runs SQLite WASM in a Web Worker, persisting to OPFS by default.
// The `databasePath` is a virtual file name inside OPFS, not a real path.

const sqlocal = new SQLocalDrizzle({ databasePath: 'cashflow.sqlite3' })

export const { sql, transaction } = sqlocal

// drizzle-orm wires through SQLocal's sqlite-proxy compatible driver.
export const db = drizzle(sqlocal.driver, sqlocal.batchDriver, { schema })

// Exposed for the vault module to read/write the raw SQLite file when toggling
// encryption (load to encrypt on enable, overwrite with decrypted blob on unlock).
export const databaseFile = {
  read: () => sqlocal.getDatabaseFile(),
  write: (file: File | Blob | ArrayBuffer | Uint8Array) =>
    sqlocal.overwriteDatabaseFile(file),
}

export type DB = typeof db
