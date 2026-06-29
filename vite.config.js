import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The real backend. We proxy /api -> backend in dev to dodge CORS entirely.
const BACKEND = 'https://yt-dlp.wololoaeyoyo.com'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1337,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
