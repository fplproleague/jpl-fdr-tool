// Klassement van de echte competitie (spec F4), uit /api/standings (API-Football). Pas opgehaald als
// iemand een clubkaart opent, één keer per bezoek. Lukt het niet, dan blijft het null en toont de
// clubkaart die regel niet.
import { useEffect, useState } from 'react';

let request = null;

export function useStandings() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    request ??= fetch('/api/standings')
      .then(r => (r.ok ? r.json() : null))
      .then(body => (body?.clubs && typeof body.clubs === 'object' ? body : null))
      .catch(() => null);
    request.then(result => { if (alive) setData(result); });
    return () => { alive = false; };
  }, []);
  return data;
}

// 1 -> "1e" / "1er" / "1st", 3 -> "3e" / "3e" / "3rd".
export function ordinal(rank, language = 'nl') {
  if (!Number.isInteger(rank)) return '';
  if (language === 'fr') return rank === 1 ? '1er' : `${rank}e`;
  if (language === 'en') {
    const mod100 = rank % 100;
    const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] ?? 'th');
    return `${rank}${suffix}`;
  }
  return `${rank}e`;
}
