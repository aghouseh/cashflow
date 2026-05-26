import { db } from '../db/client'
import { entry, type Entry } from '../db/schema'
import { newId } from '../id'
import { flush } from '../vault'

export type EntryInput = {
  kind: 'IN' | 'OUT'
  name: string
  amount: number
  currency?: string
  startDate: string // ISO date
  endDate?: string | null
  rrule?: string | null // null = one-time at startDate
}

export async function createEntry(input: EntryInput): Promise<Entry> {
  const row: Entry = {
    id: newId(),
    kind: input.kind,
    name: input.name,
    amount: input.amount,
    currency: input.currency ?? 'USD',
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    rrule: input.rrule ?? null,
    paused: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.insert(entry).values(row)
  await flush()
  return row
}

export async function listEntries(): Promise<Entry[]> {
  return db.select().from(entry)
}
