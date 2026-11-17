// Het "Meer"-menu op gsm (spec §5.1): een bottom sheet met rijen van 48px — Bonuspunten, Set pieces,
// Kaarten, Klassement — scheidingslijn — Taal — Minileague [Kopieer] — @fpl_proleague op X.
import { useRef } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { useOverlayBehavior } from '../components/Sheet';
import Segmented from './Segmented';
import './Button.css';
import './Sheet.css';

export default function BottomSheetMenu({
  t, title, onClose, routes, activeTab, hrefFor, onNavigate, language, languageOptions, onChangeLanguage,
  minileagueCode, onCopyMinileague, minileagueCopied,
}) {
  const panelRef = useRef(null);
  const touch = useOverlayBehavior({ onClose, panelRef });
  return (
    <div className="ui-sheet-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-more-title"
        tabIndex={-1}
        className="ui-sheet ui-sheet--menu"
        onClick={e => e.stopPropagation()}
        {...touch}
      >
        <div className="ui-sheet__grip" aria-hidden="true" />
        <div className="ui-sheet__head">
          <h2 id="ui-more-title" className="ui-sheet__title">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('shell.closeMenu')} className="ui-btn ui-btn--icon ui-btn--bare ui-sheet__close">
            <X aria-hidden="true" strokeWidth={1.75} />
          </button>
        </div>
        <div className="ui-sheet__body" style={{ padding: 0 }}>
          <ul className="ui-menu-list">
            {routes.map(r => (
              <li key={r.key}>
                <a
                  href={hrefFor(r.key)}
                  className="ui-menu-row"
                  aria-current={activeTab === r.key ? 'page' : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    onNavigate(r.key);
                  }}
                >
                  {t(`nav.${r.key}`)}
                </a>
              </li>
            ))}
          </ul>
          <div className="ui-menu-sep" />
          <ul className="ui-menu-list">
            <li className="ui-menu-row ui-menu-row--static">
              <span>{t('shell.language')}</span>
              <Segmented options={languageOptions} value={language} onChange={onChangeLanguage} ariaLabel={t('shell.language')} />
            </li>
            <li>
              <button type="button" className="ui-menu-row" onClick={onCopyMinileague} aria-label={t('header.copyMinileagueAria', { code: minileagueCode })}>
                {t('shell.minileague')} <span className="num">{minileagueCode}</span>
                <span className="ui-menu-row__meta">{minileagueCopied ? t('shell.copied') : t('shell.copyMinileague')}</span>
                {minileagueCopied ? <Check aria-hidden="true" strokeWidth={2} /> : <Copy aria-hidden="true" strokeWidth={1.75} />}
              </button>
            </li>
            <li>
              <a className="ui-menu-row" href="https://x.com/fpl_proleague" target="_blank" rel="noopener noreferrer">
                {t('shell.followX')}
                <span className="ui-menu-row__meta" />
                <ExternalLink aria-hidden="true" strokeWidth={1.75} />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
