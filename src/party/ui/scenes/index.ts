// The scene director: turns the engine's events and questions into full-screen board scenes
// (shop, star, duel, Kumpel, Bande/Rivale, Ereignis, Glücksrad, Plus/Minus, board fields,
// Brettfest, Finale, bonus stars). It sits in front of the Presenter: what a scene shows, the
// board does not show again; questions open the matching scene for this browser's player, and
// for everybody else the same scene opens as a spectator (via the existing 'watch' messages).
// The engine and the network are unchanged: the result of a choice arrives as the next event.

import './scenes.css';
import type { Answer, Ask, GameEvent, GameState } from '../../engine/state';
import type { ItemId } from '../../engine/tables';
import { TEST } from '../../util';
import { flags, isFast, killPick, setFast, type Host } from './core';
import type { Scene } from './base';
import { ShopScene } from './shop';
import {
  BonusScene, BuddyScene, ChoiceScene, DuelScene, EventScene, FestScene, FinaleScene, ItemScene, JetonScene, LiftScene, LuckScene,
  SpaceScene, StageScene, StarScene, TeamScene, XScene,
} from './moments';

const ENGINE_BANNERS = new Set(['Finale!', 'Duell!', 'Kumpel-Duell!']);

let active: Scenes | null = null;
/** A minigame starts: whatever scene is open goes away at once. */
export function closeScenes() { active?.closeNow(); }

export class Scenes {
  cur: Scene | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private h: Host) { active = this; }
  get host() { return this.h; }

  dispose() { this.closeNow(); if (active === this) active = null; }

  /** Runs open/close steps one after another (watch calls are not awaited by the presenter). */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private async close(quick = false) {
    const s = this.cur;
    if (!s) return;
    this.cur = null;
    killPick();
    await s.leave(quick || this.h.hurry);
  }

  closeNow() {
    const s = this.cur;
    this.cur = null;
    killPick();
    if (s) void s.leave(true);
  }

  private async open(s: Scene) {
    await this.close();
    this.cur = s;
    flags.rush = false;
    await s.enter();
    return s;
  }

  /** An event from the engine. true: a scene showed it (the presenter only updates panels). */
  event(ev: GameEvent, st: GameState): Promise<boolean> {
    return this.run(async () => {
      this.h.st = st;
      if (this.h.hurry) { if (this.cur) await this.close(true); return false; }
      if (this.cur) {
        let v: string;
        try { v = await this.cur.on(ev); } catch (e) { console.error(e); v = 'close'; }
        if (v === 'eat') return true;
        if (v === 'end') { await this.close(); return true; }
        if (v === 'pass') return false;
        await this.close();
      }
      const s = this.forEvent(ev);
      if (!s) return false;
      try {
        await this.open(s);
        // the opening event: some carry the story (spin, join, star), the rest only opened it
        const v = ev.k === 'wheel' || ev.k === 'buddy' || ev.k === 'starBuy' || ev.k === 'bonus' ? await s.on(ev) : ev.k === 'starMiss' ? 'end' : 'eat';
        if (v === 'end') { await this.close(); return true; }
        if (v === 'close') { await this.close(); return false; }
        return true;
      } catch (e) {
        console.error(e);
        this.closeNow();
        return false;
      }
    });
  }

  private forEvent(ev: GameEvent): Scene | null {
    const h = this.h, st = h.st;
    switch (ev.k) {
      case 'land': {
        const t = ev.type;
        if (t === 'P' || t === 'G' || t === 'M') return new SpaceScene(h, ev.p, t);
        if (t === 'E') return new EventScene(h, ev.p);
        if (t === 'L') return new LuckScene(h, ev.p);
        if (t === 'B') return new BuddyScene(h, ev.p);
        if (t === 'X') {
          const id = h.board.id;
          if (id === 'palais') return new JetonScene(h, ev.p);
          if (id === 'bunker') return new LiftScene(h, ev.p);
          if (id === 'neonstadt') return new StageScene(h, ev.p);
          return new XScene(h, ev.p);
        }
        return null;
      }
      case 'item': return new ItemScene(h, ev.p, ev.item as ItemId);
      case 'wheel': return new LuckScene(h, ev.p);
      case 'buddy': return ev.what === 'join' || ev.what === 'lure' || ev.what === 'leave' ? new BuddyScene(h, ev.p ?? 0) : null;
      case 'starBuy': return new StarScene(h, ev.p, 'gift');
      case 'starMiss': return new StarScene(h, ev.p, 'miss', ev.price);
      case 'banner':
        if (ev.text === 'Finale!') return new FinaleScene(h);
        if (!ENGINE_BANNERS.has(ev.text) && st.phase === 'play') return new FestScene(h, ev.text);
        return null;
      case 'bonus': return new BonusScene(h);
      default: return null;
    }
  }

  private forAsk(p: number, a: Ask): Scene | null {
    const h = this.h;
    switch (a.q) {
      case 'shop': return new ShopScene(h, p, a);
      case 'buyStar': return new StarScene(h, p, 'buy', a.price);
      case 'duel': return new DuelScene(h, p);
      case 'target': return a.title === 'Bande' || a.title === 'Rivale' ? new TeamScene(h, p, a.title) : a.title === 'Tauschkarte' ? new ItemScene(h, p, 'tausch') : new ChoiceScene(h, p, a.title);
      case 'bandeOffer': return new TeamScene(h, a.from, 'Bande');
      case 'finale': return new FinaleScene(h);
      case 'joker': return new ItemScene(h, p, 'joker');
      case 'yesno': return a.title === 'Jetonfeld' && h.board.id === 'palais' ? new JetonScene(h, p) : new ChoiceScene(h, p, a.title);
      default: return null;
    }
  }

  /** This browser's player decides inside a scene; null = the presenter asks (dice, junction). */
  ask(p: number, a: Ask): Promise<Answer> | null {
    if (a.q === 'roll' || a.q === 'path') { void this.run(() => this.close()); return null; }
    return this.run(async () => {
      if (this.cur && this.cur.accepts(a, p)) return this.cur;
      const s = this.forAsk(p, a);
      if (!s) return null;
      return this.open(s);
    }).then((s) => (s ? s.ask(a, p) : this.fallback()));
  }
  private fallback(): Promise<Answer> { return Promise.reject(new Error('no scene')); }

  /** Somebody else decides: the same scene, as a spectator. false = the presenter shows it. */
  watch(p: number, a: Ask): boolean {
    if (a.q === 'roll' || a.q === 'path') {
      if (this.cur) void this.run(() => this.close());
      return false;
    }
    if (this.h.hurry) return false;
    void this.run(async () => {
      let s = this.cur && this.cur.accepts(a, p) ? this.cur : null;
      if (!s) { const n = this.forAsk(p, a); if (!n) return; s = await this.open(n); }
      s.watch(a, p);
    });
    return true;
  }

  /** The question was taken away (a bot answered for a friend who took too long). */
  cancel() { this.closeNow(); }
}

// tests (?test): drive scenes from Playwright while the engine waits for this browser's roll
if (TEST) {
  (window as unknown as { __scenes: unknown }).__scenes = {
    get cur() { return active?.cur ? active.cur.constructor.name : null; },
    get open() { return !!active?.cur; },
    event: (ev: GameEvent) => active!.event(ev, active!.host.st),
    ask: (p: number, a: Ask) => active!.ask(p, a),
    watch: (p: number, a: Ask) => active!.watch(p, a),
    close: () => closeScenes(),
    fast: (on: boolean) => { setFast(on); return isFast(); },
  };
}
