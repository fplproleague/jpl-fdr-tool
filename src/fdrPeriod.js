// Fase D: één periode voor de hele FDR-pagina (hoofdtabel, Σ en "Beste fixture runs") en het
// clubfilter dat "Vergelijk teams" vervangt. Pure functies, zodat ze zonder browser te testen zijn.

export const FDR_PERIOD_STORAGE_KEY = 'fpl_proleague_fdr_period';

// De snelknoppen naast de GW-kiezer: "Volgende 3 · 5 · 8".
export const FDR_QUICK_PERIODS = [3, 5, 8];

// "Volgende n" = de huidige speeldag en de n−1 erna, begrensd tot de laatste speeldag.
export function quickPeriod(n, currentGw, gwCount) {
  return { start: currentGw, end: Math.min(gwCount, currentGw + n - 1) };
}

// Welke snelknop past exact bij de periode (of null). Vlak voor het einde van het seizoen kunnen
// "5" en "8" op hetzelfde uitkomen; dan licht de kleinste op.
export function activeQuickPeriod(period, currentGw, gwCount) {
  return FDR_QUICK_PERIODS.find((n) => {
    const q = quickPeriod(n, currentGw, gwCount);
    return q.start === period.start && q.end === period.end;
  }) ?? null;
}

// Begin en einde altijd in de goede volgorde en binnen het seizoen.
export function normalizePeriod(start, end, gwCount) {
  const clamp = (v) => Math.min(gwCount, Math.max(1, Math.round(v)));
  const a = clamp(start);
  const b = clamp(end);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

// De periode van dit bezoek (sessionStorage). Bewust niet permanent: volgende week moet de standaard
// vanzelf meeschuiven. Niets bewaard of iets onbruikbaars = de standaardperiode.
export function loadFdrPeriod(storage, fallback, gwCount) {
  try {
    const raw = JSON.parse(storage?.getItem(FDR_PERIOD_STORAGE_KEY) ?? 'null');
    if (raw && Number.isFinite(raw.start) && Number.isFinite(raw.end)) {
      return normalizePeriod(raw.start, raw.end, gwCount);
    }
  } catch { /* geen opslag of kapotte waarde */ }
  return fallback;
}

export function saveFdrPeriod(storage, period) {
  try { storage?.setItem(FDR_PERIOD_STORAGE_KEY, JSON.stringify(period)); } catch { /* geen opslag */ }
}

// ?clubs=CLU,AND,GNK → ['CLU', 'AND', 'GNK']: enkel bestaande clubcodes, elk één keer.
export function parseClubsParam(value, teamCodes) {
  if (!value) return [];
  const known = new Set(teamCodes);
  const seen = new Set();
  String(value).split(',').forEach((part) => {
    const code = part.trim().toUpperCase();
    if (known.has(code)) seen.add(code);
  });
  return [...seen];
}

// Het filter doet pas iets als er een deel van de clubs gekozen is: niets of alles = alle clubs.
export function isClubFilterActive(selection, teamCount) {
  return selection.length > 0 && selection.length < teamCount;
}
