// Rangschikkingslogica voor de "Bonuspunten"-tab (zie src/tabs/BonuspuntenTab.jsx). Losse module, niet
// in constants.js: functionaliteit specifiek voor deze ene tab, geen gedeelde app-brede data (zelfde
// opzet als predicted-xi/formations.js e.a.).

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

const TOP_N = 15;
const byName = (a, b) => a.player.localeCompare(b.player);

// Deterministische Top-15-rangschikkingen — elke sort-functie eindigt altijd op spelersnaam als laatste
// tiebreaker, zodat de volgorde nooit afhangt van de (willekeurige) rijvolgorde in de sheet.
export function rankByDuels(entries) {
  return [...entries]
    .sort((a, b) => b.duelDiff - a.duelDiff || b.duelsWon - a.duelsWon || byName(a, b))
    .slice(0, TOP_N);
}

export function rankByDefensiveHeaders(entries) {
  return [...entries]
    .sort((a, b) => b.defensiveHeaders - a.defensiveHeaders || byName(a, b))
    .slice(0, TOP_N);
}

export function rankByRecoveries(entries) {
  return [...entries]
    .sort((a, b) => b.recoveries - a.recoveries || byName(a, b))
    .slice(0, TOP_N);
}

export function rankByBigChances(entries) {
  return [...entries]
    .sort((a, b) => b.bigChances - a.bigChances || byName(a, b))
    .slice(0, TOP_N);
}

export function rankByBonusPoints(entries) {
  return [...entries]
    .sort((a, b) => b.bonusPoints - a.bonusPoints || byName(a, b))
    .slice(0, TOP_N);
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
