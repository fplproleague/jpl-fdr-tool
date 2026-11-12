// Inhoud van de Set Pieces-tab: huidige strafschop-/corner-/vrijetrapnemers per club. De data komt uit
// een eigen werkblad in dezelfde Google Sheet als de spelersdatabank (zie SET_PIECES_CSV_URL in
// constants.js) en blijft dus zonder codewijziging aanpasbaar door de sheet te bewerken. Het ophalen
// gebeurt in FDRTool.jsx (de speler-sheet toont de nemer-rol ook vanuit andere tabs).
//
// Sinds de rework (spec §7.7): één matrix i.p.v. 18 clubkaarten. Rijen = clubs (sticky), kolommen =
// Penalty's · Corners · Vrije trappen. Een cel toont de eerste keuze (foto + naam, klikbaar) met de
// andere namen eronder. Een stip zegt hoe zeker dat is (zie certaintyOf), met een legende erboven.
// Op gsm standaard één kolom tegelijk, te kiezen met een Segmented.
import { useState } from 'react';
import PageHeader from '../ui/PageHeader';
import Segmented from '../ui/Segmented';
import DataTable from '../ui/DataTable';
import ErrorBanner from '../ui/ErrorBanner';
import EmptyState from '../ui/EmptyState';
import { PlayerFaceByName } from '../ui/PlayerFace';
import { ClubLogo } from '../components/SpelersParts';
import './SetPiecesTab.css';

const KINDS = [
  { key: 'penalties', labelKey: 'setpieces.col.penalties' },
  { key: 'corners', labelKey: 'setpieces.col.corners' },
  { key: 'freeKicks', labelKey: 'setpieces.col.freeKicks' },
];

// De sheet gebruikt korte, leesbare namen ("Sikan"), de spelersdatabank volledige ("Danylo Sikan").
// Zoekt binnen dezelfde club naar de speler die bij zo'n losse naam hoort, en geeft de volledige naam
// terug — dat is waarmee de speler-sheet zijn eigen gegevens terugvindt. null als er niets bij past.
function resolvePlayerName(rawName, clubCode, playerDatabase) {
  const token = rawName.trim().toLowerCase();
  if (token.length < 3) return null;
  const match = playerDatabase.find(p =>
    p.teamCode === clubCode &&
    (p.name.toLowerCase() === token ||
     p.name.toLowerCase().includes(token) ||
     token.includes(p.name.toLowerCase())));
  return match?.name ?? null;
}

// "Sikan / Ambros / Cvetkovic ?" -> namen in volgorde. De tekst zelf blijft ongewijzigd (geen
// herordening). Een "?" in de cel betekent: niet bevestigd.
function parseValue(value) {
  const text = (value ?? '').trim();
  const names = text.split('/').map(s => s.replace(/\?/g, '').trim()).filter(Boolean);
  return { names, uncertain: text.includes('?') };
}

// Zekerheid van een cel, met dezelfde stippen als de startzekerheid (spec §3.3):
// één naam = zeker (gevuld groen), meerdere namen = gedeeld (open groen), "?" = onzeker (geel).
function certaintyOf({ names, uncertain }) {
  if (uncertain) return 'uncertain';
  return names.length > 1 ? 'shared' : 'sure';
}

function NameButton({ name, clubCode, playerDatabase, onOpenPlayer, t, className }) {
  const fullName = onOpenPlayer ? resolvePlayerName(name, clubCode, playerDatabase) : null;
  // Een naam wordt enkel een knop als hij écht een speler oplevert: een klik die op een lege kaart
  // uitkomt is een loze belofte, en de sheet bevat ook vrije tekst.
  if (!fullName) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      className={`sp-name-btn ${className ?? ''}`}
      onClick={() => onOpenPlayer(fullName, clubCode)}
      aria-label={t('playerSheet.openAria', { name: fullName })}
    >
      {name}
    </button>
  );
}

function SetPieceCell({ value, clubCode, playerDatabase, onOpenPlayer, t }) {
  const parsed = parseValue(value);
  if (parsed.names.length === 0) return null;
  const [first, ...rest] = parsed.names;
  const certainty = certaintyOf(parsed);
  const firstFull = resolvePlayerName(first, clubCode, playerDatabase) ?? first;
  return (
    <span className="sp-cell">
      <span className={`sp-dot is-${certainty}`} role="img" aria-label={t(`setpieces.certainty.${certainty}`)} title={t(`setpieces.certainty.${certainty}`)} />
      <PlayerFaceByName name={firstFull} clubCode={clubCode} size={20} />
      <span className="sp-cell__text">
        <NameButton name={first} clubCode={clubCode} playerDatabase={playerDatabase} onOpenPlayer={onOpenPlayer} t={t} className="sp-cell__first" />
        {rest.length > 0 && (
          <span className="sp-cell__rest">
            {rest.map((n, i) => (
              <span key={n}>
                {i > 0 && ' / '}
                <NameButton name={n} clubCode={clubCode} playerDatabase={playerDatabase} onOpenPlayer={onOpenPlayer} t={t} />
              </span>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

export default function SetPiecesTab({
  t, entries = [], updatedGw = '', loading, error, retry, onOpenPlayer, onOpenClub, playerDatabase = [],
}) {
  // Gsm: één kolom tegelijk (spec §7.7). Op desktop staan alle drie de kolommen er en is deze keuze verborgen.
  const [kind, setKind] = useState('penalties');

  const columns = [
    {
      key: 'club', label: t('setpieces.col.club'), sticky: true, stickyEdge: true, rowHeader: true,
      render: e => (onOpenClub && e.clubCode ? (
        <button type="button" className="sp-club sp-club--btn" onClick={() => onOpenClub(e.clubCode)} aria-label={t('clubSheet.openAria', { club: e.clubName })}>
          <ClubLogo code={e.clubCode} size={20} /><span className="sp-club__code">{e.clubCode}</span><span className="sp-club__name">{e.clubName}</span>
        </button>
      ) : (
        <span className="sp-club"><ClubLogo code={e.clubCode} size={20} /><span className="sp-club__code">{e.clubCode ?? e.clubName}</span></span>
      )),
    },
    ...KINDS.map(k => ({
      key: k.key, label: t(k.labelKey), className: `sp-col sp-col--${k.key}`,
      render: e => <SetPieceCell value={e[k.key]} clubCode={e.clubCode} playerDatabase={playerDatabase} onOpenPlayer={onOpenPlayer} t={t} />,
    })),
  ];

  const meta = updatedGw ? <span className="num">{t('setpieces.updatedMeta', { gw: updatedGw })}</span> : null;

  return (
    <div className="sp">
      <PageHeader title={t('nav.setpieces')} meta={meta} intro={t('setpieces.introShort')} />

      <div className="sp-legend" role="list" aria-label={t('setpieces.legendAria')}>
        {['sure', 'shared', 'uncertain'].map(c => (
          <span key={c} className="sp-legend__item" role="listitem">
            <span className={`sp-dot is-${c}`} aria-hidden="true" /> {t(`setpieces.certainty.${c}`)}
          </span>
        ))}
      </div>

      <Segmented
        className="sp-kind"
        ariaLabel={t('setpieces.kindAria')}
        value={kind}
        onChange={setKind}
        options={KINDS.map(k => ({ value: k.key, label: t(k.labelKey) }))}
      />

      {!loading && error && <ErrorBanner onRetry={retry} retryLabel={t('shared.retry')}>{t(error)}</ErrorBanner>}
      {!loading && !error && entries.length === 0 && <EmptyState>{t('setpieces.emptyState')}</EmptyState>}

      {(loading || (!error && entries.length > 0)) && (
        <DataTable
          className={`sp-table is-show-${kind}`}
          bleed
          loading={loading}
          columns={columns}
          rows={entries}
          rowKey={(e, i) => e.clubCode ?? `${e.clubName}-${i}`}
          ariaLabel={t('nav.setpieces')}
        />
      )}
    </div>
  );
}
