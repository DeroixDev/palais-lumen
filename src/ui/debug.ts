import { BOSS_DAY, floorForDay, formatChips, type GameState } from '../core/state';
import { CHARMS, WARDROBE } from '../core/items';

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
  btn(days, 'Tag jetzt abrechnen', () => {
    a.close();
    a.endDay();
  });

  return wrap;
}
