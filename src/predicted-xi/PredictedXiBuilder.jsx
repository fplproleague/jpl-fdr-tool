// Root-component van de Predicted XI Builder — eigen, volledig losstaande React-boom (zie main.jsx),
// speelt dezelfde architecturale rol als FDRTool.jsx voor de hoofdsite: bezit ALLE state en handlers,
// componeert de presentationele onderdelen (PitchField/PitchSlot/PlayerSearchPanel/DraftsPanel) die
// enkel props/callbacks ontvangen.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { TEAMS, TEAMS_ALPHA, PLAYER_DATABASE_CSV_URL, parsePlayerDatabaseCsv } from '../constants';
import {
  FORMATIONS, DEFAULT_FORMATION_KEY, generateEmptySlotsForFormation, remapLineupToFormation,
} from './formations';
import { nextSafety } from './theme';
import { loadStoredDrafts, saveDrafts, createDraftId, duplicateDraft, deleteDraft } from './storage';
import { exportLineupAsPng } from './exportImage';
import PitchField from './PitchField';
import PlayerSearchPanel from './PlayerSearchPanel';
import DraftsPanel from './DraftsPanel';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

const selectStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px', padding: '8px 10px', fontSize: '13px', fontWeight: 700,
};

export default function PredictedXiBuilder() {
  // --- Spelersdatabank: zelfde fetch-/foutafhandelingspatroon als fetchPlayerDatabase in FDRTool.jsx,
  // hier lokaal gerepliceerd omdat deze pagina een volledig eigen React-boom is. ---
  const [playerDatabase, setPlayerDatabase] = useState([]);
  const [playerDatabaseLoading, setPlayerDatabaseLoading] = useState(true);
  const [playerDatabaseError, setPlayerDatabaseError] = useState(null);

  const fetchPlayerDatabase = useCallback(async () => {
    setPlayerDatabaseLoading(true);
    setPlayerDatabaseError(null);
    try {
      const response = await fetch(PLAYER_DATABASE_CSV_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Netwerkfout');
      const text = await response.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Onverwacht antwoord');
      setPlayerDatabase(parsePlayerDatabaseCsv(text));
    } catch {
      setPlayerDatabaseError('Kon spelersdatabank niet laden, probeer opnieuw.');
    } finally {
      setPlayerDatabaseLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlayerDatabase();
  }, [fetchPlayerDatabase]);

  // --- Drafts: geladen éénmalig uit localStorage (zie storage.js) ---
  const [drafts, setDrafts] = useState(() => loadStoredDrafts());

  // --- Open lineup: club/formatie/slots/notities/welk opgeslagen record (indien aangeraakt) ---
  const [clubCode, setClubCode] = useState(TEAMS_ALPHA[0].code);
  const [openDraftId, setOpenDraftId] = useState(null);
  const [formationKey, setFormationKey] = useState(DEFAULT_FORMATION_KEY);
  const [slots, setSlots] = useState(() => generateEmptySlotsForFormation(DEFAULT_FORMATION_KEY));
  const [notes, setNotes] = useState('');
  // Slot-index die net leeg aangeklikt werd — richt het zoekpaneel op precies die plek in plaats van
  // "eerste lege slot met matchende positie" (zie handleSearchSelect hieronder).
  const [activeSlotIndex, setActiveSlotIndex] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const pitchRef = useRef(null);
  const club = TEAMS.find(t => t.code === clubCode);

  // --- Auto-load vorige lineup bij club-wissel: meest recent bijgewerkte opgeslagen lineup voor die
  // club, anders leeg starten op de standaardformatie. ---
  function openClub(code) {
    setClubCode(code);
    const existing = drafts
      .filter(d => d.clubCode === code)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (existing) {
      setOpenDraftId(existing.id);
      setFormationKey(existing.formationKey);
      setSlots(existing.slots);
      setNotes(existing.notes);
    } else {
      setOpenDraftId(null);
      setFormationKey(DEFAULT_FORMATION_KEY);
      setSlots(generateEmptySlotsForFormation(DEFAULT_FORMATION_KEY));
      setNotes('');
    }
    setActiveSlotIndex(null);
  }

  // Eerste club (alfabetisch) wordt automatisch geopend bij het laden van de pagina.
  useEffect(() => {
    openClub(TEAMS_ALPHA[0].code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFormationChange(newFormationKey) {
    setSlots(prev => remapLineupToFormation(prev, newFormationKey));
    setFormationKey(newFormationKey);
    setActiveSlotIndex(null);
  }

  function handleSlotClick(index) {
    if (slots[index].playerName) return; // gevulde slots openen geen zoekpaneel — gebruik sleep/verwijder
    setActiveSlotIndex(prev => (prev === index ? null : index));
  }

  function findFirstEmptySlotIndex(list, broadPosition) {
    return list.findIndex(s => s.line !== '_unassigned' && !s.playerName && s.broadPosition === broadPosition);
  }

  function handleSearchSelect(player) {
    setSlots(prev => {
      const targetIndex = activeSlotIndex ?? findFirstEmptySlotIndex(prev, player.position);
      if (targetIndex === -1 || targetIndex == null) {
        // Geen passende lege plek — nooit een dode klik: speler gaat naar het niet-toegewezen-bakje.
        return [...prev, {
          line: '_unassigned', role: player.position, broadPosition: player.position,
          xPercent: 0, yPercent: 0,
          playerName: player.name, playerTeamCode: player.teamCode, playerPosition: player.position, safety: 'green',
        }];
      }
      return prev.map((s, i) => (i === targetIndex
        ? { ...s, playerName: player.name, playerTeamCode: player.teamCode, playerPosition: player.position, safety: s.safety || 'green' }
        : s));
    });
    setActiveSlotIndex(null);
  }

  function handleRemove(index) {
    setSlots(prev => {
      const slot = prev[index];
      if (slot.line === '_unassigned') return prev.filter((_, i) => i !== index);
      return prev.map((s, i) => (i === index
        ? { ...s, playerName: '', playerTeamCode: '', playerPosition: '', safety: 'green' }
        : s));
    });
  }

  function handleCycleSafety(index) {
    setSlots(prev => prev.map((s, i) => (i === index ? { ...s, safety: nextSafety(s.safety) } : s)));
  }

  function handleDragStart(e, index) {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleDragOver(e) {
    e.preventDefault();
  }
  function handleDrop(e, targetIndex) {
    e.preventDefault();
    const sourceIndex = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isNaN(sourceIndex) || sourceIndex === targetIndex) return;
    setSlots(prev => {
      const next = [...prev];
      const sourceFields = { playerName: prev[sourceIndex].playerName, playerTeamCode: prev[sourceIndex].playerTeamCode, playerPosition: prev[sourceIndex].playerPosition, safety: prev[sourceIndex].safety };
      const targetFields = { playerName: prev[targetIndex].playerName, playerTeamCode: prev[targetIndex].playerTeamCode, playerPosition: prev[targetIndex].playerPosition, safety: prev[targetIndex].safety };
      next[sourceIndex] = { ...prev[sourceIndex], ...targetFields };
      next[targetIndex] = { ...prev[targetIndex], ...sourceFields };
      return next;
    });
  }

  // --- Autosave: elke wijziging aan de open lineup wordt bewaard. Een volledig lege, nooit-aangeraakte
  // lineup wordt niet als record aangemaakt (voorkomt het vervuilen van de lijst met per ongeluk
  // geopende lege clubs). ---
  useEffect(() => {
    const isEmpty = slots.every(s => !s.playerName) && !notes.trim();
    if (isEmpty && openDraftId == null) return;
    setDrafts(prev => {
      const now = Date.now();
      let next;
      if (openDraftId == null) {
        const id = createDraftId();
        setOpenDraftId(id);
        next = [...prev, { id, clubCode, formationKey, slots, notes, label: '', createdAt: now, updatedAt: now }];
      } else if (prev.some(d => d.id === openDraftId)) {
        next = prev.map(d => (d.id === openDraftId ? { ...d, clubCode, formationKey, slots, notes, updatedAt: now } : d));
      } else {
        next = [...prev, { id: openDraftId, clubCode, formationKey, slots, notes, label: '', createdAt: now, updatedAt: now }];
      }
      saveDrafts(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubCode, formationKey, slots, notes]);

  function handleOpenDraft(id) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;
    setOpenDraftId(draft.id);
    setClubCode(draft.clubCode);
    setFormationKey(draft.formationKey);
    setSlots(draft.slots);
    setNotes(draft.notes);
    setActiveSlotIndex(null);
  }

  function handleDuplicate(id) {
    const { drafts: next, newId } = duplicateDraft(drafts, id);
    setDrafts(next);
    saveDrafts(next);
    // Dupliceren opent meteen de nieuwe kopie — geschreven tegen `next` i.p.v. handleOpenDraft
    // aan te roepen, want die zoekt in de (nog niet bijgewerkte) `drafts`-state.
    const newDraft = next.find(d => d.id === newId);
    if (newDraft) {
      setOpenDraftId(newDraft.id);
      setClubCode(newDraft.clubCode);
      setFormationKey(newDraft.formationKey);
      setSlots(newDraft.slots);
      setNotes(newDraft.notes);
      setActiveSlotIndex(null);
    }
  }

  function handleDelete(id) {
    setDrafts(prev => {
      const next = deleteDraft(prev, id);
      saveDrafts(next);
      return next;
    });
    if (id === openDraftId) openClub(clubCode);
  }

  async function handleExport() {
    if (!pitchRef.current) return;
    setIsExporting(true);
    try {
      await exportLineupAsPng(pitchRef.current, { clubCode, formationKey });
    } catch {
      // rendering mislukt — stil genegeerd, gebruiker kan handmatig een screenshot nemen
    } finally {
      setIsExporting(false);
    }
  }

  const unassigned = slots.filter(s => s.line === '_unassigned');
  const activeSlotRole = activeSlotIndex != null ? slots[activeSlotIndex]?.role : null;

  return (
    <div style={{ minHeight: '100vh', background: '#1A0E2E', padding: '24px 16px', fontFamily: 'Archivo, Arial, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes pxi-spin { to { transform: rotate(360deg); } }
        .pxi-spin { animation: pxi-spin 0.8s linear infinite; }
      `}</style>

      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ color: '#FFF', fontSize: '22px', fontWeight: 900, margin: '0 0 4px' }}>Predicted XI Builder</h1>
        <p style={{ color: '#8F79AD', fontSize: '13px', margin: '0 0 20px' }}>
          Persoonlijke tool — niet gelinkt vanuit de site. Stel een voorspelde basiself samen en exporteer als PNG voor X.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
          <select value={clubCode} onChange={(e) => openClub(e.target.value)} style={selectStyle}>
            {TEAMS_ALPHA.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
          <select value={formationKey} onChange={(e) => handleFormationChange(e.target.value)} style={selectStyle}>
            {Object.keys(FORMATIONS).map(key => <option key={key} value={key}>{FORMATIONS[key].label}</option>)}
          </select>
          <button
            onClick={handleExport}
            disabled={isExporting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: '#4ECDC4', color: '#0B2E1B', border: 'none', borderRadius: '8px',
              padding: '9px 16px', fontWeight: 900, fontSize: '13px',
              cursor: isExporting ? 'wait' : 'pointer', opacity: isExporting ? 0.7 : 1,
            }}
          >
            {isExporting ? <Loader2 size={15} className="pxi-spin" /> : <Download size={15} />}
            {isExporting ? 'Bezig...' : 'Exporteer als PNG'}
          </button>
        </div>

        {playerDatabaseLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '16px' }}>
            <Loader2 size={16} className="pxi-spin" /> Spelersdatabank laden...
          </div>
        )}
        {!playerDatabaseLoading && playerDatabaseError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
            background: 'rgba(194,64,44,0.12)', border: '1px solid rgba(194,64,44,0.4)',
            borderRadius: '10px', padding: '12px 14px', marginBottom: '16px',
          }}>
            <AlertCircle size={16} color="#C2402C" style={{ flexShrink: 0 }} />
            <span style={{ color: '#FBEAE7', fontSize: '13px', flex: 1 }}>{playerDatabaseError}</span>
            <button onClick={fetchPlayerDatabase} style={retryButtonStyle}>
              <RotateCcw size={14} /> Probeer opnieuw
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 480px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <PitchField
              ref={pitchRef}
              club={club}
              formationLabel={FORMATIONS[formationKey].label}
              slots={slots}
              activeSlotIndex={activeSlotIndex}
              onSlotClick={handleSlotClick}
              onRemove={handleRemove}
              onCycleSafety={handleCycleSafety}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />

            {unassigned.length > 0 && (
              <div style={{ width: '100%', maxWidth: '560px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px' }}>
                <p style={{ color: '#8F79AD', fontSize: '11px', margin: '0 0 8px' }}>
                  Niet toegewezen (past niet in de huidige formatie — klik om terug op het veld te plaatsen):
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {slots.map((s, index) => s.line === '_unassigned' && (
                    <button
                      key={index}
                      onClick={() => {
                        setSlots(prev => {
                          const player = prev[index];
                          const withoutPlayer = prev.filter((_, i) => i !== index);
                          const newTarget = findFirstEmptySlotIndex(withoutPlayer, s.broadPosition);
                          if (newTarget === -1) return prev;
                          return withoutPlayer.map((slot, i) => (i === newTarget
                            ? { ...slot, playerName: player.playerName, playerTeamCode: player.playerTeamCode, playerPosition: player.playerPosition, safety: player.safety }
                            : slot));
                        });
                      }}
                      title="Terug op het veld plaatsen"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(232,197,71,0.1)',
                        border: '1px solid rgba(232,197,71,0.4)', borderRadius: '8px', padding: '5px 10px',
                        color: '#E8C547', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {s.playerName} ({s.broadPosition})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: '1 1 320px', minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px' }}>
              <h3 style={{ color: '#C9B8E0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 10px' }}>
                Spelers zoeken
              </h3>
              <PlayerSearchPanel
                players={playerDatabase}
                onSelect={handleSearchSelect}
                activeSlotRole={activeSlotRole}
                disabled={playerDatabaseLoading || !!playerDatabaseError}
              />
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px' }}>
              <DraftsPanel
                drafts={drafts}
                clubCode={clubCode}
                openDraftId={openDraftId}
                onOpen={handleOpenDraft}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                notes={notes}
                onNotesChange={setNotes}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
