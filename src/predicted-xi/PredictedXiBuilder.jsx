// Root-component van de Predicted XI Builder — eigen, volledig losstaande React-boom (zie main.jsx),
// speelt dezelfde architecturale rol als FDRTool.jsx voor de hoofdsite: bezit ALLE state en handlers,
// componeert de presentationele onderdelen (PitchField/PitchSlot/PlayerSearchPanel/DraftsPanel) die
// enkel props/callbacks ontvangen.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { TEAMS, TEAMS_ALPHA, PLAYER_DATABASE_CSV_URL, parsePlayerDatabaseCsv } from '../constants';
import {
  FORMATIONS, DEFAULT_FORMATION_KEY, POSITION_PRESETS, generateEmptySlotsForFormation, remapLineupToFormation,
} from './formations';
import { nextSafety } from './theme';
import { loadStoredDrafts, saveDrafts, createDraftId, duplicateDraft, deleteDraft } from './storage';
import { exportLineupAsPng } from './exportImage';
import { downloadDraftsAsJson } from './exportJson';
import PitchField from './PitchField';
import PlayerSearchPanel from './PlayerSearchPanel';
import DraftsPanel from './DraftsPanel';
import PositionPicker from './PositionPicker';

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
  // Tegenstander voor deze lineup — '' = geen tegenstander gekozen. Puur informatief (geen invloed op
  // spelerskeuze/formatie), enkel getoond in de header en op de export.
  const [opponentCode, setOpponentCode] = useState('');
  const [openDraftId, setOpenDraftId] = useState(null);
  const [formationKey, setFormationKey] = useState(DEFAULT_FORMATION_KEY);
  // Handmatig ingetypte tekst die de automatische FORMATIONS[formationKey].label overschrijft op het
  // veld/de export (zie displayedFormationLabel hieronder) — '' = geen override, val terug op de
  // automatische label. Puur cosmetisch, verandert nooit de effectieve positielayout.
  const [formationLabelOverride, setFormationLabelOverride] = useState('');
  const [slots, setSlots] = useState(() => generateEmptySlotsForFormation(DEFAULT_FORMATION_KEY));
  const [notes, setNotes] = useState('');
  // Slot-index die net leeg aangeklikt werd — richt het zoekpaneel op precies die plek in plaats van
  // "eerste lege slot met matchende positie" (zie handleSearchSelect hieronder).
  const [activeSlotIndex, setActiveSlotIndex] = useState(null);
  // Index van de gevulde kaart waarvoor de positiekiezer open staat, null = gesloten.
  const [positionPickerIndex, setPositionPickerIndex] = useState(null);
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
      setFormationLabelOverride(existing.formationLabelOverride ?? '');
      setSlots(existing.slots);
      setNotes(existing.notes);
      setOpponentCode(existing.opponentCode ?? '');
    } else {
      setOpenDraftId(null);
      setFormationKey(DEFAULT_FORMATION_KEY);
      setFormationLabelOverride('');
      setSlots(generateEmptySlotsForFormation(DEFAULT_FORMATION_KEY));
      setNotes('');
      setOpponentCode('');
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
    setFormationLabelOverride(''); // val terug op de nieuwe formatie's eigen label, tenzij opnieuw getypt
    setActiveSlotIndex(null);
  }

  function handleSlotClick(index) {
    if (slots[index].playerName) {
      setPositionPickerIndex(index); // gevulde kaart: open de klik-gebaseerde positiekiezer
      return;
    }
    setActiveSlotIndex(prev => (prev === index ? null : index));
  }

  function findFirstEmptySlotIndex(list, broadPosition) {
    return list.findIndex(s => s.positionId !== '_unassigned' && !s.playerName && s.broadPosition === broadPosition);
  }

  function handleSearchSelect(player) {
    setSlots(prev => {
      const targetIndex = activeSlotIndex ?? findFirstEmptySlotIndex(prev, player.position);
      if (targetIndex === -1 || targetIndex == null) {
        // Geen passende lege plek — nooit een dode klik: speler gaat naar het niet-toegewezen-bakje.
        return [...prev, {
          positionId: '_unassigned', role: player.position, broadPosition: player.position,
          xPercent: 0, yPercent: 0,
          playerName: player.name, playerTeamCode: player.teamCode, playerPosition: player.position,
          playerPrice: player.price ?? null, safety: 'darkgreen',
        }];
      }
      return prev.map((s, i) => (i === targetIndex
        ? { ...s, playerName: player.name, playerTeamCode: player.teamCode, playerPosition: player.position, playerPrice: player.price ?? null, safety: s.safety || 'darkgreen' }
        : s));
    });
    setActiveSlotIndex(null);
  }

  function handleRemove(index) {
    setSlots(prev => {
      const slot = prev[index];
      if (slot.positionId === '_unassigned') return prev.filter((_, i) => i !== index);
      return prev.map((s, i) => (i === index
        ? { ...s, playerName: '', playerTeamCode: '', playerPosition: '', playerPrice: null, safety: 'darkgreen' }
        : s));
    });
  }

  function handleCycleSafety(index) {
    setSlots(prev => prev.map((s, i) => (i === index ? { ...s, safety: nextSafety(s.safety) } : s)));
  }

  // Verplaatst de speler op `index` naar de plek met `presetId`. De aangeduide formatie is enkel een
  // startlayout, geen dwingende beperking — presetId hoeft dus niet per se al voor te komen in de
  // huidige formatie (bv. een LW omzetten naar LST in een 4-3-3, die normaal geen LST-slot heeft).
  // Bestaat er al een ANDER slot met die presetId (binnen de huidige formatie, of omdat een eerdere
  // vrije keuze het daar al naartoe verplaatste), dan wisselen de twee spelers van plek; anders
  // verandert dit slot gewoon zelf van positie, de speler blijft dezelfde. Gedeelde toewijzingslogica
  // voor beide interactiepaden: een klik in PositionPicker.jsx (kiest presetId rechtstreeks) én een
  // sleep-en-los op het veld (PitchField.jsx berekent de dichtstbijzijnde presetId via automatische
  // settle, zie handleDragStart hieronder).
  function handleAssignPosition(index, presetId) {
    setSlots(prev => {
      const preset = POSITION_PRESETS[presetId];
      if (!preset || prev[index].positionId === presetId) return prev;
      const targetIndex = prev.findIndex((s, i) => i !== index && s.positionId === presetId);
      const next = [...prev];
      if (targetIndex === -1) {
        next[index] = {
          ...prev[index], positionId: presetId, role: preset.label,
          broadPosition: preset.broadPosition, xPercent: preset.xPercent, yPercent: preset.yPercent,
        };
      } else {
        const sourceFields = { playerName: prev[index].playerName, playerTeamCode: prev[index].playerTeamCode, playerPosition: prev[index].playerPosition, playerPrice: prev[index].playerPrice, safety: prev[index].safety };
        const targetFields = { playerName: prev[targetIndex].playerName, playerTeamCode: prev[targetIndex].playerTeamCode, playerPosition: prev[targetIndex].playerPosition, playerPrice: prev[targetIndex].playerPrice, safety: prev[targetIndex].safety };
        next[index] = { ...prev[index], ...targetFields };
        next[targetIndex] = { ...prev[targetIndex], ...sourceFields };
      }
      return next;
    });
    setPositionPickerIndex(null);
  }

  // Speler die niet in de databank zit — handmatig toegevoegd met enkel een naam. Neemt de brede
  // positie over van het geselecteerde lege slot (indien er één actief is), anders MID als veilige
  // fallback (zelfde conventie als elders bij een onbekende positie). Loopt verder via dezelfde
  // handleSearchSelect als een databank-speler — geen aparte plaatsingslogica nodig.
  function handleManualAdd(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const broadPosition = activeSlotIndex != null ? slots[activeSlotIndex]?.broadPosition : null;
    handleSearchSelect({ name: trimmed, teamCode: '', teamName: '', position: broadPosition ?? 'MID', price: null });
  }

  function handleDragStart(e, index) {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
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
        next = [...prev, { id, clubCode, opponentCode, formationKey, formationLabelOverride, slots, notes, label: '', createdAt: now, updatedAt: now }];
      } else if (prev.some(d => d.id === openDraftId)) {
        next = prev.map(d => (d.id === openDraftId ? { ...d, clubCode, opponentCode, formationKey, formationLabelOverride, slots, notes, updatedAt: now } : d));
      } else {
        next = [...prev, { id: openDraftId, clubCode, opponentCode, formationKey, formationLabelOverride, slots, notes, label: '', createdAt: now, updatedAt: now }];
      }
      saveDrafts(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubCode, opponentCode, formationKey, formationLabelOverride, slots, notes]);

  function handleOpenDraft(id) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;
    setOpenDraftId(draft.id);
    setClubCode(draft.clubCode);
    setOpponentCode(draft.opponentCode ?? '');
    setFormationKey(draft.formationKey);
    setFormationLabelOverride(draft.formationLabelOverride ?? '');
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
      setOpponentCode(newDraft.opponentCode ?? '');
      setFormationKey(newDraft.formationKey);
      setFormationLabelOverride(newDraft.formationLabelOverride ?? '');
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
    setPositionPickerIndex(null);
    setIsExporting(true);
    try {
      await exportLineupAsPng(pitchRef.current, { clubCode, opponentCode, formationKey });
    } catch {
      // rendering mislukt — stil genegeerd, gebruiker kan handmatig een screenshot nemen
    } finally {
      setIsExporting(false);
    }
  }

  const unassigned = slots.filter(s => s.positionId === '_unassigned');
  const activeSlotRole = activeSlotIndex != null ? slots[activeSlotIndex]?.role : null;
  const opponent = opponentCode ? TEAMS.find(t => t.code === opponentCode) : null;
  // Wat effectief op het veld/de export getoond wordt: de handmatig ingetypte tekst indien aanwezig,
  // anders de automatische label van de gekozen formatie.
  const displayedFormationLabel = formationLabelOverride.trim() || FORMATIONS[formationKey].label;

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
          <select value={opponentCode} onChange={(e) => setOpponentCode(e.target.value)} style={selectStyle}>
            <option value="">Geen tegenstander</option>
            {TEAMS_ALPHA.filter(t => t.code !== clubCode).map(t => <option key={t.code} value={t.code}>vs {t.name}</option>)}
          </select>
          <select value={formationKey} onChange={(e) => handleFormationChange(e.target.value)} style={selectStyle}>
            {Object.keys(FORMATIONS).map(key => <option key={key} value={key}>{FORMATIONS[key].label}</option>)}
          </select>
          <input
            type="text"
            value={formationLabelOverride}
            onChange={(e) => setFormationLabelOverride(e.target.value)}
            placeholder={FORMATIONS[formationKey].label}
            maxLength={20}
            title="Overschrijf de formatietekst die op het veld en de export getoond wordt (heeft geen invloed op de positielayout)"
            style={{ ...selectStyle, width: '110px' }}
          />
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
              opponent={opponent}
              formationLabel={displayedFormationLabel}
              slots={slots}
              activeSlotIndex={activeSlotIndex}
              onSlotClick={handleSlotClick}
              onRemove={handleRemove}
              onCycleSafety={handleCycleSafety}
              onDragStart={handleDragStart}
              onSlotDrop={handleAssignPosition}
            />

            {unassigned.length > 0 && (
              <div style={{ width: '100%', maxWidth: '560px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px' }}>
                <p style={{ color: '#8F79AD', fontSize: '11px', margin: '0 0 8px' }}>
                  Niet toegewezen (past niet in de huidige formatie — klik om terug op het veld te plaatsen):
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {slots.map((s, index) => s.positionId === '_unassigned' && (
                    <button
                      key={index}
                      onClick={() => {
                        setSlots(prev => {
                          const player = prev[index];
                          const withoutPlayer = prev.filter((_, i) => i !== index);
                          const newTarget = findFirstEmptySlotIndex(withoutPlayer, s.broadPosition);
                          if (newTarget === -1) return prev;
                          return withoutPlayer.map((slot, i) => (i === newTarget
                            ? { ...slot, playerName: player.playerName, playerTeamCode: player.playerTeamCode, playerPosition: player.playerPosition, playerPrice: player.playerPrice, safety: player.safety }
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
                onManualAdd={handleManualAdd}
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
                onExportAll={() => downloadDraftsAsJson(drafts)}
              />
            </div>
          </div>
        </div>
      </div>

      <PositionPicker
        slots={slots}
        activeIndex={positionPickerIndex}
        onAssign={handleAssignPosition}
        onClose={() => setPositionPickerIndex(null)}
      />
    </div>
  );
}
