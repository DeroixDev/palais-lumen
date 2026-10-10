// Renders a mood or an effect offline through the game's real audio graph and reports levels.
//   node tools/sounds/render.mjs mood foyer 60 [--record 1] [--intensity 3] [--proximity 1]
//   node tools/sounds/render.mjs sfx bigWin 4 [--args '[2]']
// Options: --port 5174 (a running dev server: npx vite --config devpages/vite.nohmr.config.ts --port 5174 --strictPort)
//          --out <dir> (default: $SND_OUT or /tmp/snd-render)
// Writes <out>/<name>.wav and <name>.png (spectrogram + level curve) and prints stats.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [kind, name, secs = '30', ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const port = opt.port ?? '5174';
const outDir = opt.out ?? process.env.SND_OUT ?? '/tmp/snd-render';
fs.mkdirSync(outDir, { recursive: true });
const spec = { seconds: Number(secs) };
if (kind === 'mood') spec.mood = name;
else spec.sfx = name;
if (opt.args) spec.args = JSON.parse(opt.args);
for (const k of ['record', 'intensity', 'proximity']) if (opt[k] !== undefined) spec[k] = Number(opt[k]);
if (opt.need) spec.need = opt.need.split(',');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/devpages/render.html`);
await p.waitForFunction(() => document.getElementById('s')?.textContent === 'ready', null, { timeout: 60000 });
const b64 = await p.evaluate((s) => window.render(s), spec);
await b.close();
const tag = [name, opt.record && `r${opt.record}`, opt.intensity && `i${opt.intensity}`, opt.proximity && `p${opt.proximity}`, opt.args && opt.args.replace(/\W+/g, '')].filter(Boolean).join('-');
const file = path.join(outDir, `${tag}.wav`);
fs.writeFileSync(file, Buffer.from(b64, 'base64'));
if (errs.length) console.log('PAGE ERRORS:', errs.join(' | '));
console.log(execFileSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'stats.py'), file]).toString());
