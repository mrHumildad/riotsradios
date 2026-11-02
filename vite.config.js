import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/riotsradios/',
  /* Only `npm run build:android` sets APP_BUILD=1. The Android bundle may carry
     plain-HTTP stations (data/cleartext-hosts.json); the Pages bundle may not. */
  define: {
    __APP_BUILD__: JSON.stringify(process.env.APP_BUILD === '1'),
  },
})
