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
      };
    });
}

const TOP_N = 15;
const byName = (a, b) => a.player.localeCompare(b.player);

// Deterministische rangschikkingen — elke sort-functie eindigt altijd op spelersnaam als laatste
// tiebreaker, zodat de volgorde nooit afhangt van de (willekeurige) rijvolgorde in de sheet. `limit`
// (default TOP_N, de secties in BonuspuntenTab.jsx tonen enkel de top 15) is optioneel opgehoogd zodat
// findPlayerBonusStats hieronder dezelfde comparators kan hergebruiken op de VOLLEDIGE rangschikking, om
// ook een speler buiten de top 15 zijn exacte plaats te kunnen tonen.
export function rankByDuels(entries, limit = TOP_N) {
  return [...entries]
    .sort((a, b) => b.duelDiff - a.duelDiff || b.duelsWon - a.duelsWon || byName(a, b))
    .slice(0, limit);
}

export function rankByDefensiveHeaders(entries, limit = TOP_N) {
  return [...entries]
    .sort((a, b) => b.defensiveHeaders - a.defensiveHeaders || byName(a, b))
    .slice(0, limit);
}

export function rankByRecoveries(entries, limit = TOP_N) {
  return [...entries]
    .sort((a, b) => b.recoveries - a.recoveries || byName(a, b))
    .slice(0, limit);
}

export function rankByBigChances(entries, limit = TOP_N) {
  return [...entries]
    .sort((a, b) => b.bigChances - a.bigChances || byName(a, b))
    .slice(0, limit);
}

export function rankByBonusPoints(entries, limit = TOP_N) {
  return [...entries]
    .sort((a, b) => b.bonusPoints - a.bonusPoints || byName(a, b))
    .slice(0, limit);
}

// De 4 statistische bonuspunt-criteria (zie ook de sectietitels in BonuspuntenTab.jsx) — apart
// geëxporteerd zodat de rij-highlight in de UI en de tekst in de titel altijd exact dezelfde grens
// gebruiken.
export const BONUS_CRITERIA = {
  duels: entry => entry.duelDiff > 0,
  defensiveHeaders: entry => entry.defensiveHeaders > 3,
  recoveries: entry => entry.recoveries > 5,
  bigChances: entry => entry.bigChances > 1,
};

// Zoekt de bonuspunten-info + exacte rangschikkingsplaats per categorie op voor één speler, ongeacht of
// die wel/niet in de top 15 van een sectie staat — gebruikt door de zoekbalk in BonuspuntenTab.jsx.
// `target` is een ruwe speler zoals PlayerSearchInput die teruggeeft (uit playerDatabase, met .name/
// .teamCode), geen bonuspunten-entry — vandaar de match op player/clubCode i.p.v. object-gelijkheid.
export function findPlayerBonusStats(entries, target) {
  if (!target?.name) return null;
  const entry = entries.find(e => e.player === target.name && e.clubCode === target.teamCode);
  if (!entry) return null;
  const rankOf = (fullRanking) => fullRanking.findIndex(e => e === entry) + 1;
  return {
    entry,
    totalPlayers: entries.length,
    duelsRank: rankOf(rankByDuels(entries, Infinity)),
    defensiveHeadersRank: rankOf(rankByDefensiveHeaders(entries, Infinity)),
    recoveriesRank: rankOf(rankByRecoveries(entries, Infinity)),
    bigChancesRank: rankOf(rankByBigChances(entries, Infinity)),
    bonusPointsRank: rankOf(rankByBonusPoints(entries, Infinity)),
  };
}
