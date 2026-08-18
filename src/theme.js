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
// De contrastwaarden hieronder zijn berekend t.o.v. de paginakleur (#2A1440) en de kaartkleur
// (#3D1E5C). De twee "muted" tinten zijn opgetrokken t.o.v. hun vorige waarden omdat die onder de
// WCAG AA-drempel van 4.5:1 zaten — precies op de plaatsen waar het het meest telt: de uitleg boven
// elke tab en álle lege-toestand-teksten ("Je watchlist is nog leeg", ...), dus exact de tekst die
// een nieuwe bezoeker moet lezen.
export const COLORS = {
  bg: '#2A1440',
  surface: '#3D1E5C',
  accent: '#4ECDC4',
  accentInk: '#0B2E1B',
  text: '#FFFFFF',
  // Hoofdtekst — was al ruim in orde (8.97:1).
  textBody: '#C9B8E0',
  // Secundaire tekst / uitleg boven elke tab. Was #8F79AD (4.33:1 → zakte net onder AA).
  // Nu 6.02:1 op de pagina en 4.98:1 op een kaart.
  textMuted: '#A794C2',
  // Tertiaire tekst / lege toestanden / footer. Was #6B5289 (2.51:1 — ruim onvoldoende).
  // Nu 6.00:1 op de pagina en 4.96:1 op een kaart. Bewust iets doffer dan textMuted zodat de
  // hiërarchie tussen "uitleg" en "lege toestand" behouden blijft.
  textSubtle: '#A594C4',
  // Uitgeschakelde tekst. Was #5A4A72 (2.09:1). Disabled-tekst valt formeel buiten WCAG 1.4.3,
  // maar 4.15:1 is een stuk leesbaarder zonder dat "uit" er actief uit gaat zien.
  textDisabled: '#8878A5',
  danger: '#C2402C',
  dangerInk: '#FBEAE7',
  warning: '#E8C547',
  border: 'rgba(255,255,255,0.2)',
  borderSubtle: 'rgba(255,255,255,0.08)',
  cardBg: 'rgba(255,255,255,0.04)',
};

// --- Vormtokens ----------------------------------------------------------------------------------
export const RADIUS = { sm: '6px', md: '8px', lg: '10px', xl: '14px', pill: '999px' };

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
  border: '1px solid rgba(194,64,44,0.4)', padding: '6px 12px', fontSize: '12px',
};

// Gebruikt in rode foutpanelen (spelersdatabank kon niet laden). Stond vroeger dubbel gekopieerd.
export const retryButtonStyle = {
  ...buttonBase,
  background: 'transparent', color: COLORS.dangerInk,
  border: '1px solid rgba(251,234,231,0.4)', padding: '6px 12px', fontSize: '12px', flexShrink: 0,
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
  background: COLORS.surface, color: COLORS.text, border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: '12px', fontFamily: 'inherit',
};
