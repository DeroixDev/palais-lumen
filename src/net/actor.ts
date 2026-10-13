// Whose change the host's game is applying right now. While the host applies a friend's round,
// `actor.id` names that friend: toasts the round causes go to the friend's screen (actor.toast),
// and nothing pops up on the host's own screen (reaction offers, lamps). Outside a group, and for
// the host's own rounds, it is null, so single player behaves exactly as before.

export const actor: {
  id: string | null;
  /** Sends a toast to a friend's screen (set while hosting a group). */
  toast: ((id: string, text: string, cls: string) => void) | null;
} = { id: null, toast: null };

/** Runs `fn` as the given player (see `actor`). */
export function asActor<T>(id: string, fn: () => T): T {
  const prev = actor.id;
  actor.id = id;
  try {
    return fn();
  } finally {
    actor.id = prev;
  }
}

/** Runs `fn` as this screen's own player (toasts stay here, even inside a friend's round). */
export function asLocal<T>(fn: () => T): T {
  const prev = actor.id;
  actor.id = null;
  try {
    return fn();
  } finally {
    actor.id = prev;
  }
}
