// The transport all games use: two independent ways for browsers to find each other.
//
//   Weg 1: the PeerJS broker (public 0.peerjs.com, or a custom one) – quick and exact.
//   Weg 2: Trystero over many public Nostr relays (./mesh.ts) – works when Weg 1 is down.
//
// The host announces its room on both at the same time and stays on both: when the broker
// connection drops it reconnects with backoff, the relays reconnect on their own, and friends
// already at the table keep their direct connections throughout. A friend tries Weg 1 first,
// starts Weg 2 after a short head start (or at once when Weg 1 fails) and takes whichever
// connects first. Both paths end in a WebRTC data channel with ordered, reliable JSON messages,
// so the game code above the Transport interface doesn't know which one carried the handshake.

import { meshHost, meshJoin, waitRelay } from './mesh';
import { PeerHost, currentBroker, peerJoin, peerOptions, webrtcAvailable, type Broker } from './peer';
import { NetError, emitNetStatus, type HostEndpoint, type Link, type NetErrorKind, type Transport } from './transport';

/** Weg 1 alone gets this long before Weg 2 starts alongside. */
const HEAD_START_MS = 2500;
/** The broker must answer within this; then Weg 2 carries the hope. */
const BROKER_MS = 7000;
/** Data channel after the broker found the host. */
const CONNECT_MS = 15000;
/** Weg 2: first relay socket / an answer from the room after that / everything. */
const RELAY_MS = 9000;
const FIND_MS = 6000;
const MESH_MAX_MS = 20000;
/** Host: how long Weg 1 may take before the room counts as open on Weg 2 alone. */
const HOST_PEER_MS = 6000;
const HOST_RELAY_MS = 10000;
/** Join attempts for errors where another try can help, as long as the friend hasn't waited too long. */
const ATTEMPTS = 3;
const RETRY_BUDGET_MS = 35000;

/** Dev builds only: which path carried the last join, and the host's links per path (tests). */
const devNote = (key: 'join' | 'host', path: string) => {
  if (!import.meta.env.DEV) return;
  const g = globalThis as unknown as { __netPaths?: { join: string[]; host: string[] } };
  (g.__netPaths ??= { join: [], host: [] })[key].push(path);
};

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const asNetError = (e: unknown) => (e instanceof NetError ? e : new NetError('broker'));

/** The most telling of two failures: a host that exists beats a room that doesn't, … */
const RANK: NetErrorKind[] = ['unsupported', 'version', 'full', 'unreachable', 'notFound', 'timeout', 'broker', 'network', 'closed', 'taken'];
const worse = (a: NetError, b: NetError) => (RANK.indexOf(a.kind) <= RANK.indexOf(b.kind) ? a : b);

export class RobustTransport implements Transport {
  constructor(
    private prefix: string,
    private broker: Broker = currentBroker(),
  ) {}

  async host(code: string): Promise<HostEndpoint> {
    if (!webrtcAvailable()) throw new NetError('unsupported');
    const id = this.prefix + code;
    const fns: ((l: Link) => void)[] = [];
    const early: Link[] = [];
    const emit = (l: Link) => {
      devNote('host', l.constructor.name);
      if (fns.length) fns.forEach((f) => f(l));
      else early.push(l);
    };
    const ph = new PeerHost(id, peerOptions(this.broker), emit);
    // a failed Trystero load leaves Weg 1 alone
    const meshP = meshHost(id, emit).catch(() => null);
    const close = () => {
      ph.close();
      void meshP.then((m) => m?.room.leave(300));
    };

    const t0 = Date.now();
    const first = await Promise.race([ph.first.then(() => null, (e: unknown) => asNetError(e)), sleep(HOST_PEER_MS).then(() => 'slow' as const)]);
    if (first instanceof NetError && (first.kind === 'taken' || first.kind === 'unsupported')) {
      close();
      throw first;
    }
    if (first !== null) {
      // Weg 1 is down or slow (it keeps trying in the background): open on Weg 2 alone.
      const m = await meshP;
      const ok = m ? await waitRelay(m.lib, Math.max(1000, HOST_RELAY_MS - (Date.now() - t0))) : false;
      if (!ok) {
        close();
        throw new NetError(offline() ? 'network' : 'broker');
      }
    }
    return {
      code,
      onLink: (fn) => {
        fns.push(fn);
        for (const l of early.splice(0)) fn(l);
      },
      close,
    };
  }

  async join(code: string): Promise<Link> {
    if (!webrtcAvailable()) throw new NetError('unsupported');
    let last = new NetError('broker');
    const t0 = Date.now();
    for (let i = 0; i < ATTEMPTS && (i === 0 || Date.now() - t0 < RETRY_BUDGET_MS); i++) {
      if (i) {
        emitNetStatus(`Verbindet … (Versuch ${i + 1})`);
        await sleep(800 + i * 700);
      }
      try {
        return await this.joinOnce(this.prefix + code);
      } catch (e) {
        last = asNetError(e);
        // a missing room or a refusal won't change by asking again
        if (!['broker', 'unreachable', 'timeout'].includes(last.kind)) break;
        if (offline()) {
          last = new NetError('network');
          break;
        }
      }
    }
    throw last;
  }

  private joinOnce(id: string): Promise<Link> {
    emitNetStatus('Verbindet …');
    return new Promise<Link>((resolve, reject) => {
      let done = false;
      let peerErr: NetError | null = null;
      let meshErr: NetError | null = null;
      let mesh: ReturnType<typeof meshJoin> | null = null;
      const pj = peerJoin(id, peerOptions(this.broker), BROKER_MS, CONNECT_MS);

      const win = (l: Link) => {
        if (done) {
          l.close();
          return;
        }
        done = true;
        devNote('join', l.constructor.name);
        clearTimeout(head);
        pj.cancel();
        mesh?.cancel();
        resolve(l);
      };
      const check = () => {
        if (done || !peerErr || (mesh && !meshErr)) return;
        if (!mesh) return startMesh();
        done = true;
        reject(worse(peerErr, meshErr!));
      };
      const startMesh = () => {
        if (done || mesh) return;
        clearTimeout(head);
        if (peerErr) emitNetStatus('Verbindet … (Weg 2)');
        mesh = meshJoin(id, RELAY_MS, FIND_MS, MESH_MAX_MS);
        mesh.promise.then(win, (e: unknown) => {
          meshErr = asNetError(e);
          check();
        });
      };
      const head = setTimeout(startMesh, HEAD_START_MS);

      pj.promise.then(win, (e: unknown) => {
        peerErr = asNetError(e);
        if (peerErr.kind === 'unsupported') {
          done = true;
          clearTimeout(head);
          mesh?.cancel();
          reject(peerErr);
          return;
        }
        if (mesh && !meshErr) emitNetStatus('Verbindet … (Weg 2)');
        check();
      });
    });
  }
}
