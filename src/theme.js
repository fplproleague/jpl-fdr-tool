// Gedeelde UI-tokens en knopstijlen voor de publieke site.
//
// Waarom dit bestand bestaat: de knopstijlen stonden vroeger als losse objectliteralen in elk
// tab-bestand apart (en `retryButtonStyle` stond zelfs twee keer LETTERLIJK gekopieerd, in
// WatchlistTab.jsx en TeamScreenshotUpload.jsx). Daardoor liepen padding, radius en font-size van
// knoppen met dezelfde rang uiteen per tab. Alles wat hier staat is één keer gedefinieerd en wordt
// overal geïmporteerd, zodat "primaire knop" er op elk tabblad identiek uitziet.
//
// Deze file bevat bewust GEEN JSX — het is een .js-bestand (zie de opmerking bovenaan constants.js).

// --- Kleuren -------------------------------------------------------------------------------------
//
// Sinds de rework (docs/redesign/DESIGN_SPEC.md) wijzen alle kleuren naar de CSS-variabelen in
// src/styles/tokens.css. Bestaande inline styles die COLORS gebruiken veranderen zo vanzelf mee. Let
// op: een var() kan je niet aanvullen met een hex-alfa (bv. accent + '33') — gebruik dan een eigen
// rgba()-token in tokens.css.
export const COLORS = {
  bg: 'var(--ink-0)',
  surface: 'var(--ink-1)',
  accent: 'var(--accent)',
  accentInk: 'var(--accent-ink)',
  text: 'var(--text-1)',
  textBody: 'var(--text-2)',
  textMuted: 'var(--text-3)',
  textSubtle: 'var(--text-3)',
  textDisabled: 'var(--text-4)',
  danger: 'var(--danger)',
  dangerInk: 'var(--text-1)',
  warning: 'var(--warning)',
  positive: 'var(--positive)',
  border: 'var(--line-strong)',
  borderSubtle: 'var(--line)',
  cardBg: 'transparent',
};

// --- Vormtokens ----------------------------------------------------------------------------------
// Hoekig: alles 2px (--r-1). Ronde vormen bestaan enkel nog voor statusstipjes.
export const RADIUS = { sm: '2px', md: '2px', lg: '2px', xl: '2px', pill: '2px' };

// --- Knoppen -------------------------------------------------------------------------------------
//
// Drie rangen (primair / secundair / gevaar) plus een vierkante icoonknop. Allemaal dezelfde radius
// (RADIUS.md), dezelfde verticale padding en dezelfde font-size, zodat knoppen die naast elkaar staan
// ook echt even hoog zijn.

const buttonBase = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  borderRadius: RADIUS.md, padding: '8px 14px', fontWeight: 700, fontSize: '13px',
  fontFamily: 'inherit', cursor: 'pointer',
};

export const primaryButtonStyle = {
  ...buttonBase,
  background: COLORS.accent, color: COLORS.accentInk, border: 'none',
};

export const secondaryButtonStyle = {
  ...buttonBase,
  background: 'transparent', color: COLORS.textBody, border: `1px solid ${COLORS.border}`,
};

export const dangerButtonStyle = {
  ...buttonBase,
  background: 'transparent', color: COLORS.danger,
  border: '1px solid var(--danger-line)', padding: '6px 12px', fontSize: '12px',
};

// Gebruikt in rode foutpanelen (spelersdatabank kon niet laden). Stond vroeger dubbel gekopieerd.
export const retryButtonStyle = {
  ...buttonBase,
  background: 'transparent', color: COLORS.dangerInk,
  border: '1px solid var(--line-strong)', padding: '6px 12px', fontSize: '12px', flexShrink: 0,
};

// Vierkante icoonknop. 34px op muis-apparaten; de globale `@media (pointer: coarse)`-regel in
// FDRTool.jsx tilt elke .fdr-icon-btn op touchtoestellen naar minimaal 44x44px, zodat we hier geen
// aparte mobiele maat hoeven te definiëren.
export const iconButtonStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '34px', height: '34px', flexShrink: 0,
  background: 'transparent', color: COLORS.textBody,
  border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, cursor: 'pointer',
};

export const selectStyle = {
  background: COLORS.surface, color: COLORS.text, border: '1px solid var(--line-strong)',
  borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: '12px', fontFamily: 'inherit',
};
