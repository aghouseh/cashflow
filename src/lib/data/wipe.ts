import { db } from '../db/client'
import { entry, balanceSnapshot } from '../db/schema'
import { initDb } from '../db/init'
import { wipeVault } from '../vault'

// Permanently deletes all user data: every entry, every snapshot, and the
// encrypted vault blob + meta. Leaves the app in a clean first-run state.
export async function wipeAllData(): Promise<void> {
  await initDb()
  await db.delete(entry)
  await db.delete(balanceSnapshot)
  await wipeVault()
}
