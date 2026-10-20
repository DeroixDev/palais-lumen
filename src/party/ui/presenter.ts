// The board show: plays the engine's events on the 3D board and the in-game HUD (./hud: player
// cards, round banner, turn menu, star pointer), and asks this browser's player for decisions
// (dice + items, junction arrows, shop, star, duel, Bande …).
// It is the same for solo, host and friends: it only reads the GameState it is given.

import { getBoard } from '../boards';
import type { BoardDef } from '../boards/types';
import type { Answer, Ask, GameEvent, GameState } from '../engine/state';
import { BONUS, BUDDIES, FINALE_RULES, ITEMS, type BonusId, type ItemId } from '../engine/tables';
import { sfx } from '../sfx';
import type { Seat } from '../types';
import { $, E, SPEED, esc, reduced, wait } from '../util';
import { BoardView } from '../view3d/boardview';
import { hopFig } from '../view3d/figures';
import { floatText } from '../view3d/stage';
import { Hud } from './hud';
import { Scenes } from './scenes';

export type BonusList = { id: BonusId; winners: number[] }[];

let toastT = 0;
export function toast(text: string, col = 'var(--acid)') {
  const t = $('#toast');
  t.textContent = text;
  t.style.setProperty('--tc', col);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = window.setTimeout(() => t.classList.remove('show'), 2600 * Math.max(SPEED, 0.6));
}
export async function banner(text: string, col = 'var(--acid)') {
  const b = $('#bannerBand');
  b.textContent = text;
  b.style.setProperty('--bc', col);
  sfx.whoosh();
  if (reduced) { await b.animate([{ opacity: 0, transform: 'rotate(-6deg)' }, { opacity: 1, transform: 'rotate(-6deg)', offset: 0.2 }, { opacity: 1, transform: 'rotate(-6deg)', offset: 0.8 }, { opacity: 0, transform: 'rotate(-6deg)' }], { duration: 900 }).finished; return; }
  await b.animate([{ transform: 'rotate(-6deg) translateX(-110%)', opacity: 1 }, { transform: 'rotate(-6deg) translateX(-2%)', opacity: 1, offset: 0.22 }, { transform: 'rotate(-6deg) translateX(2%)', opacity: 1, offset: 0.74 }, { transform: 'rotate(-6deg) translateX(110%)', opacity: 1 }], { duration: 1250 * Math.max(SPEED, 0.3), easing: 'cubic-bezier(.2,.9,.25,1)' }).finished;
}

export class Presenter {
  board: BoardDef;
  view: BoardView;
  st!: GameState;
  /** A friend whose show is behind skips the animations. */
  hurry = false;
  bonus: BonusList = [];
  private pathDone: ((to: number) => void) | null = null;
  private pathOpts: { to: number; ok: boolean }[] = [];
  private watching = false;
  private keyFn: ((e: KeyboardEvent) => void) | null = null;
  /** Full-screen scenes for shop, star, duel and the other spaces (see ./scenes). */
  scn: Scenes;
  /** Player cards, round banner, turn menu, map, star pointer, board signs. */
  hud: Hud;

  constructor(public seats: Seat[], public me: number, boardId: string) {
    this.board = getBoard(boardId);
    this.view = new BoardView(this.board);
    this.view.setSeats(seats);
    this.scn = new Scenes(this);
    this.hud = new Hud(this);
    const canvas = $<HTMLCanvasElement>('#gl');
    const onMove = (e: PointerEvent) => {
      if (!this.pathDone) return;
      const to = this.view.pickArrow(e.clientX, e.clientY, canvas.getBoundingClientRect());
      this.view.hoverArrow(to ?? -1);
      canvas.style.cursor = to !== null ? 'pointer' : '';
    };
    const onClick = (e: MouseEvent) => {
      if (!this.pathDone) return;
      const to = this.view.pickArrow(e.clientX, e.clientY, canvas.getBoundingClientRect());
      if (to !== null && this.pathOpts.some((o) => o.to === to && o.ok)) this.pathDone(to);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('click', onClick);
    this.keyFn = (e) => this.onKey(e);
    addEventListener('keydown', this.keyFn);
  }

  dispose() {
    if (this.keyFn) removeEventListener('keydown', this.keyFn);
    this.scn.dispose();
    this.hud.dispose();
    this.view.dispose();
  }

  private setUser(on: boolean) { this.hud.setMap(on); }

  private onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || document.body.classList.contains('in-mg') || document.body.classList.contains('in-pod')) return;
    if (this.pathDone) {
      const ok = this.pathOpts.filter((o) => o.ok);
      const order = [...this.pathOpts].sort((a, b) => this.view.arrowScreenX(a.to) - this.view.arrowScreenX(b.to));
      let pick: number | null = null;
      if (e.code === 'ArrowLeft') pick = order.find((o) => o.ok)?.to ?? null;
      else if (e.code === 'ArrowRight') pick = [...order].reverse().find((o) => o.ok)?.to ?? null;
      else if (/^Digit[1-3]$/.test(e.code)) { const o = order[Number(e.code[5]) - 1]; if (o?.ok) pick = o.to; }
      if (pick !== null && ok.length) { e.preventDefault(); this.pathDone(pick); }
    }
    // the turn menu, the item bar and the map keys live in the HUD
  }

  name(p: number) { return this.seats[p].name; }
  private wait(ms: number) { return this.hurry ? Promise.resolve() : wait(ms); }

  // ---------------- HUD ----------------
  /** Player cards follow the state (only what changed); animate: count, fly, swap. */
  renderRank(animate = true) { if (this.st) { this.hud.update(animate); this.hud.setRound(animate); } }
  renderRound() { if (this.st) this.hud.setRound(false); }

  setTurn(p: number) {
    void p;
    this.hud.update();
    this.hud.refreshStar();
  }

  /** Everything from the state without animation (start, resume, a friend catching up). */
  sync(st: GameState) {
    this.st = st;
    this.view.apply(st);
    this.view.hideCounter();
    this.view.diceHide();
    this.hud.setRound(false);
    this.hud.update(false);
    this.hud.boardNews('round', false, true);
    this.hud.refreshStar();
  }

  // ---------------- events ----------------
  async play(ev: GameEvent, st: GameState) {
    this.st = st;
    this.clearWatch();
    if (await this.scn.event(ev, st)) { this.quiet(ev, st); return; }
    await this.show(ev, st);
    this.hud.setRound(true);
  }

  private async show(ev: GameEvent, st: GameState) {
    const V = this.view, H = this.hurry;
    switch (ev.k) {
      case 'sync': this.sync(st); break;
      case 'banner': if (!H) await banner(ev.text, ev.color); break;
      case 'toast': toast(ev.text, ev.color); await this.wait(1400); break;
      case 'round':
        // the banner drops in, the last round gets the big band too, then the turn-order parade
        this.hud.setRound(true);
        this.hud.update();
        if (!H && ev.round === st.rules.rounds) await banner('Letzte Runde!', 'var(--red)');
        await this.hud.paradeRun();
        this.hud.boardNews('round', ev.round === 1);
        break;
      case 'turn':
        V.turn = ev.p;
        V.view.mode = 'follow';
        this.setTurn(ev.p);
        await this.wait(350);
        break;
      case 'item': sfx.pop(); toast(`${this.name(ev.p)} setzt ${ITEMS[ev.item].name} ein.`, '#ffe14a'); this.renderRank(); await this.wait(900); break;
      case 'roll': {
        sfx.roll();
        if (!H) await V.diceHit(ev.p, ev.dice, ev.dieKind);
        const total = ev.dice.reduce((a, b) => a + b, 0) + ev.bonus;
        if (ev.bonus) toast(`Pips würfelt mit: +${ev.bonus}`, '#7dff8a');
        if (ev.dice.length > 1 && !H) floatText(V.figs[ev.p].root.position.clone().setY(3.6), ev.dice.join(' + '), '#ffe14a', V.scene);
        V.showCounter(ev.p, total);
        await this.wait(200);
        break;
      }
      case 'hop':
        if (H) { V.teleport(ev.p, ev.to); V.figs[ev.p].root.position.copy(V.nodePos(ev.to, ev.p)); }
        else { sfx.hop(ev.left); await V.hop(ev.p, ev.from, ev.to, 0); }
        if (ev.left > 0) V.showCounter(ev.p, ev.left); else V.hideCounter();
        this.hud.refreshStar();
        break;
      case 'blocked': V.hideCounter(); sfx.bonk(); toast(`${this.name(ev.p)}: ${ev.text}`, 'var(--pink)'); await this.wait(1100); break;
      case 'coins': {
        if (ev.d) {
          const f = V.figs[ev.p];
          if (!H) {
            floatText(f.root.position.clone().setY(f.root.position.y + 2.5), `${ev.d > 0 ? '+' : '−'}${Math.abs(ev.d)} Münzen${ev.text ? ` · ${ev.text}` : ''}`, ev.d > 0 ? '#ffe14a' : '#ff8fb0', V.scene);
            V.coinBurst(ev.p, ev.d);
          }
          if (ev.d > 0) sfx.coin(); else sfx.lose();
        }
        this.renderRank();
        await this.wait(420);
        break;
      }
      case 'starBuy':
        V.hideCounter();
        sfx.star();
        if (!H) await V.starFly(ev.p);
        toast(`${this.name(ev.p)} holt sich einen Stern!`, '#ffe14a');
        this.renderRank();
        await this.wait(700);
        break;
      case 'starMove': if (!H) await V.starMove(ev.to); else V.placeStar(ev.to); this.hud.refreshStar(); break;
      case 'starMiss': toast(`Der Stern kostet ${ev.price} Münzen. ${this.name(ev.p)} hat zu wenig.`, 'var(--pink)'); await this.wait(1200); break;
      case 'land': V.hideCounter(); sfx.land(); await this.wait(250); break;
      case 'buddy': {
        const b = BUDDIES[ev.kind];
        V.setBuddy(st.buddy?.kind ?? null, st.buddy?.owner ?? null, st.buddy?.at ?? null);
        if (ev.what === 'appear') { toast(`Kumpel ${b.name} (${b.look}) wartet auf einem Kumpel-Feld. ${b.text}`, b.color); if (ev.node !== undefined && !H) { V.view.mode = 'point'; const n = this.board.graph.nodes[ev.node]; V.view.pt.set(n.x, 0, n.z); await this.wait(1300); V.view.mode = 'follow'; } }
        else if (ev.what === 'join') { sfx.star(); toast(`${b.name} kommt mit ${this.name(ev.p!)}! ${b.text}`, b.color); }
        else if (ev.what === 'leave') toast(`${b.name} verabschiedet sich von ${this.name(ev.p!)}.`, b.color);
        else toast(`${b.name} wechselt zu ${this.name(ev.p!)}.`, b.color);
        this.renderRank();
        await this.wait(1300);
        break;
      }
      case 'swap': {
        sfx.whoosh();
        V.teleport(ev.a, st.players[ev.a].node);
        V.teleport(ev.b, st.players[ev.b].node);
        if (H) V.apply(st);
        else await Promise.all([hopFig(V.figs[ev.a], V.nodePos(st.players[ev.a].node, ev.a), 0.6, 4), hopFig(V.figs[ev.b], V.nodePos(st.players[ev.b].node, ev.b), 0.6, 4)]);
        this.hud.refreshStar();
        break;
      }
      case 'wheel': await this.wheel(ev.options, ev.pick); break;
      case 'path': V.hideArrows(); $('#choice').hidden = true; break;
      case 'shop':
        if (ev.item) { sfx.buy(); toast(`${this.name(ev.p)} kauft ${ITEMS[ev.item].name} für ${ev.price} Münzen.`, '#b46bff'); }
        else toast(`${this.name(ev.p)} kauft nichts.`, '#b46bff');
        this.renderRank();
        await this.wait(900);
        break;
      case 'trap': V.setTraps(st.traps); break;
      case 'look': {
        if (H) break;
        const n = this.board.graph.nodes[ev.node];
        V.view.mode = 'point';
        V.view.pt.set(n.x, 0, n.z);
        await this.wait(1000);
        V.view.mode = 'follow';
        break;
      }
      case 'gimmick':
        if (!H) await V.decor.play(ev.name, ev.data); else V.decor.apply(st.bs);
        this.hud.boardNews('gimmick');
        break;
      case 'mgAnnounce':
        V.hideCounter();
        if (!H) await banner('Minispiel!', 'var(--pink)');
        toast(ev.text, 'var(--pink)');
        await this.wait(1200);
        break;
      case 'bonus': this.bonus = ev.list; break;
      case 'end': break;
    }
  }

  /** A scene showed this event: only the board state and the panels follow. */
  private quiet(ev: GameEvent, st: GameState) {
    const V = this.view;
    if (ev.k === 'land') { V.hideCounter(); sfx.land(); }
    else if (ev.k === 'buddy') V.setBuddy(st.buddy?.kind ?? null, st.buddy?.owner ?? null, st.buddy?.at ?? null);
    else if (ev.k === 'gimmick') { V.decor.apply(st.bs); this.hud.boardNews('gimmick'); }
    else if (ev.k === 'trap') V.setTraps(st.traps);
    else if (ev.k === 'bonus') this.bonus = ev.list;
    else if (ev.k === 'roll') V.hideCounter();
    if (ev.k === 'starMove' || ev.k === 'swap' || ev.k === 'hop') this.hud.refreshStar();
    this.renderRank();
  }

  private async wheel(options: string[], pick: number) {
    const w = $('#wheel'), t = $('#wheelTxt');
    w.hidden = false;
    sfx.wheel();
    const spins = this.hurry ? 1 : 14 + pick;
    for (let k = 0; k <= spins; k++) {
      const i = (pick - spins + k + options.length * 20) % options.length;
      t.textContent = options[i];
      if (k < spins) await this.wait(60 + E.out(k / spins) * 140);
    }
    t.textContent = options[pick];
    sfx.pop();
    await this.wait(900);
    w.hidden = true;
  }

  // ---------------- watching somebody else decide ----------------
  watch(p: number, a: Ask) {
    if (this.scn.watch(p, a)) return;
    const n = this.name(p);
    const txt: Record<Ask['q'], string> = {
      roll: `${n} würfelt gleich …`, joker: `${n} wählt eine Zahl …`, target: `${n} überlegt …`, path: `${n} wählt einen Weg …`,
      buyStar: `${n} überlegt beim Stern …`, shop: `${n} stöbert im Laden …`, duel: `${n} wählt ein Duell …`, bandeOffer: `${n} überlegt …`,
      finale: `${n} wählt die Finale-Regel …`, yesno: `${n} überlegt …`,
    };
    const el = $('#watch');
    el.textContent = txt[a.q];
    el.hidden = false;
    this.watching = true;
    if (a.q === 'roll') this.view.diceShow(p, 1);
    if (a.q === 'path') this.view.showArrows(a.node, a.options);
  }
  clearWatch() {
    if (!this.watching) return;
    this.watching = false;
    $('#watch').hidden = true;
    if (!this.pathDone) this.view.hideArrows();
  }

  // ---------------- asking this browser's player ----------------
  async ask(p: number, a: Ask): Promise<Answer> {
    this.clearWatch();
    this.setUser(false);
    this.view.view.mode = 'follow';
    this.view.turn = this.st.turn < this.st.players.length ? this.st.turn : p;
    sfx.pop();
    const inScene = this.scn.ask(p, a);
    if (inScene) return inScene;
    switch (a.q) {
      case 'roll': return this.hud.turnMenu(p, a.items);
      case 'joker': {
        const n = await this.choose('Würfel-Joker', 'Welche Zahl soll es sein?', [1, 2, 3, 4, 5, 6].map((v) => ({ label: String(v), value: v })));
        return { n };
      }
      case 'target': {
        const opts = a.options.map((o) => ({ label: o < 0 ? 'Niemand' : this.name(o), value: o, sub: o < 0 ? '' : this.playerLine(o) }));
        return { p: await this.choose(a.title, a.text, opts, true) };
      }
      case 'path': return { to: await this.askPath(a.node, a.options) };
      case 'buyStar': {
        const yes = await this.choose('Stern kaufen?', `Ein Stern kostet ${a.price} Münzen. Du hast ${this.st.players[p].coins}.`, [{ label: `Kaufen (${a.price})`, value: true }, { label: 'Nicht jetzt', value: false }]);
        return { yes };
      }
      case 'shop': {
        const coins = this.st.players[p].coins;
        const opts = a.offer.map((o) => ({ label: ITEMS[o.item].name, value: o.item as ItemId | null, sub: `${o.price} Münzen · ${ITEMS[o.item].text}`, disabled: !o.ok }));
        opts.push({ label: 'Nichts kaufen', value: null, sub: '', disabled: false });
        const item = await this.choose(a.passing ? 'Laden im Vorbeigehen' : 'Laden', `Du hast ${coins} Münzen und ${this.st.players[p].items.length} von 3 Plätzen belegt.`, opts, true);
        return { item };
      }
      case 'duel': {
        const o = await this.choose('Duell!', 'Wen forderst du heraus?', a.opponents.map((q) => ({ label: this.name(q), value: q, sub: this.playerLine(q) })), true);
        const stake = await this.choose('Einsatz', `Worum spielt ihr gegen ${this.name(o)}?`, a.stakes.map((s, i) => ({ label: 'star' in s ? '1 Stern' : `${s.coins} Münzen`, value: i, sub: 'Wer gewinnt, bekommt den Einsatz des anderen.' })), true);
        return { p: o, stake };
      }
      case 'bandeOffer': {
        const yes = await this.choose('Bande?', `${this.name(a.from)} bietet dir eine Bande für 2 Runden an: Ihr teilt alle Minispiel-Münzen 50:50.`, [{ label: 'Einschlagen', value: true }, { label: 'Lieber nicht', value: false }]);
        return { yes };
      }
      case 'finale': {
        const rule = await this.choose('Finale-Regel', 'Du liegst hinten und darfst eine Regel für die letzten 3 Runden wählen.', a.options.map((r) => ({ label: FINALE_RULES[r].name, value: r, sub: FINALE_RULES[r].text })), true);
        return { rule };
      }
      case 'yesno': {
        const yes = await this.choose(a.title, a.text, [{ label: a.yes, value: true }, { label: a.no, value: false }]);
        return { yes };
      }
    }
  }

  private playerLine(p: number) {
    const P = this.st.players[p];
    return `${P.stars} Sterne · ${P.coins} Münzen`;
  }

  choose<T>(title: string, sub: string, opts: { label: string; value: T; sub?: string; disabled?: boolean }[], grid = false): Promise<T> {
    return new Promise((res) => {
      const box = $('#ask');
      $('#askT').textContent = title;
      $('#askS').textContent = sub;
      const wrap = $('#askB');
      wrap.className = grid ? 'grid' : '';
      wrap.innerHTML = '';
      opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = grid ? 'opt' : 'btn' + (i === 0 ? ' go' : ' ghost');
        b.innerHTML = grid ? `${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}` : esc(o.label);
        b.disabled = !!o.disabled;
        b.onclick = () => { box.hidden = true; sfx.pop(); res(o.value); };
        wrap.appendChild(b);
      });
      box.hidden = false;
      box.scrollTop = 0;
      (wrap.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    });
  }

  private askPath(node: number, options: { to: number; name: string; len: number; blocked: string | null; key: boolean }[]): Promise<number> {
    return new Promise((res) => {
      const V = this.view;
      // the distance to the star through each way, on the arrows and the buttons
      const dist = options.map((o) => this.hud.distVia(o.to));
      V.showArrows(node, options.map((o, i) => ({ ...o, name: dist[i] !== null ? `${o.name} · ★ ${dist[i]}` : o.name })));
      this.pathOpts = options.map((o) => ({ to: o.to, ok: !o.blocked || o.key }));
      const ch = $('#choice');
      ch.innerHTML = '';
      const order = [...options].sort((a, b) => V.arrowScreenX(a.to) - V.arrowScreenX(b.to));
      order.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.disabled = !!o.blocked && !o.key;
        const d = dist[options.indexOf(o)];
        b.innerHTML = `${esc(o.name)}<small>${o.blocked ? (o.key ? 'gesperrt · Schlüssel öffnet' : esc(o.blocked)) : `${o.len} Felder`}${d !== null ? ` · Stern in ${d}` : ''} · ${i + 1}</small>`;
        b.onmouseenter = () => V.hoverArrow(o.to);
        b.onmouseleave = () => V.hoverArrow(-1);
        b.onclick = () => this.pathDone?.(o.to);
        ch.appendChild(b);
      });
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Pfeil antippen oder ← →';
      ch.appendChild(hint);
      ch.hidden = false;
      $('#stage').classList.add('choosing');
      this.hud.choosing = true;
      this.pathDone = (to) => {
        this.pathDone = null;
        ch.hidden = true;
        $('#stage').classList.remove('choosing');
        this.hud.choosing = false;
        $<HTMLCanvasElement>('#gl').style.cursor = '';
        V.hideArrows();
        sfx.pop();
        res(to);
      };
    });
  }

  /** Close any open question (a friend's ask was answered by a bot after a timeout). */
  cancelAsk() {
    this.scn.cancel();
    $('#ask').hidden = true;
    $('#choice').hidden = true;
    this.hud.cancel();
    this.pathDone = null;
    this.view.hideArrows();
    $('#stage').classList.remove('choosing');
    this.hud.choosing = false;
  }
}

export const bonusText = (id: BonusId) => BONUS[id];
