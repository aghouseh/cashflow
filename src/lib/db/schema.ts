import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from 'drizzle-orm/sqlite-core'

// Local-first cashflow schema. No User table — device is identity.
// Anchor is a singleton (one row); enforced at app level, not by the DB.

export const anchor = sqliteTable('anchor', {
  id: text('id').primaryKey().default('singleton'),
  balance: real('balance').notNull(),
  asOf: text('as_of').notNull(), // ISO date (YYYY-MM-DD) — civil date, no TZ
  accountLabel: text('account_label'),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const entry = sqliteTable('entry', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['IN', 'OUT'] }).notNull(),
  name: text('name').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  startDate: text('start_date').notNull(), // ISO date
  endDate: text('end_date'), // ISO date or null
  rrule: text('rrule'), // RFC 5545 string; null = one-time at startDate
  paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const tag = sqliteTable('tag', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
})

export const entryTag = sqliteTable(
  'entry_tag',
  {
    entryId: text('entry_id')
      .notNull()
      .references(() => entry.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] })],
)

export type Anchor = typeof anchor.$inferSelect
export type AnchorInsert = typeof anchor.$inferInsert
export type Entry = typeof entry.$inferSelect
export type EntryInsert = typeof entry.$inferInsert
export type Tag = typeof tag.$inferSelect
export type TagInsert = typeof tag.$inferInsert
