// Online play for Unser Uno Spiel. Same idea as the casino group: the host's browser is the
// server. It runs the Table; friends only send what they want to do and get back a View with
// their own hand and the counts of everybody else's (so no browser ever has someone else's cards).
//
// Transport: PeerJS via ../net/peer.ts (own id prefix, so codes never clash with the casino),
// or with ?net=local a BroadcastChannel between tabs of one browser (tests, two windows).

import { PeerTransport } from '../net/peer';
import { NetError, type HostEndpoint, type Link, type Transport } from '../net/transport';
import { COLORS, type Action, type Color, type Rules } from './engine';
import { BOT_NAMES, PLAYER_COLORS, type Profile } from './profile';
import { Table, type TableView } from './table';

export const UNO_PROTOCOL = 1;
export const MAX_SEATS = 4;
const PEER_PREFIX = 'unser-uno-';

export interface LobbySeat {
  id: string;
  name: string;
  color: number;
  kind: 'host' | 'friend' | 'bot';
  online: boolean;
}

export interface LobbyInfo {
  code: string;
  seats: LobbySeat[];
  rules: Rules;
  you: number;
  started: boolean;
}

type ToHost =
  | { t: 'hello'; v: number; id: string; name: string; color: number }
  | { t: 'act'; a: Action }
  | { t: 'bye' };

type ToGuest =
  | { t: 'lobby'; l: LobbyInfo }
  | { t: 'reject'; reason: 'full' | 'version' | 'running' }
  | { t: 'view'; v: TableView }
  | { t: 'close'; kick?: boolean };

// ---------------- codes ----------------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LEN = 5;

export function randomCode() {
  const r = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(r);
  return [...r].map((v) => CODE_CHARS[v % CODE_CHARS.length]).join('');
}

export function cleanCode(text: string) {
  const m = /[?&]join=([A-Za-z]+)/.exec(text);
  return (m ? m[1] : text).toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LEN);
}
export const validCode = (c: string) => c.length === CODE_LEN && [...c].every((x) => CODE_CHARS.includes(x));

export function inviteLink(code: string) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('join', code);
  const q = new URLSearchParams(location.search);
  for (const k of ['net', 'peer', 'ice']) { const v = q.get(k); if (v) u.searchParams.set(k, v); }
  return u.toString();
}

/** The game in that room has already started (and this browser had no seat in it). */
export class RunningError extends Error {}

export function netText(e: unknown): string {
  if (e instanceof RunningError) return 'An diesem Tisch läuft schon ein Spiel. Wartet bis zur nächsten Partie.';
  const kind = e instanceof NetError ? e.kind : 'network';
  switch (kind) {
    case 'unsupported': return 'Hier geht Online-Spielen leider nicht: Diese Umgebung erlaubt keine direkten Verbindungen.';
    case 'notFound': return 'Unter diesem Code ist gerade kein Raum offen. Stimmt der Code?';
    case 'timeout': return 'Die Verbindung kam nicht zustande. Versucht es gleich noch einmal.';
    case 'full': return 'Der Tisch ist schon voll: Mehr als vier gehen nicht.';
    case 'version': return 'Ihr habt verschiedene Versionen geladen. Ladet beide die Seite neu.';
    case 'closed': return 'Der Gastgeber hat den Raum geschlossen.';
    default: return 'Der Vermittlungsdienst ist gerade nicht erreichbar. Prüf die Internetverbindung.';
  }
}

// ---------------- local transport (tabs of one browser) ----------------

type BcMsg =
  | { k: 'ping'; from: string }
  | { k: 'pong'; to: string }
  | { k: 'conn'; from: string }
  | { k: 'ok'; to: string; from: string }
  | { k: 'msg'; from: string; to: string; d: unknown }
  | { k: 'end'; from: string; to: string };

class BcLink implements Link {
  private msgFns: ((m: unknown) => void)[] = [];
  private closeFns: (() => void)[] = [];
  closed = false;
  constructor(private ch: BroadcastChannel, private me: string, private peer: string) {}
  deliver(d: unknown) { for (const f of this.msgFns) f(d); }
  end() {
    if (this.closed) return;
    this.closed = true;
    for (const f of this.closeFns) f();
  }
  send(msg: unknown) {
    if (!this.closed) this.ch.postMessage({ k: 'msg', from: this.me, to: this.peer, d: JSON.parse(JSON.stringify(msg)) } satisfies BcMsg);
  }
  close() {
    if (this.closed) return;
    this.ch.postMessage({ k: 'end', from: this.me, to: this.peer } satisfies BcMsg);
    this.end();
  }
  onMessage(fn: (m: unknown) => void) { this.msgFns.push(fn); }
  onClose(fn: () => void) { this.closeFns.push(fn); }
}

const rid = () => Math.random().toString(36).slice(2, 10);

export class LocalTransport implements Transport {
  async host(code: string): Promise<HostEndpoint> {
    const ch = new BroadcastChannel('unser-uno-' + code);
    const me = 'host-' + rid();
    // is the code taken? ask, and wait a moment for an answer
    const taken = await new Promise<boolean>((res) => {
      const t = setTimeout(() => { ch.removeEventListener('message', on); res(false); }, 250);
      const on = (e: MessageEvent<BcMsg>) => { if (e.data.k === 'pong' && e.data.to === me) { clearTimeout(t); res(true); } };
      ch.addEventListener('message', on);
      ch.postMessage({ k: 'ping', from: me } satisfies BcMsg);
    });
    if (taken) { ch.close(); throw new NetError('taken'); }
    const links = new Map<string, BcLink>();
    const fns: ((l: Link) => void)[] = [];
    ch.onmessage = (e: MessageEvent<BcMsg>) => {
      const m = e.data;
      if (m.k === 'ping') ch.postMessage({ k: 'pong', to: m.from } satisfies BcMsg);
      else if (m.k === 'conn') {
        const l = new BcLink(ch, me, m.from);
        links.set(m.from, l);
        ch.postMessage({ k: 'ok', to: m.from, from: me } satisfies BcMsg);
        for (const f of fns) f(l);
      } else if (m.k === 'msg' && m.to === me) links.get(m.from)?.deliver(m.d);
      else if (m.k === 'end' && m.to === me) { links.get(m.from)?.end(); links.delete(m.from); }
    };
    addEventListener('pagehide', () => { for (const l of links.values()) l.close(); });
    return {
      code,
      onLink: (fn) => fns.push(fn),
      close: () => { for (const l of links.values()) l.close(); setTimeout(() => ch.close(), 50); },
    };
  }

  join(code: string): Promise<Link> {
    const ch = new BroadcastChannel('unser-uno-' + code);
    const me = 'g-' + rid();
    return new Promise((resolve, reject) => {
      let link: BcLink | null = null;
      const t = setTimeout(() => { ch.close(); reject(new NetError('notFound')); }, 2500);
      ch.onmessage = (e: MessageEvent<BcMsg>) => {
        const m = e.data;
        if (m.k === 'ok' && m.to === me && !link) {
          clearTimeout(t);
          link = new BcLink(ch, me, m.from);
          resolve(link);
        } else if (m.k === 'msg' && m.to === me && link) {
          link.deliver(m.d);
        } else if (m.k === 'end' && m.to === me && link) link.end();
      };
      // the host learns our id from 'conn', we learn its id from 'ok'
      ch.postMessage({ k: 'conn', from: me } satisfies BcMsg);
      addEventListener('pagehide', () => link?.close());
    });
  }
}

export function makeTransport(): Transport {
  try {
    if (new URLSearchParams(location.search).get('net') === 'local') return new LocalTransport();
  } catch { /* default */ }
  return new PeerTransport(undefined, PEER_PREFIX);
}

// ---------------- host ----------------

interface Conn { link: Link; id: string | null }

export class UnoHost {
  seats: LobbySeat[];
  table: Table | null = null;
  private conns = new Set<Conn>();
  /** Lobby changed (seat list, rules, someone left or came back). */
  onLobby: (() => void) | null = null;
  onNote: ((text: string) => void) | null = null;

  private constructor(private ep: HostEndpoint, me: Profile, public rules: Rules) {
    this.seats = [{ id: me.id, name: me.name, color: me.color, kind: 'host', online: true }];
    ep.onLink((link) => this.accept(link));
  }

  get code() { return this.ep.code; }

  static async open(transport: Transport, me: Profile, rules: Rules): Promise<UnoHost> {
    for (let i = 0; i < 4; i++) {
      try {
        return new UnoHost(await transport.host(randomCode()), me, rules);
      } catch (e) {
        if (!(e instanceof NetError && e.kind === 'taken')) throw e;
      }
    }
    throw new NetError('network');
  }

  info(you: number): LobbyInfo {
    return { code: this.code, seats: this.seats.map((s) => ({ ...s })), rules: { ...this.rules }, you, started: !!this.table };
  }

  private send(c: Conn, m: ToGuest) { c.link.send(m); }

  private broadcastLobby() {
    for (const c of this.conns) {
      const i = this.seats.findIndex((s) => s.id === c.id);
      if (i >= 0) this.send(c, { t: 'lobby', l: this.info(i) });
    }
    this.onLobby?.();
  }

  private accept(link: Link) {
    const c: Conn = { link, id: null };
    this.conns.add(c);
    link.onMessage((raw) => this.onMsg(c, raw));
    link.onClose(() => this.drop(c));
  }

  private onMsg(c: Conn, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const m = raw as ToHost;
    if (m.t === 'hello') {
      if (c.id) return;
      if (m.v !== UNO_PROTOCOL) { this.send(c, { t: 'reject', reason: 'version' }); return; }
      const id = String(m.id ?? '').slice(0, 40);
      if (!id) return;
      const name = String(m.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'Gast';
      const color = Math.max(0, Math.min(PLAYER_COLORS.length - 1, Math.floor(Number(m.color) || 0)));
      // the same browser again (reload, lost connection): it gets its seat back
      for (const o of this.conns) if (o !== c && o.id === id) { o.id = null; o.link.close(); }
      let i = this.seats.findIndex((s) => s.id === id && s.kind === 'friend');
      if (i < 0) {
        if (this.table) { this.send(c, { t: 'reject', reason: 'running' }); return; }
        if (this.seats.length >= MAX_SEATS) {
          // a bot gives up its chair for a person
          const b = this.seats.findIndex((s) => s.kind === 'bot');
          if (b < 0) { this.send(c, { t: 'reject', reason: 'full' }); return; }
          this.seats.splice(b, 1);
        }
        this.seats.push({ id, name, color, kind: 'friend', online: true });
        i = this.seats.length - 1;
        this.onNote?.(`${name} ist da.`);
      } else {
        this.seats[i].online = true;
        if (!this.table) { this.seats[i].name = name; this.seats[i].color = color; }
        this.onNote?.(`${this.seats[i].name} ist wieder da.`);
      }
      c.id = id;
      this.broadcastLobby();
      if (this.table) {
        const seat = i;
        this.table.setAway(seat, false);
        this.table.listen(seat, (v) => this.send(c, { t: 'view', v }));
      }
      return;
    }
    if (!c.id) return;
    if (m.t === 'act' && this.table) {
      const seat = this.seats.findIndex((s) => s.id === c.id);
      const a = sanitize(m.a);
      if (seat >= 0 && a) this.table.act(seat, a);
    } else if (m.t === 'bye') {
      c.link.close();
    }
  }

  private drop(c: Conn) {
    this.conns.delete(c);
    if (!c.id) return;
    const i = this.seats.findIndex((s) => s.id === c.id);
    if (i < 0) return;
    const name = this.seats[i].name;
    if (this.table) {
      // a bot keeps the seat warm until they come back
      this.seats[i].online = false;
      this.table.unlisten(i);
      this.table.setAway(i, true);
      this.onNote?.(`${name} ist weg. Ein Bot spielt weiter.`);
    } else {
      this.seats.splice(i, 1);
      this.onNote?.(`${name} ist gegangen.`);
    }
    this.broadcastLobby();
  }

  addBot() {
    if (this.table || this.seats.length >= MAX_SEATS) return;
    const used = new Set(this.seats.map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot';
    const colors = new Set(this.seats.map((s) => s.color));
    const color = PLAYER_COLORS.findIndex((_, i) => !colors.has(i));
    this.seats.push({ id: 'bot-' + rid(), name, color: Math.max(0, color), kind: 'bot', online: true });
    this.broadcastLobby();
  }

  removeSeat(i: number) {
    if (this.table || i <= 0 || !this.seats[i]) return;
    const s = this.seats[i];
    this.seats.splice(i, 1);
    if (s.kind === 'friend') for (const c of this.conns) if (c.id === s.id) { this.send(c, { t: 'close', kick: true }); c.id = null; c.link.close(); }
    this.broadcastLobby();
  }

  setRules(r: Rules) {
    if (this.table) return;
    this.rules = { ...r };
    this.broadcastLobby();
  }

  setMe(p: Profile) {
    if (this.table) return;
    Object.assign(this.seats[0], { name: p.name, color: p.color });
    this.broadcastLobby();
  }

  /** Starts the match; returns the table (the host's own UI listens to seat 0). */
  start(speed = 1): Table | null {
    if (this.table || this.seats.length < 2) return null;
    const t = new Table(this.seats.map((s) => ({ id: s.id, name: s.name, color: s.color, bot: s.kind === 'bot' })), this.rules, { speed, owner: 0 });
    this.table = t;
    this.seats.forEach((s, i) => { if (s.kind === 'friend' && !s.online) t.setAway(i, true); });
    for (const c of this.conns) {
      const i = this.seats.findIndex((s) => s.id === c.id);
      if (i > 0) t.listen(i, (v) => this.send(c, { t: 'view', v }));
    }
    this.broadcastLobby();
    return t;
  }

  /** Back to the lobby after a match (same people, bots stay). */
  backToLobby() {
    this.table?.destroy();
    this.table = null;
    this.seats = this.seats.filter((s) => s.kind !== 'friend' || s.online);
    this.broadcastLobby();
  }

  close() {
    for (const c of this.conns) { this.send(c, { t: 'close' }); }
    this.table?.destroy();
    setTimeout(() => { for (const c of this.conns) c.link.close(); this.ep.close(); }, 120);
  }
}

function sanitize(a: unknown): Action | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);
  switch (x.t) {
    case 'play': {
      const id = n(x.id);
      if (id === undefined) return null;
      const out: Action = { t: 'play', id };
      if (typeof x.color === 'string' && (COLORS as readonly string[]).includes(x.color)) out.color = x.color as Color;
      const tg = n(x.target);
      if (tg !== undefined) out.target = tg;
      return out;
    }
    case 'catch': {
      const tg = n(x.target);
      return tg === undefined ? null : { t: 'catch', target: tg };
    }
    case 'draw': case 'pass': case 'uno': case 'next':
      return { t: x.t };
    default:
      return null;
  }
}

// ---------------- guest ----------------

export class UnoGuest {
  lobby: LobbyInfo | null = null;
  onLobby: ((l: LobbyInfo) => void) | null = null;
  onView: ((v: TableView) => void) | null = null;
  onClosed: ((why: 'host' | 'lost' | 'kicked') => void) | null = null;
  private link: Link | null = null;
  private leaving = false;

  private constructor(private transport: Transport, readonly code: string, private me: Profile) {}

  static async join(transport: Transport, code: string, me: Profile): Promise<UnoGuest> {
    const g = new UnoGuest(transport, code, me);
    await g.connect();
    return g;
  }

  private connect(): Promise<void> {
    return this.transport.join(this.code).then(
      (link) =>
        new Promise<void>((resolve, reject) => {
          let first = true;
          const t = setTimeout(() => { link.close(); reject(new NetError('timeout')); }, 10000);
          this.link = link;
          link.onMessage((raw) => {
            const m = raw as ToGuest;
            if (!m || typeof m !== 'object') return;
            if (m.t === 'reject') {
              clearTimeout(t);
              this.leaving = true;
              link.close();
              reject(m.reason === 'running' ? new RunningError() : new NetError(m.reason === 'version' ? 'version' : 'full'));
              return;
            }
            if (first && (m.t === 'lobby' || m.t === 'view')) { first = false; clearTimeout(t); resolve(); }
            if (m.t === 'lobby') { this.lobby = m.l; this.onLobby?.(m.l); }
            else if (m.t === 'view') this.onView?.(m.v);
            else if (m.t === 'close') { this.leaving = true; link.close(); this.onClosed?.(m.kick ? 'kicked' : 'host'); }
          });
          link.onClose(() => {
            if (this.link !== link || this.leaving) return;
            this.reconnect();
          });
          link.send({ t: 'hello', v: UNO_PROTOCOL, id: this.me.id, name: this.me.name, color: this.me.color } satisfies ToHost);
        }),
    );
  }

  /** Lost the host: try a few times to get the seat back, then give up. */
  private async reconnect() {
    for (let i = 0; i < 3 && !this.leaving; i++) {
      await new Promise((r) => setTimeout(r, 1500 + i * 1500));
      if (this.leaving) return;
      try { await this.connect(); return; } catch { /* try again */ }
    }
    if (!this.leaving) this.onClosed?.('lost');
  }

  send(a: Action) { this.link?.send({ t: 'act', a } satisfies ToHost); }

  leave() {
    this.leaving = true;
    this.link?.send({ t: 'bye' } satisfies ToHost);
    setTimeout(() => this.link?.close(), 80);
  }
}
