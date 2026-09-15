// Inhoud van de Set Pieces-tab: huidige strafschop-/corner-/vrijetrapnemers per club. De data komt uit
// een eigen werkblad in dezelfde Google Sheet als de spelersdatabank (zie SET_PIECES_CSV_URL in
// constants.js) en blijft dus zonder codewijziging aanpasbaar door de sheet te bewerken.
//
// Het ophalen zelf gebeurt niet meer hier maar in FDRTool.jsx: de speler-sheet toont de nemer-rol ook
// wanneer hij vanuit Bonuspunten of Kaarten opent, en die data moet dan al binnen zijn zonder dat het
// openen van een sheet een netwerkverzoek kost. Deze tab krijgt het resultaat dus als props, net als
// WatchlistTab/BonuspuntenTab dat met de spelersdatabank doen.
import React from 'react';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

// P/C/FK-badge — zowel in de legende als vóór elke rij in een kaart, vandaar een gedeeld component i.p.v.
// de opmaak dubbel te schrijven.
function CategoryBadge({ label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      width: '20px', height: '20px', borderRadius: '50%',
      background: 'rgba(78,205,196,0.15)', border: '1px solid #4ECDC4', color: '#4ECDC4',
      fontSize: label.length > 1 ? '8px' : '10px', fontWeight: 800,
    }}>
      {label}
    </span>
  );
}

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

// Splitst een waarde als "Sikan / Ambros / Cvetkovic ?" op de "/"-scheidingstekens en de "?" (allebei
// als apart element behouden, zie de capturing group) zodat enkel het vraagteken in goud gerenderd kan
// worden en elke naam apart aanklikbaar is. De tekst zelf blijft ongewijzigd en in de oorspronkelijke
// volgorde staan. Geen alfabetische herordening, geen andere symbolen i.p.v. "?".
//
// Een naam wordt alleen een knop als hij ook écht een speler oplevert: een klik die op een lege kaart
// uitkomt is een loze belofte, en deze sheet bevat ook vrije tekst die geen spelersnaam is.
function formatSetPieceValue(value, { clubCode, playerDatabase, onOpenPlayer, t }) {
  return value.split(/([/?])/g).filter(part => part !== '').map((part, i) => {
    if (part === '?') return <span key={i} style={{ color: '#E8C547', fontWeight: 800 }}>?</span>;
    if (part === '/') return <span key={i}>{part}</span>;
    const fullName = onOpenPlayer ? resolvePlayerName(part, clubCode, playerDatabase) : null;
    if (!fullName) return <span key={i}>{part}</span>;
    // De omliggende spaties blijven buiten de knop staan, anders krijgt het onderstreepte
    // klikgebied een losse spatie mee aan het begin of einde.
    const [, before, name, after] = part.match(/^(\s*)(.*?)(\s*)$/);
    return (
      <span key={i}>
        {before}
        <button
          type="button"
          onClick={() => onOpenPlayer(fullName, clubCode)}
          aria-label={t('playerSheet.openAria', { name: fullName })}
          style={{
            background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit',
            cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(78,205,196,0.5)',
            textUnderlineOffset: '3px',
          }}
        >
          {name}
        </button>
        {after}
      </span>
    );
  });
}

function SetPieceRow({ label, value, ...linkProps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 0' }}>
      <CategoryBadge label={label} />
      <span style={{ color: '#EDE4F5', fontSize: '13px', fontWeight: 600, lineHeight: 1.45, wordBreak: 'break-word' }}>
        {value ? formatSetPieceValue(value, linkProps) : <span style={{ color: '#6B5289' }}>—</span>}
      </span>
    </div>
  );
}

function SetPieceCard({ entry, playerDatabase, onOpenPlayer, onOpenClub, t }) {
  const linkProps = { clubCode: entry.clubCode, playerDatabase, onOpenPlayer, t };
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px', padding: '14px 16px',
    }}>
      {/* De kaartkop opent de clubkaart — logo en clubnaam samen, want 22px logo alleen is een te
          klein tikdoel. Zonder onOpenClub blijft het gewoon een kop. */}
      {React.createElement(
        onOpenClub && entry.clubCode ? 'button' : 'div',
        {
          type: onOpenClub && entry.clubCode ? 'button' : undefined,
          onClick: onOpenClub && entry.clubCode ? () => onOpenClub(entry.clubCode) : undefined,
          'aria-label': onOpenClub && entry.clubCode ? t('clubSheet.openAria', { club: entry.clubName }) : undefined,
          className: onOpenClub && entry.clubCode ? 'fdr-touch-target' : undefined,
          style: {
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
            paddingBottom: '10px', marginBottom: '10px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            padding: '0 0 10px', textAlign: 'left', fontFamily: 'inherit',
            cursor: onOpenClub && entry.clubCode ? 'pointer' : undefined,
          },
        },
        entry.clubCode ? (
          <img
            key="logo"
            src={`/club-logos/${entry.clubCode}.webp`}
            alt=""
            style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : null,
        <span key="naam" style={{
          color: '#FFF', fontWeight: 800, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.01em',
        }}>
          {entry.clubName}
        </span>,
      )}
      <SetPieceRow label="P" value={entry.penalties} {...linkProps} />
      <SetPieceRow label="C" value={entry.corners} {...linkProps} />
      <SetPieceRow label="FK" value={entry.freeKicks} {...linkProps} />
    </div>
  );
}

const CATEGORY_LEGEND = [
  { label: 'P', textKey: 'setpieces.legend.penalty' },
  { label: 'C', textKey: 'setpieces.legend.corner' },
  { label: 'FK', textKey: 'setpieces.legend.freeKick' },
];

export default function SetPiecesTab({
  t, entries = [], updatedGw = '', loading, error, retry, onOpenPlayer, onOpenClub, playerDatabase = [],
}) {
  return (
    <>
      {/* Legende + laatste update — zelfde stijl als de safety-kleurenlegende op de Predicted
          Lineups-tab: badge + korte uitleg, zodat de P/C/FK-afkortingen zonder tooltip duidelijk
          blijven. Bovenaan de tab, want de titel/subtitel/uitleg zijn hier bewust weggelaten. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
        marginBottom: '18px',
      }}>
        <div style={{
          display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center',
          fontSize: '11px', fontWeight: 700, color: '#C9B8E0',
        }}>
          {CATEGORY_LEGEND.map(({ label, textKey }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CategoryBadge label={label} />
              {t(textKey)}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#E8C547', fontWeight: 800, fontSize: '13px' }}>?</span>
            {t('setpieces.legend.uncertain')}
          </div>
        </div>
        {updatedGw && (
          <span style={{
            color: '#4ECDC4', fontWeight: 800, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'rgba(78,205,196,0.12)', border: '1px solid rgba(78,205,196,0.3)',
            borderRadius: '999px', padding: '5px 14px', whiteSpace: 'nowrap',
          }}>
            {t('setpieces.updatedLabel', { gw: updatedGw })}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
          <Loader2 size={16} className="fdr-spin" /> {t('setpieces.loading')}
        </div>
      )}

      {!loading && error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          background: 'rgba(194,64,44,0.12)', border: '1px solid rgba(194,64,44,0.4)',
          borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
        }}>
          <AlertCircle size={16} color="#C2402C" style={{ flexShrink: 0 }} />
          <span style={{ color: '#FBEAE7', fontSize: '13px', flex: 1 }}>{t(error)}</span>
          <button onClick={retry} style={retryButtonStyle}>
            <RotateCcw size={14} /> {t('shared.retry')}
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
            {t('setpieces.emptyState')}
          </p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '12px' }}>
          {entries.map((entry, i) => (
            <SetPieceCard
              key={entry.clubCode ?? `${entry.clubName}-${i}`}
              entry={entry}
              playerDatabase={playerDatabase}
              onOpenPlayer={onOpenPlayer}
              onOpenClub={onOpenClub}
              t={t}
            />
          ))}
        </div>
      )}
    </>
  );
}
