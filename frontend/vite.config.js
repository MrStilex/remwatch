import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    hmr: {
      host: process.env.VITE_HMR_HOST || '45.39.84.37',
      clientPort: Number(process.env.VITE_HMR_PORT || 5173),
      protocol: process.env.VITE_HMR_PROTOCOL || 'ws',
    },
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000',
    },
  },
})
