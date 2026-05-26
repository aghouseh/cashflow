import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { anchor, type Anchor } from '../db/schema'
import { flush } from '../vault'

// Anchor is a singleton row (id = 'singleton'). Read returns undefined when
// the user hasn't set one yet — that state is the trigger for onboarding.

export async function readAnchor(): Promise<Anchor | undefined> {
  const rows = await db.select().from(anchor).where(eq(anchor.id, 'singleton'))
  return rows[0]
}

export type AnchorInput = {
  balance: number
  asOf: string // ISO date (YYYY-MM-DD)
  accountLabel?: string | null
}

export async function writeAnchor(input: AnchorInput): Promise<void> {
  await db
    .insert(anchor)
    .values({
      id: 'singleton',
      balance: input.balance,
      asOf: input.asOf,
      accountLabel: input.accountLabel ?? null,
    })
    .onConflictDoUpdate({
      target: anchor.id,
      set: {
        balance: input.balance,
        asOf: input.asOf,
        accountLabel: input.accountLabel ?? null,
        updatedAt: new Date().toISOString(),
      },
    })
  await flush()
}
