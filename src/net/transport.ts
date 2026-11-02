// The small seam between the game and the network: a host opens an endpoint under a room code,
// friends connect to it, and both sides exchange JSON messages over a Link. The PeerJS version
// lives in ./peer.ts, the Nostr one (second path) in ./mesh.ts, and ./robust.ts runs both at once;
// anything else (a local test transport, a WebSocket relay, Steam) only has to implement these
// three interfaces.

/** One open connection between the host and one friend. Messages arrive in order. */
export interface Link {
  /** Sends one JSON-serialisable message; ignored once the link is closed. */
  send(msg: unknown): void;
  close(): void;
  onMessage(fn: (msg: unknown) => void): void;
  /** Called once when the link closes (either side, or the network). */
  onClose(fn: () => void): void;
}

/** The host's open door, reachable under `code`. */
export interface HostEndpoint {
  readonly code: string;
  onLink(fn: (link: Link) => void): void;
  close(): void;
}

export interface Transport {
  /** Opens the door under `code`; rejects with NetError 'taken' if the code is in use. */
  host(code: string): Promise<HostEndpoint>;
  /** Connects to the host with that code. */
  join(code: string): Promise<Link>;
}

/**
 * Why a connection failed. The three that matter most when joining:
 * - notFound:    the signalling services answered, but nobody hosts that code
 * - unreachable: the host is there, but no direct connection came about (NAT, firewall)
 * - broker:      the signalling services themselves don't answer (not the player's fault)
 * 'network' is kept for "this device is offline"; 'timeout' for an answer that never came.
 */
export type NetErrorKind = 'unsupported' | 'taken' | 'notFound' | 'unreachable' | 'broker' | 'network' | 'timeout' | 'full' | 'version' | 'closed';

export class NetError extends Error {
  constructor(
    readonly kind: NetErrorKind,
    message = kind,
  ) {
    super(message);
  }
}

/** The sentence for the connection errors all games share (rooms, hosts, brokers). */
export function connectErrorText(kind: NetErrorKind): string | null {
  switch (kind) {
    case 'notFound':
      return 'Raum nicht gefunden. Prüf den Code – und der Gastgeber muss das Spiel noch offen haben.';
    case 'unreachable':
      return 'Gastgeber nicht erreichbar: Der Raum ist da, aber eine direkte Verbindung kam nicht zustande. Versucht es gleich noch einmal; manchmal hilft ein anderes Netz (z. B. WLAN statt Mobilfunk).';
    case 'broker':
    case 'taken':
      return 'Vermittlung gestört: Die Dienste, über die sich eure Browser finden, antworten gerade nicht. Das liegt nicht an deinem Internet. Versuch es in einer Minute noch einmal.';
    case 'network':
      return 'Du bist offenbar offline. Prüf die Internetverbindung und versuch es noch einmal.';
    case 'timeout':
      return 'Die Verbindung kam nicht zustande. Versucht es gleich noch einmal; manchmal hilft ein anderes Netz.';
    default:
      return null;
  }
}

/** A friendly German sentence for a failed connection. */
export function netErrorText(e: unknown): string {
  const kind = e instanceof NetError ? e.kind : 'broker';
  switch (kind) {
    case 'unsupported':
      return 'Hier ist Spielen mit Freunden leider nicht möglich: Diese Umgebung erlaubt keine direkten Verbindungen. Öffne Palais Lumen im Browser über die Webseite oder in der Desktop-App.';
    case 'full':
      return 'Die Gruppe ist schon voll: Mehr als vier am Tisch gehen nicht.';
    case 'version':
      return 'Ihr spielt verschiedene Versionen von Palais Lumen. Ladet beide die Seite neu und versucht es noch einmal.';
    case 'closed':
      return 'Der Gastgeber hat die Gruppe gerade geschlossen.';
    default:
      return connectErrorText(kind) ?? connectErrorText('broker')!;
  }
}

// ---- progress while joining ("Verbindet … (Weg 2)") ----------------------------------------

const statusFns = new Set<(text: string) => void>();

/** Listens to short progress lines while a join runs; returns the unsubscribe function. */
export function onNetStatus(fn: (text: string) => void): () => void {
  statusFns.add(fn);
  return () => statusFns.delete(fn);
}

export function emitNetStatus(text: string) {
  for (const f of statusFns) {
    try {
      f(text);
    } catch {
      /* a UI listener must not break the connection */
    }
  }
}
