// xG per club voor de clubkaart (spec F2), uit /api/team-xg (API-Football, zie api/team-xg.js).
// Eén keer ophalen per bezoek, pas als iemand een clubkaart opent. Lukt het niet, dan blijft het null
// en toont de clubkaart het xG-blok gewoon niet.
import { useEffect, useState } from 'react';

export const XG_MATCHES = 5;

let request = null;

export function fetchTeamXg() {
  request ??= fetch('/api/team-xg')
    .then(r => (r.ok ? r.json() : null))
    .then(body => (body?.clubs && typeof body.clubs === 'object' ? body.clubs : null))
    .catch(() => null);
  return request;
}

export function useTeamXg() {
  const [clubs, setClubs] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchTeamXg().then(result => { if (alive) setClubs(result); });
    return () => { alive = false; };
  }, []);
  return clubs;
}

const average = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

// De laatste n wedstrijden van één club: gemiddelde xG voor/tegen en doelpunten voor/tegen per wedstrijd
// (enkel over wedstrijden waar API-Football xG voor heeft), plus de wedstrijden zelf, nieuwste eerst.
// null als er geen enkele wedstrijd met xG is.
export function summarizeXg(matches, n = XG_MATCHES) {
  const recent = (matches ?? []).slice(-n);
  const withXg = recent.filter(m => m.xg != null && m.xga != null);
  if (withXg.length === 0) return null;
  return {
    count: withXg.length,
    xg: average(withXg.map(m => m.xg)),
    xga: average(withXg.map(m => m.xga)),
    gf: average(withXg.filter(m => m.gf != null).map(m => m.gf)),
    ga: average(withXg.filter(m => m.ga != null).map(m => m.ga)),
    matches: [...recent].reverse(),
  };
}

export function resultOf(m) {
  if (m?.gf == null || m?.ga == null) return null;
  if (m.gf > m.ga) return 'W';
  if (m.gf < m.ga) return 'L';
  return 'D';
}
