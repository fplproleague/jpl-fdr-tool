// Browser-snippet voor de wekelijkse Verwachte XI's (zie .claude/skills/verwachte-xi/SKILL.md).
//
// Wordt door Claude met Claude in Chrome (javascript_tool) uitgevoerd in het Discord-kanaal
// #line-ups van de server "JPL - Sorare - English", waar Siebe per club een opstelling post.
// Pas eerst SINCE aan (zie de skill). Daarna in één of meerdere keren uitvoeren:
//   1. COLLECT: scrollt naar boven en onthoudt elk bericht (in window.__xi), tot vóór SINCE.
//      Is "done" nog false, voer het dan gewoon opnieuw uit (elke run duurt max. ~30 s).
//   2. Daarna DOWNLOAD = true zetten en nog eens uitvoeren: kiest per club het nieuwste bericht met
//      een afbeelding en downloadt ALLES als één bestand xi-bundle-<datum>.json naar Downloads
//      (één download, want Chrome blokkeert meerdere downloads na elkaar). Daarin per club de
//      afbeelding (base64), het tijdstip en de tekst van het bericht.
// Het snippet geeft enkel een samenvatting terug, nooit de afbeeldingslinks.
(async () => {
  const SINCE = '2026-11-03T12:00:00Z'; // berichten vanaf hier tellen mee (zie de skill)
  const UNTIL = '2099-01-01T00:00:00Z'; // enkel voor een test op een oude speeldag
  const DOWNLOAD = false;

  const CLUBS = {
    'Club Brugge': 'CLU', 'Anderlecht': 'AND', 'Westerlo': 'WES', 'Charleroi': 'CHA', 'Antwerp': 'ANT',
    'Lommel SK': 'LOM', 'Standard': 'STA', 'SK Beveren': 'BEV', 'RAAL La Louviere': 'LLV',
    'Cercle Brugge': 'CER', 'KRC Genk': 'GNK', 'Union SG': 'USG', 'KAA Gent': 'GNT', 'KV Kortrijk': 'KOR',
    'KV Mechelen': 'KVM', 'OH Leuven': 'OHL', 'STVV': 'STV', 'Zulte Waregem': 'ZWA',
  };
  const store = (window.__xi = window.__xi || new Map());

  const fullSize = (url) => {
    const u = new URL(url, location.href);
    if (u.hostname === 'media.discordapp.net') {
      u.hostname = 'cdn.discordapp.com';
      ['width', 'height', 'format', 'quality'].forEach(k => u.searchParams.delete(k));
    }
    return u.toString();
  };

  function grab() {
    for (const li of document.querySelectorAll('li[id^="chat-messages-"]')) {
      const id = li.id.split('-').pop();
      const content = li.querySelector('[id^="message-content-"]');
      const time = li.querySelector('time')?.getAttribute('datetime') ?? null;
      const mention = content?.querySelector('.mention, [class*="roleMention"]')?.textContent?.replace(/^@/, '').trim() ?? null;
      const links = [...li.querySelectorAll('a[href*="/attachments/"]')].map(a => a.href);
      const imgs = [...li.querySelectorAll('img[src*="/attachments/"]')].map(i => i.src);
      const found = [...new Set([...links, ...imgs].filter(u => /\.(png|jpe?g|webp)(\?|$)/i.test(u)).map(fullSize))];
      const prev = store.get(id);
      store.set(id, {
        id, time, mention,
        text: content?.innerText ?? prev?.text ?? '',
        images: found.length ? found : (prev?.images ?? []),
      });
    }
  }

  const scroller = [...document.querySelectorAll('div[class*="scroller_"]')]
    .find(d => d.querySelector('ol[data-list-id="chat-messages"]'));
  if (!scroller) return 'Geen berichtenlijst gevonden: staat het tabblad op het #line-ups-kanaal?';

  const oldest = () => [...store.values()].map(m => m.time).filter(Boolean).sort()[0] ?? '9999';
  const started = Date.now();
  while (!DOWNLOAD && oldest() > SINCE && Date.now() - started < 30000) {
    grab();
    scroller.scrollTop = 0;
    await new Promise(r => setTimeout(r, 1500));
  }
  grab();

  const inWindow = [...store.values()]
    .filter(m => m.time && m.time >= SINCE && m.time < UNTIL)
    .sort((a, b) => a.time.localeCompare(b.time));
  const newest = {};
  const newestWithImage = {};
  for (const m of inWindow) {
    const code = CLUBS[m.mention];
    if (!code) continue;
    newest[code] = m;
    if (m.images.length) newestWithImage[code] = m;
  }
  const summary = Object.values(CLUBS).map(code => {
    const m = newestWithImage[code];
    if (!m) return `${code}: GEEN afbeelding gevonden`;
    const warn = newest[code] !== m ? ' (LET OP: er is een nieuwer bericht zonder afbeelding)' : '';
    const vs = m.text.split('\n').map(l => l.trim()).find(l => /^\S.{0,40}\bVS\b.{0,40}$/i.test(l)) ?? '';
    return `${code}: ${m.time.slice(5, 16)} ${vs}${warn}`;
  });

  if (!DOWNLOAD) {
    return `done=${oldest() <= SINCE} (oudste bericht ${oldest().slice(0, 16)}, ${store.size} berichten)\n${summary.join('\n')}`;
  }

  const bundle = { since: SINCE, until: UNTIL, collectedAt: new Date().toISOString(), clubs: {} };
  for (const [code, m] of Object.entries(newestWithImage)) {
    const response = await fetch(m.images[m.images.length - 1]);
    const blob = await response.blob();
    const data = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    bundle.clubs[code] = { time: m.time, mention: m.mention, text: m.text, mime: blob.type, data, newerTextOnly: newest[code] !== m ? newest[code].text : null };
  }
  const file = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = `xi-bundle-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return `Gedownload: ${a.download} met ${Object.keys(bundle.clubs).length} clubs (${Math.round(file.size / 1024)} kB)\n${summary.join('\n')}`;
})();
