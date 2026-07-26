import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const devHost = process.env.VITE_DEV_HOST ?? 'localhost'
const behindProxyDomain = devHost !== 'localhost'
const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: devHost,
    port: 5173,
    strictPort: true,
    allowedHosts: behindProxyDomain ? [devHost] : undefined,
    hmr: behindProxyDomain
      ? { host: devHost, protocol: 'wss', clientPort: 443 }
      : undefined,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
})
