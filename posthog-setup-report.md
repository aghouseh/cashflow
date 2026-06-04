# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into Cashflow. Here's a summary of what was done:

**Infrastructure:**
- Installed `@posthog/react` alongside the already-present `posthog-js`
- Added `PostHogProvider` to `src/routes/__root.tsx`, wrapping the entire app shell — handles auto-initialization, pageview capture, session replay, and exception tracking
- Implemented the real `track()` function in `src/lib/analytics/posthog.ts` using the posthog-js singleton (replaces the previous stub)
- Added a PostHog reverse proxy (`/ingest`) to `vite.config.ts` — routes PostHog traffic through the dev server to improve reliability and avoid ad-blocker interference
- Set `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST` in `.env.local`

**Events added or extended:**

| Event | Description | File |
|---|---|---|
| `onboarding_started` | User reaches the balance step — top of the onboarding funnel | `src/routes/onboarding.tsx` |
| `onboarding_complete` | User finishes all 3 onboarding steps | `src/routes/onboarding.tsx` *(pre-existing, kept)* |
| `reconcile_balance` | User submits a manual balance correction; now includes `source: 'balance'` | `src/routes/index.tsx` |
| `reconcile_balance` | Same event from the ledger view inline form; `source: 'ledger'` | `src/routes/ledger.tsx` *(new callsite)* |
| `balance_window_changed` | User clicks a window preset (30d/90d/6mo/1yr/2yr); includes `window` property | `src/routes/index.tsx` |
| `entry_create` | User adds a new recurring income or expense entry | `src/routes/entries.tsx` *(pre-existing, kept)* |
| `entry_update` | User edits an existing entry | `src/routes/entries.tsx` *(pre-existing, kept)* |
| `entry_delete` | User deletes an entry | `src/routes/entries.tsx` *(pre-existing, kept)* |
| `entry_pause` | User pauses or resumes an entry | `src/routes/entries.tsx` *(pre-existing, kept)* |
| `data_exported` | User downloads a data export; includes `format` ('json' or 'csv') | `src/components/ExportModal.tsx` |
| `data_imported` | User completes a data import; includes `mode` and `entry_count` | `src/components/ImportModal.tsx` |
| `vault_encryption_enabled` | User enables passphrase encryption for the first time | `src/components/vault/EnableEncryptionModal.tsx` |
| `vault_unlocked` | User successfully unlocks the encrypted vault | `src/components/vault/UnlockModal.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](https://us.posthog.com/project/453904/dashboard/1671464)
- [Onboarding Funnel](https://us.posthog.com/project/453904/insights/YhzHy6jr) — conversion from onboarding started → completed
- [Entry Management Activity](https://us.posthog.com/project/453904/insights/qtN8X0bc) — create/update/delete/pause trends
- [Balance Reconciliation Rate](https://us.posthog.com/project/453904/insights/FQNLqR3F) — how often users reconcile, by source
- [Data Export & Import Activity](https://us.posthog.com/project/453904/insights/ddQflnQf) — backup and restore usage
- [Balance Window Preferences](https://us.posthog.com/project/453904/insights/QRudB6iS) — which time window users prefer

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
