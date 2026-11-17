// Eén "werker" die preview-afbeeldingen tekent. scripts/og/generate.mjs start er meerdere tegelijk
// (één per processorkern), zodat de ~700 afbeeldingen de build niet minutenlang ophouden.
import { parentPort, workerData } from 'node:worker_threads';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { clubCard, playerCard, renderPng, routeCard } from './render.mjs';

const BUILDERS = { route: routeCard, player: playerCard, club: clubCard };

for (const job of workerData.jobs) {
  const png = await renderPng(BUILDERS[job.kind](job.props));
  await mkdir(dirname(job.file), { recursive: true });
  await writeFile(job.file, png);
}
parentPort.postMessage(workerData.jobs.length);
