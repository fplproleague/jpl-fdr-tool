// Lijst opgeslagen lineups voor de huidige club (Open/Dupliceer/Verwijder) + het notitieveld. Beide
// staan hier bewust BUITEN PitchField's forwardRef-boom (zie PredictedXiBuilder.jsx) — een JSX-sibling
// van de geëxporteerde container, nooit een descendant, dus html2canvas kan dit structureel nooit
// meenemen in de export, ongeacht timing.
import { Copy, Trash2, FolderOpen } from 'lucide-react';
import { draftDisplayLabel } from './storage';

export default function DraftsPanel({ drafts, clubCode, openDraftId, onOpen, onDuplicate, onDelete, notes, onNotesChange }) {
  const clubDrafts = drafts
    .filter(d => d.clubCode === clubCode)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3 style={{ color: '#C9B8E0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 8px' }}>
          Opgeslagen lineups
        </h3>
        {clubDrafts.length === 0 ? (
          <p style={{ color: '#6B5289', fontSize: '12px' }}>Nog geen opgeslagen lineup voor deze club — begin met spelers toe te voegen, dit wordt automatisch bewaard.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {clubDrafts.map(draft => (
              <div
                key={draft.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px',
                  background: draft.id === openDraftId ? 'rgba(78,205,196,0.12)' : 'rgba(255,255,255,0.04)',
                  border: draft.id === openDraftId ? '1px solid #4ECDC4' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0, color: '#FFF', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {draftDisplayLabel(draft)}
                </span>
                {draft.id !== openDraftId && (
                  <button onClick={() => onOpen(draft.id)} title="Open" style={iconButtonStyle}>
                    <FolderOpen size={13} />
                  </button>
                )}
                <button onClick={() => onDuplicate(draft.id)} title="Dupliceer" style={iconButtonStyle}>
                  <Copy size={13} />
                </button>
                <button onClick={() => onDelete(draft.id)} title="Verwijder" style={{ ...iconButtonStyle, color: '#C2402C' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 style={{ color: '#C9B8E0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 8px' }}>
          Notities
        </h3>
        <p style={{ color: '#6B5289', fontSize: '11px', margin: '0 0 6px' }}>Verschijnt nooit op de geëxporteerde afbeelding.</p>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Eigen aantekeningen bij deze lineup..."
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box', background: '#3D1E5C', color: '#FFF',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 10px',
            fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      </div>
    </div>
  );
}

const iconButtonStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px',
  flexShrink: 0, background: 'transparent', color: '#8F79AD', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', cursor: 'pointer',
};
