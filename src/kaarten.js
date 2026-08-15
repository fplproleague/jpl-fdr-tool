// Schorsingslogica + sorteerfuncties voor de "Kaarten"-tab (zie src/tabs/KaartenTab.jsx). Losse module,
// niet in constants.js: functionaliteit specifiek voor deze ene tab (zelfde opzet als bonuspunten.js).

// --- Schorsingsdrempels: aparte configuratielaag, los van de parsing/sorteerlogica hieronder ---
//
// Voor nu enkel de reguliere competitie: elke SUSPENSION_PHASES.regular.cycleLength gele kaarten (5)
// levert een nieuwe schorsing op (5, 10, 15, 20, ...) — de standaard cumulatieve cyclus in het Belgische
// profvoetbal. Een latere fase met een ander systeem (bv. play-offs) hoeft enkel hier een nieuwe entry te
// krijgen (of nextSuspensionThreshold() een eigen tak voor die fase) — de rest van deze module en
// KaartenTab.jsx roepen enkel nextSuspensionThreshold()/cardsUntilSuspension() aan en hoeven dus niet te
// veranderen. Nog geen play-off-fase toegevoegd: dat is nu nog niet nodig (zie project-instructies), maar
// deze opzet maakt dat later toevoegen een lokale wijziging i.p.v. een herschrijving van de tracker.
export const SUSPENSION_PHASES = {
  regular: { cycleLength: 5 },
};

// Eerstvolgende drempel STRIKT BOVEN het huidige aantal kaarten. Bewust "strikt boven" i.p.v. "op of
// boven": bij exact 5 (of 10, 15, ...) heeft de speler die drempel al gehaald (de schorsing is al verwerkt
// vóór de volgende speeldag), dus is de eerstvolgende drempel de daaropvolgende cyclus, niet dezelfde.
// Voorbeelden (cycleLength 5): 4 -> 5, 9 -> 10, exact 5 -> 10 (niet 5), exact 10 -> 15 (niet 10).
export function nextSuspensionThreshold(cards, phase = 'regular') {
  const { cycleLength } = SUSPENSION_PHASES[phase] ?? SUSPENSION_PHASES.regular;
  return (Math.floor(cards / cycleLength) + 1) * cycleLength;
}

export function cardsUntilSuspension(cards, phase = 'regular') {
  return nextSuspensionThreshold(cards, phase) - cards;
}

// Zet de gedeelde spelersdatabank (playerDatabase, zie parsePlayerDatabaseCsv in constants.js — al
// elders in FDRTool.jsx opgehaald/geparset, geen eigen fetch/parsing meer nodig hier) om naar
// genormaliseerde Kaarten-rijen, met de schorsingsberekening er meteen bij (nextThreshold/cardsRemaining)
// — playerDatabase bevat enkel het rauwe aantal kaarten (yellowCards), nooit de drempel/resterend-
// kolommen zelf; die worden hier altijd herberekend. Spelers zonder naam (zou niet moeten voorkomen na
// parsePlayerDatabaseCsv's eigen filter, maar defensief) worden genegeerd.
export function buildKaartenEntries(playerDatabase) {
  return playerDatabase
    .filter(p => p.name)
    .map(p => {
      const cards = p.yellowCards ?? 0;
      const nextThreshold = nextSuspensionThreshold(cards);
      return {
        player: p.name,
        clubCode: p.teamCode,
        clubName: p.teamName,
        cards,
        nextThreshold,
        cardsRemaining: nextThreshold - cards,
      };
    });
}

const byName = (a, b) => a.player.localeCompare(b.player);

// "Meeste gele kaarten" (standaard): kaarten dalend, dan naam.
export function rankByMostCards(entries) {
  return [...entries].sort((a, b) => b.cards - a.cards || byName(a, b));
}

// "Dichtst bij schorsing": minst kaarten-tot-schorsing eerst, dan (bij gelijke afstand) de speler met de
// meeste kaarten eerst, dan naam. Zuiver sorteren op totaal aantal kaarten volstaat niet — een speler op
// 4 kaarten (1 tot schorsing) staat hier vóór een speler op 6 kaarten (4 tot de volgende schorsing op 10).
export function rankByClosestToSuspension(entries) {
  return [...entries].sort((a, b) =>
    a.cardsRemaining - b.cardsRemaining || b.cards - a.cards || byName(a, b));
}

// Subtiele waarschuwing: nog maar 1 kaart verwijderd van de eerstvolgende schorsing — geldt voor élke
// cyclus (4->5, 9->10, 14->15, ...), niet enkel de allereerste, want "nog 1 kaart nodig" is precies
// even relevant bij elke latere drempel.
export function isOneCardFromSuspension(entry) {
  return entry.cardsRemaining === 1;
}
