// The house controls behind the code pad. Nothing here shows anywhere else.

import { SKINS } from '../lib/assets';
import { makeItem } from '../lib/economy';
import { checkCode, luck, setCode, setLuck } from '../lib/panel';
import { addItem, commit, save } from '../lib/state';
import { addXP, levelInfo } from '../lib/career';
import { sfx } from '../lib/sound';
import { esc, fmt } from '../lib/util';
import { names } from './items';
import { openModal } from './modal';

export function openPanelPad() {
  const pad = document.createElement('div');
  pad.className = 'pinpad';
  pad.innerHTML = `<div class="pp-dots" aria-hidden="true"></div><div class="pp-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => `<button type="button" class="pp-k ${k}" data-k="${k}">${k === 'del' ? '⌫' : k === 'ok' ? '✓' : k}</button>`).join('')}</div>`;
  const m = openModal(pad, { cls: 'pin-modal', label: 'Code' });
  let code = '';
  const dots = pad.querySelector('.pp-dots') as HTMLElement;
  const draw = () => { dots.innerHTML = Array.from({ length: Math.max(4, code.length) }, (_, i) => `<i class="${i < code.length ? 'on' : ''}"></i>`).join(''); };
  const press = (k: string) => {
    if (k === 'del') code = code.slice(0, -1);
    else if (k === 'ok') {
      if (checkCode(code)) { sfx.click(); m.close(); openPanel(); return; }
      code = '';
      pad.classList.remove('shake'); void pad.offsetWidth; pad.classList.add('shake');
      sfx.error();
    } else if (code.length < 8) code += k;
    sfx.tick();
    draw();
  };
  pad.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('.pp-k') as HTMLElement | null; if (b) press(b.dataset.k!); });
  pad.tabIndex = 0;
  pad.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') press('ok');
  });
  setTimeout(() => pad.focus(), 50);
  draw();
}

function openPanel() {
  const box = document.createElement('div');
  box.className = 'hpanel';
  const draw = () => {
    const li = levelInfo();
    box.innerHTML = `
    <h2>Haustechnik</h2>
    <div class="hp-row"><label>Glück <b class="mono hp-lv">×${luck().toFixed(2).replace('.', ',')}</b></label><input type="range" class="hp-luck" min="0.2" max="8" step="0.05" value="${luck()}"><small>Wirkt auf Gold/Verdeckt-Chancen und den Upgrader.</small></div>
    <div class="hp-row"><label>Kontostand</label><div class="hp-inl"><input class="inp hp-bal" type="number" step="0.01" value="${save.balance.toFixed(2)}"><button class="btn ghost sm hp-setbal" type="button">Setzen</button></div></div>
    <div class="hp-row"><label>Stufe ${li.level} · ${Math.floor(li.into)} XP</label><div class="hp-inl"><button class="btn ghost sm hp-xp" data-x="500" type="button">+500 XP</button><button class="btn ghost sm hp-xp" data-x="lvl" type="button">+1 Stufe</button><button class="btn ghost sm hp-xp" data-x="5lvl" type="button">+5 Stufen</button></div></div>
    <div class="hp-row"><label>Skin geben</label><div class="hp-inl"><input class="inp hp-q" placeholder="Name suchen" list="hp-skins"><datalist id="hp-skins">${SKINS.map((s) => `<option value="${esc(names({ skin: s.id, statTrak: false }).full)}">`).join('')}</datalist></div>
      <div class="hp-inl"><input class="inp hp-f" type="number" min="0" max="1" step="0.001" placeholder="Float (leer = zufällig)"><label class="check"><input type="checkbox" class="hp-st"> StatTrak</label><button class="btn ghost sm hp-give" type="button">Geben</button></div></div>
    <div class="hp-row"><label>Code ändern</label><div class="hp-inl"><input class="inp hp-c1" type="password" inputmode="numeric" maxlength="8" placeholder="Neuer Code"><input class="inp hp-c2" type="password" inputmode="numeric" maxlength="8" placeholder="Wiederholen"><button class="btn ghost sm hp-code" type="button">Ändern</button></div></div>
    <p class="hp-note" aria-live="polite"></p>`;
    const note = (t: string) => { (box.querySelector('.hp-note') as HTMLElement).textContent = t; };
    box.querySelector('.hp-luck')!.addEventListener('input', (e) => { setLuck(Number((e.target as HTMLInputElement).value)); (box.querySelector('.hp-lv') as HTMLElement).textContent = `×${luck().toFixed(2).replace('.', ',')}`; });
    box.querySelector('.hp-setbal')!.addEventListener('click', () => { const v = Number((box.querySelector('.hp-bal') as HTMLInputElement).value); if (isFinite(v) && v >= 0) { save.balance = Math.round(v * 100) / 100; commit(); note(`Kontostand: ${fmt(save.balance)}`); } });
    box.querySelectorAll<HTMLButtonElement>('.hp-xp').forEach((b) => b.addEventListener('click', () => {
      const x = b.dataset.x!;
      if (x === '500') addXP(500);
      else { const n = x === 'lvl' ? 1 : 5; for (let i = 0; i < n; i++) { const l = levelInfo(); addXP(l.need ? l.need - l.into : 0); } }
      commit(); draw();
    }));
    box.querySelector('.hp-give')!.addEventListener('click', () => {
      const q = (box.querySelector('.hp-q') as HTMLInputElement).value.trim().toLowerCase();
      const s = SKINS.find((x) => names({ skin: x.id, statTrak: false }).full.toLowerCase() === q) ?? SKINS.find((x) => names({ skin: x.id, statTrak: false }).full.toLowerCase().includes(q));
      if (!q || !s) { note('Kein Skin gefunden.'); return; }
      const fv = (box.querySelector('.hp-f') as HTMLInputElement).value;
      const f = fv === '' ? undefined : Math.min(s.floatMax, Math.max(s.floatMin, Number(fv)));
      const it = makeItem(s, 'Geschenk', f);
      it.statTrak = (box.querySelector('.hp-st') as HTMLInputElement).checked && s.rarity !== 'gold';
      addItem(it);
      commit();
      note(`${names(it).full} ins Inventar gelegt.`);
    });
    box.querySelector('.hp-code')!.addEventListener('click', () => {
      const a = (box.querySelector('.hp-c1') as HTMLInputElement).value, b = (box.querySelector('.hp-c2') as HTMLInputElement).value;
      if (!/^\d{4,8}$/.test(a)) { note('Der Code braucht 4 bis 8 Ziffern.'); return; }
      if (a !== b) { note('Die Codes stimmen nicht überein.'); return; }
      setCode(a); note('Code geändert.');
    });
  };
  draw();
  openModal(box, { cls: 'hp-modal', label: 'Haustechnik' });
}
