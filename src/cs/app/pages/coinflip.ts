// Coinflip: coins or skins against a bot. 50/50, the winner takes the pot minus 4 %.

import type { ItemInstance } from '../../contract';
import { SKINS } from '../lib/assets';
import { itemValue, makeItem, valueOf } from '../lib/economy';
import { addItem, addCoins, commit, emit, findItem, removeItems, save, spend } from '../lib/state';
import { addXP, xpFor, checkAchievements } from '../lib/career';
import * as M from '../lib/mods';
import { avatarSVG, randomBots } from '../lib/bots';
import { pushMine } from '../lib/feed';
import { sfx } from '../lib/sound';
import { clamp, esc, fmt, reducedMotion, sleep } from '../lib/util';
import { itemCard, names } from '../ui/items';
import { burstAt } from '../ui/fx';
import { toast } from '../ui/toast';
import { pageHead, type Page } from './page';

const FEE = 0.04;
type Side = 'ct' | 't';
const flipHist: Side[] = [];

/** A bot's skin of about `v` coins. */
function botItemNear(v: number): ItemInstance {
  let best = SKINS[0], bd = Infinity;
  for (const s of SKINS) {
    const x = valueOf(s, 0.2, 500, false);
    const d = Math.abs(Math.log(x / v));
    if (d < bd) { bd = d; best = s; }
  }
  return makeItem(best, 'Coinflip');
}

export const coinflipPage: Page = (root) => {
  let side: Side = 't';
  let mode: 'coins' | 'items' = 'coins';
  let stake = Math.min(5, Math.floor(save.balance * 100) / 100);
  const picked: string[] = [];
  let busy = false;
  let alive = true;
  let rot = 0;

  root.innerHTML = `
  ${pageHead('Coinflip', 'Wähle deine Seite. Fifty-fifty, der Gewinner nimmt den ganzen Pott (4 % Gebühr).')}
  <section class="flip">
    <div class="fl-player you"><div class="flp-av"></div><b class="flp-name"></b><span class="flp-side"></span><span class="flp-stake mono"></span></div>
    <div class="fl-stage">
      <div class="coin3d"><div class="face t"><span>T</span></div><div class="face ct"><span>CT</span></div></div>
      <div class="fl-result" aria-live="polite"></div>
      <div class="fl-hist"></div>
    </div>
    <div class="fl-player bot"><div class="flp-av"></div><b class="flp-name">?</b><span class="flp-side"></span><span class="flp-stake mono"></span></div>
  </section>
  <section class="panel fl-bet">
    <div class="fl-row">
      <div class="seg sides" role="group" aria-label="Seite"><button type="button" class="seg-b t" data-s="t">T · Orange</button><button type="button" class="seg-b ct" data-s="ct">CT · Blau</button></div>
      <div class="seg modes" role="group" aria-label="Einsatz"><button type="button" class="seg-b" data-m="coins">Coins</button><button type="button" class="seg-b" data-m="items">Skins</button></div>
    </div>
    <div class="fl-coins"><label class="amt"><span class="coin"></span><input type="number" min="0.1" step="0.1" inputmode="decimal" aria-label="Einsatz in Coins"></label><div class="quick"><button type="button" class="chip" data-q="half">½</button><button type="button" class="chip" data-q="double">×2</button><button type="button" class="chip" data-q="1">1</button><button type="button" class="chip" data-q="10">10</button><button type="button" class="chip" data-q="max">Max</button></div></div>
    <div class="fl-items" hidden><div class="mini-grid fl-inv"></div></div>
    <div class="fl-go-row"><span class="fl-win">Möglicher Gewinn <b class="mono">0,00</b></span><button class="btn primary xl fl-go" type="button">Werfen</button></div>
  </section>`;

  const coin = root.querySelector('.coin3d') as HTMLElement;
  const amt = root.querySelector('.amt input') as HTMLInputElement;
  amt.value = String(stake);
  const youBox = root.querySelector('.fl-player.you') as HTMLElement;
  const botBox = root.querySelector('.fl-player.bot') as HTMLElement;
  youBox.querySelector('.flp-av')!.innerHTML = avatarSVG(save.avatar, save.name);
  youBox.querySelector('.flp-name')!.textContent = save.name;
  botBox.querySelector('.flp-av')!.innerHTML = '<span class="avatar empty">?</span>';

  const stakeValue = () => (mode === 'coins' ? stake : picked.reduce((a, u) => a + (findItem(u) ? itemValue(findItem(u)!) : 0), 0));
  function draw() {
    root.querySelectorAll<HTMLElement>('.sides .seg-b').forEach((b) => b.classList.toggle('on', b.dataset.s === side));
    root.querySelectorAll<HTMLElement>('.modes .seg-b').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    (root.querySelector('.fl-coins') as HTMLElement).hidden = mode !== 'coins';
    (root.querySelector('.fl-items') as HTMLElement).hidden = mode !== 'items';
    youBox.querySelector('.flp-side')!.innerHTML = `<i class="sd ${side}"></i>${side === 't' ? 'T' : 'CT'}`;
    botBox.querySelector('.flp-side')!.innerHTML = `<i class="sd ${side === 't' ? 'ct' : 't'}"></i>${side === 't' ? 'CT' : 'T'}`;
    youBox.querySelector('.flp-stake')!.textContent = fmt(stakeValue());
    (root.querySelector('.fl-win b') as HTMLElement).textContent = fmt(stakeValue() * 2 * (1 - FEE));
    const ok = stakeValue() > 0 && (mode === 'items' || stake <= save.balance + 1e-9);
    (root.querySelector('.fl-go') as HTMLButtonElement).disabled = busy || !ok;
    root.querySelector('.fl-hist')!.innerHTML = flipHist.slice(0, 14).map((s) => `<i class="sd ${s}"></i>`).join('');
    if (mode === 'items') {
      const g = root.querySelector('.fl-inv') as HTMLElement;
      g.replaceChildren();
      const list = save.inv.slice().sort((a, b) => itemValue(b) - itemValue(a)).slice(0, 80);
      if (!list.length) g.innerHTML = '<div class="empty-state small"><b>Keine Skins.</b><a href="#/cases">Kisten öffnen</a></div>';
      list.forEach((it) => g.appendChild(itemCard(it, { selectable: true, size: 'sm', selected: picked.includes(it.uid), disabled: busy })));
    }
  }
  root.querySelector('.sides')!.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('.seg-b') as HTMLElement | null; if (b && !busy) { side = b.dataset.s as Side; sfx.click(); draw(); } });
  root.querySelector('.modes')!.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('.seg-b') as HTMLElement | null; if (b && !busy) { mode = b.dataset.m as 'coins' | 'items'; draw(); } });
  amt.addEventListener('input', () => { stake = clamp(Math.round((parseFloat(amt.value.replace(',', '.')) || 0) * 100) / 100, 0, 1e9); draw(); });
  root.querySelector('.quick')!.addEventListener('click', (e) => {
    const q = ((e.target as HTMLElement).closest('.chip') as HTMLElement | null)?.dataset.q;
    if (!q || busy) return;
    if (q === 'half') stake = Math.floor(stake * 50) / 100;
    else if (q === 'double') stake = stake * 2;
    else if (q === 'max') stake = save.balance;
    else stake = Number(q);
    stake = Math.round(Math.min(stake, save.balance) * 100) / 100;
    amt.value = String(stake);
    draw();
  });
  root.querySelector('.fl-inv')!.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest('.icard') as HTMLElement | null;
    if (!c || busy) return;
    const i = picked.indexOf(c.dataset.uid!);
    if (i >= 0) picked.splice(i, 1); else if (picked.length < 10) picked.push(c.dataset.uid!);
    sfx.click();
    draw();
  });

  root.querySelector('.fl-go')!.addEventListener('click', async () => {
    if (busy) return;
    const v = stakeValue();
    if (v <= 0) return;
    let myItems: ItemInstance[] = [];
    if (mode === 'coins') { if (!spend(stake)) { sfx.error(); return; } }
    else { myItems = picked.map((u) => findItem(u)!).filter(Boolean); removeItems(myItems.map((i) => i.uid)); picked.length = 0; }
    busy = true;
    commit();
    const [bot] = randomBots(1);
    botBox.querySelector('.flp-av')!.innerHTML = avatarSVG(bot.avatar, bot.name);
    botBox.querySelector('.flp-name')!.textContent = bot.name;
    const botItem = mode === 'items' ? botItemNear(v) : null;
    botBox.querySelector('.flp-stake')!.textContent = fmt(botItem ? itemValue(botItem) : v);
    botBox.classList.add('joined');
    root.querySelector('.fl-result')!.textContent = '';
    draw();
    await sleep(500);
    const result: Side = M.flip<Side>(side, Math.random() < 0.5 ? 't' : 'ct', side === 't' ? 'ct' : 't');
    const won = result === side;
    // Spin: many half turns, land on the result face (T = front, CT = back).
    const turns = reducedMotion() ? 0 : 8 + Math.floor(Math.random() * 3);
    const baseTurn = Math.ceil(rot / 360) * 360 + turns * 360;
    rot = baseTurn + (result === 'ct' ? 180 : 0);
    const dur = (save.settings.fast || reducedMotion() ? 900 : 2600) / M.anim();
    coin.style.transition = `transform ${dur}ms cubic-bezier(.2,.75,.25,1)`;
    coin.classList.add('flying');
    coin.style.transform = `rotateY(${rot}deg)`;
    const tickEvery = dur / 14;
    for (let t = 0; t < dur; t += tickEvery) setTimeout(() => alive && save.settings.sound && sfx.tick(), t * (t / dur));
    await sleep(dur + 80);
    coin.classList.remove('flying');
    flipHist.unshift(result);
    save.stats.flips++;
    let gain = 0;
    if (won) {
      save.stats.flipsWon++;
      if (mode === 'coins') { gain = v * 2 * (1 - FEE); addCoins(gain); }
      else {
        // Your skins come back, plus the bot's skin.
        myItems.forEach((i) => addItem(i));
        addItem(botItem!);
        pushMine(botItem!, 'Coinflip');
        gain = v + itemValue(botItem!);
      }
    }
    addXP(xpFor(v) * 0.6);
    emit({ t: 'flip', won, stake: v });
    checkAchievements();
    commit();
    busy = false;
    if (!alive) return;
    const res = root.querySelector('.fl-result') as HTMLElement;
    res.className = `fl-result ${won ? 'won' : 'lost'}`;
    res.innerHTML = won ? `Gewonnen! <b class="mono">+${fmt(gain - v)}</b>` : `${esc(bot.name)} gewinnt`;
    if (won) { sfx.win(); burstAt(coin, result === 't' ? ['#ff8a1f', '#ffd14a', '#fff'] : ['#4b9bff', '#9fe8ff', '#fff'], 90, 9); toast('Coinflip gewonnen', mode === 'items' ? names(botItem!).full : `+${fmt(gain)} Coins`, 'good', '🪙'); }
    else sfx.lose();
    draw();
  });

  draw();
  return () => { alive = false; };
};
