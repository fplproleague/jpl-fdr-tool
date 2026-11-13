# jpl-fdr-tool — Fantasy Pro League Tools

Website met tools voor **Fantasy Pro League** (fantasy-spel van de Belgische Jupiler Pro League), gemaakt door @fpl_proleague. Live op https://fplproleague.vercel.app, GitHub: `fplproleague/jpl-fdr-tool` (openbaar).

Tabs: FDR (Fixture Difficulty Rating), Team Planner, Verwachte XI's, Spelers, Bonuspunten, Set Pieces, Watchlist, Kaarten, Klassement, Price Changes (`src/tabs/PlayerStatusTab.jsx` bestaat, maar wordt nergens gebruikt). Plus een speler- en clubpagina per speler/club. De site bestaat in het Nederlands (`/fdr`), het Frans (`/fr/fdr`) en het Engels (`/en/fdr`); elke tekst staat in `src/i18n.js` in alle drie de talen.

## Werken met de eigenaar

- De eigenaar is **geen ervaren programmeur**: leg uit in eenvoudig Nederlands, zonder jargon.
- **Niets pushen naar GitHub en geen bestaande code veranderen zonder het eerst te vragen.**
- Werk via een aparte branch + pull request naar `main`. Vercel bouwt `main` automatisch naar productie, en elke PR krijgt een preview-link.
- Commit- en PR-teksten in het Nederlands.

## Stack

- **React 18 + Vite 5**, gewoon JavaScript (geen TypeScript), geen CSS-framework. De styling staat in de componenten zelf.
- **Hosting: Vercel** (regio `fra1`). Instellingen en URL-rewrites staan in `vercel.json`.
- **Serverfuncties** in `api/` (Vercel Functions):
  - `api/team-form.js`: de vorm per club, uit API-Football. Gebruikt `API_FOOTBALL_KEY` en optioneel `API_FOOTBALL_SEASON`.
  - `api/analyze-screenshot.js`: een screenshot van een team inlezen met Claude. Gebruikt `ANTHROPIC_API_KEY`.
  - `api/players.js`, `api/player/[id].js`, `api/rankings.js`: Spelers- en Klassement-tab, uit de publieke Fantasy Pro League-API (geen sleutel nodig). Gedeelde code in `api/_lib/proleague.js`. Zie `README.MD`.
- **Geen database / geen Supabase.** Spelersdata (prijzen, stats, set pieces) komt uit openbaar gepubliceerde Google Sheets (CSV-links in `src/constants.js`). Gebruikersdata (team, watchlist) blijft in `localStorage` van de browser.

## Belangrijkste bestanden

- `src/FDRTool.jsx`: de hoofdcomponent (tabs, data ophalen, layout).
- `src/tabs/*.jsx`: één bestand per tab.
- `src/constants.js`: teams, de **volledige kalender (`FIXTURES`)**, uitgestelde wedstrijden (`POSTPONED`), deadlines, huidige GW en de CSV-links. Kalenderwijzigingen (afgelastingen, deadlines) gebeuren hier.
- `src/predictedLineupsData.js`: de verwachte opstellingen. Die worden **elke speeldag bijgewerkt**.
- `src/routes.js` + `src/i18n.js`: routes en vertalingen (nl/fr). Een nieuwe tab = een entry in `ROUTES` + vertaalsleutels; zie `README.MD`.
- `scripts/build-routes.mjs`: maakt na de Vite-build een HTML-pagina per route/speler/club per taal, plus `sitemap.xml`.
- `src/predicted-xi/` + `predicted-xi.html`: aparte, niet-gelinkte privétool om opstellingen samen te stellen.

## Opstarten (lokaal, Windows)

Nodig: Git en Node.js (getest met Node 26 / npm 11).

```bash
npm ci          # dependencies installeren (exact volgens package-lock.json)
npm run dev     # dev-server op http://localhost:5173
npm run build   # productiebuild naar dist/ (inclusief alle route-pagina's)
npm run preview # de build lokaal bekijken
```

Let op:
- `npm run dev` voert de functies in `api/` ook uit (via `localApiFunctions` in `vite.config.js`), dus de Spelers- en Klassement-tab werken lokaal. De vorm per club en de screenshot-import hebben een geheime sleutel nodig die `npm run dev` niet uit `.env` leest; die test je met `npx vercel dev` (vraagt Vercel-login + `vercel link`).
- `.env` bevat de echte sleutels (zie de namen hierboven) en staat in `.gitignore`. Nooit committen: de repo is openbaar. De waarden staan in Vercel → project → Settings → Environment Variables.
- npm meldt bij `npm ci` dat het install-script van `esbuild` niet is uitgevoerd. Dat is onschuldig: de build werkt.
- `.claude/launch.json` start de dev-server vanuit de Claude-app.
