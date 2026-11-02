// The second signalling path: Trystero over public Nostr relays. Many independent relays carry
// the handshake, so the room stays findable when the PeerJS broker is down. Once the browsers
// have found each other the data runs over a direct WebRTC channel, exactly as with PeerJS.
//
// A Trystero room is a mesh (everyone connects to everyone). Our games are a star around the
// host, so a short handshake tells each side the other's role: a guest only accepts the host,
// the host only accepts guests, and guests never connect to each other.
//
// Messages are JSON text. Trystero may let a short message overtake a long one, so every link
// cuts its messages into frames itself and sends them one after another: they arrive in order.

import type { MessageAction, Room } from 'trystero';
import { iceServers, nostrOverride } from './netconfig';
import { NetError, type Link } from './transport';

type Lib = typeof import('trystero');

/** Shared by all games; the room id (game prefix + code) keeps them apart. */
const APP_ID = 'palais-lumen';
/** How many of Trystero's public relays to use at once (host and friend pick the same ones). */
const REDUNDANCY = 8;
/** Characters per frame: at most 3 UTF-8 bytes each, well below Trystero's 16 KiB frame. */
const FRAME = 5000;
const ROLE_PROTO = 1;

let lib: Promise<Lib> | null = null;
export function loadMesh(): Promise<Lib> {
  lib ??= import('trystero').catch(() => {
    lib = null;
    throw new NetError('unsupported');
  });
  return lib;
}

function roomConfig() {
  const urls = nostrOverride();
  return {
    appId: APP_ID,
    relayConfig: urls ? { urls, warnOnRelayFailure: false } : { redundancy: REDUNDANCY, warnOnRelayFailure: false },
    rtcConfig: { iceServers: iceServers() },
  };
}

/** Relays with an open socket right now. */
export function openRelays(L: Lib): number {
  try {
    const socks = (L.getRelaySockets as () => Record<string, WebSocket>)();
    return Object.values(socks).filter((s) => s && s.readyState === 1).length;
  } catch {
    return 0;
  }
}

/** Resolves true as soon as a relay socket is open, false after `ms`. */
export function waitRelay(L: Lib, ms: number): Promise<boolean> {
  return new Promise((res) => {
    const t0 = Date.now();
    const tick = () => {
      if (openRelays(L) > 0) res(true);
      else if (Date.now() - t0 >= ms) res(false);
      else setTimeout(tick, 200);
    };
    tick();
  });
}

class MeshLink implements Link {
  private msgFns: ((m: unknown) => void)[] = [];
  private closeFns: (() => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private buf = '';
  closed = false;

  constructor(
    private room: MeshRoom,
    readonly peerId: string,
  ) {}

  receive(frame: unknown) {
    if (this.closed || typeof frame !== 'string' || !frame) return;
    this.buf += frame.slice(1);
    if (frame[0] !== '0') return;
    const text = this.buf;
    this.buf = '';
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    for (const f of this.msgFns) f(msg);
  }

  end() {
    if (this.closed) return;
    this.closed = true;
    for (const f of this.closeFns) f();
  }

  send(msg: unknown) {
    if (this.closed) return;
    let text: string;
    try {
      text = JSON.stringify(msg);
    } catch {
      return;
    }
    if (text === undefined) return;
    const frames: string[] = [];
    for (let i = 0; i < text.length; ) {
      let j = Math.min(text.length, i + FRAME);
      // never split a surrogate pair (it would turn into two replacement characters)
      if (j < text.length && /[\uD800-\uDBFF]/.test(text[j - 1])) j--;
      frames.push((j < text.length ? '1' : '0') + text.slice(i, j));
      i = j;
    }
    if (!frames.length) frames.push('0');
    const act = this.room.action;
    for (const f of frames) {
      // frames already queued still go out after close(): the last 'reject' / 'bye' must arrive
      this.queue = this.queue.then(() => act.send(f, { target: this.peerId })).catch(() => this.end());
    }
  }

  close() {
    if (this.closed) return;
    this.end();
    this.room.dropPeer(this.peerId);
  }

  onMessage(fn: (m: unknown) => void) {
    this.msgFns.push(fn);
  }

  onClose(fn: () => void) {
    this.closeFns.push(fn);
  }
}

type Role = 'host' | 'guest';

/** Rooms still on their way out: joining the same room again waits for them (Trystero would
 *  otherwise hand back the old instance that is about to close). */
const leaving = new Map<string, Promise<void>>();
const leftRoom = (roomId: string) => leaving.get(roomId) ?? Promise.resolve();

/** One Trystero room in either role. */
export class MeshRoom {
  readonly room: Room;
  readonly action: MessageAction<string>;
  private links = new Map<string, MeshLink>();
  private left = false;
  /** A peer with the other role started the handshake / a connection attempt failed after the
   *  relays had passed the offer on: the room exists. */
  sawPeer = false;

  constructor(
    L: Lib,
    private roomId: string,
    private role: Role,
    private onLink: (l: MeshLink) => void,
  ) {
    this.room = L.joinRoom(roomConfig(), this.roomId, {
      handshakeTimeoutMs: 8000,
      onPeerHandshake: async (_id, send, receive, isInitiator) => {
        const mine = { p: ROLE_PROTO, role: this.role };
        let theirs: unknown;
        if (isInitiator) {
          await send(mine);
          theirs = (await receive()).data;
        } else {
          theirs = (await receive()).data;
          await send(mine);
        }
        const r = theirs && typeof theirs === 'object' ? (theirs as { role?: unknown }).role : null;
        const want: Role = this.role === 'host' ? 'guest' : 'host';
        if (r === want) this.sawPeer = true;
        if (r !== want) throw new Error('role');
      },
      onJoinError: (d) => {
        if (!/role/.test(d.error)) this.sawPeer = true;
      },
    });
    this.action = this.room.makeAction<string>('m');
    this.action.onMessage = (data, ctx) => this.links.get(ctx.peerId)?.receive(data);
    this.room.onPeerJoin = (peerId) => {
      if (this.left) return;
      this.links.get(peerId)?.end();
      const l = new MeshLink(this, peerId);
      this.links.set(peerId, l);
      this.onLink(l);
    };
    this.room.onPeerLeave = (peerId) => {
      const l = this.links.get(peerId);
      this.links.delete(peerId);
      l?.end();
      // a friend whose host is gone has nothing left in this room
      if (l && this.role === 'guest') this.leave();
    };
  }

  /** Ends the direct connection to one peer (the host sending a friend away). */
  dropPeer(peerId: string) {
    const l = this.links.get(peerId);
    this.links.delete(peerId);
    l?.end();
    if (this.role === 'guest') {
      this.leave(300);
      return;
    }
    // let the last messages ('close', 'reject') drain before the channel goes
    setTimeout(() => {
      try {
        this.room.getPeers()[peerId]?.close();
      } catch {
        /* already gone */
      }
    }, 400);
  }

  leave(delay = 0) {
    if (this.left) return;
    this.left = true;
    for (const l of this.links.values()) l.end();
    this.links.clear();
    const p = new Promise<void>((res) => setTimeout(() => void this.room.leave().catch(() => undefined).finally(res), delay));
    leaving.set(this.roomId, p);
    void p.then(() => leaving.get(this.roomId) === p && leaving.delete(this.roomId));
  }
}

export interface MeshJoin {
  promise: Promise<Link>;
  cancel(): void;
}

/** Our own Nostr key (to tell our echoes from other people's signals). */
let ownKey: Promise<string> | null = null;
const myPubkey = (L: Lib) =>
  (ownKey ??= L.createEvent('palais-lumen', '').then(
    (t) => String((JSON.parse(t) as [string, { pubkey?: string }])[1]?.pubkey ?? ''),
    () => '',
  ));

/**
 * Watches the relay sockets for signalling from someone else in the room (the host answering our
 * announcement with an offer). That shows the room exists even while WebRTC is still trying.
 */
function watchSignals(L: Lib, onForeign: () => void) {
  const hooked = new Map<WebSocket, (e: MessageEvent) => void>();
  let key = '';
  void myPubkey(L).then((k) => (key = k));
  const scan = () => {
    let socks: Record<string, WebSocket> = {};
    try {
      socks = (L.getRelaySockets as () => Record<string, WebSocket>)();
    } catch {
      /* none yet */
    }
    for (const ws of Object.values(socks)) {
      if (!ws || hooked.has(ws)) continue;
      const fn = (e: MessageEvent) => {
        if (!key || typeof e.data !== 'string' || !e.data.startsWith('["EVENT"')) return;
        try {
          const ev = (JSON.parse(e.data) as [string, string, { pubkey?: string }])[2];
          if (ev?.pubkey && ev.pubkey !== key) onForeign();
        } catch {
          /* not for us */
        }
      };
      ws.addEventListener('message', fn);
      hooked.set(ws, fn);
    }
  };
  return {
    scan,
    stop: () => {
      for (const [ws, fn] of hooked) ws.removeEventListener('message', fn);
      hooked.clear();
    },
  };
}

/**
 * Joins the room as a friend and waits for the host. Fails with 'broker' when no relay answers
 * within `relayMs`, 'notFound' when the relays work but nobody in the room answers within
 * `findMs` of the first open relay, 'unreachable' when someone answered (the host is there) but
 * no channel opened by `maxMs`.
 */
export function meshJoin(roomId: string, relayMs: number, findMs: number, maxMs: number): MeshJoin {
  let room: MeshRoom | null = null;
  let done = false;
  let cancelFn: () => void = () => undefined;
  let watch: ReturnType<typeof watchSignals> | null = null;
  const timers: number[] = [];
  const promise = new Promise<Link>((resolve, reject) => {
    const finish = (e: NetError | null, l?: Link) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      watch?.stop();
      if (e) {
        room?.leave();
        reject(e);
      } else resolve(l!);
    };
    cancelFn = () => finish(new NetError('closed'));
    loadMesh().then(async (L) => {
      await leftRoom(roomId);
      if (done) return;
      const t0 = Date.now();
      let heard = false;
      watch = watchSignals(L, () => (heard = true));
      room = new MeshRoom(L, roomId, 'guest', (l) => finish(null, l));
      let relayAt = 0;
      const tick = () => {
        if (done || !room) return;
        watch?.scan();
        const now = Date.now();
        const seen = heard || room.sawPeer;
        if (!relayAt && openRelays(L) > 0) relayAt = now;
        if (now - t0 >= maxMs) return finish(new NetError(seen ? 'unreachable' : relayAt ? 'notFound' : 'broker'));
        if (!relayAt && now - t0 >= relayMs) return finish(new NetError('broker'));
        if (relayAt && !seen && now - relayAt >= findMs) return finish(new NetError('notFound'));
        timers.push(window.setTimeout(tick, 200));
      };
      tick();
    }, (e) => finish(e instanceof NetError ? e : new NetError('unsupported')));
  });
  promise.catch(() => undefined);
  return { promise, cancel: () => cancelFn() };
}

/** The host's door on the relays (they keep reconnecting on their own while it is open). */
export async function meshHost(roomId: string, onLink: (l: Link) => void): Promise<{ room: MeshRoom; lib: Lib }> {
  const L = await loadMesh();
  await leftRoom(roomId);
  return { room: new MeshRoom(L, roomId, 'host', onLink), lib: L };
}
