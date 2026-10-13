// The small seam between the game and the network: a host opens an endpoint under a room code,
// friends connect to it, and both sides exchange JSON messages over a Link. The PeerJS version
// lives in ./peer.ts; anything else (a local test transport, a WebSocket relay, Steam) only has
// to implement these three interfaces.

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

export type NetErrorKind = 'unsupported' | 'taken' | 'notFound' | 'network' | 'timeout' | 'full' | 'version' | 'closed';

export class NetError extends Error {
  constructor(
    readonly kind: NetErrorKind,
    message = kind,
  ) {
    super(message);
  }
}

/** A friendly German sentence for a failed connection. */
export function netErrorText(e: unknown): string {
  const kind = e instanceof NetError ? e.kind : 'network';
  switch (kind) {
    case 'unsupported':
      return 'Hier ist Spielen mit Freunden leider nicht möglich: Diese Umgebung erlaubt keine direkten Verbindungen. Öffne Palais Lumen im Browser über die Webseite oder in der Desktop-App.';
    case 'notFound':
      return 'Unter diesem Code ist gerade keine Gruppe offen. Stimmt der Code, und ist die Gruppe beim Gastgeber noch geöffnet?';
    case 'timeout':
      return 'Die Verbindung kam nicht zustande. Versucht es gleich noch einmal; manchmal hilft ein anderes Netz.';
    case 'full':
      return 'Die Gruppe ist schon voll: Mehr als vier am Tisch gehen nicht.';
    case 'version':
      return 'Ihr spielt verschiedene Versionen von Palais Lumen. Ladet beide die Seite neu und versucht es noch einmal.';
    case 'closed':
      return 'Der Gastgeber hat die Gruppe gerade geschlossen.';
    case 'taken':
    case 'network':
    default:
      return 'Der Vermittlungsdienst ist gerade nicht erreichbar. Prüf die Internetverbindung und versuch es gleich noch einmal.';
  }
}
