# jpl-fdr-tool — Fantasy Pro League Tools

Website met tools voor **Fantasy Pro League** (fantasy-spel van de Belgische Jupiler Pro League), gemaakt door @fpl_proleague. Live op https://fplproleague.vercel.app, GitHub: `fplproleague/jpl-fdr-tool` (openbaar).

Tabs (6): FDR (Fixture Difficulty Rating), Verwachte XI's, Team Planner, Spelers, Set pieces, Klassement. De watchlist zit sinds de redesign als filter in Spelers; Bonuspunten en Kaarten zijn sinds feedbackronde 2 de kolomkeuzes "Bonus" en "Kaarten" in Spelers. Watchlist, Price Changes, Bonuspunten en Kaarten bestaan niet meer als tab (oude links sturen door). Plus een speler- en clubpagina per speler/club. De site bestaat in het Nederlands (`/fdr`), het Frans (`/fr/fdr`) en het Engels (`/en/fdr`); elke tekst staat in `src/i18n.js` in alle drie de talen.

## Werken met de eigenaar

- De eigenaar is **geen ervaren programmeur**: leg uit in eenvoudig Nederlands, zonder jargon.
- **Niets pushen naar GitHub en geen bestaande code veranderen zonder het eerst te vragen.**
- Werk via een aparte branch + pull request naar `main`. Vercel bouwt `main` automatisch naar productie, en elke PR krijgt een preview-link.
- Lopende rework (november 2026): de redesign (`docs/redesign/DESIGN_SPEC.md`) en de functionaliteitsrework (`docs/functionaliteit/FUNCTIONALITEIT_SPEC.md`). Elke fase van die tweede rework gaat als PR naar de verzamelbranch `functionaliteit/eindresultaat`, niet naar `main`; pas op het einde gaat die verzamelbranch in één PR naar `main`.
- Commit- en PR-teksten in het Nederlands.

## Stack

- **React 18 + Vite 5**, gewoon JavaScript (geen TypeScript), geen CSS-framework. De styling staat in de componenten zelf.
- **Hosting: Vercel** (regio `fra1`). Instellingen en URL-rewrites staan in `vercel.json`.
- **Serverfuncties** in `api/` (Vercel Functions):
  - `api/team-form.js`: de vorm per club, uit API-Football. Gebruikt `API_FOOTBALL_KEY` en optioneel `API_FOOTBALL_SEASON`.
  - `api/shots.js`: schoten, schoten op doel en key passes per speler per speeldag, uit API-Football (Spelers, preset "Aanval"). Gedeelde API-Football-code (sleutel, clubs, spelers koppelen) in `api/_lib/apifootball.js`.
  - `api/team-xg.js`: xG voor en tegen per club per wedstrijd, uit API-Football (clubkaart, "laatste 5").
  - `api/lineups.js?gw=`: de officiële opstellingen van een speeldag, uit API-Football (Verwachte XI's en Team Planner op de wedstrijddag; browserkant in `src/data/officialLineups.js`).
  - `api/standings.js`: de plaats van elke club in het echte klassement, uit API-Football (clubkaart; browserkant in `src/data/standings.js`).
  - `api/kickoffs.js`: de aftraptijden per wedstrijd, uit de kalender van Fantasy Pro League (geen sleutel nodig; FDR-tooltip en wedstrijdstrip van de Verwachte XI's; browserkant in `src/data/kickoffs.js`).
  - `api/analyze-screenshot.js`: een screenshot van een team inlezen met Claude. Gebruikt `ANTHROPIC_API_KEY`.
  - `api/players.js`, `api/player/[id].js`, `api/rankings.js`: Spelers- en Klassement-tab, uit de publieke Fantasy Pro League-API (geen sleutel nodig). Gedeelde code in `api/_lib/proleague.js`. Zie `README.MD`.
- **Geen database / geen Supabase.** Spelersdata (naam, club, prijs, stats, kaarten) komt uit `/api/players` (`src/data/playerDatabase.js`). Lukt dat niet, dan valt de site terug op de Google Sheet. Set pieces komen enkel uit de Google Sheet (CSV-links in `src/constants.js`). Gebruikersdata (team, watchlist) blijft in `localStorage` van de browser.

## Belangrijkste bestanden

- `src/FDRTool.jsx`: de hoofdcomponent (tabs, data ophalen, layout).
- `src/tabs/*.jsx`: één bestand per tab. De kolomkeuzes van Spelers (Overzicht, Aanval, Verdediging, Bonus, Kaarten) staan in `PRESETS` in `src/spelers.js`.
- `src/constants.js`: teams, de **volledige kalender (`FIXTURES`)**, uitgestelde wedstrijden (`POSTPONED`), deadlines, huidige GW en de CSV-links. Kalenderwijzigingen (afgelastingen, deadlines) gebeuren hier.
- `src/predictedLineupsData.js`: de verwachte opstellingen. Die worden **elke speeldag bijgewerkt**, volgens de skill `.claude/skills/verwachte-xi/SKILL.md`: afbeeldingen van Siebe uit Discord halen (`scripts/lineups/discord-collect.js`), lezen, en via `npm run lineups` (controles + wegschrijven, rekenkern `scripts/lineups/lineupBuilder.js`) in de site zetten. Pas online (pushen) op het afgesproken moment, normaal vrijdag 16u.
- `src/routes.js` + `src/i18n.js`: routes en vertalingen (nl/fr/en). Een nieuwe tab = een entry in `ROUTES` + vertaalsleutels in de drie talen; zie `README.MD`. Geen zichtbare tekst hard in de code.
- `src/fdrRatings.js`: de FDR-ratings als afwijkingen van de standaard (`DEFAULT_RATINGS`), met de migratie uit de oude opslag. Pas je `DEFAULT_RATINGS` aan, dan krijgt iedereen die die club niet zelf veranderde de nieuwe waarde.
- Team Planner: `src/teamPlanner.js` (het rekenmodel: opslag `fpl_proleague_teamplanner_v2` met migratie uit v1, budget, gratis transfers, opstelling; puur en getest), `src/lineupScore.js` (score voor "Optimaliseer opstelling") en `src/useTeamPlanner.js` (de React-kant: state, meldingen, ongedaan maken). `src/tabs/TeamPlannerTab.jsx` toont enkel.
- `src/myRankTeam.js`: "Mijn team volgen" in Klassement (opslag `fpl_proleague_my_rank_team_v1`, enkel team-ID + teamnaam, nooit managernamen).
- Rondleiding voor nieuwe bezoekers: `src/tour.js` (de stappen per toestel, opslag `fpl_proleague_tour_seen_v1`; puur en getest) en `src/components/Tour.jsx` (welkomstkader met taalkeuze, de stappen over de echte pagina, het "?"-knopje in de topbalk). Een stap licht een onderdeel op via een CSS-selector: verandert de opmaak van een tab, kijk dan of de selector in `src/tour.js` nog klopt. Teksten: `tour.*` in `src/i18n.js`.
- `src/availability.js`: één beschikbaarheidsstatus per speler (geschorst, twijfel/risico uit de Verwachte XI's, één kaart van een schorsing). Bewust geen blessures (beslissing eigenaar).
- `scripts/build-routes.mjs`: maakt na de Vite-build een HTML-pagina per route/speler/club per taal, plus `sitemap.xml`, en een preview-afbeelding (og-card, 1200×630) per pagina in `dist/og/`. Wat er op een card staat: `src/ogCards.js`; het tekenen: `scripts/og/` (satori + resvg, enkel bij het bouwen; lettertypes en clublogo's als PNG staan daar ook). Een nieuwe club = ook zijn logo als PNG in `scripts/og/club-logos/`.
- `src/predicted-xi/` + `predicted-xi.html`: aparte, niet-gelinkte privétool om opstellingen samen te stellen.

## Opstarten (lokaal, Windows)

Nodig: Git en Node.js (getest met Node 26 / npm 11).

```bash
npm ci          # dependencies installeren (exact volgens package-lock.json)
npm run dev     # dev-server op http://localhost:5173
npm run build   # productiebuild naar dist/ (inclusief alle route-pagina's)
npm run preview # de build lokaal bekijken
npm test        # de tests (Vitest) van de pure functies: migraties, bonusregel, ...
```

Let op:
- `npm run dev` voert de functies in `api/` ook uit (via `localApiFunctions` in `vite.config.js`), dus de Spelers- en Klassement-tab werken lokaal. De vorm per club en de screenshot-import hebben een geheime sleutel nodig die `npm run dev` niet uit `.env` leest; die test je met `npx vercel dev` (vraagt Vercel-login + `vercel link`).
- `.env` bevat de echte sleutels (zie de namen hierboven) en staat in `.gitignore`. Nooit committen: de repo is openbaar. De waarden staan in Vercel → project → Settings → Environment Variables.
- npm meldt bij `npm ci` dat het install-script van `esbuild` niet is uitgevoerd. Dat is onschuldig: de build werkt.
- `.claude/launch.json` start de dev-server vanuit de Claude-app.
