import { describe, it, expect } from 'vitest';
import {
  TOUR_SEEN_KEY, hasSeenTour, installPlatform, markTourSeen, placeCard, tourSteps, tourTextKeys,
} from './tour';
import { LANGUAGES, STRINGS } from './i18n';
import { ROUTES } from './routes';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    data,
  };
}

describe('rondleiding: stappen', () => {
  it('toont alle zes de tabs, plus menu, startscherm en einde', () => {
    const steps = tourSteps();
    expect(steps.map(s => s.id)).toEqual(['nav', 'fdr', 'xi', 'planner', 'budget', 'spelers', 'setpieces', 'klassement', 'done']);
    expect(tourSteps({ platform: 'android' }).map(s => s.id)).toContain('install');
    const tabs = new Set(steps.map(s => s.tab).filter(Boolean));
    expect([...tabs].sort()).toEqual(ROUTES.map(r => r.key).sort());
  });

  it('kiest per toestel het juiste onderdeel en de juiste tekst', () => {
    const desktop = tourSteps({ mobile: false });
    const mobile = tourSteps({ mobile: true });
    expect(desktop.find(s => s.id === 'nav').target).toEqual(['.ui-topbar']);
    expect(mobile.find(s => s.id === 'nav').target).toEqual(['.ui-bottomnav']);
    // Op gsm het vegen over het veld, op desktop de wedstrijdkeuze.
    expect(mobile.find(s => s.id === 'xi').target[0]).toBe('.pxl-pitches');
    expect(mobile.find(s => s.id === 'xi').bodyKey).toBe('tour.step.xi.bodyMobile');
    expect(desktop.find(s => s.id === 'xi').bodyKey).toBe('tour.step.xi.body');
    // Stappen zonder eigen gsm-tekst gebruiken gewoon de gewone.
    expect(mobile.find(s => s.id === 'planner').bodyKey).toBe('tour.step.planner.body');
    expect(mobile.find(s => s.id === 'fdr').bodyKey).toBe('tour.step.fdr.bodyMobile');
  });

  it('legt het op-het-startscherm-zetten enkel op gsm uit, per toestel, en niet in de app', () => {
    expect(tourSteps({ platform: 'ios' }).find(s => s.id === 'install').bodyKey).toBe('tour.step.install.ios');
    expect(tourSteps({ platform: 'android' }).find(s => s.id === 'install').bodyKey).toBe('tour.step.install.android');
    expect(tourSteps({ platform: 'desktop' }).some(s => s.id === 'install')).toBe(false);
    expect(tourSteps({ platform: 'iets' }).some(s => s.id === 'install')).toBe(false);
    expect(tourSteps({ platform: 'ios', standalone: true }).some(s => s.id === 'install')).toBe(false);
  });

  it('herkent iPhone, iPad, Android en computer', () => {
    expect(installPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop');
    expect(installPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android');
    expect(installPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });
});

describe('rondleiding: teksten', () => {
  it('heeft elke tekst in het Nederlands, Frans en Engels', () => {
    const keys = [
      ...tourTextKeys(),
      'tour.helpAria', 'tour.next', 'tour.prev', 'tour.finish', 'tour.closeAria', 'tour.install', 'tour.count',
      'tour.welcome.title', 'tour.welcome.body', 'tour.welcome.start', 'tour.welcome.no', 'tour.welcome.hint',
      'tour.welcome.closeAria', 'tour.welcome.language',
      ...LANGUAGES.map(l => `tour.language.${l}`),
    ];
    for (const lang of LANGUAGES) {
      const missing = keys.filter(k => typeof STRINGS[lang][k] !== 'string' || !STRINGS[lang][k].trim());
      expect(missing, lang).toEqual([]);
    }
  });

  it('heeft geen Nederlandse uitleg op de Franse of Engelse site', () => {
    // Enkel de uitlegteksten: titels als "Team Planner" en "Set pieces" zijn in elke taal hetzelfde.
    for (const key of tourTextKeys().filter(k => !k.endsWith('.title'))) {
      expect(STRINGS.fr[key], key).not.toBe(STRINGS.nl[key]);
      expect(STRINGS.en[key], key).not.toBe(STRINGS.nl[key]);
    }
  });
});

describe('rondleiding: onthouden', () => {
  it('toont het welkomstkader maar één keer', () => {
    const storage = memoryStorage();
    expect(hasSeenTour(storage)).toBe(false);
    markTourSeen(storage);
    expect(storage.data[TOUR_SEEN_KEY]).toBe('1');
    expect(hasSeenTour(storage)).toBe(true);
  });

  it('valt niet om zonder opslag', () => {
    const broken = { getItem: () => { throw new Error('geblokkeerd'); }, setItem: () => { throw new Error('geblokkeerd'); } };
    expect(hasSeenTour(broken)).toBe(true);
    expect(() => markTourSeen(broken)).not.toThrow();
  });
});

describe('rondleiding: plaats van het kaartje', () => {
  const view = { width: 1200, height: 800 };
  const card = { width: 360, height: 200 };

  it('staat in het midden zonder onderdeel', () => {
    expect(placeCard(null, card, view)).toEqual({ left: 420, top: 300, side: 'center' });
  });

  it('staat onder het onderdeel als dat past', () => {
    const rect = { top: 100, left: 100, width: 400, height: 40, bottom: 140, right: 500 };
    expect(placeCard(rect, card, view)).toEqual({ left: 120, top: 152, side: 'below' });
  });

  it('staat erboven als het onderdeel onderaan staat (de gsm-onderbalk)', () => {
    const phone = { width: 375, height: 700 };
    const rect = { top: 644, left: 0, width: 375, height: 56, bottom: 700, right: 375 };
    const pos = placeCard(rect, { width: 351, height: 220 }, phone);
    expect(pos.side).toBe('above');
    expect(pos.top).toBe(644 - 12 - 220);
    expect(pos.left).toBe(12);
  });

  it('staat onderaan het scherm als het onderdeel te groot is', () => {
    const rect = { top: 60, left: 0, width: 1200, height: 740, bottom: 800, right: 1200 };
    expect(placeCard(rect, card, view)).toEqual({ left: 420, top: 588, side: 'bottom' });
  });

  it('blijft binnen het scherm aan de rechterrand', () => {
    const rect = { top: 10, left: 1150, width: 40, height: 30, bottom: 40, right: 1190 };
    expect(placeCard(rect, card, view).left).toBe(1200 - 360 - 12);
  });
});
