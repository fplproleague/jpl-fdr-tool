// "Upload screenshot"-feature van de Team Planner: laat een screenshot van een bestaand FPL-team
// analyseren via de api/analyze-screenshot.js-serverless-function (Anthropic vision), en toont het
// resultaat als een VOORSTEL dat de gebruiker expliciet moet nakijken/corrigeren en bevestigen
// ("Toepassen") voor er iets echt in de 15 slots terechtkomt — herkenning is nooit 100% betrouwbaar,
// dus dit vult nooit stilzwijgend/definitief in. Alle state hier is lokale, niet-bevestigde
// draftstate — pas "Toepassen" geeft het resultaat door aan de planner (onApply, zie importTeam in
// useTeamPlanner.js): de spelers per slot, kapitein en vice, en budget en gratis transfers (spec C8).
// Die twee staan meestal op dezelfde screenshot; de server probeert ze af te lezen.
//
// Sinds de rework (spec §7.3) is dit geen losse kaart meer: bij een lege planner één zin + de
// primary-knop "Upload screenshot", daarna een kleine secondary-knop in de actierij bovenaan.
// `extraActions` (bv. "Wis team") komt in diezelfde rij naast de knop.

import { useState, useRef } from 'react';
import { Upload, Loader2, Check, X, Crown } from 'lucide-react';
import { POSITIONS, TEAM_PLANNER_SLOT_POSITIONS, TEAM_PLANNER_FREE_TRANSFER_CAP } from '../constants';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import { downscaleImageToBase64 } from '../utils/imageDownscale';
import { matchPlayer } from '../utils/playerFuzzyMatch';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Select from '../ui/Select';
import ErrorBanner, { Notice } from '../ui/ErrorBanner';

// Zekerheid van de herkenning. De sleutels komen uit utils/playerFuzzyMatch (data, geen tekst); het
// label staat in i18n.js.
const CONFIDENCE = {
  hoog: { className: 'is-high', labelKey: 'screenshotUpload.confidence.high' },
  twijfelachtig: { className: 'is-doubt', labelKey: 'screenshotUpload.confidence.doubt' },
  'niet-gevonden': { className: 'is-missing', labelKey: 'screenshotUpload.confidence.missing' },
};

// De server geeft codes terug, geen zinnen (spec A3). Een onbekende code of een antwoord zonder code
// (bv. een HTML-foutpagina van de firewall) valt terug op een algemene melding.
const ERROR_CODES = ['forbidden_origin', 'not_configured', 'no_image', 'image_too_large', 'service_unreachable', 'service_error', 'rate_limited', 'read_failed'];
const MAX_BASE64_LENGTH = 4 * 1024 * 1024 - 64 * 1024;

function errorText(t, code) {
  return t(`screenshotUpload.error.${ERROR_CODES.includes(code) ? code : 'generic'}`);
}

function warningText(t, warning) {
  if (!warning) return null;
  if (warning.code === 'partial') return t('screenshotUpload.warning.partial', { count: warning.count });
  return t('screenshotUpload.warning.not_recognized');
}

class ScreenshotError extends Error {
  constructor(code) { super(code); this.code = code; }
}

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

function SuggestionRow({ t, suggestion, index, playerDatabase, onUpdate, onToggleRole }) {
  const confidence = CONFIDENCE[suggestion.confidence] ?? CONFIDENCE['niet-gevonden'];
  return (
    <li className="tp-sugg">
      <input
        type="checkbox"
        className="tp-sugg__check"
        checked={suggestion.included}
        onChange={(e) => onUpdate(index, { included: e.target.checked })}
        aria-label={t('screenshotUpload.includeAria', { name: suggestion.rawName })}
      />
      <div className="tp-sugg__raw">
        <span className="tp-sugg__name">
          {t('screenshotUpload.recognized', { name: suggestion.rawName })}
          {suggestion.isCaptain && <Badge tone="accent" title={t('screenshotUpload.captainRecognized')} aria-label={t('screenshotUpload.captainRecognized')}>C</Badge>}
          {suggestion.isViceCaptain && <Badge tone="vice" title={t('screenshotUpload.viceRecognized')} aria-label={t('screenshotUpload.viceRecognized')}>V</Badge>}
        </span>
        <span className="tp-sugg__meta">
          {t('screenshotUpload.row', { row: suggestion.rowLabel || suggestion.rawPosition || '—' })} · <span className={`tp-sugg__conf ${confidence.className}`}>{t(confidence.labelKey)}</span>
        </span>
      </div>
      <div className="tp-sugg__pick">
        <PlayerSearchInput
          value={suggestion.selectedPlayer?.name ?? ''}
          onSelect={(player) => onUpdate(index, { selectedPlayer: player, confidence: 'hoog' })}
          players={playerDatabase}
          placeholder={t('screenshotUpload.searchPlaceholder')}
          noResultsText={t('shared.noPlayersFound')}
        />
      </div>
      <Button
        variant="icon"
        size="sm"
        icon={Crown}
        onClick={() => onToggleRole(index, 'isCaptain')}
        aria-pressed={suggestion.isCaptain}
        aria-label={t(suggestion.isCaptain ? 'screenshotUpload.captainRemoveAria' : 'screenshotUpload.captainMakeAria', { name: suggestion.rawName })}
        title={t(suggestion.isCaptain ? 'screenshotUpload.captainRemove' : 'screenshotUpload.captainMake')}
      />
      <Button
        variant="secondary"
        size="sm"
        className="tp-sugg__vice"
        onClick={() => onToggleRole(index, 'isViceCaptain')}
        aria-pressed={suggestion.isViceCaptain}
        aria-label={t(suggestion.isViceCaptain ? 'screenshotUpload.viceRemoveAria' : 'screenshotUpload.viceMakeAria', { name: suggestion.rawName })}
        title={t(suggestion.isViceCaptain ? 'screenshotUpload.viceRemove' : 'screenshotUpload.viceMake')}
      >
        V
      </Button>
    </li>
  );
}

export function TeamScreenshotUpload({
  t,
  playerDatabase, playerDatabaseLoading, playerDatabaseError,
  onApply, startGw, isRosterEmpty = false,
  extraActions = null,
}) {
  const [proposal, setProposal] = useState(null); // null | { suggestions: [...], warning, bank, freeTransfers }
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
  // { code } bij een fout, { warning } als er niets herkend werd; null = geen melding.
  const [errorCode, setErrorCode] = useState(null);
  const [persistentNotice, setPersistentNotice] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelected = async (file) => {
    if (!file) return;
    setStatus('loading');
    setErrorCode(null);
    setPersistentNotice(null);
    try {
      let image;
      try {
        image = await downscaleImageToBase64(file);
        // De server weigert afbeeldingen boven ~4 MB (spec A5). Een heel grote screenshot schalen we
        // dan nog één keer kleiner, zodat de import gewoon blijft werken.
        if (image.base64.length > MAX_BASE64_LENGTH) image = await downscaleImageToBase64(file, 1800);
      } catch {
        throw new ScreenshotError('read_failed');
      }
      const response = await fetch('/api/analyze-screenshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: image.base64, mediaType: image.mediaType }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ScreenshotError(data.code ?? (response.status === 429 ? 'rate_limited' : 'generic'));
      const suggestions = (data.players ?? []).map(p => buildSuggestion(p, playerDatabase));
      if (suggestions.length === 0) {
        setStatus('error');
        setErrorCode({ warning: data.warning ?? { code: 'not_recognized' } });
      } else {
        setProposal({
          suggestions,
          warning: data.warning ?? null,
          bank: Number.isFinite(data.bank) ? data.bank.toFixed(1) : '',
          freeTransfers: Number.isInteger(data.freeTransfers) ? String(data.freeTransfers) : '',
        });
        setStatus('idle');
      }
    } catch (err) {
      setStatus('error');
      setErrorCode({ code: err?.code ?? 'generic' });
    }
  };

  const updateSuggestion = (index, patch) => {
    setProposal(prev => {
      if (!prev) return prev;
      return { ...prev, suggestions: prev.suggestions.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
    });
  };

  // Kapitein en vice zijn elk maar één speler, en nooit dezelfde: een rij aanzetten wist die rol op
  // elke andere rij, en de andere rol op deze rij.
  const handleToggleRole = (index, role) => {
    const other = role === 'isCaptain' ? 'isViceCaptain' : 'isCaptain';
    setProposal(prev => {
      if (!prev) return prev;
      const wasOn = prev.suggestions[index][role];
      return {
        ...prev,
        suggestions: prev.suggestions.map((s, i) => ({
          ...s,
          [role]: i === index ? !wasOn : false,
          [other]: i === index && !wasOn ? false : s[other],
        })),
      };
    });
  };

  const bankNumber = Number(String(proposal?.bank ?? '').replace(',', '.'));
  const bankValid = !proposal || proposal.bank === '' || (Number.isFinite(bankNumber) && bankNumber >= 0 && bankNumber <= 100);

  const handleApply = () => {
    if (!bankValid) return;
    const included = proposal.suggestions.filter(s => s.included && s.selectedPlayer);
    const byPosition = { GK: [], DEF: [], MID: [], FWD: [] };
    included.forEach(s => { byPosition[s.selectedPlayer.position]?.push(s); });

    // Elke positie vult haar vaste slots van links naar rechts.
    const slots = [];
    const slotOf = new Map();
    POSITIONS.forEach(pos => {
      const slotIndices = TEAM_PLANNER_SLOT_POSITIONS
        .map((p, i) => (p === pos ? i : null))
        .filter(i => i !== null);
      byPosition[pos].slice(0, slotIndices.length).forEach((suggestion, i) => {
        slots.push({ slot: slotIndices[i], player: suggestion.selectedPlayer });
        slotOf.set(suggestion, slotIndices[i]);
      });
    });

    const captain = included.find(s => s.isCaptain);
    const vice = included.find(s => s.isViceCaptain);
    onApply({
      slots,
      captainSlot: captain ? slotOf.get(captain) ?? null : null,
      viceSlot: vice ? slotOf.get(vice) ?? null : null,
      bank: proposal.bank === '' ? null : Math.round(bankNumber * 10) / 10,
      freeTransfers: proposal.freeTransfers === '' ? null : Number(proposal.freeTransfers),
    });

    if (proposal.warning) setPersistentNotice(proposal.warning);
    setProposal(null);
    setStatus('idle');
  };

  const handleCancel = () => {
    setProposal(null);
    setStatus('idle');
    setErrorCode(null);
  };

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
          {warningText(t, persistentNotice)}
        </Notice>
      )}

      {status === 'error' && !proposal && (
        <ErrorBanner onRetry={openPicker} retryLabel={t('screenshotUpload.retry')}>
          {errorCode?.warning ? warningText(t, errorCode.warning) : errorText(t, errorCode?.code)}
        </ErrorBanner>
      )}

      {proposal && (
        <section className="tp-proposal" aria-labelledby="tp-proposal-title">
          <h2 id="tp-proposal-title" className="label tp-proposal__title">{t('screenshotUpload.heading')}</h2>
          <p className="tp-proposal__hint">{t('screenshotUpload.reviewHint')}</p>
          {proposal.warning && <Notice>{warningText(t, proposal.warning)}</Notice>}
          {!isRosterEmpty && <Notice>{t('screenshotUpload.replaceWarning')}</Notice>}
          <p className="tp-proposal__hint">{t('screenshotUpload.captainGwHint', { gw: startGw })}</p>
          <ul className="tp-proposal__list">
            {proposal.suggestions.map((suggestion, index) => (
              <SuggestionRow
                key={index}
                t={t}
                suggestion={suggestion}
                index={index}
                playerDatabase={playerDatabase}
                onUpdate={updateSuggestion}
                onToggleRole={handleToggleRole}
              />
            ))}
          </ul>
          <div className="tp-proposal__extras">
            <label className="tp-field">
              <span className="label">{t('screenshotUpload.bank')}</span>
              <input
                className="ui-input ui-input--plain num"
                type="text"
                inputMode="decimal"
                value={proposal.bank}
                placeholder={t('screenshotUpload.bankPlaceholder')}
                onChange={(e) => setProposal(prev => ({ ...prev, bank: e.target.value }))}
                aria-invalid={!bankValid}
              />
            </label>
            <label className="tp-field">
              <span className="label">{t('screenshotUpload.freeTransfers', { gw: startGw })}</span>
              <Select
                value={proposal.freeTransfers}
                onChange={(v) => setProposal(prev => ({ ...prev, freeTransfers: v }))}
                options={[
                  { value: '', label: t('screenshotUpload.freeTransfersUnknown') },
                  ...Array.from({ length: TEAM_PLANNER_FREE_TRANSFER_CAP + 1 }, (_, n) => ({ value: String(n), label: String(n) })),
                ]}
              />
            </label>
          </div>
          <p className="tp-proposal__hint">{t('screenshotUpload.extrasHint')}</p>
          {!bankValid && <p className="tp-warn">{t('teamPlanner.calib.invalid', { max: 100 })}</p>}
          <div className="tp-proposal__actions">
            <Button variant="primary" icon={Check} onClick={handleApply} disabled={!bankValid}>{t('screenshotUpload.apply')}</Button>
            <Button variant="ghost" icon={X} onClick={handleCancel}>{t('screenshotUpload.cancel')}</Button>
          </div>
        </section>
      )}
    </div>
  );
}
