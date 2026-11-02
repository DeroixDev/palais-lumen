// Shared network settings for every game: the ICE servers both signalling paths hand to WebRTC,
// and the test-only overrides read from the address bar.
//
// ?ice=local      no STUN/TURN at all (tests on one machine, a LAN without internet)
// ?nostr=a,b      Nostr relays for the second path instead of the public ones (tests)

const param = (k: string) => {
  try {
    return new URLSearchParams(location.search).get(k);
  } catch {
    return null;
  }
};

export const localIceOnly = () => param('ice') === 'local';

/**
 * Public STUN (Google, Cloudflare) so browsers behind ordinary home routers find each other, and
 * the public TURN relay that ships as the PeerJS default (it was already in use before; it helps
 * with strict NATs as long as it is up). Both signalling paths use the same list.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];

export const iceServers = (): RTCIceServer[] => (localIceOnly() ? [] : ICE_SERVERS);

/** Relay list from ?nostr= (ws:// or wss://, comma separated), or null for the public default. */
export function nostrOverride(): string[] | null {
  const v = param('nostr');
  if (!v) return null;
  const urls = v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^wss?:\/\/[^\s]+$/.test(s));
  return urls.length ? urls : null;
}

/** Address-bar settings an invite link carries along, so a friend uses the same paths. */
export const LINK_PARAMS = ['net', 'peer', 'ice', 'nostr'] as const;
