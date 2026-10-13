// Battles: lobby (open battles, create your own) and the battle arena.

import type { CaseDef } from '../../contract';
import { CASES } from '../lib/assets';
import { casePrice } from '../lib/economy';
import { MODES, YOU_ID, battleCost, fillBots, getBattle, lobbyBattles, modeOf, newBattle, putBattle, refreshLobby, rollBattle, seatTotals, seatYou, youSeat, type Battle, type BattleMode } from '../lib/battle';
import { addXP, checkAchievements, getCase, level, xpFor } from '../lib/career';
import { avatarSVG } from '../lib/bots';
import { addItem, commit, emit, save, spend } from '../lib/state';
import { pushMine } from '../lib/feed';
import { sfx } from '../lib/sound';
import { countUp, esc, fmt, ago, sleep } from '../lib/util';
import { icon } from '../ui/icons';
import { itemCard, skinOf } from '../ui/items';
import { Reel } from '../ui/reel';
import { burstAt, flash } from '../ui/fx';
import { toast } from '../ui/toast';
import { caseArt } from './cases';
import { pageHead, type Page } from './page';
import * as M from '../lib/mods';

const MAX_ROUNDS = 4;
const draft: { mode: BattleMode; cases: string[] } = { mode: '1v1', cases: [] };

function caseThumbs(ids: string[], size = 46): HTMLElement {
  const box = document.createElement('div');
  box.className = 'bthumbs';
  for (const id of ids) {
    const c = getCase(id);
    if (!c) continue;
    const t = document.createElement('span');
    t.className = 'bthumb';
    t.title = c.name;
    t.style.width = `${size}px`;
    caseArt(t, c, size * 2, size * 1.5);
    box.appendChild(t);
  }
  return box;
}
function seatsHTML(b: Battle): string {
  const m = modeOf(b.mode);
  return b.seats.map((s, i) => `${i > 0 && m.teams[i] !== m.teams[i - 1] ? '<span class="vs">VS</span>' : ''}${s ? avatarSVG(s.avatar, s.name) : '<span class="avatar empty" title="Freier Platz">+</span>'}`).join('');
}

// ---------- lobby ----------

export const battlesPage: Page = (root) => {
  root.innerHTML = `
  ${pageHead('Battles', 'Alle öffnen die gleichen Kisten. Wer den höchsten Gesamtwert zieht, bekommt alles.')}
  <section class="panel bcreate">
    <h3 class="panel-h">Battle erstellen</h3>
    <div class="bc-modes" role="group" aria-label="Modus">${MODES.map((m) => `<button type="button" class="mode${draft.mode === m.id ? ' on' : ''}" data-m="${m.id}"><b>${m.id}</b><small>${m.label}</small></button>`).join('')}</div>
    <div class="bc-rounds"><div class="bc-sel"></div><div class="bc-sum"></div></div>
    <h4 class="sub-h">Kisten hinzufügen <small>(bis zu ${MAX_ROUNDS} Runden)</small></h4>
    <div class="bc-cases"></div>
  </section>
  <section class="panel">
    <h3 class="panel-h">Offene Battles <span class="live-dot"></span></h3>
    <div class="blist"></div>
  </section>
  <section class="panel bhist-p"><h3 class="panel-h">Deine letzten Battles</h3><div class="bhist"></div></section>`;

  const lvl = level();
  const sel = root.querySelector('.bc-sel') as HTMLElement;
  const sum = root.querySelector('.bc-sum') as HTMLElement;
  const drawDraft = () => {
    sel.replaceChildren();
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const id = draft.cases[i];
      const c = id ? getCase(id) : undefined;
      const slot = document.createElement(c ? 'button' : 'div');
      slot.className = `bc-slot${c ? ' filled' : ''}`;
      if (c) {
        (slot as HTMLButtonElement).type = 'button';
        slot.dataset.i = String(i);
        slot.title = `${c.name} entfernen`;
        const art = document.createElement('span');
        art.className = 'bc-art';
        caseArt(art, c, 120, 90);
        slot.append(art);
        slot.insertAdjacentHTML('beforeend', `<small>${esc(c.name)}</small><span class="mono">${fmt(casePrice(c))}</span><i class="x">✕</i>`);
      } else slot.innerHTML = `<span>Runde ${i + 1}</span>`;
      sel.appendChild(slot);
    }
    const cost = battleCost(draft);
    const m = modeOf(draft.mode);
    sum.innerHTML = `<div><small>Einsatz</small><b class="mono">${fmt(cost)}</b></div><div><small>Pott</small><b class="mono">${fmt(cost * m.seats)}</b></div><button class="btn primary lg bc-go" type="button" ${!draft.cases.length || save.balance + 1e-9 < cost ? 'disabled' : ''}>${save.balance + 1e-9 < cost && draft.cases.length ? 'Zu wenig Coins' : 'Battle starten'}</button>`;
  };
  const cg = root.querySelector('.bc-cases') as HTMLElement;
  CASES.filter((c) => c.level <= lvl).sort((a, b) => casePrice(a) - casePrice(b)).forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bc-case';
    b.dataset.id = c.id;
    const art = document.createElement('span');
    art.className = 'bc-art';
    caseArt(art, c, 120, 90);
    b.append(art);
    b.insertAdjacentHTML('beforeend', `<small>${esc(c.name)}</small><span class="mono">${fmt(casePrice(c))}</span><i class="plus">${icon('plus')}</i>`);
    cg.appendChild(b);
  });
  cg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.bc-case') as HTMLElement | null;
    if (!b) return;
    if (draft.cases.length >= MAX_ROUNDS) { sfx.error(); toast('Höchstens 4 Runden', '', 'bad'); return; }
    draft.cases.push(b.dataset.id!);
    sfx.click();
    drawDraft();
  });
  sel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.bc-slot.filled') as HTMLElement | null;
    if (!b) return;
    draft.cases.splice(Number(b.dataset.i), 1);
    drawDraft();
  });
  root.querySelector('.bc-modes')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.mode') as HTMLElement | null;
    if (!b) return;
    draft.mode = b.dataset.m as BattleMode;
    root.querySelectorAll('.mode').forEach((x) => x.classList.toggle('on', x === b));
    drawDraft();
  });
  sum.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.bc-go')) return;
    const cost = battleCost(draft);
    if (!draft.cases.length || !spend(cost)) { sfx.error(); return; }
    commit();
    const b = putBattle(newBattle(draft.mode, [...draft.cases], youSeat(0)));
    b.host = YOU_ID;
    location.hash = `#/battle/${b.id}`;
  });
  drawDraft();

  const list = root.querySelector('.blist') as HTMLElement;
  const drawLobby = () => {
    const bs = lobbyBattles().slice().sort((a, b) => battleCost(a) - battleCost(b));
    list.replaceChildren();
    for (const b of bs) {
      const cost = battleCost(b);
      const locked = b.cases.some((id) => (getCase(id)?.level ?? 0) > lvl);
      const row = document.createElement('div');
      row.className = 'brow';
      row.innerHTML = `<div class="br-mode"><b>${b.mode}</b><small>${b.cases.length} ${b.cases.length === 1 ? 'Runde' : 'Runden'}</small></div><div class="br-cases"></div><div class="br-seats">${seatsHTML(b)}</div><div class="br-cost"><small>Einsatz</small><b class="mono">${fmt(cost)}</b></div><button class="btn ${locked ? 'ghost' : 'primary'} sm br-join" type="button" data-id="${b.id}" ${locked || save.balance + 1e-9 < cost ? 'disabled' : ''}>${locked ? `${icon('lock')} Stufe` : 'Beitreten'}</button>`;
      row.querySelector('.br-cases')!.appendChild(caseThumbs(b.cases, 40));
      list.appendChild(row);
    }
  };
  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.br-join') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const b = getBattle(btn.dataset.id!);
    if (!b) return;
    const free = b.seats.findIndex((s) => !s);
    if (free < 0) return;
    const cost = battleCost(b);
    if (!spend(cost)) { sfx.error(); return; }
    commit();
    seatYou(b, free);
    location.hash = `#/battle/${b.id}`;
  });
  drawLobby();
  const hist = root.querySelector('.bhist') as HTMLElement;
  if (!save.battles.length) hist.innerHTML = '<div class="empty-state small"><b>Noch kein Battle gespielt.</b></div>';
  for (const h of save.battles.slice(0, 8)) {
    const r = document.createElement('div');
    r.className = `bh-row ${h.won ? 'won' : 'lost'}`;
    r.innerHTML = `<span class="bh-res">${h.won ? 'Sieg' : 'Niederlage'}</span><span class="bh-mode">${h.mode}</span><span class="bh-c"></span><span class="mono">${h.won ? '+' : ''}${fmt(h.take)}</span><small>${ago(h.ts)}</small>`;
    r.querySelector('.bh-c')!.appendChild(caseThumbs(h.cases, 30));
    hist.appendChild(r);
  }
  const iv = setInterval(() => { refreshLobby(); drawLobby(); }, 7000);
  return () => clearInterval(iv);
};

// ---------- arena ----------

export const battlePage: Page = (root, args) => {
  const found = getBattle(args[0] ?? '');
  if (!found || !found.seats.some((s) => s?.id === YOU_ID)) {
    root.innerHTML = `<div class="empty-state"><b>Dieses Battle ist vorbei.</b><a class="btn primary" href="#/battles">Zu den Battles</a></div>`;
    return;
  }
  const b: Battle = found;
  let alive = true;
  let settled = false;
  const m = modeOf(b.mode);
  const cases = b.cases.map((id) => getCase(id)!) as CaseDef[];
  const cost = battleCost(b);
  root.innerHTML = `
  <a class="crumb" href="#/battles">${icon('back')} Alle Battles</a>
  <section class="arena-head">
    <div class="ah-l"><span class="eyebrow">${m.label}</span><h1>Battle <span class="mono">${fmt(cost * m.seats)}</span></h1></div>
    <div class="ah-rounds"></div>
    <div class="ah-r"><span class="round-lbl">Warte auf Spieler …</span></div>
  </section>
  <section class="arena m-${b.mode}"></section>
  <div class="arena-end" hidden></div>`;
  const roundsBox = root.querySelector('.ah-rounds') as HTMLElement;
  cases.forEach((c, i) => {
    const t = document.createElement('span');
    t.className = 'ar-case';
    t.dataset.i = String(i);
    t.title = c.name;
    caseArt(t, c, 96, 72);
    roundsBox.appendChild(t);
  });
  const arena = root.querySelector('.arena') as HTMLElement;
  const cols: { el: HTMLElement; reel: Reel; total: HTMLElement; pulls: HTMLElement }[] = [];
  const drawSeat = (i: number) => {
    const s = b.seats[i];
    const col = cols[i].el;
    const head = col.querySelector('.bs-head') as HTMLElement;
    head.innerHTML = s
      ? `${avatarSVG(s.avatar, s.name)}<span class="bs-name">${esc(s.name)}${s.kind === 'you' && s.name !== 'Du' ? ' <em>(Du)</em>' : ''}</span>`
      : `<span class="avatar empty"><span class="spinner sm"></span></span><span class="bs-name dim">Wartet …</span>`;
    col.classList.toggle('me', s?.kind === 'you');
    col.classList.toggle('waiting', !s);
  };
  b.seats.forEach((_, i) => {
    if (i > 0 && m.teams[i] !== m.teams[i - 1]) arena.insertAdjacentHTML('beforeend', '<div class="vs-col"><span>VS</span></div>');
    const col = document.createElement('div');
    col.className = `bseat team-${m.teams[i]}`;
    col.innerHTML = `<div class="bs-head"></div><div class="bs-total"><span class="coin"></span><b class="mono">0,00</b></div><div class="bs-reel"></div><div class="bs-pulls"></div>`;
    const reel = new Reel(true);
    col.querySelector('.bs-reel')!.appendChild(reel.el);
    arena.appendChild(col);
    cols.push({ el: col, reel, total: col.querySelector('.bs-total b') as HTMLElement, pulls: col.querySelector('.bs-pulls') as HTMLElement });
    reel.idle(cases[0]);
    drawSeat(i);
  });
  const roundLbl = root.querySelector('.round-lbl') as HTMLElement;

  function settle() {
    if (settled) return;
    settled = true;
    b.status = 'done';
    const mySeat = b.seats.findIndex((s) => s?.id === YOU_ID);
    const won = m.teams[mySeat] === b.winnerTeam;
    const mine = new Set(b.payout?.[mySeat] ?? []);
    let take = 0;
    if (won) {
      for (const p of b.rounds.flat()) {
        if (!mine.has(p.item.uid)) continue;
        addItem({ ...p.item, source: 'Battle' });
        take += p.value;
      }
    }
    // Your own pulls count as opened cases for stats and missions.
    b.rounds.forEach((r, ri) => {
      const p = r[mySeat];
      save.stats.opened++;
      save.stats.dropValue += p.value;
      const rr = skinOf(p.item).rarity;
      if (rr === 'gold') save.stats.golds++;
      if (rr === 'covert') save.stats.coverts++;
      if (!save.stats.best || p.value > save.stats.best.value) save.stats.best = { item: { ...p.item }, value: p.value, caseId: b.cases[ri], ts: Date.now() };
      emit({ t: 'open', caseId: b.cases[ri], item: p.item, value: p.value, price: casePrice(cases[ri]) });
      pushMine(p.item, 'Battle', b.cases[ri]);
    });
    save.stats.battles++;
    if (won) save.stats.battlesWon++;
    addXP(xpFor(cost) * 1.2);
    save.battles.unshift({ id: b.id, ts: Date.now(), mode: b.mode, cases: b.cases, won, total: seatTotals(b).reduce((a, v) => a + v, 0), take: won ? take : -cost });
    if (save.battles.length > 20) save.battles.pop();
    emit({ t: 'battle', won, take });
    checkAchievements();
    commit();
    return { won, take, mySeat };
  }

  async function run() {
    // Seats fill up.
    while (b.seats.some((s) => !s)) {
      await sleep(450 + Math.random() * 700);
      if (!alive) return;
      const before = b.seats.map((s) => !!s);
      fillOne(b);
      b.seats.forEach((s, i) => { if (s && !before[i]) { drawSeat(i); sfx.click(); } });
    }
    b.status = 'running';
    rollBattle(b);
    for (let n = 3; n > 0; n--) {
      roundLbl.innerHTML = `Start in <b class="mono">${n}</b>`;
      sfx.tick();
      await sleep((save.settings.fast ? 250 : 650) / M.anim());
      if (!alive) return;
    }
    const fast = save.settings.fast;
    for (let r = 0; r < b.rounds.length; r++) {
      roundLbl.innerHTML = `Runde <b class="mono">${r + 1}/${b.rounds.length}</b>`;
      roundsBox.querySelectorAll('.ar-case').forEach((x, i) => { x.classList.toggle('on', i === r); x.classList.toggle('past', i < r); });
      const anyGold = b.rounds[r].some((p) => skinOf(p.item).rarity === 'gold');
      const dur = fast ? 1500 : anyGold ? 6000 : 4200;
      const tiles = await Promise.all(cols.map((c, i) => c.reel.spin(cases[r], b.rounds[r][i].item, { duration: dur + i * 90, sound: i === 0 && save.settings.sound })));
      if (!alive) return;
      const totals = seatTotals(b, r + 1);
      let best: string = 'milspec';
      const order = ['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'gold'];
      b.rounds[r].forEach((p, i) => {
        countUp(cols[i].total, totals[i]);
        const card = itemCard(p.item, { size: 'sm' });
        card.classList.add('pop');
        cols[i].pulls.prepend(card);
        const rr = skinOf(p.item).rarity;
        if (order.indexOf(rr) > order.indexOf(best)) best = rr;
        if (rr === 'gold' || rr === 'covert') burstAt(tiles[i], rr === 'gold' ? ['#ffd14a', '#fff2c0', '#ff8a1f'] : ['#eb4b4b', '#fff'], rr === 'gold' ? 120 : 50, rr === 'gold' ? 11 : 7);
      });
      sfx.reveal(best as never);
      if (best === 'gold') flash();
      // Lead highlight
      const lead = Math.max(...totals);
      cols.forEach((c, i) => c.el.classList.toggle('lead', totals[i] === lead && lead > 0));
      await sleep(fast ? 400 : 1100);
      if (!alive) return;
    }
    const res = settle()!;
    showEnd(res);
  }
  function fillOne(bt: Battle) {
    const free = bt.seats.findIndex((s) => !s);
    if (free < 0) return;
    const copy = { ...bt, seats: [...bt.seats] };
    fillBots(copy);
    bt.seats[free] = copy.seats[free];
  }
  function showEnd(res: { won: boolean; take: number; mySeat: number }) {
    roundLbl.textContent = 'Vorbei';
    roundsBox.querySelectorAll('.ar-case').forEach((x) => { x.classList.remove('on'); x.classList.add('past'); });
    cols.forEach((c, i) => { c.el.classList.toggle('winner', m.teams[i] === b.winnerTeam); c.el.classList.toggle('loser', m.teams[i] !== b.winnerTeam); });
    const winners = b.seats.filter((_, i) => m.teams[i] === b.winnerTeam).map((s) => s!.name).join(' & ');
    const end = root.querySelector('.arena-end') as HTMLElement;
    end.hidden = false;
    end.className = `arena-end ${res.won ? 'won' : 'lost'}`;
    end.innerHTML = res.won
      ? `<div class="ae-crown">♛</div><h2>Gewonnen!</h2><p>Du nimmst Skins im Wert von <b class="mono">${fmt(res.take)}</b> Coins mit.</p><div class="actions"><button class="btn primary again" type="button">Nochmal · <span class="mono">${fmt(cost)}</span></button><a class="btn ghost" href="#/inventory">Zum Inventar</a><a class="btn ghost" href="#/battles">Übersicht</a></div>`
      : `<h2>Verloren</h2><p>${esc(winners)} ${winners.includes('&') ? 'gewinnen' : 'gewinnt'} das Battle.</p><div class="actions"><button class="btn primary again" type="button">Revanche · <span class="mono">${fmt(cost)}</span></button><a class="btn ghost" href="#/battles">Übersicht</a></div>`;
    if (res.won) { sfx.win(); flash('rgba(255,138,31,.35)'); burstAt(cols[res.mySeat].el, ['#ff8a1f', '#ffd14a', '#fff', '#3fdc7a'], 160, 13); }
    else sfx.lose();
    end.querySelector('.again')!.addEventListener('click', () => {
      if (!spend(cost)) { sfx.error(); toast('Zu wenig Coins', '', 'bad'); return; }
      commit();
      const nb = putBattle(newBattle(b.mode, [...b.cases], youSeat(0)));
      nb.host = YOU_ID;
      location.hash = `#/battle/${nb.id}`;
    });
    end.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  void run();
  return () => {
    alive = false;
    // Left early: the battle still finishes and pays out.
    if (!settled) {
      if (b.seats.some((s) => !s)) fillBots(b);
      if (!b.rounds.length) rollBattle(b);
      const r = settle();
      if (r) toast(r.won ? 'Battle gewonnen' : 'Battle verloren', r.won ? `+${fmt(r.take)} Coins in Skins` : 'Im Hintergrund zu Ende gespielt', r.won ? 'good' : 'bad');
    }
  };
};
