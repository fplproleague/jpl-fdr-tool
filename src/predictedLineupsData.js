// Vaste data voor de publieke "Predicted Lineups"-tab (zie src/tabs/PredictedLineupsTab.jsx) — zelfde
// conventie als TEAMS/FIXTURES in constants.js: gewoon een statische constante, geen fetch, geen
// bewerkbare state.
//
// Elke entry heeft exact dezelfde vorm als een record uit de privé Predicted XI Builder's opgeslagen
// lineups (zie loadStoredDrafts()/sanitizeDraft() in src/predicted-xi/storage.js): clubCode,
// opponentCode, formationKey, formationLabelOverride, slots (met per slot playerName/playerTeamCode/
// playerPosition/playerPrice/safety/positionId/xPercent/yPercent), notes.
//
// Nog leeg: de 18 club-lineups worden eerst in de privé-tool (/predicted-xi.html) samengesteld en dan
// via de "Exporteer alle lineups"-knop (DraftsPanel.jsx) als JSON gedownload — die JSON komt hier dan
// gewoon in te staan. Tot dan toont de tab een lege-staat-melding.
export const PREDICTED_LINEUPS = [];
