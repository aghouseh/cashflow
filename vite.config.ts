import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
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
