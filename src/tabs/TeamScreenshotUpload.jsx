// "Upload screenshot"-feature bovenaan Team Planner: laat een screenshot van een bestaand FPL-team
// analyseren via de nieuwe api/analyze-screenshot.js-serverless-function (Anthropic vision), en toont
// het resultaat als een VOORSTEL dat de gebruiker expliciet moet nakijken/corrigeren en bevestigen
// ("Toepassen") voor er iets echt in de 15 slots terechtkomt — herkenning is nooit 100% betrouwbaar,
// dus dit vult nooit stilzwijgend/definitief in. Alle state hier is lokale, niet-bevestigde
// draftstate (net als rechargeDraft/isTransferPanelOpen in TeamPlannerTab.jsx) — pas "Toepassen"
// schrijft naar de echte domein-state via de meegegeven updateTeamPlannerPlayer/setTeamPlannerCaptain.

import { useState, useRef } from 'react';
import { Upload, Loader2, AlertCircle, RotateCcw, Check, X, Crown } from 'lucide-react';
import { POSITIONS, TEAM_PLANNER_SLOT_POSITIONS } from '../constants';
import { COLORS, retryButtonStyle, primaryButtonStyle, secondaryButtonStyle } from '../theme';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import { downscaleImageToBase64 } from '../utils/imageDownscale';
import { matchPlayer } from '../utils/playerFuzzyMatch';

const CONFIDENCE_STYLE = {
  hoog: { bg: 'rgba(78,205,196,0.15)', color: '#4ECDC4', label: 'Hoog' },
  twijfelachtig: { bg: 'rgba(232,197,71,0.15)', color: '#E8C547', label: 'Twijfelachtig' },
  'niet-gevonden': { bg: 'rgba(194,64,44,0.15)', color: '#FF9E90', label: 'Niet gevonden' },
};

function buildSuggestion(recognizedPlayer, playerDatabase) {
  const { matched, confidence } = matchPlayer(recognizedPlayer, playerDatabase);
  return {
    rawName: recognizedPlayer.name,
    rawPosition: recognizedPlayer.position,
    rowLabel: recognizedPlayer.rowLabel,
    isCaptain: recognizedPlayer.isCaptain,
    isViceCaptain: recognizedPlayer.isViceCaptain,
    selectedPlayer: matched,
    confidence,
    included: true,
  };
}

function SuggestionRow({ suggestion, index, playerDatabase, onUpdate, onToggleCaptain }) {
  const confidenceStyle = CONFIDENCE_STYLE[suggestion.confidence];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <input
        type="checkbox"
        checked={suggestion.included}
        onChange={(e) => onUpdate(index, { included: e.target.checked })}
        style={{ flexShrink: 0 }}
      />
      <div style={{ minWidth: '150px', flexShrink: 0 }}>
        <div style={{ color: '#FFF', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          Herkend: &ldquo;{suggestion.rawName}&rdquo;
          {suggestion.isCaptain && (
            <span title="Kapitein herkend" aria-label="Kapitein herkend" role="img" style={{ background: '#4ECDC4', color: '#0B2E1B', borderRadius: '999px', width: '16px', height: '16px', fontSize: '9px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>C</span>
          )}
          {suggestion.isViceCaptain && (
            <span title="Vice-kapitein herkend (enkel ter info)" aria-label="Vice-kapitein herkend" role="img" style={{ background: 'rgba(255,255,255,0.15)', color: COLORS.textBody, borderRadius: '999px', width: '16px', height: '16px', fontSize: '9px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>V</span>
          )}
        </div>
        <div style={{ color: COLORS.textMuted, fontSize: '11px' }}>rij: {suggestion.rowLabel || suggestion.rawPosition || '—'}</div>
      </div>
      <span style={{
        background: confidenceStyle.bg, color: confidenceStyle.color, fontSize: '11px', fontWeight: 700,
        padding: '2px 8px', borderRadius: '999px', flexShrink: 0,
      }}>
        {confidenceStyle.label}
      </span>
      <div style={{ flex: 1, minWidth: '160px' }}>
        <PlayerSearchInput
          value={suggestion.selectedPlayer?.name ?? ''}
          onSelect={(player) => onUpdate(index, { selectedPlayer: player, confidence: 'hoog' })}
          players={playerDatabase}
          placeholder="Zoek speler..."
        />
      </div>
      <button
        onClick={() => onToggleCaptain(index)}
        aria-pressed={suggestion.isCaptain}
        aria-label={suggestion.isCaptain ? `Kapitein-markering verwijderen bij ${suggestion.rawName}` : `${suggestion.rawName} kapitein maken`}
        title={suggestion.isCaptain ? 'Kapitein-markering verwijderen' : 'Maak kapitein'}
        className="fdr-icon-btn"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px',
          borderRadius: '8px', flexShrink: 0, background: suggestion.isCaptain ? 'rgba(78,205,196,0.2)' : 'transparent',
          color: suggestion.isCaptain ? '#4ECDC4' : COLORS.textMuted, border: `1px solid ${suggestion.isCaptain ? '#4ECDC4' : 'rgba(255,255,255,0.2)'}`,
          cursor: 'pointer',
        }}
      >
        <Crown size={13} />
      </button>
    </div>
  );
}

export function TeamScreenshotUpload({
  t,
  playerDatabase, playerDatabaseLoading, playerDatabaseError,
  updateTeamPlannerPlayer, setTeamPlannerCaptain, teamPlannerGw, isRosterEmpty = false,
}) {
  const [proposal, setProposal] = useState(null); // null | { suggestions: [...], warning }
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [persistentNotice, setPersistentNotice] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelected = async (file) => {
    if (!file) return;
    setStatus('loading');
    setErrorMessage(null);
    setPersistentNotice(null);
    try {
      const { base64, mediaType } = await downscaleImageToBase64(file);
      const response = await fetch('/api/analyze-screenshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Analyse mislukt.');
      const suggestions = (data.players ?? []).map(p => buildSuggestion(p, playerDatabase));
      if (suggestions.length === 0) {
        setStatus('error');
        setErrorMessage(data.warning ?? 'Geen spelers herkend op deze screenshot.');
      } else {
        setProposal({ suggestions, warning: data.warning ?? null });
        setStatus('idle');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Er ging iets mis bij het herkennen van je team.');
    }
  };

  const updateSuggestion = (index, patch) => {
    setProposal(prev => {
      if (!prev) return prev;
      return { ...prev, suggestions: prev.suggestions.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
    });
  };

  // Kapitein-markering is mutueel exclusief: deze rij aan-/uitzetten wist 'm meteen op elke andere rij.
  const handleToggleCaptain = (index) => {
    setProposal(prev => {
      if (!prev) return prev;
      const wasCaptain = prev.suggestions[index].isCaptain;
      return {
        ...prev,
        suggestions: prev.suggestions.map((s, i) => ({ ...s, isCaptain: i === index ? !wasCaptain : false })),
      };
    });
  };

  const handleApply = () => {
    const included = proposal.suggestions.filter(s => s.included && s.selectedPlayer);
    const byPosition = { GK: [], DEF: [], MID: [], FWD: [] };
    included.forEach(s => { byPosition[s.selectedPlayer.position]?.push(s); });

    POSITIONS.forEach(pos => {
      const slotIndices = TEAM_PLANNER_SLOT_POSITIONS
        .map((p, i) => (p === pos ? i : null))
        .filter(i => i !== null);
      byPosition[pos].slice(0, slotIndices.length).forEach((suggestion, i) => {
        const slotIndex = slotIndices[i];
        updateTeamPlannerPlayer(slotIndex, 'name', suggestion.selectedPlayer.name);
        updateTeamPlannerPlayer(slotIndex, 'teamCode', suggestion.selectedPlayer.teamCode);
        updateTeamPlannerPlayer(slotIndex, 'price', suggestion.selectedPlayer.price ?? '');
      });
    });

    const captainSuggestion = included.find(s => s.isCaptain);
    if (captainSuggestion) {
      const pos = captainSuggestion.selectedPlayer.position;
      const slotIndices = TEAM_PLANNER_SLOT_POSITIONS
        .map((p, i) => (p === pos ? i : null))
        .filter(i => i !== null);
      const idxInGroup = byPosition[pos].indexOf(captainSuggestion);
      if (idxInGroup !== -1 && idxInGroup < slotIndices.length) {
        setTeamPlannerCaptain(slotIndices[idxInGroup]);
      }
    }

    if (proposal.warning) setPersistentNotice(proposal.warning);
    setProposal(null);
    setStatus('idle');
  };

  const handleCancel = () => {
    setProposal(null);
    setStatus('idle');
    setErrorMessage(null);
  };

  const hasViceCaptainSuggestion = proposal?.suggestions.some(s => s.isViceCaptain);

  return (
    // Visueel naar voren gehaald (accentrand + accentachtergrond) i.p.v. het neutrale grijze kaartje
    // van vroeger. Dit is de snelste weg van "lege planner" naar "volledig team": één screenshot
    // vervangt vijftien keer handmatig zoeken en typen. Als dat eruitziet als zomaar weer een blok,
    // scrollen mensen er straal voorbij en beginnen ze aan het trage pad.
    <div style={{
      background: isRosterEmpty ? 'rgba(78,205,196,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${isRosterEmpty ? 'rgba(78,205,196,0.45)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '10px', padding: '16px', marginBottom: '20px',
    }}>
      <h3 className="fdr-title" style={{
        color: isRosterEmpty ? '#4ECDC4' : COLORS.textBody, fontSize: '13px',
        textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 8px',
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        <Upload size={15} aria-hidden="true" />
        {t('screenshotUpload.heading')}
        {isRosterEmpty && (
          <span style={{
            background: '#4ECDC4', color: '#0B2E1B', fontSize: '10px', fontWeight: 900,
            padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.03em',
          }}>
            {t('screenshotUpload.recommended')}
          </span>
        )}
      </h3>
      <p style={{ color: COLORS.textMuted, fontSize: '12px', margin: '0 0 12px', lineHeight: 1.55 }}>
        {t('screenshotUpload.intro')}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFileSelected(file);
        }}
      />

      {persistentNotice && !proposal && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.4)',
          borderRadius: '10px', padding: '10px 14px', marginBottom: '12px',
        }}>
          <AlertCircle size={16} color="#E8C547" style={{ flexShrink: 0 }} />
          <span style={{ color: '#E8C547', fontSize: '12px', flex: 1 }}>{persistentNotice}</span>
          <button onClick={() => setPersistentNotice(null)} style={{ background: 'transparent', border: 'none', color: '#E8C547', cursor: 'pointer', padding: 0 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {proposal ? (
        <div>
          {proposal.warning && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
              background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.4)',
              borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', color: '#E8C547', fontSize: '12px',
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> {proposal.warning}
            </div>
          )}
          {teamPlannerGw !== 1 && (
            <p style={{ color: COLORS.textMuted, fontSize: '11px', margin: '0 0 10px' }}>
              De herkende kapitein wordt ingesteld voor GW{teamPlannerGw} (de momenteel bekeken speelweek).
            </p>
          )}
          <div>
            {proposal.suggestions.map((suggestion, index) => (
              <SuggestionRow
                key={index}
                suggestion={suggestion}
                index={index}
                playerDatabase={playerDatabase}
                onUpdate={updateSuggestion}
                onToggleCaptain={handleToggleCaptain}
              />
            ))}
          </div>
          {hasViceCaptainSuggestion && (
            <p style={{ color: COLORS.textMuted, fontSize: '11px', margin: '10px 0 0' }}>
              Vice-kapitein herkend maar niet ondersteund door Team Planner — enkel ter info (V-badge hierboven).
            </p>
          )}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button onClick={handleApply} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: '#4ECDC4', color: '#0B2E1B', border: '1px solid #4ECDC4',
              borderRadius: '8px', padding: '8px 16px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
            }}>
              <Check size={15} /> {t('screenshotUpload.apply')}
            </button>
            <button onClick={handleCancel} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'transparent', color: COLORS.textBody, border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '8px 16px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
            }}>
              <X size={15} /> {t('screenshotUpload.cancel')}
            </button>
          </div>
        </div>
      ) : status === 'loading' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: COLORS.textBody, fontSize: '13px' }}>
          <Loader2 size={16} className="fdr-spin" /> {t('screenshotUpload.processing')}
        </div>
      ) : status === 'error' ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          background: 'rgba(194,64,44,0.12)', border: '1px solid rgba(194,64,44,0.4)',
          borderRadius: '10px', padding: '12px 14px',
        }}>
          <AlertCircle size={16} color="#C2402C" style={{ flexShrink: 0 }} />
          <span style={{ color: '#FBEAE7', fontSize: '13px', flex: 1 }}>{errorMessage}</span>
          <button onClick={() => fileInputRef.current?.click()} style={retryButtonStyle}>
            <RotateCcw size={14} /> {t('screenshotUpload.retry')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={playerDatabaseLoading || !!playerDatabaseError}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'transparent', color: playerDatabaseLoading || playerDatabaseError ? COLORS.textDisabled : '#4ECDC4',
            border: `1px solid ${playerDatabaseLoading || playerDatabaseError ? 'rgba(255,255,255,0.15)' : '#4ECDC4'}`,
            borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px',
            cursor: playerDatabaseLoading || playerDatabaseError ? 'not-allowed' : 'pointer',
          }}
        >
          <Upload size={15} /> {t('screenshotUpload.uploadButton')}
        </button>
      )}
    </div>
  );
}
