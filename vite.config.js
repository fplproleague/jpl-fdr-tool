import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // Build-datum, gebruikt door de "Laatst bijgewerkt"-regel in de footer (zie
  // formatLastUpdatedLong in src/constants.js). Als string geïnjecteerd i.p.v. als Date-object:
  // `define` doet een letterlijke tekstvervanging in de bundle, dus de waarde moet valide JS-broncode
  // zijn. In `vite dev` wordt dit ook gedefinieerd, zodat de footer daar niet anders rendert dan in
  // productie.
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
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
