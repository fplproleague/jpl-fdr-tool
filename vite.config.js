import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // Multi-page build: predicted-xi.html is een volledig aparte, niet-gelinkte entry (persoonlijke
  // tool, zie src/predicted-xi/) — index.html/main.jsx blijven ongewijzigd, dus dit raakt de
  // bestaande site op geen enkele manier. fileURLToPath(new URL(...)) i.p.v. __dirname omdat
  // package.json "type": "module" heeft (geen __dirname beschikbaar in ESM-config).
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        predictedXi: fileURLToPath(new URL('./predicted-xi.html', import.meta.url)),
      },
    },
  },
})
