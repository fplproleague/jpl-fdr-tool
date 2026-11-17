// Rondleiding voor nieuwe bezoekers (feedback eigenaar, november 2026).
//
// Bij het allereerste bezoek verschijnt een klein welkomstkader (met taalkeuze, want een eerste bezoek
// staat standaard in het Nederlands). Daaruit start de rondleiding: stap voor stap licht één onderdeel
// van de echte pagina op, met een kort kaartje erbij. Het "?"-knopje bovenaan start ze opnieuw.
//
// Dit bestand is puur (geen React): de lijst met stappen, wat er bewaard wordt en welk toestel het is.
// De weergave staat in src/components/Tour.jsx, de teksten in src/i18n.js (tour.*).

// Onthoudt enkel DAT het welkomstkader al getoond is ('1'), niets anders.
export const TOUR_SEEN_KEY = 'fpl_proleague_tour_seen_v1';

// Zelfde grens als de onderbalk in src/ui/AppShell.css: daaronder is het de gsm-weergave.
export const MOBILE_QUERY = '(max-width: 899px)';

// Elke stap: id (= tekstsleutels tour.step.<id>.title/.body), de tab waar hij speelt (of geen) en de
// onderdelen die oplichten. `target` is een lijst CSS-selectors: de eerste die op de pagina staat, telt.
// Staat er geen enkele (bv. de veldweergave is niet open), dan staat het kaartje gewoon in het midden.
// Een object { desktop, mobile } kiest per toestel; `mobileBody` = een eigen tekst voor gsm.
// `maxHeight` = enkel het bovenste stuk van een groot onderdeel licht op (bv. de kop en de eerste rijen
// van de FDR-tabel), zodat het kaartje er nog onder past.
const STEPS = [
  {
    id: 'nav',
    target: { desktop: ['.ui-topbar'], mobile: ['.ui-bottomnav'] },
    mobileBody: true,
  },
  {
    id: 'fdr',
    tab: 'fdr',
    // De kleuren in de tabel zelf (feedback eigenaar: de knoppenbalk zegt op gsm bijna niets).
    target: ['.fdr-table-scroll', '.fdr-grid'],
    maxHeight: 230,
    // Op gsm zijn de knoppen enkel icoontjes: de tekst noemt ze daar zo.
    mobileBody: true,
  },
  {
    id: 'xi',
    tab: 'predictedlineups',
    target: { desktop: ['.pxl-matches', '.pxl-toolbar'], mobile: ['.pxl-pitches', '.pxl-toolbar'] },
    mobileBody: true,
  },
  {
    id: 'planner',
    tab: 'teamplanner',
    target: ['.tp-pitch'],
  },
  {
    id: 'budget',
    tab: 'teamplanner',
    target: ['.tp-status'],
  },
  {
    id: 'spelers',
    tab: 'spelers',
    target: ['.spl-presets', '.spl-toolbar'],
  },
  {
    // Spelers- en clubkaarten openen (feedback eigenaar). De eerste rij van de spelerstabel licht op;
    // laadt die nog, dan het kaartje in het midden.
    id: 'cards',
    tab: 'spelers',
    target: ['.spl tbody tr'],
    mobileBody: true,
  },
  {
    id: 'setpieces',
    tab: 'setpieces',
    target: ['.sp-legend'],
  },
  {
    id: 'klassement',
    tab: 'klassement',
    target: ['.kl-toolbar'],
  },
  {
    // Op het startscherm zetten: tekst voor iPhone/iPad of Android, zie installPlatform.
    id: 'install',
    install: true,
  },
  {
    id: 'done',
    target: ['[data-tour="help"]'],
  },
];

export const INSTALL_PLATFORMS = ['ios', 'android'];

// De stappen voor dit toestel. platform = 'ios' | 'android' | 'desktop' (zie installPlatform).
// De startschermstap (feedback eigenaar): op elke gsm of tablet, dus bij een gsm-weergave (smal scherm)
// of een iPhone/iPad/Android-toestel, maar niet op een computer met een breed venster. Ze valt ook weg
// als de site al als app op het startscherm staat en van daaruit geopend is.
export function tourSteps({ mobile = false, standalone = false, platform = 'desktop' } = {}) {
  const device = mobile ? 'mobile' : 'desktop';
  const onPhone = mobile || INSTALL_PLATFORMS.includes(platform);
  return STEPS
    .filter(step => !(step.install && (standalone || !onPhone)))
    .map(step => {
      const target = Array.isArray(step.target) ? step.target : (step.target?.[device] ?? []);
      let body = mobile && step.mobileBody ? 'bodyMobile' : 'body';
      if (step.install) body = platform === 'ios' ? 'ios' : 'android';
      return {
        id: step.id,
        tab: step.tab ?? null,
        target,
        maxHeight: step.maxHeight ?? null,
        install: Boolean(step.install),
        titleKey: `tour.step.${step.id}.title`,
        bodyKey: `tour.step.${step.id}.${body}`,
      };
    });
}

// Alle tekstsleutels die de rondleiding kan gebruiken (voor de test die nakijkt of ze in de drie talen
// bestaan).
export function tourTextKeys() {
  const keys = new Set();
  for (const mobile of [false, true]) {
    for (const platform of INSTALL_PLATFORMS) {
      for (const step of tourSteps({ mobile, platform })) {
        keys.add(step.titleKey);
        keys.add(step.bodyKey);
      }
    }
  }
  return [...keys];
}

// Welke uitleg past bij het op-het-startscherm-zetten. iPadOS doet zich voor als een Mac, maar heeft
// een aanraakscherm: dat telt als iPhone/iPad.
export function installPlatform(userAgent = '', maxTouchPoints = 0) {
  const ua = String(userAgent);
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function hasSeenTour(storage) {
  try {
    return storage?.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    // Geen opslag (privévenster met blokkering): toon het kader niet bij elke klik opnieuw.
    return true;
  }
}

export function markTourSeen(storage) {
  try {
    storage?.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    // opslag niet beschikbaar: dan verschijnt het kader bij een volgend bezoek gewoon opnieuw
  }
}

// Waar het kaartje komt, naast het oplichtende onderdeel. Puur rekenwerk zodat het te testen valt.
// rect = het onderdeel (in px t.o.v. het venster), card = { width, height } van het kaartje,
// view = { width, height } van het venster. Geen rect = in het midden.
// Voorkeur: onder het onderdeel, anders erboven, anders onderaan het scherm (het onderdeel is dan groter
// dan wat er nog past, zoals een hele tabel).
export const CARD_GAP = 12;
export const VIEW_MARGIN = 12;

export function placeCard(rect, card, view) {
  const maxLeft = Math.max(VIEW_MARGIN, view.width - card.width - VIEW_MARGIN);
  if (!rect) {
    return {
      left: Math.round(Math.max(VIEW_MARGIN, (view.width - card.width) / 2)),
      top: Math.round(Math.max(VIEW_MARGIN, (view.height - card.height) / 2)),
      side: 'center',
    };
  }
  const centred = rect.left + rect.width / 2 - card.width / 2;
  const left = Math.round(Math.min(Math.max(VIEW_MARGIN, centred), maxLeft));
  const below = rect.bottom + CARD_GAP;
  if (below + card.height <= view.height - VIEW_MARGIN) return { left, top: Math.round(below), side: 'below' };
  const above = rect.top - CARD_GAP - card.height;
  if (above >= VIEW_MARGIN) return { left, top: Math.round(above), side: 'above' };
  // Past nergens naast: onderaan, of bovenaan als het onderdeel pas in de onderste helft begint.
  const lowHalf = rect.top > view.height / 2;
  const top = lowHalf ? VIEW_MARGIN : view.height - card.height - VIEW_MARGIN;
  return { left, top: Math.round(Math.max(VIEW_MARGIN, top)), side: lowHalf ? 'top' : 'bottom' };
}
