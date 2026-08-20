import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/gw': {
        target: process.env.VITE_GATEWAY_PROXY_TARGET || 'http://localhost:5199',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/gw/, ''),
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
