# Cashflow — Architecture

Living doc for the v2 rebuild. Captures decisions; mocks (`~/Downloads/design_handoff_cashflow_v1/`) remain source of truth for visual + interaction intent.

## Product

Personal cash-projection tool. User anchors a starting balance, adds recurring income and expenses (with cadences), and the app extrapolates a running balance forward. Defining interaction: **scrub to any future date and see the projected balance at that moment**, with supporting context (events on that day, net change since today, lowest point ahead).

Single-user, single-device by default. No cloud, no accounts.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | TanStack Start (React 19, Vite 8, file-routed) | App-shaped (not content) + type-safe router + server functions where needed |
| Styling | Tailwind v4 with `@theme` tokens | Tokens declared once in `src/styles.css`, utilities auto-generated. Future design-system extraction stays clean |
| Storage | SQLocal (SQLite WASM via OPFS) | Local-first; real SQL semantics; portable `.db` file for export |
| ORM | Drizzle | Typed schema + queries directly on SQLocal; lightweight |
| Dates | `@js-temporal/polyfill` (Temporal API) | Civil-date math without TZ footguns; no date-fns |
| Cadence | `rrule.js` (RFC 5545) | Hardened. Covers every chip in the mock cadence rail (weekly, bi-weekly, 1st & 15th, monthly, quarterly, annual, custom) as a single string column |
| Crypto | Web Crypto (PBKDF2-SHA256 → AES-GCM-256) | Native, no WASM dep, sufficient for stolen-device threat model |
| Tests | Vitest + Testing Library | Ships with the scaffold |

Deliberately excluded: Next.js, Sanity, date-fns, server-side auth, hosted DB.

## Storage

### Layout

All app data lives in **one SQLite file in OPFS** at `cashflow.sqlite3`. Schema defined in `src/lib/db/schema.ts`. Drizzle types are inferred from the schema (no separate type definitions).

### Deployment requirement — cross-origin isolation

SQLocal needs OPFS, which the browser only exposes when the page is served with cross-origin isolation:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, the SQLite blob lives only in worker memory and **vanishes on refresh** — onboarding appears to "lose" everything. In dev, the `sqlocal/vite` plugin (registered in `vite.config.ts`) sets the headers automatically. In production, the host serving `dist/client/` must add them itself. Mini's Caddy block for `cashflow.houza.org` includes both.

Tables:
- `anchor` — singleton row (id = `'singleton'`). Holds the starting balance, the as-of date, and an optional account label.
- `entry` — one row per recurring or one-off cashflow item. Recurrence stored as RFC 5545 RRULE string in `entry.rrule` (null = one-time at `entry.start_date`). `kind` is `'IN' | 'OUT'`.
- `tag` — free-form labels.
- `entry_tag` — join table.

There is intentionally **no `user` table**. The device is the identity. If the user wipes browser data or switches devices, the data is gone unless they exported it first.

### Vault (opt-in at-rest encryption)

Three modes:

| Mode | Description | Where the data lives |
|---|---|---|
| `none` | Default. No passphrase set. | Plaintext SQLite in OPFS. SQLocal persists it normally. |
| `unlocked` | Encryption enabled; user has unlocked this session. | Plaintext in SQLocal's in-memory db. Ciphertext blob in OPFS at `cashflow.vault`. Encrypted snapshot flushed on every write. |
| `locked` | Encryption enabled; no key in memory. | Ciphertext only; queries refuse until passphrase entered. |

Rules:
- Enabling encryption is **one-way**. To revert, the user exports plaintext JSON and starts fresh.
- Forgotten passphrase = data is gone. No recovery, no email reset.
- Idle auto-lock is **off by default**, opt-in setting under vault dropdown.
- TopBar upper-right hosts the vault control: state badge + dropdown (Lock now, Change passphrase, Export, Import, Settings).
- Persistent **amber 🔓 indicator** when in `none` mode — honest, not alarmist. Same risk class as a finance spreadsheet on Desktop.
- Aggressive backup-nag in `none` mode (e.g. "you haven't exported in 30 days").

Crypto details (`src/lib/vault/crypto.ts`):
- Key derivation: PBKDF2-SHA256, 600,000 iterations, 256-bit output
- Cipher: AES-GCM-256 with a fresh 12-byte IV per write
- Output layout: `[salt(16) | iv(12) | ciphertext+tag]`

### Storage adapter boundary

App code talks to the storage layer through `src/lib/db/`, never directly to SQLocal. The vault wraps disk I/O only — schema and queries are vault-state-agnostic. This makes a future server-sync adapter (encrypted-blob upload, server holds ciphertext only) a contained swap, not a rewrite.

## Cadence + projection

Recurrence on every `entry` is stored as a single **RFC 5545 RRULE** string. Examples:

| Mock chip | RRULE |
|---|---|
| weekly | `FREQ=WEEKLY` |
| bi-weekly | `FREQ=WEEKLY;INTERVAL=2` |
| 1st & 15th | `FREQ=MONTHLY;BYMONTHDAY=1,15` |
| monthly | `FREQ=MONTHLY` |
| quarterly | `FREQ=MONTHLY;INTERVAL=3` |
| annual | `FREQ=YEARLY` |
| one-time | `null` (use `start_date`) |

The cadence picker UI in the mocks should be backed by a small constant table that emits RRULE strings. The picker is the only place the app cares about cadence "shape"; everywhere else, it's an opaque RRULE.

### Projection engine

`src/lib/projection.ts` (not yet written) is pure:

```
(anchor: Anchor, entries: Entry[], horizonDays: number) =>
  { events: { entryId, date, amount, kind }[], series: number[] }
```

Steps:
1. For each `entry`, expand `rrule.between(anchor.asOf, anchor.asOf + horizonDays)` → list of dates.
2. Multiply by `amount * (kind === 'IN' ? 1 : -1)` → signed events.
3. Sort events by date.
4. Accumulate from `anchor.balance` → `series[i]` for each day in horizon.

Memoize aggressively. Recompute only when anchor or entries change. The `scrubOffsetDays` state (single integer) reads from `series` and is the global source of truth for "viewing date".

Conversion at the rrule.js boundary: rrule returns native `Date`. Convert with `Temporal.PlainDate.from(d.toISOString().slice(0, 10))`.

## Routing

File-based, under `src/routes/`:

```
__root.tsx          Layout shell + TopBar
index.tsx           Balance (primary view)
entries.tsx         Entries list (recurring + one-offs)
ledger.tsx          Stub for now (designed later)
scenarios.tsx       Stub — out of scope for v1
onboarding.tsx      First-run flow (not yet wired)
```

Root loader gate: if `anchor` row is missing, redirect to `/onboarding`. If vault mode is `locked`, render unlock screen instead of route content.

## Onboarding

Three steps, all rendered in `/onboarding`:

1. **Anchor** (required) — current balance + as-of date + optional account label.
2. **Recurring income** (skippable) — add one or more income entries.
3. **Recurring expense** (skippable) — add one or more expense entries.

Encryption is **not** part of onboarding. Friction-free first run; users opt into encryption later via the TopBar vault dropdown.

## Design system

Tokens declared in `src/styles.css` under `@theme`. Color, font, radius — all sourced from the mock README. Components consume via Tailwind v4 utilities (`bg-card`, `text-ink-2`, `rounded-chip`, etc.) which Tailwind auto-generates from the `--color-*` / `--radius-*` tokens.

Reserved colors:
- **Amber** is exclusively the scrub/now marker. Never on buttons, never on income/expense.
- **In** (sage) and **out** (terracotta) appear only on glyphs (↑/↓) and the numeric itself — never as block fills.

All numerics use `font-variant-numeric: tabular-nums` (`.mono` / `.num` utility classes).

Components live in `src/components/`. No formal design-system package yet; tokens-first discipline keeps a future extraction cheap.

## Out of scope for v1

Per mock README, explicitly deferred:
- Multi-user, real accounts
- Real banking integrations
- Scenarios (named what-ifs)
- Past actuals reconciliation
- Multi-currency / FX
- Categories beyond a free-text field + tags
- Cross-device sync

## Open work map

In priority order:

1. **TopBar vault dropdown** — state badge (🔓 / 🔒 / 🔐), Lock / Unlock / Enable encryption / Change passphrase / Export / Import / Settings. Completes the vault disk-I/O TODOs in `src/lib/vault/index.ts`.
2. **Onboarding route** + root loader gate.
3. **Drizzle migrations bootstrap** — run pending migrations against SQLocal at app startup. Need to decide between `drizzle-kit generate` + a runtime migration runner vs. hand-authored migration table.
4. **Projection engine** (`src/lib/projection.ts`) + memoization story.
5. **Entry CRUD** — create/update/delete through Drizzle, exposed as plain async fns (no server roundtrip needed since storage is local).
6. **Real Hero + ChartLine** — replace the index route's placeholder cards with the scrub-driven projection chart.
7. **Cadence picker** — chip rail backed by RRULE constants, with next-N-occurrences preview.
8. **Add/Edit modal** — modal route (`/entries/new`, `/entries/$id`) with the live-projection preview.
9. **Export / Import** — plaintext JSON for `none` mode, passphrase-protected blob for encrypted mode.
10. **Auto-lock setting**, **backup-nag**, **mobile shells**.

## Conventions

- Date math: `Temporal.PlainDate` for civil dates, `Temporal.PlainDateTime` for timestamps. Convert at library boundaries; never reach for `Date` directly.
- File extensions in import paths (`./schema` not `./schema.js`) — TS resolves automatically in this project; ESM-required extensions are not currently needed since Vite handles resolution.
- Naming follows `~/Code/Personal/dotfiles/claude/naming-conventions.md` — `context_subcontext_action`, snake_case for tool/route/config names. React components stay `PascalCase`.
- `.claude/` is in `.gitignore`.
- Test before commit. Build must pass.
