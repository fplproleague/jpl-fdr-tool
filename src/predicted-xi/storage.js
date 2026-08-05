// Drafts-opslag voor de Predicted XI Builder — eigen, nieuwe localStorage-key, raakt geen enkele
// bestaande key van de hoofd-app. Zelfde patroon als overal elders in dit project (bv. de watchlist in
// FDRTool.jsx): een versie-key, een defensieve loader die elk veld valideert en op een veilige fallback
// terugvalt, en een enkele autosave-effect bij de aanroeper.
import { TEAMS } from '../constants';
import { FORMATIONS, DEFAULT_FORMATION_KEY, POSITION_PRESETS, generateEmptySlotsForFormation } from './formations';

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
    safety: ['green', 'orange', 'red'].includes(raw.safety) ? raw.safety : 'green',
  };
}

function sanitizeDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!TEAMS.some(t => t.code === raw.clubCode)) return null; // onrenderbaar zonder geldige club
  const formationKey = FORMATIONS[raw.formationKey] ? raw.formationKey : DEFAULT_FORMATION_KEY;
  const slots = Array.isArray(raw.slots)
    ? raw.slots.map(sanitizeSlot).filter(Boolean)
    : generateEmptySlotsForFormation(formationKey);
  return {
    id: typeof raw.id === 'string' ? raw.id : createDraftId(),
    clubCode: raw.clubCode,
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
