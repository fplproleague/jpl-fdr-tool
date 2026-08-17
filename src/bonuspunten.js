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

// De 4 statistische bonuspunt-criteria (zie ook de sectietitels in BonuspuntenTab.jsx) — apart
// geëxporteerd zodat de rij-highlight in de UI en de tekst in de titel altijd exact dezelfde grens
// gebruiken.
export const BONUS_CRITERIA = {
  duels: entry => entry.duelDiff > 0,
  defensiveHeaders: entry => entry.defensiveHeaders > 3,
  recoveries: entry => entry.recoveries > 5,
  bigChances: entry => entry.bigChances > 1,
};
