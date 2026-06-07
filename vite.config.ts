import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import sqlocal from 'sqlocal/vite'
import { version } from './package.json' with { type: 'json' }

const config = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom'],
  },
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
    allowedHosts: ['localhost', 'mini.agh', 'cashflow.mini.agh', 'cashflow.dev.houza.org'],
    // HMR WebSocket must connect through Caddy's TLS termination (port 443),
    // not directly to Vite's port 3000. Caddy passes WS upgrades transparently.
    hmr: {
      host: 'cashflow.dev.houza.org',
      protocol: 'wss',
      clientPort: 443,
    },
    proxy: {
      '/tunnel': {
        target: 'https://o4511506017615872.ingest.us.sentry.io',
        changeOrigin: true,
        rewrite: () => '/api/4511506024759296/envelope/',
        secure: true,
      },
      '/ingest/static': {
        target: 'https://us-assets.i.posthog.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
        secure: false,
      },
      '/ingest/array': {
        target: 'https://us-assets.i.posthog.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
        secure: false,
      },
      '/ingest': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
        secure: false,
      },
    },
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
