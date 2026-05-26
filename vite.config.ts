import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Listen on all interfaces so LAN devices can hit the dev server at
  // http://mini.agh:3000/. allowedHosts is required on Vite 6+ for any
  // non-localhost Host header.
  server: {
    host: true,
    port: 3000,
    allowedHosts: ['mini.agh', 'localhost', 'cashflow.houza.org'],
    // Vite dev is fronted by Caddy on https://cashflow.houza.org:5173/.
    // HMR client needs the public host+port (not vite's internal 3000) so its
    // WebSocket connects through Caddy's TLS-upgraded reverse_proxy.
    hmr: {
      host: 'cashflow.houza.org',
      protocol: 'wss',
      clientPort: 5173,
    },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    // Local-first app — all data lives in OPFS/Web Crypto/IndexedDB,
    // none of which exist on the server. SSR would render an empty shell
    // anyway, so we run as an SPA. Also sidesteps a TanStack Start
    // dev-mode virtual-module resolution bug in v1.168.12.
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
})

export default config
