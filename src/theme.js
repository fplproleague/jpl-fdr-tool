// Kleurnamen voor de paar inline styles die nog in JavaScript staan (bv. de laadmelding in FDRTool.jsx).
//
// Alle kleuren wijzen naar de CSS-variabelen in src/styles/tokens.css (spec §3), dus ze veranderen
// vanzelf mee. Let op: een var() kan je niet aanvullen met een hex-alfa (bv. accent + '33'); maak
// daarvoor een eigen token in tokens.css.
//
// Tot fase 4 van de rework stonden hier ook knopstijlen (primair, secundair, icoon, ...). Die zijn
// vervangen door src/ui/Button.jsx en weg.
//
// Deze file bevat bewust GEEN JSX: het is een .js-bestand (zie de opmerking bovenaan constants.js).
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
