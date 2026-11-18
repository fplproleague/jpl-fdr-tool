// Zet de wekelijkse Verwachte XI's in de site (zie .claude/skills/verwachte-xi/SKILL.md).
//
//   npm run lineups -- <invoer.json>              controleren en wegschrijven
//   npm run lineups -- <invoer.json> --check      enkel controleren, niets wegschrijven
//   npm run lineups -- <invoer.json> --force      wegschrijven ondanks fouten (niet doen voor publicatie)
//   --players-url <url>                           andere spelersbron (standaard de live site)
//
// Schrijft src/predictedLineupsData.js volledig opnieuw en zet PREDICTED_LINEUPS_GW in
// src/constants.js op de speeldag uit de invoer. Pusht niets: dat gebeurt pas om 16u.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildLineups, postCandidates } from './lineupBuilder.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATA_FILE = `${ROOT}src/predictedLineupsData.js`;
const CONSTANTS_FILE = `${ROOT}src/constants.js`;
const DEFAULT_PLAYERS_URL = 'https://fplproleague.vercel.app/api/players';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
// --info: welke speeldag nu aan de beurt is, wanneer die online mag en vanaf wanneer de berichten
// in Discord meetellen (SINCE in discord-collect.js: 3 dagen na de vorige deadline).
if (flag('--info')) {
  const { CURRENT_GW, PREDICTED_LINEUPS_GW, getGwDeadlineDate, getPredictedLineupsRelease } = await import('../../src/constants.js');
  const gw = Number(option('--gw') ?? CURRENT_GW);
  const previous = getGwDeadlineDate(gw - 1);
  const since = previous ? new Date(previous.getTime() + 3 * 24 * 60 * 60 * 1000) : null;
  const fmt = d => d?.toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) ?? '?';
  console.log(JSON.stringify({
    gw,
    nuOpDeSite: PREDICTED_LINEUPS_GW,
    deadline: getGwDeadlineDate(gw)?.toISOString(),
    onlineVanaf: getPredictedLineupsRelease(gw)?.toISOString(),
    onlineVanafBelgisch: fmt(getPredictedLineupsRelease(gw)),
    since: since?.toISOString(),
  }, null, 2));
  process.exit(0);
}

const inputPath = args.find((a, i) => !a.startsWith('--') && !['--players-url', '--gw'].includes(args[i - 1]));
if (!inputPath) {
  console.error('Gebruik: npm run lineups -- <invoer.json> [--check] [--force] [--players-url <url>]');
  process.exit(2);
}

const input = JSON.parse(await readFile(inputPath, 'utf8'));
const playersUrl = option('--players-url') ?? DEFAULT_PLAYERS_URL;
const response = await fetch(playersUrl, { cache: 'no-store' });
if (!response.ok) {
  console.error(`Spelerslijst niet bereikbaar (${response.status}) op ${playersUrl}`);
  process.exit(1);
}
const body = await response.json();
const { gw, lineups, problems } = buildLineups(input, body.players);

// --- Overzicht om snel na te lezen ---
console.log(`\nVerwachte XI's GW${gw}: ${lineups.length} clubs (spelers: ${playersUrl}, bijgewerkt ${body.updatedAt ?? '?'})\n`);
for (const l of lineups) {
  const names = l.slots.map(s => `${s.playerName || '?'}${s.safety === 'darkgreen' ? '' : ` [${s.safety}]`}`).join(', ');
  console.log(`${l.clubCode} vs ${l.opponentCode || '—'}  ${l.formationKey}  ${names}`);
}

const order = { fout: 0, nakijken: 1, info: 2 };
problems.sort((a, b) => order[a.level] - order[b.level]);
if (problems.length) {
  console.log('\nOpmerkingen:');
  for (const p of problems) console.log(`  [${p.level}] ${p.club}: ${p.msg}`);
}
// --- Kandidaten voor de X-post (t.o.v. wat nu in src/predictedLineupsData.js staat) ---
const { PREDICTED_LINEUPS: previous } = await import(`${pathToFileURL(DATA_FILE).href}?t=${Date.now()}`);
const { PREDICTED_LINEUPS_GW: previousGw } = await import('../../src/constants.js');
if (previousGw !== gw) {
  const c = postCandidates(previous, lineups, body.players);
  const label = { darkgreen: 'zeker', green: 'starter', orange: 'twijfel', red: 'risico' };
  const line = p => `${p.name} (${p.club}, ${p.price ?? '?'}M, ${p.sel ?? '?'}%)${p.before ? ` was ${label[p.before]}` : ''}${p.now ? ` nu ${label[p.now]}` : ''}`;
  console.log(`\nVoor de X-post, t.o.v. GW${previousGw} (eigendom >= 5% of prijs >= 8M):`);
  console.log(`  Niet meer in de XI: ${c.out.map(line).join('; ') || '-'}`);
  console.log(`  Twijfel/risico:     ${c.doubtful.map(line).join('; ') || '-'}`);
  console.log(`  Terug/zeker:        ${c.back.map(line).join('; ') || '-'}`);
}

const errors = problems.filter(p => p.level === 'fout').length;
console.log(`\n${errors} fout(en), ${problems.filter(p => p.level === 'nakijken').length} om na te kijken.`);

if (flag('--check')) process.exit(errors ? 1 : 0);
if (errors && !flag('--force')) {
  console.log('Niets weggeschreven. Los de fouten op (of gebruik --force voor een test).');
  process.exit(1);
}

// --- Wegschrijven ---
const oldData = await readFile(DATA_FILE, 'utf8');
const headerEnd = oldData.indexOf('export const PREDICTED_LINEUPS');
const date = new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
const header = oldData.slice(0, headerEnd)
  .replace(/Alle \d+ clubs[\s\S]*?\(GW\d+\)\./, `Alle ${lineups.length} clubs\n// aangeleverd ${date} (GW${gw}).`);
await writeFile(DATA_FILE, `${header}export const PREDICTED_LINEUPS = ${JSON.stringify(lineups, null, 2)};\n`);

const constants = await readFile(CONSTANTS_FILE, 'utf8');
const updated = constants.replace(/export const PREDICTED_LINEUPS_GW = \d+;/, `export const PREDICTED_LINEUPS_GW = ${gw};`);
if (updated === constants && !constants.includes(`PREDICTED_LINEUPS_GW = ${gw};`)) {
  console.error('PREDICTED_LINEUPS_GW niet gevonden in src/constants.js');
  process.exit(1);
}
await writeFile(CONSTANTS_FILE, updated);
console.log(`Weggeschreven: src/predictedLineupsData.js en PREDICTED_LINEUPS_GW = ${gw}.`);
