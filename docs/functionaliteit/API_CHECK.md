# API-check (17-11-2026)

Wat kunnen we nog ophalen uit onze twee bronnen, en wat is daarvan bruikbaar voor de site?

- **API-Football** (betaald abonnement, plan Pro): 7.500 verzoeken per dag. De check zelf kostte 21 verzoeken; vandaag stond de teller op 143. **Het abonnement loopt af op 4 december 2026**: vernieuwen, anders vallen vorm, xG, schoten, opstellingen en klassement weg.
- **Fantasy Pro League** (`proleague.code.brussels`, de bron achter fantasy.proleague.be): gratis en zonder sleutel.

Bewust **niet** opgevraagd: blessures en afwezigen (beslissing eigenaar; API-Football heeft ze voor de Jupiler Pro League trouwens ook niet), wedkansen, voorspellingen en de "rating" van API-Football (niet onze eigen data, en volgens de spec niet gewenst).

## 1. API-Football: wat er is

| Onderdeel | Wat erin zit (Jupiler Pro League 2026-27) | Nu al gebruikt? |
|---|---|---|
| Wedstrijdstatistieken per club | schoten (op doel, naast, geblokt, in/buiten de zestien), balbezit, hoekschoppen, fouten, buitenspel, reddingen, passes, **xG**, kaarten | ja: xG voor/tegen in de clubkaart |
| Spelersstatistieken per wedstrijd | minuten, schoten, goals, assists, **key passes**, passes en nauwkeurigheid, **tackles, onderscheppingen, blocks, duels (gewonnen)**, dribbels, fouten gemaakt/ondergaan, penalty's (versierd, veroorzaakt, gescoord, gemist, gestopt), reddingen | deels: schoten, schoten op doel en key passes (Spelers, "Aanval") |
| Spelersstatistieken per seizoen | dezelfde lijst, opgeteld, plus leeftijd, lengte, nationaliteit, aantal keer basis/invaller/bank | nee |
| Opstellingen | basis, bank, formatie, rugnummers | ja: Verwachte XI's en Team Planner |
| Wedstrijdverloop | goals (met minuut en assist), kaarten, wissels | nee |
| Wedstrijdgegevens | **scheidsrechter**, stadion, ruststand | nee |
| Clubstatistieken seizoen | vorm, winst/gelijk/verlies thuis en uit, goals per kwartier, **clean sheets thuis/uit**, **wedstrijden zonder te scoren**, penalty's, gebruikte formaties, langste reeksen | ja, enkel de vorm |
| Onderlinge duels | laatste uitslagen tussen twee clubs | nee |
| Klassement | plaats, punten, doelsaldo, thuis/uit, vorm | ja: clubkaart |
| Kernen | alle spelers per club met rugnummer | nee |
| Transfers | alle transfers per club (34 sinds juni 2026) | nee |
| Topschutters, assists, kaarten | top 20 | nee (staat al in onze eigen data) |
| Trainers, stadions | naam, foto / capaciteit | nee |

## 2. Fantasy Pro League: wat er is

Gebruikt: spelers, spelersstatistieken, speler per ID, clubs, wedstrijden, deadlines, bevestigde punten, klassementen en minicompetities.

Nog niet gebruikt en publiek:
- **`players-weekly-top`**: de beste speler van elke speeldag (naam en punten), bv. GW1 Araujo 16, GW2 Mechele 17.
- `match/{id}`: één wedstrijd met de uitslag. Geeft niets meer dan wat we al hebben.

Niet bruikbaar: `teams` (geeft "geen toegang") en alles rond een eigen account (team, transfers, inloggen, betalen). Dat vraagt een login en hoort niet op onze site.

## 3. Ideeën, van meest naar minst nuttig

De kost is per speeldag, met de buffer (cache) die we nu ook gebruiken. Alles samen blijft ver onder de daglimiet.

| Idee | Waar op de site | Bron | Kost |
|---|---|---|---|
| **Defensieve stats**: tackles, onderscheppingen, blocks, duels gewonnen per speler | Spelers, preset "Verdediging" | spelers per wedstrijd | 0 extra: zit al in de opvraging voor de schoten, we bewaren nu enkel minder velden |
| **Clean sheets thuis/uit en "zonder te scoren"** per club | clubkaart, FDR-tooltip | clubstatistieken | 18 per verversing (1 per club), 1× per dag volstaat |
| **Scheidsrechter** per wedstrijd (met zijn gemiddeld aantal kaarten) | FDR-tooltip, wedstrijdstrip XI's | wedstrijden | 1 per speeldag |
| **Speler van de week** (beste score per speeldag) | spelerskaart (badge), Spelers | Fantasy Pro League | 0 (gratis bron) |
| **Penalty's versierd/veroorzaakt** per speler | Spelers, preset "Aanval" | spelers per wedstrijd | 0 extra (zelfde vraag als het eerste idee) |
| **Goals per kwartier** per club (scoort laat, krijgt laat goals) | clubkaart | clubstatistieken | 0 extra (zelfde vraag als clean sheets) |
| **Onderlinge duels** (laatste 5) | FDR-tooltip | onderlinge duels | ~9 per speeldag |
| **Rugnummers** | spelerskaart | kernen | 18, 1× per week |
| **Transfers** van/naar de Pro League | aparte lijst of spelerskaart | transfers | 18 per dag |

Minder nuttig: topschutters/assists/kaarten (staat al in onze eigen data), trainers en stadions (geen invloed op fantasy).

## 4. Hoe de check gebeurde

Een script vroeg elk onderdeel één keer op met de sleutel uit `.env` (die sleutel kwam niet in het script of in de uitvoer), en schreef per onderdeel op welke velden er terugkwamen. Voor Fantasy Pro League werd gekeken welke adressen de officiële spelsite zelf gebruikt, en de publieke daarvan werden opgevraagd.
