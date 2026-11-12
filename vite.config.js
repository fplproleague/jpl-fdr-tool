import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

// Enkel voor `npm run dev`: voert de serverfuncties in api/ lokaal uit, zoals Vercel dat in productie
// doet. Zonder dit stuurt Vite voor /api/... gewoon de broncode terug en werkt bv. de Spelers-tab
// lokaal niet. Ondersteunt api/<naam>.js en één dynamisch segment (api/player/[id].js). Functies die
// een geheime sleutel nodig hebben (team-form, analyze-screenshot) lezen die uit process.env; zonder
// sleutel geven ze lokaal gewoon hun gewone foutmelding.
function localApiFunctions() {
  const root = fileURLToPath(new URL('.', import.meta.url))
  const resolve = (pathname) => {
    const parts = pathname.replace(/^\/api\//, '').replace(/\/+$/, '').split('/').filter(Boolean)
    if (parts.length === 0 || parts.some(p => p.startsWith('_') || p.includes('..'))) return null
    const direct = `api/${parts.join('/')}.js`
    if (existsSync(root + direct)) return { file: direct, params: {} }
    if (parts.length === 2 && existsSync(`${root}api/${parts[0]}/[id].js`)) {
      return { file: `api/${parts[0]}/[id].js`, params: { id: decodeURIComponent(parts[1]) } }
    }
    return null
  }
  return {
    name: 'local-api-functions',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()
        const target = resolve(url.pathname)
        if (!target) return next()
        try {
          const mod = await server.ssrLoadModule('/' + target.file)
          req.query = { ...Object.fromEntries(url.searchParams), ...target.params }
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (body) => {
            if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(body))
            return res
          }
          await mod.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err?.message ?? err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApiFunctions()],
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
