// Pakt het bestand uit dat discord-collect.js downloadde (zie .claude/skills/verwachte-xi/SKILL.md):
// per club de afbeelding (CLU.png, ...) plus berichten.txt met de tekst van elk bericht.
//
//   node scripts/lineups/unpack-bundle.mjs <xi-bundle-....json> <map>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const [bundlePath, outDir] = process.argv.slice(2);
if (!bundlePath || !outDir) {
  console.error('Gebruik: node scripts/lineups/unpack-bundle.mjs <bundle.json> <map>');
  process.exit(2);
}
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
await mkdir(outDir, { recursive: true });

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const texts = [];
for (const [code, club] of Object.entries(bundle.clubs ?? {})) {
  if (!/^[A-Z]{3}$/.test(code)) continue;
  const file = `${code}.${EXT[club.mime] ?? 'png'}`;
  await writeFile(join(outDir, file), Buffer.from(club.data, 'base64'));
  texts.push(`===== ${code} (${club.time}) -> ${file}\n${club.text}${club.newerTextOnly ? `\n--- NIEUWER BERICHT ZONDER AFBEELDING ---\n${club.newerTextOnly}` : ''}\n`);
}
await writeFile(join(outDir, 'berichten.txt'), texts.join('\n'));
console.log(`${texts.length} clubs uitgepakt naar ${outDir}`);
