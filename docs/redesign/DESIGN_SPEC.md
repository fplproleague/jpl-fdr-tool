# DESIGN_SPEC.md — Rework "FPL Pro League Tools"

> **Status:** goedgekeurd ontwerpkader, versie 1.1 (12 november 2026): palet = het logo, FDR-kleuren ongewijzigd
> **Voor:** Claude Code (lokaal, in deze repo)
> **Eigenaar:** @fpl_proleague. Lees eerst `CLAUDE.md`: die regels blijven gelden (uitleg in eenvoudig Nederlands, niets pushen zonder te vragen, één branch + PR per stap, commit- en PR-teksten in het Nederlands).
>
> Dit document is de **enige bron van waarheid** voor de visuele, structurele en functionele rework. Staat iets hier niet in, kies dan de oplossing die het best past bij de principes in §2, en vraag het de eigenaar bij twijfel.

---

## 0. Harde spelregels voor de rework

1. **Data-logica blijft ongemoeid.** Niets veranderen aan `api/**`, de CSV-parsers in `src/constants.js`, `src/spelers.js`-rekenlogica (behalve de expliciete kolomwijzigingen in §7.4), `src/bonuspunten.js`, `src/kaarten.js`, `src/setPieces.js`, `src/ranking.js`, `src/clubMatching.js`, `src/utils/**`, en de state/handlers in `FDRTool.jsx` (ratings, homeAdvantage, watchlist, teamPlanner, transfers, boosters). We wijzigen **hoe** dingen eruitzien en waar ze staan, niet hoe ze berekend worden.
2. **localStorage-sleutels blijven exact hetzelfde** (`fpl_proleague_fdr_ratings_v1`, `..._fdr_home_advantage_v1`, `..._watchlist_v1`, `..._teamplanner_v1`, `..._language_v1`, `..._spelers_cache_v1`). Geen enkele gebruiker mag zijn ratings, team of watchlist verliezen.
3. **Bestaande URL's blijven werken.** Wat verdwijnt, krijgt een redirect (zie §6.3). Nederlands op kale paden, Frans onder `/fr/...`, zoals nu.
4. **`src/predicted-xi/**` (de privé-builder en de PNG-export voor X) verandert niet van uiterlijk.** De publieke tab mag `PitchField` hergebruiken, maar enkel via een nieuwe `variant="site"`-prop (§7.2). De standaardweergave en de export blijven pixel-identiek.
5. **Twee talen.** Elke nieuwe of gewijzigde tekst krijgt een sleutel in `src/i18n.js`, in `nl` én `fr`.
6. **Behoud het goede werk dat er al is:** de route- en SEO-opzet (`routes.js`, `build-routes.mjs`), de lazy loading van tabs, URL-state in de Spelers-tab, de toegankelijkheid (skip-link, `aria-*`, 44px-tikzones op touch, `prefers-reduced-motion`) en de contrastberekeningen.
7. **Niet mergen tussen vrijdag 12:00 en de deadline.** Dan wordt `src/predictedLineupsData.js` bijgewerkt en is de site het drukst bezocht.
8. **Elke fase = één branch + PR + Vercel-preview.** De eigenaar keurt goed vóór de merge.

---

## 1. Audit: de huidige staat (12 november 2026)

Gecontroleerd: de codebase in deze map en de live site op 1440×900 (desktop) en 390×844 (gsm), alle tabs.

### 1.1 Een aanname die niet klopt

De site gebruikt **geen Tailwind**. Er is geen enkel CSS-framework: alle styling staat inline in de componenten (**688× `style={{…}}`**), plus één CSS-string van zo'n 650 regels in `FDRTool.jsx`. Het "vibe-coded" gevoel komt dus niet van Tailwind-klassen, maar wel van exact dezelfde patronen die AI-tools standaard genereren. Dat zie je in de waarden zelf.

### 1.2 Vibe-coded signalen, met bewijs

| # | Signaal | Waar / bewijs |
|---|---|---|
| V1 | **Donker paars + één neon-accent** (het bekendste AI-palet) | `#2A1440` / `#3D1E5C` + turquoise `#4ECDC4`. Turquoise staat **131×** hard gecodeerd in `.jsx`, ondanks `theme.js`. Het paars past ook niet bij het eigen logo (petrol `#09282A` + aqua). Paars is niet *kapot*: het grootste vibe-effect komt van V2–V8 (structuur). Daarom wisselen we naar het logopalet en houden we het aqua (§3.1). |
| V2 | **Inter als lettertype** (het meest herkenbare AI-signaal) + alles in Archivo 900 kapitalen | `index.html` laadt `Inter` en `Archivo:500;700;900`. |
| V3 | **Tweekleurig wordmark-"hero"** | "FPL PRO LEAGUE" wit + "TOOLS" turquoise op 44px, met een app-icoon ernaast. Het eerste wat je ziet is een template. |
| V4 | **Decoratieve achtergrond** | Stippenraster met radiale masker linksboven (`radial-gradient(circle 550px at top left …)`). Heeft geen functie. |
| V5 | **Alles in een doosje** | Het patroon `rgba(255,255,255,0.04)` + 1px `rgba(255,255,255,0.08)` + radius 10px komt overal terug. 13 verschillende radii (`10px`×52, `8px`×45, `999px`×24, …). Bonuspunten: **elke rij is een aparte kaart**. Team Planner: dozen in dozen ("Spelers: 0/15" in "Mijn 15 spelers"). |
| V6 | **Icoon voor elke sectietitel, in kapitalen** | "⊞ FIXTURE DIFFICULTY RATING", "👥 MIJN 15 SPELERS", "👕 VELD", "⚙ TEAM-STERKTE INSTELLEN". |
| V7 | **Pillen overal** | "RATING VAN @FPL_PROLEAGUE", "UPDATED: GW11", "AANRADER", "3 gratis transfers", "Bank: 0/4", "Formatie: —", de deadline, de taalkeuze. |
| V8 | **Snoepjes-FDR** | Afgeronde FDR-tegels met tussenruimte. Ze lezen als knoppen, niet als een heatmap. |
| V9 | **Geen cijfertypografie** | **0×** `tabular-nums`. Punten, prijzen en percentages staan in proportionele cijfers, waardoor kolommen verspringen. |
| V10 | **Geen typografische schaal** | 14 verschillende font-sizes, waaronder 8, 9 en 10px. |
| V11 | **Token-drift = echte a11y-bug** | `theme.js` zegt dat `#8F79AD` en `#6B5289` vervangen zijn wegens te weinig contrast (`#6B5289` = 2,51:1). Toch staan ze nog **26×** en **7×** hard in de code (o.a. `Sheet.jsx`). |

### 1.3 Inconsistenties tussen de tools

- **Zoekvelden:** Spelers heeft een zoekveld over de volle breedte van ~40px hoog, Bonuspunten een smal veld van 320px × 28px, Team Planner velden van 190px.
- **Filters:** Spelers gebruikt chips, Bonuspunten/Kaarten de `ScopeFilter`-doosjes (radius 10px), Bonuspunten daarnaast nog een pil-toggle (`SortModeToggle`) en Klassement native selects.
- **Spelerslijsten:** Spelers is een echte tabel, Bonuspunten en Kaarten zijn kaartrijen, Set Pieces zijn clubkaarten en de Watchlist zijn kaartjes. Vier verschillende manieren om "een lijst spelers met een getal" te tonen.
- **Twee verschillende spelersdetails:** `components/PlayerSheet.jsx` (vanuit de site) en `components/SpelerPopup.jsx` (vanuit Spelers) tonen dezelfde speler met een andere opbouw.
- **Spelersfoto's** staan enkel in de Spelers-tab. Overal elders zie je alleen een clublogo.

### 1.4 Gebruiksvriendelijkheid en logica

- **Gsm: ~230px "chrome" vóór de inhoud.** Merk, deadline, minileague, taal en tabs staan op 4 rijen. De FDR-tabel begint pas op y≈500 van 844px.
- **Desktop-nav loopt over:** met 10 tabs valt "KLASSEMENT" af op 1440px, en "Price Changes" is onzichtbaar.
- **FDR is groter dan de cijfers doen vermoeden.** `/` toont de FDR (`routeKeyFromPath`), dus FDR = 27% + 14% = **~41%** van de views. Daarna volgen Verwachte XI's (22%) en Team Planner (11%).
- **Verwachte XI's tussen twee vrijdagen:** een gele waarschuwing ("dit zijn de opstellingen van GW11"), tegelijk een lege toestand ("GW12 nog niet klaar") en een knop om GW11 toch te tonen. Drie boodschappen voor één situatie. Je kan ook niet alle 18 clubs in één keer overlopen, en de clubkiezer is alfabetisch in plaats van per wedstrijd.
- **Team Planner (leeg):** 15 smalle zoekvelden onder elkaar, met het veld pas daaronder. De pagina is 1865px lang voordat je iets ziet, en de breedte wordt niet benut.
- **Price Changes:** een dode pagina (het spel kent geen prijswijzigingen), maar wel in nav en sitemap. `tabs/PlayerStatusTab.jsx` is dode code.
- **Watchlist (3%)** dupliceert wat de Spelers-tab al kan (`scope=watchlist` bestaat al in Spelers, Bonuspunten en Kaarten).
- **Klassement → minileague** vraagt een league-ID dat bijna niemand vindt.
- **Spelers-stats:** "% Kap" is overbodig, "Eigendom" is een vreemd woord, "Kansen" zegt niet dat het om *gecreëerde* grote kansen gaat, en "TG" (tegengoals) is niet relevant.

---

## 2. Visuele richting: "Scorebord"

### 2.1 Concept

Een **data-terminal voor matchday**: de dichtheid van SofaScore en FBref en de hardheid van een stadionscorebord, met monospace-cijfers. **Het palet komt uit het eigen logo** (petrol `#09282A` + aqua `#33EDD5`, zie `public/icon-512.png`). Site, app-icoon en favicon vormen zo eindelijk één merk. Het paars verdwijnt, het aqua dat bezoekers herkennen blijft. **Petrol en aqua** zijn de merkkleuren; groen, geel, oranje en rood spreken enkel in de FDR en in statussen.

Doelgroep: casual managers die de site **op hun gsm openen vlak voor de deadline**. Elke pixel moet een cijfer, naam of beslissing dragen.

### 2.2 Vijf ontwerpprincipes

1. **Cijfers zijn de held.** Elk getal in monospace, rechts uitgelijnd, op één baseline. Groottes en gewichten maken hiërarchie, geen kleuren of doosjes.
2. **Lijnen, geen dozen.** Structuur komt van 1px-haarlijnen, uitlijning en witruimte. Kaarten bestaan niet (enkel overlays: sheet, menu, toast).
3. **Kleur = betekenis.** Aqua betekent "actief / jouw actie", rood "gevaar / moeilijk", groen "goed / makkelijk", wit omgekeerd betekent "geselecteerd". Nergens kleur als versiering.
4. **Eerst de inhoud.** Op gsm staat de inhoud binnen 100px van de bovenrand, en navigatie zit onderaan onder je duim.
5. **Eén component per soort ding.** Een spelersrij, een tabel en een filter zien er op elke pagina identiek uit.

---

## 3. Design tokens

Aan te maken in `src/styles/tokens.css`, globaal geïmporteerd in `src/main.jsx`. **Alle** kleuren, maten en fonts komen voortaan hieruit.

### 3.1 Kleuren

```css
:root {
  /* Petrol (achtergronden), afgeleid van het logo #09282A */
  --ink-0: #061B1C;   /* pagina, iets dieper dan het logo */
  --ink-1: #09282A;   /* = logokleur: topbalk, tabelkop, sticky kolom, sheet, input */
  --ink-2: #0F3231;   /* hover, foto-achtergrond, inactieve chip */
  --ink-3: #163B3A;   /* pressed */

  /* Lijnen */
  --line:        #183D3D;  /* standaard-haarlijn tussen rijen */
  --line-strong: #24514F;  /* sectiescheiding, input-rand, tabelkop-onderrand */

  /* Tekst (contrast t.o.v. --ink-0 / --ink-1) */
  --text-1: #EEF5F2;  /* 16.1 / 14.1:1  primair */
  --text-2: #B4C7C2;  /* 10.1 /  8.8:1  secundair */
  --text-3: #8AA5A0;  /*  6.8 /  5.9:1  tertiair, labels, kolomkoppen */
  --text-4: #5E7772;  /*  3.7:1  ENKEL disabled/decoratief, nooit voor leesbare info */

  /* Rollen */
  --accent:     #33EDD5;  /* aqua uit het logo, 12.0:1 op ink-0 */
  --accent-ink: #061B1C;  /* tekst op aqua */
  --danger:     #FF5A47;  /* 5.8:1 op ink-0, 5.1:1 op ink-1. Als tekst enkel op ink-0/ink-1 */
  --positive:   #3FD68F;  /* 9.5:1 als tekst */
  --warning:    #F2A33A;  /* oranje */

  /* Geselecteerd = omgekeerd */
  --invert-bg:   #EEF5F2;
  --invert-text: #061B1C;

  /* Veld (Team Planner + publieke Verwachte XI's): groener dan de pagina, zodat het veld loskomt */
  --pitch:      #0E3A2C;
  --pitch-line: rgba(238, 245, 242, 0.14);
}
```

**Regels voor aqua (`--accent`):** enkel voor de primaire knop (max. één per scherm), het actieve nav-item, de gesorteerde kolomkop, de focusring, de deadline-teller binnen 24u, de "nieuw"-markering bij Verwachte XI's en de "beste waarde" in tabellen. Nooit als grote vlakvulling buiten de primaire knop, nooit als tekst op een lichte achtergrond. Aqua staat **nooit** in of naast een FDR-cel als achtergrond: het lijkt te veel op de groene ratings.

**Terugval-palet (enkel als de eigenaar toch paars wil houden):** alleen deze variabelen veranderen, de rest van de spec blijft identiek.
```css
:root {
  --ink-0: #1E0F2E; --ink-1: #2A1440; --ink-2: #341B4F; --ink-3: #3D1E5C;
  --line: #352349;  --line-strong: #4A3563;
  --text-1: #F4EFF9; --text-2: #C9B8E0; --text-3: #A794C2; --text-4: #7A6896;
  --accent: #4ECDC4; --accent-ink: #0B2E1B;
  --invert-bg: #F4EFF9; --invert-text: #1E0F2E;
}
```

### 3.2 FDR-schaal: ongewijzigd, het midden blijft geel

De huidige `RATING_STYLE`-kleuren in `constants.js` blijven exact zoals ze zijn. Volgers kennen ze van de FDR-graphics op X, en ze werken goed op petrol (zie de vergelijking die bij deze versie hoort). Alle combinaties halen WCAG AA voor de celtekst.

| Rating | Achtergrond | Tekst | Contrast | Label |
|---|---|---|---|---|
| 1 | `#1F7A4D` | `#EAFBF1` | 5.0:1 | Makkelijkst |
| 2 | `#5BAE7A` | `#0B2E1B` | 5.5:1 | Makkelijk |
| 3 | `#E8C547` | `#3D2E00` | 7.9:1 | Gemiddeld |
| 4 | `#E08A3E` | `#2E1500` | 6.4:1 | Moeilijk |
| 5 | `#C2402C` | `#FFFFFF` | 5.2:1 | Moeilijkst |

Wat wél verandert, is de **vorm** van de cel (§5.9: een vol vlak, radius 0, 1px-tussenruimte), niet de kleur. Spiegel de waarden als CSS-variabelen `--fdr-1-bg` … `--fdr-5-fg` in `tokens.css`, met `RATING_STYLE` als bron. Het cijfer in de hoek blijft staan: dat is de toegankelijke backup voor kleurenblinden.

Omdat geel in de FDR zit, is geel **geen** UI-kleur: gebruik het nergens buiten de FDR-cellen, MiniFixtures en de "Gemiddeld"-legende.

### 3.3 Startzekerheid (Verwachte XI's, vervangt de kleuren uit `SAFETY_LEGEND`)

| Sleutel in data | Label | Weergave |
|---|---|---|
| `darkgreen` | Zeker | gevuld rondje `--positive` |
| `green` | Starter | open rondje, 2px rand `--positive` |
| `orange` | Twijfel | gevuld rondje `--warning` |
| `red` | Risico | gevuld rondje `--danger` |

Dit is de **enige** plek waar ronde statusstipjes mogen, altijd met een legende erbij.

### 3.4 Typografie

**Fonts** (vervang de Google Fonts-link in `index.html`, **Inter verdwijnt**):

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Martian+Mono:wdth,wght@75..112.5,400..700&display=swap" />
```

- **Archivo** (variabel, met breedte-as) voor alle tekst en UI. Het merk blijft herkenbaar, maar we gebruiken nu de **condensed** breedte voor titels (sportaffiche) en de normale breedte voor lopende tekst.
- **Martian Mono** (variabel, semi-condensed) voor **alle cijfers**: punten, prijzen, %, minuten, GW-nummers, rangen, deadline-teller. Echte monospace, dus kolommen staan altijd recht.

```css
:root {
  --font-ui:   'Archivo', system-ui, sans-serif;
  --font-num:  'Martian Mono', ui-monospace, monospace;
}
body { font-family: var(--font-ui); font-stretch: 100%; }
.num {
  font-family: var(--font-num);
  font-stretch: 87.5%;
  font-variant-numeric: tabular-nums slashed-zero;
  font-feature-settings: "tnum" 1, "zero" 1;
  letter-spacing: -0.01em;
}
```

**Schaal: precies 7 maten.** Niets anders gebruiken.

| Token | px / line-height | Gebruik | Font |
|---|---|---|---|
| `--fs-display` | 32 / 32 (gsm 26) | Paginatitel (H1) | Archivo 800, `font-stretch: 68%`, KAPITALEN, `letter-spacing: -0.01em` |
| `--fs-title` | 18 / 24 | Sectietitel (H2) | Archivo 700, 100%, **zinsnotatie** (geen kapitalen, geen icoon) |
| `--fs-body` | 15 / 22 | Uitlegtekst, sheet-tekst | Archivo 400 |
| `--fs-ui` | 13 / 18 | Knoppen, tabelcellen, labels | Archivo 500/600 |
| `--fs-meta` | 12 / 16 | Secundaire info, cijfers in tabellen | Archivo 400 / Martian Mono 500 |
| `--fs-label` | 11 / 14 | Kolomkoppen, micro-labels | Archivo 600, KAPITALEN, `letter-spacing: 0.06em`, kleur `--text-3` |
| `--fs-micro` | 10 / 12 | **Enkel** het FDR-hoekcijfer en de prijslabels op het veld | Martian Mono 600 |

Kapitalen zijn **enkel** toegestaan voor H1, kolomkoppen/micro-labels, clubcodes (`CLU`) en positiecodes (`MID`).

### 3.5 Ruimte, vorm en beweging

```css
:root {
  /* 4px-raster */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px;

  /* Radius: hoekig */
  --r-0: 0;     /* tabellen, secties, FDR-cellen, nav, sheets */
  --r-1: 2px;   /* knoppen, inputs, chips, spelersfoto's, tooltips */
  /* Rond (50%) ENKEL voor statusstipjes (§3.3) en vormstipjes. Geen pillen. */

  /* Diepte: geen schaduwen, behalve voor overlays */
  --shadow-overlay: 0 12px 32px rgba(0, 0, 0, 0.55); /* sheet, menu, toast; niets anders */

  /* Beweging */
  --dur-fast: 120ms;  /* hover, focus, kleur */
  --dur-base: 180ms;  /* sheet in/uit, menu */
  --ease: cubic-bezier(0.2, 0, 0, 1);

  /* Lagen */
  --z-sticky: 10; --z-nav: 30; --z-overlay: 40; --z-sheet: 50; --z-toast: 60;

  /* Layout */
  --gutter: 24px;          /* gsm: 12px */
  --max-data: 1440px;      /* FDR, Spelers, Bonuspunten, Kaarten */
  --max-read: 72ch;        /* uitlegtekst */
  --topbar-h: 56px;        /* gsm: 48px */
  --bottomnav-h: 56px;     /* gsm, + env(safe-area-inset-bottom) */
}
```

- **Focus:** `outline: 2px solid var(--accent); outline-offset: 2px;` op alles wat focusbaar is (`:focus-visible`).
- **Breakpoints:** behoud `MOBILE_TABLE_BREAKPOINT = 700` voor tabellen. Navigatie wisselt op **900px** (onder 900 = onderbalk). Ontwerp vanaf **360px** breed.
- **Touch:** behoud de bestaande `@media (pointer: coarse)`-regels die tikzones naar ≥44px tillen.
- `@media (prefers-reduced-motion: reduce)` zet alle transities op 0ms.

---

## 4. Verboden lijst

Claude Code mag het volgende **niet** gebruiken. De grep-checks in §11 controleren dit.

1. **Gradients** (`linear-`/`radial-gradient`) als versiering, glows of aurora's. *Toegestaan, enkel functioneel:* een `mask-image`-fade aan de rand van een horizontaal scrollende tabel, arcering voor uitgestelde wedstrijden (`repeating-linear-gradient`) en de bestaande html2canvas-export.
2. **Drop-shadows** buiten `--shadow-overlay`. Geen gekleurde schaduwen, geen `box-shadow` op kaarten, knoppen of rijen.
3. **Afrondingen** groter dan 2px (`--r-1`). Geen `999px`-pillen, geen 8/10/12/14px.
4. **Kaarten:** geen `background: rgba(255,255,255,0.04)`-doosjes met een rand rond inhoud. Geen dozen in dozen. Geen lijst waarbij elke rij een losse kaart is.
5. **Iconen voor sectietitels** en "icoon-boven-tekst"-blokjes (3 features met elk een icoontje). Iconen (lucide) mogen **enkel** in de navigatie, in icoonknoppen en als functionele inline-indicator (ster, sorteerpijl, waarschuwing).
6. **Emoji's** in de UI.
7. **Gekleurde linker- of bovenrand-strepen** op blokken als decoratie.
8. **Decoratieve achtergronden:** geen stippenraster, noise, blobs of glassmorphism (`backdrop-filter` enkel achter een sheet).
9. **Inter, Roboto, Space Grotesk, Geist** of een ander font buiten §3.4.
10. **Tweekleurige wordmarks** en "hero"-blokken. De site heeft geen landingspagina, de tool ís de pagina.
11. **Pil-badges als labels** voor gewone info ("UPDATED: GW11", "AANRADER", "Bank: 0/4"). Gebruik een meta-regel in tekst. Badges enkel voor echte status, zie §5.12.
12. **Fade-in-on-scroll, bounce of hover-lift** (`transform: translateY(-2px)` bij hover).
13. **Hard gecodeerde hex-kleuren** in `.jsx` buiten `src/predicted-xi/**`. Altijd `var(--…)`.
14. **Font-sizes buiten de schaal** in §3.4.

---

## 5. Componenten

Nieuwe map **`src/ui/`** met kleine, herbruikbare componenten. Elk component heeft een eigen CSS-bestand (`src/ui/Button.css`), dat het component zelf importeert. Klasse-prefix `ui-` (bv. `ui-btn`, `ui-btn--primary`). **Geen inline styles** in nieuwe code, behalve voor echt dynamische waarden (breedte van een balkje, FDR-kleur per cel).

### 5.1 `AppShell` (`src/ui/AppShell.jsx`)

Vervangt de header, de twee `<nav>`-blokken en de footer in `FDRTool.jsx`. De state blijft in `FDRTool.jsx` en komt binnen via props.

**Desktop (≥900px):** één sticky topbalk van 56px, `--ink-0`, met 1px `--line` onderaan.
```
[FPL PRO LEAGUE]  FDR  Verwachte XI's  Team Planner  Spelers │ Bonuspunten  Set pieces  Kaarten  Klassement      Minileague 19WN75 ⧉   GW12 ⏱ 8d 05u   NL|FR
```
- **Wordmark:** "FPL PRO LEAGUE" in Archivo 800, `font-stretch: 68%`, 18px, `--text-1`, en klein "tools" in `--text-3` 12px. Eén kleur, geen app-icoon.
- **Nav-items:** Archivo 600, 13px, `--text-2`. Actief = `--text-1` + 2px aqua onderlijn (`--accent`), die precies op de 1px-lijn van de balk valt. De `│` is een 1px `--line-strong`-scheiding tussen de 4 hoofdtools en de 4 extra's.
- **Minileague:** tekstknop `--fs-meta`, code in `.num`, kopieer-icoon 14px. Onder 1200px verborgen, want hij staat ook in de footer.
- **Deadline:** `GW12` + teller in `.num`. Kleur `--text-1`; binnen 24u `--accent`; binnen 2u `--danger`. Na de deadline: "GW12 loopt".
- **Taal:** segmented control (§5.4) in klein formaat.

**Gsm (<900px):**
- **Topbalk** van 48px, sticky: links het wordmark (15px), rechts `GW12 · 8d 05u` (`.num`, kleur zoals hierboven). Verder niets.
- **Onderbalk** (fixed, `--bottomnav-h` + `env(safe-area-inset-bottom)`, `--ink-1`, 1px `--line-strong` bovenaan): **5 gelijke kolommen**

  | FDR | XI's | Planner | Spelers | Meer |
  |---|---|---|---|---|
  | `Grid2x2` | `Shirt` | `Users` | `UserSearch` | `Menu` |

  Icoon 20px (stroke 1.75) boven een label van 11px. Actief = `--text-1` + 2px aqua lijn **bovenaan** het item; inactief = `--text-3`.
- **"Meer"** opent een bottom sheet (§5.10) met rijen van 48px: Bonuspunten, Set pieces, Kaarten, Klassement — scheidingslijn — Taal (NL|FR) — Minileague `19WN75` [Kopieer] — @fpl_proleague op X.
- `main` krijgt `padding-bottom: calc(var(--bottomnav-h) + env(safe-area-inset-bottom) + 16px)`.
- **Resultaat:** de inhoud begint op ~64px in plaats van ~230px.

**"Nieuw"-markering:** zodra de Verwachte XI's van de komende GW gepubliceerd zijn (`PREDICTED_LINEUPS_GW === komende GW`), krijgt het nav-item (desktop en onderbalk) een aqua vierkantje (`--accent`) van 6×6px rechtsboven. Het verdwijnt na de deadline. Dit is functionele status, geen versiering.

**Footer:** één regel `--fs-meta`, `--text-3`: `@fpl_proleague · Fantasy Pro League 26/27 · Data: Fantasy Pro League + eigen analyse · Bijgewerkt 12 nov · Minileague 19WN75 ⧉`. 1px `--line` erboven, links uitgelijnd. Geen gecentreerde tekstblokken.

### 5.2 `PageHeader` (`src/ui/PageHeader.jsx`)

```
SPELERS                                              Data t.e.m. GW11 · 515 spelers
Filter, sorteer en vergelijk alle spelers. ⓘ Uitleg
───────────────────────────────────────────────────────────────────────────────── (1px --line-strong)
```
- H1 volgens `--fs-display`. De meta-regel rechts in `--fs-meta` `--text-3`, cijfers in `.num` (vervangt de pillen "UPDATED: GW11").
- **Maximaal één regel intro** (`--fs-ui`, `--text-2`, max `--max-read`). Langere uitleg zit achter "ⓘ Uitleg" (een disclosure die inline openklapt).
- Gsm: de meta gaat onder de titel staan.

### 5.3 `Button` (`src/ui/Button.jsx`)

| Variant | Stijl |
|---|---|
| `primary` | bg `--accent`, tekst `--accent-ink`, geen rand. **Max. één per scherm.** |
| `secondary` | transparant, 1px `--line-strong`, tekst `--text-1`; hover bg `--ink-2` |
| `ghost` | geen rand, tekst `--text-2`; hover `--text-1` |
| `danger` | transparant, 1px `rgba(255,90,71,.45)`, tekst `--danger` |
| `icon` | vierkant 32px (touch 44px), zoals secondary |

Hoogte 32px (touch 40px), padding `0 12px`, `--r-1`, Archivo 600 13px, zinsnotatie, icoon 16px links. Disabled = `--text-4`, geen opacity-truc op de hele knop. **Vervangt** `primaryButtonStyle`/`secondaryButtonStyle`/`dangerButtonStyle`/`retryButtonStyle`/`iconButtonStyle` in `theme.js`. Die exports blijven tijdens de migratie bestaan en worden in fase 4 verwijderd.

### 5.4 `Segmented` (`src/ui/Segmented.jsx`)

Vervangt **alle** pill- en chipgroepen met één keuze: positie (Alle/GK/DEF/MID/FWD), kolompreset, scope (Iedereen/Mijn team/★ Watchlist), Totaal/Per wedstrijd, NL/FR, Totaal/Per 90.
- Eén rij aaneengesloten segmenten, buitenrand 1px `--line-strong`, `--r-1` op de buitenhoeken, 1px scheidingen ertussen.
- Inactief: tekst `--text-2` op transparant. **Actief: omgekeerd** (`--invert-bg` / `--invert-text`, Archivo 600).
- Hoogte 32px (touch 40px). Op gsm horizontaal scrollbaar binnen de eigen rij met een rand-fade, nooit afbreken naar twee regels.
- `role="radiogroup"` + `aria-checked`, pijltjestoetsen werken.

### 5.5 Invoer: `SearchField`, `Select`, `FilterChip`

- **SearchField:** hoogte 36px (touch 44px), bg `--ink-1`, 1px `--line-strong`, `--r-1`, zoekicoon 16px `--text-3` links, placeholder `--text-3`, focus = rand `--accent`. Wis-knop (×) zodra er tekst staat. **Overal dezelfde** (Spelers, Bonuspunten, Kaarten, Klassement, spelerskiezer).
- **Select:** native `<select>` met dezelfde stijl als SearchField (native blijft beter op gsm), chevron via `background-image` met een inline SVG.
- **FilterChip** (enkel voor *actieve, verwijderbare* filters, bv. "Club: CLU ×", "≤ €7.0M ×"): hoogte 24px, bg `--ink-2`, `--r-1`, `--fs-meta`, × als icoonknop. Daarnaast een "Wis alles" ghost-knop.

### 5.6 `DataTable` (`src/ui/DataTable.jsx` + `DataTable.css`)

De ruggengraat van de site. Gebruikt door Spelers, Bonuspunten, Kaarten, Klassement, Set Pieces en de spelerskiezer.

- **Kop:** 32px, sticky (`top: var(--topbar-h)`), bg `--ink-1`, onderrand 1px `--line-strong`, tekst `--fs-label`. **Gesorteerde kolom:** kop in `--accent` + `↓`/`↑` in `.num`. Ongesorteerde sorteerbare kolom: `↕` in `--text-4`, enkel zichtbaar bij hover/focus. Een `title` met de volledige naam op elke afgekorte kop (bv. "Kansen gecr." → "Grote kansen gecreëerd").
- **Rijen:** 36px (pointer: fine) / 44px (pointer: coarse). Scheiding 1px `--line`. **Geen zebra-strepen, geen kaarten.** Hover: bg `--ink-2`. De volledige rij is klikbaar (opent de speler-sheet), met `cursor: pointer`.
- **Uitlijning:** tekst links; **cijfers rechts, altijd `.num`**. Ontbrekende waarde = `—` in `--text-4`.
- **Sticky eerste kolom** (identiteit: foto + naam): bg `--ink-0`, bij scrollen een 1px `--line-strong` rechts ervan. Op gsm max. 148px breed.
- **Rang-kolom** (indien aanwezig): `.num`, `--text-3`, 32px breed.
- **Beste waarde** (vergelijken, top-3 in een ranglijst): tekst `--accent`, Archivo 700. Nooit een gekleurde achtergrond.
- **Horizontaal scrollen:** `overflow-x: auto; overscroll-behavior-x: contain;` met een rand-fade rechts (`mask-image`) zolang er meer is. Behoud de bestaande `.fdr-table-scroll`-randtruc op gsm (tabel van rand tot rand).
- **Laden:** 8 skeleton-rijen (blokjes `--ink-1`, geen shimmer-animatie). **Leeg:** zie §5.11. **Fout:** zie §5.11.
- **Paginering:** "Meer laden (60)" als secondary-knop onder de tabel (behoud `PAGE_SIZE = 60`).
- **Semantiek:** echte `<table>`, `<th scope="col">`, `aria-sort`. Behoud dit uit `SpelersTab.jsx`.

### 5.7 `PlayerFace` (`src/ui/PlayerFace.jsx`, vervangt `PlayerPhoto` in `SpelersParts.jsx`)

- **Vierkant** (een knipoog naar het Panini-album; onderscheidend tegenover de standaard ronde avatars), `--r-1`, bg `--ink-2`, `object-fit: cover; object-position: top;`.
- Maten: `20 | 24 | 32 | 48 | 72` px. Tabelrij 24, kiezer 32, sheet 72.
- Fallback: initialen in `.num` 40% van de maat, `--text-3`. Bij een laadfout: fallback in plaats van een onzichtbare img.
- `loading="lazy" decoding="async"`, expliciete `width`/`height` (geen layout-verschuiving).
- **Data:** zie §5.14 `usePlayerIndex`. Werkt met een API-speler (`player.photo`) **of** met `(naam, clubcode)` uit de spelersdatabank (Google Sheet).

### 5.8 `PlayerCell` (`src/ui/PlayerCell.jsx`)

Eén manier om een speler te tonen in elke lijst:
```
[foto 24]  Vanaken            ★
           CLU · MID · €11.5
```
- Naam: Archivo 600 13px `--text-1`; op gsm de korte naam (`short`), op desktop de volledige.
- Subregel: `--fs-meta` `--text-3`: clubcode · positie · prijs (`.num`). Op desktop staan club en positie in eigen kolommen en verdwijnt de subregel.
- Optioneel: ster-knop (watchlist), "C"/"VC"-badge, "Gesch."-badge.

### 5.9 FDR-cellen: `FdrCell` en `MiniFixture`

- **`FdrCell`** (FDR-tabel): een **vol gekleurd vlak, radius 0**, 1px `--ink-0`-tussenruimte (via `border-spacing`/`gap`), zodat het geheel leest als één heatmap. Inhoud: tegenstander-code (Archivo 700 12px) + spatie + `H`/`A` (Archivo 500 11px, opacity .8). Hoekcijfer (rating) rechtsboven in `--fs-micro`, opacity .7.
  - **DGW:** de cel splitst verticaal in twee helften, elk met de eigen FDR-kleur.
  - **Geen wedstrijd (blank):** `--ink-1` met `—` in `--text-4`.
  - **Uitgesteld:** arcering (45°, `--line-strong` op `--ink-1`) + bestaande tooltip.
  - **Gefilterd/gehighlight** (bestaande `matchesRatingFilter`): niet-matchende cellen gaan naar opacity .25.
- **`MiniFixture`** (Spelers "Volgende 3", spelerskiezer, sheet, veld): blokje van 36×18px, radius 0, zelfde kleuren, tekst 10px-micro in caps (`BEV`), de H/A-letter klein erachter. Vervangt de stijl van `components/MiniFixtureBadge.jsx` (logica behouden).

### 5.10 `Sheet` en `Tooltip` (bestaande bestanden restylen)

- **`components/Sheet.jsx`:**
  - **Desktop:** een **lade rechts**, 480px breed, volle hoogte, bg `--ink-1`, 1px `--line-strong` links, `--shadow-overlay`. De tabel blijft zichtbaar, wat beter is voor een datatool dan een gecentreerde modal.
  - **Gsm:** een bottom sheet, max 88vh, radius 0, een greep van 32×3px `--line-strong` bovenaan, en `padding-bottom` voor de safe-area.
  - **Achtergrond:** `rgba(0,0,0,.6)`.
  - **Kop:** titel `--fs-title` + sluitknop (icoon).
  - **`SheetSection`-titels:** `--fs-label` `--text-3` (in plaats van `#8F79AD`).
  - Focus-trap, Escape en terugknop blijven zoals nu.
- **`components/Tooltip.jsx`:** **omgekeerd** (bg `--invert-bg`, tekst `--invert-text`), `--fs-meta`, `--r-1`, padding `6px 8px`, max 240px, geen pijltje, geen schaduw. De hover/tap-logica blijft.
- **Toast** (watchlist-undo in `FDRTool.jsx`): onderaan, **boven** de onderbalk op gsm, omgekeerd (licht op donker), `--r-1`, `--shadow-overlay`. Actie ("Ongedaan maken") als onderstreepte vette tekst in `--invert-text`.

### 5.11 Toestanden: leeg, laden, fout

- **Leeg:** geen icoon of illustratie. Eén zin `--text-2` + één actie (secondary-knop), links uitgelijnd, binnen de tabelruimte. Voorbeeld: "Nog geen spelers op je watchlist. Tik op ☆ naast een speler."
- **Laden:** skeletons in de vorm van de echte inhoud. Spinner enkel ín een knop die bezig is.
- **Fout:** 1px rand `rgba(255,90,71,.5)` rondom, bg `rgba(255,90,71,.06)`, tekst `--text-1`, "Opnieuw proberen" als secondary-knop. Geen gekleurde linkerstreep.

### 5.12 `Badge` (zeldzaam)

Enkel voor echte status: `DGW`, `C`, `VC`, `3×C`, `Gesch.`, `Nieuw`, `Twijfel`. Hoogte 16px, padding `0 4px`, `--r-1`, Martian Mono 600 10px in caps. Kleuren: neutraal `--ink-3`/`--text-1`; `C` = `--accent`/`--accent-ink`; gevaar = `--danger`/`#FFF`.

### 5.13 `Pitch` (Team Planner + publieke Verwachte XI's)

- **Plat veld** `--pitch` met lijnen `--pitch-line` (1px), geen gradient, geen strepen, geen schaduw. Radius 0.
- **Spelerslot:** shirt (bestaande `club-shirts/*.webp`, 40px desktop / 34px gsm), daaronder het naamlabel (bg `rgba(12,13,12,.88)`, tekst `--text-1` 11px Archivo 600, max 1 regel met ellipsis) en daaronder één `MiniFixture` (Team Planner) of de prijs (`--fs-micro`, Verwachte XI's).
- **Shirts op het veld** (de FPL-conventie, beter leesbaar); **gezichten in lijsten en sheets**. Tik op een slot = de speler-sheet (XI's) of het slot-menu (Planner).

### 5.14 Data-hook voor gezichten: `src/data/usePlayerIndex.js` (nieuw)

Doel: spelersfoto's (en API-stats) beschikbaar maken op **elke** tab, ook waar spelers enkel als `(naam, clubcode)` uit de Google Sheet bekend zijn (Team Planner, Bonuspunten, Kaarten, Set Pieces, Verwachte XI's).

- Verplaats de fetch uit `useSpelersData()` in `SpelersTab.jsx` naar een gedeelde module `src/data/playersApi.js` met **één gedeelde promise** (module-niveau cache) + de bestaande localStorage-cache (`fpl_proleague_spelers_cache_v1`, ongewijzigd). `/api/players` is ~47 kB gzip en staat 1u op Vercels CDN: één fetch per sessie volstaat.
- `usePlayerIndex()` geeft `{ ready, byId, find(name, clubCode) }`. `find` normaliseert zoals `utils/playerFuzzyMatch.js` (accenten weg, hoofdletters) en zoekt binnen dezelfde club: eerst een exacte volledige naam, dan `short`, dan de achternaam, en pas als laatste Levenshtein ≥ 0.85 via de bestaande `playerFuzzyMatch`-helpers. **Hergebruik** `buildSheetNameResolver` waar mogelijk (dat is de omgekeerde richting van hetzelfde probleem).
- Geen nieuwe API-endpoint nodig. `api/**` blijft ongewijzigd.
- **Gezichten niet meenemen in html2canvas-exports** (S3-afbeeldingen kunnen het canvas "tainten"). Exports blijven zoals ze zijn.

---

## 6. Navigatie en informatie-architectuur

### 6.1 Nieuwe tabset (volgorde = populariteit)

| # | Sleutel | NL-label | FR-label | Pad | Plaats |
|---|---|---|---|---|---|
| 1 | `fdr` | FDR | FDR | `/fdr` (en `/`) | hoofd |
| 2 | `predictedlineups` | Verwachte XI's | Compositions probables | `/predicted-lineups` | hoofd |
| 3 | `teamplanner` | Team Planner | Team Planner | `/team-planner` | hoofd |
| 4 | `spelers` | Spelers | Joueurs | `/spelers` | hoofd |
| 5 | `bonuspunten` | Bonuspunten | Points bonus | `/bonuspunten` | extra |
| 6 | `setpieces` | Set pieces | Coups de pied arrêtés | `/set-pieces` | extra |
| 7 | `kaarten` | Kaarten | Cartons | `/kaarten` | extra |
| 8 | `klassement` | Klassement | Classement | `/klassement` | extra |

Implementatie: herorden `ROUTES` in `src/routes.js` en voeg een veld `group: 'primary' | 'secondary'` toe. Vervang `MOBILE_PRIMARY_TAB_COUNT`/`MOBILE_PRIMARY_TABS`/`MOBILE_OVERFLOW_TABS` in `FDRTool.jsx` door filters op `group`. Compacte labels voor de onderbalk: `nav.compact.fdr` "FDR", `nav.compact.predictedlineups` "XI's" / "XI", `nav.compact.teamplanner` "Planner", `nav.compact.spelers` "Spelers" / "Joueurs", `nav.compact.more` "Meer" / "Plus".

### 6.2 `/` blijft FDR

`/` toont nu al de FDR, en dat is 27% van alle views. **We maken geen aparte homepage:** dat zou een extra klik kosten voor de grootste groep bezoekers. De topbalk (deadline) en de "nieuw"-markering op XI's geven het matchday-overzicht dat een homepage zou geven.

### 6.3 Verwijderd + redirects

| Weg | Redirect naar | Waarom |
|---|---|---|
| `/price-changes`, `/fr/price-changes` | `/spelers`, `/fr/spelers` (prijzen staan daar) | Het spel kent geen prijswijzigingen |
| `/watchlist`, `/fr/watchlist` | `/spelers?scope=watchlist`, `/fr/spelers?scope=watchlist` | Opgenomen in Spelers (§8) |

- `vercel.json`: verwijder de twee `rewrites` en voeg toe:
  ```json
  "redirects": [
    { "source": "/price-changes", "destination": "/spelers", "permanent": true },
    { "source": "/fr/price-changes", "destination": "/fr/spelers", "permanent": true },
    { "source": "/watchlist", "destination": "/spelers?scope=watchlist", "permanent": true },
    { "source": "/fr/watchlist", "destination": "/fr/spelers?scope=watchlist", "permanent": true }
  ]
  ```
  Let op: de regel `/fr/:tool` staat in `rewrites`, en `redirects` worden eerst geëvalueerd. Test beide talen op de preview.
- **Client-side vangnet** in `routeKeyFromPath`: `'/watchlist'` → `spelers` (+ `scope=watchlist` in de URL zetten via `replaceState`) en `'/price-changes'` → `spelers`. Dit vangt oude links in de PWA/cache op.
- **Verwijder:** de entries in `ROUTES`, `tabs/PlayerStatusTab.jsx`, het `activeTab === 'pricechanges'`-blok in `FDRTool.jsx`, de i18n-sleutels `nav.pricechanges`, `route.pricechanges.*`, `priceChanges.*`, `nav.watchlist`, `route.watchlist.*`, en de watchlist-tab-specifieke sleutels die nergens meer gebruikt worden. `build-routes.mjs` en `sitemap.xml` volgen automatisch uit `ROUTES`.
- `index.html`: haal "Watchlist" uit de description/keywords en zet `theme-color` op `#09282A` (logokleur). `public/manifest.json`: `theme_color` op `#09282A` en `background_color` op `#061B1C`, `name` op "FPL Pro League Tools", `short_name` op "FPL Tools".

---

## 7. Per tool

### 7.1 FDR (`tabs/FDRTab.jsx`), de grootste tool (~41%)

**Opbouw (desktop):**
```
FDR                                                     Ratings: @fpl_proleague · GW12 → GW19
Hoe moeilijk zijn de komende wedstrijden? Pas de ratings aan naar jouw inschatting. ⓘ
──────────────────────────────────────────────────────────────────────────────────────
GW [12▾] → [19▾]   ■■■■■ makkelijk → moeilijk     [Ratings aanpassen] [Deel link] [Afbeelding] [Reset]
┌──────────┬─────┬──────┬──────┬──────┬ …
│ TEAM     │ Σ ↑ │ GW12 │ GW13 │ GW14 │
│ ⚽ CLU ▪▪▪▪▪│ 2.4 │ KVM A│ STA A│ WES H│
```

- **Statusregel** rechts in de PageHeader-meta: "Ratings: @fpl_proleague" of **"Ratings: eigen (aangepast)"** in `--accent`. Vervangt de pil "RATING VAN @FPL_PROLEAGUE".
- **Toolbar:** GW-bereik (twee Selects), een inline legende (5 vierkantjes van 10px), knoppen secondary. "Reset" is enkel zichtbaar als er aangepaste ratings zijn. Het info-icoon opent de bestaande uitleg (`infoModal`) in een Sheet. Op gsm: het GW-bereik op rij 1, de knoppen als icoonknoppen op rij 2, en de legende onder de tabel.
- **Nieuwe kolom Σ** (gemiddelde FDR over het gekozen bereik, `.num`, 1 decimaal): staat direct na de teamkolom, **sticky samen met de teamkolom** en sorteerbaar. Dit **vervangt** de knop "Sorteer op makkelijkste run" (dezelfde sorteerlogica, nu via de kop). Klikken op een GW-kop sorteert op die GW (bestaande `buildGwHeaderCells`/`sortedGw`).
- **Teamkolom** (sticky, desktop 112px / gsm 76px): logo 16px + clubcode (Archivo 700 13px) + vorm als **5 vierkantjes van 6×6px** (W `--positive`, G `--text-3`, V `--danger`), in plaats van de huidige stipjes. Tik = club-sheet (bestaand).
- **Cellen:** `FdrCell` (§5.9). Kolombreedte: behoud `--fdr-table-slot` (84/64px), maar op desktop mag de tabel tot `--max-data` breed worden (cellen `min-width` = slot, `width: auto`), zodat de lege ruimte rechts verdwijnt.
- **Kop:** sticky onder de topbalk.
- **"Team-sterkte instellen"** wordt de knop **"Ratings aanpassen"**. Die opent een Sheet (rechterlade/bottom sheet) met 18 rijen: logo + club + `Segmented` 1–5 + schakelaar "Thuisvoordeel". Wijzigingen zijn live zichtbaar in de tabel (die op desktop naast de lade zichtbaar blijft). Dezelfde state/handlers als nu.
- **Afbeelding downloaden:** html2canvas-logica ongemoeid laten. Controleer dat de export de nieuwe fonts gebruikt (wacht op `document.fonts.ready` vóór het renderen) en een `--ink-0`-achtergrond heeft.
- **De Thuisvoordeel-intro-toast** volgt de toaststijl (§5.10).

### 7.2 Verwachte XI's (`tabs/PredictedLineupsTab.jsx`), 22%, piek vrijdag 16:00 → deadline

**Eén duidelijke toestand in plaats van drie boodschappen.** Bepaal `status`:

| Situatie | Wat je ziet |
|---|---|
| `PREDICTED_LINEUPS_GW === komende GW` | **Gepubliceerd.** Gewoon de opstellingen. Meta: "GW12 · door @5YSiebee · bijgewerkt vr 21 nov 16:00". |
| Anders (tussen deadline en volgende vrijdag) | **Statusregel bovenaan:** "**Verwachte XI's voor GW12 verschijnen vrijdag 21 nov om 16:00** (over 6d 03u)", met de teller in `.num`. Daaronder meteen de opstellingen van de vorige GW, met in de meta "**Vorige speeldag: GW11**" en de veldlabels op opacity .7. Geen gele waarschuwingsbanner, geen lege toestand, geen extra knop. |

- **Nieuwe helper** `getPredictedLineupsRelease(gw)` in `src/constants.js` (een nieuwe functie, de bestaande blijven ongewijzigd): de vrijdag vóór `getGwDeadlineDate(gw)` om 16:00 Europe/Brussels. Als de deadline zelf vóór vrijdag 16:00 valt, dan deadline − 3u. Overschrijfbaar via een nieuwe constante `PREDICTED_LINEUPS_RELEASE_OVERRIDES = { 14: '2026-12-04T12:00:00+01:00' }`.
- **Kiezen per wedstrijd, niet per club.** Bouw de wedstrijden van de getoonde GW uit `FIXTURES`, gesorteerd op aftrap (of op de volgorde in `FIXTURES` als er geen tijd is): `CLU – AND`, `GNK – GNT`, …
  - **Desktop:** een rij van 9 wedstrijdknoppen (twee logo's van 20px + codes, 1px-scheidingen, actief = omgekeerd). Een gekozen wedstrijd toont **beide opstellingen naast elkaar**: twee velden van elk max 520px, met daarboven per kant logo, club, formatie en `vs`.
  - **Gsm:** een horizontaal scrollbare wedstrijdstrip + `Segmented` [CLU | AND] om tussen de twee ploegen te wisselen. Horizontaal vegen op het veld = de andere ploeg. Pijlen ‹ › onder het veld = vorige/volgende wedstrijd.
  - Deeplink: `?match=CLU-AND&team=CLU` (toe te voegen aan `TAB_QUERY_PARAMS.predictedlineups`).
- **Nieuwe weergave "Overzicht"** (`Segmented`: **Veld | Overzicht**, standaard Veld). Een tabel met 18 rijen, ideaal om vlak voor de deadline alles in 20 seconden te overlopen:
  ```
  CLU  vs AND (A)  4-3-3   Sommer · Seys · Ordoñez · Mechele · De Cuyper · Vanaken · … (11 namen, met statusstip vóór elke naam)
  ```
  - Op gsm wordt elke rij 2 regels (club + opponent + formatie, dan de namen die mogen omlopen).
  - **Filter "Enkel twijfels"** (een schakelaar): toont alleen spelers met `orange`/`red`, gegroepeerd per club. Dat is de vraag die managers het meest stellen: wie staat er níet zeker in?
  - Tik op een naam = speler-sheet (bestaande `onOpenPlayer`).
- **Veld:** `PitchField` met een nieuwe prop `variant="site"`. Die zet de vlakke `--pitch`-stijl en het naamlabel uit §5.13. **De standaard (`variant` ontbreekt) blijft exact zoals nu**, voor de privé-builder en de PNG-export (§0.4). Concreet: de variant-specifieke stijlwaarden lezen uit een object `SITE_PITCH_THEME` in `PredictedLineupsTab.jsx` dat als prop doorgegeven wordt. `src/predicted-xi/theme.js` blijft ongewijzigd.
- **Legende** (§3.3) één keer, in een rij boven het veld/de tabel.
- **Credits:** "@5YSiebee · @fpl_proleague" in de meta-regel, niet als losse gecentreerde links onder het veld.

### 7.3 Team Planner (`tabs/TeamPlannerTab.jsx`), 11%

**Principe: het veld eerst, de lijst tweede.** Alle bestaande state en handlers blijven (`FDRTool.jsx` 1347+); enkel de opbouw verandert.

**Desktop (≥1100px): twee kolommen**
```
┌ links 60% ───────────────────────┐ ┌ rechts 40% ─────────────────────┐
│ ‹ GW12 ›   Formatie 4-4-2        │ │ Selectie 15/15  Bank €0.5M      │
│ [Bankzitters][3×C][Recharge]     │ │ Vrije transfers 1  (sticky)     │
│                                  │ │ ───────────────────────────────│
│        ( V E L D )               │ │ GK  [foto] Sommer   CLU €8.0  ⋯│
│                                  │ │ GK  [foto] …                    │
│  Bank: [ ] [ ] [ ] [ ]           │ │ DEF …                           │
│ [Optimaliseer] [Herschik bank]   │ │ ───────────────────────────────│
│                                  │ │ Transfers GW12–GW19 (inklapbaar)│
└──────────────────────────────────┘ └─────────────────────────────────┘
```
**Gsm:** sticky statusregel (`Selectie 15/15 · Bank €0.5M · VT 1`, in `.num`) + `Segmented` **Veld | Lijst | Transfers**. Standaard: Veld.

- **Lege toestand** (0 spelers): het veld met 15 lege slots (een 1px gestippeld `--line-strong`-kader + positielabel `GK`/`DEF`/…). Erboven een rij van één zin: "Begin met een screenshot van je team, of tik op een leeg vak." + **primary** "Upload screenshot" (`TeamScreenshotUpload`, bestaande logica). Het blok "TEAM HERKENNEN VIA SCREENSHOT · AANRADER" verdwijnt als losse kaart.
- **Spelerskiezer** (nieuw: `src/ui/PlayerPicker.jsx`): tik op een leeg slot (of "Vervang" bij een gevuld slot) en er opent een Sheet met:
  - SearchField (autofocus op desktop) + Segmented positie (vastgezet op de positie van het slot) + Select "Max. prijs" (standaard: wat het budget toelaat) + sorteren (Punten / Vorm / Ownership / Prijs).
  - Een DataTable met de rijen `PlayerFace 32` + naam + club + prijs + punten + vorm + `MiniFixture`×3.
  - Spelers die al in de selectie zitten of de clublimiet zouden breken: rij op opacity .4 met de reden als subregel ("al in je team", "max. 3 per club").
  - **De bron blijft de spelersdatabank (Google Sheet)**: de kiezer levert exact hetzelfde object op als `PlayerSearchInput` vandaag (`onSelect`). Punten, vorm en foto komen erbij uit `usePlayerIndex` als die geladen is; zo niet, dan blijven die kolommen `—`. `components/PlayerSearchInput.jsx` blijft bestaan voor `TransferPanel`, maar krijgt de SearchField-stijl.
- **Selectielijst** (rechts/tab "Lijst"): een DataTable gegroepeerd per positie (een groepskop van `--fs-label` met de telling `DEF 5/5`). Rij: foto 24, naam, club, prijs, eerstvolgende `MiniFixture`, een `⋯`-menu (Vervang / Kapitein / Vice / Naar bank / Verwijder). **Geen 15 losse invoervelden meer.**
- **Veld:** `PlayerPitchCard` volgens §5.13, met `MiniFixture` voor de geselecteerde GW. Kapitein = `Badge C` (aqua) rechtsboven op het shirt. Bankspelers op een aparte rij onder het veld, 1px `--line-strong` erboven, label "Bank".
- **Boosters:** drie secondary-knoppen in een rij (`Bankzitters`, `3× Kapitein`, `Recharge`). Actief in deze GW = omgekeerd. Al gebruikt in een andere GW = `--text-4` + "gebruikt in GW9". Vervangt `BoosterButton`-kaartjes (logica behouden).
- **Statusbadges** (`countBadgeStyle`, `transferBudgetBadgeStyle`, `formationBadgeStyle`) worden tekst in de statusregel: een geldige formatie in `--text-1`, een ongeldige in `--danger` met de reden ("Kies nog 1 bankspeler").
- **Transfers:** een DataTable per GW (`Uit → In`, prijsverschil `.num` +/−, kosten). "Transfer plannen voor GW12" wordt een **secondary**-knop boven het veld (de primary is de screenshot-upload in de lege toestand; daarna is er geen primary nodig).

### 7.4 Spelers (`tabs/SpelersTab.jsx` + `src/spelers.js`), nieuw en wordt populair

**Gevraagde wijzigingen (exact):**

1. **"% Kap" verwijderen.**
   - `src/spelers.js`: verwijder `cap` uit `COLUMNS`, uit `PRESETS.ownership` en uit `COMPARE_ROWS`.
   - `src/i18n.js`: verwijder `spelers.col.cap` / `spelers.col.capShort` (nl + fr).
   - URL-parser (`stateFromSearch` / sorteer-validatie): `sort=cap` uit een oude gedeelde link valt terug op de standaardsortering (controleer dat onbekende sorteersleutels al zo behandeld worden; zo niet, voeg die terugval toe).
   - `api/players.js` mag `cap` blijven meesturen (onschadelijk), dus geen API-wijziging.
2. **"Eigendom" → "Ownership".**
   - `spelers.presets.ownership`: nl **"Ownership"**, fr blijft "Popularité".
   - `spelers.col.sel`: nl "Ownership (% van alle managers)", short **"Own%"**; fr "Popularité (% des managers)", short "Pop%".
   - `spelers.popup.selected`: nl "{{pct}}% ownership", fr "{{pct}}% de popularité".
   - `route.spelers.description`: "… bonuspunten en ownership."
   - Inhoud van de preset na het schrappen van `cap`: `['price', 'sel', 'pts', 'ppm', 'form']`, met als standaardsortering bij het kiezen van deze preset `sel desc`. Plus een **snelfilter "Differentials (<10%)"** als schakelaar in de filterlade (filtert `sel < 10`, nieuwe URL-param `diff=1`, toe te voegen aan `SPELERS_QUERY_PARAMS` en `TAB_QUERY_PARAMS.spelers`).
3. **"Kansen" → duidelijk "gecreëerd".**
   - `spelers.col.bcShort`: nl **"Kansen gecr."**, fr "Occ. créées".
   - `spelers.col.bpBigChancesShort`: nl "B-Kansen gecr.", fr "B-Occ. créées".
   - De volledige naam ("Grote kansen gecreëerd") verschijnt als `title`-tooltip op de kolomkop (DataTable doet dit standaard).
4. **"TG" (tegengoals) verwijderen.**
   - `src/spelers.js`: verwijder `gc` uit `COLUMNS` en uit `PRESETS.defence` (die wordt `['price', 'pts', 'cs', 'hc', 'dw', 'dl', 'br']`).
   - `src/i18n.js`: verwijder `spelers.col.gc` / `spelers.col.gcShort` (nl + fr).
   - Ook `sort=gc` valt terug op de standaardsortering.

**Layout:**
- PageHeader (titel, meta "Data t.e.m. GW11 · 515 spelers").
- **Toolbar rij 1:** SearchField (desktop 320px, gsm volle breedte). **Rij 2:** `Segmented` positie + `Segmented` preset (Overzicht · Aanval · Verdediging · Bonus · Ownership). Op desktop staan ze naast elkaar, met rechts de knoppen **[Filters (2)]** en **[Vergelijken]**.
- **Filterlade** (Sheet): club, prijsbereik (de bestaande `PriceRange`), min. minuten, periode (seizoen / laatste 3-5-8), weergave (Totaal / Per 90), **Toon** (Iedereen / Mijn team / ★ Watchlist), Differentials. Actieve filters verschijnen als `FilterChip`s onder de toolbar.
- **Tabel** (DataTable): kolom 1 = **☆/★** (watchlist-ster, 32px, altijd zichtbaar), kolom 2 = `PlayerCell` (sticky), daarna club · pos · de presetkolommen · Vorm (8) sparkline · Volgende 3.
- **Vergelijken:** het compare-vinkje verschijnt **enkel in vergelijkmodus** (knop "Vergelijken" in de toolbar zet de modus aan). Zo heeft een rij standaard maar één bedieningselement (de ster). Met ≥2 gekozen spelers verschijnt een **sticky balk** onderaan (boven de onderbalk op gsm): "3 spelers · [Vergelijk] [Wis]". Die opent `ComparePanel` in een Sheet. De beste waarde per rij in `--accent`-tekst. Behoud de URL-param `compare`.
- **Sparkline** (`SpelersParts.jsx`): staafjes radius 0. Kleuren: ≥8 pt `--text-1`, 4–7 `--text-2`, 0–3 `--text-3`, negatief `--danger`, niet gespeeld = een streepje van 2px `--text-4`. **Geen accentkleur.** Vorm is neutraal; enkel uitschieters springen eruit.

### 7.5 Bonuspunten (`tabs/BonuspuntenTab.jsx`), 4%

- **Weg met de kaartrijen.** Eén DataTable.
- **Toolbar:** SearchField + `Segmented` **Duels · Kopballen · Recoveries · Kansen gecr. · Totaal** (vervangt de vier inklapbare `RankingSection`s; standaard "Totaal") + `Segmented` Totaal/Per wedstrijd (vervangt `SortModeToggle`) + `Segmented` scope (Iedereen / Mijn team / ★ Watchlist; vervangt `ScopeFilter`).
- **Kolommen:** `#` · ☆ · `PlayerCell` · club · *(stat-specifiek: bv. "Gewonnen" · "Verloren")* · **Bonus** (`.num` 700, top-3 in `--accent`) · Per wedstrijd.
- De meta-regel "Bijgewerkt na GW11" vervangt de pil "UPDATED: GW11".
- `bonuspunten.js` (berekening) blijft ongewijzigd.

### 7.6 Kaarten (`tabs/KaartenTab.jsx`), 2%

- Zelfde DataTable-patroon: `#` · ☆ · `PlayerCell` · club · Geel · Rood · **Tot schorsing** (de bestaande logica in `kaarten.js`).
- Spelers die bij de volgende gele kaart geschorst zijn: een `Badge` "1 tot schorsing" in `--danger`. Geschorste spelers: `Badge` "Gesch.". Geen rode rijachtergrond.
- `Segmented` sorteren (de bestaande `SORT_MODES`) + scope.

### 7.7 Set pieces (`tabs/SetPiecesTab.jsx`), 3%

- **Eén matrix in plaats van 18 clubkaarten:** rijen = clubs (logo + code, sticky), kolommen = **Penalty's · Corners · Vrije trappen**. Een cel = `PlayerFace 20` + naam (klikbaar → sheet), met de tweede keuze eronder in `--text-3`.
- `CategoryBadge`/`CATEGORY_LEGEND` (zeker/gedeeld/onzeker): dezelfde 4-stippen-logica als §3.3, met een legende boven de tabel.
- Gsm: de matrix scrollt horizontaal, met de club-kolom sticky. Alternatief via `Segmented` [Penalty's | Corners | VT] voor één kolom tegelijk. **Standaard op gsm: de één-kolom-weergave.**

### 7.8 Klassement (`tabs/KlassementTab.jsx`)

- **Minileague-functie verwijderen:** de volledige `<section aria-labelledby="klassement-league-title">` met de bijbehorende state (`leagueInput`, `lgw`, `leagueState`, `runLeague`), `parseLeagueId`, `LEAGUE_STORAGE_KEY` (eenmalig opruimen: `localStorage.removeItem('fpl_proleague_klassement_league_v1')` in een try/catch) en de URL-params `league`/`lgw` (uit `readParams`/`writeParams` en uit `TAB_QUERY_PARAMS.klassement`).
- **i18n:** verwijder `klassement.league*`, `klassement.total`, `klassement.show`, `klassement.teamsCount`. Pas `klassement.intro`, `route.klassement.title` ("Klassement: zoek je team") en `route.klassement.description` aan, zodat "minileague" er niet meer in staat (nl + fr).
- `api/rankings.js` blijft ongewijzigd (het `league`-type wordt gewoon niet meer aangeroepen).
- **Wat overblijft:** PageHeader + SearchField "Teamnaam" + Select (Algemeen / Speeldag N) + DataTable (`#` · Team · Punten). Onder de tabel één regel promo: "Speel mee in de minileague van @fpl_proleague: **19WN75** ⧉".

### 7.9 Spelersdetail: `PlayerSheet` en `SpelerPopup` samenvoegen

- **Doel:** één spelersdetail, overal hetzelfde.
- **Basis:** `components/PlayerSheet.jsx`, in de Sheet-shell (§5.10).
- **Kop:** `PlayerFace 72` + naam (`--fs-title`) + `CLU · MID · €11.5` + ster-knop + deel-knop.
- **Statstrip:** 4–6 cijfers in `.num` met `--fs-label`-labels erboven (Punten · Vorm · Own% · Min · Goals · Assists), gescheiden door 1px-lijnen, geen doosjes.
- **Komende 5:** `MiniFixture`×5.
- **Per speeldag:** een compacte tabel (de inhoud van `SpelerPopup`: GW · tegenstander · min · pt · bonus) uit `api/player/[id]`.
- **Acties:** "In Team Planner" (bestaand `onGoToTeamPlanner`), ☆ Watchlist.
- **Data:** heeft de speler een API-id (via `usePlayerIndex.find`), toon dan het volledige profiel; anders de huidige sheet-inhoud.
- **URL's:** behoud beide schema's. `/speler/<slug>` blijft de canonieke deelbare URL. `?speler=<id>` in Spelers opent dezelfde sheet.
- `SpelerPopup.jsx` wordt pas verwijderd als alles wat hij toont in de nieuwe sheet zit (fase 3g).

### 7.10 Club-sheet (`components/ClubSheet.jsx`)

Dezelfde shell: logo 48 + naam, een vormregel (W/G/V-vierkantjes), de komende 8 `FdrCell`s in één rij, set-piece-nemers, en de "Verwachte XI" van de laatst beschikbare GW als genummerde lijst met statusstippen.

---

## 8. Watchlist-migratie (niemand verliest iets)

1. **De data blijft:** dezelfde sleutel `fpl_proleague_watchlist_v1`, hetzelfde formaat, dezelfde handlers in `FDRTool.jsx` (`handleAddWatchlistPlayer`, `handleRemoveWatchlistPlayer`, `isPlayerWatched`, undo-toast). Niets aan de opslag veranderen.
2. **De ster wordt het toevoegpunt:** in Spelers, Bonuspunten, Kaarten, de spelerskiezer en de speler-sheet. ☆ = toevoegen, ★ (`--accent`) = op de watchlist; nog eens tikken = verwijderen (met de bestaande undo-toast).
3. **"★ Watchlist" in de scope-filter** van Spelers, Bonuspunten en Kaarten (bestaat al als `scope=watchlist`; enkel het label krijgt een ster).
4. **Handmatig toegevoegde spelers** (de oude watchlist liet spelers toevoegen met een vrije naam/club/prijs, die soms niet in de API staan): toon ze in Spelers met `scope=watchlist` in een aparte groep **onder** de tabel: "Niet gevonden in de spelersdatabase (2)", met naam · club · prijs en een verwijderknop. Zo verdwijnt er nooit stil iemand.
5. **De komende fixtures** die de watchlist toonde, zitten in Spelers in de kolom "Volgende 3" en in de sheet ("Komende 5").
6. **Eenmalige melding:** heeft een bezoeker ≥1 watchlist-speler en heeft hij de melding nog niet gezien (nieuwe sleutel `fpl_proleague_watchlist_moved_seen_v1`), toon dan bij het eerste bezoek een toast: "Je watchlist zit nu in **Spelers** → filter ★ Watchlist. [Bekijk]". Komt iemand binnen via de `/watchlist`-redirect, dan staat de filter al aan.
7. **Daarna verwijderen:** `tabs/WatchlistTab.jsx`, de props `newPlayerName`/`newPlayerTeam`/`newPlayerPrice` + bijbehorende state in `FDRTool.jsx`, maar **pas nadat** punt 4 werkt. De handler voor handmatig toevoegen mag blijven bestaan voor bestaande data.

---

## 9. Gsm-checklist (390×844 en 360×740)

- [ ] De inhoud begint binnen 64px (topbalk 48px + marge).
- [ ] De onderbalk heeft 5 items, met de safe-area onderaan gerespecteerd, en wordt nooit door de inhoud overlapt (`padding-bottom` op `main`).
- [ ] Geen horizontale paginascroll. Enkel tabellen en strips scrollen horizontaal, binnen hun eigen zone.
- [ ] FDR: teamkolom + Σ sticky, en minstens 4 GW-kolommen zichtbaar op 390px.
- [ ] Alle tikzones ≥44×44px (de bestaande `pointer: coarse`-regels).
- [ ] Sheets openen als bottom sheet, sluiten met vegen naar beneden, met Escape en met de terugknop.
- [ ] Segmented controls breken niet af naar 2 regels; ze scrollen.
- [ ] Inputs ≥16px font op iOS (voorkomt inzoomen): SearchField gebruikt 16px op `pointer: coarse`.
- [ ] Verwachte XI's: wisselen tussen de twee ploegen van een wedstrijd met één tik of veeg.
- [ ] Team Planner: Veld | Lijst | Transfers-tabs, met de statusregel sticky.

---

## 10. Toegankelijkheid en performance

- **Contrast:** alle tekst ≥4.5:1 (`--text-3` is de ondergrens voor leesbare tekst). `--text-4` nooit voor informatie.
- **Kleur nooit als enige drager:** FDR heeft het hoekcijfer, startzekerheid heeft een legende + tekstlabel in de tooltip/sheet, vorm heeft een `aria-label` ("W W G V W").
- **Behoud:** de skip-link, `<main id="fdr-main">`, `aria-current` in de nav, `aria-sort`, de focus-trap in Sheet en `prefers-reduced-motion`.
- **Fonts:** `display=swap` + `preconnect` (bestaat). Exporteer pas na `document.fonts.ready`.
- **Bundles:** `src/ui/*` is klein. Houd de lazy loading per tab zoals ze is; `usePlayerIndex` laadt `/api/players` **niet** op de FDR-tab (die heeft geen spelers nodig).
- **Geen nieuwe dependencies,** behalve als het echt niet anders kan; vraag het dan eerst aan de eigenaar. (Er is geen Tailwind of UI-library nodig.)

---

## 11. Gefaseerd implementatieplan

Elke fase: nieuwe branch `redesign/fase-N-…` → PR naar `main` → preview-link → screenshots op 390 en 1440 in de PR-beschrijving → goedkeuring door de eigenaar → merge (niet op vrijdag 12:00–deadline).

### Fase 0: voorbereiding (geen zichtbare wijziging)
- Neem met Playwright baseline-screenshots van alle routes op 390×844 en 1440×900 en zet ze in `docs/redesign/before/` (voeg `docs/redesign/` toe aan `.gitignore` als de eigenaar ze niet in git wil).
- Lees `CLAUDE.md`, `README.MD` en dit document. Bevestig in de PR-beschrijving welke bestanden in elke fase geraakt worden.
- **Acceptatie:** `npm run build` slaagt, niets verandert.

### Fase 1: tokens, fonts, globale CSS
**Aanmaken:**
- `src/styles/tokens.css` (§3), `src/styles/base.css` (reset, `body`, `.num`, focus, `prefers-reduced-motion`, de skip-link).

**Aanpassen:**
- `src/main.jsx`: importeer `./styles/tokens.css` en `./styles/base.css`.
- `index.html`: de nieuwe Google Fonts-link (Archivo met breedte-as + Martian Mono; **geen Inter**), `theme-color` `#09282A`, en de watchlist uit de meta-teksten halen.
- `public/manifest.json`: kleuren + naam (§6.3).
- `src/theme.js`: laat `COLORS` naar de nieuwe tokens wijzen (`bg: 'var(--ink-0)'`, `surface: 'var(--ink-1)'`, `accent: 'var(--accent)'`, `accentInk: 'var(--accent-ink)'`, `text: 'var(--text-1)'`, `textBody: 'var(--text-2)'`, `textMuted`/`textSubtle: 'var(--text-3)'`, `textDisabled: 'var(--text-4)'`, `danger: 'var(--danger)'`, `warning: 'var(--warning)'`, `border: 'var(--line-strong)'`, `borderSubtle: 'var(--line)'`, `cardBg: 'transparent'`). Bestaande inline styles die `COLORS` gebruiken veranderen dan meteen mee. Zet `RADIUS` op `{ sm: '2px', md: '2px', lg: '2px', xl: '2px', pill: '2px' }`. **Controleer eerst** met grep dat `COLORS.*` nergens in een string wordt samengevoegd met hex-alfa (bv. `` `${COLORS.accent}33` ``); dat zou breken met `var()`. (Bij de audit gevonden: geen gevallen, maar opnieuw controleren.)
- `src/constants.js`: **niet** aanpassen. De FDR-kleuren blijven (§3.2).
- `FDRTool.jsx`: in het `<style>`-blok `html, body` en de wrapper-achtergrond naar `var(--ink-0)`, `body { font-family: var(--font-ui) }`, `.fdr-title` naar Archivo condensed; het stippenraster (radial-gradient-masker) verwijderen.

**Acceptatie:** de site werkt identiek, maar in petrol/aqua met de nieuwe fonts. Inter wordt niet meer geladen (Network-tab). FDR-kleuren onveranderd (§3.2). Lighthouse-toegankelijkheid niet lager dan vóór de wijziging.

### Fase 2: basiscomponenten, navigatie, routes
**Aanmaken in `src/ui/`** (elk met eigen `.css`): `AppShell.jsx`, `PageHeader.jsx`, `Button.jsx`, `Segmented.jsx`, `SearchField.jsx`, `Select.jsx`, `FilterChip.jsx`, `DataTable.jsx`, `PlayerFace.jsx`, `PlayerCell.jsx`, `FdrCell.jsx`, `MiniFixture.jsx`, `Badge.jsx`, `EmptyState.jsx`, `ErrorBanner.jsx`, `Skeleton.jsx`, `BottomSheetMenu.jsx` (voor "Meer").

**Aanmaken in `src/data/`:** `playersApi.js`, `usePlayerIndex.js` (§5.14).

**Aanpassen:**
- `src/routes.js`: herordenen + `group`, de entries `watchlist`/`pricechanges` eruit, het vangnet in `routeKeyFromPath`, `TAB_QUERY_PARAMS` aanvullen (`predictedlineups: ['match', 'team', 'view', 'twijfel']`) en `league`/`lgw` weg.
- `vercel.json`: `redirects` (§6.3), oude rewrites weg.
- `FDRTool.jsx`: header + 2× nav + footer vervangen door `<AppShell>`; de toast restylen; het `pricechanges`-blok weg. **De state en handlers blijven staan.** De watchlist-tab blijft in deze fase nog *bereikbaar via code*, maar staat niet meer in de nav.
- `src/i18n.js`: nav-sleutels (§6.1), "Meer"-menu, verwijderde sleutels (§6.3).
- `components/Sheet.jsx`, `components/Tooltip.jsx`: restyle (§5.10).
- `components/SpelersParts.jsx`: `PlayerPhoto` doorverwijzen naar `ui/PlayerFace` (oude export behouden als alias). `components/MiniFixtureBadge.jsx`: stijl via `ui/MiniFixture`.
- Verwijderen: `tabs/PlayerStatusTab.jsx`.

**Acceptatie:** desktop toont 8 tabs zonder overloop op 1280px; gsm heeft de onderbalk + het Meer-menu; `/price-changes` en `/watchlist` (nl + fr) redirecten correct; de deadline-teller kleurt volgens de regels; `npm run build` genereert geen pagina's meer voor de verwijderde routes.

### Fase 3: tools één voor één (elke stap = eigen PR, in deze volgorde)
| Stap | Tool | Bestanden | Kern |
|---|---|---|---|
| **3a** | FDR | `tabs/FDRTab.jsx`, (`FDRTool.jsx` enkel props) | §7.1: FdrCell, Σ-kolom, ratings-lade, toolbar |
| **3b** | Verwachte XI's | `tabs/PredictedLineupsTab.jsx`, `predicted-xi/PitchField.jsx` (**enkel** de `variant`-prop toevoegen), `constants.js` (nieuwe helper + overrides) | §7.2: één status, per wedstrijd, Overzicht + "Enkel twijfels" |
| **3c** | Team Planner | `tabs/TeamPlannerTab.jsx`, `tabs/TeamScreenshotUpload.jsx` (stijl), nieuw `ui/PlayerPicker.jsx`, `components/PlayerSearchInput.jsx` (stijl) | §7.3: het veld eerst, de kiezer, de lijst, 2 kolommen / 3 tabs |
| **3d** | Spelers + watchlist | `tabs/SpelersTab.jsx`, `src/spelers.js` (enkel §7.4-kolommen + `diff`), `src/i18n.js`, `FDRTool.jsx` (WatchlistTab weg, eenmalige melding) | §7.4 + §8 |
| **3e** | Bonuspunten, Kaarten, Set pieces | `tabs/BonuspuntenTab.jsx`, `tabs/KaartenTab.jsx`, `tabs/SetPiecesTab.jsx`, `components/ScopeFilter.jsx` (wordt een wrapper rond `Segmented`, de API `makeScopeMatcher` blijft), `components/RankingRow.jsx` (vervangen door DataTable-rijen; `src/bonuspunten.js` verwijst er ook naar, dus controleer die verwijzing vóór je het bestand weghaalt) | §7.5–7.7 |
| **3f** | Klassement | `tabs/KlassementTab.jsx`, `src/i18n.js` | §7.8 |
| **3g** | Speler- en club-sheet | `components/PlayerSheet.jsx`, `components/ClubSheet.jsx`, `components/SpelerPopup.jsx` (op het einde weg), `components/FixtureStrip.jsx` (stijl) | §7.9–7.10 |

**Acceptatie per stap:**
- Elke functie van vóór de stap werkt nog. Klik ze af in de preview, met een lijstje in de PR.
- localStorage-data van vóór de stap wordt correct ingelezen. Test met een gevulde team planner + watchlist + aangepaste ratings.
- Screenshots 390/1440 vóór en na.
- Geen nieuwe hex-kleuren of inline radii in de aangeraakte bestanden.

### Fase 4: opruimen en controleren
- De `<style>`-string in `FDRTool.jsx` verhuizen naar `src/styles/base.css` / component-CSS, voor zover die nog gebruikt wordt; verwijder dode `.fdr-*`-regels.
- `theme.js`: de knopstijl-exports verwijderen zodra niets ze nog importeert.
- `og-card.png` (social preview) is nog paars: zie §12.5. **Melden aan de eigenaar**, niet zelf genereren.
- Draai de **grep-checks** (excl. `src/predicted-xi/`); de verwachte uitkomst is 0 treffers, behalve de toegestane bestanden:
  ```bash
  # oude kleuren
  grep -rnE "#(4ECDC4|2A1440|3D1E5C|C9B8E0|8F79AD|6B5289|A794C2|A594C4|EDE4F5|311A4D)" src --include=*.jsx --include=*.js | grep -v "src/predicted-xi/"
  # hex in jsx in het algemeen
  grep -rnE "#[0-9A-Fa-f]{6}\b" src --include=*.jsx | grep -v "src/predicted-xi/"
  # radii > 2px
  grep -rnE "borderRadius: *'(4|5|6|8|10|12|14|18|999)px'|border-radius: *(4|5|6|8|10|12|14|16|999)px" src | grep -v "src/predicted-xi/"
  # schaduwen (enkel --shadow-overlay in ui/Sheet, ui/BottomSheetMenu, toast)
  grep -rn "boxShadow\|box-shadow" src | grep -v "src/predicted-xi/"
  # gradients (enkel scroll-fade, arcering, export)
  grep -rn "gradient(" src | grep -v "src/predicted-xi/"
  # verboden fonts
  grep -rniE "inter'|roboto|space grotesk|geist" src index.html
  # font-sizes buiten de schaal
  grep -rnE "fontSize: *'(8|9|14|16|17|20|22)px'" src | grep -v "src/predicted-xi/"
  ```

**Definition of done (hele rework):**
- [ ] Alle punten uit §1.2–1.4 zijn opgelost of bewust afgewezen (met reden in de PR).
- [ ] §4 (verboden lijst): de grep-checks zijn schoon.
- [ ] §9 (gsm-checklist) is volledig afgevinkt.
- [ ] De watchlist, team planner en ratings van een bestaande gebruiker overleven alle fases.
- [ ] De privé Predicted XI Builder + PNG-export zien er identiek uit als vóór de rework.
- [ ] NL en FR zijn compleet (geen ontbrekende i18n-sleutels in de console).

---

## 12. Beslissingen

**Genomen (12 november 2026):**
1. **Palet: het logo** (petrol `#09282A` + aqua `#33EDD5`) in plaats van paars. De eigenaar is geen grote fan van het paars en het logo is al petrol/aqua, dus dit maakt het merk consistenter in plaats van het te breken. Het paarse terugval-palet staat in §3.1 en is één bestand (`tokens.css`) om terug te zetten.
2. **FDR-midden blijft geel.** De FDR-kleuren blijven ongewijzigd (§3.2). Daarom is aqua het accent en is geel geen UI-kleur.

**Nog open (vraag dit vóór de betreffende fase):**
3. **Minileague-code in de desktop-topbalk** of enkel in de footer en het Meer-menu? Aanbevolen: topbalk vanaf 1200px + footer.
4. **Bonuspunten en Kaarten** later samenvoegen met Spelers (als presets "Bonus" / "Kaarten")? Voorlopig **niet**: ze blijven aparte pagina's (SEO, bestaande links), maar met dezelfde DataTable. Beslis na een paar weken met nieuwe analytics.
5. **`og-card.png`** (social preview bij gedeelde links) is paars met een turquoise vlak en een stippenraster. De eigenaar maakt een nieuwe in het logopalet (Canva, 1200×630). Claude Code genereert die niet zelf.
