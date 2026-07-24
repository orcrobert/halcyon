import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    allowedHosts: ['app.halcyon.test'],
    hmr: {
      host: 'app.halcyon.test',
      protocol: 'wss',
      clientPort: 443,
    },
  },
})
