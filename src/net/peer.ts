// Transport over WebRTC data channels with PeerJS. The host's browser is the server; a small
// broker (the public PeerJS cloud by default, or a self-hosted `peer` server) only introduces
// the browsers to each other. PeerJS is loaded on demand, so single player never touches WebRTC.

import type { DataConnection, Peer as PeerType, PeerOptions } from 'peerjs';
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
const PREFIX = 'palais-lumen-';
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

const localIceOnly = () => {
  try {
    return new URLSearchParams(location.search).get('ice') === 'local';
  } catch {
    return false;
  }
};

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

export class PeerTransport implements Transport {
  /** `prefix` keeps each game's room codes apart on the shared broker (the casino uses the default). */
  constructor(
    private broker: Broker = currentBroker(),
    private prefix: string = PREFIX,
  ) {}

  private options(): PeerOptions {
    const b = this.broker;
    const o: PeerOptions = { host: b.host, port: b.port, secure: b.secure, path: b.path, debug: 0 };
    // ?ice=local: no STUN/TURN servers, for tests on one machine or a LAN without internet.
    if (localIceOnly()) o.config = { iceServers: [] };
    return o;
  }

  async host(code: string): Promise<HostEndpoint> {
    const Peer = await loadPeer();
    const peer = new Peer(this.prefix + code, this.options());
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new NetError('timeout')), CONNECT_MS);
      peer.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      peer.once('error', (e: { type?: string }) => {
        clearTimeout(timer);
        peer.destroy();
        reject(new NetError(e?.type === 'unavailable-id' ? 'taken' : e?.type === 'browser-incompatible' ? 'unsupported' : 'network'));
      });
    });
    const fns: ((l: Link) => void)[] = [];
    peer.on('connection', (conn) => {
      conn.once('open', () => {
        const link = new PeerLink(conn);
        for (const f of fns) f(link);
      });
    });
    // The broker connection can drop on a flaky network; open links keep working, and we ask
    // the broker back so new friends can still find the code.
    peer.on('disconnected', () => {
      setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), 1500);
    });
    peer.on('error', () => undefined);
    return {
      code,
      onLink: (fn) => fns.push(fn),
      close: () => {
        setTimeout(() => peer.destroy(), 300);
      },
    };
  }

  async join(code: string): Promise<Link> {
    const Peer = await loadPeer();
    const peer = new Peer(this.options());
    return new Promise<Link>((resolve, reject) => {
      let done = false;
      const fail = (e: NetError) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        peer.destroy();
        reject(e);
      };
      const timer = setTimeout(() => fail(new NetError('timeout')), CONNECT_MS);
      peer.on('error', (e: { type?: string }) => fail(new NetError(e?.type === 'peer-unavailable' ? 'notFound' : e?.type === 'browser-incompatible' ? 'unsupported' : 'network')));
      peer.once('open', () => {
        const conn = peer.connect(this.prefix + code, { reliable: true, serialization: 'binary' });
        conn.once('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(new PeerLink(conn, peer));
        });
        conn.once('error', () => fail(new NetError('network')));
      });
    });
  }
}
