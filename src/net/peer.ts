// Transport over WebRTC data channels with PeerJS. The host's browser is the server; a small
// broker (the public PeerJS cloud by default, or a self-hosted `peer` server) only introduces
// the browsers to each other. PeerJS is loaded on demand, so single player never touches WebRTC.

import type { DataConnection, Peer as PeerType, PeerOptions } from 'peerjs';
import { iceServers } from './netconfig';
import { NetError, type HostEndpoint, type Link, type Transport } from './transport';

/** Where the broker runs. */
export interface Broker {
  host: string;
  port: number;
  secure: boolean;
  path: string;
}

export const DEFAULT_BROKER: Broker = { host: '0.peerjs.com', port: 443, secure: true, path: '/' };
const STORE_KEY = 'nachtfalter.mp.peer';
/** Peer ids on the shared broker: the room code behind a prefix of the house. */
export const PREFIX = 'palais-lumen-';
const CONNECT_MS = 20000;

/** "localhost:9000", "peer.example.org", "https://peer.example.org:443/myapp" → Broker. */
export function parseBroker(text: string): Broker | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(?:(https?|wss?):\/\/)?([A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::(\d{1,5}))?(\/[^\s?#]*)?$/.exec(t);
  if (!m) return null;
  const host = m[2];
  const local = /^(localhost|127\.|10\.|192\.168\.|\[)/.test(host);
  const secure = m[1] ? m[1] === 'https' || m[1] === 'wss' : !local;
  const port = m[3] ? Number(m[3]) : secure ? 443 : 9000;
  if (!(port > 0 && port < 65536)) return null;
  return { host, port, secure, path: m[4] || '/' };
}

/** The broker as one short line, the way parseBroker reads it back. */
export function brokerText(b: Broker) {
  const def = b.secure ? 443 : 80;
  return `${b.secure ? 'https' : 'http'}://${b.host}${b.port === def ? '' : `:${b.port}`}${b.path === '/' ? '' : b.path}`;
}

const urlBroker = () => {
  try {
    return new URLSearchParams(location.search).get('peer');
  } catch {
    return null;
  }
};

/** The broker in use: `?peer=` in the address, else the saved setting, else the public cloud. */
export function currentBroker(): Broker {
  const fromUrl = urlBroker();
  if (fromUrl) {
    const b = parseBroker(fromUrl);
    if (b) return b;
  }
  try {
    const saved = localStorage.getItem(STORE_KEY);
    const b = saved ? parseBroker(saved) : null;
    if (b) return b;
  } catch {
    /* storage blocked: default */
  }
  return DEFAULT_BROKER;
}

/** True when the broker isn't the public default (join links then carry it along). */
export const customBroker = () => brokerText(currentBroker()) !== brokerText(DEFAULT_BROKER);

/** Saves a broker typed in the settings ('' = back to the public cloud). Returns false if it can't be read. */
export function saveBroker(text: string): boolean {
  if (text.trim() && !parseBroker(text)) return false;
  try {
    if (text.trim()) localStorage.setItem(STORE_KEY, text.trim());
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage blocked: the setting lasts for this page only */
  }
  return true;
}

/** Whether this browser can do WebRTC data channels at all (blocked in some sandboxes). */
export function webrtcAvailable() {
  return typeof RTCPeerConnection === 'function' && typeof RTCDataChannel !== 'undefined';
}

class PeerLink implements Link {
  private msgFns: ((m: unknown) => void)[] = [];
  private closeFns: (() => void)[] = [];
  private closed = false;

  constructor(
    private conn: DataConnection,
    private owner: PeerType | null = null,
  ) {
    conn.on('data', (d) => {
      for (const f of this.msgFns) f(d);
    });
    const end = () => this.end();
    conn.on('close', end);
    conn.on('error', end);
    // An ICE failure (the friend's network dropped) can leave the channel half open.
    conn.on('iceStateChanged', (s) => {
      if (s === 'failed' || s === 'closed') end();
    });
  }

  private end() {
    if (this.closed) return;
    this.closed = true;
    for (const f of this.closeFns) f();
    if (this.owner && !this.owner.destroyed) this.owner.destroy();
  }

  send(msg: unknown) {
    if (this.closed || !this.conn.open) return;
    try {
      void this.conn.send(msg);
    } catch {
      this.end();
    }
  }

  close() {
    if (this.closed) return;
    try {
      this.conn.close();
    } catch {
      /* already gone */
    }
    this.end();
  }

  onMessage(fn: (m: unknown) => void) {
    this.msgFns.push(fn);
  }

  onClose(fn: () => void) {
    this.closeFns.push(fn);
  }
}

async function loadPeer() {
  if (!webrtcAvailable()) throw new NetError('unsupported');
  try {
    return (await import('peerjs')).Peer;
  } catch {
    throw new NetError('unsupported');
  }
}

export function peerOptions(b: Broker = currentBroker()): PeerOptions {
  // STUN (Google, Cloudflare) plus the PeerJS TURN; ?ice=local: none (tests on one machine).
  return { host: b.host, port: b.port, secure: b.secure, path: b.path, debug: 0, config: { iceServers: iceServers() } };
}

/** PeerJS error types that mean "the broker is the problem", not the room or the network path. */
const kindOf = (type: string | undefined): NetError['kind'] => {
  switch (type) {
    case 'peer-unavailable':
      return 'notFound';
    case 'browser-incompatible':
      return 'unsupported';
    case 'unavailable-id':
      return 'taken';
    case 'webrtc':
      return 'unreachable';
    default:
      // server-error, socket-error, socket-closed, network, disconnected, ssl-unavailable, …
      return 'broker';
  }
};

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

/**
 * The host's door on the PeerJS broker. It keeps itself registered: when the broker connection
 * drops (or never came up), it asks again with backoff, and the friends already at the table
 * keep their direct connections the whole time. `first` settles with the first registration
 * (or the first failure, while the retries go on in the background).
 */
export class PeerHost {
  readonly first: Promise<void>;
  private peer: PeerType | null = null;
  private closed = false;
  private tries = 0;
  private timer = 0;
  private settle: ((e?: NetError) => void) | null = null;
  /** True while registered with the broker (new friends can find the code there). */
  registered = false;

  constructor(
    private id: string,
    private options: PeerOptions,
    private onLink: (l: Link) => void,
  ) {
    this.first = new Promise<void>((res, rej) => {
      this.settle = (e) => {
        this.settle = null;
        if (e) rej(e);
        else res();
      };
    });
    this.first.catch(() => undefined);
    addEventListener('online', this.onOnline);
    void this.start();
  }

  private onOnline = () => {
    if (this.closed || this.registered) return;
    this.tries = 0;
    this.retrySoon(200);
  };

  private async start() {
    let Peer: Awaited<ReturnType<typeof loadPeer>>;
    try {
      Peer = await loadPeer();
    } catch (e) {
      this.stop(e as NetError);
      return;
    }
    if (this.closed) return;
    const peer = new Peer(this.id, this.options);
    this.peer = peer;
    peer.on('open', () => {
      this.registered = true;
      this.tries = 0;
      this.settle?.();
    });
    peer.on('connection', (conn) => {
      conn.once('open', () => this.onLink(new PeerLink(conn)));
    });
    peer.on('error', (e: { type?: string }) => {
      const kind = kindOf(e?.type);
      if (kind === 'taken' || kind === 'unsupported') {
        // someone else holds the code on this broker (or WebRTC is missing): stop for good
        if (this.settle || kind === 'unsupported') this.stop(new NetError(kind));
        else this.stop();
      } else if (kind === 'broker') {
        this.settle?.(new NetError('broker'));
      }
    });
    // The broker connection dropped (or never came up): open links keep working, and we ask
    // the broker back with growing pauses so new friends can find the code again.
    peer.on('disconnected', () => {
      this.registered = false;
      this.retrySoon();
    });
    peer.on('close', () => {
      this.registered = false;
      if (this.peer === peer) this.peer = null;
      this.retrySoon();
    });
  }

  private retrySoon(ms?: number) {
    if (this.closed) return;
    clearTimeout(this.timer);
    const wait = ms ?? BACKOFF_MS[Math.min(this.tries, BACKOFF_MS.length - 1)] * (0.8 + Math.random() * 0.4);
    this.tries++;
    this.timer = window.setTimeout(() => {
      if (this.closed || this.registered) return;
      const p = this.peer;
      if (!p || p.destroyed) {
        // a destroyed peer can't come back; a new one under the same id can
        this.peer = null;
        void this.start();
      } else if (p.disconnected) {
        try {
          p.reconnect();
        } catch {
          this.retrySoon();
        }
      }
    }, wait);
  }

  /** Stops registering with the broker; links that are already open stay open. */
  private stop(e?: NetError) {
    this.settle?.(e ?? new NetError('broker'));
    this.closed = true;
    clearTimeout(this.timer);
    removeEventListener('online', this.onOnline);
    const p = this.peer;
    if (p && !p.destroyed && !p.disconnected) p.disconnect();
  }

  close() {
    this.stop(new NetError('closed'));
    const p = this.peer;
    this.peer = null;
    setTimeout(() => p?.destroy(), 300);
  }
}

export interface PeerJoin {
  promise: Promise<Link>;
  cancel(): void;
}

/**
 * Connects to the host's PeerJS id. Fails with 'broker' when the broker doesn't answer within
 * `brokerMs`, 'notFound' when it doesn't know the id, 'unreachable' when the broker knows it but
 * no data channel opens within `connectMs`.
 */
export function peerJoin(id: string, options: PeerOptions, brokerMs: number, connectMs: number): PeerJoin {
  let peer: PeerType | null = null;
  let done = false;
  let timer = 0;
  let cancelFn: () => void = () => undefined;
  const promise = new Promise<Link>((resolve, reject) => {
    const fail = (e: NetError) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      peer?.destroy();
      reject(e);
    };
    cancelFn = () => fail(new NetError('closed'));
    timer = window.setTimeout(() => fail(new NetError('broker')), brokerMs);
    loadPeer().then((Peer) => {
      if (done) return;
      const p = new Peer(options);
      peer = p;
      p.on('error', (e: { type?: string }) => fail(new NetError(kindOf(e?.type))));
      p.once('open', () => {
        if (done) return;
        clearTimeout(timer);
        timer = window.setTimeout(() => fail(new NetError('unreachable')), connectMs);
        const conn = p.connect(id, { reliable: true, serialization: 'binary' });
        conn.once('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(new PeerLink(conn, p));
        });
        conn.once('error', () => fail(new NetError('unreachable')));
      });
    }, fail);
  });
  promise.catch(() => undefined);
  return { promise, cancel: () => cancelFn() };
}

/** PeerJS only (the robust transport in ./robust.ts adds the second path on top of this). */
export class PeerTransport implements Transport {
  /** `prefix` keeps each game's room codes apart on the shared broker (the casino uses the default). */
  constructor(
    private broker: Broker = currentBroker(),
    private prefix: string = PREFIX,
  ) {}

  async host(code: string): Promise<HostEndpoint> {
    const fns: ((l: Link) => void)[] = [];
    const ph = new PeerHost(this.prefix + code, peerOptions(this.broker), (l) => fns.forEach((f) => f(l)));
    const timer = setTimeout(() => ph.close(), CONNECT_MS);
    try {
      await ph.first;
    } catch (e) {
      ph.close();
      throw e;
    } finally {
      clearTimeout(timer);
    }
    return { code, onLink: (fn) => fns.push(fn), close: () => ph.close() };
  }

  join(code: string): Promise<Link> {
    return peerJoin(this.prefix + code, peerOptions(this.broker), CONNECT_MS, CONNECT_MS).promise;
  }
}
