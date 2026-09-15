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
