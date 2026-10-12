import { BOSS_DAY, FLOORS, MEDAL_LABEL, floorForDay, formatChips, type GameState, type Medal, type TrophyKind } from '../core/state';
import { CHARMS, SLOT_LABEL, WARDROBE } from '../core/items';
import { EVENTS, currentEvent, setEvent } from '../core/events';
import { completeAllQuests, rerollQuests } from '../core/quests';
import { STAMPS_PER_CARD, STAMP_FLOORS, STAMP_REWARDS, addStamps, floorOfDay, stampsOnCard } from '../core/stamps';
import { PHASE_NAME } from '../core/boss';
import { MAX_HEAT, MOON_LEVELS } from '../core/moon';
import { PERKS, RARITY_LABEL } from '../core/perks';
import { ACHIEVEMENTS } from '../core/achievements';
import { allGames, allRooms, baseRoom, getGame, mainRoomOf } from '../core/registry';
import { allItems, bagCount, itemDef } from '../core/modifiers';
import { TIER_LABEL, debugClearActive, debugFillBag } from '../core/itemsCore';
import { MOTHS, RARITY_NAME } from '../core/album';
import { CHAPTER_COUNT } from '../core/story';
import { CURIOS } from '../core/curios';
import { MB_KEYS, MINIBOSSES, minibossFor, ruleStatus } from '../core/miniboss';
import { reducedMotion, setReducedMotion } from '../core/fx';
import {
  FLOORS_KEY,
  GOAL_KEY,
  LUCK_KEY,
  CAM_KEY,
  CAM_NORMAL,
  WALK_KEY,
  WALK_NORMAL,
  PLINKO_MAX_KEY,
  PLINKO_MAX_NORMAL,
  PLINKO_SPEED_KEY,
  SPEED_KEY,
  STAKE_KEY,
  activeCheats,
  allLuckStats,
  cheat,
  luckLabel,
  setCheat,
  setLuck,
} from '../core/debugLuck';
import { seasonDebug } from './season';
import { bossRunDebug } from './bossRun';
import { albumDebug } from './album';
import { chapterTitle } from './chapter';
import { setPin, validPin } from '../core/tabletPin';

import { ALBUM_ENTRY, ALBUM_NAME, BOSS_NAME, CURRENCY, CURRENCY_PLURAL } from '../core/brand';
/** What the house controls on the tablet need from the game loop. */
export interface DebugActions {
  /** Start the given day fresh with the current money and walk into the foyer. */
  jumpToDay(day: number): void;
  endDay(): void;
  /** Open any game right where the player stands. */
  openGame(id: string): void;
  /** Walk into any room. */
  toRoom(id: string): void;
  toast(text: string): void;
  close(): void;
}

const CAT_KEY = 'nf-mod-cat';
const DAY_KEY_SALT = 'rotSalt';

/** Factor steps for the stake, goal and speed sliders (×100). */
const STAKE_STEPS = [10, 25, 50, 75, 100, 150, 200, 300, 500, 1000];
const GOAL_STEPS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400];
const SPEED_STEPS = [25, 50, 75, 100, 150, 200, 300, 400];

const TROPHY_KINDS: [TrophyKind, string][] = [
  ['cup', 'Pokal'],
  ['crystal', 'Kristall'],
  ['crown', 'Krone'],
  ['jackpot', 'Jackpot'],
  ['mb1', 'Mini-Boss 1'],
  ['mb2', 'Mini-Boss 2'],
  ['mb3', 'Mini-Boss 3'],
  ['mb4', 'Mini-Boss 4'],
];
const MEDALS: Medal[] = ['none', 'bronze', 'silver', 'gold', 'diamond'];

const x100 = (v: number) => `×${(v / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })}`;
const pct = (v: number) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
const gameName = (id: string) => {
  try {
    return getGame(id).name;
  } catch {
    return id;
  }
};
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked: only the remembered tab is lost */
    }
  },
};

/**
 * House controls (shown on the wall tablet, src/ui/tablet.ts): every detail of the save and the
 * running game, sorted like a trainer: categories on the left (a list to drill into on phones),
 * toggles, sliders and fields on the right, the active cheats on top and a search over everything.
 * Every change goes straight into the save, like normal play, and quietly: notes go to `a.toast`,
 * which the tablet shows on its own screen only.
 */
export function debugPanel(state: GameState, a: DebugActions): HTMLElement {
  const d = () => state.data;
  const wrap = document.createElement('div');
  wrap.className = 'dbg mod';

  // ---- Top: active cheats, the day at a glance, search -------------------------------------------
  const top = document.createElement('div');
  top.className = 'mod-top';
  const status = document.createElement('div');
  status.className = 'mod-status';
  status.setAttribute('role', 'status');
  const statusText = document.createElement('span');
  const allOff = document.createElement('button');
  allOff.type = 'button';
  allOff.textContent = 'Alle aus';
  allOff.className = 'mod-mini';
  allOff.addEventListener('click', () =>
    apply(() => {
      for (const [k, n] of [[LUCK_KEY, 0], [STAKE_KEY, 100], [GOAL_KEY, 100], [SPEED_KEY, 100], [FLOORS_KEY, 0], [PLINKO_SPEED_KEY, 100], [PLINKO_MAX_KEY, PLINKO_MAX_NORMAL], [CAM_KEY, CAM_NORMAL], [WALK_KEY, WALK_NORMAL]] as const) setCheat(state, k, n, n);
      d().evening.quota = state.quotaToday(d().evening.number);
      return 'Alle Cheats aus: Gewinnchance normal, Einsätze, Ziel und Tempo wie im echten Spiel.';
    }),
  );
  status.append(statusText, allOff);
  const info = document.createElement('p');
  info.className = 'dbg-info';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'mod-search';
  search.placeholder = 'Suchen: Mondsteine, Album, Tempo …';
  search.setAttribute('aria-label', 'Haustechnik durchsuchen');
  top.append(status, search);

  const main = document.createElement('div');
  main.className = 'mod-main';
  const nav = document.createElement('nav');
  nav.className = 'mod-nav';
  nav.setAttribute('aria-label', 'Kategorien');
  const pane = document.createElement('div');
  pane.className = 'mod-pane';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'mod-back';
  back.textContent = '‹ Alle Kategorien';
  back.addEventListener('click', () => {
    wrap.classList.remove('drill');
    toTop();
    nav.querySelector<HTMLButtonElement>('button[aria-current="true"]')?.focus();
  });
  /** Phones: a category opens at its top, not where the list was scrolled to. */
  const toTop = () => {
    const body = wrap.closest('.card-body');
    if (body) body.scrollTop = 0;
  };
  const empty = document.createElement('p');
  empty.className = 'mod-empty';
  empty.textContent = 'Nichts gefunden.';
  empty.hidden = true;
  pane.append(back);
  main.append(nav, pane);
  wrap.append(top, info, main);

  // ---- Refresh -----------------------------------------------------------------------------------
  const syncs: (() => void)[] = [];
  /** Where new controls register their sync (a live group collects its own). */
  let target = syncs;
  const addSync = (fn: () => void) => target.push(fn);
  const refresh = () => {
    const x = d();
    info.textContent = `Tag ${x.evening.number} · Etage ${floorForDay(x.evening.number)} · ${formatChips(x.balance)} ${CURRENCY_PLURAL} · Ziel ${formatChips(state.goalBalance)} · ${formatChips(x.moonstones)} Mondsteine · Mindesteinsatz ${formatChips(state.stakeUnit)}`;
    const on = activeCheats(state);
    statusText.textContent = on.length ? `Aktiv: ${on.join(' · ')}` : 'Keine Cheats aktiv – alles wie im echten Spiel.';
    status.classList.toggle('on', on.length > 0);
    allOff.hidden = !on.length;
    for (const s of syncs) s();
  };
  /** Runs a change, then saves it into the state, refreshes every control and says what happened. */
  const apply = (fn: () => string | void) => {
    const msg = fn();
    state.emit();
    refresh();
    if (msg) a.toast(msg);
  };

  // ---- Builders ----------------------------------------------------------------------------------
  const cats: { id: string; btn: HTMLButtonElement; sec: HTMLElement }[] = [];
  let curCat!: HTMLElement;
  let cur!: HTMLElement;
  const showCat = (id: string, drill = false) => {
    for (const c of cats) {
      const on = c.id === id;
      c.sec.hidden = !on;
      c.btn.setAttribute('aria-current', String(on));
    }
    store.set(CAT_KEY, id);
    if (drill) wrap.classList.add('drill');
  };
  const cat = (id: string, title: string, sub: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<strong></strong><small></small>';
    b.querySelector('strong')!.textContent = title;
    b.querySelector('small')!.textContent = sub;
    b.addEventListener('click', () => {
      showCat(id, true);
      toTop();
    });
    nav.appendChild(b);
    const sec = document.createElement('section');
    sec.className = 'mod-cat';
    sec.dataset.cat = id;
    const h = document.createElement('h3');
    h.textContent = title;
    sec.appendChild(h);
    pane.appendChild(sec);
    cats.push({ id, btn: b, sec });
    curCat = sec;
  };
  const group = (title: string, open = false) => {
    const det = document.createElement('details');
    det.className = 'mod-group';
    det.open = open;
    const sum = document.createElement('summary');
    sum.textContent = title;
    const rows = document.createElement('div');
    rows.className = 'mod-rows';
    det.append(sum, rows);
    curCat.appendChild(det);
    cur = rows;
    return rows;
  };
  const row = (label: string, keys = '') => {
    const r = document.createElement('div');
    r.className = 'mod-row';
    r.dataset.q = `${label} ${keys}`.toLowerCase();
    if (label) {
      const l = document.createElement('span');
      l.className = 'mod-label';
      l.textContent = label;
      r.appendChild(l);
    }
    const c = document.createElement('div');
    c.className = 'dbg-row';
    r.appendChild(c);
    cur.appendChild(r);
    return c;
  };
  const note = (text: string) => {
    const p = document.createElement('p');
    p.className = 'mod-note';
    p.textContent = text;
    p.dataset.q = text.toLowerCase();
    cur.appendChild(p);
    return p;
  };
  const btn = (r: HTMLElement, label: string, fn: () => string | void, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.addEventListener('click', () => apply(fn));
    r.appendChild(b);
    return b;
  };
  /** An input that keeps the user's typing while it has focus. */
  const keep = (i: HTMLInputElement | HTMLSelectElement, v: string) => {
    if (document.activeElement !== i && i.value !== v) i.value = v;
  };
  const numField = (label: string, get: () => number, set: (v: number) => string | void, min = 0, max = 1e15, keys = '') => {
    const r = row(label, keys);
    const i = document.createElement('input');
    i.type = 'number';
    i.inputMode = 'numeric';
    i.min = String(min);
    i.max = String(max);
    i.setAttribute('aria-label', label);
    i.addEventListener('change', () => {
      const v = Math.max(min, Math.min(max, Math.floor(Number(i.value) || 0)));
      apply(() => set(v));
    });
    r.appendChild(i);
    addSync(() => keep(i, String(get())));
    return r;
  };
  const toggle = (label: string, get: () => boolean, set: (on: boolean) => string | void, keys = '') => {
    const r = row(label, keys);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mod-switch';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', label);
    b.innerHTML = '<i aria-hidden="true"></i>';
    b.addEventListener('click', () => apply(() => set(!get())));
    r.appendChild(b);
    addSync(() => b.setAttribute('aria-checked', String(get())));
    return r;
  };
  /** A slider over fixed steps (or a plain range when `steps` is a [min, max, step] triple). */
  const slider = (label: string, steps: number[] | [number, number, number], get: () => number, set: (v: number) => void, fmt: (v: number) => string, keys = '', list = true) => {
    const r = row(label, keys);
    const i = document.createElement('input');
    i.type = 'range';
    const out = document.createElement('output');
    const toV = (n: number) => (list ? steps[n] : n);
    if (list) {
      i.min = '0';
      i.max = String(steps.length - 1);
      i.step = '1';
    } else {
      [i.min, i.max, i.step] = steps.map(String);
    }
    i.setAttribute('aria-label', label);
    const index = (v: number) => {
      if (!list) return v;
      let best = 0;
      steps.forEach((s, k) => Math.abs(s - v) < Math.abs(steps[best] - v) && (best = k));
      return best;
    };
    i.addEventListener('input', () => {
      const v = toV(Number(i.value));
      out.textContent = fmt(v);
      i.setAttribute('aria-valuetext', fmt(v));
    });
    i.addEventListener('change', () => apply(() => set(toV(Number(i.value)))));
    r.append(i, out);
    addSync(() => {
      const v = get();
      keep(i, String(index(v)));
      out.textContent = fmt(v);
      i.setAttribute('aria-valuetext', fmt(v));
    });
    return r;
  };
  const select = (label: string, options: [string, string][], get: () => string, set: (v: string) => string | void, keys = '') => {
    const r = row(label, keys);
    const s = document.createElement('select');
    s.setAttribute('aria-label', label);
    for (const [v, t] of options) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      s.appendChild(o);
    }
    s.addEventListener('change', () => apply(() => set(s.value)));
    r.appendChild(s);
    addSync(() => keep(s, get()));
    return r;
  };
  /** A group whose rows depend on the state (quests, trophies, active items): rebuilt when its key changes. */
  const live = (sig: () => string, build: (into: HTMLElement) => void) => {
    const box = document.createElement('div');
    box.className = 'mod-live';
    cur.appendChild(box);
    let last = '';
    let own: (() => void)[] = [];
    addSync(() => {
      const k = sig();
      if (k !== last) {
        last = k;
        const prev = cur;
        box.innerHTML = '';
        cur = box;
        own = [];
        target = own;
        build(box);
        target = syncs;
        cur = prev;
        if (search.value) filter();
      }
      for (const s of own) s();
    });
  };
  const quotaNow = () => (d().evening.quota = state.quotaToday(d().evening.number));
  const give = (n: number) => {
    d().balance = Math.max(0, Math.floor(d().balance + n));
    d().records.bestBalance = Math.max(d().records.bestBalance, d().balance);
  };

  // =================================================================================================
  // Glück & Gewinnchance
  cat('luck', 'Glück & Gewinnchance', 'Regler für Gewinne');
  group('Gewinnchance', true);
  slider('Gewinnchance', [-100, 100, 5], () => cheat(state, LUCK_KEY, 0), (v) => setLuck(state, v), (v) => luckLabel(v), 'glück luck gewinn verlieren', false);
  const presets = row('Schnellwahl', 'gewinnchance immer gewinnen verlieren normal');
  for (const [v, t] of [[-100, 'Immer verlieren'], [-50, '−50 %'], [0, 'Normal'], [50, '+50 %'], [100, 'Immer gewinnen']] as const) {
    btn(presets, t, () => {
      setLuck(state, v);
      return v ? `Gewinnchance: ${luckLabel(v)}. Wirkt still, an den Spielen steht nichts davon.` : 'Gewinnchance normal: alle Spiele mit ihren echten Quoten.';
    });
  }
  note(
    'Wirkt in allen 20 Spielen und im Bossduell. Bei +X % wird eine Runde mit X % Wahrscheinlichkeit so lange neu gezogen, bis sie gewinnt (bei −X % bis sie verliert); bei Spielen mit mehreren Zügen (Karten, Münze, Minen, Turm, Eis) gilt das für jeden einzelnen Zug. Auf „normal“ sind die Chancen exakt wie im echten Spiel. Die Spiele zeigen davon nichts an; was der Regler bewirkt, wird nur hier gemessen.',
  );
  group('Gemessen seit dem Verstellen', true);
  live(
    () => JSON.stringify(allLuckStats()) + cheat(state, LUCK_KEY, 0),
    () => {
      const st = allLuckStats();
      if (!cheat(state, LUCK_KEY, 0)) note('Regler auf normal: Es wird nichts gemessen.');
      else if (!st.length) note('Noch keine Runde mit verstelltem Regler gespielt.');
      for (const s of st) note(`${gameName(s.game)}: ${s.rounds} ${s.rounds === 1 ? 'Runde' : 'Runden'}, ${pct(s.winRate)} gewonnen, Auszahlungsquote ${pct(s.rtp)}`);
    },
  );

  // =================================================================================================
  // Spiele
  cat('games', 'Spiele', 'Einstellungen einzelner Spiele');
  group(gameName('plinko'), true);
  slider('Tempo der Funken', SPEED_STEPS, () => cheat(state, PLINKO_SPEED_KEY, 100), (v) => setCheat(state, PLINKO_SPEED_KEY, v, 100), x100, 'plinko funkenfall tempo geschwindigkeit ball');
  slider('Funken gleichzeitig', [1, 50, 1], () => cheat(state, PLINKO_MAX_KEY, PLINKO_MAX_NORMAL), (v) => setCheat(state, PLINKO_MAX_KEY, v, PLINKO_MAX_NORMAL), (v) => `${v}`, 'plinko funkenfall bälle anzahl gleichzeitig');
  note(`Normal: Tempo ×1, ${PLINKO_MAX_NORMAL} Funken gleichzeitig. Das Tempo gilt zusätzlich zum allgemeinen Animationstempo. Die Quoten ändern sich dadurch nicht.`);

  // =================================================================================================
  // Geld & Wirtschaft
  cat('money', 'Geld & Wirtschaft', `${CURRENCY_PLURAL}, Mondsteine, Ziel`);
  group(CURRENCY_PLURAL, true);
  numField(`Kontostand (${CURRENCY_PLURAL})`, () => d().balance, (v) => void ((d().balance = v), give(0)), 0, 1e15, 'geld balance');
  const money = row('Schnell dazu', 'lumen geld');
  for (const n of [1_000, 10_000, 100_000, 1_000_000]) btn(money, `+${formatChips(n)}`, () => give(n));
  btn(money, '×10', () => give(d().balance * 9));
  const money2 = row('Kontostand setzen', 'lumen geld ziel pleite');
  btn(money2, 'Ziel genau erreichen', () => {
    d().balance = state.goalBalance;
    return 'Kontostand steht genau auf dem Tagesziel.';
  });
  btn(money2, `Ein ${CURRENCY} unter Ziel`, () => void (d().balance = Math.max(0, state.goalBalance - 1)));
  btn(money2, 'Pleite (0)', () => void (d().balance = 0));
  group('Mondsteine', true);
  numField('Mondsteine', () => d().moonstones, (v) => void (d().moonstones = v), 0, 1e9, 'steine');
  const stones = row('Schnell dazu', 'mondsteine');
  for (const n of [10, 100, 1_000]) btn(stones, `+${formatChips(n)}`, () => void (d().moonstones += n));
  group('Tagesstart & Tagesziel');
  numField('Startgeld des Tages', () => d().evening.startBalance, (v) => void (d().evening.startBalance = v), 0, 1e15, 'tagesstart einsatz');
  numField(`Tagesziel (Gewinn, ${CURRENCY_PLURAL})`, () => d().evening.quota, (v) => void (d().evening.quota = Math.max(1, v)), 1, 1e15, 'quote quota');
  const dayStart = row('', 'tagesstart ziel neu berechnen');
  btn(dayStart, 'Tagesstart = jetzt', () => {
    d().evening.startBalance = d().balance;
    quotaNow();
    return `Neuer Tagesstart: Einsätze und Ziel richten sich jetzt nach ${formatChips(d().balance)} ${CURRENCY_PLURAL}.`;
  });
  btn(dayStart, 'Ziel neu berechnen', () => {
    quotaNow();
    return `Tagesziel: +${formatChips(d().evening.quota)} ${CURRENCY_PLURAL}.`;
  });
  group('Einsätze & Ziel-Faktor');
  slider('Einsatz-Faktor', STAKE_STEPS, () => cheat(state, STAKE_KEY, 100), (v) => setCheat(state, STAKE_KEY, v, 100), x100, 'mindesteinsatz stake');
  slider('Ziel-Faktor', GOAL_STEPS, () => cheat(state, GOAL_KEY, 100), (v) => {
    setCheat(state, GOAL_KEY, v, 100);
    quotaNow();
  }, x100, 'tagesziel quote');
  note('Der Einsatz-Faktor gilt ab dem nächsten Öffnen eines Spiels. Der Ziel-Faktor rechnet das heutige Ziel sofort neu.');
  group('Glücksbringer aus dem Laden');
  for (const c of CHARMS) {
    toggle(`${c.name}`, () => d().charms.includes(c.id), (on) => {
      d().charms = on ? [...d().charms, c.id] : d().charms.filter((x) => x !== c.id);
      if (c.id === 'rabatt' || c.id === 'bossbann') quotaNow();
    }, `charm ${c.desc}`);
  }
  toggle('Zweite Chance schon benutzt', () => d().charmUsed, (on) => void (d().charmUsed = on), 'charm');
  group('Garderobe');
  const ward = row('Alle Teile', 'outfit garderobe kleidung');
  btn(ward, 'Alles besitzen', () => {
    for (const w of WARDROBE) if (!d().owned.includes(w.id)) d().owned.push(w.id);
    for (const c of CHARMS) if (!d().charms.includes(c.id)) d().charms.push(c.id);
    quotaNow();
    return 'Alle Outfits und Glücksbringer gehören dir.';
  });
  btn(ward, 'Alles zurückgeben', () => void (d().owned = []));
  for (const w of WARDROBE.filter((x) => x.price > 0)) {
    toggle(`${SLOT_LABEL[w.slot]}: ${w.name}`, () => d().owned.includes(w.id), (on) => void (d().owned = on ? [...d().owned, w.id] : d().owned.filter((x) => x !== w.id)), 'garderobe outfit');
  }
  group('Statistik');
  for (const [k, l] of [['rounds', 'Runden gespielt'], ['wagered', 'Gesamt gesetzt'], ['won', 'Gesamt gewonnen'], ['biggestWin', 'Größter Gewinn'], ['rescues', 'Gerettete Tage']] as const) {
    numField(l, () => d().stats[k], (v) => void (d().stats[k] = v), 0, 1e15, 'statistik stats');
  }
  numField('Erwarteter Hausvorteil heute', () => Math.round(d().houseExpected), (v) => void (d().houseExpected = v), 0, 1e15, 'statistik haus');
  group('Rekorde');
  for (const [k, l] of [['bestEvening', 'Weitester Tag'], ['bestBalance', 'Höchster Kontostand'], ['seasonsPlayed', 'Saisons gespielt'], ['seasonsWon', 'Saisons gewonnen']] as const) {
    numField(l, () => d().records[k], (v) => void (d().records[k] = v), 0, 1e15, 'rekord records');
  }

  // =================================================================================================
  // Tag & Saison
  cat('day', 'Tag & Saison', 'Tage, Mondstufe, Ereignisse');
  group('Tag', true);
  numField(`Tag (1 bis ${BOSS_DAY}, ${BOSS_DAY} = Boss)`, () => d().evening.number, (v) => {
    a.close();
    a.jumpToDay(v);
  }, 1, BOSS_DAY, 'springen');
  const days = row('Springen', 'tag boss abrechnen');
  for (const n of [1, 4, 7, 10]) btn(days, `Tag ${n}`, () => {
    a.close();
    a.jumpToDay(n);
  });
  btn(days, 'Boss-Tag', () => {
    a.close();
    a.jumpToDay(BOSS_DAY);
  }, true);
  btn(row('', 'abrechnen ende'), 'Tag jetzt abrechnen', () => {
    a.close();
    a.endDay();
  });
  group('Saison');
  numField('Saison-Nummer', () => d().season.number, (v) => void (d().season.number = Math.max(1, v)), 1, 9999, 'season');
  slider(`Mondstufe (0 bis ${MAX_HEAT})`, [0, MAX_HEAT, 1], () => d().heat, (v) => seasonDebug?.debugHeat(v), (v) => `${v} · ${MOON_LEVELS[v]?.name ?? ''}`, 'heat mond', false);
  numField('Mondstufen freigeschaltet', () => d().heatUnlocked, (v) => void ((d().heatUnlocked = v), delete d().counters.heatPick), 0, MAX_HEAT, 'heat');
  btn(row('', 'mondscheibe'), 'Mondscheibe öffnen', () => {
    d().heatUnlocked = Math.max(1, d().heatUnlocked);
    a.close();
    seasonDebug?.openDial();
  });
  group('Ereignis des Tages');
  select('Ereignis', [['', 'Kein Ereignis'], ...EVENTS.map((e) => [e.id, e.name] as [string, string])], () => d().event, (v) => {
    setEvent(state, v);
    return currentEvent(d()) ? `Ereignis: ${currentEvent(d())!.name}` : 'Heute ohne Ereignis.';
  }, 'event');
  group('Glücksbringer-Kette (Perks)');
  const perkRow = row('Ganze Kette', 'perks glücksbringer wahl');
  btn(perkRow, 'Wahl jetzt', () => {
    a.close();
    seasonDebug?.debugDraft();
  });
  btn(perkRow, 'Alle', () => {
    d().perks = PERKS.flatMap((p) => Array<string>(p.max).fill(p.id));
    quotaNow();
    return `${d().perks.length} Glücksbringer an der Kette.`;
  });
  btn(perkRow, 'Leeren', () => {
    d().perks = [];
    quotaNow();
  });
  for (const p of PERKS) {
    numField(`${p.name} (${RARITY_LABEL[p.rarity]}, max ${p.max})`, () => d().perks.filter((x) => x === p.id).length, (v) => {
      d().perks = [...d().perks.filter((x) => x !== p.id), ...Array<string>(v).fill(p.id)];
      quotaNow();
    }, 0, p.max, `perk ${p.desc}`);
  }
  group('Aufträge der Gäste');
  const qRow = row('Alle Aufträge', 'quests aufträge');
  btn(qRow, 'Neue Aufträge', () => {
    rerollQuests(state);
    return `${d().quests.length} neue Aufträge für heute.`;
  });
  btn(qRow, 'Alle erledigen', () => `${completeAllQuests(state)} Aufträge erledigt.`);
  live(
    () => d().quests.map((q) => q.id).join(','),
    () => {
      for (const q of d().quests) {
        numField(`${q.giver}: ${q.text}`, () => q.have, (v) => {
          q.have = v;
          q.done = v >= q.need;
        }, 0, q.need, 'auftrag quest fortschritt');
        toggle(`${q.giver}: angenommen`, () => !!q.accepted, (on) => void (q.accepted = on), 'auftrag quest');
      }
    },
  );
  group('Spiele des Tages');
  numField('Würfel-Salz der Auswahl', () => d().counters[DAY_KEY_SALT] ?? 0, (v) => {
    d().counters[DAY_KEY_SALT] = v;
    a.close();
    a.jumpToDay(d().evening.number);
  }, 0, 1e6, 'rotation auswahl');
  btn(row('', 'rotation spiele neu würfeln'), 'Spiele neu würfeln', () => {
    d().counters[DAY_KEY_SALT] = (d().counters[DAY_KEY_SALT] ?? 0) + 1;
    a.close();
    a.jumpToDay(d().evening.number);
  });
  live(
    () => `${d().season.number}:${d().evening.number}:${d().counters[DAY_KEY_SALT] ?? 0}`,
    () => {
      for (let f = 1; f <= FLOORS; f++) {
        const r = mainRoomOf(f);
        if (!r) continue;
        const names = [...new Set(r.stations.map((s) => gameName(s.game)))];
        note(`Etage ${f} (${r.name}): ${names.join(', ')}`);
      }
    },
  );
  group('Tägliche Herausforderung');
  live(
    () => `${d().dailySeed}|${Object.keys(d().dailyBest).length}`,
    () => note(d().dailySeed ? `Dieser Lauf gehört zur Herausforderung vom ${d().dailySeed}.` : `Normaler Lauf. Gespeicherte Tagesbestwerte: ${Object.keys(d().dailyBest).length}.`),
  );
  btn(row('', 'daily herausforderung bestwerte'), 'Tagesbestwerte löschen', () => void (d().dailyBest = {}));

  // =================================================================================================
  // Gegenstände
  cat('items', 'Gegenstände', 'Beutel und aktive Items');
  group('Beutel', true);
  const bagRow = row('Alle Items', 'beutel items');
  btn(bagRow, 'Alle +1', () => {
    debugFillBag(state);
    return 'Von jedem Item liegt eins mehr im Beutel.';
  });
  btn(bagRow, 'Beutel leeren', () => void (d().bag = {}));
  btn(bagRow, 'Aktive löschen', () => {
    debugClearActive(state);
    return 'Keine Items mehr aktiv.';
  });
  for (const it of allItems()) {
    numField(`${it.name} (${TIER_LABEL[it.tier]})`, () => bagCount(d(), it.id), (v) => {
      if (v > 0) d().bag[it.id] = v;
      else delete d().bag[it.id];
    }, 0, 999, `item beutel ${it.desc}`);
  }
  group('Sofort aktiv (ohne Beutel)');
  note('Schaltet ein Item an, als wäre es gerade benutzt worden. Spiel-gebundene Items wirken an ihrem ersten Spiel.');
  for (const it of allItems().filter((x) => x.duration !== 'once')) {
    toggle(it.name, () => d().active.some((x) => x.id === it.id), (on) => {
      if (!on) d().active = d().active.filter((x) => x.id !== it.id);
      else d().active.push({ id: it.id, left: it.duration === 'day' ? -1 : it.duration === 'once' ? 1 : it.duration.rounds, game: it.games?.[0] ?? '' });
    }, `aktiv item ${it.odds ? 'quote' : ''}`);
  }
  group('Restlaufzeit der aktiven Items');
  live(
    () => d().active.map((x) => `${x.id}:${x.game}`).join(','),
    () => {
      if (!d().active.length) note('Gerade wirkt kein Item.');
      for (const act of d().active) {
        numField(`${itemDef(act.id)?.name ?? act.id}${act.game ? ` (${gameName(act.game)})` : ''}: Runden übrig (−1 = ganzer Tag)`, () => act.left, (v) => void (act.left = v), -1, 999, 'aktiv runden');
      }
    },
  );

  // =================================================================================================
  // Boss
  cat('boss', 'Boss & Mini-Bosse', `${BOSS_NAME}, Boss-Gang, Mini-Bosse`);
  group(`${BOSS_NAME} (Tag 13)`, true);
  select('Boss-Phase', [['1', `1 · ${PHASE_NAME[1]}`], ['2', `2 · ${PHASE_NAME[2]}`], ['3', `3 · ${PHASE_NAME[3]}`]], () => String(Math.max(1, d().bossPhase)), (v) => {
    const msg = seasonDebug?.boss.setPhase(Number(v));
    if (msg) return msg;
    a.close();
    return `Phase ${d().bossPhase}: ${PHASE_NAME[d().bossPhase]}`;
  }, 'phase queen');
  const qn = row(`Leben von ${BOSS_NAME}`, 'queen selene boss leben');
  for (const [p, t] of [[0.5, 'Auf 50 %'], [0.8, 'Auf 20 %'], [1, 'Besiegt (Ziel voll)']] as const) {
    btn(qn, t, () => {
      if (d().evening.number < BOSS_DAY) return 'Das geht nur am Boss-Tag.';
      d().balance = d().evening.startBalance + Math.ceil(d().evening.quota * p);
      a.close();
    });
  }
  group('Boss-Gang (Etage 5)');
  const run = row('', 'boss gang korridor');
  btn(run, 'Boss-Gang zurücksetzen', () => bossRunDebug?.debugReset());
  btn(run, `Zu ${BOSS_NAME}`, () => {
    a.close();
    return bossRunDebug?.debugToQueen();
  });
  group('Mini-Bosse (Tag 3, 6, 9, 12)', true);
  const mbRow = row('Hinspringen', 'miniboss tag');
  for (const b of MINIBOSSES) {
    btn(mbRow, `Tag ${b.n * 3}: ${b.name}`, () => {
      a.close();
      a.jumpToDay(b.n * 3);
    });
  }
  const mb2 = row('Heute', 'miniboss runden intro');
  btn(mb2, 'Runden +10', () => {
    if (!minibossFor(d())) return 'Heute ist kein Mini-Boss-Tag.';
    d().counters[MB_KEYS.n] = (d().counters[MB_KEYS.n] ?? 0) + 10;
    return `Runden heute: ${d().counters[MB_KEYS.n]}. ${ruleStatus(d())}.`;
  });
  btn(mb2, 'Intro nochmal', () => {
    if (!minibossFor(d())) return 'Heute ist kein Mini-Boss-Tag.';
    delete d().counters[MB_KEYS.intro];
    delete d().counters[MB_KEYS.beat];
    a.close();
  });
  numField('Mini-Boss-Runden heute', () => d().counters[MB_KEYS.n] ?? 0, (v) => void (d().counters[MB_KEYS.n] = v), 0, 9999, 'miniboss');
  for (const b of MINIBOSSES) {
    const tag = `s${d().season.number}:${b.id}`;
    const flip = (id: string, on: boolean) => void (d().minibosses = on ? [...new Set([...d().minibosses, id])] : d().minibosses.filter((x) => x !== id));
    toggle(`${b.name}: jemals besiegt`, () => d().minibosses.includes(b.id), (on) => flip(b.id, on), 'miniboss besiegt');
    toggle(`${b.name}: diese Saison besiegt`, () => d().minibosses.includes(`s${d().season.number}:${b.id}`), (on) => flip(`s${d().season.number}:${b.id}`, on), `miniboss besiegt ${tag}`);
  }

  // =================================================================================================
  // Welt & Räume
  cat('world', 'Welt & Räume', 'Reisen, Etagen, Stempel');
  group('Reisen', true);
  const rooms = allRooms().sort((x, y) => x.floor - y.floor || (x.parent ? 1 : 0) - (y.parent ? 1 : 0));
  let roomPick = d().roomId;
  select('Raum', rooms.map((r) => [r.id, `Etage ${r.floor}: ${r.name}`] as [string, string]), () => roomPick, (v) => void (roomPick = v), 'raum room');
  btn(row('', 'raum reisen hingehen'), 'Hingehen', () => {
    a.close();
    a.toRoom(roomPick);
  }, true);
  const games = allGames().sort((x, y) => x.name.localeCompare(y.name, 'de'));
  let gamePick = games[0]?.id ?? 'slots';
  select('Spiel', games.map((g) => [g.id, g.name] as [string, string]), () => gamePick, (v) => void (gamePick = v), 'spiel game öffnen');
  btn(row('', 'spiel öffnen'), 'Hier öffnen', () => {
    a.close();
    a.openGame(gamePick);
  }, true);
  group('Etagen');
  toggle('Alle Etagen offen (Aufzug)', () => !!cheat(state, FLOORS_KEY, 0), (on) => {
    setCheat(state, FLOORS_KEY, on ? 1 : 0, 0);
    d().unlockedRooms = on ? STAMP_FLOORS.slice() : ['f1'];
  }, 'aufzug räume freischalten');
  group('Stempelkarten');
  const stRow = row('Karte dieser Etage', 'stempel');
  const stampFloor = () => {
    const r = baseRoom(d().roomId).parent ?? d().roomId;
    return /^f\d$/.test(r) ? r : floorOfDay(d().evening.number);
  };
  btn(stRow, '+1 Stempel', () => {
    addStamps(state, stampFloor(), 1, 'Geschenk des Hauses');
    return `Stempel auf Etage ${stampFloor().slice(1)}.`;
  });
  btn(stRow, 'Karte füllen', () => {
    const f = stampFloor();
    addStamps(state, f, STAMPS_PER_CARD - (stampsOnCard(d(), f) % STAMPS_PER_CARD), 'Geschenk des Hauses');
    return `Karte von Etage ${f.slice(1)} ist voll.`;
  });
  for (const f of STAMP_FLOORS) {
    numField(`Etage ${f.slice(1)}: Stempel insgesamt`, () => d().stamps[f] ?? 0, (v) => void (d().stamps[f] = v), 0, 9999, 'stempel');
    toggle(`Etage ${f.slice(1)}: ${STAMP_REWARDS[f]?.name ?? 'Belohnung'}`, () => d().stampRewards.includes(f), (on) => void (d().stampRewards = on ? [...new Set([...d().stampRewards, f])] : d().stampRewards.filter((x) => x !== f)), 'stempel belohnung gold');
  }
  group('Fundstücke');
  btn(row('Kiste, Mondblüte, Münze', 'fundstücke curio'), 'Heute wieder auffüllen', () => {
    for (const c of CURIOS) delete d().counters[`curio:${c.room}`];
    return 'Alle Fundstücke liegen wieder bereit.';
  });

  // =================================================================================================
  // Sammlungen
  cat('collect', 'Sammlungen', 'Erfolge, Trophäen, Album');
  group('Erfolge', true);
  const achRow = row('Alle Erfolge', 'achievements');
  btn(achRow, 'Alle freischalten', () => {
    for (const x of ACHIEVEMENTS) d().achievements[x.id] ??= Date.now();
    return `${ACHIEVEMENTS.length} Erfolge freigeschaltet (ohne Mondsteine).`;
  });
  btn(achRow, 'Alle sperren', () => void (d().achievements = {}));
  note('Ein gesperrter Erfolg, dessen Ziel schon erreicht ist, schaltet sich beim nächsten Spielzug wieder frei (mit Mondsteinen).');
  for (const x of ACHIEVEMENTS) {
    toggle(`${x.name}: ${x.desc}`, () => !!d().achievements[x.id], (on) => {
      if (on) d().achievements[x.id] = Date.now();
      else delete d().achievements[x.id];
    }, 'erfolg achievement');
  }
  group('Trophäen');
  const trRow = row('Neue Trophäe', 'trophäe vitrine');
  let kind: TrophyKind = 'cup';
  let medal: Medal = 'gold';
  const kSel = document.createElement('select');
  kSel.setAttribute('aria-label', 'Trophäen-Art');
  for (const [v, t] of TROPHY_KINDS) kSel.add(new Option(t, v));
  kSel.addEventListener('change', () => (kind = kSel.value as TrophyKind));
  const mSel = document.createElement('select');
  mSel.setAttribute('aria-label', 'Medaille der Trophäe');
  for (const m of MEDALS) mSel.add(new Option(MEDAL_LABEL[m], m, m === medal, m === medal));
  mSel.addEventListener('change', () => (medal = mSel.value as Medal));
  trRow.append(kSel, mSel);
  btn(trRow, 'Hinzufügen', () => {
    state.addTrophy(kind, medal, `Geschenk des Hauses: ${TROPHY_KINDS.find((t) => t[0] === kind)![1]} (${MEDAL_LABEL[medal]})`);
    return 'Trophäe steht in der Vitrine.';
  });
  btn(row('', 'trophäe'), 'Alle Trophäen entfernen', () => void (d().trophies = []));
  live(
    () => d().trophies.map((t) => t.id).join(','),
    () => {
      for (const t of d().trophies.slice().reverse()) {
        const r = row(`${t.title} · ${MEDAL_LABEL[t.medal]}`, 'trophäe');
        btn(r, 'Entfernen', () => void (d().trophies = d().trophies.filter((x) => x.id !== t.id)));
      }
    },
  );
  group('Medaillen');
  for (const m of MEDALS) numField(`${MEDAL_LABEL[m]}`, () => d().medals[m], (v) => void (d().medals[m] = v), 0, 1e6, 'medaille');
  group(ALBUM_NAME);
  const alb = row('Ganzes Album', 'album sammlung');
  btn(alb, `${ALBUM_ENTRY} erscheinen lassen`, () => {
    a.close();
    return albumDebug?.spawn();
  });
  btn(alb, 'Album füllen', () => albumDebug?.fill());
  btn(alb, 'Album leeren', () => void (d().album = {}));
  for (const m of MOTHS) {
    numField(`${m.name} (${RARITY_NAME[m.rarity]})`, () => d().album[m.id] ?? 0, (v) => {
      if (v > 0) d().album[m.id] = v;
      else delete d().album[m.id];
    }, 0, 9999, 'album eintrag');
  }
  group('Geschichte');
  for (let n = 1; n <= CHAPTER_COUNT; n++) {
    const id = `ch:${n}`;
    toggle(`Kapitel ${n}: ${chapterTitle(n)} gelesen`, () => d().storySeen.includes(id), (on) => void (d().storySeen = on ? [...new Set([...d().storySeen, id])] : d().storySeen.filter((x) => x !== id)), 'kapitel story');
  }
  live(
    () => String(d().storySeen.length),
    () => note(`Gehörte Sätze der Stammgäste: ${d().storySeen.filter((x) => !x.startsWith('ch:')).length}.`),
  );
  btn(row('', 'stammgäste gespräche story'), 'Stammgäste-Gespräche zurücksetzen', () => void (d().storySeen = d().storySeen.filter((x) => x.startsWith('ch:'))));

  // =================================================================================================
  // Spielgefühl
  cat('feel', 'Spielgefühl', 'Tempo, Bewegung, Spieler');
  group('Tempo', true);
  slider('Animationstempo', SPEED_STEPS, () => cheat(state, SPEED_KEY, 100), (v) => setCheat(state, SPEED_KEY, v, 100), x100, 'speed geschwindigkeit');
  note('Beschleunigt oder bremst alle Animationen und Wartezeiten (Walzen, Kugel, Karten). Die Ergebnisse ändern sich dadurch nicht.');
  group('Kamera & Laufen', true);
  slider('Kamera-Nähe', [60, 250, 5], () => cheat(state, CAM_KEY, CAM_NORMAL), (v) => setCheat(state, CAM_KEY, v, CAM_NORMAL), x100, 'kamera zoom nah weit karte map');
  slider('Laufgeschwindigkeit', [100, 500, 10], () => cheat(state, WALK_KEY, WALK_NORMAL), (v) => setCheat(state, WALK_KEY, v, WALK_NORMAL), (v) => `${v}`, 'laufen tempo spieler geschwindigkeit');
  note(`Normal: Kamera ${x100(CAM_NORMAL)}, Laufen ${WALK_NORMAL}. Kamera ×1 zeigt fast den ganzen Raum wie früher.`);
  group('Bewegung & Vibration', true);
  const motion = row('Ruhige Bewegung', 'reduced motion animation');
  for (const [v, t] of [[null, 'Wie System'], [true, 'An'], [false, 'Aus']] as const) btn(motion, t, () => {
    setReducedMotion(v);
    return `Ruhige Bewegung: ${reducedMotion() ? 'an' : 'aus'}.`;
  });
  toggle('Vibration', () => d().settings.haptics, (on) => void (d().settings.haptics = on), 'haptik');
  group('Spieler');
  const nameRow = row('Name', 'spieler profil');
  const nameIn = document.createElement('input');
  nameIn.type = 'text';
  nameIn.maxLength = 24;
  nameIn.setAttribute('aria-label', 'Spielername');
  nameIn.addEventListener('change', () => apply(() => {
    const host = (d().players.host ??= { name: 'Du', color: 0xffcf7a });
    host.name = nameIn.value.trim() || 'Du';
  }));
  nameRow.appendChild(nameIn);
  addSync(() => keep(nameIn, d().players.host?.name ?? 'Du'));
  note('Lautstärke: über „Ton an/aus“ im Menü. Feine Regler folgen mit dem neuen Ton.');

  // =================================================================================================
  // Tablet
  cat('tablet', 'Tablet', 'Code ändern');
  group('Code', true);
  const pinIn = (label: string) => {
    const i = document.createElement('input');
    i.type = 'password';
    i.inputMode = 'numeric';
    i.autocomplete = 'off';
    i.maxLength = 8;
    i.pattern = '[0-9]*';
    i.placeholder = '4–8 Ziffern';
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => (i.value = i.value.replace(/\D/g, '').slice(0, 8)));
    row(label, 'code pin tablet passwort').appendChild(i);
    return i;
  };
  const pin1 = pinIn('Neuer Code');
  const pin2 = pinIn('Neuer Code (noch einmal)');
  btn(row('', 'code pin tablet speichern'), 'Code speichern', () => {
    const v = pin1.value;
    if (!validPin(v)) return 'Der Code braucht 4 bis 8 Ziffern.';
    if (v !== pin2.value) return 'Die beiden Eingaben sind nicht gleich.';
    if (!setPin(v)) return 'Der Code ließ sich auf diesem Gerät nicht speichern.';
    pin1.value = pin2.value = '';
    return 'Neuer Code gespeichert. Er gilt ab dem nächsten Öffnen, für alle Spielstände auf diesem Gerät.';
  }, true);
  note('Der Code steht nirgends im Klartext. Vergessen? Die Website-Daten des Browsers für dieses Spiel löschen setzt ihn zurück (dabei gehen auch die Spielstände verloren).');

  // ---- Search ------------------------------------------------------------------------------------
  pane.appendChild(empty);
  const filter = () => {
    const q = search.value.trim().toLowerCase();
    wrap.classList.toggle('searching', !!q);
    let any = false;
    for (const c of cats) {
      let catHit = false;
      for (const det of c.sec.querySelectorAll<HTMLDetailsElement>('details')) {
        const title = det.querySelector('summary')!.textContent!.toLowerCase();
        let hit = false;
        for (const r of det.querySelectorAll<HTMLElement>('.mod-row, .mod-note')) {
          const show = !q || title.includes(q) || (r.dataset.q ?? '').includes(q);
          r.hidden = !show;
          hit ||= show;
        }
        det.hidden = !!q && !hit;
        if (q && hit) det.open = true;
        catHit ||= hit;
      }
      if (q) c.sec.hidden = !catHit;
      any ||= catHit;
    }
    if (!q) showCat(store.get(CAT_KEY) ?? 'luck', wrap.classList.contains('drill'));
    empty.hidden = !q || any;
  };
  search.addEventListener('input', filter);

  const first = store.get(CAT_KEY);
  showCat(cats.some((c) => c.id === first) ? first! : 'luck');
  refresh();
  return wrap;
}
