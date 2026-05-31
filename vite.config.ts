import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import sqlocal from 'sqlocal/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // rrule v2 has no `exports` field and ships CJS as `main` + ESM as `module`.
  // Bundlers see ESM (named exports work); Node ESM at runtime sees CJS
  // (only `default` works), so a plain `import { rrulestr } from 'rrule'`
  // fails in the SSR/prerender bundle. Forcing rrule to bundle into the
  // server output makes the bundler the single resolver — named imports work.
  ssr: { noExternal: ['rrule'] },
  // Listen on all interfaces so LAN devices can hit the dev server at
  // http://mini.agh:3000/. allowedHosts is required on Vite 6+ for any
  // non-localhost Host header.
  server: {
    host: true,
    port: 3000,
    allowedHosts: ['localhost', 'mini.agh', 'cashflow.mini.agh'],
  },
  plugins: [
    devtools(),
    tailwindcss(),
    // SQLocal needs cross-origin isolation (COOP: same-origin + COEP:
    // require-corp) for OPFS access; without those headers the browser
    // blocks persistent storage and the SQLite blob lives only in memory.
    // The plugin sets the headers automatically on the dev server.
    sqlocal(),
    // Local-first app — all data lives in OPFS/Web Crypto/IndexedDB,
    // none of which exist on the server. SSR would render an empty shell
    // anyway, so we run as an SPA. Also sidesteps a TanStack Start
    // dev-mode virtual-module resolution bug in v1.168.12.
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
})

export default config
