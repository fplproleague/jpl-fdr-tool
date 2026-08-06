// Eenmalige export van alle opgeslagen lineups als downloadbaar JSON-bestand — bedoeld om, zodra de
// 18 privé-lineups klaar zijn, over te nemen als vaste data voor de publieke Predicted Lineups-tab
// (zie src/predictedLineupsData.js). Exporteert bewust de `drafts`-array ongewijzigd: dat is exact
// dezelfde vorm die loadStoredDrafts()/sanitizeDraft() (storage.js) al opleveren en die de publieke tab
// verwacht — geen aparte schema-vertaling nodig.
export function downloadDraftsAsJson(drafts) {
  const json = JSON.stringify(drafts, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.download = `predicted-xi-lineups-export-${date}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
