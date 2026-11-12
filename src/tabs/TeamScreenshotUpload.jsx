// "Upload screenshot"-feature van de Team Planner: laat een screenshot van een bestaand FPL-team
// analyseren via de api/analyze-screenshot.js-serverless-function (Anthropic vision), en toont het
// resultaat als een VOORSTEL dat de gebruiker expliciet moet nakijken/corrigeren en bevestigen
// ("Toepassen") voor er iets echt in de 15 slots terechtkomt — herkenning is nooit 100% betrouwbaar,
// dus dit vult nooit stilzwijgend/definitief in. Alle state hier is lokale, niet-bevestigde
// draftstate (net als rechargeDraft/isTransferPanelOpen in TeamPlannerTab.jsx) — pas "Toepassen"
// schrijft naar de echte domein-state via de meegegeven updateTeamPlannerPlayer/setTeamPlannerCaptain.
//
// Sinds de rework (spec §7.3) is dit geen losse kaart meer: bij een lege planner één zin + de
// primary-knop "Upload screenshot", daarna een kleine secondary-knop in de actierij bovenaan.
// `extraActions` (bv. "Wis team") komt in diezelfde rij naast de knop.

import { useState, useRef } from 'react';
import { Upload, Loader2, Check, X, Crown } from 'lucide-react';
import { POSITIONS, TEAM_PLANNER_SLOT_POSITIONS } from '../constants';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import { downscaleImageToBase64 } from '../utils/imageDownscale';
import { matchPlayer } from '../utils/playerFuzzyMatch';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import ErrorBanner, { Notice } from '../ui/ErrorBanner';

const CONFIDENCE = {
  hoog: { className: 'is-high', label: 'Hoog' },
  twijfelachtig: { className: 'is-doubt', label: 'Twijfelachtig' },
  'niet-gevonden': { className: 'is-missing', label: 'Niet gevonden' },
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
  const confidence = CONFIDENCE[suggestion.confidence] ?? CONFIDENCE['niet-gevonden'];
  return (
    <li className="tp-sugg">
      <input
        type="checkbox"
        className="tp-sugg__check"
        checked={suggestion.included}
        onChange={(e) => onUpdate(index, { included: e.target.checked })}
        aria-label={`${suggestion.rawName} meenemen`}
      />
      <div className="tp-sugg__raw">
        <span className="tp-sugg__name">
          Herkend: &ldquo;{suggestion.rawName}&rdquo;
          {suggestion.isCaptain && <Badge tone="accent" title="Kapitein herkend" aria-label="Kapitein herkend">C</Badge>}
          {suggestion.isViceCaptain && <Badge title="Vice-kapitein herkend (enkel ter info)" aria-label="Vice-kapitein herkend">VC</Badge>}
        </span>
        <span className="tp-sugg__meta">
          rij: {suggestion.rowLabel || suggestion.rawPosition || '—'} · <span className={`tp-sugg__conf ${confidence.className}`}>{confidence.label}</span>
        </span>
      </div>
      <div className="tp-sugg__pick">
        <PlayerSearchInput
          value={suggestion.selectedPlayer?.name ?? ''}
          onSelect={(player) => onUpdate(index, { selectedPlayer: player, confidence: 'hoog' })}
          players={playerDatabase}
          placeholder="Zoek speler..."
        />
      </div>
      <Button
        variant="icon"
        size="sm"
        icon={Crown}
        onClick={() => onToggleCaptain(index)}
        aria-pressed={suggestion.isCaptain}
        aria-label={suggestion.isCaptain ? `Kapitein-markering verwijderen bij ${suggestion.rawName}` : `${suggestion.rawName} kapitein maken`}
        title={suggestion.isCaptain ? 'Kapitein-markering verwijderen' : 'Maak kapitein'}
      />
    </li>
  );
}

export function TeamScreenshotUpload({
  t,
  playerDatabase, playerDatabaseLoading, playerDatabaseError,
  updateTeamPlannerPlayer, setTeamPlannerCaptain, teamPlannerGw, isRosterEmpty = false,
  extraActions = null,
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
  const pickDisabled = playerDatabaseLoading || !!playerDatabaseError;
  const openPicker = () => fileInputRef.current?.click();

  return (
    <div className={`tp-import${isRosterEmpty ? ' is-empty' : ''}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFileSelected(file);
        }}
      />

      <div className="tp-import__bar">
        {isRosterEmpty && !proposal && <p className="tp-import__lead">{t('teamPlanner.emptyLead')}</p>}
        {status === 'loading' ? (
          <span className="tp-import__busy" role="status">
            <Loader2 className="fdr-spin" aria-hidden="true" /> {t('screenshotUpload.processing')}
          </span>
        ) : !proposal && (
          <Button
            variant={isRosterEmpty ? 'primary' : 'secondary'}
            size={isRosterEmpty ? undefined : 'sm'}
            icon={Upload}
            onClick={openPicker}
            disabled={pickDisabled}
          >
            {isRosterEmpty ? t('screenshotUpload.uploadButton') : t('screenshotUpload.importButton')}
          </Button>
        )}
        {extraActions}
      </div>

      {persistentNotice && !proposal && (
        <Notice action={<Button variant="icon" size="sm" bare icon={X} onClick={() => setPersistentNotice(null)} aria-label={t('screenshotUpload.cancel')} />}>
          {persistentNotice}
        </Notice>
      )}

      {status === 'error' && !proposal && (
        <ErrorBanner onRetry={openPicker} retryLabel={t('screenshotUpload.retry')}>{errorMessage}</ErrorBanner>
      )}

      {proposal && (
        <section className="tp-proposal" aria-labelledby="tp-proposal-title">
          <h2 id="tp-proposal-title" className="label tp-proposal__title">{t('screenshotUpload.heading')}</h2>
          <p className="tp-proposal__hint">{t('screenshotUpload.reviewHint')}</p>
          {proposal.warning && <Notice>{proposal.warning}</Notice>}
          {teamPlannerGw !== 1 && (
            <p className="tp-proposal__hint">
              De herkende kapitein wordt ingesteld voor GW{teamPlannerGw} (de momenteel bekeken speelweek).
            </p>
          )}
          <ul className="tp-proposal__list">
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
          </ul>
          {hasViceCaptainSuggestion && (
            <p className="tp-proposal__hint">
              Vice-kapitein herkend maar niet ondersteund door Team Planner — enkel ter info (VC-badge hierboven).
            </p>
          )}
          <div className="tp-proposal__actions">
            <Button variant="primary" icon={Check} onClick={handleApply}>{t('screenshotUpload.apply')}</Button>
            <Button variant="ghost" icon={X} onClick={handleCancel}>{t('screenshotUpload.cancel')}</Button>
          </div>
        </section>
      )}
    </div>
  );
}
