---
name: verwachte-xi
description: De wekelijkse Verwachte XI's van Siebe (@5YSiebee) uit Discord op de site zetten. Gebruik dit wanneer de eigenaar vraagt om "de verwachte XI's", "de lineups van Siebe", "de verwachte opstellingen" te doen, bij te werken of online te zetten (meestal vrijdag rond 15u30, online om 16u).
---

# Verwachte XI's van Siebe online zetten

Siebe post per club een LINEUP11-afbeelding in Discord. Die mogen we overnemen, maar pas online vanaf
het afgesproken moment: normaal **de vrijdag vóór de deadline om 16:00** (zie `--info`). De repo is
openbaar, dus **niets pushen vóór dat moment**: alles blijft lokaal tot dan.

Werk in eenvoudig Nederlands met de eigenaar (geen programmeur). Hou de eigenaar per stap kort op de hoogte.

## 0. Voorbereiden

1. `npm run lineups -- --info` → de speeldag (`gw`), `onlineVanaf` en `since`. Klopt `gw` niet
   (bv. de eigenaar werkt vooruit), gebruik `--gw <n>`.
2. Nieuwe branch vanaf de laatste `main`: `git fetch origin && git switch -c xi/gw<gw> origin/main`
   (werkmap moet schoon zijn; staat er ander werk, vraag het eerst).
3. Nodig bij de eigenaar: Chrome open, ingelogd op Discord, Claude in Chrome verbonden.

## 1. De afbeeldingen ophalen (Claude in Chrome)

1. Laad de Chrome-tools in één ToolSearch (tabs_context_mcp, tabs_create_mcp, navigate, computer,
   javascript_tool, tabs_close_mcp). `tabs_context_mcp`, dan een nieuw tabblad.
2. Open het kanaal **#line-ups** van de server **JPL - Sorare - English**:
   `https://discord.com/channels/1229534375054409940/1275021240431542333`
   (vind je het niet: Ctrl+K in Discord, "line-ups").
3. Lees `scripts/lineups/discord-collect.js`, zet `SINCE` op de `since` uit stap 0 en voer de
   volledige tekst uit met javascript_tool, met `await ` ervoor. Herhaal tot `done=true`.
   De samenvatting toont per club het gekozen bericht, de "X VS Y"-regel en waarschuwingen.
   - "GEEN afbeelding gevonden": Siebe postte die club (nog) niet, of scrol nog verder. Meld het.
   - "nieuwer bericht zonder afbeelding": vaak een tekst-update ("X is out, Y replaces him").
     Die update geldt boven de afbeelding: verwerk ze en zeg het aan de eigenaar.
4. Zet `DOWNLOAD = true` en voer het nog eens uit. Dat downloadt **één** bestand
   `xi-bundle-<datum>.json` naar de Downloads-map (Chrome blokkeert meerdere downloads na elkaar).
   Het snippet geeft nooit links terug (de extensie blokkeert die toch).
5. Verplaats het bestand naar de scratchpad en pak het uit:
   `node scripts/lineups/unpack-bundle.mjs <bundle> <scratchpad>/xi-gw<gw>`
   → `CLU.png`, ... en `berichten.txt`. Sluit daarna het Chrome-tabblad.

## 2. De afbeeldingen lezen

Lees elke afbeelding met de Read-tool (volle resolutie; je kan ze parallel lezen) en `berichten.txt`.
Schrijf `<scratchpad>/xi-gw<gw>/invoer.json`:

```json
{
  "gw": 12,
  "lineups": {
    "CLU": { "vs": "Anderlecht", "formation": "4-3-3",
             "players": ["Sommer", "Seys", "Mechele", "Spileers 20%", "Sabbe", "Vetlesen",
                         "Lemarechal 30%", "Vanaken", "Diakhon 30%", "Tresoldi", "Forbs"] }
  }
}
```

- `vs`: de tegenstander onder de clubnaam op de afbeelding ("VS Anderlecht"). Het script vergelijkt
  die met de kalender en weigert een oude of Europese opstelling.
- **Leesrichting**: de keeper staat onderaan, de aanval bovenaan; links op de afbeelding is links.
- `players`: exact 11 namen zoals op de afbeelding, in de volgorde van de formatie:

  | formatie | volgorde |
  |---|---|
  | 4-3-3 | GK, LB, LCB, RCB, RB, LCM, CM, RCM, LW, ST, RW |
  | 4-2-3-1 | GK, LB, LCB, RCB, RB, LDM, RDM, LAM, CAM, RAM, ST |
  | 4-4-2 | GK, LB, LCB, RCB, RB, LM, LCM, RCM, RM, LST, RST |
  | 3-5-2 | GK, LCB, CCB, RCB, LWB, LCM, CM, RCM, RWB, LST, RST |
  | 3-4-3 | GK, LCB, CCB, RCB, LM, LCM, RCM, RM, LW, ST, RW |
  | 5-3-2 | GK, LB, LCB, CCB, RCB, RB, LCM, CM, RCM, LST, RST |

  Een 4-3-3 met één diepe en twee hogere middenvelders blijft 4-3-3 (CM = de middelste). Gebruikt
  Siebe een vorm die hier niet staat (bv. 4-1-4-1, 3-4-1-2), kies de dichtstbijzijnde en meld het.
- **Percentages**: staat onder een speler "30% Rowe", schrijf `"Nzita 30%"`. Staan er meerdere
  ("20% Sikan - 20% Bentayeb"), tel ze op: `"Cvetkovic 40%"`. Het script maakt er de kleur van:
  geen % = zeker, tot 20% = starter, tot 35% = twijfel, meer = risico.
- Twijfel je over een naam of cijfer: raad niet. Bekijk de afbeelding opnieuw (Read) en zet het
  anders bij de vragen aan de eigenaar.

## 3. Controleren en wegschrijven

1. `npm run lineups -- <invoer.json> --check`
   - `[fout]` moet opgelost: een naam die niet in het spel zit (bv. een nieuwe speler die Fantasy
     Pro League nog niet heeft), een verkeerd aantal spelers, een ontbrekende club, een verkeerde
     tegenstander. Voor een speler die niet in het spel zit: stel de eigenaar een keuze voor
     (de alternatieve speler van de afbeelding als die wel in het spel zit, of een andere) en vraag het.
     Blijkt het dezelfde speler onder een andere naam (Siebe's "Ayensa" = Dennis Eckert), voeg die
     koppeling toe aan `scripts/lineups/nameAliases.js` en commit ze mee, zodat het script ze
     voortaan zelf kent.
   - `[nakijken]`: het script koppelde een naam aan een speler die niet exact zo heet
     ("Nunes" → Erick). Kijk of dat klopt; meestal wel.
2. Alles in orde: `npm run lineups -- <invoer.json>`. Dat herschrijft `src/predictedLineupsData.js`
   en zet `PREDICTED_LINEUPS_GW` in `src/constants.js`.
3. Bekijk het lokaal: preview_start "dev", open `/predicted-lineups`. Controleer: de speeldag in de
   kop, alle wedstrijden, een paar clubs aanklikken, geen fouten in de console (502/500 van de
   API-Football-functies zijn lokaal normaal: daar is geen sleutel voor). Toon de eigenaar een
   screenshot en een korte lijst: wat je moest kiezen of raden, en de twijfelgevallen.
4. Correcties van de eigenaar ("Kortrijk: X moet Y zijn") verwerk je in `invoer.json` en je draait
   stap 3.1-3.2 opnieuw.
5. Commit lokaal (niet pushen!): `git add src/predictedLineupsData.js src/constants.js` en een
   Nederlandse commit "Voorspelde opstellingen bijgewerkt naar GW<gw>" met de controles in de tekst.

## 4. Automatisch online zetten op `onlineVanaf` (normaal vrijdag 16:00)

Standaard (keuze van de eigenaar): **automatisch mergen om `onlineVanaf`**, niet vroeger. Maak meteen
na de lokale commit een eenmalige geplande taak met `create_scheduled_task`:

- `taskId`: `verwachte-xi-gw<gw>-online`, `title`: "Verwachte XI's GW<gw> online", `fireAt`: `onlineVanaf`
  met Belgische offset (bv. `2026-11-20T16:00:00+01:00`).
- `prompt` (volledig zelfstandig, vul de waarden in):

  > Zet de Verwachte XI's van GW<gw> online. Werkmap: `<absoluut pad van deze repo>`.
  > 1. Controleer dat lokale branch `xi/gw<gw>` bestaat en een commit "Voorspelde opstellingen
  >    bijgewerkt naar GW<gw>" bevat die nog niet in `origin/main` zit (`git fetch` eerst). Is die al
  >    gemerged: stop en meld dat. Ontbreekt die: stop en meld dat, niets anders doen.
  > 2. `git push -u origin xi/gw<gw>`, dan `gh pr create --base main --head xi/gw<gw>` met titel
  >    "Verwachte XI's GW<gw>" en een korte Nederlandse tekst, dan `gh pr merge --merge --delete-branch`.
  > 3. Wacht tot Vercel klaar is en controleer dat `https://fplproleague.vercel.app/predicted-lineups`
  >    "GW<gw>" toont en niet meer de aankondiging "verschijnen vrijdag". Meld het resultaat kort in
  >    eenvoudig Nederlands. Pas geen andere bestanden aan.

- Lees het antwoord van de tool: als de taak niet in een modus zonder toestemmingsvragen is
  opgeslagen, zeg de eigenaar dat er om 16u misschien een vraag om toestemming verschijnt.
- Zeg de eigenaar: de pc en de Claude-app moeten om 16u aan staan (anders loopt de taak pas bij het
  volgende opstarten, dus te laat).
- Komen er na de commit nog correcties: verwerk ze in een extra commit op dezelfde branch; de taak
  pusht dan gewoon alles.

Wil de eigenaar het toch zelf doen: op het moment zelf (niet vroeger) dezelfde stappen 2-3.

## 5. Tekst voor de X-post

Om 16u post de eigenaar een vaste tekst op X. Lever die mee na stap 3, in een codeblok om te kopiëren:

```
🚨 De 18 voorspelde lineups van @5YSiebee staan op de website!

Link hieronder en in bio 📎

Belangrijkste updates:

❌ Spelers die out of geschorst zijn
❌ <speler> (<club>) – <reden, als Siebe die geeft>

❓ Spelers die twijfelachtig zijn
❓ <speler> (<club>) – <reden, als Siebe die geeft>

✅ Spelers die terug beschikbaar zijn na twijfel of blessure.
✅ <speler> (<club>) – <reden, als Siebe die geeft>

#FantasyProLeague #JPL
```

- Pas "18" aan als er minder clubs zijn (bv. een uitgestelde wedstrijd).
- **Bron**: het overzicht "Voor de X-post" dat `npm run lineups` toont (wie viel weg, wie twijfelt,
  wie is terug, met prijs en eigendom) samen met Siebe's tekst in `berichten.txt` (de blokken
  Injured, Suspended, Doubtful en de uitleg). Een reden vermeld je enkel als Siebe ze geeft;
  verzin nooit een blessure of schorsing. Wie gewoon naar de bank gaat (rotatie) is geen ❌.
- **Enkel relevante spelers**: bekende spelers (rond 8M of meer) of eigendom hoger dan 5%.
  Hoogstens 3-4 per categorie, de belangrijkste eerst. Een lege categorie laat je weg.
- ❓: fitheidstwijfels uit Siebe's "Doubtful" en veelgekozen spelers (rond 10% eigendom of meer)
  die nu op risico (40% of meer) staan, met "startplaats onzeker".
- Clubnamen kort zoals de eigenaar ze schrijft (Club Brugge, Anderlecht, Genk, Union, STVV, ...).
  Spelling nakijken (zie ook de skill fpl-content-style). Vermeld hoeveel tekens het is: meer dan
  280 lukt enkel met X Premium.

Vercel zet `main` binnen een paar minuten live. Na de geplande taak krijg je een melding: controleer
dan `https://fplproleague.vercel.app/predicted-lineups` (speeldag in de kop) en meld het de eigenaar.

## Opruimen

De bundle en de afbeeldingen blijven in de scratchpad (niet in de repo). Verwijder de bundle uit
Downloads als ze daar nog staat. De privé XI-builder (`predicted-xi.html`) blijft bestaan als
reservemethode, maar is niet meer nodig.
