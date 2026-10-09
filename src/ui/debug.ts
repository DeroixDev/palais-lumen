import { BOSS_DAY, floorForDay, formatChips, type GameState } from '../core/state';
import { CHARMS, WARDROBE } from '../core/items';
import { EVENTS, currentEvent, setEvent } from '../core/events';
import { completeAllQuests, rerollQuests } from '../core/quests';
import { STAMPS_PER_CARD, addStamps, floorOfDay, stampsOnCard } from '../core/stamps';
import { PHASE_NAME } from '../core/boss';
import { MAX_HEAT } from '../core/moon';
import { PERKS } from '../core/perks';
import { baseRoom } from '../core/registry';
import { seasonDebug } from './season';
import { bossRunDebug } from './bossRun';
import { debugClearActive, debugFillBag } from '../core/itemsCore';

/** What the debug panel needs from the game loop. */
export interface DebugActions {
  /** Start the given day fresh with the current money and walk into the foyer. */
  jumpToDay(day: number): void;
  endDay(): void;
  toast(text: string): void;
  close(): void;
}

/**
 * Test panel for playing through a season quickly: hand out Falter and Mondsteine, jump days,
 * hit or miss the goal. Changes go straight into the save, like normal play.
 */
export function debugPanel(state: GameState, a: DebugActions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'dbg';
  const d = state.data;

  const info = document.createElement('p');
  info.className = 'dbg-info';
  let syncAmount = () => {};
  const sync = () => {
    syncAmount();
    info.textContent = `Tag ${d.evening.number} · Etage ${floorForDay(d.evening.number)} · ${formatChips(d.balance)} Falter · Ziel ${formatChips(state.goalBalance)} · ${formatChips(d.moonstones)} Mondsteine`;
  };
  sync();
  wrap.appendChild(info);

  const section = (title: string) => {
    const h = document.createElement('h3');
    h.textContent = title;
    const row = document.createElement('div');
    row.className = 'dbg-row';
    wrap.append(h, row);
    return row;
  };
  const btn = (row: HTMLElement, label: string, fn: () => string | void, primary = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.addEventListener('click', () => {
      const msg = fn();
      state.emit();
      sync();
      if (msg) a.toast(msg);
    });
    row.appendChild(b);
    return b;
  };
  const num = (row: HTMLElement, value: number, min: number, max: number, label: string) => {
    const i = document.createElement('input');
    i.type = 'number';
    i.inputMode = 'numeric';
    i.min = String(min);
    i.max = String(max);
    i.value = String(value);
    i.setAttribute('aria-label', label);
    row.appendChild(i);
    return () => Math.max(min, Math.min(max, Math.floor(Number(i.value) || 0)));
  };
  const give = (n: number) => {
    d.balance = Math.max(0, Math.floor(d.balance + n));
    d.records.bestBalance = Math.max(d.records.bestBalance, d.balance);
  };

  // Money: counts towards today's goal, just like a win would.
  const money = section('Falter');
  for (const n of [1_000, 10_000, 100_000]) btn(money, `+${formatChips(n)}`, () => give(n));
  btn(money, '×10', () => give(d.balance * 9));
  const setRow = section('Falter setzen');
  const amount = num(setRow, d.balance, 0, 1e12, 'Falter-Betrag');
  const amountInput = setRow.querySelector('input')!;
  syncAmount = () => (amountInput.value = String(d.balance));
  btn(setRow, 'Setzen', () => {
    d.balance = amount();
    d.records.bestBalance = Math.max(d.records.bestBalance, d.balance);
  });
  btn(setRow, 'Ziel genau erreichen', () => {
    d.balance = state.goalBalance;
    return 'Kontostand steht genau auf dem Tagesziel.';
  });
  btn(setRow, 'Pleite (0)', () => {
    d.balance = 0;
  });
  btn(setRow, 'Tagesstart = jetzt', () => {
    d.evening.startBalance = d.balance;
    d.evening.quota = state.quotaToday(d.evening.number, d.balance);
    return `Neuer Tagesstart: Einsätze und Ziel richten sich jetzt nach ${formatChips(d.balance)} Falter.`;
  });

  const stones = section('Mondsteine');
  for (const n of [10, 100, 1_000]) btn(stones, `+${formatChips(n)}`, () => void (d.moonstones += n));
  btn(stones, 'Alles im Shop freischalten', () => {
    for (const w of WARDROBE) if (!d.owned.includes(w.id)) d.owned.push(w.id);
    for (const c of CHARMS) if (!d.charms.includes(c.id)) d.charms.push(c.id);
    return 'Alle Outfits und Glücksbringer gehören dir.';
  });

  // Modifier items (src/core/itemsCore.ts).
  const itemRow = section('Items');
  btn(itemRow, 'Alle Items +1', () => {
    debugFillBag(state);
    return 'Von jedem Item liegt eins mehr im Beutel.';
  });
  btn(itemRow, 'Aktive Items löschen', () => {
    debugClearActive(state);
    return 'Keine Items mehr aktiv.';
  });

  // Days: jumping keeps the money and starts the chosen day fresh in the foyer.
  const days = section(`Tag (1 bis ${BOSS_DAY}, ${BOSS_DAY} = Boss)`);
  const day = num(days, d.evening.number, 1, BOSS_DAY, 'Tag');
  btn(days, 'Zu diesem Tag springen', () => {
    a.close();
    a.jumpToDay(day());
  }, true);
  btn(days, 'Boss-Tag', () => {
    a.close();
    a.jumpToDay(BOSS_DAY);
  });
  btn(days, 'Spiele neu würfeln', () => {
    d.counters.rotSalt = (d.counters.rotSalt ?? 0) + 1;
    a.close();
    a.jumpToDay(d.evening.number);
  });
  btn(days, 'Tag jetzt abrechnen', () => {
    a.close();
    a.endDay();
  });

  // Day events, guest tasks and stamp cards (src/core/events.ts, quests.ts, stamps.ts).
  const evRow = section('Ereignisse & Aufträge');
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Ereignis');
  for (const [id, name] of [['', 'Kein Ereignis'], ...EVENTS.map((e) => [e.id, e.name])]) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = name;
    o.selected = id === d.event;
    sel.appendChild(o);
  }
  evRow.appendChild(sel);
  btn(evRow, 'Ereignis setzen', () => {
    setEvent(state, sel.value);
    return currentEvent(d) ? `Ereignis: ${currentEvent(d)!.name}` : 'Heute ohne Ereignis.';
  });
  btn(evRow, 'Neue Aufträge', () => {
    rerollQuests(state);
    return `${d.quests.length} neue Aufträge für heute.`;
  });
  btn(evRow, 'Aufträge erledigen', () => `${completeAllQuests(state)} Aufträge erledigt.`);
  const stampFloor = () => { const r = baseRoom(d.roomId).parent ?? d.roomId; return /^f\d$/.test(r) ? r : floorOfDay(d.evening.number); };
  btn(evRow, '+1 Stempel', () => {
    addStamps(state, stampFloor(), 1, 'Debug');
    return `Stempel auf Etage ${stampFloor().slice(1)}.`;
  });
  btn(evRow, 'Karte füllen', () => {
    const f = stampFloor();
    addStamps(state, f, STAMPS_PER_CARD - (stampsOnCard(d, f) % STAMPS_PER_CARD), 'Debug');
    return `Karte von Etage ${f.slice(1)} ist voll.`;
  });

  // Season: perk draft, moon level, boss phase (src/ui/season.ts).
  const sea = section('Saison');
  btn(sea, 'Glücksbringer-Wahl jetzt', () => {
    a.close();
    seasonDebug?.debugDraft();
  });
  btn(sea, 'Alle Glücksbringer', () => {
    d.perks = PERKS.map((p) => p.id);
    d.evening.quota = state.quotaToday(d.evening.number);
    return `${d.perks.length} Glücksbringer an der Kette.`;
  });
  btn(sea, 'Kette leeren', () => {
    d.perks = [];
    d.evening.quota = state.quotaToday(d.evening.number);
  });
  const heatRow = section(`Mondstufe (0 bis ${MAX_HEAT}, freigeschaltet: ${d.heatUnlocked})`);
  const heat = num(heatRow, d.heat, 0, MAX_HEAT, 'Mondstufe');
  btn(heatRow, 'Stufe setzen', () => {
    seasonDebug?.debugHeat(heat());
    return `Mondstufe ${d.heat}. Ziel heute: ${formatChips(state.goalBalance)} Falter.`;
  });
  btn(heatRow, 'Bis Stufe freischalten', () => {
    d.heatUnlocked = Math.max(d.heatUnlocked, heat());
    delete d.counters.heatPick;
    return `Mondstufen bis ${d.heatUnlocked} frei. Die Mondscheibe erscheint zu Beginn der nächsten Saison.`;
  });
  btn(heatRow, 'Mondscheibe öffnen', () => {
    d.heatUnlocked = Math.max(1, d.heatUnlocked);
    a.close();
    seasonDebug?.openDial();
  });
  const bossRow = section('Boss-Phase (1 bis 3, nur Tag 13)');
  const phase = num(bossRow, Math.max(1, d.bossPhase), 1, 3, 'Boss-Phase');
  btn(bossRow, 'Phase setzen', () => {
    const msg = seasonDebug?.boss.setPhase(phase());
    if (msg) return msg;
    a.close();
    return `Phase ${d.bossPhase}: ${PHASE_NAME[d.bossPhase]}`;
  });
  btn(bossRow, 'Königin auf 50 %', () => {
    if (d.evening.number < BOSS_DAY) return 'Das geht nur am Boss-Tag.';
    d.balance = d.evening.startBalance + Math.ceil(d.evening.quota * 0.5);
    a.close();
  });
  btn(bossRow, 'Königin auf 20 %', () => {
    if (d.evening.number < BOSS_DAY) return 'Das geht nur am Boss-Tag.';
    d.balance = d.evening.startBalance + Math.ceil(d.evening.quota * 0.8);
    a.close();
  });
  // Boss corridor on floor 5 (src/ui/bossRun.ts).
  const runRow = section('Boss-Gang (Etage 5)');
  btn(runRow, 'Boss-Gang zurücksetzen', () => bossRunDebug?.debugReset());
  btn(runRow, 'Zur Königin', () => {
    a.close();
    return bossRunDebug?.debugToQueen();
  });

  return wrap;
}
