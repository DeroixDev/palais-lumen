// What an effect function gets: the voices (synth + recorded instruments) and the buses.
// Effects live in src/audio/sfx/games.ts and world.ts as exported functions named like the
// `sfx.<name>()` method they replace; audio.ts routes the method to the function when one exists.
import type { Voices } from '../voices';

export interface FxKit {
  v: Voices;
  ctx: BaseAudioContext;
  /** Effects bus (with a reverb send). */
  out: AudioNode;
  /** Ambience bus (quieter, follows the scene). */
  amb: AudioNode;
  /** Reverb send, for effects that want more hall than the default. */
  verb: AudioNode;
}
