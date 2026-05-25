import { defineConfig } from 'drizzle-kit'

// SQLocal runs SQLite in the browser via OPFS — there is no shippable dbCredentials.
// drizzle-kit is used here purely to emit migration SQL into src/lib/db/migrations/
// from the TypeScript schema. The runtime app applies migrations against the
// in-browser SQLite via SQLocal at startup.

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
})
