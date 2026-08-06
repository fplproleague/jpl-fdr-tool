// Drafts-opslag voor de Predicted XI Builder — eigen, nieuwe localStorage-key, raakt geen enkele
// bestaande key van de hoofd-app. Zelfde patroon als overal elders in dit project (bv. de watchlist in
// FDRTool.jsx): een versie-key, een defensieve loader die elk veld valideert en op een veilige fallback
// terugvalt, en een enkele autosave-effect bij de aanroeper.
import { TEAMS } from '../constants';
import { FORMATIONS, DEFAULT_FORMATION_KEY, POSITION_PRESETS, generateEmptySlotsForFormation, remapLineupToFormation } from './formations';

const DRAFTS_STORAGE_KEY = 'fpl_proleague_predicted_xi_drafts_v1';

export function createDraftId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeSlot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const positionId = raw.positionId === '_unassigned' || POSITION_PRESETS[raw.positionId] ? raw.positionId : '_unassigned';
  return {
    positionId,
    role: typeof raw.role === 'string' ? raw.role : '',
    broadPosition: ['GK', 'DEF', 'MID', 'FWD'].includes(raw.broadPosition) ? raw.broadPosition : 'MID',
    xPercent: Number.isFinite(raw.xPercent) ? raw.xPercent : 0,
    yPercent: Number.isFinite(raw.yPercent) ? raw.yPercent : 0,
    playerName: typeof raw.playerName === 'string' ? raw.playerName : '',
    playerTeamCode: typeof raw.playerTeamCode === 'string' ? raw.playerTeamCode : '',
    playerPosition: typeof raw.playerPosition === 'string' ? raw.playerPosition : '',
    playerPrice: Number.isFinite(raw.playerPrice) ? raw.playerPrice : null,
    safety: ['darkgreen', 'green', 'orange', 'red'].includes(raw.safety) ? raw.safety : 'darkgreen',
  };
}

// Bepaalt of `slotsArray` uit herkenbare positionId's bestaat (elke waarde is '_unassigned' of een
// geldige sleutel in POSITION_PRESETS). Controleert bewust NIET of elk slot exact overeenkomt met
// FORMATIONS[formationKey].positionIds — de formatie is enkel een startlayout, geen dwingende
// beperking, dus een individueel slot kan intussen vrij naar een andere positie omgezet zijn (bv. een
// LW naar LST). Dit dekt nog steeds écht verouderde data (van vóór de klik-positiekiezer, die een grof
// 'line'-veld i.p.v. 'positionId' opsloeg — 'FWD'/'MID'/... komt nooit voor als POSITION_PRESETS-sleutel).
function hasRecognizedSlots(slotsArray) {
  return slotsArray.every(s => s.positionId === '_unassigned' || POSITION_PRESETS[s.positionId]);
}

function sanitizeDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!TEAMS.some(t => t.code === raw.clubCode)) return null; // onrenderbaar zonder geldige club
  const formationKey = FORMATIONS[raw.formationKey] ? raw.formationKey : DEFAULT_FORMATION_KEY;
  const rawSlotsArray = Array.isArray(raw.slots) ? raw.slots.filter(s => s && typeof s === 'object') : [];

  let slots;
  if (rawSlotsArray.length === 0) {
    slots = generateEmptySlotsForFormation(formationKey);
  } else if (hasRecognizedSlots(rawSlotsArray)) {
    slots = rawSlotsArray.map(sanitizeSlot).filter(Boolean);
  } else {
    // Migratie: herverdeel de spelers uit het oude/onvolledige formaat via dezelfde greedy-logica als
    // een formatiewissel, zodat ze op geldige posities terechtkomen i.p.v. allemaal onterecht in het
    // niet-toegewezen-bakje te belanden — nooit stilzwijgend spelersdata verliezen.
    const roughSlots = rawSlotsArray.map(s => ({
      playerName: typeof s.playerName === 'string' ? s.playerName : '',
      playerTeamCode: typeof s.playerTeamCode === 'string' ? s.playerTeamCode : '',
      playerPosition: typeof s.playerPosition === 'string' ? s.playerPosition : '',
      playerPrice: Number.isFinite(s.playerPrice) ? s.playerPrice : null,
      broadPosition: ['GK', 'DEF', 'MID', 'FWD'].includes(s.broadPosition) ? s.broadPosition : 'MID',
      safety: ['darkgreen', 'green', 'orange', 'red'].includes(s.safety) ? s.safety : 'darkgreen',
    }));
    slots = remapLineupToFormation(roughSlots, formationKey);
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : createDraftId(),
    clubCode: raw.clubCode,
    opponentCode: typeof raw.opponentCode === 'string' && (raw.opponentCode === '' || TEAMS.some(t => t.code === raw.opponentCode))
      ? raw.opponentCode
      : '',
    formationKey,
    slots,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    label: typeof raw.label === 'string' ? raw.label : '',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

export function loadStoredDrafts() {
  try {
    const raw = window.localStorage?.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeDraft).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveDrafts(drafts) {
  try {
    window.localStorage?.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // storage niet beschikbaar (bv. privénavigatie) — werkt gewoon door voor deze sessie
  }
}

function teamNameFor(clubCode) {
  return TEAMS.find(t => t.code === clubCode)?.name ?? clubCode;
}

export function draftDisplayLabel(draft) {
  if (draft.label) return draft.label;
  const date = new Date(draft.updatedAt).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
  return `${teamNameFor(draft.clubCode)} · ${draft.formationKey} · ${date}`;
}

// Kloont een bestaand record met nieuwe id/timestamps en een aangepast label — wordt door de
// aanroeper meteen als het nieuwe "open" record ingesteld.
export function duplicateDraft(drafts, sourceId) {
  const source = drafts.find(d => d.id === sourceId);
  if (!source) return { drafts, newId: null };
  const now = Date.now();
  const copy = {
    ...source,
    id: createDraftId(),
    label: `${draftDisplayLabel(source)} (kopie)`,
    createdAt: now,
    updatedAt: now,
  };
  return { drafts: [...drafts, copy], newId: copy.id };
}

export function deleteDraft(drafts, id) {
  return drafts.filter(d => d.id !== id);
}
