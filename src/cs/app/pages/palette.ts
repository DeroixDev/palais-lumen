// Die Palette: the special case. One normal case ×10 to ×100 at once. A crane lowers a pallet of
// boxes into a warehouse, the boxes burst open in a chain reaction (the commons as one spreading
// wave, rarer ones one by one with bigger beats) and the best pull is held back for a spotlight.
//
// Every box is one plain rollCase() draw of that case, exactly as a single open on the case page:
// same odds, same mods hooks, same price per box, same XP, missions, feed and achievements.

import type { CaseDef, ItemInstance, Rarity } from '../../contract';
import { CASES, caseURL, caseURLNow, skinById, warmSkinsAsync } from '../lib/assets';
import { itemValue, rarityIndex, rollCase, tierOdds } from '../lib/economy';
import { checkAchievements, level, priceOf } from '../lib/career';
import { luck } from '../lib/panel';
import * as M from '../lib/mods';
import { commit, findItem, save, sellItems, spend } from '../lib/state';
import { sfx } from '../lib/sound';
import { esc, fmt, reducedMotion, shuffle } from '../lib/util';
import { icon } from '../ui/icons';
import { itemCard, names, rColor, rName, skinArt } from '../ui/items';
import { burstAt, flash, shake } from '../ui/fx';
import { openModal } from '../ui/modal';
import { openItemDetail } from '../ui/detail';
import { toast } from '../ui/toast';
import { caseArt } from './cases';
import { recordDrop } from './case';
import type { Page } from './page';
import './palette.css';

export const PALETTE_SIZES = [10, 25, 50, 100] as const;
const COLS: Record<number, number> = { 10: 5, 25: 5, 50: 10, 100: 10 };
const SS_CASE = 'csg.palette.case';
const SS_SIZE = 'csg.palette.size';

const unlocked = (c: CaseDef) => c.level <= level() || M.on('cs.unlock');
const lvlOf = (it: ItemInstance) => rarityIndex(skinById(it.skin)?.rarity ?? 'milspec');
const rarOf = (it: ItemInstance): Rarity => skinById(it.skin)?.rarity ?? 'milspec';

function ssGet(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }

/** The case a fresh visit starts with: the asked one, the last one here, the last opened, the cheapest. */
function startCase(id?: string): CaseDef | undefined {
  const ok = (c?: CaseDef) => (c && unlocked(c) ? c : undefined);
  const byId = (x?: string | null) => (x ? CASES.find((c) => c.id === x) : undefined);
  const recent = save.recent.find((r) => r.caseId && byId(r.caseId))?.caseId;
  return ok(byId(id)) ?? ok(byId(ssGet(SS_CASE))) ?? ok(byId(recent)) ?? CASES.filter(unlocked).sort((a, b) => priceOf(a) - priceOf(b))[0];
}

export const palettePage: Page = (root, args) => {
  let c = startCase(args[0]);
  if (!c) {
    root.innerHTML = `<div class="empty-state"><b>Noch keine Kiste freigeschaltet.</b><a class="btn primary" href="#/cases">Zu den Kisten</a></div>`;
    return;
  }
  const askedN = Number(args[1]) || Number(ssGet(SS_SIZE)) || 25;
  let n: number = (PALETTE_SIZES as readonly number[]).includes(askedN) ? askedN : 25;
  let busy = false;
  let alive = true;
  /** Drops already in the inventory but not yet counted (stats, XP, feed). */
  const pending = new Map<string, ItemInstance>();
  let runCase: CaseDef = c;
  let runPrice = 0;

  root.innerHTML = `
  <a class="crumb" href="#/cases">${icon('back')} Alle Kisten</a>
  <section class="pl">
    <header class="pl-head">
      <span class="eyebrow">Spezial</span>
      <h1>Die Palette</h1>
      <p>Eine ganze Ladung einer Kiste auf einmal. Der Kran setzt die Palette ab, dann platzen die Kisten in einer Kettenreaktion auf, und dein bester Drop kommt ganz zum Schluss.</p>
    </header>
    <div class="pl-main">
      <div class="pl-stage" aria-label="Lagerhalle">
        <div class="pl-wall"><span class="pl-sign">HALLE 7</span><span class="pl-rack r1"></span><span class="pl-rack r2"></span></div>
        <div class="pl-lamps"><i></i><i></i><i></i></div>
        <div class="pl-floor"></div>
        <div class="pl-dim"></div>
        <div class="pl-spot"></div>
        <div class="pl-rail"><div class="pl-trolley"><i class="pl-beacon"></i></div></div>
        <div class="pl-rig">
          <div class="pl-hookset"><div class="pl-cable"></div><div class="pl-hook"></div><svg class="pl-straps" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M50 1L3 40M50 1L97 40" vector-effect="non-scaling-stroke"/></svg></div>
          <div class="pl-load"><div class="pl-boxes"></div><div class="pl-pallet"><i></i><i></i><i></i></div></div>
        </div>
        <div class="pl-fx"></div>
        <div class="pl-reveal" hidden></div>
        <div class="pl-count mono" aria-live="polite"></div>
      </div>
      <aside class="pl-panel">
        <button class="pl-pick" type="button" aria-label="Kiste wechseln">
          <span class="pl-pick-art"></span>
          <span class="pl-pick-txt"><small>Kiste · <span class="pl-pick-ch">wechseln</span></small><b></b><span class="pl-pick-p"></span></span>
        </button>
        <div class="pl-sizes" role="group" aria-label="Palettengröße">${PALETTE_SIZES.map((s) => `<button type="button" class="pl-size" data-n="${s}"><b class="mono">×${s}</b><small>Kisten</small></button>`).join('')}</div>
        <div class="pl-cost"><span>Gesamt</span><b class="mono"></b></div>
        <button class="btn primary xl pl-go" type="button"></button>
        <div class="pl-row">
          <button class="toggle pl-fast" type="button" aria-pressed="${save.settings.fast}">${icon('bolt')} Schnell</button>
          <button class="btn ghost sm pl-skip" type="button" hidden>Überspringen</button>
        </div>
        <div class="pl-live">
          <div class="pl-tally"></div>
          <div class="pl-meter"><div><small>Wert</small><b class="mono pl-got">0,00</b></div><div><small>Kosten</small><b class="mono pl-spent">0,00</b></div></div>
        </div>
      </aside>
    </div>
    <section class="pl-haul" hidden></section>
  </section>`;

  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
  const stage = $('.pl-stage');
  const rig = $('.pl-rig');
  const hookset = $('.pl-hookset');
  const boxesEl = $('.pl-boxes');
  const fxEl = $('.pl-fx');
  const revealEl = $('.pl-reveal');
  const countEl = $('.pl-count');
  const goBtn = $<HTMLButtonElement>('.pl-go');
  const skipBtn = $<HTMLButtonElement>('.pl-skip');
  const sizesEl = $('.pl-sizes');
  const haul = $('.pl-haul');
  const tallyEl = $('.pl-tally');
  const gotEl = $('.pl-got');
  const spentEl = $('.pl-spent');

  // ---------- offscreen: pause the looping bits (beacon, rays) ----------
  const io = new IntersectionObserver(([en]) => stage.classList.toggle('pl-off', !en.isIntersecting));
  io.observe(stage);

  // ---------- panel ----------
  const drawPick = () => {
    const pc = c!;
    $('.pl-pick').style.setProperty('--ca', pc.look.a);
    $('.pl-pick').style.setProperty('--cb', pc.look.b);
    caseArt($('.pl-pick-art'), pc, 120, 90);
    $('.pl-pick-txt b').textContent = pc.name;
    $('.pl-pick-p').innerHTML = `<span class="coin"></span><span class="mono">${fmt(priceOf(pc))}</span><span>&nbsp;pro Kiste</span>`;
  };
  const drawControls = () => {
    const pc = c!;
    const cost = priceOf(pc) * n;
    sizesEl.querySelectorAll<HTMLButtonElement>('.pl-size').forEach((b) => { b.classList.toggle('on', Number(b.dataset.n) === n); b.disabled = busy; b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n)); });
    ($('.pl-pick') as HTMLButtonElement).disabled = busy;
    $('.pl-cost b').innerHTML = `${n} × ${fmt(priceOf(pc))} = <span class="coin"></span>${fmt(cost)}`;
    goBtn.disabled = busy;
    if (!unlocked(pc)) { goBtn.innerHTML = `${icon('lock')} Ab Stufe ${pc.level}`; goBtn.disabled = true; }
    else if (save.balance + 1e-9 < cost) { goBtn.innerHTML = `Zu wenig Coins · <span class="mono">${fmt(cost)}</span>`; goBtn.disabled = true; }
    else goBtn.innerHTML = busy ? 'Palette läuft …' : `Palette öffnen · <span class="mono">${fmt(cost)}</span>`;
  };
  const drawTally = (cs: CaseDef) => {
    tallyEl.innerHTML = [...tierOdds(cs)].reverse().map((o) => `<span class="pl-t" data-r="${o.rarity}" style="--rc:${rColor(o.rarity)}" title="${esc(rName(o.rarity))}"><i></i><b class="mono">0</b></span>`).join('');
  };

  // ---------- the load: a grid of sealed boxes on a pallet ----------
  let cells: HTMLElement[] = [];
  let caseSrc = '';
  const layout = (count: number) => {
    const cols = COLS[count] ?? 10;
    const rows = Math.ceil(count / cols);
    const W = stage.clientWidth, H = stage.clientHeight;
    const floor = parseFloat(getComputedStyle(stage).getPropertyValue('--floor')) || 64;
    const cell = Math.max(24, Math.min(118, (W * 0.88) / cols, (H - floor - 80) / (rows * 0.78)));
    stage.style.setProperty('--cols', String(cols));
    stage.style.setProperty('--cell', `${cell.toFixed(1)}px`);
  };
  const buildLoad = (cs: CaseDef, count: number) => {
    layout(count);
    caseSrc = caseURLNow(cs, 120, 90) ?? '';
    const frag = document.createDocumentFragment();
    cells = [];
    for (let i = 0; i < count; i++) {
      const b = document.createElement('div');
      b.className = 'pl-box';
      b.style.setProperty('--t', `${((Math.random() - 0.5) * 5).toFixed(1)}deg`);
      const img = document.createElement('img');
      img.className = 'pl-case';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      if (caseSrc) img.src = caseSrc;
      b.appendChild(img);
      cells.push(b);
      frag.appendChild(b);
    }
    boxesEl.replaceChildren(frag);
    boxesEl.style.setProperty('--ca', cs.look.a);
    boxesEl.style.setProperty('--cb', cs.look.b);
    if (!caseSrc) {
      const want = cs;
      caseURL(cs, 120, 90).then((u) => {
        if (!alive || want !== (busy ? runCase : c)) return;
        caseSrc = u;
        for (const b of cells) { const im = b.firstElementChild as HTMLImageElement; if (!im.src) im.src = u; }
      }, () => undefined);
    }
  };

  const hookUp = () => `translateY(${-stage.clientHeight - 60}px)`;
  const idle = () => {
    stage.classList.remove('running', 'final', 'instant');
    revealEl.hidden = true;
    revealEl.replaceChildren();
    fxEl.replaceChildren();
    countEl.textContent = '';
    buildLoad(c!, n);
    hookset.style.transform = hookUp();
  };

  const pickCase = () => {
    if (busy) return;
    const list = CASES.filter(unlocked).sort((a, b) => priceOf(a) - priceOf(b));
    const wrap = document.createElement('div');
    wrap.className = 'pl-picker';
    wrap.innerHTML = `<h2>Kiste für die Palette</h2><label class="search">${icon('search')}<input type="search" placeholder="Kiste suchen" aria-label="Kiste suchen"></label><div class="pl-plist"></div>`;
    const grid = wrap.querySelector('.pl-plist') as HTMLElement;
    for (const pc of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pl-pitem${pc === c ? ' on' : ''}`;
      b.dataset.id = pc.id;
      b.dataset.q = pc.name.toLowerCase();
      b.style.setProperty('--cb', pc.look.b);
      b.innerHTML = `<span class="pl-pi-art"></span><b>${esc(pc.name)}</b><span class="mono"><span class="coin"></span>${fmt(priceOf(pc))}</span>`;
      caseArt(b.querySelector('.pl-pi-art') as HTMLElement, pc, 120, 90, true);
      grid.appendChild(b);
    }
    const m = openModal(wrap, { cls: 'pl-pick-modal', label: 'Kiste wählen' });
    const input = wrap.querySelector('input') as HTMLInputElement;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      grid.querySelectorAll<HTMLElement>('.pl-pitem').forEach((b) => { b.hidden = !!q && !b.dataset.q!.includes(q); });
    });
    grid.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.pl-pitem');
      const pc = b && CASES.find((x) => x.id === b.dataset.id);
      if (!pc) return;
      c = pc;
      ssSet(SS_CASE, pc.id);
      sfx.click();
      m.close();
      history.replaceState(null, '', `#/palette/${pc.id}`);
      drawPick(); drawControls(); drawTally(pc); haul.hidden = true; idle();
      try { void warmSkinsAsync(Object.values(pc.contents).flat().filter(Boolean) as string[]); } catch { /* optional */ }
    });
  };
  $('.pl-pick').addEventListener('click', pickCase);
  sizesEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.pl-size');
    if (!b || busy) return;
    n = Number(b.dataset.n);
    ssSet(SS_SIZE, String(n));
    sfx.click();
    drawControls();
    haul.hidden = true;
    idle();
  });
  const fastBtn = $('.pl-fast');
  fastBtn.addEventListener('click', () => { save.settings.fast = !save.settings.fast; fastBtn.setAttribute('aria-pressed', String(save.settings.fast)); commit(); });

  // ---------- timing, skip ----------
  let skipped = false;
  const waiters = new Set<() => void>();
  const anims = new Set<Animation>();
  const wait = (ms: number) => (skipped || !alive ? Promise.resolve() : new Promise<void>((r) => {
    const t = setTimeout(() => { waiters.delete(done); r(); }, ms);
    const done = () => { clearTimeout(t); r(); };
    waiters.add(done);
  }));
  const play = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions): Promise<void> => {
    if (skipped || typeof el.animate !== 'function') return Promise.resolve();
    const a = el.animate(kf, o);
    anims.add(a);
    return a.finished.then(() => { anims.delete(a); }, () => { anims.delete(a); });
  };
  const skip = () => {
    if (skipped) return;
    skipped = true;
    skipBtn.hidden = true;
    stage.classList.add('instant');
    for (const a of anims) a.finish();
    anims.clear();
    for (const f of waiters) f();
    waiters.clear();
  };
  skipBtn.addEventListener('click', skip);

  // ---------- one run ----------
  let tally: Record<string, number> = {};
  let got = 0;
  const bump = (it: ItemInstance) => {
    const r = rarOf(it);
    tally[r] = (tally[r] ?? 0) + 1;
    got += itemValue(it);
    const t = tallyEl.querySelector(`[data-r="${r}"] b`);
    if (t) t.textContent = String(tally[r]);
    gotEl.textContent = fmt(got);
    gotEl.classList.toggle('pos', got >= runPrice * cells.length);
  };
  const record = (it: ItemInstance, best: boolean) => {
    if (!pending.has(it.uid)) return;
    pending.delete(it.uid);
    // only the notable drops go to the live feed (a pallet of blues would flood it)
    recordDrop(runCase, it, runPrice, runCase.name, best || lvlOf(it) >= rarityIndex('restricted'));
  };

  let centers: { x: number; y: number; w: number; h: number }[] = [];
  const measure = () => {
    const sr = stage.getBoundingClientRect();
    centers = cells.map((b) => { const r = b.getBoundingClientRect(); return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2, w: r.width, h: r.height }; });
  };

  /** Opens one box: the lid flies off, the skin comes up, rarer drops get a light beam. */
  const pop = (cell: HTMLElement, it: ItemInstance, art: HTMLImageElement, beam: number) => {
    const r = rarOf(it);
    cell.style.setProperty('--rc', rColor(r));
    cell.classList.add('open', `r-${r}`);
    art.classList.add('pl-item');
    cell.appendChild(art);
    // once the item has landed, drop the filled animations: a finished "forwards" animation keeps
    // its element on a compositor layer, and a hundred of those made every later frame expensive
    art.addEventListener('animationend', () => cell.classList.add('settled'), { once: true });
    if (beam && !skipped) {
      const k = cells.indexOf(cell);
      const p = centers[k];
      if (p) {
        const b = document.createElement('i');
        b.className = `pl-beam b${beam}`;
        b.style.setProperty('--rc', rColor(r));
        b.style.left = `${(p.x - p.w * 0.45).toFixed(1)}px`;
        b.style.width = `${(p.w * 0.9).toFixed(1)}px`;
        b.style.height = `${p.y.toFixed(1)}px`;
        fxEl.appendChild(b);
        b.addEventListener('animationend', () => b.remove(), { once: true });
      }
    }
  };

  async function run() {
    if (busy || !c || !alive) return;
    const cs = c;
    const count = n;
    const price = priceOf(cs);
    const cost = price * count;
    if (!unlocked(cs)) return;
    if (!spend(cost)) { sfx.error(); shake(goBtn); return; }
    busy = true;
    skipped = false;
    runCase = cs;
    runPrice = price;
    // every box is its own normal draw of this case (same path as one single open)
    const wins = Array.from({ length: count }, () => rollCase(cs, luck(), cs.name, 'you'));
    for (const w of wins.slice().reverse()) { save.inv.unshift(w); pending.set(w.uid, w); }
    save.stats.paletteMax = Math.max(save.stats.paletteMax ?? 0, count);
    commit();
    haul.hidden = true;
    haul.replaceChildren();
    drawControls();
    drawTally(cs);
    tally = {}; got = 0;
    gotEl.textContent = fmt(0); gotEl.classList.remove('pos');
    spentEl.textContent = fmt(cost);
    skipBtn.hidden = false;

    const T = (save.settings.fast ? 0.42 : 1) / Math.max(0.05, M.num('cs.speed')) / M.anim();
    const vals = wins.map(itemValue);
    let bestI = 0;
    vals.forEach((v, i) => { if (v > vals[bestI] || (v === vals[bestI] && lvlOf(wins[i]) > lvlOf(wins[bestI]))) bestI = i; });
    // the skins start rendering now (in the worker pool) while the crane is busy
    const arts = wins.map((w) => skinArt(w, 120, 72));
    const cellOf = shuffle(wins.map((_, i) => i));

    // 1) the old load goes up, the new one comes down on the hook
    stage.classList.remove('final', 'instant');
    stage.classList.add('running');
    revealEl.hidden = true;
    revealEl.replaceChildren();
    fxEl.replaceChildren();
    countEl.textContent = '';
    if (reducedMotion()) skip();
    // on a phone the button sits under the stage: bring the show into view
    const sr = stage.getBoundingClientRect();
    if (sr.top < 56 || sr.bottom > innerHeight) stage.scrollIntoView({ behavior: skipped ? 'auto' : 'smooth', block: 'center' });
    const H = stage.clientHeight;
    // the hook comes down for the old load first
    await play(hookset, [{ transform: hookUp() }, { transform: 'none' }], { duration: 360 * T, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
    hookset.getAnimations().forEach((a) => a.cancel());
    hookset.style.transform = '';
    await play(rig, [{ transform: 'none' }, { transform: `translateY(${-H}px)` }], { duration: 420 * T, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    if (!alive) return;
    buildLoad(cs, count);
    if (save.settings.sound && !skipped) sfx.crane(1.5 * T);
    await play(rig, [
      { transform: `translateY(${-H}px)`, easing: 'cubic-bezier(.25,.1,.35,1)' },
      { transform: 'translateY(8px)', offset: 0.82, easing: 'ease-out' },
      { transform: 'translateY(-3px)', offset: 0.92 },
      { transform: 'none' },
    ], { duration: 1500 * T });
    rig.getAnimations().forEach((a) => a.cancel());
    if (!alive) return;
    if (!skipped) {
      sfx.thud();
      shake(stage);
      for (const side of ['l', 'r']) {
        const d = document.createElement('i');
        d.className = `pl-dust ${side}`;
        fxEl.appendChild(d);
        d.addEventListener('animationend', () => d.remove(), { once: true });
      }
    }
    const up = hookUp();
    void play(hookset, [{ transform: 'none' }, { transform: up }], { duration: 800 * T, easing: 'cubic-bezier(.5,0,.6,1)', delay: 180 * T, fill: 'forwards' })
      .then(() => { hookset.style.transform = up; hookset.getAnimations().forEach((a) => a.cancel()); });
    await wait(450 * T);
    if (!alive) return;
    measure();

    // 2) the chain reaction: commons as one wave from a random box, then the rarer ones
    const cols = COLS[count] ?? 10;
    const order = wins.map((_, i) => i).filter((i) => i !== bestI);
    const low = order.filter((i) => lvlOf(wins[i]) <= rarityIndex('milspec'));
    const mid = order.filter((i) => rarityIndex('restricted') === lvlOf(wins[i]));
    const high = order.filter((i) => lvlOf(wins[i]) > rarityIndex('restricted')).sort((a, b) => vals[a] - vals[b]);
    const origin = low.length ? cellOf[low[Math.floor(Math.random() * low.length)]] : 0;
    const dist = (cell: number) => Math.hypot((cell % cols) - (origin % cols), Math.floor(cell / cols) - Math.floor(origin / cols));
    low.sort((a, b) => dist(cellOf[a]) - dist(cellOf[b]));
    let opened = 0;
    const tick = () => { opened++; countEl.textContent = `${opened} / ${count}`; };
    const openOne = (i: number, beam: number, best = false) => {
      pop(cells[cellOf[i]], wins[i], arts[i], beam);
      bump(wins[i]);
      record(wins[i], best);
      tick();
    };

    if (low.length) {
      if (!skipped) { cells[origin].classList.add('fuse'); await wait(320 * T); }
      const maxD = Math.max(1, dist(cellOf[low[low.length - 1]]));
      const D = Math.min(2600, Math.max(700, 380 + low.length * 32)) * T;
      if (skipped) for (const i of low) openOne(i, 0);
      else await new Promise<void>((resolve) => {
        const t0 = performance.now();
        let k = 0;
        const frame = (now: number) => {
          if (!alive) { resolve(); return; }
          const el = now - t0;
          let popped = 0;
          while (k < low.length && (skipped || (dist(cellOf[low[k]]) / maxD) * D <= el)) {
            openOne(low[k], 0); k++; popped++;
          }
          if (popped && save.settings.sound && !skipped) sfx.pop(0);
          if (k < low.length) requestAnimationFrame(frame); else resolve();
        };
        requestAnimationFrame(frame);
      });
      commit();
    }
    // a lucky pallet can hold dozens of rare drops: the beats get quicker so the run stays short
    const midGap = Math.min(230, 2600 / Math.max(1, mid.length)) * T;
    for (const i of mid) {
      if (!alive) return;
      openOne(i, 1);
      if (!skipped) { if (save.settings.sound) sfx.pop(3); await wait(midGap); }
    }
    if (mid.length) commit();
    const beat = Math.min(1, 6 / Math.max(1, high.length));
    for (const i of high) {
      if (!alive) return;
      const cell = cells[cellOf[i]];
      const r = rarOf(wins[i]);
      if (!skipped) { cell.classList.add('rattle'); await wait(Math.max(120, 360 * beat) * T); cell.classList.remove('rattle'); }
      openOne(i, r === 'classified' ? 2 : 3);
      if (!skipped) {
        sfx.reveal(r === 'gold' ? 'covert' : r);
        burstAt(cell, r === 'gold' ? ['#ffd14a', '#fff2c0', '#ff8a1f'] : r === 'covert' ? ['#eb4b4b', '#ff9a8a', '#fff'] : ['#d32ce6', '#f7a8ff'], Math.round((r === 'classified' ? 16 : 30) * Math.max(0.4, beat)), 6);
        if (r !== 'classified' && beat > 0.4) shake(stage);
        if (r === 'gold' && beat > 0.4) flash('rgba(255,209,74,.4)');
        await wait(Math.max(160, 650 * beat) * T);
      }
    }
    if (high.length) commit();
    if (!alive) return;

    // 3) the best pull, alone in the spotlight
    const bi = bestI;
    const bcell = cells[cellOf[bi]];
    const br = rarOf(wins[bi]);
    const big = lvlOf(wins[bi]) >= rarityIndex('classified');
    if (!skipped) {
      const p = centers[cellOf[bi]];
      const spot = $('.pl-spot');
      if (p) { spot.style.left = `${(p.x - 90).toFixed(1)}px`; spot.style.height = `${(p.y + p.h * 0.6).toFixed(1)}px`; }
      stage.classList.add('final');
      bcell.classList.add('star');
      await wait(380 * T);
      bcell.classList.add('rattle');
      if (save.settings.sound && big) sfx.suspense();
      await wait((big ? 1500 : 800) * T);
      bcell.classList.remove('rattle');
    }
    openOne(bi, br === 'gold' ? 4 : big ? 3 : 2, true);
    bcell.classList.add('star');
    stage.classList.add('final');
    sfx.reveal(br);
    if (!skipped) {
      if (br === 'gold') { flash('rgba(255,209,74,.6)'); burstAt(bcell, ['#ffd14a', '#fff2c0', '#ff8a1f', '#ffe9a0'], 120, 11); shake(stage); }
      else if (br === 'covert') { flash('rgba(235,75,75,.3)'); burstAt(bcell, ['#eb4b4b', '#ff9a8a', '#fff'], 60, 8); }
      else if (br === 'classified') burstAt(bcell, ['#d32ce6', '#f7a8ff'], 30, 6);
      await wait(420 * T);
    }
    for (const w of wins) record(w, false); // anything left (skip)
    checkAchievements();
    commit();
    if (!alive) return;
    showReveal(wins[bi]);
    busy = false;
    skipBtn.hidden = true;
    drawControls();
    showHaul(wins, cs, price);
  }
  goBtn.addEventListener('click', () => void run());

  // ---------- the spotlight card ----------
  function showReveal(it: ItemInstance) {
    const r = rarOf(it);
    const nm = names(it);
    revealEl.innerHTML = `<div class="pl-rays"></div><div class="pl-card r-${r}" style="--rc:${rColor(r)}">
      <small class="pl-card-k">Bester Drop · ${esc(rName(r))}</small>
      <div class="pl-card-art"></div>
      <b class="pl-card-n">${it.statTrak ? '<span class="st">StatTrak™ </span>' : ''}${esc(nm.weapon)} | ${esc(nm.skin)}</b>
      <span class="pl-card-v mono"><span class="coin"></span>${fmt(itemValue(it))}</span>
      <div class="pl-card-acts"><button class="btn ghost sm pl-card-d" type="button">Details</button><button class="btn primary sm pl-card-h" type="button">Zur Ausbeute</button></div>
    </div>`;
    revealEl.style.setProperty('--rc', rColor(r));
    revealEl.classList.toggle('gold', r === 'gold');
    revealEl.querySelector('.pl-card-art')!.appendChild(skinArt(it, 280, 165));
    revealEl.hidden = false;
    void play(revealEl.querySelector('.pl-card')!, [{ transform: 'scale(.6) translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.2,1.3,.4,1)' });
    revealEl.querySelector('.pl-card-d')!.addEventListener('click', () => { const x = findItem(it.uid); if (x) openItemDetail(x); else toast('Schon verkauft', '', 'info', '¢'); });
    revealEl.querySelector('.pl-card-h')!.addEventListener('click', () => { closeReveal(); haul.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); });
  }
  stage.addEventListener('click', (e) => {
    if (!revealEl.hidden && !(e.target as HTMLElement).closest('.pl-card')) closeReveal();
  });
  function closeReveal() { revealEl.hidden = true; revealEl.replaceChildren(); stage.classList.remove('final'); }

  // ---------- the haul ----------
  function showHaul(wins: ItemInstance[], cs: CaseDef, price: number) {
    const list = wins.slice().sort((a, b) => itemValue(b) - itemValue(a));
    const spent = price * wins.length;
    const total = list.reduce((a, w) => a + itemValue(w), 0);
    const diff = total - spent;
    const counts = new Map<Rarity, number>();
    for (const w of list) counts.set(rarOf(w), (counts.get(rarOf(w)) ?? 0) + 1);
    const thresholds = [...new Set([price, 1, 5, 25, 100].map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b);
    haul.innerHTML = `
      <h2 class="sec-h"><span>Ausbeute</span><small>${wins.length} Skins aus ${esc(cs.name)}</small></h2>
      <div class="pl-sum">
        <div class="pl-kpi"><small>Kosten</small><b class="mono">${fmt(spent)}</b></div>
        <div class="pl-kpi"><small>Wert</small><b class="mono">${fmt(total)}</b></div>
        <div class="pl-kpi ${diff >= 0 ? 'pos' : 'neg'}"><small>Bilanz</small><b class="mono">${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}</b></div>
        <div class="pl-sum-t">${[...counts].sort((a, b) => rarityIndex(b[0]) - rarityIndex(a[0])).map(([r, k]) => `<span class="tchip" style="--rc:${rColor(r)}"><i></i>${esc(rName(r))}<b class="mono">${k}</b></span>`).join('')}</div>
      </div>
      <div class="pl-acts">
        <button class="btn primary pl-sellall" type="button"></button>
        <span class="pl-below"><label>Alles unter <select class="sel pl-thr" aria-label="Grenze">${thresholds.map((t) => `<option value="${t}"${t === Math.round(price * 100) / 100 ? ' selected' : ''}>${fmt(t)}${t === Math.round(price * 100) / 100 ? ' (Kistenpreis)' : ''}</option>`).join('')}</select></label><button class="btn ghost pl-sellbelow" type="button"></button></span>
        <button class="btn ghost pl-keep" type="button">Behalten</button>
        <button class="btn ghost pl-again" type="button"></button>
      </div>
      <div class="res-grid pl-grid"></div>
      <p class="hint">Tippe einen Skin an für Details und 3D.</p>`;
    haul.hidden = false;
    const grid = haul.querySelector('.pl-grid') as HTMLElement;
    const cards = new Map<string, HTMLElement>();
    // Cards are built off the page a few at a time once the spotlight card is in, then go in 25 at
    // a time: growing the grid card by card re-laid out the whole page every frame.
    let gi = 0;
    const frag = document.createDocumentFragment();
    const batch = () => {
      if (!alive || !grid.isConnected) return;
      const t0 = performance.now();
      while (gi < list.length && performance.now() - t0 < 6) {
        const w = list[gi++];
        const card = itemCard(w, { selectable: true, size: 'sm', disabled: !findItem(w.uid) });
        cards.set(w.uid, card);
        frag.appendChild(card);
      }
      if (gi === list.length || frag.childNodes.length >= 25) grid.appendChild(frag);
      if (gi < list.length) requestAnimationFrame(batch);
    };
    setTimeout(() => requestAnimationFrame(batch), 650);
    grid.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.icard');
      const it = card && findItem(card.dataset.uid!);
      if (it) openItemDetail(it);
    });
    const thr = haul.querySelector('.pl-thr') as HTMLSelectElement;
    const owned = () => list.filter((w) => findItem(w.uid));
    const below = () => owned().filter((w) => itemValue(w) < Number(thr.value));
    const sum = (l: ItemInstance[]) => l.reduce((a, w) => a + itemValue(w), 0);
    const sellAllB = haul.querySelector('.pl-sellall') as HTMLButtonElement;
    const sellBelowB = haul.querySelector('.pl-sellbelow') as HTMLButtonElement;
    const againB = haul.querySelector('.pl-again') as HTMLButtonElement;
    const drawActs = () => {
      const o = owned(), bl = below();
      sellAllB.innerHTML = `Alle verkaufen <span class="mono">${fmt(sum(o))}</span>`;
      sellAllB.disabled = !o.length;
      sellBelowB.innerHTML = `${bl.length} verkaufen <span class="mono">${fmt(sum(bl))}</span>`;
      sellBelowB.disabled = !bl.length;
      const cost = priceOf(cs) * wins.length;
      againB.innerHTML = `Nochmal ×${wins.length} <span class="mono">${fmt(cost)}</span>`;
      againB.disabled = busy || save.balance + 1e-9 < cost || !unlocked(cs);
    };
    const sell = (l: ItemInstance[]) => {
      const ids = l.map((w) => w.uid).filter((u) => findItem(u));
      if (!ids.length) return;
      const v = sellItems(ids);
      sfx.sell();
      toast(`${ids.length} ${ids.length === 1 ? 'Skin' : 'Skins'} verkauft`, `+${fmt(v)} Coins`, 'good', '¢');
      for (const u of ids) { const cd = cards.get(u); if (cd) { cd.classList.add('off'); (cd as HTMLButtonElement).disabled = true; } }
      drawActs(); drawControls();
    };
    sellAllB.addEventListener('click', () => sell(owned()));
    sellBelowB.addEventListener('click', () => sell(below()));
    thr.addEventListener('change', drawActs);
    haul.querySelector('.pl-keep')!.addEventListener('click', () => { haul.hidden = true; idle(); toast('Alles behalten', 'Die Skins liegen in deinem Inventar.', 'good', '✓'); });
    againB.addEventListener('click', () => {
      if (c !== cs || n !== wins.length) { c = cs; n = wins.length; drawPick(); }
      stage.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      void run();
    });
    drawActs();
  }

  // ---------- boot ----------
  drawPick();
  drawControls();
  drawTally(c);
  spentEl.textContent = fmt(0);
  idle();
  try { void warmSkinsAsync(Object.values(c.contents).flat().filter(Boolean) as string[]); } catch { /* optional */ }
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = window.setTimeout(() => { if (cells.length) { layout(cells.length); if (busy) measure(); } }, 150); };
  addEventListener('resize', onResize);
  const balIv = setInterval(() => { if (!busy) drawControls(); }, 1500);

  return () => {
    alive = false;
    skip();
    io.disconnect();
    clearInterval(balIv);
    clearTimeout(rt);
    removeEventListener('resize', onResize);
    // left mid-run: the drops are in the inventory already; count them now
    if (pending.size) {
      for (const it of pending.values()) if (findItem(it.uid)) recordDrop(runCase, it, runPrice, runCase.name, lvlOf(it) >= rarityIndex('restricted'));
      pending.clear();
      checkAchievements();
      commit();
    }
  };
};
