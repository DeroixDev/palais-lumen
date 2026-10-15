// House menu: skin picker over the whole catalog, giving skins, and editing what is in the inventory.

import { RARITIES, wearOf, type ItemInstance, type Rarity, type SkinDef } from '../../contract';
import { SKINS, skinById } from '../lib/assets';
import { itemValue, makeItem, valueOf } from '../lib/economy';
import * as M from '../lib/mods';
import { addItem, commit, save } from '../lib/state';
import { esc, fmt, uid } from '../lib/util';
import { names, rColor, rName, skinArt, skinCanvas } from './items';
import { patternInfo, specialSeeds } from '../../data/specials';
import { actions, block, group, refreshAll, type Row } from './modctl';

const skinName = (s: SkinDef) => names({ skin: s.id, statTrak: false }).full;
const byName = SKINS.slice().sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.basePrice - a.basePrice);

/** Search over all skins; calls `onPick` with the chosen one. */
export function skinPicker(host: HTMLElement, onPick: (s: SkinDef) => void, current?: () => string) {
  host.insertAdjacentHTML('beforeend', `<div class="mm-pick"><div class="mm-pick-q"><input class="inp" type="search" placeholder="Skin oder Waffe suchen (${SKINS.length})" aria-label="Skin suchen"><select class="sel" aria-label="Seltenheit"><option value="">Alle Stufen</option>${RARITIES.map((r) => `<option value="${r}">${esc(rName(r))}</option>`).join('')}</select></div><div class="mm-pick-list"></div><button type="button" class="btn ghost sm mm-more" hidden>Mehr zeigen</button></div>`);
  const q = host.querySelector('.mm-pick-q input') as HTMLInputElement;
  const rs = host.querySelector('.mm-pick-q select') as HTMLSelectElement;
  const list = host.querySelector('.mm-pick-list') as HTMLElement;
  const more = host.querySelector('.mm-more') as HTMLButtonElement;
  let limit = 24;
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    const r = rs.value as Rarity | '';
    const hits = byName.filter((s) => (!r || s.rarity === r) && (!t || `${skinName(s)} ${s.collection} ${s.id}`.toLowerCase().includes(t)));
    list.replaceChildren(...hits.slice(0, limit).map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mm-sk${current?.() === s.id ? ' on' : ''}`;
      b.style.setProperty('--rc', rColor(s.rarity));
      b.dataset.id = s.id;
      b.appendChild(skinArt({ skin: s.id, float: 0.1, seed: 7, statTrak: false }, 92, 40));
      b.insertAdjacentHTML('beforeend', `<span><b>${esc(skinName(s))}</b><small>${esc(rName(s.rarity))} · ${fmt(s.basePrice)}</small></span>`);
      return b;
    }));
    more.hidden = hits.length <= limit;
    if (!hits.length) list.innerHTML = '<p class="mm-note">Kein Skin gefunden.</p>';
  };
  q.addEventListener('input', () => { limit = 24; draw(); });
  rs.addEventListener('change', () => { limit = 24; draw(); });
  more.addEventListener('click', () => { limit += 48; draw(); });
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.mm-sk') as HTMLElement | null;
    const s = b && skinById(b.dataset.id!);
    if (!s) return;
    list.querySelectorAll('.mm-sk.on').forEach((x) => x.classList.remove('on'));
    b!.classList.add('on');
    onPick(s);
  });
  draw();
  return draw;
}

/** Float slider + exact field + wear label, within the skin's range. */
function floatCtl(host: HTMLElement, s: () => SkinDef, get: () => number, setF: (f: number, done: boolean) => void) {
  host.innerHTML = `<div class="mm-sl"><input type="range" step="0.0001" aria-label="Float"><input class="mm-num" type="number" step="0.000001" aria-label="Float genau"><output class="mm-out mono"></output></div>`;
  const rg = host.querySelector('input[type=range]') as HTMLInputElement;
  const nm = host.querySelector('.mm-num') as HTMLInputElement;
  const out = host.querySelector('output') as HTMLElement;
  const draw = () => {
    const sk = s(); const f = get();
    rg.min = String(sk.floatMin); rg.max = String(sk.floatMax); nm.min = rg.min; nm.max = rg.max;
    rg.value = String(f);
    if (document.activeElement !== nm) nm.value = String(+f.toFixed(6));
    out.textContent = wearOf(f).short;
  };
  const clampF = (f: number) => { const sk = s(); return Math.round(Math.max(sk.floatMin, Math.min(sk.floatMax, f)) * 1e9) / 1e9; };
  rg.addEventListener('input', () => { setF(clampF(Number(rg.value)), false); draw(); });
  rg.addEventListener('change', () => { setF(clampF(Number(rg.value)), true); draw(); });
  nm.addEventListener('change', () => { const v = Number(nm.value.replace(',', '.')); if (isFinite(v)) setF(clampF(v), true); draw(); });
  draw();
  return draw;
}

// ---------- give a skin ----------

function giveBlock(): Row {
  return block('Skin hinzufügen', (host) => {
    let sk: SkinDef = byName[0];
    let f = 0.05, seed = 661, st = false, qty = 1;
    host.innerHTML = `<div class="mm-give"><div class="mm-give-pick"></div><div class="mm-give-ed">
      <div class="mm-prev"></div>
      <div class="mm-fields">
        <div class="mm-f"><span>Float</span><div class="mm-fl"></div></div>
        <div class="mm-f"><span>Muster</span><div class="mm-inl"><input class="inp mm-in g-seed" type="number" min="0" max="999" step="1"><button type="button" class="btn ghost sm g-rs">Zufall</button></div></div>
        <div class="mm-f"><span>Spezialmuster</span><select class="sel mm-sel g-sp" aria-label="Spezialmuster"></select></div>
        <div class="mm-f"><span>StatTrak™</span><label class="mm-sw"><input type="checkbox" class="g-st"><i></i><span></span></label></div>
        <div class="mm-f"><span>Anzahl</span><input class="inp mm-in g-q" type="number" min="1" max="100" step="1" value="1"></div>
        <div class="mm-inl"><b class="mono g-val"></b><button type="button" class="btn primary sm g-go">Ins Inventar</button></div>
      </div></div></div>`;
    const prev = host.querySelector('.mm-prev') as HTMLElement;
    const seedIn = host.querySelector('.g-seed') as HTMLInputElement;
    const stIn = host.querySelector('.g-st') as HTMLInputElement;
    const val = host.querySelector('.g-val') as HTMLElement;
    const drawPrev = () => {
      prev.replaceChildren(skinCanvas({ skin: sk.id, float: f, seed, statTrak: st }, 220, 92));
      prev.insertAdjacentHTML('beforeend', `<b style="color:${rColor(sk.rarity)}">${esc(skinName(sk))}</b>`);
    };
    const spSel = host.querySelector('.g-sp') as HTMLSelectElement;
    let spFor = '';
    const drawSp = () => {
      if (spFor !== sk.id) {
        spFor = sk.id;
        const seen = new Set<string>();
        const opts = specialSeeds(sk).filter((x) => !seen.has(x.tag.id) && seen.add(x.tag.id));
        spSel.innerHTML = `<option value="">${opts.length ? 'Keins gewählt' : 'Keine für diesen Skin'}</option>` + opts.map((x) => `<option value="${x.seed}">${esc(x.tag.name)} · #${x.seed} · ×${x.tag.mult}</option>`).join('');
      }
      spSel.value = patternInfo(sk, seed).special && [...spSel.options].some((o) => o.value === String(seed)) ? String(seed) : '';
    };
    spSel.addEventListener('change', () => { if (spSel.value) { seed = Number(spSel.value); drawVals(); drawPrev(); } });
    const drawVals = () => {
      drawSp();
      seedIn.value = String(seed);
      stIn.checked = st; stIn.disabled = sk.rarity === 'gold';
      (stIn.nextElementSibling!.nextElementSibling as HTMLElement).textContent = st ? 'An' : 'Aus';
      val.textContent = `${fmt(valueOf(sk, f, seed, st) * qty)} Coins`;
    };
    const fl = floatCtl(host.querySelector('.mm-fl') as HTMLElement, () => sk, () => f, (v, done) => { f = v; drawVals(); if (done) drawPrev(); });
    skinPicker(host.querySelector('.mm-give-pick') as HTMLElement, (s) => {
      sk = s;
      f = Math.max(s.floatMin, Math.min(s.floatMax, f));
      if (s.rarity === 'gold') st = false;
      fl(); drawVals(); drawPrev();
    }, () => sk.id);
    seedIn.addEventListener('change', () => { seed = Math.max(0, Math.min(999, Math.round(Number(seedIn.value) || 0))); drawVals(); drawPrev(); });
    host.querySelector('.g-rs')!.addEventListener('click', () => { seed = Math.floor(Math.random() * 1000); drawVals(); drawPrev(); });
    stIn.addEventListener('change', () => { st = stIn.checked && sk.rarity !== 'gold'; drawVals(); drawPrev(); });
    (host.querySelector('.g-q') as HTMLInputElement).addEventListener('change', (e) => { const t = e.target as HTMLInputElement; qty = Math.max(1, Math.min(100, Math.round(Number(t.value) || 1))); t.value = String(qty); drawVals(); });
    host.querySelector('.g-go')!.addEventListener('click', () => {
      for (let i = 0; i < qty; i++) {
        const it = makeItem(sk, sk.collection || 'Kiste', f);
        it.seed = seed; it.statTrak = st;
        addItem(it);
      }
      commit();
      note(`${qty}× ${skinName(sk)} ins Inventar gelegt.`);
      refreshAll();
    });
    drawVals(); drawPrev();
  }, { keys: 'geben skin item float muster seed stattrak anzahl hinzufügen picker' });
}

// ---------- edit the inventory ----------

function invBlock(): Row {
  return block('Inventar bearbeiten', (host) => {
    host.innerHTML = `<div class="mm-pick-q"><input class="inp" type="search" placeholder="Im Inventar suchen" aria-label="Im Inventar suchen"><select class="sel" aria-label="Sortierung"><option value="new">Neueste</option><option value="val">Wertvollste</option></select></div><div class="mm-inv"></div><button type="button" class="btn ghost sm mm-more" hidden>Mehr zeigen</button>`;
    const q = host.querySelector('input') as HTMLInputElement;
    const sort = host.querySelector('select') as HTMLSelectElement;
    const list = host.querySelector('.mm-inv') as HTMLElement;
    const more = host.querySelector('.mm-more') as HTMLButtonElement;
    let limit = 30;
    let open = '';
    const line = (it: ItemInstance) => {
      const s = skinById(it.skin);
      const d = document.createElement('div');
      d.className = `mm-it${open === it.uid ? ' open' : ''}`;
      d.dataset.uid = it.uid;
      d.style.setProperty('--rc', rColor(s?.rarity ?? 'milspec'));
      const ovr = M.itemOverride(it.uid);
      d.innerHTML = `<button type="button" class="mm-it-h"><span class="mm-it-c"></span><span class="mm-it-n"><b>${it.statTrak ? '<em>ST</em> ' : ''}${esc(names(it).full)}</b><small class="mono">${it.float.toFixed(6)} · ${wearOf(it.float).short} · #${it.seed}${(() => { const n = patternInfo(skinById(it.skin), it.seed).special?.name; return n ? ` · ${esc(n)}` : ''; })()}</small></span><span class="mono mm-it-v">${fmt(itemValue(it))}${ovr !== undefined ? ' *' : ''}</span></button>`;
      d.querySelector('.mm-it-c')!.appendChild(skinArt(it, 76, 32));
      if (open === it.uid && s) d.appendChild(editor(it, s));
      return d;
    };
    const editor = (it: ItemInstance, s: SkinDef) => {
      const e = document.createElement('div');
      e.className = 'mm-it-ed';
      const ovr = M.itemOverride(it.uid);
      e.innerHTML = `<div class="mm-f"><span>Float</span><div class="mm-fl"></div></div>
        <div class="mm-f"><span>Muster</span><input class="inp mm-in e-seed" type="number" min="0" max="999" step="1" value="${it.seed}"></div>
        <div class="mm-f"><span>StatTrak™</span><label class="mm-sw"><input type="checkbox" class="e-st" ${it.statTrak ? 'checked' : ''} ${s.rarity === 'gold' ? 'disabled' : ''}><i></i><span>${it.statTrak ? 'An' : 'Aus'}</span></label></div>
        <div class="mm-f"><span>Wert fest</span><div class="mm-inl"><input class="inp mm-in e-val" type="number" min="0" step="0.01" placeholder="Auto ${fmt(valueOf(s, it.float, it.seed, it.statTrak))}" value="${ovr ?? ''}"><small class="muted">leer = normal</small></div></div>
        <div class="mm-btns"><button type="button" class="btn ghost sm e-dup">Duplizieren</button><button type="button" class="btn ghost sm e-best">Als besten Drop</button><button type="button" class="btn danger sm e-del">Löschen</button></div>`;
      const changed = () => { commit(); redrawLine(it.uid); };
      floatCtl(e.querySelector('.mm-fl') as HTMLElement, () => s, () => it.float, (f, done) => { it.float = f; if (done) changed(); });
      (e.querySelector('.e-seed') as HTMLInputElement).addEventListener('change', (ev) => { it.seed = Math.max(0, Math.min(999, Math.round(Number((ev.target as HTMLInputElement).value) || 0))); changed(); });
      (e.querySelector('.e-st') as HTMLInputElement).addEventListener('change', (ev) => { it.statTrak = (ev.target as HTMLInputElement).checked && s.rarity !== 'gold'; (e.querySelector('.mm-sw span') as HTMLElement).textContent = it.statTrak ? 'An' : 'Aus'; changed(); });
      (e.querySelector('.e-val') as HTMLInputElement).addEventListener('change', (ev) => { const t = (ev.target as HTMLInputElement).value.trim().replace(',', '.'); M.setItemOverride(it.uid, t === '' ? null : Number(t)); changed(); });
      e.querySelector('.e-dup')!.addEventListener('click', () => { const i = save.inv.indexOf(it); save.inv.splice(i + 1, 0, { ...it, uid: uid() }); commit(); draw(); note('Dupliziert.'); });
      e.querySelector('.e-best')!.addEventListener('click', () => { save.stats.best = { item: { ...it }, value: itemValue(it), ts: Date.now() }; commit(); note('Als besten Drop eingetragen.'); refreshAll(); });
      e.querySelector('.e-del')!.addEventListener('click', () => { save.inv = save.inv.filter((x) => x !== it); M.setItemOverride(it.uid, null); open = ''; commit(); draw(); note('Gelöscht.'); });
      return e;
    };
    const redrawLine = (u: string) => {
      const old = list.querySelector(`.mm-it[data-uid="${CSS.escape(u)}"]`);
      const it = save.inv.find((x) => x.uid === u);
      if (old && it) {
        // Keep the open editor; only the head and preview change.
        const fresh = line(it);
        const ed = old.querySelector('.mm-it-ed');
        const fe = fresh.querySelector('.mm-it-ed');
        if (ed && fe) fe.replaceWith(ed);
        old.replaceWith(fresh);
      }
    };
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      let items = save.inv.filter((it) => !t || names(it).full.toLowerCase().includes(t));
      if (sort.value === 'val') items = items.slice().sort((a, b) => itemValue(b) - itemValue(a));
      list.replaceChildren(...items.slice(0, limit).map(line));
      more.hidden = items.length <= limit;
      if (!items.length) list.innerHTML = '<p class="mm-note">Keine Gegenstände.</p>';
    };
    q.addEventListener('input', () => { limit = 30; draw(); });
    sort.addEventListener('change', draw);
    more.addEventListener('click', () => { limit += 60; draw(); });
    list.addEventListener('click', (e) => {
      const h = (e.target as HTMLElement).closest('.mm-it-h');
      if (!h) return;
      const u = (h.parentElement as HTMLElement).dataset.uid!;
      open = open === u ? '' : u;
      draw();
    });
    draw();
    let n = save.inv.length;
    return () => { if (save.inv.length !== n) { n = save.inv.length; draw(); } };
  }, { keys: 'inventar item float muster seed stattrak wert löschen duplizieren bearbeiten' });
}

let note: (t: string) => void = () => {};
export function inventoryPane(say: (t: string) => void): HTMLElement[] {
  note = say;
  return [
    group('Hinzufügen', [giveBlock()]),
    group('Inventar', [
      actions('Inventar', [
        ['Leeren!', () => { save.inv = []; commit(); say('Inventar geleert.'); }, 'danger'],
        ['Wert-Festlegungen löschen', () => { for (const it of save.inv) M.setItemOverride(it.uid, null); commit(); say('Alle festen Werte entfernt.'); }],
      ], { info: () => `${save.inv.length} Stück · ${fmt(save.inv.reduce((a, i) => a + itemValue(i), 0))} Coins`, keys: 'leeren clear' }),
      invBlock(),
    ]),
  ];
}
