# FUNCTIONALITEIT_SPEC.md — Rework "FPL Pro League Tools", deel 2: werking en logica

> **Status:** versie 1.2 (13 november 2026). Alle keuzes van de eigenaar staan erin (§9). Klaar om mee te starten.
> **Voor:** Claude Code (lokaal, in deze repo)
> **Eigenaar:** @fpl_proleague. Lees eerst `CLAUDE.md`. Die regels blijven gelden: leg uit in eenvoudig Nederlands, push niets zonder het te vragen, werk met één branch + PR per fase, en schrijf commit- en PR-teksten in het Nederlands.
> **Bouwt voort op:** `docs/redesign/DESIGN_SPEC.md` (deel 1: het uiterlijk). Dat document blijft gelden voor alles wat met uiterlijk te maken heeft: tokens, componenten en de verboden lijst. Dit document gaat over **wat de knoppen doen, hoe de logica werkt en hoe de tools samenwerken**.
>
> **Startpunt en preview:** deze rework bouwt verder op de redesign, die nog **niet** op `main` staat. Werk daarom zo (zie ook §8):
> 1. Maak vanaf `redesign/fase-5-feedback` een **verzamelbranch** `functionaliteit/eindresultaat` en push die (na toestemming).
> 2. Elke fase krijgt een eigen branch vanaf die verzamelbranch, met een PR **naar `functionaliteit/eindresultaat`** (niet naar `main`). Zo krijgt elke fase een eigen Vercel-preview om te keuren.
> 3. Pas als alle fases erin zitten, opent Claude Code één PR van `functionaliteit/eindresultaat` naar `main`. De Vercel-preview van díe PR is het eindresultaat (redesign + functionaliteit samen). De eigenaar bekijkt dat en beslist zelf over de merge.
> 4. Komt er tussendoor iets op `redesign/fase-5-feedback` of `main` bij (bv. de wekelijkse `predictedLineupsData.js`), merge dat dan in de verzamelbranch, zodat de preview actueel blijft.

---

## 0. Spelregels voor deze rework

1. **Niemand verliest data.** Wijzigt het formaat van wat in `localStorage` staat (Team Planner, ratings), dan komt het onder een **nieuwe sleutel** (`..._v2`), met een migratie vanuit de oude sleutel. **De oude sleutel blijft onaangeroerd** staan als back-up. Schrijf voor elke migratie een kleine test met echte voorbeelddata (zie §8).
2. **Bestaande URL's blijven werken**, ook oude deellinks met `?r=` en `?ha=`.
3. **Drie talen.** Elke nieuwe of gewijzigde tekst krijgt een sleutel in `src/i18n.js`, in `nl`, `fr` én `en`. **Geen enkele zichtbare tekst meer hard in de code**, ook geen foutmeldingen of bevestigingen (zie A3).
4. **Het uiterlijk volgt deel 1.** Gebruik de bestaande componenten (`Sheet`, `DataTable`, `PlayerPicker`, `Segmented`, `Button`, `Badge`, toasts). Maak geen nieuwe stijlen als er al een component bestaat.
5. **`src/predicted-xi/**` (de privétool) blijft ongemoeid**, tenzij een stap dat expliciet vraagt.
6. **Niet mergen tussen vrijdag 12:00 en de deadline.**
7. **Eén fase = één branch + PR naar de verzamelbranch + Vercel-preview.** De eigenaar keurt goed vóór de merge. Grote fases (C) mag je opdelen in meerdere PR's. Naar `main` gaat enkel het eindresultaat, en enkel als de eigenaar dat zelf beslist.
8. **Twijfel je over een spelregel van Fantasy Pro League, verzin dan niets.** Vraag het aan de eigenaar (§9).

---

## 1. Samenvatting voor de eigenaar (in gewone taal)

De site ziet er nu professioneel uit, maar een aantal tools werkt nog zoals ze in het begin gebouwd zijn. De belangrijkste problemen, in volgorde van impact:

1. **Team Planner gaat ervan uit dat iedereen sinds GW1 alles invult.** Voor wie dat echt deed, klopt het, en die data blijft gewoon staan. Maar wie vandaag begint en zijn huidige team invult, krijgt "3 gratis transfers" en een budget dat niet klopt, en kan dat nergens corrigeren.
2. **In de Team Planner moet je elke speeldag opnieuw je bank kiezen.** Ga je van GW12 naar GW13, dan staat er "Kies nog 4 bankspelers". In het echte spel neemt je team gewoon over.
3. **Wisselen tussen veld en bank is omslachtig**, en een transfer laat ongeldige keuzes toe, zoals een aanvaller op een verdedigersplek.
4. **"Optimaliseer opstelling" kijkt enkel naar de tegenstander, niet naar de speler.** Een speler met 69 punten belandt op de bank omdat zijn tegenstander een 3 is, terwijl een zwakkere speler met een 2 blijft staan.
5. **Wie een gedeelde FDR-link opent, verliest zijn eigen ratings voorgoed.** Getest op de preview: eigen rating Club Brugge 1, link van iemand anders geopend, daarna stond die rating bij jou op 5.
6. **Als jij de standaardratings aanpast (zoals Charleroi naar 4), ziet niemand die al ooit iets aanpaste dat nog.** Hun oude, volledige set blijft voor altijd staan.
7. **De Spelers-tab en de spelerskaart tonen een fout bonustotaal voor keepers** (bv. Sommer 11 in plaats van 3). Keepers kunnen enkel het punt voor gewonnen duels halen, maar `api/players.js` rekent ook recoveries, kopballen en kansen mee. Dat is ook live zo. Daarnaast gebruikt de site twee databronnen voor dezelfde spelers (de officiële API en je Google Sheet).
8. **De officiële API weet welke spelers geblesseerd zijn, maar de site toont dat nergens.** Vandaag staan Ordoñez, Samoise, Homawoo en Banguera als geblesseerd gemarkeerd.
9. **Stukjes Nederlands op de Franse en Engelse site**: de bevestiging bij "Wis team", de uitleg bij uitgestelde wedstrijden en foutmeldingen.
10. **De 404-pagina is nog paars** en linkt naar Watchlist en Price Changes, die niet meer bestaan.

En wat populaire Engelstalige FPL-tools beter doen, dat de moeite is om over te nemen, staat in §2.

Tot slot: van je **API-Football Pro**-abonnement gebruikt de site vandaag enkel de uitslagen (de vormvierkantjes). Schoten, key passes, xG per club en officiële opstellingen zitten er ook in. Dat is fase F (§7b).

---

## 2. Wat andere FPL-tools beter doen (vergelijking)

Bekeken (13 november 2026): Fantasy Football Scout (Season Ticker), Fantasy Football Hub, FPL Review, OneFPL, FPL Form, FPL Copilot, plus het officiële FPL-spel. Een deel van hun functies zit achter een betaalmuur, dus de beschrijvingen hieronder komen soms uit reviews en handleidingen, niet uit eigen gebruik.

| Wat | Hoe de grote tools het doen | Onze site nu | Nemen we over? |
|---|---|---|---|
| **Startpunt planner** | Je laadt je echte team in, met je budget en je gratis transfers (OneFPL, FPL Review, FPL Form via "Load FPL Squad"). | Doet alsof je in GW1 begon. Budget en vrije transfers zijn niet in te vullen. | **Ja**: zelf invullen (C1). Inladen via team-ID kan niet: de API van Fantasy Pro League vraagt een login voor `team/{id}`, en de site zegt zelf dat opstellingen niet publiek zijn. |
| **Team neemt over naar de volgende GW** | Standaard in elk spel en elke planner. | Bank en kapitein zijn per GW leeg. | **Ja** (C2). |
| **Wisselen** | Officiële FPL: tik op een speler, kies "Substitute", geldige wissels lichten op, tik om te wisselen. | "Naar bank" werkt niet als de bank vol is, en daarnaast is er een aparte herschikmodus. | **Ja** (C3). |
| **Transfer maken** | Tik op een speler, dan een lijst met enkel dezelfde positie binnen je budget. Ongeldige keuzes zijn geblokkeerd, met de reden erbij. | Dropdown plus een los zoekveld zonder positiefilter. Regels zijn enkel waarschuwingen. | **Ja** (C4). De `PlayerPicker` doet dit al voor lege vakken. |
| **Opstelling/kapitein voorstellen** | Op basis van verwachte punten (FFHub, FPL Review, FPL Form "lineup suggestor" voor kapitein, vice en bank). | Enkel op basis van de FDR van de tegenstander. | **Deels**: een eenvoudige, uitlegbare score op basis van vorm, tegenstander en startkans (C6). Geen eigen xP-model. |
| **Fixture ticker** | Ranglijst op makkelijkste periode. Teams aan- en uitzetten, speeldagen weglaten, eigen ratings (FFS). Aparte aanvals- en verdedigingsratings (FFS, FFHub, FPL Form). Rotatiepartners zoeken (FFS "Sort by Rotation"). | Sorteren kan. Teams vergelijken gebeurt in een aparte sectie met een eigen periodekiezer. Eén rating per club. | **Ja** voor teams kiezen in de hoofdtabel en één periode (D2/D3). **Later** voor aanval/verdediging en rotatie (§7). |
| **Beschikbaarheid** | Gekleurde vlag bij geblesseerde, twijfelachtige of geschorste spelers, overal waar de speler verschijnt. | Niets, terwijl de API `info.injury` levert. | **Ja** (B3). |
| **Vorm** | FPL: gemiddelde punten per wedstrijd over de laatste ~30 dagen. | "Vorm" is de **som** van de laatste 5 speeldagen (bv. 36), met hetzelfde woord. Dat verwart wie FPL kent. | **Ja**: verduidelijken (E4). |
| **Mijn team in andere tools** | Je spelers zijn gemarkeerd in de lijsten en in de verwachte opstellingen. | "Mijn team"-filter in Spelers, Bonuspunten en Kaarten (goed), maar niet bij de Verwachte XI's. | **Ja** (E1). |
| **Mijn klassement** | LiveFPL en FPL Team onthouden je team en tonen meteen je rang. | Elke keer opnieuw je teamnaam zoeken. | **Ja**, klein (E5). |

---

## 3. Fase A: bugs en betrouwbaarheid (klein werk, grote winst)

### A1. Een gedeelde FDR-link overschrijft je eigen ratings (bug, bevestigd op de preview)

**Nu:** `FDRTool.jsx` laadt `loadRatingsFromURL() || loadStoredRatings()` (r. 502), en de effect op r. 670 schrijft ze meteen weg naar `fpl_proleague_fdr_ratings_v1`. Wie een link met `?r=` opent, verliest zijn eigen ratings zonder melding. Daarnaast blijft `?r=…&ha=…` aan elke URL plakken, ook na een tabwissel (`/spelers?r=…`), omdat `TAB_QUERY_PARAMS` ze bewust doorgeeft.

**Moet worden:**
- Een link met `?r=`/`?ha=` toont die ratings **enkel om te bekijken**. Boven de tabel staat een balk (component `ErrorBanner`-stijl, maar neutraal): "Je bekijkt de ratings uit een gedeelde link. [Overnemen als mijn ratings] [Terug naar mijn ratings]".
- Pas bij "Overnemen" wordt er iets bewaard. "Terug" haalt `r`/`ha` uit de URL en toont je eigen ratings (of de standaard).
- Zolang die balk staat, schrijft de effect niets weg.
- `r` en `ha` horen enkel bij de FDR-tab: voeg ze toe aan `TAB_QUERY_PARAMS.fdr`, zodat ze verdwijnen bij een tabwissel. Ze blijven gelden zolang je op de FDR-tab blijft.
- **Test:** eigen ratings instellen, een link met andere ratings openen, de pagina verlaten en `/fdr` opnieuw openen. De eigen ratings moeten er nog zijn.

### A2. Nieuwe standaardratings bereiken niet iedereen

**Nu:** zodra iemand één club aanpast, wordt de **volledige** set van 18 bewaard. Past de eigenaar later `DEFAULT_RATINGS` aan, dan ziet die bezoeker dat nooit.

**Moet worden:**
- Bewaar enkel de **afwijkingen**: `{ CHA: 3 }` in plaats van alle 18 clubs. Nieuwe sleutel `fpl_proleague_fdr_overrides_v2`. De effectieve rating is `override ?? DEFAULT_RATINGS[club]`.
- **Migratie** vanuit `fpl_proleague_fdr_ratings_v1`: elke club waarvan de bewaarde waarde gelijk is aan de huidige standaard telt als "niet aangepast". Elke andere waarde wordt een override. De oude sleutel blijft staan. Thuisvoordeel krijgt hetzelfde patroon (`..._fdr_home_overrides_v2`).
- In de ratings-lade krijgt elke aangepaste club een klein "aangepast"-label en een knop "↺" die enkel die club terugzet. "Reset" (alles terug) blijft bestaan.
- `isCustom` = "er is minstens één override". Dat lost meteen een tweede probleem op: wie alles handmatig terugzet, ziet nu nog altijd "eigen (aangepast)", omdat `isCustom` vandaag op objectreferentie vergelijkt.
- Deellinks (`?r=`) blijven de volledige set bevatten (oude links blijven werken).

### A3. Nederlandse tekst op de Franse en Engelse site

Getest: op `/en/team-planner` toont "Clear team" een Nederlandse bevestiging. Te vertalen of te vervangen:
- `FDRTool.jsx` r. 1502 en r. 1516 (`window.confirm`): vervang beide door **ongedaan maken** in plaats van een bevestiging. Wis meteen en toon een toast "Team gewist. [Ongedaan maken]" (8 s), zelfde patroon als de watchlist-undo. Geen `window.confirm` meer op de site.
- `FDRTool.jsx` r. 1062: `'Kon spelersdatabank niet laden…'` wordt een i18n-sleutel. Hetzelfde voor alle andere `setPlayerDatabaseError`/`setErrorMessage`-teksten.
- `src/constants.js`: `buildPostponedTooltipText`, `buildPossiblyPostponedTooltipText`, `POSTPONED_DATES`, `POSTPONED_REASONS` en `POSSIBLY_POSTPONED_REASONS` zijn Nederlandse zinnen. Maak er data van (datum als ISO, reden als sleutel, bv. `'europe'`) en bouw de zin met `t()`. De datum formatteer je per taal met `Intl.DateTimeFormat`. Dit is zichtbaar: GNT–STV in GW14 heeft vandaag zo'n tooltip.
- `api/analyze-screenshot.js`: geef foutcodes terug (`{ code: 'no_image' }`, `'service_error'`, `'partial', count: 12`, …) in plaats van Nederlandse zinnen. `TeamScreenshotUpload.jsx` vertaalt ze.
- **Controle achteraf:** zoek in `src/` naar Nederlandse woorden buiten `i18n.js` (bv. `grep -rn "Weet je\|Kon \|mislukt\|probeer" src --include=*.js*`). Open elke tab in `/en/` en kijk of er nog Nederlands staat.

### A4. De 404-pagina (`public/404.html`)

Nog in het oude paarse ontwerp, met links naar **Watchlist** en **Price Changes** (bestaan niet meer) en zonder Spelers en Klassement. Zet hem in het logopalet (`tokens.css`-waarden inline, want het is een losse HTML), met links naar de 8 huidige tools, de taal afgeleid uit het pad (`/fr/…` of `/en/…`) en een korte zin in de drie talen.
Ook: `/club/CLU` (hoofdletters) geeft vandaag een 404, terwijl `/club/clu` werkt. Voeg in `vercel.json` geen 34 regels toe. Laat `public/404.html` met een paar regels JavaScript `/club/XXX` en `/speler/…` met hoofdletters doorsturen naar de kleine-letterversie.

### A5. De screenshot-functie kan misbruikt worden (kostenrisico)

`api/analyze-screenshot.js` roept met jouw `ANTHROPIC_API_KEY` Claude aan voor **iedereen die de URL kent**. Er is geen limiet. Iemand die het endpoint duizenden keren aanroept, maakt jouw rekening op.
- In de functie: weiger verzoeken waarvan `Origin`/`Referer` niet `fplproleague.vercel.app` of een `*.vercel.app`-preview van dit project is. Weiger afbeeldingen boven ~4 MB base64.
- **Eigenaar, zelf in te stellen (Claude Code legt het stap voor stap uit):** in Vercel → Firewall een **rate limit**-regel op het pad `/api/analyze-screenshot` (bv. 10 verzoeken per 10 minuten per IP). En in de Anthropic Console een maandlimiet op de sleutel.

### A6. Bonuspunten van keepers kloppen niet in de Spelers-tab (bug, ook live)

**Spelregel (bevestigd door de eigenaar):** een keeper kan van de vier bonuspunten **enkel het punt voor duels** halen (meer gewonnen dan verloren). Recoveries, kopballen en grote kansen tellen voor keepers niet.
**Nu:** `bonusForMatch` in `api/_lib/proleague.js` past de vier voorwaarden toe op iedereen. Gecontroleerd met de data t.e.m. GW11: met de regel "enkel duels" komt de API-berekening voor **alle 60 keepers exact** overeen met de Google Sheet (Sommer 3, Roef 3, Coosemans 5, …). Zonder die regel wijken er 25 af.
**Moet worden:** `bonusForMatch` krijgt de positie mee (`positionId === 1` → enkel `duels`; de andere drie op 0). Pas ook `BONUS_THRESHOLD`/de uitleg in `src/bonuspunten.js` en de uitlegtekst van Bonuspunten aan (3 talen: "Keepers kunnen enkel het duelpunt halen"). Zet het bewijs in een opmerking: "Gecontroleerd na GW11: 60/60 keepers gelijk aan de sheet". Bonusvelden die voor een keeper niet tellen (`bpHeaders`, …), toont de spelerskaart als "—", niet als 0.
Deze fix gaat mee met de rest van de rework (beslissing eigenaar), dus geen aparte hotfix.

### A7. Kleine dingen

- **"Bank" betekent twee dingen in het Nederlands.** In de statusregel van de planner is "Bank €2.5M" het **geld**, en 20 pixels lager is "BANK — GW12" de **bankzitters**. Maak van het geld "Budget" (`teamPlanner.status.bank` nl: "Budget"). FR "Reste" en EN "ITB" zijn al goed.
- **Set pieces "Bijgewerkt: GW7"** terwijl we in GW12 zitten. Staat de sheet meer dan 2 speeldagen achter op `CURRENT_GW`, toon dan in de meta "Bijgewerkt: GW7 (kan verouderd zijn)" in `--warning`. De data bijwerken is werk voor de eigenaar, niet voor de site.
- **`CLAUDE.md` is verouderd:** de tablijst noemt Watchlist, Price Changes en `PlayerStatusTab.jsx`, en de sectie "Belangrijkste bestanden" zegt "vertalingen (nl/fr)". Werk dat bij (8 tabs, 3 talen) en voeg een verwijzing naar dit document toe.
- **De aftelklok na de deadline:** `CURRENT_GW` wordt één keer berekend bij het laden. Blijft de pagina open over de deadline heen, dan verdwijnt de klok, maar de rest van de site blijft op de oude GW staan. Toon bij 0 "GW12 is begonnen · herlaad voor GW13" (een kleine link die herlaadt). Een herberekening zonder herladen is niet nodig.

**Klaar als:** A1 t.e.m. A7 werken op de preview, in de drie talen, op desktop en op gsm (390 px).

---

## 4. Fase B: één bron voor spelersdata + beschikbaarheid

### B1. `/api/players` wordt de enige bron voor naam, club, positie, prijs en statistieken

**Voorwaarde:** A6 (bonus keepers) is gebeurd. Anders verschillen de bonustotalen van keepers zodra Bonuspunten de API gebruikt. Enige andere afwijking vandaag: Bentayeb (AND) heeft in de sheet 2 gele kaarten en 2 wedstrijden, in de API 0. Laat de eigenaar die ene speler controleren.

**Vastgesteld:** de 515 spelers in de Google Sheet en in de API zijn exact dezelfde (naam = `short`, club, positie en prijs komen overeen). De sheet is dus een kopie van de API. Toch gebruikt de site beide, met een fuzzy-match (Levenshtein in `usePlayerIndex.js` en `playerFuzzyMatch.js`) om ze aan elkaar te knopen.
- Team Planner, `PlayerPicker`, Bonuspunten, Kaarten, de watchlist-prijs en `resolvePlayerSlug` lezen voortaan uit `/api/players` (via `src/data/playersApi.js`). Bonuspunten gebruikt `bp`/`bpDuels`/…, Kaarten `yc`/`rc`.
- **Spelers in de opslag (team, watchlist) blijven op naam + club bewaard** (het formaat verandert niet). Bij het inlezen zoek je ze op via `short` + `club`, dan `name` + `club`. Vind je er geen, dan blijft de speler staan met de bewaarde gegevens en een klein "niet gevonden"-label. Nooit stil wissen.
- **Terugval:** lukt `/api/players` niet, dan laad je de Google Sheet zoals nu (`PLAYER_DATABASE_CSV_URL` blijft bestaan). De sheet blijft ook de bron voor **set pieces** (handwerk van de eigenaar).
- Daarna kan de fuzzy-match grotendeels weg. Behoud enkel normalisatie (accenten, hoofdletters) voor de screenshot-import en voor oude opgeslagen namen.
- De eigenaar hoeft de spelerskolommen in de sheet dan niet meer bij te houden. Zeg dat expliciet in de PR.

### B2. Wekelijkse kaarten in de API → "geschorst" tonen

`api/players.js` haalt al elke speeldag apart op (`fetchWeek`). Voeg `yc` en `rc` toe aan het `w`-object (net als `pts`, `min`, …).
- Daarmee weet de site **in welke GW** de drempelkaart viel. Een speler die in de laatst gespeelde GW zijn 5e (10e, …) gele kaart kreeg, of rood, is **geschorst voor de volgende GW**. Toon dat als badge "Geschorst GW12" in Kaarten, Spelers, de spelerskaart, de planner en de Verwachte XI's.
- Een rode kaart kan meer dan één wedstrijd schorsing opleveren. Dat weet de API niet. Toon dus "Rood in GW11: schorsing van minstens 1 wedstrijd".
- **Schorsingsregel (bevestigd door de eigenaar): 5, 10, 15 gele kaarten.** `kaarten.js` rekent al zo, dus daar verandert niets. Zet de bevestiging in de opmerking bij `SUSPENSION_PHASES`.

### B3. Blessures uit de officiële Fantasy Pro League-data

Let op: dit komt uit de gratis bron die de site al gebruikt (`proleague.code.brussels`), **niet** uit API-Football. API-Football heeft geen blessures voor deze competitie, en daar wordt niets voor gekoppeld (beslissing eigenaar).

De bron (`proleague.code.brussels/players`) heeft per speler een veld `info`, vandaag bv. `{ "injury": true }` voor Ordoñez, Samoise, Homawoo en Banguera. Er zijn ook velden `ban` en `injury` (vandaag overal 0 of null).
- Geef in `api/players.js` per speler `inj: true|false` mee (`info?.injury === true || injury > 0`), en `ban` als dat ooit gevuld raakt. Lees defensief, zoals de rest van het bestand.
- **Eén beschikbaarheidsstatus per speler**, berekend op één plek (nieuw: `src/availability.js`), met deze volgorde: geblesseerd (API) → geschorst (B2) → twijfel/risico (Verwachte XI's van de komende GW, enkel als die gepubliceerd zijn) → één kaart van schorsing → niets.
- Toon die status als **één klein symbool** naast de naam in `PlayerCell` (dus automatisch in Spelers, Bonuspunten, Kaarten, de kiezer en de planner-lijst), op het veld van de planner (rechtsboven op het shirt, zoals de kapiteinsbadge) en in de spelerskaart, met de uitleg als tooltip/`aria-label`. Kleuren: `--danger` voor geblesseerd/geschorst, `--warning` voor twijfel/1 kaart. Een filter "Enkel beschikbare spelers" in de filterlade van Spelers en in de `PlayerPicker`.

**Klaar als:** Bonuspunten en Spelers tonen hetzelfde bonustotaal. De planner werkt ook als de Google Sheet onbereikbaar is. Geblesseerde en geschorste spelers zijn overal herkenbaar.

---

## 5. Fase C: Team Planner herwerken (de grootste fase)

**Principe:** de planner moet werken zoals het echte spel. Wat je in een GW instelt, neemt over naar de volgende GW. Elke wijziging is een transfer met echte gevolgen voor budget en gratis transfers. En je kan altijd zeggen hoeveel budget en gratis transfers je **echt** hebt.

**Belangrijk (eigenaar):** er zijn bezoekers die hun team al sinds GW1 bijhouden, met al hun transfers. Bij hen klopt de berekening vandaag. **Die geschiedenis blijft volledig bewaard en blijft meetellen.** Niets in deze fase mag hun team, transfers, bank, kapiteins of boosters wissen of herschrijven.

Mag in 3 PR's: C1+C2+C9 (model en migratie), C3+C4+C5 (wisselen en transfers), C6+C7+C8 (slimmer + afwerking).

### C1. Startpunt en "ijkpunten" voor budget en gratis transfers

**Nu:** de 15 spelers in `teamPlannerPlayers` zijn een GW1-team. `computeTeamPlannerTransferBudget` begint in GW2 met 1 vrije transfer en telt op tot het plafond van 3. Voor wie sinds GW1 alles invult, klopt dat. Wie vandaag begint en zijn huidige team invult, ziet "3 gratis transfers" en een budget dat niet klopt, en kan niets corrigeren. Het budget in de statusregel volgt bovendien de transfers niet (het rekent op het GW1-team).

**Moet worden:**
- Het team heeft een **startspeeldag** (`startGw`): de GW van het ingevulde basisteam.
  - **Bestaande gebruikers** (migratie, C9): `startGw = 1`. Alles rekent verder zoals nu: GW1 is de teamopbouw, GW2 begint met 1 gratis transfer, plafond 3 (bevestigd door de eigenaar), en Recharge bevriest het saldo.
  - **Nieuwe gebruikers** (lege planner): `startGw = CURRENT_GW`. Bij het invullen vraagt de planner twee getallen: **budget** (voorstel: `100 − teamwaarde`; het spel kent geen prijswijzigingen, zie DESIGN_SPEC §6.3) en **gratis transfers** voor deze GW (0–3, voorstel 1).
- **IJkpunt ("Klopt niet? Pas aan"):** in de statusregel kan je op budget of gratis transfers tikken en de echte waarde invullen voor de bekeken GW. Dat wordt een ijkpunt: `checkpoints[gw] = { bank, freeTransfers }`. De berekening neemt voor elke GW het **laatste ijkpunt op of vóór die GW** als vertrekpunt en rekent vanaf daar verder met de transfers. De geschiedenis ervoor blijft onaangeroerd. Een ijkpunt verwijderen kan ("↺ berekende waarde gebruiken").
- `computeTeamPlannerTransferBudget` wordt uitgebreid met `startGw` en `checkpoints`. Zonder ijkpunten en met `startGw = 1` moet hij **exact hetzelfde resultaat** geven als vandaag. Schrijf daar een test voor met de huidige functie als referentie.
- **Het budget volgt de transfers:** budget op GW X = vertrekpunt − Σ(prijs in − prijs uit) van de transfers sinds dat vertrekpunt, t.e.m. GW X. De statusregel toont budget, gratis transfers en eventuele puntenkost **van de bekeken GW**.
- **Eenmalige check voor bestaande gebruikers:** heeft iemand een team (v1-data), dan toont de planner bij het eerste bezoek na de update één regel bovenaan: "Klopt dit voor GW12? Budget €2.5M · 3 gratis transfers [Klopt] [Aanpassen]". "Klopt" verbergt de regel voorgoed. "Aanpassen" maakt een ijkpunt op `CURRENT_GW`. Wie sinds GW1 alles invulde, tikt op "Klopt" en er verandert niets.
- **Navigatie:** de planner opent op `CURRENT_GW` (zoals nu). Terugbladeren kan tot `startGw`. Afgelopen speeldagen tonen een klein label "Afgelopen speeldag", en transfers daar blijven aanpasbaar (om je geschiedenis te corrigeren).
- "Startteam bewerken" (het basisteam van `startGw` rechtzetten zonder dat het een transfer is) is een expliciete modus: een knop in de statusregel. Daarbuiten bestaat "Vervang" niet meer, enkel "Transfer". Nu staat "Vervang" (verandert stil de basisploeg voor alle GW's) in het lijstmenu en "Transfer" in het veldmenu. Dat verschil snapt niemand.

### C2. Bank, kapitein (en vice-kapitein) nemen over

**Nu:** `teamPlannerBenchByGw[gw]` en `teamPlannerCaptainByGw[gw]` zijn leeg voor elke GW die je nog niet zelf instelde. Getest: na "Optimaliseer" in GW12 toont GW13 "Kies nog 4 bankspelers".

**Moet worden:**
- Een GW zonder eigen keuze **erft** de keuze van de dichtstbijzijnde vorige GW (`startGw` inbegrepen). Implementatie: één helper `resolveForGw(byGw, gw, startGw)` in `constants.js`, net als `resolveSlotPlayerAtGw`. Pas je in GW14 iets aan, dan geldt dat vanaf GW14 voor alle latere GW's, tot een nieuwe keuze.
- Een transfer zet de nieuwe speler op **het slot** van de vertrekkende speler, dus ook op diens plek op de bank of het veld. Dat doet het slotmodel al vanzelf.
- Een nieuw team (15 spelers ingevuld, nog geen bank) krijgt meteen een **geldige standaardopstelling**: draai de optimalisatie (C6) één keer automatisch. Zo begint niemand met "Kies nog 4 bankspelers".
- Heeft een GW geen eigen keuze en ook geen eerdere (kan bij gemigreerde data), dan toont de planner een automatische standaardopstelling (C6). Die wordt pas bewaard als de gebruiker iets wijzigt.
- Bestaande keuzes per GW uit v1 blijven exact zoals ze zijn. Overerving vult enkel de **lege** GW's.
- **Vice-kapitein (bevestigd: het spel heeft er een):** menu-item "Vice-kapitein", `V`-badge (zelfde stijl als `C`, maar `--text-2` in plaats van accent), opgeslagen in `viceByGw` en overgeërfd zoals de kapitein. Kapitein en vice kunnen niet dezelfde speler zijn: wie vice is en kapitein wordt, laat de vice-plek leeg. Wordt de kapitein gebankt (via een wissel), dan verschuift de band niet stil. De statusregel toont "Kies een kapitein". De screenshot-import neemt `isViceCaptain` over.

### C3. Wisselen zoals in het echte spel

**Nu:** een basisspeler naar de bank sturen kan enkel als de bank niet vol is (`toBenchFull`). Met 4 bankspelers moet je dus eerst iemand van de bank naar het veld halen (een tussentoestand met 12 basisspelers), en dan pas de basisspeler naar de bank. De bankvolgorde wijzig je in een aparte "Herschik bank"-modus.

**Moet worden (officiële FPL-flow):**
- Tik op een speler → menu → **"Wissel"**. Alle spelers waarmee een geldige wissel mogelijk is, lichten op (de rest dimt). Tik op één van hen, en de twee wisselen van plek. "Annuleer" of Escape stopt de modus.
- Geldig = de formatie blijft één van `VALID_FORMATIONS`, en een keeper wisselt enkel met een keeper. Twee bankspelers onderling = de bankvolgorde wisselen (dat vervangt "Herschik bank").
- De bank heeft dus altijd exact 4 spelers en het veld 11. `toggleTeamPlannerBench` verdwijnt, en daarmee ook de foutmeldingen "Kies nog N bankspelers" en "ongeldige formatie" in normaal gebruik.
- Toetsenbord: de modus werkt ook met Tab + Enter. Een `aria-live`-regel zegt "Kies met wie Vanaken wisselt".

### C4. Transfers via de spelerskiezer, met harde regels

**Nu:** `TransferPanel` (TeamPlannerTab.jsx r. 136) = een dropdown "Uit" + een los zoekveld "In" **zonder positiefilter**. Een aanvaller op een verdedigersplek, over budget gaan of een 4e speler van dezelfde club kan allemaal, met enkel een waarschuwing. Op het veld telt die aanvaller daarna als verdediger.

**Moet worden:**
- Tik op een speler → **"Transfer"** → de bestaande `PlayerPicker` opent, met:
  - de positie **vast** op die van de vertrekkende speler (niet te wijzigen);
  - "Max. prijs" standaard = budget op die GW + prijs van de vertrekkende speler;
  - spelers die de regels breken **niet kiesbaar** (opacity .4 + reden: "al in je team", "max. 3 per club", "te duur (−€0.5M)"). Dat werkt al zo voor lege vakken (`pickerBlocked`). Breid het uit met budget.
- Kiezen = de transfer staat er meteen, met een toast "Transfer: Seys → Patris (GW13). [Ongedaan maken]". Geen extra bevestigknop.
- Het veld toont meteen het nieuwe team. De statusregel toont budget, vrije transfers en eventuele kosten ("−4 pt").
- `TransferPanel` en het gebruik van `PlayerSearchInput` in de planner verdwijnen. (`PlayerSearchInput` mag blijven als iets anders hem nog gebruikt.)
- **Transfers terugdraaien:** in de lijst "Transfers" blijft het ✕ per transfer. Een transfer verwijderen waar een latere transfer op hetzelfde slot van afhangt, verwijdert die latere ook. Meld dat in de toast ("2 transfers verwijderd").

### C5. De lijst rechts toont hetzelfde team als het veld

**Nu:** het veld toont het team **op de bekeken GW**, maar de lijst "Selectie" toont de **basisploeg** (met een notitie `listBaseNote`). Na een transfer staat er links dus iemand anders dan rechts.

**Moet worden:** de lijst toont het team van de bekeken GW, met dezelfde acties als het veld (Wissel, Transfer, Kapitein, Spelerskaart). Extra kolommen op desktop: punten (seizoen), vorm (E4) en de **volgende 3** fixtures vanaf de bekeken GW (`MiniFixture`×3), zoals in Spelers. Die kolom helpt het meest bij het plannen.

### C6. "Optimaliseer opstelling" en een kapiteinsvoorstel die naar de speler kijken

**Nu:** `optimizeTeamPlannerLineup` (FDRTool.jsx r. 1401) gebruikt enkel de FDR van de tegenstander. Getest: Van Den Kerkhof (69 pt, 2e beste verdediger van de competitie) gaat naar de bank omdat hij thuis tegen STV speelt (3).

**Moet worden:** één eenvoudige, uitlegbare score per speler per GW, in een nieuw bestand `src/lineupScore.js` (puur, zonder JSX, met tests):
```
score = basis × fixtureFactor × startFactor
basis         = gemiddelde punten per gespeelde wedstrijd, laatste 5 GW's (min. 1 wedstrijd; anders seizoensgemiddelde; anders 1)
fixtureFactor = { 1: 1.20, 2: 1.10, 3: 1.00, 4: 0.90, 5: 0.80 }[effectieve FDR]   (DGW: som over beide wedstrijden; geen wedstrijd: 0)
startFactor   = geblesseerd/geschorst 0 · risico 0.3 · twijfel 0.7 · starter/zeker 1 · onbekend 0.9
```
(Verwachte XI's tellen enkel voor de GW waarvoor ze gepubliceerd zijn. Voor latere GW's is de startFactor 1, behalve bij geblesseerd of geschorst.)
- "Optimaliseer" kiest de geldige formatie met de hoogste som, plus de beste keeper. Daarna stelt hij de **kapitein** voor (hoogste score) en de vice (2e).
- Een regel onder de knop legt uit waarom: "Op basis van vorm (laatste 5), tegenstander en startkans." Na het optimaliseren toont een toast wat er veranderde ("Van Den Kerkhof ↔ Sonko, kapitein: Zeneli") met "Ongedaan maken".
- Dit is **geen voorspelmodel**. Noem het nergens "verwachte punten". De getallen zelf hoeven niet zichtbaar te zijn.

### C7. Boosters

- Toon boosters pas als het team 15 spelers heeft. In de lege toestand zijn ze nu zichtbaar en klikbaar.
- Recharge: met C4 is de aparte "Bewerken → Bevestig recharge"-draft (`rechargeDraft`) overbodig. In een Recharge-GW zijn transfers gewoon gratis. De statusregel toont "Recharge: transfers gratis". Verwijder de draft-logica.
- Behoud de regels uit `toggleTeamPlannerBooster`: 1× per seizoen per booster, max. 1 per GW, geen eigen Recharge op een automatische Recharge-GW.

### C8. Lege toestand en screenshot-import

- Lege toestand: enkel de upload-knop + het lege veld (zoals nu). Verberg "Transfer plannen", boosters, "Optimaliseer" en de GW-pijlen tot het team 15 spelers heeft.
- Na een geslaagde screenshot-import vraagt de planner meteen om **budget en gratis transfers** (twee velden in de bevestigingsstap van `TeamScreenshotUpload`), want die staan meestal op dezelfde screenshot. Laat het prompt in `api/analyze-screenshot.js` ook proberen om `bank` (€M) en `freeTransfers` af te lezen (optionele velden in `PLAYERS_SCHEMA`). Gevonden = vooraf ingevuld, niet gevonden = leeg laten.
- Kapitein en vice uit de screenshot worden overgenomen voor `startGw`.

### C9. Opslag en migratie

- Nieuwe sleutel `fpl_proleague_teamplanner_v2`: `{ version: 2, startGw, startBank, startFreeTransfers, checkpoints, players[15], transfersBySlot, benchByGw, captainByGw, viceByGw, boosters, checkConfirmed }`. Bank, kapitein en vice bewaren enkel de GW's waar de gebruiker iets **wijzigde** (C2).
- **Migratie vanuit `_v1`** (eenmalig, bij het laden). **Er gaat niets verloren en niets wordt herrekend weggeschreven:**
  1. `players`, `transfersBySlot`, `benchByGw`, `captainByGw` en `boosters` worden **ongewijzigd** overgenomen.
  2. `startGw = 1`, `startBank = 100 − waarde van het basisteam`, `startFreeTransfers` = de huidige regel (GW1 = opbouw, GW2 begint met 1). `checkpoints = {}`, `viceByGw = {}`.
  3. `checkConfirmed = false` → de eenmalige check uit C1 verschijnt.
  4. Een lege v1-planner (geen enkele speler) migreert naar een lege v2 met `startGw = CURRENT_GW`.
  5. `_v1` blijft ongewijzigd staan als back-up. De site leest hem daarna niet meer.
- Schrijf de migratie als pure functie (`migrateTeamPlannerV1(v1, currentGw)`) met tests op 4 voorbeelden: leeg team, team zonder transfers, team met transfers sinds GW2 met een Recharge (budget en gratis transfers per GW moeten **identiek** zijn aan wat de huidige code berekent), en corrupte data (moet terugvallen op leeg zonder crash, v1 blijft staan).

**Klaar als (met de preview, desktop en gsm):**
- Nieuw team via de kiezer → meteen een geldige opstelling met kapitein. GW13 toont dezelfde bank en kapitein.
- Budget €1.5M en 1 vrije transfer ingevuld → een transfer van €6.0 naar €7.0 in GW13 toont "Budget €0.5M · 0 vrije transfers". Een tweede transfer in GW13 toont "−4 pt". GW14 toont "1 vrije transfer".
- Een aanvaller kan niet op een verdedigersplek. Een speler die je budget overschrijdt, is niet kiesbaar.
- Een wissel tussen een basisspeler en een bankspeler kan in 2 tikken, ook met een volle bank.
- Een oud v1-team uit de echte `localStorage` van de eigenaar migreert zonder verlies. Vraag hem om zijn huidige waarde te kopiëren voor een test. Team, transfers, gratis transfers en puntenkost per GW zijn identiek aan vóór de update.
- Een ijkpunt "GW12: budget €0.5M, 1 gratis transfer" verandert enkel GW12 en later. GW1–GW11 tonen hetzelfde als voorheen.

---

## 6. Fase D: FDR-logica

### D1. Dubbele speeldag (DGW): blijft 1 (beslissing eigenaar)

`getFixtureScores` (constants.js r. 543) geeft een DGW score **1** in gemiddelden. **Zo laten.** De uitleg in `infoModal.p3` zegt dit al. Enkel nakijken dat de nieuwe `lineupScore` (C6) een DGW als twee wedstrijden telt: dat is een andere berekening (spelersscore, geen FDR-gemiddelde) en botst niet met deze keuze.

### D2. Eén periode voor de hele FDR-pagina + snelkeuzes

**Nu:** er zijn twee aparte periodes: één voor de hoofdtabel (`gwHorizonStart/End`) en één gedeelde voor "Beste fixture runs" en "Vergelijk teams" (`rangeStart/End`). Dat zijn drie GW-kiezers op één pagina, met een hint die uitlegt dat twee ervan gekoppeld zijn.
**Moet worden:** één periode voor alles (de hoofdtabel, Σ, beste runs). Naast de kiezer drie snelknoppen: **Volgende 3 · 5 · 8** (`Segmented`, de actieve oplichten als de periode daar exact mee overeenkomt). Onthoud de periode per sessie (`sessionStorage`, in try/catch). Bewust niet permanent: volgende week moet hij vanzelf meeschuiven.

### D3. "Vergelijk teams" gaat op in de hoofdtabel (bevestigd door de eigenaar)

**Nu:** een aparte sectie met 18 clubknoppen die een tweede, kleinere tabel tekent met exact dezelfde cellen.
**Moet worden:** een knop **"Clubs kiezen"** in de toolbar opent een lade met 18 vinkjes ("Alle clubs" / "Wis"). Met een selectie toont de hoofdtabel **enkel die clubs**, met een chip "5 clubs ✕" om terug te gaan. In de URL (`?clubs=CLU,AND,GNK`) zodat je zo'n vergelijking kan delen. De sectie "Vergelijk teams" verdwijnt. "Beste fixture runs" blijft (feedback eigenaar fase 5), maar volgt de periode uit D2.

### D4. Kleine dingen

- Klikken op een GW-kop sorteert (goed), maar niemand weet het. Zet een klein sorteerpijltje (zoals in Spelers) in elke kop.
- "Download": html2canvas faalt nu stil (`catch {}`). Toon bij een fout een toast "Afbeelding maken lukte niet. Maak een screenshot." (i18n). Hetzelfde voor "Kopieer link" als het klembord geblokkeerd is: toon dan de link in een klein veld om zelf te kopiëren.

---

## 7. Fase E: tools die elkaar kennen

### E1. "Mijn spelers" in de Verwachte XI's

De vraag die managers vlak voor de deadline het meest stellen: *staan mijn spelers erin?* `PredictedLineupsTab` krijgt vandaag geen team mee (FDRTool.jsx r. 1653).
- Geef `isPlayerInMyTeam` mee (het team zoals het er in de getoonde GW uitziet, dus na geplande transfers). Werkt in **beide weergaven** (gevraagd door de eigenaar):
  - **Overzicht:** de naam van een speler uit je team krijgt een subtiele accentonderlijning (2px `--accent`, onder de naam, niet de hele rij). Een nieuwe schakelaar **"Enkel mijn spelers"** (naast "Enkel twijfels") toont per club enkel jouw spelers.
  - **Veld:** het naamlabel van je speler krijgt dezelfde subtiele markering: een dunne accentrand of accentlijn onder het label. Geen extra icoon dat met de statusstip kan botsen. Doe dit via de bestaande `variant="site"`/`SITE_PITCH_THEME`-route (DESIGN_SPEC §7.2), met een nieuwe optionele prop (bv. `highlightPlayer(name) → boolean`) op `PitchField`/`PitchSlot`. **Zonder die prop blijft de privétool en de PNG-export pixel-identiek** (spelregel §0.5).
  - **Wedstrijdstrip:** een wedstrijd met jouw spelers krijgt een klein getal of puntje in accentkleur ("2"), zodat je ziet waar je moet kijken.
  - In de legende: "▁ = in jouw team" (enkel zichtbaar als je een team hebt).
- Bovenaan (enkel als je een team hebt én de XI's van de komende GW gepubliceerd zijn) staat één regel: "Mijn team: 13 verwacht in de basis · twijfel: Abid, Seys · niet in de XI: Coosemans". Elke naam opent de spelerskaart.
- Geen team ingevuld = niets van dit alles zichtbaar (geen lege toestand, geen reclame voor de planner).

### E2. Van spelerskaart naar transfer

**Nu:** "Naar Team Planner" in de spelerskaart opent enkel de planner.
**Moet worden:** heb je een team, dan wordt het **"Transfer naar mijn team"**. De planner opent met de transfermodus waarbij deze speler de **inkomende** is. Je kiest wie eruit gaat (enkel dezelfde positie; spelers waarvoor het budget of de clublimiet niet volstaat, zijn gedimd met de reden). Heb je geen team, dan blijft het "Naar Team Planner". Zit de speler al in je team, dan toont de knop "In je team" (uitgeschakeld).

### E3. Bonuspunten en Kaarten op de tabel van Spelers (bevestigd door de eigenaar)

Beide pagina's tonen een deel van wat Spelers al kan, met minder mogelijkheden (Bonuspunten: enkel een top 15, geen positie- of clubfilter; Kaarten: geen zoekveld of clubfilter).
**Moet worden (de URL's en de SEO blijven):** beide pagina's gebruiken dezelfde tabel-engine als Spelers, met hun eigen vaste kolommen:
- Bonuspunten = Spelers met preset "Bonus", gesorteerd op `bp`, met positiefilter, en de vier categorieën als `Segmented`, zoals nu.
- Kaarten = een nieuwe preset "Kaarten" (`yc`, `rc`, tot schorsing, status uit B2), gesorteerd op "dichtst bij schorsing".
- Beide krijgen het zoekveld, de positie- en clubfilter, en "Toon meer" in plaats van een vaste top 15.
- De preset "Kaarten" verschijnt ook in Spelers.

### E4. "Vorm" als gemiddelde (bevestigd door de eigenaar)

**Nu:** `form` in `spelers.js` = de **som** van de punten over de laatste 5 GW's (Vanaken: 30). FPL-spelers lezen "vorm" als een gemiddelde (± 6).
**Moet worden:** vorm = **gemiddelde per speeldag over de laatste 5 GW's** (1 decimaal), en de kolomtitel krijgt als tooltip "Gemiddelde punten per speeldag, laatste 5". Pas `COLUMNS.form`, de sortering in `PlayerPicker` en de spelerskaart mee aan. Oude links met `sort=form` blijven werken.

### E5. Klassement: "Mijn team volgen"

- Bij een zoekresultaat staat een ster: "Dit is mijn team". Die bewaart `{ teamId, naam }` in `localStorage` (`fpl_proleague_my_rank_team_v1`).
- Met een gevolgd team toont Klassement bovenaan meteen: "**Jouw team** · rang 1.234 van 24.156 · 312 pt". Haal dat op via `/api/rankings?type=general&name=<naam>` en kies de rij met dat `teamId`. Daaronder de rang in de laatste speeldag (`type=week`).
- Geen namen van managers (dat blijft zo).

---

## 7b. Fase F: meer halen uit API-Football

**Wat de eigenaar heeft (gecontroleerd op 13 november 2026 met de sleutel uit `.env`):** API-Football **Pro**, limiet **7.500 verzoeken per dag** (vandaag ±65 gebruikt), abonnement actief tot **4 december 2026**. Vandaag gebruikt de site er enkel de uitslagen van, voor de vormvierkantjes (`api/team-form.js`). Voor de Jupiler Pro League (league 144, seizoen 2026) is dit beschikbaar:

| Onderdeel | Beschikbaar? | Gebruiken? |
|---|---|---|
| Uitslagen, kalender, aftraptijden | ja | ja (F4) |
| Officiële opstellingen per wedstrijd (formatie, basis, bank) | ja (getest: STV–ZWA, GW11) | **ja (F3)** |
| Wedstrijdstatistieken per ploeg, inclusief **expected goals (xG)** | ja | **ja (F2)** |
| Spelersstatistieken per wedstrijd: schoten, schoten op doel, key passes, … | ja (niet elk veld altijd gevuld; getest: USG–GNK) | **ja (F1)** |
| Klassement | ja | ja, klein (F4) |
| Bookmakerkansen (clean sheet, doelpuntenmaker, …) | ja, enkele dagen vóór een wedstrijd | **nee, voor later** (beslissing eigenaar, zie §10) |
| Blessures | **nee** (dekking `injuries: false` voor deze competitie) | nee. Niets koppelen. (Blessures in B3 komen uit de gratis Fantasy Pro League-data, niet uit API-Football.) |
| "Predictions" (eigen voorspelmodel van API-Football) | ja | nee: een zwart doosje dat naast de ratings van de eigenaar verwarring geeft |
| Rating per speler (bv. 7.5) | ja | nee: een oordeel van een derde partij leest als een oordeel van @fpl_proleague |

**Technische regels voor heel fase F:**
- Alles via serverfuncties in `api/` met CDN-cache. **De sleutel komt nooit in de browser.** Maak één gedeelde helper `api/_lib/apifootball.js` (time-out, 1 nieuwe poging, `x-apisports-key`) en laat `api/team-form.js` die ook gebruiken.
- Koppeling clubs: hergebruik `CLUB_KEYWORDS` uit `api/team-form.js` (verplaats naar de helper). Koppeling spelers API-Football ↔ Fantasy Pro League: per club, genormaliseerde naam (accenten weg), dan achternaam, dan de bestaande fuzzy-match. Bewaar de gevonden koppeling (in het geheugen van de functie en in de CDN-cache) en geef spelers die niet te koppelen zijn mee in het antwoord (`unmatched`, zoals `/api/team-form` al doet), zodat de eigenaar ze kan nakijken.
- Afgelopen wedstrijden veranderen niet meer: lang cachen (`s-maxage=86400`). Reken in de PR uit hoeveel verzoeken per dag dit kost (verwacht: ruim onder 500 van de 7.500).
- Werkt API-Football niet (of loopt het abonnement af), dan verdwijnt het betrokken blok stil. De rest van de site blijft werken. Zeg in de PR dat de eigenaar de verlenging van 4 december moet nakijken: de vormvierkantjes hangen er nu al van af.

**F1. Schoten, schoten op doel en key passes in Spelers**
- Nieuwe functie (of uitbreiding van `api/players.js`): uit `fixtures/players` per gespeelde wedstrijd **schoten, schoten op doel en key passes** (passes die tot een schot leiden) per speler, per GW (net als `w.pts`). De Fantasy Pro League-data heeft enkel "grote kansen gecreëerd" (`bc`), en dat is een strengere maatstaf. Ontbreekt een veld bij API-Football (`null`), dan telt het als 0 voor die wedstrijd, maar een speler zonder enige koppeling toont "—", geen 0.
- Spelers, preset "Aanval": Schoten · Op doel · Key passes, naast de bestaande kolommen. Werkt met de periodes (laatste 3/5/8) en "Per 90" zoals de rest. Ook in Vergelijken en in de spelerskaart (statstrip of per wedstrijd).
- Kolomtitels met tooltip (3 talen), bv. "Key passes: passes die tot een schot leiden (bron: API-Football)".

**F2. Expected goals (xG) per club**
- Uit `fixtures/statistics` (`expected_goals`) per gespeelde wedstrijd: xG voor en tegen per club. Eén verzoek per wedstrijd, na afloop voorgoed gecachet.
- **Clubkaart:** onder de vormvierkantjes "xG voor / tegen, laatste 5" (bv. "1.8 / 0.9 per wedstrijd"), plus per wedstrijd een klein rijtje (tegenstander · uitslag · xG–xGA), zodat je ziet of een ploeg geluk of pech had.
- Op de FDR-tab niets extra (de ratings blijven die van de eigenaar). **Geen verborgen hulppagina** voor de ratings (beslissing eigenaar).

**F3. Officiële opstellingen op de wedstrijddag**
- Opstellingen verschijnen bij API-Football kort vóór de aftrap. Omdat de deadline vóór de eerste wedstrijd valt, helpen ze niet voor transfers. Wel tijdens het weekend: start mijn speler, moet mijn bank invallen?
- Nieuwe functie `api/lineups.js?gw=12`: per wedstrijd van die GW de officiële basis en bank (gekoppeld aan Fantasy Pro League-spelers), of niets als ze er nog niet zijn. Enkel ophalen tussen ±90 minuten vóór de eerste aftrap en het einde van de laatste wedstrijd van de GW; `s-maxage=120` in dat venster, daarna lang.
- **Verwachte XI's:** een wedstrijd met een officiële opstelling krijgt in de wedstrijdstrip een badge "Officieel". In beide weergaven:
  - wie verwacht was en effectief start: een klein vinkje bij de naam;
  - wie verwacht was maar niet start: naam gedimd + "bank" of "niet in selectie";
  - wie onverwacht start: een regel onder het veld/de rij, "Ook in de basis: X, Y".
  - Het veld zelf wordt niet opnieuw opgebouwd uit de API-opstelling. Zo blijft `PitchField` ongemoeid en heb je geen gedoe met posities.
- Met E1: "Mijn team: Abid start niet (officieel)". Met C (planner): in de bekeken GW krijgt een speler die officieel niet start dezelfde markering op het veld.
- Na de speeldag (vanaf de volgende deadline) verdwijnt alles weer en tonen de Verwachte XI's de nieuwe GW, zoals nu.

**F4. Klein**
- Aftraptijden per wedstrijd uit `fixtures`: in de wedstrijdstrip van de Verwachte XI's en in de tooltip van een FDR-cel ("za 21 nov 18:15"), in Belgische tijd.
- De plaats in het klassement van de echte competitie in de clubkaart (`standings`).

**Niet doen:** bookmakerkansen (voor later), het predictions-endpoint, ratings van API-Football, blessures uit API-Football (niet gedekt), of live punten berekenen (zie §10).

---

## 8. Werkwijze, tests en controle

**Per fase:**
1. Maak een branch **vanaf `functionaliteit/eindresultaat`**: `functionaliteit/fase-a-bugs`, `…-fase-b-data`, `…-fase-c1-planner-model`, enz. De PR gaat naar `functionaliteit/eindresultaat`, niet naar `main` (zie de kop van dit document).
2. Werk in kleine commits met Nederlandse teksten.
3. **Tests:** er is nog geen testopstelling. Voeg in fase A **Vitest** toe (alleen als devDependency, script `npm test`) en test enkel pure functies: `migrateTeamPlannerV1`, `resolveForGw`, `computeTeamPlannerTransferBudget` (met `startGw`), `lineupScore`, de ratings-overrides-migratie, de schorsingslogica, `bonusForMatch` (keeper vs veldspeler) en, in fase F, de koppeling van API-Football-spelers aan Fantasy Pro League-spelers. Geen componenttests nodig.
4. `npm run build` moet slagen (inclusief `build-routes.mjs`).
5. Controleer op de **Vercel-preview** in NL, FR en EN, op 1440 px en op 390 px. Maak voor/na-schermafbeeldingen in `docs/functionaliteit/after/fase-x/`, zoals in deel 1.
6. Schrijf in de PR, in gewone taal, **wat de bezoeker merkt** en **wat de eigenaar zelf moet doen** (bv. de Vercel-firewallregel, of de sheetkolommen die niet meer nodig zijn).

**Volgorde:** A → B → C → D → E → F. A en B zijn klein en maken C eenvoudiger (C6 heeft de beschikbaarheid uit B3 nodig). D en E mogen van volgorde wisselen. In F is elk onderdeel (F1–F4) een eigen PR.

**Eindcontrole vóór de PR naar `main`:** `functionaliteit/eindresultaat` bevat alle goedgekeurde fases en is bijgewerkt met de laatste `main`/redesign (vooral `predictedLineupsData.js` en `constants.js`). `npm run build` en `npm test` slagen, alle tabs zijn in NL/FR/EN gecontroleerd op desktop en gsm, en de migraties zijn getest met echte data van de eigenaar. Stuur de eigenaar de preview-link met een korte checklist van wat hij zelf moet uitproberen.

**Zeker niet doen:**
- Geen eigen "verwachte punten"-model bouwen of zo noemen.
- Geen login, database of Supabase. Alles blijft in de browser.
- Geen import via team-ID proberen: `proleague.code.brussels/team/{id}` antwoordt "Not authenticated".
- Geen managernamen tonen.

---

## 9. Beslissingen van de eigenaar

**Genomen (13 november 2026):**

| # | Vraag | Beslissing |
|---|---|---|
| 1 | Bonuspunten keepers | Keepers kunnen **enkel het duelpunt** halen. De sheet klopt, de API-berekening moet aangepast worden (A6). |
| 2 | Schorsingsregel gele kaarten | **5, 10, 15.** `kaarten.js` klopt al. |
| 3 | Vice-kapitein en plafond gratis transfers | Er is een **vice-kapitein** (bouwen, C2). Het plafond is **3**. |
| 4 | Transfers die een regel breken | **Blokkeren**, met de reden zichtbaar (C4). |
| 5 | Dubbele speeldag in gemiddelden | **Blijft 1** (D1). |
| 6 | "Vergelijk teams" | **Gaat op in de hoofdtabel** (D3). |
| — | Team Planner, bestaande data | **Wie sinds GW1 alles invulde, behoudt alles** en de berekening blijft voor hen gelijk (C1, C9). |
| — | Mijn spelers in de Verwachte XI's | **Ja, in Overzicht én in Veld**, met een subtiele markering (E1). |
| — | Preview | Eerst het **volledige eindresultaat** bekijken op een Vercel-preview, dan pas mergen (kop + §8). |
| 7 | Bonuspunten en Kaarten | **Op de tabel-engine van Spelers** (E3). |
| 8 | Vorm | **Gemiddelde per speeldag**, zoals in FPL (E4). |
| 9 | API-Football | **Wel:** schoten, schoten op doel, key passes (F1), xG per club (F2), officiële opstellingen (F3), aftraptijden en klassement (F4). **Niet:** bookmakerkansen (voor later), een verborgen ratinghulp, blessures uit API-Football (niet in het abonnement). |
| 10 | Keeper-bonusfix (A6) | **Mee in deze rework**, geen aparte hotfix. |

---

## 10. Bewust niet in deze rework (ideeën voor later)

- **Aparte aanvals- en verdedigingsratings** per club (zoals FFS, FFHub en FPL Form). Krachtig, maar het verdubbelt het handwerk van de eigenaar. Pas te overwegen als de ratings ooit uit data berekend worden.
- **Rotatiepartners** (FFS "Sort by Rotation"): kies een keeper of club, en de tabel sorteert de andere clubs op hoe goed hun fixtures aansluiten. Leuk voor keepers, maar niche.
- **Meerdere plannen** (plan A/B) in de planner.
- **Prijswijzigingen:** het spel kent ze niet, dus niet bouwen.
- **Bookmakerkansen** (kans op een clean sheet / om te scoren, uit API-Football; beschikbaar in het Pro-abonnement). Uitgesteld door de eigenaar. Als het ooit gebeurt: enkel percentages tonen, nooit quoteringen, bookmakernamen of links (Belgische regels rond gokreclame), en als aparte weergave naast de ratings van de eigenaar, niet in de plaats ervan.
- **Live punten tijdens een speeldag** (zoals LiveFPL): kan in principe met de gebeurtenissen en spelersstatistieken van API-Football, maar dan moet de volledige puntentelling van Fantasy Pro League nagebouwd worden. Veel werk, en het risico op verkeerde cijfers is groot.

---

## Bronnen (vergelijking §2)

- Fantasy Football Scout: [How to use the Season Ticker for FPL fixture planning](https://www.fantasyfootballscout.co.uk/2025/06/18/how-to-use-the-season-ticker-for-fpl-fixture-planning), [How can I see which teams have the best + worst FPL fixtures?](https://www.fantasyfootballscout.co.uk/2026/07/20/how-can-i-see-which-teams-have-the-best-worst-fpl-fixtures)
- OneFPL: [How to use the OneFPL Transfer Planner](https://onefpl.com/blog/how-to-use-onefpl-transfer-planner)
- FPL Review: [User settings (docs)](https://docs.fplreview.com/the-site/user-settings/)
- FPL Form: [fplform.com](https://www.fplform.com/)
- Overzichten: [FPL Copilot: Best FPL tools 2026/27](https://fplcopilot.com/blog/best-fpl-tools-2026-27) (door een aanbieder geschreven), [allaboutfpl: review Fantasy Football Hub (aug. 2026)](https://allaboutfpl.com/2026/08/complete-detailed-review-of-fantasy-football-hub/)
