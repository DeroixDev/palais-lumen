// The club floor's music (floor 4, "Club Neon"): piano house in the club, Berlin warehouse
// techno in the bunker, dusty boom-bap on the hip-hop floor. Each room has a base groove that
// always plays (kick, bass, chords: what you hear through the walls, muffled by a lowpass far
// away) and a "stage layer" (hats, percussion, hooks, leads, effects) whose level follows how
// close the player is to the dance floor. The base opens up as you come closer.
//
// Like the foyer band, every room is written out a whole bar at a time (on beat 0) and follows
// a long form with build-ups and breakdowns, so the music only repeats after about four minutes.
// Recorded instruments (tr808/lm2/MFB-512 drum machines, piano, organ, choir, upright bass, vibes,
// horns, industrial metal) carry the music; synthesis is used where a club would use it too: the
// sub bass, the 909 kick and hats, the rumble, the acid line, the dub stabs, risers and vinyl noise.

import { mtof } from '../audio/sampler';
import type { InstId, NoteOpts, Voices } from '../audio/voices';
import { chord, improvise, nearest, voice, type Chord } from '../audio/moods/jazz';
import { hum, pick, rnd } from '../audio/moods/types';

export type { Voices };

export type ClubMood = 'club' | 'techno' | 'hiphop';

export const CLUB_BPM: Record<ClubMood, number> = { club: 124, techno: 134, hiphop: 88 };

/** Recorded instruments per room (loaded lazily on the first beat; synth stand-ins play until then). */
const NEED: Record<ClubMood, InstId[]> = {
  club: ['tr808', 'lm2', 'claps', 'hihat', 'piano', 'bass', 'organ', 'choir', 'suscym'],
  techno: ['mfb', 'claps', 'suscym', 'clash', 'strings', 'anvil', 'brakedrum', 'ratchet'],
  hiphop: ['lm2', 'tr808', 'snare', 'hihat', 'piano', 'wurli', 'bass', 'vibes', 'trumpet', 'trombone', 'choir'],
};
const FX_NEED: InstId[] = ['tr808', 'lm2', 'suscym', 'clash'];

interface Chain {
  out: GainNode;
  /** Base groove goes through here: muffled far away, open near the stage. */
  lp: BiquadFilterNode;
  /** Stage layer gain (0 far away, 1 on the dance floor). */
  layer: GainNode;
  /** Base level of the mood (see TRIM). */
  trim: GainNode;
  /** Sidechain "pump" for pads (ducks on every kick), feeds the base. */
  pump: GainNode;
  /** Stereo dotted-eighth echo (ping-pong), returns into the stage layer. */
  echo: GainNode;
  /** Saturator for the acid line / dub stabs, feeds the stage layer. */
  drive: GainNode;
  /** Lowpassed rumble bus (techno), feeds the base. */
  rumble: GainNode;
  mood: ClubMood;
  /** Voice-leading memory between bars. */
  comp: number;
  solo: { last: number; rest: number; dir: number };
}

/**
 * Level balance per mood, measured with tools/sounds/render.mjs: `far`/`near` scale the whole
 * groove away from and on the dance floor, `layer` evens out the stage layers, so club, bunker
 * and hip-hop floor reach the same loudness at the stage (about -30 dBFS rendered, -38 far away).
 */
const TRIM: Record<ClubMood, { far: number; near: number; layer: number }> = {
  club: { far: 0.4, near: 1, layer: 1 },
  techno: { far: 0.44, near: 0.88, layer: 1 },
  hiphop: { far: 0.4, near: 1, layer: 1 },
};
const trimGain = (m: ClubMood, lvl: number) => TRIM[m].far + (TRIM[m].near - TRIM[m].far) * lvl;

const cutoff = (lvl: number) => 2200 * Math.pow(8, lvl);
const layerGain = (lvl: number) => Math.max(0.0001, Math.pow(lvl, 1.3));

/** Soft clipping curve for the drive bus. */
function driveCurve(k: number) {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

/** Per-output chains (the mood crossfade makes a new output each time) and the current level. */
export class ClubMix {
  private chains: Chain[] = [];
  private loaded = new Set<ClubMood>();
  level = 0;

  private chain(v: Voices, out: GainNode, mood: ClubMood) {
    let c = this.chains.find((x) => x.out === out);
    if (c) return c;
    const ctx = v.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff(this.level);
    lp.Q.value = 0.7;
    const trim = ctx.createGain();
    trim.gain.value = trimGain(mood, this.level);
    lp.connect(trim).connect(out);
    const layer = ctx.createGain();
    layer.gain.value = layerGain(this.level) * TRIM[mood].layer;
    layer.connect(lp);

    const pump = ctx.createGain();
    pump.connect(lp);

    // Ping-pong echo: dotted eighths, darker with every repeat.
    const spb = 60 / CLUB_BPM[mood];
    const echo = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = dr.delayTime.value = spb * 0.75;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const pl = ctx.createStereoPanner();
    const pr = ctx.createStereoPanner();
    pl.pan.value = -0.75;
    pr.pan.value = 0.75;
    echo.connect(hp).connect(dl);
    dl.connect(pl).connect(layer);
    dl.connect(dr);
    dr.connect(pr).connect(layer);
    dr.connect(tone).connect(fb).connect(dl);

    // Drive: a warm saturator, then a highpass so the acid never muddies the kick.
    const drive = ctx.createGain();
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(2.6);
    ws.oversample = '2x';
    const post = ctx.createGain();
    post.gain.value = 0.22;
    const dhp = ctx.createBiquadFilter();
    dhp.type = 'highpass';
    dhp.frequency.value = 90;
    drive.connect(ws).connect(post).connect(dhp).connect(layer);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    dhp.connect(send).connect(echo);

    // Rumble: everything low and round, nothing above 170 Hz.
    const rumble = ctx.createGain();
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 170;
    rlp.Q.value = 0.9;
    rumble.connect(rlp).connect(lp);

    c = { out, lp, layer, trim, pump, echo, drive, rumble, mood, comp: 64, solo: { last: 74, rest: 0, dir: 1 } };
    this.chains.push(c);
    // Old outputs have faded out long ago.
    if (this.chains.length > 4) this.chains.shift();
    return c;
  }

  /** Smoothly moves every chain to a new proximity level (0..1). */
  setLevel(ctx: BaseAudioContext, lvl: number) {
    this.level = Math.max(0, Math.min(1, lvl));
    const now = ctx.currentTime;
    for (const c of this.chains) {
      c.lp.frequency.setTargetAtTime(cutoff(this.level), now, 0.25);
      c.layer.gain.setTargetAtTime(layerGain(this.level) * TRIM[c.mood].layer, now, 0.25);
      c.trim.gain.setTargetAtTime(trimGain(c.mood, this.level), now, 0.25);
    }
  }

  play(m: ClubMood, v: Voices, bar: number, b: number, d: number, spb: number, out: GainNode) {
    if (!this.loaded.has(m)) {
      this.loaded.add(m);
      void v.need(...NEED[m]);
    }
    const c = this.chain(v, out, m);
    // Pads breathe with the kick on every beat.
    duck(c, v.at(d), spb, m === 'hiphop' ? 0.75 : 0.35);
    if (b !== 0) return;
    if (m === 'club') houseBar(v, bar, d, spb, c);
    else if (m === 'techno') technoBar(v, bar, d, spb, c);
    else hiphopBar(v, bar, d, spb, c);
  }
}

// ---- Shared building blocks -----------------------------------------------------------

function duck(c: Chain, t: number, spb: number, depth: number) {
  const g = c.pump.gain;
  g.setTargetAtTime(depth, t, 0.004);
  g.setTargetAtTime(1, t + 0.04, spb * 0.22);
}

/** Looping noise through a sweeping filter with a swelling envelope (risers, washes, hiss). */
function wash(v: Voices, out: AudioNode, d: number, dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = 'highpass', q = 0.8, att = 0.85) {
  const ctx = v.ctx;
  const t = v.at(d);
  const src = ctx.createBufferSource();
  src.buffer = v.noiseBuffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

/** A synth bass note: round sine sub plus a plucky filtered saw on top (house, techno). */
function synthBass(v: Voices, out: AudioNode, midi: number, d: number, dur: number, vel: number, bright = 1) {
  const ctx = v.ctx;
  const t = v.at(d);
  const f = mtof(midi);
  const sub = ctx.createOscillator();
  sub.frequency.value = f;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  saw.detune.value = 6;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2.5;
  lp.frequency.setValueAtTime(220 + 900 * bright * vel, t);
  lp.frequency.exponentialRampToValueAtTime(140, t + Math.min(dur, 0.18));
  const gs = ctx.createGain();
  const gw = ctx.createGain();
  gw.gain.value = 0.32;
  const g = ctx.createGain();
  const end = t + Math.max(0.05, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.075 * vel, t + 0.006);
  g.gain.setTargetAtTime(0.055 * vel, t + 0.02, 0.08);
  g.gain.setTargetAtTime(0, end, 0.025);
  sub.connect(gs).connect(g);
  saw.connect(lp).connect(gw).connect(g);
  g.connect(out);
  for (const o of [sub, saw]) {
    o.start(t);
    o.stop(end + 0.15);
  }
}

/** A drum roll for a build-up: denser and higher over `bars`, crescendo into the drop. */
function roll(v: Voices, out: AudioNode, id: InstId, art: string, d: number, spb: number, k: number, bars: number, gain = 1) {
  const p = k / bars; // 0..1 through the build
  const per = p < 0.5 ? 2 : p < 0.75 ? 4 : 8; // hits per beat
  const last = k === bars - 1;
  for (let i = 0; i < 4 * per; i++) {
    const pos = i / per;
    if (last && pos >= 3) break; // a breath before the drop
    const x = p + pos / 4 / bars;
    v.hit(id, art, d + pos * spb + hum(2), out, { vel: 0.3 + 0.6 * x, gain, cents: x * 500, pan: (i % 2 ? 0.15 : -0.15) });
  }
}

// ---- Club: piano house ------------------------------------------------------------------
//
// A minor, 124 bpm. 128 bars (~4.1 min): intro, groove, breakdown + build, peak (piano hook in
// octaves), deep (organ stabs, congas, a soulful ii-V-I), groove 2 (choir sings the second
// hook), a second breakdown + build, peak 2. Kick, sub bass, piano chords and the pad are the
// base; hats, claps' sparkle, percussion, hooks, organ and risers are the stage layer.

type HouseSec = 'intro' | 'groove' | 'break' | 'peak' | 'deep' | 'groove2' | 'peak2';
const HOUSE_FORM: HouseSec[] = ['intro', 'groove', 'break', 'peak', 'deep', 'groove2', 'break', 'peak2'];
const H_P1 = ['Am9', 'Fmaj9', 'Cmaj9', 'G6'];
const H_P2 = ['Dm9', 'G13', 'Cmaj9', 'Am9'];
const H_PB = ['Fmaj9', 'G6', 'Em7', 'Am9'];

/** Piano stab rhythms: [16th step, length in steps]. */
const STABS: [number, number][][] = [
  [[2, 1], [6, 1], [10, 1], [14, 1]], // offbeat eighths (deep house)
  [[0, 3], [3, 3], [6, 4], [10, 2], [13, 3]], // the classic syncopated piano house figure
  [[0, 2], [3, 1], [6, 2], [8, 1], [11, 2], [14, 2]],
];
const STAB_FILL: [number, number][] = [[0, 3], [3, 3], [6, 2], [8, 1], [10, 1], [12, 1], [14, 2]];

type Line = [number, number, number][]; // [16th step, midi, length in steps]
/** Hook A over Am9 Fmaj9 Cmaj9 G6 (played in octaves on the piano). */
const HOOK_A: Line[] = [
  [[0, 76, 3], [3, 72, 3], [6, 76, 2], [8, 79, 3], [11, 76, 3], [14, 74, 2]],
  [[0, 72, 3], [3, 69, 3], [6, 72, 2], [8, 76, 4], [12, 74, 2], [14, 72, 2]],
  [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 71, 3], [11, 72, 3], [14, 74, 2]],
  [[0, 74, 3], [3, 71, 3], [6, 67, 2], [8, 69, 6], [14, 71, 2]],
];
/** Hook B over Dm9 G13 Cmaj9 Am9 (choir in groove 2, piano in peak 2). */
const HOOK_B: Line[] = [
  [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 4], [10, 69, 2], [12, 72, 4]],
  [[0, 74, 3], [3, 71, 3], [6, 74, 2], [8, 77, 4], [12, 76, 4]],
  [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 71, 4]],
  [[0, 72, 3], [3, 69, 5], [8, 76, 3], [11, 74, 3], [14, 72, 2]],
];

/** Bass midi for a chord root, kept in the deep A1..G#2 octave. */
const lowRoot = (c: Chord, lo = 33) => lo + ((c.root - lo) % 12 + 12) % 12;

/** Kick levels (the drum machine samples are normalised hot). */
const KG = { house808: 0.15, houseLm: 0.14 };

function houseKick(v: Voices, out: AudioNode, d: number, vel = 0.9) {
  v.hit('tr808', 'bd2550', d, out, { vel, gain: KG.house808 });
  v.hit('lm2', 'kick', d, out, { vel: vel * 0.75, gain: KG.houseLm });
}

function houseBar(v: Voices, bar: number, d: number, spb: number, c: Chain) {
  const i = bar % 128;
  const sec = HOUSE_FORM[i >> 4];
  const k = i % 16;
  const q = spb / 4;
  const T = (s: number, ms = 4) => d + s * q + hum(ms);
  const B: AudioNode = c.lp;
  const L: AudioNode = c.layer;
  const breakdown = sec === 'break' && k < 8;
  const build = sec === 'break' && k >= 8;
  const deepSide = sec === 'deep' || sec === 'groove2' || sec === 'peak2';
  const prog = breakdown ? H_PB : deepSide ? H_P2 : H_P1;
  const cd = chord(prog[k % 4]);
  const vo = voice(cd, c.comp, 55, 76);
  c.comp = vo.reduce((a, b) => a + b, 0) / vo.length;
  const root = lowRoot(cd);
  const peak = sec === 'peak' || sec === 'peak2';

  // Crash on the first bar of a big section.
  if (k === 0 && i > 0 && (peak || sec === 'groove' || sec === 'deep')) v.hit('suscym', 'hit', d, L, { vel: 0.6, gain: 0.55, pan: 0.3 });

  // ---- Kick and sub bass (base) ----
  if (!breakdown) {
    for (let b = 0; b < 4; b++) {
      if (build && k === 15 && b === 3) continue;
      houseKick(v, B, T(b * 4, 2), b === 0 ? 0.95 : 0.88);
    }
  }
  const bassOn = !breakdown && !(build && k >= 12) && !(sec === 'intro' && k < 4);
  if (bassOn) {
    const oct = root + 12;
    const fifth = root + 7;
    const pat: Line =
      sec === 'deep' || sec === 'peak2'
        ? [[0, root, 2], [3, root, 2], [6, oct, 1], [8, root, 2], [10, fifth, 2], [13, root, 2], [15, oct, 1]]
        : k % 4 === 3
          ? [[2, root, 2], [6, root, 2], [10, oct, 1], [11, fifth, 1], [14, root, 1], [15, oct - 2, 1]]
          : [[2, root, 2], [6, root, 2], [10, root, 2], [14, root, 1], [15, oct, 1]];
    for (const [s, m, len] of pat) {
      synthBass(v, B, m, T(s, 3), len * q * 0.92, s % 4 === 2 ? 0.9 : 0.75, peak ? 1.2 : 0.9);
      v.note('bass', m + 12, T(s, 3), B, { vel: 0.55, dur: len * q * 0.85, rel: 0.05, lp: 1400, gain: 0.15 });
    }
  }

  // ---- Claps, hats and percussion ----
  const drums = !breakdown && !(sec === 'intro' && k < 2);
  if (drums && !(sec === 'intro' && k < 8)) {
    for (const s of [4, 12]) {
      if (build && k === 15 && s === 12) continue;
      v.hit('claps', 'clap', T(s, 3), B, { vel: 0.8, gain: 0.55, pan: -0.08 });
      v.hit('tr808', 'cp', T(s, 3) + 0.006, L, { vel: 0.7, gain: 0.45, pan: 0.1 });
    }
    if (peak && k % 4 === 3) v.hit('claps', 'clap', T(15, 3), L, { vel: 0.5, gain: 0.4, pan: 0.2 });
  }
  if (drums && !(build && k >= 14)) {
    const accent = [0.35, 0.18, 0.55, 0.22];
    for (let s = 0; s < 16; s++) {
      if (sec === 'intro' && k < 8 && s % 2) continue;
      v.hit('hihat', 'c', T(s, 3), L, { vel: accent[s % 4] + rnd(-0.04, 0.04), gain: 0.5, pan: 0.25 });
    }
    if (sec !== 'intro' || k >= 8) for (const s of [2, 6, 10, 14]) v.hit('tr808', peak ? 'oh10' : 'oh00', T(s, 2), L, { vel: 0.62, gain: 0.45, pan: -0.2 });
    if (peak) for (const s of [4, 12]) v.hit('lm2', 'tambourine', T(s + 0.15, 2), L, { vel: 0.5, gain: 0.45, pan: 0.45 });
    if (sec === 'deep' || sec === 'groove2')
      for (let s = 0; s < 16; s++) v.hit('lm2', 'cabasa', T(s, 3), L, { vel: s % 2 ? 0.25 : 0.4, gain: 0.35, pan: 0.5 });
    if (sec === 'deep') {
      const congas: [number, string][] = [[3, 'conga-h'], [6, 'conga-m'], [7, 'conga-h'], [11, 'conga-l'], [14, 'conga-m']];
      for (const [s, a] of congas) v.hit('lm2', a, T(s, 6), L, { vel: 0.55 + rnd(-0.1, 0.1), gain: 0.5, pan: -0.45 });
    }
  }

  // ---- Piano (base) ----
  const pianoOpts = (vel: number, len: number, lp?: number): NoteOpts => ({ vel: vel + rnd(-0.04, 0.04), dur: len, rel: 0.12, gain: 0.5, pan: -0.15, lp });
  if (breakdown) {
    // Breakdown: a slow rolled chord, the hook drifting in softly on top.
    v.chord('piano', [root + 12, ...vo], T(0), B, { vel: 0.5, dur: spb * 3.8, rel: 1.2, gain: 0.55, pan: -0.15 }, 0.03);
    if (k >= 4) for (const [s, m, len] of HOOK_A[k % 4]) v.note('piano', m, T(s, 6), L, { vel: 0.4, dur: len * q, rel: 0.3, gain: 0.45, pan: 0.2 });
  } else if (sec !== 'deep') {
    const lp = sec === 'intro' ? 700 + k * 260 : build ? 2500 + (k - 8) * 600 : undefined;
    const pat = build ? (k >= 12 ? [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 1] as [number, number]) : STABS[0]) : sec === 'intro' ? STABS[0] : k % 4 === 3 ? STAB_FILL : STABS[sec === 'groove2' || sec === 'peak2' ? 2 : 1];
    pat.forEach(([s, len], j) => {
      if (build && k === 15 && s >= 12) return;
      const vel = build ? 0.45 + (k - 8) * 0.05 : j === 0 ? 0.72 : 0.6;
      v.chord('piano', vo, T(s, 5), B, pianoOpts(vel, len * q * 0.9, lp), 0.004);
      if (s === 0 && !build) v.note('piano', root + 12, T(s, 5), B, pianoOpts(0.5, len * q, lp));
    });
  }

  // ---- Organ stabs (deep) ----
  if (sec === 'deep') {
    const ov = voice(cd, 62, 55, 74);
    for (const [s, len] of k % 4 === 3 ? STAB_FILL : STABS[0]) v.chord('organ', ov, T(s, 4), L, { vel: 0.55, dur: len * q * 0.8, rel: 0.06, gain: 0.32, pan: 0.2 });
    if (k % 2 === 0) v.note('organ', root + 24, T(0), B, { vel: 0.5, dur: spb * 0.5, rel: 0.1, gain: 0.25 });
  }

  // ---- Choir pad (base, pumping) ----
  if (breakdown || build || sec === 'deep' || sec === 'peak2' || sec === 'groove2') {
    const pv = voice(cd, 62, 52, 74);
    const vel = breakdown ? 0.55 : build ? 0.4 + (k - 8) * 0.04 : 0.4;
    v.chord('choir', pv, T(0, 2), c.pump, { vel, dur: spb * 4, att: 0.35, rel: 0.6, gain: 0.45, pan: 0.1 });
  }

  // ---- Hooks (stage) ----
  if (sec === 'peak')
    for (const [s, m, len] of HOOK_A[k % 4]) {
      v.note('piano', m, T(s, 4), L, { vel: 0.72, dur: len * q * 0.95, rel: 0.2, gain: 0.55, pan: 0.2 });
      v.note('piano', m - 12, T(s, 4), L, { vel: 0.6, dur: len * q * 0.95, rel: 0.2, gain: 0.5, pan: 0.2 });
    }
  if (sec === 'peak2' && k >= 4)
    for (const [s, m, len] of HOOK_B[k % 4]) {
      v.note('piano', m, T(s, 4), L, { vel: 0.7, dur: len * q * 0.95, rel: 0.2, gain: 0.55, pan: 0.2 });
      v.note('piano', m - 12, T(s, 4), L, { vel: 0.58, dur: len * q * 0.95, rel: 0.2, gain: 0.5, pan: 0.2 });
    }
  if (sec === 'groove2' && k >= 8) {
    // The choir sings hook B in long notes, an "ooh" over the groove.
    for (const [s, m, len] of HOOK_B[k % 4]) if (len >= 3) v.note('choir', m - 12, T(s, 8), L, { vel: 0.55, dur: len * q * 1.3, att: 0.06, rel: 0.4, gain: 0.5, pan: -0.2 });
  }
  if (peak && k % 8 === 7) v.chord('organ', voice(cd, 66, 58, 79), T(14, 2), c.echo, { vel: 0.6, dur: q * 1.5, rel: 0.05, gain: 0.35 });

  // ---- Build-up: snare roll, riser, cymbal swell ----
  if (build) {
    roll(v, B, 'lm2', 'snare-m', d, spb, k - 8, 8, 0.3);
    if (k === 12) wash(v, L, d, spb * 16, 0.07, 400, 9000, 'highpass', 0.9, 0.95);
    if (k === 14) v.hit('suscym', 'swell', d, L, { vel: 0.6, gain: 0.5 });
  }
  if (breakdown && k === 0) wash(v, L, d, spb * 6, 0.05, 8000, 300, 'lowpass', 0.7, 0.05);
}

// ---- Techno bunker: Berlin warehouse techno ---------------------------------------------
//
// F minor (phrygian colour), 134 bpm, 160 bars (~4.8 min) in two 80-bar arcs, like two records
// in a DJ set. Arc one: intro, groove, peak, break + build, drop. Arc two: hypno, deep, peak 2,
// break 2 + build, drop 2, which thins out into the next intro as if the next record came in.
//
// Base (through the walls): a synthesised 909 kick (pitch-swept sine, click, drive) layered
// with the MFB-512 kick, and the rumble: the kick and a rolling off-beat sub fed into a dark
// reverb, lowpassed and ducked by every kick. Plus the dub stabs' dry hit and claps.
// Stage layer: 909-style hats (a metallic square cluster, closed hats choke the open ones),
// MFB-512 claps, snare rolls and toms, a 303-style acid line whose accents, slides and notes
// mutate every eight bars while its filter follows long 16-64 bar sweeps, dub chord stabs into
// the echo, industrial metal, risers and the drop.

type TechSec = 'intro' | 'groove' | 'peak' | 'break' | 'drop' | 'hypno' | 'deep' | 'peak2' | 'break2' | 'drop2';
const TECH_FORM: TechSec[] = ['intro', 'groove', 'peak', 'break', 'drop', 'hypno', 'deep', 'peak2', 'break2', 'drop2'];
const TECH_BARS = TECH_FORM.length * 16;
const T_ROOT = 41; // F2

/** Acid filter openness (0..1) at [bar, value] keyframes: the long sweeps of the set. */
const ACID_OPEN: [number, number][] = [
  [0, 0], [24, 0.02], [32, 0.2], [48, 0.66], [50, 0.42], [56, 0.12], [64, 0.62], [64, 0.9], [72, 0.78], [80, 0.5],
  [96, 0.08], [112, 0.42], [128, 1], [130, 0.45], [136, 0.18], [144, 0.68], [144, 0.92], [160, 0.3],
];
function acidOpen(x: number) {
  for (let j = 1; j < ACID_OPEN.length; j++) {
    const [b1, v1] = ACID_OPEN[j];
    if (x < b1) {
      const [b0, v0] = ACID_OPEN[j - 1];
      return v0 + ((v1 - v0) * (x - b0)) / (b1 - b0);
    }
  }
  return ACID_OPEN[ACID_OPEN.length - 1][1];
}

/** Acid patterns, 16 steps: semitones over the root, '-' rest, '!' accent, '~' slide into the next. */
const ACID_SRC = [
  '0! - 0 12~ 0 - 3~ 5 0! - 10 0 - 12~ 13 0', // groove / peak: the main riff
  '0 0! - 0 12~ 10 - 0! 3 - 0 0! 15~ 12 - 7', // drop: busier, the octave pushes
  '0! - - 0 - - 0! - - 12~ 13 - 0~ 3 - -', // hypno / deep: sparse, three-step feel
  '0! 12 0 - 0 1~ 0 - 0! 12 - 0 8~ 7 0! -', // peak 2 / drop 2: the phrygian b2 and b6
];
type AcidStep = { n: number; acc: boolean; sl: boolean } | null;
const parseAcid = (s: string): AcidStep[] => s.split(' ').map((t) => (t === '-' ? null : { n: parseInt(t, 10), acc: t.includes('!'), sl: t.includes('~') }));
const ACID = ACID_SRC.map(parseAcid);
const ACID_NOTES = [0, 0, 0, 12, 3, 7, 10, 1, 13, 15];

/** Small deterministic random generator, so the acid's mutations are part of the composition. */
function seeded(seed: number) {
  let a = seed * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The base pattern of a section, mutated per eight-bar phrase: accents wander, slides flip, a note changes. */
function acidPattern(base: number, phrase: number, amount: number): AcidStep[] {
  const r = seeded(phrase * 31 + base * 7 + 3);
  const p = ACID[base].map((x) => (x ? { ...x } : null));
  const on = () => p.map((x, j) => (x ? j : -1)).filter((j) => j >= 0);
  for (let m = 0; m < amount; m++) {
    const ix = on();
    const j = ix[Math.floor(r() * ix.length)];
    const x = p[j]!;
    const what = r();
    if (what < 0.35) x.acc = !x.acc;
    else if (what < 0.6) x.sl = !x.sl && j < 15 && !!p[j + 1];
    else if (what < 0.85) x.n = ACID_NOTES[Math.floor(r() * ACID_NOTES.length)];
    else {
      // A rest becomes a note (or the other way round): the groove of the line shifts.
      const e = Math.floor(r() * 16);
      p[e] = p[e] ? null : { n: r() < 0.5 ? 0 : 12, acc: r() < 0.3, sl: false };
    }
  }
  if (!p[0]) p[0] = { n: 0, acc: true, sl: false };
  return p;
}

/**
 * One bar of the 303: a single mono voice (saw or square through two resonant lowpasses).
 * Notes retrigger the filter envelope, slides glide the pitch and keep the gate open,
 * accents hit harder and brighter. `openAt(step)` gives the filter openness 0..1.
 */
function acidBar(v: Voices, out: AudioNode, d: number, q: number, pat: AcidStep[], root: number, openAt: (s: number) => number, vol: number, wave: OscillatorType, upTo = 16) {
  const ctx = v.ctx;
  const t0 = v.at(d);
  const o = ctx.createOscillator();
  o.type = wave;
  const f1 = ctx.createBiquadFilter();
  f1.type = 'lowpass';
  const f2 = ctx.createBiquadFilter();
  f2.type = 'lowpass';
  f2.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(f1).connect(f2).connect(g).connect(out);
  let held = false;
  for (let s = 0; s < upTo; s++) {
    const st = pat[s];
    const t = t0 + s * q;
    if (!st) {
      held = false;
      continue;
    }
    const f = mtof(root + st.n);
    const op = openAt(s);
    const cut = 150 + 2600 * op * op;
    const lvl = vol * (st.acc ? 1 : 0.62);
    if (held) {
      o.frequency.setTargetAtTime(f, t - q * 0.15, 0.02);
      if (st.acc) g.gain.setTargetAtTime(lvl, t, 0.01);
    } else {
      o.frequency.setValueAtTime(f, t);
      const top = Math.min(11000, cut * (1 + (st.acc ? 4.5 : 2.4) * (0.5 + op)));
      const dec = st.acc ? 0.045 : 0.085;
      f1.frequency.setValueAtTime(top, t);
      f1.frequency.setTargetAtTime(cut, t + 0.004, dec);
      f2.frequency.setValueAtTime(top * 1.5, t);
      f2.frequency.setTargetAtTime(cut * 1.5, t + 0.004, dec);
      g.gain.setTargetAtTime(lvl, t, 0.0015);
    }
    f1.Q.setValueAtTime((8 + 12 * op) * (st.acc ? 1.15 : 1), t);
    const slide = st.sl && s < upTo - 1 && !!pat[s + 1];
    if (!slide) g.gain.setTargetAtTime(0, t + q * 0.55, 0.007);
    held = slide;
  }
  o.start(t0);
  o.stop(t0 + upTo * q + 0.1);
}

/** Per-chain techno buses: the driven kick, the rumble reverb with its sidechain. */
interface TechBus {
  kick: GainNode;
  /** Highpass on the kick, swept up during the builds so the drop hits twice as hard. */
  kickHp: BiquadFilterNode;
  /** Kick into the rumble reverb (level per section). */
  send: GainNode;
  /** Rumble reverb input for the rolling sub. */
  verb: GainNode;
  /** Sidechain on the rumble: ducks on every kick. */
  duck: GainNode;
  /** Splits a stab into the base (dry) and the echo. */
  stab: GainNode;
}
const TECH = new WeakMap<Chain, TechBus>();

/** A dark, mostly low impulse response: two seconds of decaying, smoothed noise. */
function rumbleIR(ctx: BaseAudioContext) {
  const len = Math.floor(ctx.sampleRate * 2.2);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const x = b.getChannelData(0);
  let lp = 0;
  for (let j = 0; j < len; j++) {
    const t = j / ctx.sampleRate;
    lp += 0.08 * (Math.random() * 2 - 1 - lp);
    x[j] = t < 0.012 ? 0 : lp * Math.exp(-t / 0.5);
  }
  return b;
}

function techBus(v: Voices, c: Chain): TechBus {
  let tb = TECH.get(c);
  if (tb) return tb;
  const ctx = v.ctx;
  const kick = ctx.createGain();
  const ws = ctx.createWaveShaper();
  ws.curve = driveCurve(1.8);
  const kickHp = ctx.createBiquadFilter();
  kickHp.type = 'highpass';
  kickHp.frequency.value = 20;
  kickHp.Q.value = 0.8;
  const kg = ctx.createGain();
  kg.gain.value = 0.1;
  kick.connect(ws).connect(kickHp).connect(kg).connect(c.lp);

  // Rumble: kick + rolling sub, driven, into a dark reverb; only the low end survives, and it
  // breathes against the kick.
  const verb = ctx.createGain();
  const send = ctx.createGain();
  send.gain.value = 0;
  ws.connect(send).connect(verb);
  const pre = ctx.createWaveShaper();
  pre.curve = driveCurve(3);
  const conv = ctx.createConvolver();
  conv.buffer = rumbleIR(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 34;
  const wet = ctx.createGain();
  wet.gain.value = 0.02;
  const duck = ctx.createGain();
  verb.connect(pre).connect(conv).connect(hp).connect(wet).connect(duck).connect(c.rumble);

  const stab = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.55;
  stab.connect(dry).connect(c.lp);
  stab.connect(c.echo);
  tb = { kick, kickHp, send, verb, duck, stab };
  TECH.set(c, tb);
  return tb;
}

/** 909-style kick: a sine swept down from a click to ~45 Hz, plus a noise click and the MFB-512 kick. */
function kick909(v: Voices, tb: TechBus, d: number, vel: number, spb: number) {
  const ctx = v.ctx;
  const t = v.at(d);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(320, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.014);
  o.frequency.exponentialRampToValueAtTime(56, t + 0.07);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.0015);
  g.gain.setTargetAtTime(0, t + 0.05, 0.12);
  o.connect(g).connect(tb.kick);
  o.start(t);
  o.stop(t + 0.8);
  const n = ctx.createBufferSource();
  n.buffer = v.noiseBuffer;
  const nf = ctx.createBiquadFilter();
  nf.type = 'highpass';
  nf.frequency.value = 2200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vel * 0.45, t);
  ng.gain.setTargetAtTime(0, t, 0.003);
  n.connect(nf).connect(ng).connect(tb.kick);
  n.start(t, Math.random() * 1.5);
  n.stop(t + 0.03);
  v.hit('mfb', 'kick', d, tb.kick, { vel: vel * 0.9, gain: 0.32 });
  // The rumble ducks out of the kick's way and swells back before the next one.
  tb.duck.gain.setTargetAtTime(0.04, t, 0.004);
  tb.duck.gain.setTargetAtTime(1, t + spb * 0.1, spb * 0.22);
}

/** The rolling sub: off-beat sixteenths at F1, one mono voice per bar, into the rumble reverb and dry. */
function rollingSub(v: Voices, tb: TechBus, d: number, q: number, steps: number[], midi: number, vol: number) {
  const ctx = v.ctx;
  const t0 = v.at(d);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = mtof(midi);
  const g = ctx.createGain();
  g.gain.value = 0;
  for (const s of steps) {
    const t = t0 + s * q;
    const accent = s % 4 === 2 ? 1 : 0.7;
    g.gain.setTargetAtTime(vol * accent, t, 0.003);
    g.gain.setTargetAtTime(0, t + q * 0.6, 0.012);
  }
  o.connect(g);
  g.connect(tb.verb);
  g.connect(tb.duck);
  o.start(t0);
  o.stop(t0 + 16 * q + 0.1);
}

/**
 * One bar of 909-style hats: six square waves at inharmonic ratios plus a little noise, through
 * a bandpass and a highpass, one VCA so a closed hat chokes the open one. hits: [step, vel, open].
 */
function hats909(v: Voices, out: AudioNode, d: number, q: number, hits: [number, number, boolean][], pan = 0.25) {
  if (!hits.length) return;
  const ctx = v.ctx;
  const t0 = v.at(d);
  const end = t0 + 16 * q + 0.5;
  const mix = ctx.createGain();
  mix.gain.value = 0.2;
  const srcs: AudioScheduledSourceNode[] = [];
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f * 1.17;
    o.connect(mix);
    srcs.push(o);
  }
  const n = ctx.createBufferSource();
  n.buffer = v.noiseBuffer;
  n.loop = true;
  const ng = ctx.createGain();
  ng.gain.value = 0.22;
  n.connect(ng);
  srcs.push(n);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  bp.Q.value = 0.8;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const vca = ctx.createGain();
  vca.gain.value = 0;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  mix.connect(bp);
  ng.connect(bp);
  bp.connect(hp).connect(vca).connect(p).connect(out);
  for (const [s, vel, open] of hits) {
    // A touch of 909 shuffle on the off-sixteenths.
    const t = t0 + (s + (s % 2 ? 0.06 : 0)) * q + hum(1.5);
    vca.gain.setTargetAtTime(vel, t, 0.0006);
    vca.gain.setTargetAtTime(0, t + 0.004, open ? 0.1 : 0.017 + vel * 0.012);
  }
  for (const x of srcs) {
    if (x === n) n.start(t0, Math.random());
    else x.start(t0);
    x.stop(end);
  }
}

/** A dub chord stab: detuned saws through one lowpass that closes fast, dry into the base and into the echo. */
function dubStab(v: Voices, out: AudioNode, midis: number[], d: number, vol: number, open = 1400) {
  const ctx = v.ctx;
  const t = v.at(d);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 4;
  f.frequency.setValueAtTime(open, t);
  f.frequency.exponentialRampToValueAtTime(240, t + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.06, 0.08);
  f.connect(g).connect(out);
  for (const m of midis)
    for (const det of [-11, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.5);
    }
}

/** Pitch riser for the builds: a saw climbing two octaves through a bandpass, swelling up. */
function riser(v: Voices, out: AudioNode, d: number, dur: number, vol: number) {
  const ctx = v.ctx;
  const t = v.at(d);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(mtof(T_ROOT + 12), t);
  o.frequency.exponentialRampToValueAtTime(mtof(T_ROOT + 48), t + dur);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(6000, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.98);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Dub stab voicings (minor 9 without the fifth, and a Db major 7 for the deep section). */
const STAB_FM9 = [0, 3, 10, 14].map((x) => T_ROOT + 12 + x);
const STAB_DB = [-4, 0, 3, 7].map((x) => T_ROOT + 12 + x);

function technoBar(v: Voices, bar: number, d: number, spb: number, c: Chain) {
  const i = bar % TECH_BARS;
  const si = i >> 4;
  const sec = TECH_FORM[si];
  const k = i % 16;
  const q = spb / 4;
  const T = (s: number, ms = 2) => d + s * q + hum(ms);
  const tb = techBus(v, c);
  const B: AudioNode = c.lp;
  const L: AudioNode = c.layer;
  const t0 = v.at(d);
  const isBreak = sec === 'break' || sec === 'break2';
  const breakdown = isBreak && k < 8;
  const build = isBreak && k >= 8;
  const drop = sec === 'drop' || sec === 'drop2';
  const peak = sec === 'peak' || sec === 'peak2' || drop;
  const hyp = sec === 'hypno' || sec === 'deep';
  const outro = sec === 'drop2' && k >= 12; // thinning out into the next intro
  const lastBeatOff = build && k === 15; // a breath before the drop
  // In the peaks the root steps down to Db for the last two bars of every eight.
  const root = (peak && !drop && k % 8 >= 6) || (sec === 'drop2' && k % 8 === 7) ? T_ROOT - 4 : T_ROOT;

  // ---- Crashes, the drop ----
  if (k === 0 && (peak || sec === 'deep' || sec === 'groove')) {
    v.hit('clash', 'crash', d, L, { vel: drop ? 0.85 : 0.6, gain: 0.5, pan: -0.3 });
    v.hit('mfb', 'cymbal', d, L, { vel: 0.7, gain: 0.3, pan: 0.3 });
  }
  if (drop && k === 0) {
    // The drop: the kick opens fully again, a sub falls under it, the air rushes out.
    tb.kickHp.frequency.cancelScheduledValues(t0);
    tb.kickHp.frequency.setValueAtTime(20, t0);
    v.tone(95, 1.6, 'sine', 0.32, d, 34, B, 0.004);
    wash(v, L, d, spb * 4, 0.05, 7000, 300, 'lowpass', 0.8, 0.02);
  }

  // ---- Kick (base) ----
  const kickOn = !breakdown;
  if (kickOn)
    for (let b = 0; b < 4; b++) {
      if (lastBeatOff && b === 3) continue;
      kick909(v, tb, T(b * 4, 1), b === 0 ? 1 : 0.95, spb);
    }
  if (build && k === 8) {
    // The kick comes back thin and fills out at the drop.
    tb.kickHp.frequency.setValueAtTime(20, t0);
    tb.kickHp.frequency.exponentialRampToValueAtTime(260, t0 + spb * 31);
  }

  // ---- Rumble (base): how much kick goes into the reverb, and the rolling sub ----
  const rum = breakdown ? 0 : sec === 'intro' ? (k < 8 ? 0.25 : 0.5) : hyp ? 1 : build ? 0.4 : outro ? 0.5 : 0.8;
  tb.send.gain.setTargetAtTime(rum, t0, 0.3);
  const subOn = kickOn && !(build && k >= 12) && !(sec === 'intro' && k < 8);
  if (subOn) {
    const steps = hyp || sec === 'peak2' ? [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15] : [2, 3, 6, 7, 10, 11, 14, 15];
    rollingSub(v, tb, d, q, lastBeatOff ? steps.filter((s) => s < 12) : steps, root - 12, hyp ? 0.1 : 0.08);
  }

  // ---- Hats (stage): closed sixteenths, open on the offbeats ----
  const hatsOn = !(breakdown && k < 4) && !(build && k >= 14);
  if (hatsOn) {
    const hits: [number, number, boolean][] = [];
    const full = !(sec === 'intro' && k < 8) && !breakdown;
    const openHats = peak || sec === 'deep' || (sec === 'groove' && k >= 8) || (sec === 'hypno' && k >= 8) || build;
    for (let s = 0; s < 16; s++) {
      if (lastBeatOff && s >= 12) break;
      const off = s % 4 === 2;
      if (off) hits.push([s, openHats ? 0.55 : 0.5, openHats]);
      else if (full) hits.push([s, s % 2 ? 0.2 + rnd(0, 0.06) : 0.3 + rnd(0, 0.06), false]);
    }
    hats909(v, L, d, q, hits, 0.22);
    // In the peaks the sampled MFB hats add grit on the offbeats.
    if (peak) for (const s of [2, 6, 10, 14]) if (!(lastBeatOff && s > 12)) v.hit('mfb', 'hihat-closed', T(s, 1), L, { vel: 0.5, gain: 0.25, pan: -0.25 });
  }
  if (peak && !outro) for (const s of [2, 6, 10, 14]) v.hit('suscym', 'ride', T(s, 2), L, { vel: 0.4 + rnd(-0.05, 0.05), gain: 0.4, pan: -0.4 });

  // ---- Claps (base + stage) ----
  const clapOn = !breakdown && !lastBeatOff && !outro && ((sec === 'intro' && k >= 12) || sec === 'groove' || peak || sec === 'deep' || (sec === 'hypno' && k >= 8) || (build && k < 12));
  if (clapOn)
    for (const s of [4, 12]) {
      v.hit('mfb', 'clap', T(s, 2), B, { vel: 0.85, gain: 0.5, pan: -0.05 });
      v.hit('claps', 'clap', T(s, 3) + 0.004, L, { vel: 0.7, gain: 0.35, pan: 0.12 });
      if (hyp && s === 12 && k % 2) v.hit('mfb', 'clap', T(s, 2), c.echo, { vel: 0.6, gain: 0.3 });
    }

  // ---- Hypnotic toms: a three-step cycle against the four-to-the-floor, wandering in pitch ----
  if (hyp || (sec === 'peak2' && k < 8)) {
    const toms = ['tom-low', 'tom-mid', 'tom-low', 'tom-hi'];
    for (let s = 0; s < 16; s++) {
      const g = i * 16 + s;
      if (g % 3 !== 0) continue;
      const n = (g / 3) % 4;
      v.hit('mfb', toms[n], T(s, 2), L, { vel: 0.55 + (n === 0 ? 0.15 : 0), gain: 0.35, pan: Math.sin(g * 0.2) * 0.5, cents: -200 });
      if (n === 3 && sec === 'deep') v.hit('mfb', 'tom-hi', T(s, 2), c.echo, { vel: 0.5, gain: 0.25, cents: -200 });
    }
  }

  // ---- Industrial metal (stage, partly into the echo) ----
  if ((peak && !outro) || sec === 'deep') {
    if (sec !== 'deep') for (const s of [3, 11]) v.hit('brakedrum', 'hammer', T(s, 4), L, { vel: 0.4 + rnd(-0.08, 0.08), gain: 0.25, pan: -0.55 });
    if (k % 2 === 1) v.hit('anvil', pick(['a', 'b']), T(14, 4), c.echo, { vel: 0.5, gain: 0.18, pan: 0.55 });
    if (k % 8 === 7) v.hit('ratchet', 'fast', T(12), L, { vel: 0.55, gain: 0.3, pan: 0.4 });
  }

  // ---- Acid line (stage, driven) ----
  const acidOn =
    (sec === 'groove' && k >= 8) || sec === 'peak' || isBreak || drop || hyp || sec === 'peak2';
  if (acidOn && !outro) {
    const base = sec === 'drop' ? 1 : hyp ? 2 : sec === 'peak2' || sec === 'break2' || sec === 'drop2' ? 3 : 0;
    const phrase = i >> 3;
    // Mutations grow through a section, the first phrase of a section plays the riff plainly.
    const pat = acidPattern(base, phrase, (k >> 3) * 2 + (k % 8 === 7 ? 1 : 0) + (drop ? 1 : 0));
    // Hypno: the pattern turns by one step every four bars against the kick.
    const rot = sec === 'hypno' ? (k >> 2) % 16 : 0;
    const p = rot ? pat.map((_, s) => pat[(s + rot) % 16]) : pat;
    const wob = hyp ? 0.12 * Math.sin((2 * Math.PI * (i * 16)) / 48) : 0;
    const openAt = (s: number) => Math.max(0, Math.min(1, acidOpen(i + s / 16) + wob + (breakdown ? -0.05 : 0)));
    const vol = breakdown ? 0.12 : 0.15;
    acidBar(v, c.drive, d, q, p, root, openAt, vol, sec === 'hypno' || sec === 'peak2' ? 'square' : 'sawtooth', lastBeatOff ? 12 : 16);
  }

  // ---- Dub stabs (base + echo) ----
  const chordM = sec === 'deep' && k % 8 >= 4 ? STAB_DB : STAB_FM9;
  const stabAt: number[] = [];
  if (breakdown) {
    if (k % 2 === 0) stabAt.push(0);
    if (k % 4 === 2) stabAt.push(10);
  } else if (hyp) {
    // A cycle of ten sixteenths drifting across the bar lines.
    for (let s = 0; s < 16; s++) if ((i * 16 + s) % 10 === 3) stabAt.push(s);
  } else if (sec === 'groove' && k % 4 === 3) stabAt.push(14);
  else if (drop && !outro) stabAt.push(3, 6, 11);
  else if (peak && k % 2 === 1) stabAt.push(3, 10);
  for (const s of stabAt) {
    const open = breakdown ? 700 + k * 160 : hyp ? 900 + 600 * acidOpen(i) : drop ? 2200 : 1500;
    const m = breakdown && s === 10 ? chordM.map((x) => x - 2) : chordM;
    dubStab(v, tb.stab, m, T(s, 1), drop ? 0.028 : 0.034, open);
  }

  // ---- Breakdown pad: dark strings, pumping with the (silent) kick ----
  if (breakdown || (build && k < 12)) {
    const pv = (k % 4 < 2 ? [0, 3, 7, 10] : [-4, 0, 3, 7]).map((x) => T_ROOT + 12 + x);
    v.chord('strings', pv, T(0, 2), c.pump, { vel: 0.45, dur: spb * 4, att: 0.6, rel: 0.8, gain: 0.3, lp: 900 + k * 120, pan: -0.1 });
  }

  // ---- Builds: snare roll, clap roll, risers ----
  if (build) {
    roll(v, L, 'mfb', 'snare', d, spb, k - 8, 8, 0.35);
    if (k >= 12) roll(v, B, 'mfb', 'clap', d, spb, k - 8, 8, 0.15);
    if (k === 8) {
      wash(v, L, d, spb * 32, 0.06, 300, 11000, 'highpass', 1.2, 0.97);
      riser(v, L, d, spb * 31, 0.03);
    }
    if (k === 14) v.hit('suscym', 'swell', d, L, { vel: 0.6, gain: 0.45 });
  }
  if (breakdown && k === 0) wash(v, c.echo, d, spb * 8, 0.06, 6000, 200, 'bandpass', 2, 0.05);
  // Before the next record: a short tom fill on the last bar of the set.
  if (i === TECH_BARS - 1) for (const [s, a] of [[12, 'tom-hi'], [13, 'tom-mid'], [14, 'tom-low'], [15, 'tom-low']] as const) v.hit('mfb', a, T(s, 2), L, { vel: 0.7, gain: 0.4 });
}

// ---- Hip-hop floor: boom-bap ------------------------------------------------------------
//
// D minor, 88 bpm, swung sixteenths, 96 bars (~4.4 min) in eight-bar parts: intro, verse x2,
// hook (vibes melody, horn stabs), verse 2 x2 (Wurlitzer chops), break (drums, bass and
// scratches), hook, bridge x2 (vibes improvising over new changes), hook, outro verse. A dusty
// detuned piano/Wurli loop, upright bass, kick and snare are the base; hats, ghost notes,
// vibes, horns, scratches and vinyl crackle are the stage layer.

type HipSec = 'intro' | 'verse' | 'verse2' | 'hook' | 'break' | 'bridge';
const HIP_FORM: HipSec[] = ['intro', 'verse', 'verse', 'hook', 'verse2', 'verse2', 'break', 'hook', 'bridge', 'bridge', 'hook', 'verse'];
const HP_V = ['Dm9', 'Bbmaj7', 'Gm9', 'A7b9'];
const HP_H = ['Gm9', 'C9', 'Fmaj9', 'A7alt'];
const HP_B = ['Ebmaj7', 'Dm9', 'Gm9', 'A7b9'];
/** Vibes hook over Gm9 C9 Fmaj9 A7alt. */
const HIP_HOOK: Line[] = [
  [[0, 74, 3], [3, 77, 3], [6, 81, 4], [10, 79, 2], [12, 77, 4]],
  [[0, 76, 6], [6, 79, 2], [8, 82, 4], [12, 81, 4]],
  [[0, 81, 3], [3, 79, 3], [6, 76, 2], [8, 77, 4], [12, 72, 4]],
  [[0, 73, 6], [6, 76, 2], [8, 79, 3], [11, 77, 3], [14, 76, 2]],
];
/** Chop rhythms for the sampled-sounding chord loop: [16th step, length]. */
const CHOPS: [number, number][][] = [
  [[0, 6], [7, 2], [10, 4], [14, 2]],
  [[0, 3], [3, 4], [10, 3], [13, 3]],
];
/** Kick patterns (16th steps) for the two bars of a phrase. */
const HIP_KICK = [
  [0, 7, 10],
  [0, 3, 10, 15],
];
const SW = 0.2; // swing: the off-sixteenths sit 20% of a sixteenth late

/** A record scratch: a sung sample pushed back and forth, plus the needle's noise. */
function scratch(v: Voices, out: AudioNode, d: number, q: number, n = 4) {
  for (let j = 0; j < n; j++) {
    const fwd = j % 2 === 0;
    const len = q * (fwd ? 0.9 : 0.6);
    const at = d + j * q * 0.8;
    v.note('choir', fwd ? 62 : 69, at, out, { vel: 0.7, dur: len, rel: 0.02, att: 0.004, glide: fwd ? 9 : -9, lp: 3200, gain: 0.5, pan: 0.15 });
    v.noise(len, 0.05, at, fwd ? 1400 : 2600, 'bandpass', 2.5, out, fwd ? 3200 : 900);
  }
}

function hiphopBar(v: Voices, bar: number, d: number, spb: number, c: Chain) {
  const i = bar % 96;
  const sec = HIP_FORM[i >> 3];
  const k = i % 8;
  const q = spb / 4;
  const T = (s: number, ms = 7) => d + (s + (s % 2 ? SW : 0)) * q + hum(ms);
  const B: AudioNode = c.lp;
  const L: AudioNode = c.layer;
  const prog = sec === 'hook' ? HP_H : sec === 'bridge' ? HP_B : HP_V;
  const cd = chord(prog[k % 4]);
  const root = 26 + ((cd.root - 26) % 12 + 12) % 12; // D1..C#2 region, played an octave up on the upright
  const intro = sec === 'intro' && k < 2;
  const brk = sec === 'break';

  // ---- Vinyl: hiss (base) and crackle (stage), every bar ----
  wash(v, B, d, spb * 4 + 0.05, 0.012, 5000, 5200, 'bandpass', 0.4, 0.02);
  for (let j = 0; j < 14; j++) v.noise(0.003 + Math.random() * 0.004, rnd(0.04, 0.16), d + Math.random() * spb * 4, rnd(2500, 7000), 'highpass', 1, L);

  // ---- Drums ----
  if (!intro) {
    const kicks = brk && k % 2 ? [0, 10] : HIP_KICK[k % 2];
    for (const s of kicks) {
      v.hit('lm2', 'kick', T(s, 4), B, { vel: s === 0 ? 0.95 : 0.82, gain: 0.3 });
      v.hit('tr808', 'bd5050', T(s, 4), B, { vel: 0.7, gain: 0.15 });
    }
    if (!(brk && k < 4))
      for (const s of [4, 12]) {
        v.hit('lm2', 'snare-l', T(s, 5), B, { vel: 0.9, gain: 0.3 });
        v.hit('snare', 's', T(s, 5) + 0.004, B, { vel: 0.7, gain: 0.25, pan: 0.05 });
      }
    // Ghost notes and a late snare drag before the turnaround.
    v.hit('snare', 'tap', T(pick([7, 9, 15]), 8), L, { vel: 0.3, gain: 0.35, pan: 0.1 });
    if (k % 4 === 3) v.hit('lm2', 'snare-m', T(15, 4), L, { vel: 0.5, gain: 0.35 });
    // Hats: swung eighths with sixteenth pickups, an open hat closing the phrase.
    for (let s = 0; s < 16; s++) {
      const on = s % 2 === 0 || (s % 4 === 3 && Math.random() < 0.35);
      if (!on) continue;
      if (k % 4 === 3 && s === 14) {
        v.hit('hihat', 'o', T(s), L, { vel: 0.45, gain: 0.45, pan: 0.3 });
        continue;
      }
      v.hit('hihat', 'c', T(s), L, { vel: (s % 4 === 0 ? 0.42 : 0.3) + rnd(-0.06, 0.06), gain: 0.8, pan: 0.3 });
    }
  }

  // ---- Upright bass (base) ----
  if (!intro) {
    const pat: Line =
      sec === 'verse2' || sec === 'bridge'
        ? [[0, root + 12, 5], [6, root + 12, 2], [8, root + 19, 2], [10, root + 12, 3], [14, nearest((chord(prog[(k + 1) % 4]).root + 1) % 12, root + 12), 2]]
        : [[0, root + 12, 6], [7, root + 12, 2], [10, root + 12, 4], [14, root + 19 > 50 ? root + 7 : root + 19, 2]];
    for (const [s, m, len] of pat) v.note('bass', Math.min(55, Math.max(28, m)), T(s, 6), B, { vel: s === 0 ? 0.9 : 0.75, dur: len * q * 0.9, rel: 0.08, gain: 0.4 });
  }

  // ---- The dusty chord loop (base) ----
  const loopOn = !(brk && k < 6);
  if (loopOn) {
    const inst: InstId = sec === 'verse2' ? 'wurli' : 'piano';
    const vo = voice(cd, c.comp, 55, 74);
    c.comp = vo.reduce((a, b) => a + b, 0) / vo.length;
    const tape = rnd(-14, -6); // a slightly flat, wobbly record
    const lp = intro || brk ? 900 : inst === 'wurli' ? 3000 : 2400;
    const pat = CHOPS[sec === 'verse2' || sec === 'bridge' ? 1 : 0];
    for (const [s, len] of pat) v.chord(inst, vo, T(s, 4), B, { vel: s === 0 ? 0.62 : 0.5, dur: len * q * 0.9, rel: 0.1, gain: inst === 'wurli' ? 0.6 : 0.5, lp, cents: tape, pan: -0.2 }, 0.006);
    if (inst === 'piano') v.note('piano', vo[vo.length - 1] + 12, T(0, 4), B, { vel: 0.4, dur: spb * 1.4, lp, cents: tape, gain: 0.4, pan: -0.2 });
  }

  // ---- Vibes: the hook, or an improvised line in the bridge (stage) ----
  if (sec === 'hook')
    for (const [s, m, len] of HIP_HOOK[k % 4]) v.note('vibes', m, T(s, 6), L, { vel: 0.62 + rnd(-0.05, 0.05), dur: len * q * 1.1, rel: 0.5, gain: 0.55, pan: 0.3 });
  if (sec === 'bridge' && k >= 2) {
    const ev = improvise([cd], [4], c.solo, 67, 84, 0.45);
    for (const e of ev) v.note('vibes', e.midi, d + e.at * spb + (e.at % 1 ? SW * 0.5 * spb : 0) + hum(6), L, { vel: e.vel, dur: e.dur * spb, rel: 0.4, gain: 0.5, pan: 0.3 });
  }

  // ---- Horn stabs, now and then (stage) ----
  const horns = (sec === 'hook' && (k === 0 || k === 4 || (k % 4 === 3 && i >= 80))) || (sec === 'verse' && i >= 88 && k % 2 === 0) || (sec === 'bridge' && k === 7);
  if (horns) {
    const hv = voice(cd, 70, 62, 79).slice(-3);
    const hit = (s: number, len: number, fall = false) => {
      hv.slice(1).forEach((m) => v.note('trumpet', m, T(s, 5), L, { vel: 0.75, dur: len * q, rel: 0.08, gain: 0.4, pan: -0.3, glide: fall ? -3 : 0 }));
      v.note('trombone', hv[0] - 12, T(s, 5), L, { vel: 0.75, dur: len * q, rel: 0.08, gain: 0.45, pan: 0.35, glide: fall ? -3 : 0 });
    };
    hit(0, 2);
    hit(3, 3, Math.random() < 0.5);
  }

  // ---- Scratches (stage) ----
  if ((brk && k % 2 === 1) || (k === 7 && sec !== 'intro' && sec !== 'bridge')) scratch(v, L, T(12, 2), q, brk ? 6 : 4);
  if (brk && k === 0) scratch(v, L, T(0, 2), q, 8);
}

// ---- Club props: one-shots -----------------------------------------------------------

/** Detuned saw cluster through a drive and a presence peak (the sound-system air horn). */
function hornBlast(v: Voices, out: AudioNode, d: number, len: number, base: number, fall: boolean) {
  const ctx = v.ctx;
  const t = v.at(d);
  const peakF = ctx.createBiquadFilter();
  peakF.type = 'peaking';
  peakF.frequency.value = 1800;
  peakF.gain.value = 7;
  peakF.Q.value = 1;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5500;
  const ws = ctx.createWaveShaper();
  ws.curve = driveCurve(3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.012);
  g.gain.setValueAtTime(0.22, t + len - 0.04);
  g.gain.linearRampToValueAtTime(0, t + len);
  ws.connect(peakF).connect(lp).connect(g).connect(out);
  for (const r of [1, 1.006, 1.26, 1.266, 0.5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = base * r;
    o.frequency.setValueAtTime(f * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    if (fall) {
      o.frequency.setValueAtTime(f, t + len * 0.55);
      o.frequency.exponentialRampToValueAtTime(f * 0.86, t + len);
    }
    const og = ctx.createGain();
    og.gain.value = r === 0.5 ? 0.35 : 0.25;
    o.connect(og).connect(ws);
    o.start(t);
    o.stop(t + len + 0.05);
  }
}

/** Little one-shots for the club props. */
export function clubFx(v: Voices, kind: string, out: AudioNode) {
  void v.need(...FX_NEED);
  const ctx = v.ctx;
  const vary = rnd(0.97, 1.03);
  switch (kind) {
    case 'airhorn': {
      // BAP BAP BAAAAP, with a dub echo trailing behind.
      const echo = ctx.createDelay(1);
      echo.delayTime.value = 0.27;
      const fb = ctx.createGain();
      fb.gain.value = 0.33;
      const eg = ctx.createGain();
      eg.gain.value = 0.35;
      const send = ctx.createGain();
      echo.connect(fb).connect(echo);
      echo.connect(eg).connect(out);
      send.connect(out);
      send.connect(echo);
      const f = 466 * vary;
      hornBlast(v, send, 0, 0.16, f, false);
      hornBlast(v, send, 0.2, 0.16, f, false);
      hornBlast(v, send, 0.4, 0.75, f, true);
      setTimeout(() => {
        try {
          send.disconnect();
          echo.disconnect();
        } catch {
          /* already gone */
        }
      }, 4000);
      return;
    }
    case 'rewind': {
      // The selector pulls the record back: a pitch zooming up, wobbling, then dropping out.
      const t = v.at(0);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180 * vary, t);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.45);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.75);
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(14, t);
      lfo.frequency.linearRampToValueAtTime(28, t + 0.7);
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(600, t);
      f.frequency.exponentialRampToValueAtTime(3500, t + 0.45);
      f.frequency.exponentialRampToValueAtTime(300, t + 0.75);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.05);
      g.gain.setValueAtTime(0.32, t + 0.6);
      g.gain.linearRampToValueAtTime(0, t + 0.78);
      const am = ctx.createGain();
      am.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      o.connect(f).connect(am).connect(g).connect(out);
      for (const x of [o, lfo]) {
        x.start(t);
        x.stop(t + 0.85);
      }
      wash(v, out, 0, 0.75, 0.3, 900, 6000, 'bandpass', 2, 0.6);
      v.noise(0.05, 0.4, 0.76, 2500, 'bandpass', 1.5, out);
      return;
    }
    case 'drop': {
      // Riser, a beat of silence, then the impact: 808, crash and a falling sub.
      wash(v, out, 0, 1.05, 0.14, 300, 9000, 'highpass', 1.2, 0.97);
      v.tone(220, 1.0, 'sawtooth', 0.025, 0, 880, out, 0.6);
      v.hit('tr808', 'bd7550', 1.12, out, { vel: 1, gain: 1.1 });
      v.hit('lm2', 'kick', 1.12, out, { vel: 0.9, gain: 0.8 });
      v.hit('clash', 'crash', 1.12, out, { vel: 0.85, gain: 0.7, pan: 0.2 });
      v.tone(62, 1.1, 'sine', 0.45, 1.12, 34, out, 0.004);
      wash(v, out, 1.12, 1.2, 0.06, 6000, 400, 'lowpass', 0.7, 0.03);
      return;
    }
    case 'bass': {
      // An 808 bass riff that shakes the floor: A, A, E, G.
      const notes = [33, 33, 28, 31];
      notes.forEach((m, j) => {
        const dl = j * 0.18;
        v.tone(mtof(m) * 1.5, 0.3, 'sine', 0.42, dl, mtof(m), out, 0.003);
        v.tone(mtof(m) * 2, 0.12, 'triangle', 0.08, dl, mtof(m) * 1.5, out, 0.002);
        v.hit('tr808', 'bd5050', dl, out, { vel: 0.7, gain: 0.6 });
      });
      return;
    }
    case 'lights': {
      // A heavy relay clunk, the tubes buzzing up and a little sparkle.
      v.hit('lm2', 'stick-h', 0, out, { vel: 0.9, gain: 1.2 });
      v.noise(0.03, 0.45, 0, 1200, 'bandpass', 2, out);
      v.tone(100 * vary, 0.35, 'sawtooth', 0.06, 0.04, undefined, out, 0.02);
      v.noise(0.35, 0.08, 0.04, 3000, 'bandpass', 3, out);
      v.bell(2637 * vary, 0.09, 0.12, 0.5, out);
      v.bell(3520 * vary, 0.08, 0.2, 0.6, out);
      return;
    }
    case 'fog':
      // The fog machine: a pump thump, then a pressurised hiss that swells and settles.
      v.tone(70, 0.18, 'sine', 0.5, 0, 45, out, 0.004);
      wash(v, out, 0.05, 1.6, 0.33, 900, 3500, 'bandpass', 0.7, 0.15);
      wash(v, out, 0.05, 1.4, 0.12, 6000, 9000, 'highpass', 0.7, 0.2);
      return;
    case 'sneaker':
      // Two rubber squeaks on the polished floor.
      for (let j = 0; j < 2; j++) {
        const f = rnd(2300, 2900);
        const dl = j * rnd(0.1, 0.14);
        v.tone(f, 0.07, 'triangle', 0.24, dl, f * rnd(1.15, 1.35), out, 0.005);
        v.tone(f * 2, 0.06, 'sine', 0.08, dl, f * 2.5, out, 0.005);
        v.noise(0.06, 0.15, dl, f, 'bandpass', 6, out);
      }
      return;
    case 'chain':
      // A dangling chain: a burst of metal links clinking, thinning out.
      for (let j = 0; j < 9; j++) {
        const dl = Math.pow(j / 9, 1.6) * 0.45 + rnd(0, 0.015);
        const vol = 0.22 * (1 - j / 12);
        v.bell(rnd(2200, 4200), vol, dl, rnd(0.12, 0.3), out);
        v.noise(0.012, vol * 1.6, dl, rnd(4000, 7000), 'bandpass', 3, out);
      }
      return;
  }
}
