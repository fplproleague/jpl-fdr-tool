// AppShell (spec §5.1): de schil rond elke pagina. Vervangt de oude header, de twee <nav>-blokken en
// de footer uit FDRTool.jsx. De state (taal, actieve tab, deadline, minileague) blijft in FDRTool.jsx
// en komt hier binnen via props.
//
// Desktop (≥900px): één sticky topbalk van 56px met wordmark, 8 tabs (4 hoofd + 4 extra), minileague,
// deadline en taal. Gsm (<900px): topbalk van 48px (wordmark + deadline) en een vaste onderbalk met 5
// kolommen (FDR, XI's, Planner, Spelers, Meer). "Meer" opent een bottom sheet.
import { useState } from 'react';
import { Grid2x2, Shirt, Users, UserSearch, Menu, Copy, Check } from 'lucide-react';
import { PRIMARY_ROUTES, SECONDARY_ROUTES } from '../routes';
import Segmented from './Segmented';
import BottomSheetMenu from './BottomSheetMenu';
import './AppShell.css';

const PRIMARY_ICONS = { fdr: Grid2x2, predictedlineups: Shirt, teamplanner: Users, spelers: UserSearch };

// "8d 05u" / "4u 07m" / "12m": compact en in vaste breedte (monospace), zodat de topbalk niet verspringt.
// Uren zijn "u" in het Nederlands, "h" in het Frans en Engels.
export function formatShellCountdown(remaining, language = 'nl') {
  if (!remaining) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const h = language === 'nl' ? 'u' : 'h';
  if (remaining.days > 0) return `${remaining.days}d ${pad(remaining.hours)}${h}`;
  if (remaining.hours > 0) return `${remaining.hours}${h} ${pad(remaining.minutes)}m`;
  return `${remaining.minutes}m`;
}

function deadlineTone(remaining) {
  if (!remaining) return '';
  if (remaining.totalMinutes <= 120) return ' is-danger';
  if (remaining.totalMinutes <= 24 * 60) return ' is-soon';
  return '';
}

function NavLink({ route, active, hrefFor, onNavigate, t, compact = false, marker = false }) {
  const Icon = PRIMARY_ICONS[route.key];
  return (
    <a
      href={hrefFor(route.key)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate(route.key);
      }}
      aria-current={active ? 'page' : undefined}
      className={compact ? 'ui-bottomnav__item' : 'ui-topnav__item'}
      aria-label={compact ? t(`nav.${route.key}`) : undefined}
    >
      {compact && Icon && <Icon aria-hidden="true" strokeWidth={1.75} />}
      <span className={compact ? 'ui-bottomnav__label' : undefined}>
        {compact ? t(`nav.compact.${route.key}`) : t(`nav.${route.key}`)}
      </span>
      {marker && <span className="ui-new-marker" aria-label={t('shell.newMarker')} role="img" />}
    </a>
  );
}

export default function AppShell({
  t, language, languages, onChangeLanguage, activeTab, onNavigate, hrefFor,
  deadlineGw, deadlineRemaining, minileagueCode, onCopyMinileague, minileagueCopied,
  newMarkerTab, lastUpdated, children,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const countdown = formatShellCountdown(deadlineRemaining, language);
  const deadlineText = countdown
    ? <><span className="ui-deadline__gw">{t('shell.deadline', { gw: deadlineGw })}</span> <span className="num">{countdown}</span></>
    : <span>{t('shell.live', { gw: deadlineGw })}</span>;
  const deadlineAria = countdown ? t('shell.deadlineAria', { gw: deadlineGw, time: countdown }) : t('shell.live', { gw: deadlineGw });
  const moreActive = SECONDARY_ROUTES.some(r => r.key === activeTab);
  const languageOptions = languages.map(l => ({ value: l, label: l.toUpperCase() }));

  const minileagueButton = (className) => (
    <button type="button" className={className} onClick={onCopyMinileague} aria-label={t('header.copyMinileagueAria', { code: minileagueCode })}>
      {t('shell.minileague')} <span className="num">{minileagueCode}</span>
      {minileagueCopied ? <Check aria-hidden="true" strokeWidth={2} /> : <Copy aria-hidden="true" strokeWidth={1.75} />}
      {minileagueCopied && <span className="ui-sr-only" role="status">{t('shell.copied')}</span>}
    </button>
  );

  return (
    <div className="ui-shell">
      <a href="#fdr-main" className="fdr-skip-link">{t('a11y.skipToContent')}</a>

      <header className="ui-topbar">
        <div className="ui-topbar__inner">
          <a
            href={hrefFor('fdr')}
            className="ui-wordmark"
            aria-label={t('shell.homeAria')}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onNavigate('fdr');
            }}
          >
            <span className="ui-wordmark__name">FPL Pro League</span>
            <span className="ui-wordmark__sub">{t('shell.brandSub')}</span>
          </a>

          <nav className="ui-topnav" aria-label={t('nav.aria')}>
            {PRIMARY_ROUTES.map(r => (
              <NavLink key={r.key} route={r} active={activeTab === r.key} hrefFor={hrefFor} onNavigate={onNavigate} t={t} marker={newMarkerTab === r.key} />
            ))}
            <span className="ui-topnav__sep" aria-hidden="true" />
            {SECONDARY_ROUTES.map(r => (
              <NavLink key={r.key} route={r} active={activeTab === r.key} hrefFor={hrefFor} onNavigate={onNavigate} t={t} />
            ))}
          </nav>

          <div className="ui-topbar__end">
            {minileagueButton('ui-minileague ui-minileague--top')}
            <span className={`ui-deadline${deadlineTone(deadlineRemaining)}`} aria-label={deadlineAria}>{deadlineText}</span>
            <div className="ui-topbar__lang">
              <Segmented
                size="sm"
                options={languageOptions}
                value={language}
                onChange={onChangeLanguage}
                ariaLabel={t('header.languageToggleAria', { lang: language.toUpperCase() })}
              />
            </div>
          </div>
        </div>
      </header>

      <main id="fdr-main" tabIndex={-1} className="ui-main">
        {children}
      </main>

      <footer className="ui-footer">
        <a href="https://x.com/fpl_proleague" target="_blank" rel="noopener noreferrer" className="ui-footer__link">@fpl_proleague</a>
        <span aria-hidden="true">·</span>
        <span>{t('footer.season')}</span>
        <span aria-hidden="true">·</span>
        <span>{t('footer.data')}</span>
        <span aria-hidden="true">·</span>
        <span>{t('footer.updated', { date: lastUpdated })}</span>
        <span aria-hidden="true">·</span>
        {minileagueButton('ui-minileague')}
      </footer>

      <nav className="ui-bottomnav" aria-label={t('nav.aria')}>
        {PRIMARY_ROUTES.map(r => (
          <NavLink key={r.key} route={r} active={activeTab === r.key} hrefFor={hrefFor} onNavigate={onNavigate} t={t} compact marker={newMarkerTab === r.key} />
        ))}
        <button
          type="button"
          className="ui-bottomnav__item"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <Menu aria-hidden="true" strokeWidth={1.75} />
          <span className="ui-bottomnav__label">{t('nav.compact.more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <BottomSheetMenu
          t={t}
          title={t('shell.moreTitle')}
          onClose={() => setMoreOpen(false)}
          routes={SECONDARY_ROUTES}
          activeTab={activeTab}
          hrefFor={hrefFor}
          onNavigate={(key) => { setMoreOpen(false); onNavigate(key); }}
          language={language}
          languageOptions={languageOptions}
          onChangeLanguage={onChangeLanguage}
          minileagueCode={minileagueCode}
          onCopyMinileague={onCopyMinileague}
          minileagueCopied={minileagueCopied}
        />
      )}
    </div>
  );
}
