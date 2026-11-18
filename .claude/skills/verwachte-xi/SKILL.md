---
name: verwachte-xi
description: De wekelijkse Verwachte XI's van Siebe (@5YSiebee) uit Discord op de site zetten. Gebruik dit wanneer de eigenaar vraagt om "de verwachte XI's", "de lineups van Siebe", "de verwachte opstellingen" te doen, bij te werken of online te zetten (meestal vrijdag rond 15u30, online om 16u).
---

# Verwachte XI's van Siebe online zetten

Siebe post per club een LINEUP11-afbeelding in Discord. Die mogen we overnemen, maar pas online vanaf
het afgesproken moment: normaal **de vrijdag vóór de deadline om 16:00** (zie `--info`). De repo is
openbaar, dus **niets pushen vóór dat moment**: alles blijft lokaal tot dan.

Werk in eenvoudig Nederlands met de eigenaar (geen programmeur). Hou hem kort op de hoogte per stap.

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

## 4. Online zetten op `onlineVanaf` (normaal vrijdag 16:00)

Vraag de eigenaar hoe:

- **Hij is erbij**: op het moment zelf (niet vroeger) `git push -u origin xi/gw<gw>`,
  `gh pr create --base main` (Nederlandse titel/tekst), `gh pr merge --merge --delete-branch`.
- **Automatisch**: maak een eenmalige geplande taak (`create_scheduled_task` met `fireAt` =
  `onlineVanaf`) met een volledig zelfstandige prompt: in deze projectmap nagaan dat branch
  `xi/gw<gw>` bestaat en de opstellingscommit bevat, dan pushen, PR naar `main`, mergen, en daarna
  nakijken dat de live site de nieuwe speeldag toont. De pc en de Claude-app moeten dan aan staan.

Vercel zet `main` binnen een paar minuten live. Controleer daarna
`https://fplproleague.vercel.app/predicted-lineups` (speeldag in de kop) en meld het de eigenaar.

## Opruimen

De bundle en de afbeeldingen blijven in de scratchpad (niet in de repo). Verwijder de bundle uit
Downloads als ze daar nog staat. De privé XI-builder (`predicted-xi.html`) blijft bestaan als
reservemethode, maar is niet meer nodig.
