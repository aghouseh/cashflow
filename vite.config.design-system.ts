import { defineConfig } from 'vite'

export default defineConfig({
  root: 'design-system',
  server: {
    port: 5175,
    host: true,
    allowedHosts: ['mini.agh'],
    open: true,
  },
})
