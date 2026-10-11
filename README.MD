# Fantasy Pro League — FDR Tool

Interactieve Fixture Difficulty Rating tool voor Fantasy Pro League.

## Routes en talen

`src/routes.js` is de enige bron van waarheid voor de tabs, hun paden en de taal-voorvoegsels.
Nederlands staat op de kale paden (`/fdr`, `/team-planner`, …), Frans op hetzelfde pad met een
`/fr`-voorvoegsel (`/fr/fdr`, …).

`npm run build` genereert daaruit, via `scripts/build-routes.mjs`:

- één HTML-bestand per route **per taal** (`dist/fdr.html`, `dist/fr/fdr.html`, …) met de juiste
  `<html lang>`, title, description, canonical, og:*/twitter:*-tags en `hreflang`-alternates;
- `dist/sitemap.xml` met alle routes in beide talen.

Een nieuwe tool toevoegen = één entry in `ROUTES` + de `route.<key>.title`/`.description`-sleutels in
`src/i18n.js` (nl én fr). De rewrite in `vercel.json` moet enkel voor het Nederlandse pad toegevoegd
worden; de Franse versie loopt over de parameter-regel `/fr/:tool`.

## Recente vorm (automatisch)

De vormbalk per club (laatste 5 competitiewedstrijden) wordt berekend door `api/team-form.js` uit de
uitslagen van [API-Football](https://www.api-football.com/) (league 144, Jupiler Pro League). Er valt
niets meer handmatig bij te werken.

- Zet in Vercel de omgevingsvariabele `API_FOOTBALL_KEY` (je sleutel uit het API-Football-dashboard).
- Optioneel `API_FOOTBALL_SEASON` (bv. `2026` voor 2026-27); standaard wordt het seizoen uit de datum afgeleid.
- Controleren: open `/api/team-form`. `unmatched` hoort leeg te zijn; staat er een teamnaam in, vul dan
  `CLUB_KEYWORDS` in `api/team-form.js` aan.
- Het antwoord wordt 30 minuten op Vercels CDN gecachet, dus het kost maar een handvol requests per dag.
