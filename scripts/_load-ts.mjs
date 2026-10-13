// Bundles a game's pure rules file (TypeScript) with esbuild so the RTP scripts run the
// exact code the game uses. Usage: const mod = await loadTs('src/games/blackjack/rules.ts').
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function loadTs(rel) {
  const entry = fileURLToPath(new URL(`../${rel}`, import.meta.url));
  const out = buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false });
  const file = join(mkdtempSync(join(tmpdir(), 'rtp-')), 'mod.mjs');
  writeFileSync(file, out.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}
