// Rangschikkingslogica voor de "Bonuspunten"-tab (zie src/tabs/BonuspuntenTab.jsx). Losse module, niet
// in constants.js: functionaliteit specifiek voor deze ene tab, geen gedeelde app-brede data (zelfde
// opzet als predicted-xi/formations.js e.a.).

import { assignCompetitionRanks } from './ranking';

// Zet de gedeelde spelersdatabank (playerDatabase, zie parsePlayerDatabaseCsv in constants.js — al elders
// in FDRTool.jsx opgehaald/geparset, geen eigen fetch/parsing meer nodig hier) om naar genormaliseerde
// Bonuspunten-rijen. Spelers zonder naam (zou niet moeten voorkomen na parsePlayerDatabaseCsv's eigen
// filter, maar defensief) worden genegeerd.
export function buildBonuspuntenEntries(playerDatabase) {
  return playerDatabase
    .filter(p => p.name)
    .map(p => {
      const duelsWon = p.duelsWon ?? 0;
      const duelsLost = p.duelsLost ?? 0;
      return {
        player: p.name,
        clubCode: p.teamCode,
        clubName: p.teamName,
        duelsWon,
        duelsLost,
        duelDiff: duelsWon - duelsLost,
        defensiveHeaders: p.headers ?? 0,
        recoveries: p.recoveries ?? 0,
        bigChances: p.bigChances ?? 0,
        bonusPoints: p.bonusPoints ?? 0,
        games: p.games ?? 0,
      };
    });
}

export const TOP_N = 15;
const byName = (a, b) => a.player.localeCompare(b.player);

// De twee manieren waarop elke rangschikking gesorteerd kan worden.
//
// Waarom dit er is: de lijsten rangschikten altijd op seizoenstotaal, terwijl de tweede regel van elke
// rij de per-wedstrijd-waarde toont. Dat zijn twee verschillende antwoorden op twee verschillende
// vragen. Voor fantasy is de per-wedstrijd-waarde meestal de nuttigste — ze zegt iets over wat een
// speler de VOLGENDE speeldag waarschijnlijk doet — terwijl het totaal vooral wie het meest gespeeld
// heeft beloont. Een speler die één match miste zakte daardoor onterecht weg. De gebruiker kiest nu
// zelf welke vraag hij stelt.
export const SORT_MODES = { total: 'total', perMatch: 'perMatch' };

// Ondergrens om in de per-wedstrijd-rangschikking mee te tellen. Zonder zo'n grens wint de lijst altijd
// door wie precies één (goede) wedstrijd speelde: één match van 7 recoveries wordt dan 7.00/wedstrijd en
// staat bovenaan. De helft van het hoogste aantal gespeelde wedstrijden in de data (naar boven afgerond)
// schuift vanzelf mee met het seizoen, dus geen hardcoded getal dat elke speeldag opnieuw klopt of niet.
export function minGamesForPerMatch(entries) {
  const maxGames = entries.reduce((max, e) => Math.max(max, e.games ?? 0), 0);
  return Math.max(1, Math.ceil(maxGames / 2));
}

// Gedeelde sorteerkern voor alle vijf de rangschikkingen. `pick` haalt de ruwe statistiek uit een entry.
// In perMatch-modus vallen spelers onder de wedstrijddrempel volledig weg (niet: onderaan), want een
// rangschikking met onbetrouwbare waarden erin is misleidender dan een kortere lijst. Het seizoenstotaal
// blijft in beide modi de eerste tiebreaker, en de spelersnaam altijd de laatste — zodat de volgorde
// nooit afhangt van de (willekeurige) rijvolgorde in de sheet.
// Geeft de VOLLEDIGE gesorteerde lijst terug, met een .rank per entry — niet meer meteen de top 15.
// Die begrenzing zit nu in BonuspuntenTab.jsx, want ze hangt af van wat de gebruiker vraagt: zonder
// filter blijft het een top 15, maar wie op zijn eigen ploeg of watchlist filtert wil ál zijn spelers
// zien, ook die op plaats 47 — en dan is juist die rang de informatie.
//
// De rang komt van assignCompetitionRanks (ranking.js) en gebruikt de score waarop ook gesorteerd is:
// in per-wedstrijd-modus de waarde per wedstrijd, anders het seizoenstotaal. Dat is precies het cijfer
// dat groot in de rij staat, zodat twee rijen met hetzelfde cijfer ook dezelfde rang krijgen. De
// tiebreakers (meeste duels gewonnen, naam) bepalen nog de volgorde binnen een ex aequo — ergens
// moeten ze staan — maar niet langer het nummer ervoor.
function rankBy(entries, pick, sortMode, minGames, tiebreak = () => 0) {
  const perMatchMode = sortMode === SORT_MODES.perMatch;
  const pool = perMatchMode ? entries.filter(e => (e.games ?? 0) >= minGames) : entries;
  const score = perMatchMode ? (e => (e.games ? pick(e) / e.games : 0)) : pick;
  const sorted = [...pool]
    .sort((a, b) => score(b) - score(a) || pick(b) - pick(a) || tiebreak(a, b) || byName(a, b));
  return assignCompetitionRanks(sorted, score);
}

// sortMode/minGames zijn optioneel met een default op het oude gedrag (sorteren op seizoenstotaal),
// zodat bestaande aanroepen met enkel `entries` ongewijzigd blijven werken.
export function rankByDuels(entries, sortMode = SORT_MODES.total, minGames = 1) {
  // Bij een gelijk duelverschil telt wie de meeste duels gewonnen heeft (bestaand gedrag): 41-12 is een
  // sterkere prestatie dan 70-41, ook al is het verschil even groot.
  return rankBy(entries, e => e.duelDiff, sortMode, minGames, (a, b) => b.duelsWon - a.duelsWon);
}

export function rankByDefensiveHeaders(entries, sortMode = SORT_MODES.total, minGames = 1) {
  return rankBy(entries, e => e.defensiveHeaders, sortMode, minGames);
}

export function rankByRecoveries(entries, sortMode = SORT_MODES.total, minGames = 1) {
  return rankBy(entries, e => e.recoveries, sortMode, minGames);
}

export function rankByBigChances(entries, sortMode = SORT_MODES.total, minGames = 1) {
  return rankBy(entries, e => e.bigChances, sortMode, minGames);
}

export function rankByBonusPoints(entries, sortMode = SORT_MODES.total, minGames = 1) {
  return rankBy(entries, e => e.bonusPoints, sortMode, minGames);
}

// Subtiele "per wedstrijd"-waarde naast een hoofdstatistiek (zie RankingRow's valueSub-prop en
// BonusStatTile in BonuspuntenTab.jsx) — null zolang games onbekend/0 is (bv. de Games-kolom nog niet
// ingevuld voor deze speler), zodat de UI nooit een misleidende "0.00/wedstrijd" toont i.p.v. gewoon
// niets. showSign herhaalt het '+'-teken van de hoofdwaarde bij Duels (waar het verschil ook negatief
// kan zijn); de andere statistieken zijn altijd >= 0, dus daar nooit een teken nodig. `unit` laat de
// aanroeper de vertaalde eenheid meegeven (t('bonuspunten.perMatchUnit')) i.p.v. hardcoded Nederlands.
export function perGameLabel(value, games, { showSign = false, unit = '/wedstrijd' } = {}) {
  if (!games) return null;
  const perGame = value / games;
  const sign = showSign && perGame > 0 ? '+' : '';
  return `${sign}${perGame.toFixed(2)}${unit}`;
}

// Drempelwaarden voor de 4 bonuspunt-categorieën, als kale getallen (zie ook de sectietitels in
// BonuspuntenTab.jsx: "... (> 3)" e.d.) — apart van BONUS_CRITERIA hieronder zodat dezelfde drempel ook
// op de PER WEDSTRIJD-waarde toegepast kan worden (zie meetsThresholdPerGame), niet enkel op de
// seizoenstotaal.
export const BONUS_THRESHOLD = {
  duels: 0,
  defensiveHeaders: 3,
  recoveries: 5,
  bigChances: 1,
};

// De 4 statistische bonuspunt-criteria — apart geëxporteerd zodat de rij-highlight in de UI en de tekst
// in de titel altijd exact dezelfde grens gebruiken.
export const BONUS_CRITERIA = {
  duels: entry => entry.duelDiff > BONUS_THRESHOLD.duels,
  defensiveHeaders: entry => entry.defensiveHeaders > BONUS_THRESHOLD.defensiveHeaders,
  recoveries: entry => entry.recoveries > BONUS_THRESHOLD.recoveries,
  bigChances: entry => entry.bigChances > BONUS_THRESHOLD.bigChances,
};

// Of de PER WEDSTRIJD-waarde van een statistiek minstens de bonuspunt-drempel haalt (>=, i.p.v. de
// striktere '>' van BONUS_CRITERIA hierboven, dat op de seizoenstotaal werkt) — gebruikt om de per-
// wedstrijd-tekst in de spelerskaart (BonuspuntenTab.jsx) cyaan te kleuren als "op koers"-indicator.
// false zolang games onbekend/0 is (net als perGameLabel hierboven).
export function meetsThresholdPerGame(value, games, threshold) {
  return !!games && value / games >= threshold;
}

// Zoekt de bonuspunten-entry op voor één speler, ongeacht of die wel/niet in de top 15 van een sectie
// staat — gebruikt door de zoekbalk in BonuspuntenTab.jsx. `target` is een ruwe speler zoals
// PlayerSearchInput die teruggeeft (uit playerDatabase, met .name/.teamCode), geen bonuspunten-entry —
// vandaar de match op player/clubCode i.p.v. object-gelijkheid.
export function findPlayerBonusEntry(entries, target) {
  if (!target?.name) return null;
  return entries.find(e => e.player === target.name && e.clubCode === target.teamCode) ?? null;
}
