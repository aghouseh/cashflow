import { desc } from 'drizzle-orm'
import { db } from '../db/client'
import { balanceSnapshot, type BalanceSnapshot } from '../db/schema'
import { newId } from '../id'
import { flush } from '../vault'

// Balance snapshots are a stream of observed balances. The most recent one
// (MAX(as_of) <= today) is what the projection engine treats as origin.
// One row per civil date; re-writing the same date upserts on the as_of unique.

export async function readLatestSnapshot(): Promise<BalanceSnapshot | undefined> {
  const rows = await db
    .select()
    .from(balanceSnapshot)
    .orderBy(desc(balanceSnapshot.asOf))
    .limit(1)
  return rows[0]
}

export async function listSnapshots(): Promise<BalanceSnapshot[]> {
  return db.select().from(balanceSnapshot).orderBy(desc(balanceSnapshot.asOf))
}

export type SnapshotInput = {
  balance: number
  asOf: string // ISO date (YYYY-MM-DD)
  accountLabel?: string | null
}

export async function writeSnapshot(input: SnapshotInput): Promise<BalanceSnapshot> {
  const row: BalanceSnapshot = {
    id: newId(),
    balance: input.balance,
    asOf: input.asOf,
    accountLabel: input.accountLabel ?? null,
    updatedAt: new Date().toISOString(),
  }
  await db
    .insert(balanceSnapshot)
    .values(row)
    .onConflictDoUpdate({
      target: balanceSnapshot.asOf,
      set: {
        balance: input.balance,
        accountLabel: input.accountLabel ?? null,
        updatedAt: row.updatedAt,
      },
    })
  await flush()
  return row
}
