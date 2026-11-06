import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { stationCatalogPlugin } from './scripts/catalog-plugin.mjs'

export default defineConfig({
  plugins: [react(), stationCatalogPlugin()],
  base: '/riotsradios/',
  /* Only `npm run build:android` sets APP_BUILD=1. The Android bundle may carry
     plain-HTTP stations (data/cleartext-hosts.json); the Pages bundle may not. */
  define: {
    __APP_BUILD__: JSON.stringify(process.env.APP_BUILD === '1'),
  },
  server: {
    /* The dev catalog editor writes stations.csv; a watcher reload would stop
       playback mid-edit. The app refreshes its list from the editor API. */
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**', '**/stations.csv'],
    },
  },
})
