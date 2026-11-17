// Verdeelt de te tekenen preview-afbeeldingen over meerdere werkers (scripts/og/worker.mjs).
// Elke job is { file, kind: 'route' | 'player' | 'club', props }.
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

export async function renderCards(jobs) {
  const count = Math.max(1, Math.min(Number(process.env.OG_WORKERS) || availableParallelism() - 1, 8, jobs.length));
  const batches = Array.from({ length: count }, () => []);
  jobs.forEach((job, i) => batches[i % count].push(job));
  const done = await Promise.all(batches.map(batch => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { jobs: batch } });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`og-werker stopte met code ${code}`)); });
  })));
  return done.reduce((a, b) => a + b, 0);
}
