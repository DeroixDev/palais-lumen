// Online play for Unser Party Spiel. Same model as Unser Uno: the host's browser is the server.
// It runs the engine and every minigame simulation; friends send inputs and decisions and get
// back events, state and minigame snapshots. Transport: PeerJS (id prefix `unser-party-`), or
// with ?net=local a BroadcastChannel between tabs of one browser (tests).

import { PeerTransport } from '../../net/peer';
import { NetError, type HostEndpoint, type Link, type Transport } from '../../net/transport';
import { BOT_NAMES, COLORS, FEATS, type BotLevel, type Feat, type Rules, type Seat } from '../types';

export const PARTY_PROTOCOL = 1;
export const MAX_SEATS = 4;
const PEER_PREFIX = 'unser-party-';

export interface LobbySeat extends Omit<Seat, 'kind'> { kind: 'host' | 'friend' | 'bot'; online: boolean }
export interface LobbyInfo { code: string; seats: LobbySeat[]; rules: Rules; you: number; started: boolean }

/** Host → guest. `g` messages belong to the running game (see ../online.ts). */
export type ToGuest =
  | { t: 'lobby'; l: LobbyInfo }
  | { t: 'reject'; reason: 'full' | 'version' | 'running' }
  | { t: 'g'; m: unknown }
  | { t: 'close'; kick?: boolean };

export type ToHost =
  | { t: 'hello'; v: number; id: string; name: string; feat: Feat; color: string }
  | { t: 'pick'; name: string; feat: Feat; color: string }
  | { t: 'g'; m: unknown }
  | { t: 'bye' };

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

export class RunningError extends Error {}
export function netText(e: unknown): string {
  if (e instanceof RunningError) return 'In diesem Raum läuft schon ein Abend. Wartet bis zum nächsten.';
  const kind = e instanceof NetError ? e.kind : 'network';
  switch (kind) {
    case 'unsupported': return 'Hier geht Online-Spielen leider nicht: Diese Umgebung erlaubt keine direkten Verbindungen.';
    case 'notFound': return 'Unter diesem Code ist gerade kein Raum offen. Stimmt der Code?';
    case 'timeout': return 'Die Verbindung kam nicht zustande. Versucht es gleich noch einmal.';
    case 'full': return 'Der Raum ist schon voll: Mehr als vier gehen nicht.';
    case 'version': return 'Ihr habt verschiedene Versionen geladen. Ladet beide die Seite neu.';
    case 'closed': return 'Der Gastgeber hat den Raum geschlossen.';
    default: return 'Der Vermittlungsdienst ist gerade nicht erreichbar. Prüf die Internetverbindung.';
  }
}

// ---------------- local transport (tabs of one browser) ----------------
type BcMsg =
  | { k: 'ping'; from: string } | { k: 'pong'; to: string } | { k: 'conn'; from: string }
  | { k: 'ok'; to: string; from: string } | { k: 'msg'; from: string; to: string; d: unknown } | { k: 'end'; from: string; to: string };

class BcLink implements Link {
  private msgFns: ((m: unknown) => void)[] = [];
  private closeFns: (() => void)[] = [];
  closed = false;
  constructor(private ch: BroadcastChannel, private me: string, private peer: string) {}
  deliver(d: unknown) { for (const f of this.msgFns) f(d); }
  end() { if (this.closed) return; this.closed = true; for (const f of this.closeFns) f(); }
  send(msg: unknown) { if (!this.closed) this.ch.postMessage({ k: 'msg', from: this.me, to: this.peer, d: msg } satisfies BcMsg); }
  close() { if (this.closed) return; this.ch.postMessage({ k: 'end', from: this.me, to: this.peer } satisfies BcMsg); this.end(); }
  onMessage(fn: (m: unknown) => void) { this.msgFns.push(fn); }
  onClose(fn: () => void) { this.closeFns.push(fn); }
}
const rid = () => Math.random().toString(36).slice(2, 10);

export class LocalTransport implements Transport {
  async host(code: string): Promise<HostEndpoint> {
    const ch = new BroadcastChannel('unser-party-' + code);
    const me = 'host-' + rid();
    const taken = await new Promise<boolean>((res) => {
      const on = (e: MessageEvent<BcMsg>) => { if (e.data.k === 'pong' && e.data.to === me) { clearTimeout(t); res(true); } };
      const t = setTimeout(() => { ch.removeEventListener('message', on); res(false); }, 250);
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
    return { code, onLink: (fn) => fns.push(fn), close: () => { for (const l of links.values()) l.close(); setTimeout(() => ch.close(), 50); } };
  }
  join(code: string): Promise<Link> {
    const ch = new BroadcastChannel('unser-party-' + code);
    const me = 'g-' + rid();
    return new Promise((resolve, reject) => {
      let link: BcLink | null = null;
      const t = setTimeout(() => { ch.close(); reject(new NetError('notFound')); }, 2500);
      ch.onmessage = (e: MessageEvent<BcMsg>) => {
        const m = e.data;
        if (m.k === 'ok' && m.to === me && !link) { clearTimeout(t); link = new BcLink(ch, me, m.from); resolve(link); }
        else if (m.k === 'msg' && m.to === me && link) link.deliver(m.d);
        else if (m.k === 'end' && m.to === me && link) link.end();
      };
      ch.postMessage({ k: 'conn', from: me } satisfies BcMsg);
      addEventListener('pagehide', () => link?.close());
    });
  }
}

export function makeTransport(): Transport {
  try { if (new URLSearchParams(location.search).get('net') === 'local') return new LocalTransport(); } catch { /* default */ }
  return new PeerTransport(undefined, PEER_PREFIX);
}

// ---------------- host ----------------
interface Conn { link: Link; id: string | null }
const cleanName = (s: unknown) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) || 'Gast';
const okFeat = (f: unknown): Feat => (FEATS.find((x) => x.id === f)?.id ?? 'cap');
const accOf = (f: Feat) => FEATS.find((x) => x.id === f)!.acc;

export class PartyHost {
  seats: LobbySeat[];
  started = false;
  private conns = new Set<Conn>();
  onLobby: (() => void) | null = null;
  onNote: ((text: string) => void) | null = null;
  /** Game messages from the friend at seat i. */
  onGame: ((seat: number, m: unknown) => void) | null = null;
  /** A friend came back (or dropped) during the game. */
  onPresence: ((seat: number, online: boolean) => void) | null = null;

  private constructor(private ep: HostEndpoint, me: { id: string; name: string; feat: Feat; color: string }, public rules: Rules) {
    this.seats = [{ id: me.id, name: me.name || 'Gastgeber', color: me.color, feat: me.feat, acc: accOf(me.feat), kind: 'host', bot: 'normal', online: true }];
    ep.onLink((link) => this.accept(link));
  }
  get code() { return this.ep.code; }

  static async open(transport: Transport, me: { id: string; name: string; feat: Feat; color: string }, rules: Rules): Promise<PartyHost> {
    for (let i = 0; i < 4; i++) {
      try { return new PartyHost(await transport.host(randomCode()), me, rules); }
      catch (e) { if (!(e instanceof NetError && e.kind === 'taken')) throw e; }
    }
    throw new NetError('network');
  }

  info(you: number): LobbyInfo { return { code: this.code, seats: this.seats.map((s) => ({ ...s })), rules: structuredClone(this.rules), you, started: this.started }; }
  private send(c: Conn, m: ToGuest) { c.link.send(m); }
  broadcastLobby() {
    for (const c of this.conns) { const i = this.seats.findIndex((s) => s.id === c.id); if (i >= 0) this.send(c, { t: 'lobby', l: this.info(i) }); }
    this.onLobby?.();
  }
  /** A colour nobody else at the table has. */
  private freeColor(want: string, except: number) {
    const used = new Set(this.seats.filter((_, i) => i !== except).map((s) => s.color));
    return used.has(want) ? COLORS.find((c) => !used.has(c)) ?? want : want;
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
      if (m.v !== PARTY_PROTOCOL) { this.send(c, { t: 'reject', reason: 'version' }); return; }
      const id = String(m.id ?? '').slice(0, 40);
      if (!id) return;
      for (const o of this.conns) if (o !== c && o.id === id) { o.id = null; o.link.close(); }
      let i = this.seats.findIndex((s) => s.id === id && s.kind === 'friend');
      if (i < 0) {
        if (this.started) { this.send(c, { t: 'reject', reason: 'running' }); return; }
        if (this.seats.length >= MAX_SEATS) {
          const b = this.seats.findIndex((s) => s.kind === 'bot');
          if (b < 0) { this.send(c, { t: 'reject', reason: 'full' }); return; }
          this.seats.splice(b, 1);
        }
        const feat = okFeat(m.feat);
        this.seats.push({ id, name: cleanName(m.name), feat, acc: accOf(feat), color: '', kind: 'friend', bot: 'normal', online: true });
        i = this.seats.length - 1;
        this.seats[i].color = this.freeColor(String(m.color), i);
        this.onNote?.(`${this.seats[i].name} ist da.`);
      } else {
        this.seats[i].online = true;
        this.onNote?.(`${this.seats[i].name} ist wieder da.`);
        if (this.started) this.onPresence?.(i, true);
      }
      c.id = id;
      this.broadcastLobby();
      return;
    }
    if (!c.id) return;
    const seat = this.seats.findIndex((s) => s.id === c.id);
    if (seat < 0) return;
    if (m.t === 'pick' && !this.started) {
      const s = this.seats[seat];
      s.name = cleanName(m.name);
      s.feat = okFeat(m.feat);
      s.acc = accOf(s.feat);
      s.color = this.freeColor(String(m.color), seat);
      this.broadcastLobby();
    } else if (m.t === 'g') this.onGame?.(seat, m.m);
    else if (m.t === 'bye') c.link.close();
  }
  private drop(c: Conn) {
    this.conns.delete(c);
    if (!c.id) return;
    const i = this.seats.findIndex((s) => s.id === c.id);
    if (i < 0) return;
    const name = this.seats[i].name;
    if (this.started) {
      this.seats[i].online = false;
      this.onNote?.(`${name} ist weg. Ein Bot spielt weiter.`);
      this.onPresence?.(i, false);
    } else {
      this.seats.splice(i, 1);
      this.onNote?.(`${name} ist gegangen.`);
    }
    this.broadcastLobby();
  }
  addBot(level: BotLevel) {
    if (this.started || this.seats.length >= MAX_SEATS) return;
    const used = new Set(this.seats.map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot';
    const feat = FEATS[this.seats.length % 4].id;
    this.seats.push({ id: 'bot-' + rid(), name, feat, acc: accOf(feat), color: this.freeColor(COLORS[this.seats.length], -1), kind: 'bot', bot: level, online: true });
    this.broadcastLobby();
  }
  removeSeat(i: number) {
    if (this.started || i <= 0 || !this.seats[i]) return;
    const s = this.seats[i];
    this.seats.splice(i, 1);
    if (s.kind === 'friend') for (const c of this.conns) if (c.id === s.id) { this.send(c, { t: 'close', kick: true }); c.id = null; c.link.close(); }
    this.broadcastLobby();
  }
  setRules(r: Rules) { if (this.started) return; this.rules = structuredClone(r); this.broadcastLobby(); }
  setMe(p: { name: string; feat: Feat; color: string }) {
    if (this.started) return;
    Object.assign(this.seats[0], { name: p.name || 'Gastgeber', feat: p.feat, acc: accOf(p.feat), color: this.freeColor(p.color, 0) });
    this.broadcastLobby();
  }
  /** Game message to the friend at seat i (no-op for bots and offline friends). */
  sendTo(i: number, m: unknown) {
    const s = this.seats[i];
    if (!s || s.kind !== 'friend') return;
    for (const c of this.conns) if (c.id === s.id) this.send(c, { t: 'g', m });
  }
  broadcast(m: unknown) { for (const c of this.conns) if (c.id) this.send(c, { t: 'g', m }); }
  isOnline(i: number) { const s = this.seats[i]; return !!s && s.kind === 'friend' && s.online; }
  close() {
    for (const c of this.conns) this.send(c, { t: 'close' });
    setTimeout(() => { for (const c of this.conns) c.link.close(); this.ep.close(); }, 120);
  }
}

// ---------------- guest ----------------
export class PartyGuest {
  lobby: LobbyInfo | null = null;
  onLobby: ((l: LobbyInfo) => void) | null = null;
  onGame: ((m: unknown) => void) | null = null;
  onClosed: ((why: 'host' | 'lost' | 'kicked') => void) | null = null;
  private link: Link | null = null;
  private leaving = false;
  private constructor(private transport: Transport, readonly code: string, private me: { id: string; name: string; feat: Feat; color: string }) {}

  static async join(transport: Transport, code: string, me: { id: string; name: string; feat: Feat; color: string }): Promise<PartyGuest> {
    const g = new PartyGuest(transport, code, me);
    await g.connect();
    return g;
  }
  private connect(): Promise<void> {
    return this.transport.join(this.code).then((link) => new Promise<void>((resolve, reject) => {
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
        if (first && m.t === 'lobby') { first = false; clearTimeout(t); resolve(); }
        if (m.t === 'lobby') { this.lobby = m.l; this.onLobby?.(m.l); }
        else if (m.t === 'g') this.onGame?.(m.m);
        else if (m.t === 'close') { this.leaving = true; link.close(); this.onClosed?.(m.kick ? 'kicked' : 'host'); }
      });
      link.onClose(() => { if (this.link !== link || this.leaving) return; void this.reconnect(); });
      link.send({ t: 'hello', v: PARTY_PROTOCOL, id: this.me.id, name: this.me.name, feat: this.me.feat, color: this.me.color } satisfies ToHost);
    }));
  }
  private async reconnect() {
    for (let i = 0; i < 4 && !this.leaving; i++) {
      await new Promise((r) => setTimeout(r, 1500 + i * 1500));
      if (this.leaving) return;
      try { await this.connect(); return; } catch { /* again */ }
    }
    if (!this.leaving) this.onClosed?.('lost');
  }
  pick(p: { name: string; feat: Feat; color: string }) { Object.assign(this.me, p); this.link?.send({ t: 'pick', ...p } satisfies ToHost); }
  send(m: unknown) { this.link?.send({ t: 'g', m } satisfies ToHost); }
  leave() { this.leaving = true; this.link?.send({ t: 'bye' } satisfies ToHost); setTimeout(() => this.link?.close(), 80); }
}
