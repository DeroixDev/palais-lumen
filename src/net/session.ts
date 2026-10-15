// The group: one host and up to three friends sharing one account.
//
// Host: opens a door under a short code, accepts friends, applies their Ops through its own
// GameState (so tasks, stamps, perks and items work exactly as for its own rounds), and sends
// everybody the save a few times a second, with the last Op it applied for each friend.
//
// Friend: gets the host's save on joining and plays on it. Its games run as usual; every change
// to money and progress is applied locally right away (so nothing waits on the network) and sent
// to the host as an Op. Each state from the host replaces the local save; Ops the host hasn't
// applied yet are played on top again. The friend's own save in its browser is never touched.
//
// Not in a group (`role` 'off'), nothing here runs: single player is unchanged.

import { CHARMS, PLAYER_COLORS, WARDROBE } from '../core/items';
import { catchLamp } from '../core/album';
import { acceptQuest } from '../core/quests';
import { GameState, type EveningResult, type PlayerProfile, type RoundReport, type SaveData } from '../core/state';
import { actor, asActor } from './actor';
import { PeerTransport, customBroker, currentBroker, brokerText } from './peer';
import { MAX_PLAYERS, PROTOCOL, isEmote, type Op, type Pose, type TeamLine, type ToGuest, type ToHost } from './protocol';
import { NetError, type HostEndpoint, type Link, type Transport } from './transport';

export type Role = 'off' | 'host' | 'guest';

/** What the game does when something happens in the group (set once by main.ts). */
export interface NetHooks {
  /** Someone joined, left or changed name, colour or look. */
  roster(): void;
  joined(id: string): void;
  left(id: string): void;
  pose(id: string, p: Pose): void;
  emote(id: string, e: string): void;
  /** Another player had a big win. */
  feed(id: string, game: string, win: number, mult: number): void;
  toast(text: string, cls?: string): void;
  /** Friend: the host ends the day; resolve once out of the game. */
  dayEnd(n: number): Promise<void>;
  recap(result: EveningResult, team: TeamLine[]): void;
  /** Friend: the group is over (the host closed it, or the connection is gone). */
  closed(why: 'host' | 'lost'): void;
  /** Friend: the host refused a stake (the shared account was emptier than this screen knew). */
  denied(): void;
  /** Friend: a state from the host was applied (`prev` is the save before). */
  synced(prev: SaveData): void;
  /** Host: a friend's game finished the day (boss duel, last machine). */
  endDayAsked(id: string): void;
}

export interface RosterEntry {
  id: string;
  name: string;
  color: number;
  profile: PlayerProfile;
  self: boolean;
  host: boolean;
}

/** One friend at the host's table. */
interface Seat {
  id: string | null;
  link: Link;
  /** Last Op applied. */
  seq: number;
  /** The last stake was refused: the rest of that round doesn't count. */
  void: boolean;
  /** The friend's running stake (for the 10×/50× counters of GameState.payout). */
  stake: number;
  /** Day the friend is ready to settle. */
  ready: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 5;
const ID_KEY = 'nachtfalter.mp.id';
const SNAP_MS = 90;

const chips = (n: number) => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n)));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function randomCode() {
  let s = '';
  const r = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(r);
  for (const v of r) s += CODE_CHARS[v % CODE_CHARS.length];
  return s;
}

/** A typed or pasted code, cleaned: letters only, upper case (a pasted join link works too). */
export function cleanCode(text: string) {
  const m = /[?&]join=([A-Za-z]+)/.exec(text);
  return (m ? m[1] : text)
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, CODE_LEN);
}

export const validCode = (code: string) => code.length === CODE_LEN && [...code].every((c) => CODE_CHARS.includes(c));

/** This browser's player id in groups (kept, so a friend finds their seat and look again). */
function guestId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id || !/^g[a-z0-9]{6,12}$/.test(id)) {
      id = 'g' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return 'g' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  }
}

/** The link friends open: this page with ?join=CODE (and the broker, if it isn't the public one). */
export function joinLink(code: string) {
  const u = new URL(location.href);
  // Invites always open the casino page, even if this page was reached some other way.
  if (!/casino\.html$/.test(u.pathname)) u.pathname = u.pathname.replace(/[^/]*$/, 'casino.html');
  u.search = '';
  u.hash = '';
  u.searchParams.set('join', code);
  if (customBroker()) u.searchParams.set('peer', brokerText(currentBroker()));
  return u.toString();
}

class Net {
  role: Role = 'off';
  code = '';
  hooks: Partial<NetHooks> = {};
  private state!: GameState;
  private transportFactory: () => Transport = () => new PeerTransport();
  /** Ids at the table right now (host included). */
  private onlineIds = new Set<string>();
  private poses: Record<string, Pose> = {};

  // Host
  private endpoint: HostEndpoint | null = null;
  private seats: Seat[] = [];
  private snapTimer = 0;
  private lastSnap = '';
  private hostHooked = false;

  // Friend
  private link: Link | null = null;
  private seq = 0;
  private pending: { s: number; op: Op }[] = [];
  private hostState: SaveData | null = null;
  private overrides: Record<string, number> = {};
  private base = { album: {} as Record<string, number>, quests: new Set<string>(), profile: '' };
  private applying = false;
  private leaving = false;
  private guestHooked = false;

  get on() {
    return this.role !== 'off';
  }
  get isHost() {
    return this.role === 'host';
  }
  get isGuest() {
    return this.role === 'guest';
  }
  /** True once this page has played in someone else's group. Its state holds the host's data
   *  from then on (until the reload back to the title), so it must never be saved here. */
  wasGuest = false;

  /** For tests: another transport (e.g. an in-page one). */
  useTransport(f: () => Transport) {
    this.transportFactory = f;
  }

  online(): string[] {
    return [...this.onlineIds];
  }

  /** Everybody at the table, the host first. */
  roster(): RosterEntry[] {
    if (!this.on) return [];
    const players = this.state.data.players;
    return [...this.onlineIds]
      .sort((a, b) => (a === 'host' ? -1 : b === 'host' ? 1 : 0))
      .map((id) => {
        const p = players[id] ?? { name: id === 'host' ? 'Gastgeber' : 'Gast', color: PLAYER_COLORS[0] };
        return { id, name: p.name, color: p.color, profile: p, self: id === this.state.selfId, host: id === 'host' };
      });
  }

  nameOf(id: string) {
    return this.state?.data.players[id]?.name ?? (id === 'host' ? 'Gastgeber' : 'Gast');
  }

  // ---- Host ---------------------------------------------------------------------------------

  /** Opens a group under a fresh code. */
  async openGroup(state: GameState): Promise<string> {
    if (this.on) return this.code;
    this.state = state;
    const t = this.transportFactory();
    let lastErr: unknown = null;
    for (let i = 0; i < 4; i++) {
      const code = randomCode();
      try {
        this.endpoint = await t.host(code);
        this.code = code;
        break;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof NetError && e.kind === 'taken')) throw e;
      }
    }
    if (!this.endpoint) throw lastErr ?? new NetError('network');
    this.role = 'host';
    this.onlineIds = new Set([state.selfId]);
    this.endpoint.onLink((link) => this.seat(link));
    this.hookHost();
    actor.toast = (id, text, cls) => this.seats.find((s) => s.id === id)?.link.send({ t: 'toast', text, cls } satisfies ToGuest);
    this.hooks.roster?.();
    return this.code;
  }

  /** Closes the group: friends get a calm note and go back to their start screen. */
  closeGroup() {
    if (this.role !== 'host') return;
    for (const s of this.seats) {
      s.link.send({ t: 'close', reason: 'host' } satisfies ToGuest);
      setTimeout(() => s.link.close(), 400);
    }
    this.seats = [];
    this.endpoint?.close();
    this.endpoint = null;
    this.role = 'off';
    this.code = '';
    this.onlineIds.clear();
    this.poses = {};
    actor.toast = null;
    clearTimeout(this.snapTimer);
    this.snapTimer = 0;
    this.hooks.roster?.();
  }

  private hookHost() {
    if (this.hostHooked) return;
    this.hostHooked = true;
    const st = this.state;
    st.onChange(() => this.isHost && this.scheduleSnap());
    // Each player's share of the day, for the recap. Kept in the save's counters, so a reload keeps it.
    st.onRound((r) => {
      if (!this.isHost) return;
      const id = actor.id ?? st.selfId;
      const c = st.data.counters;
      c[`mp:n:${id}`] = (c[`mp:n:${id}`] ?? 0) + 1;
      c[`mp:w:${id}`] = (c[`mp:w:${id}`] ?? 0) + Math.round(r.win - r.stake);
    }, 'data');
    // The host's own big wins are told to the others (friends' wins are told in applyOp).
    st.onRound((r) => this.isHost && this.bigWin(st.selfId, r), 'view');
    st.onDayStart((d) => {
      for (const k of Object.keys(d.counters)) if (k.startsWith('mp:')) delete d.counters[k];
    });
  }

  private seat(link: Link) {
    const s: Seat = { id: null, link, seq: 0, void: false, stake: 0, ready: 0 };
    this.seats.push(s);
    link.onMessage((m) => this.fromGuest(s, m as ToHost));
    link.onClose(() => this.unseat(s));
    // A connection that never says hello is dropped.
    setTimeout(() => !s.id && link.close(), 25000);
  }

  private unseat(s: Seat) {
    if (!this.seats.includes(s)) return;
    this.seats = this.seats.filter((x) => x !== s);
    if (!s.id || this.seats.some((x) => x.id === s.id)) return;
    this.onlineIds.delete(s.id);
    delete this.poses[s.id];
    this.broadcast({ t: 'online', ids: this.online() });
    this.hooks.left?.(s.id);
    this.hooks.roster?.();
  }

  private broadcast(m: ToGuest, except: string | null = null) {
    for (const s of this.seats) if (s.id && s.id !== except) s.link.send(m);
  }

  private fromGuest(s: Seat, m: ToHost) {
    if (!m || typeof m !== 'object' || this.role !== 'host') return;
    if (m.t === 'hello') return this.hello(s, m);
    const id = s.id;
    if (!id) return;
    switch (m.t) {
      case 'op':
        if (typeof m.s === 'number' && m.op && typeof m.op === 'object') this.applyOp(s, m.s, m.op);
        break;
      case 'pose':
        if (!validPose(m.p)) return;
        this.poses[id] = m.p;
        this.broadcast({ t: 'pose', id, p: m.p }, id);
        this.hooks.pose?.(id, m.p);
        break;
      case 'emote':
        if (!isEmote(m.e)) return;
        this.broadcast({ t: 'emote', id, e: m.e }, id);
        this.hooks.emote?.(id, m.e);
        break;
      case 'ready':
        s.ready = m.n;
        break;
      case 'bye':
        s.link.close();
        break;
    }
  }

  private hello(s: Seat, m: Extract<ToHost, { t: 'hello' }>) {
    if (s.id) return;
    if (m.v !== PROTOCOL) {
      s.link.send({ t: 'reject', reason: 'version' } satisfies ToGuest);
      setTimeout(() => s.link.close(), 300);
      return;
    }
    const id = typeof m.id === 'string' && /^g[a-z0-9]{6,12}$/.test(m.id) ? m.id : 'g' + Math.random().toString(36).slice(2, 10);
    // The same friend again (a reload, a second tab): the old seat makes room.
    for (const old of this.seats.filter((x) => x.id === id)) {
      old.id = null;
      old.link.close();
    }
    if (this.onlineIds.size >= MAX_PLAYERS) {
      s.link.send({ t: 'reject', reason: 'full' } satisfies ToGuest);
      setTimeout(() => s.link.close(), 300);
      return;
    }
    const players = this.state.data.players;
    // A friend's look lives in the host's save; the first visit brings it along.
    players[id] = this.cleanProfile(players[id] ?? m.profile, id);
    s.id = id;
    this.onlineIds.add(id);
    this.state.emit();
    s.link.send({ t: 'welcome', you: id, data: this.state.data, online: this.online(), poses: this.poses } satisfies ToGuest);
    this.broadcast({ t: 'online', ids: this.online() }, id);
    this.hooks.joined?.(id);
    this.hooks.roster?.();
  }

  /** Name (14 letters), a colour nobody else at the table wears, skin and look. */
  private cleanProfile(p: Partial<PlayerProfile> | undefined, id: string): PlayerProfile {
    const name = String(p?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Gast';
    const taken = [...this.onlineIds].filter((x) => x !== id).map((x) => this.state.data.players[x]?.color);
    let color = typeof p?.color === 'number' && PLAYER_COLORS.includes(p.color) ? p.color : PLAYER_COLORS[1];
    if (taken.includes(color)) color = PLAYER_COLORS.find((c) => !taken.includes(c)) ?? color;
    const out: PlayerProfile = { name, color };
    if (typeof p?.skin === 'number') out.skin = p.skin;
    if (p?.look && typeof p.look === 'object') out.look = { ...p.look };
    return out;
  }

  private applyOp(s: Seat, seq: number, op: Op) {
    const st = this.state;
    const id = s.id!;
    const raw = st as unknown as { roundStake: number };
    asActor(id, () => {
      switch (op.k) {
        case 'bet': {
          const keep = raw.roundStake;
          raw.roundStake = s.stake;
          const ok = GameState.prototype.placeBet.call(st, chips(op.a));
          s.stake = raw.roundStake;
          raw.roundStake = keep;
          s.void = !ok;
          if (!ok) s.link.send({ t: 'deny', s: seq } satisfies ToGuest);
          break;
        }
        case 'pay': {
          if (s.void) break;
          const keep = raw.roundStake;
          raw.roundStake = s.stake;
          GameState.prototype.payout.call(st, chips(op.a));
          s.stake = raw.roundStake;
          raw.roundStake = keep;
          break;
        }
        case 'report': {
          if (s.void) {
            s.void = false;
            break;
          }
          const r = cleanReport(op.r);
          if (!r) break;
          const room = st.data.roomId;
          st.data.roomId = typeof op.room === 'string' ? op.room : room;
          st.roundScope = 'data';
          try {
            st.report(r);
          } finally {
            st.roundScope = 'all';
            st.data.roomId = room;
          }
          this.bigWin(id, r);
          break;
        }
        case 'ctr':
          if (typeof op.key === 'string' && !/^(dbg|mp):/.test(op.key) && Number.isFinite(op.by) && Math.abs(op.by) <= 1000) GameState.prototype.count.call(st, op.key, op.by);
          break;
        case 'wish':
          if (st.data.balance >= 11) {
            st.data.balance -= 1;
            st.data.evening.startBalance -= 1;
            st.emit();
          }
          break;
        case 'buyItem':
          st.buyItem(String(op.id));
          break;
        case 'buyCharm':
          st.buyCharm(String(op.id) as never);
          break;
        case 'profile':
          st.data.players[id] = this.cleanProfile(op.p, id);
          st.emit();
          this.hooks.roster?.();
          break;
        case 'lamp':
          for (let i = 0; i < Math.min(5, Math.max(0, Math.floor(op.n))); i++) catchLamp(st, String(op.id));
          break;
        case 'quest':
          acceptQuest(st, String(op.id));
          break;
        case 'endDay':
          this.hooks.endDayAsked?.(id);
          break;
      }
    });
    s.seq = seq;
    this.scheduleSnap();
  }

  /** Big wins (10× and more) are told to everybody else at the table. */
  private bigWin(id: string, r: RoundReport) {
    if (!(r.stake > 0) || r.win < r.stake * 10) return;
    const mult = r.win / r.stake;
    const m: ToGuest = { t: 'feed', id, game: r.game, win: r.win, mult };
    this.broadcast(m, id);
    if (id !== this.state.selfId) this.hooks.feed?.(id, r.game, r.win, mult);
  }

  private scheduleSnap() {
    if (this.role !== 'host' || this.snapTimer || !this.seats.some((s) => s.id)) return;
    this.snapTimer = window.setTimeout(() => {
      this.snapTimer = 0;
      this.flush();
    }, SNAP_MS);
  }

  /** Sends the save to every friend now (skipped when nothing changed). */
  flush(force = false) {
    if (this.role !== 'host') return;
    clearTimeout(this.snapTimer);
    this.snapTimer = 0;
    const ack: Record<string, number> = {};
    for (const s of this.seats) if (s.id) ack[s.id] = s.seq;
    const key = JSON.stringify(this.state.data) + JSON.stringify(ack);
    if (!force && key === this.lastSnap) return;
    this.lastSnap = key;
    this.broadcast({ t: 'state', data: this.state.data, ack });
  }

  /** Host: asks every friend to finish their round; resolves when all are out of their games (or after a while). */
  async prepareDayEnd(n: number) {
    if (this.role !== 'host') return;
    const live = () => this.seats.filter((s) => s.id);
    if (!live().length) return;
    for (const s of live()) s.link.send({ t: 'dayEnd', n } satisfies ToGuest);
    const t0 = performance.now();
    await new Promise<void>((res) => {
      const check = () => (live().every((s) => s.ready === n) || performance.now() - t0 > 9000 ? res() : setTimeout(check, 100));
      check();
    });
  }

  /** Host: the day is settled; everybody sees the recap. */
  sendRecap(result: EveningResult, team: TeamLine[]) {
    if (this.role !== 'host') return;
    this.flush(true);
    this.broadcast({ t: 'recap', result, team });
  }

  /** Each player's share of today (call before the day is settled). */
  team(): TeamLine[] {
    if (!this.on) return [];
    const d = this.state.data;
    const ids = new Set(this.online());
    for (const k of Object.keys(d.counters)) if (k.startsWith('mp:n:')) ids.add(k.slice(5));
    return [...ids]
      .filter((id) => d.players[id])
      .map((id) => ({ id, name: d.players[id].name, color: d.players[id].color, rounds: d.counters[`mp:n:${id}`] ?? 0, net: d.counters[`mp:w:${id}`] ?? 0 }))
      .sort((a, b) => b.net - a.net || b.rounds - a.rounds);
  }

  // ---- Both ---------------------------------------------------------------------------------

  sendPose(p: Pose) {
    if (this.isHost) {
      this.poses[this.state.selfId] = p;
      this.broadcast({ t: 'pose', id: this.state.selfId, p });
    } else if (this.isGuest) this.link?.send({ t: 'pose', p } satisfies ToHost);
  }

  sendEmote(e: string) {
    if (!isEmote(e)) return;
    if (this.isHost) this.broadcast({ t: 'emote', id: this.state.selfId, e });
    else if (this.isGuest) this.link?.send({ t: 'emote', e } satisfies ToHost);
  }

  /** Last known pose of a player (for figures in a room just entered). */
  poseOf(id: string): Pose | undefined {
    return this.poses[id];
  }

  // ---- Friend -------------------------------------------------------------------------------

  /** Joins the group with that code; on success the state holds the host's save. */
  async join(state: GameState, code: string, profile: PlayerProfile): Promise<void> {
    if (this.on) return;
    this.state = state;
    const link = await this.transportFactory().join(code);
    await new Promise<void>((resolve, reject) => {
      let welcomed = false;
      const timer = setTimeout(() => {
        link.close();
        reject(new NetError('timeout'));
      }, 20000);
      link.onMessage((raw) => {
        const m = raw as ToGuest;
        if (!m || typeof m !== 'object') return;
        if (!welcomed) {
          if (m.t === 'reject') {
            clearTimeout(timer);
            link.close();
            reject(new NetError(m.reason));
          } else if (m.t === 'welcome') {
            welcomed = true;
            clearTimeout(timer);
            this.welcome(link, code, m);
            resolve();
          }
          return;
        }
        this.fromHost(m);
      });
      link.onClose(() => {
        if (!welcomed) {
          clearTimeout(timer);
          reject(new NetError('closed'));
        } else if (this.isGuest && !this.leaving) {
          this.role = 'off';
          this.hooks.closed?.('lost');
        }
      });
      link.send({ t: 'hello', v: PROTOCOL, id: guestId(), profile } satisfies ToHost);
    });
  }

  /** Friend: leaves the group (the host keeps playing). */
  leave() {
    if (!this.isGuest) return;
    this.leaving = true;
    this.link?.send({ t: 'bye' } satisfies ToHost);
    const l = this.link;
    setTimeout(() => l?.close(), 200);
    this.role = 'off';
  }

  private welcome(link: Link, code: string, m: Extract<ToGuest, { t: 'welcome' }>) {
    const st = this.state;
    this.link = link;
    this.code = code;
    this.role = 'guest';
    this.wasGuest = true;
    this.onlineIds = new Set(m.online);
    this.poses = { ...m.poses };
    st.selfId = m.you;
    this.hookGuest();
    this.hostState = clone(m.data);
    const data = m.data;
    data.roomId = 'foyer';
    data.position = { x: -1, y: -1 };
    data.settings = { ...data.settings, ...st.data.settings };
    this.applying = true;
    try {
      st.replace(data);
    } finally {
      this.applying = false;
    }
    this.resetBase();
  }

  private fromHost(m: ToGuest) {
    switch (m.t) {
      case 'state':
        if (m.data && typeof m.data === 'object') this.applyState(m.data, m.ack?.[this.state.selfId] ?? 0);
        break;
      case 'online': {
        const before = this.onlineIds;
        this.onlineIds = new Set(m.ids);
        for (const id of m.ids) if (!before.has(id)) this.hooks.joined?.(id);
        for (const id of before) if (!this.onlineIds.has(id)) {
          delete this.poses[id];
          this.hooks.left?.(id);
        }
        this.hooks.roster?.();
        break;
      }
      case 'pose':
        if (validPose(m.p)) {
          this.poses[m.id] = m.p;
          this.hooks.pose?.(m.id, m.p);
        }
        break;
      case 'emote':
        if (isEmote(m.e)) this.hooks.emote?.(m.id, m.e);
        break;
      case 'toast':
        if (typeof m.text === 'string') this.hooks.toast?.(m.text.slice(0, 300), m.cls);
        break;
      case 'feed':
        if (m.id !== this.state.selfId) this.hooks.feed?.(m.id, m.game, m.win, m.mult);
        break;
      case 'deny':
        this.hooks.denied?.();
        break;
      case 'dayEnd': {
        const n = m.n;
        void (this.hooks.dayEnd?.(n) ?? Promise.resolve()).then(() => this.link?.send({ t: 'ready', n } satisfies ToHost));
        break;
      }
      case 'recap':
        this.hooks.recap?.(m.result, Array.isArray(m.team) ? m.team : []);
        break;
      case 'close':
        this.leaving = true;
        this.role = 'off';
        this.link?.close();
        this.hooks.closed?.('host');
        break;
    }
  }

  private push(op: Op) {
    const s = ++this.seq;
    this.pending.push({ s, op });
    this.link?.send({ t: 'op', s, op } satisfies ToHost);
  }

  /** Friend: a machine or the boss duel ended the day; the host settles it for everybody. */
  askEndDay() {
    if (this.isGuest) this.push({ k: 'endDay' });
  }

  /** Friend: the wishing fountain (one Lumen that doesn't count against the goal). */
  wish() {
    if (!this.isGuest) return;
    const d = this.state.data;
    d.balance -= 1;
    d.evening.startBalance -= 1;
    this.push({ k: 'wish' });
    this.state.emit();
  }

  /**
   * A friend's game sends its money and progress to the host. The original methods still run
   * here at once (the screen never waits); the host's state replaces them a moment later.
   */
  private hookGuest() {
    if (this.guestHooked) return;
    this.guestHooked = true;
    const st = this.state;
    const raw = {
      placeBet: st.placeBet.bind(st),
      payout: st.payout.bind(st),
      report: st.report.bind(st),
      count: st.count.bind(st),
      buyItem: st.buyItem.bind(st),
      buyCharm: st.buyCharm.bind(st),
    };
    st.placeBet = (amount: number) => {
      const ok = raw.placeBet(amount);
      if (ok && this.isGuest) this.push({ k: 'bet', a: chips(amount) });
      return ok;
    };
    st.payout = (amount: number) => {
      raw.payout(amount);
      if (chips(amount) > 0 && this.isGuest) this.push({ k: 'pay', a: chips(amount) });
    };
    st.report = (r: RoundReport) => {
      if (!this.isGuest) return raw.report(r);
      // Only what shows the round here; tasks, stamps, perks and items run at the host.
      st.roundScope = 'view';
      try {
        raw.report(r);
      } finally {
        st.roundScope = 'all';
      }
      this.push({ k: 'report', r: clone(r), room: st.data.roomId });
    };
    st.count = (key: string, by = 1) => {
      raw.count(key, by);
      if (this.isGuest) this.push({ k: 'ctr', key, by });
    };
    st.buyItem = (id: string) => {
      const ok = raw.buyItem(id);
      if (ok && this.isGuest) this.push({ k: 'buyItem', id });
      return ok;
    };
    st.buyCharm = ((id: Parameters<GameState['buyCharm']>[0]) => {
      const ok = raw.buyCharm(id);
      if (ok && this.isGuest) this.push({ k: 'buyCharm', id });
      return ok;
    }) as GameState['buyCharm'];
    st.onChange(() => this.isGuest && !this.applying && this.diff());
  }

  /** Changes made straight in the save (a lamp caught, a task accepted, a new look) become Ops. */
  private diff() {
    const d = this.state.data;
    const b = this.base;
    for (const [id, n] of Object.entries(d.album ?? {})) {
      const was = b.album[id] ?? 0;
      if (n > was) {
        b.album[id] = n;
        this.push({ k: 'lamp', id, n: n - was });
      }
    }
    for (const q of d.quests)
      if (q.accepted && !b.quests.has(q.id)) {
        b.quests.add(q.id);
        this.push({ k: 'quest', id: q.id });
      }
    const me = d.players[this.state.selfId];
    const p = JSON.stringify(me ?? null);
    if (me && p !== b.profile) {
      b.profile = p;
      this.push({ k: 'profile', p: clone(me) });
    }
  }

  private resetBase() {
    const d = this.state.data;
    this.base = { album: { ...(d.album ?? {}) }, quests: new Set(d.quests.filter((q) => q.accepted).map((q) => q.id)), profile: JSON.stringify(d.players[this.state.selfId] ?? null) };
  }

  /** A state from the host: it replaces the save; Ops not applied there yet go on top again. */
  private applyState(data: SaveData, ack: number) {
    const st = this.state;
    const prev = st.data;
    this.keepOverrides(prev);
    this.pending = this.pending.filter((p) => p.s > ack);
    this.hostState = clone(data);
    // Where this player stands and their device settings are their own.
    data.roomId = prev.roomId;
    data.position = prev.position;
    data.settings = prev.settings;
    data.storySeen = [...new Set([...(data.storySeen ?? []), ...(prev.storySeen ?? [])])];
    for (const p of this.pending) replay(data, p.op, st.selfId);
    if (data.evening.number !== prev.evening.number || data.season.number !== prev.season.number) this.overrides = {};
    for (const [k, v] of Object.entries(this.overrides)) data.counters[k] = v;
    st.data = data;
    this.resetBase();
    this.applying = true;
    try {
      st.emit();
    } finally {
      this.applying = false;
    }
    this.hooks.synced?.(prev);
  }

  /**
   * Counters this game wrote itself (flags of its own screens: an intro seen, a hint shown) stay
   * with it until the day changes; everything else comes from the host.
   */
  private keepOverrides(prev: SaveData) {
    const h = this.hostState;
    if (!h) return;
    const expect: Record<string, number> = { ...h.counters, ...this.overrides };
    for (const p of this.pending) if (p.op.k === 'ctr') expect[p.op.key] = (expect[p.op.key] ?? 0) + p.op.by;
    for (const [k, v] of Object.entries(prev.counters)) {
      if (typeof v !== 'number' || /^(dbg|mp):/.test(k) || k === 'mothsCaught') continue;
      if (v !== expect[k]) this.overrides[k] = v;
    }
  }
}

/** Plays a friend's not yet applied Op on a fresh state from the host. */
function replay(d: SaveData, op: Op, self: string) {
  switch (op.k) {
    case 'bet':
      d.balance = Math.max(0, d.balance - op.a);
      d.stats.wagered += op.a;
      d.stats.rounds++;
      break;
    case 'pay':
      d.balance += op.a;
      d.stats.won += op.a;
      d.stats.biggestWin = Math.max(d.stats.biggestWin, op.a);
      break;
    case 'ctr':
      d.counters[op.key] = (d.counters[op.key] ?? 0) + op.by;
      break;
    case 'wish':
      d.balance -= 1;
      d.evening.startBalance -= 1;
      break;
    case 'buyItem': {
      const o = WARDROBE.find((w) => w.id === op.id);
      if (o && !d.owned.includes(o.id) && d.moonstones >= o.price) {
        d.moonstones -= o.price;
        d.owned.push(o.id);
      }
      break;
    }
    case 'buyCharm': {
      const c = CHARMS.find((x) => x.id === op.id);
      if (c && !d.charms.includes(c.id) && d.moonstones >= c.price) {
        d.moonstones -= c.price;
        d.charms.push(c.id);
      }
      break;
    }
    case 'profile':
      d.players[self] = op.p;
      break;
    case 'lamp':
      d.album[op.id] = (d.album[op.id] ?? 0) + op.n;
      break;
    case 'quest': {
      const q = d.quests.find((x) => x.id === op.id);
      if (q) q.accepted = true;
      break;
    }
  }
}

function validPose(p: unknown): p is Pose {
  const q = p as Pose;
  return !!q && typeof q.r === 'string' && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.a) && (q.at === null || typeof q.at === 'string');
}

function cleanReport(r: unknown): RoundReport | null {
  const x = r as RoundReport;
  if (!x || typeof x.game !== 'string' || !Number.isFinite(x.stake) || !Number.isFinite(x.win) || !Number.isFinite(x.rtp)) return null;
  return { game: x.game, stake: Math.max(0, x.stake), win: Math.max(0, x.win), rtp: x.rtp, tags: Array.isArray(x.tags) ? x.tags.filter((t) => typeof t === 'string').slice(0, 20) : [] };
}

/** The group of this page (one per tab). */
export const net = new Net();
