// All sound is synthesised with WebAudio (no audio files): effects, room ambience and a
// small generative lounge band. Everything starts after the first click (browser rule).

import { CLUB_BPM, ClubMix, clubFx, type Voices } from './clubMusic';

const MUTE_KEY = 'nachtfalter.muted';
const MUSIC_KEY = 'nachtfalter.music';

type Scene = 'off' | 'menu' | 'casino' | 'game';

const MOODS = ['foyer', 'velvet', 'garden', 'clockwork', 'crystal', 'throne', 'street', 'club', 'techno', 'hiphop'] as const;
type Mood = (typeof MOODS)[number];

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Effects bus, with a send into the reverb. */
  private fx: GainNode | null = null;
  private verbSend: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  musicOn = true;
  private scene: Scene = 'off';
  private musicTimer = 0;
  private nextBeat = 0;
  private beat = 0;
  private ambNodes: AudioNode[] = [];
  private ambTimer = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
      this.musicOn = localStorage.getItem(MUSIC_KEY) !== '0';
    } catch {
      /* ignore */
    }
  }

  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      // Safety limiter after the glue compressor: hard knee at -3 dBFS, so loud club nights
      // plus big-win effects never clip. The trim cancels Chrome's automatic makeup gain.
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -3;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.12;
      const limTrim = ctx.createGain();
      limTrim.gain.value = Math.pow(10, (-0.6 * (3 - 3 / 20)) / 20);
      comp.connect(lim).connect(limTrim).connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(comp);

      // Small room reverb from a generated impulse response.
      const verb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 1.8);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      verb.buffer = ir;
      const verbOut = ctx.createGain();
      verbOut.gain.value = 0.35;
      verb.connect(verbOut).connect(this.master);
      this.verbSend = ctx.createGain();
      this.verbSend.gain.value = 1;
      this.verbSend.connect(verb);

      this.fx = ctx.createGain();
      this.fx.gain.value = 0.8;
      this.fx.connect(this.master);
      const fxSend = ctx.createGain();
      fxSend.gain.value = 0.25;
      this.fx.connect(fxSend).connect(this.verbSend);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.0001 : 0;
      this.musicBus.connect(this.master);
      const mSend = ctx.createGain();
      mSend.gain.value = 0.4;
      this.musicBus.connect(mSend).connect(this.verbSend);

      this.ambBus = ctx.createGain();
      this.ambBus.gain.value = 0;
      this.ambBus.connect(this.master);

      const nl = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, nl, ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;

      if (this.scene !== 'off') {
        const s = this.scene;
        this.scene = 'off';
        this.setScene(s);
      }
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    try {
      localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    this.applyMusicLevel();
  }

  // ---- Building blocks --------------------------------------------------

  /** One enveloped oscillator voice. */
  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.5,
    delay = 0,
    slideTo?: number,
    out: AudioNode | null = this.fx,
    attack = 0.008,
  ) {
    if (!this.ctx || !out) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Filtered noise burst. */
  private noise(dur: number, vol = 0.3, delay = 0, freq = 2000, type: BiquadFilterType = 'bandpass', q = 1, out: AudioNode | null = this.fx, sweepTo?: number) {
    if (!this.ctx || !out || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** Metallic bell (inharmonic partials): coins, chimes. */
  private bell(freq: number, vol = 0.2, delay = 0, dur = 0.6, out: AudioNode | null = this.fx) {
    this.tone(freq, dur, 'sine', vol, delay, undefined, out, 0.002);
    this.tone(freq * 2.76, dur * 0.5, 'sine', vol * 0.45, delay, undefined, out, 0.002);
    this.tone(freq * 5.4, dur * 0.25, 'sine', vol * 0.25, delay, undefined, out, 0.002);
  }

  // ---- UI ---------------------------------------------------------------

  click() {
    this.noise(0.03, 0.25, 0, 3500, 'bandpass', 3);
    this.tone(1200, 0.05, 'triangle', 0.08);
  }
  hover() {
    this.tone(1800, 0.03, 'sine', 0.03);
  }
  /** Two clay chips clacking. */
  chip() {
    this.noise(0.04, 0.5, 0, 3200, 'bandpass', 6);
    this.noise(0.05, 0.35, 0.045, 2600, 'bandpass', 6);
    this.tone(2400, 0.04, 'triangle', 0.06, 0.01);
  }
  tick() {
    this.noise(0.018, 0.18, 0, 4200, 'bandpass', 4);
  }
  /** A reel slamming to a stop. */
  thud() {
    this.tone(120, 0.22, 'sine', 0.55, 0, 55);
    this.noise(0.06, 0.4, 0, 900, 'lowpass', 1);
    this.noise(0.03, 0.2, 0, 3000, 'bandpass', 4);
  }
  whoosh() {
    this.noise(0.4, 0.22, 0, 400, 'bandpass', 1.2, this.fx, 3000);
  }
  /** Lever pull: ratchet clicks, then the reels start. */
  spinStart() {
    for (let i = 0; i < 5; i++) this.noise(0.02, 0.2, i * 0.035, 3000 - i * 200, 'bandpass', 5);
    this.tone(180, 0.3, 'sawtooth', 0.06, 0.15, 520);
    this.noise(0.3, 0.12, 0.15, 600, 'bandpass', 1, this.fx, 2500);
  }
  ballRoll(duration: number) {
    if (!this.ctx || !this.fx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(900, t + duration);
    f.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.2);
    g.gain.setValueAtTime(0.16, t + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    // Wobble like a ball rattling round the track.
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.setValueAtTime(14, t);
    lfo.frequency.linearRampToValueAtTime(4, t + duration);
    lg.gain.value = 0.06;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.fx);
    src.start(t);
    lfo.start(t);
    src.stop(t + duration + 0.1);
    lfo.stop(t + duration + 0.1);
    // Clattering into the pocket at the end.
    for (let i = 0; i < 6; i++) this.noise(0.025, 0.3 * (1 - i / 7), duration - 0.5 + i * (0.06 + i * 0.02), 3800, 'bandpass', 6);
  }
  coin(delay = 0) {
    this.bell(2100 + Math.random() * 500, 0.1, delay, 0.35);
  }
  /** Small win: a bright bell arpeggio. */
  win() {
    [784, 988, 1175, 1568].forEach((f, i) => this.bell(f, 0.13, i * 0.07, 0.7));
    this.tone(392, 0.5, 'triangle', 0.1, 0.05);
  }
  /** Big win: brassy chord stabs, bells and a shower of coins. */
  bigWin() {
    const chord = [523, 659, 784, 1047];
    for (const [k, d] of [[0, 0], [1, 0.22], [2, 0.44]] as const) {
      const lift = [1, 1.122, 1.335][k];
      for (const f of chord) {
        this.tone(f * lift, 0.35, 'sawtooth', 0.035, d, undefined, this.fx, 0.02);
        this.tone(f * lift, 0.4, 'triangle', 0.07, d);
      }
    }
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.bell(f, 0.1, 0.66 + i * 0.06, 0.9));
    this.tone(131, 0.8, 'triangle', 0.25, 0.66);
    for (let i = 0; i < 18; i++) this.coin(0.7 + i * 0.06 + Math.random() * 0.04);
  }
  /** Rising notes as winning lines light up one after another. */
  lineHit(i: number) {
    const f = 523 * Math.pow(2, (i * 3) / 12);
    this.bell(f, 0.14, 0, 0.5);
    this.tone(f / 2, 0.25, 'triangle', 0.08);
  }
  /** Building suspense while the last reel is still spinning. */
  tension(duration: number) {
    const n = Math.floor(duration * 8);
    for (let i = 0; i < n; i++) {
      this.tone(220 * Math.pow(2, i / 24), 0.1, 'square', 0.025, i / 8);
      this.noise(0.05, 0.05 + (i / n) * 0.08, i / 8, 6000, 'highpass', 1);
    }
  }
  /** Soft note for getting part of the stake back. */
  partial() {
    this.bell(880, 0.07, 0, 0.4);
  }
  lose() {
    this.tone(392, 0.18, 'triangle', 0.09, 0, 370);
    this.tone(330, 0.3, 'triangle', 0.08, 0.14, 300);
  }
  medal() {
    [392, 523, 659, 784].forEach((f, i) => {
      this.tone(f, 0.5, 'sawtooth', 0.03, i * 0.11, undefined, this.fx, 0.02);
      this.tone(f, 0.55, 'triangle', 0.12, i * 0.11);
    });
    [1047, 1319, 1568, 2093].forEach((f) => this.tone(f, 1.4, 'triangle', 0.06, 0.48));
    [2093, 2637, 3136].forEach((f, i) => this.bell(f, 0.06, 0.5 + i * 0.08, 1.2));
    this.noise(1.2, 0.05, 0.5, 7000, 'highpass', 1);
  }
  /** Gentle, not punishing: the season ends. */
  seasonOver() {
    [[440, 0], [392, 0.35], [349, 0.7], [330, 1.05]].forEach(([f, d]) => this.tone(f, 0.9, 'triangle', 0.1, d));
    this.tone(165, 2, 'sine', 0.12, 1.05);
  }
  /** Heavy casino door with a little chime. */
  door() {
    this.noise(0.5, 0.18, 0, 300, 'lowpass', 1);
    this.tone(90, 0.4, 'sine', 0.2, 0.05, 60);
    this.bell(1568, 0.06, 0.12, 0.8);
    this.bell(2093, 0.05, 0.2, 0.8);
  }
  /** Brass elevator doors sliding, with a soft thump at the end. */
  elevatorDoor() {
    this.noise(0.7, 0.07, 0, 900, 'bandpass', 2, this.fx, 500);
    this.tone(70, 0.25, 'sine', 0.15, 0.62, 50);
    this.noise(0.08, 0.12, 0.62, 400, 'lowpass', 1);
  }
  /** Floor button press: a click and a small lit-up tone. */
  elevatorButton() {
    this.noise(0.03, 0.2, 0, 2500, 'bandpass', 3);
    this.tone(1046, 0.12, 'triangle', 0.06, 0.02);
  }
  /** The ride: motor hum and cable rattle for `dur` seconds. */
  elevatorRide(dur: number, up: boolean) {
    this.tone(up ? 55 : 70, dur, 'sawtooth', 0.04, 0, up ? 70 : 55, this.fx, 0.4);
    this.tone(110, dur, 'sine', 0.06, 0, undefined, this.fx, 0.4);
    this.noise(dur, 0.04, 0, 250, 'lowpass', 1);
    for (let t = 0.3; t < dur - 0.2; t += 0.45 + Math.random() * 0.3) this.noise(0.04, 0.05, t, 1800, 'bandpass', 4);
  }
  /** Arrival ding. */
  elevatorDing() {
    this.bell(1318, 0.12, 0, 1.4);
    this.bell(1046, 0.1, 0.32, 1.6);
  }
  /** One piano note: a felt hammer, slightly detuned strings and partials that fade faster up high. */
  pianoNote(freq: number, vel = 1) {
    const len = Math.min(3.2, 2.6 * Math.pow(261.6 / freq, 0.45));
    const v = 0.11 * vel;
    this.tone(freq, len, 'triangle', v, 0, undefined, this.fx, 0.003);
    this.tone(freq * 1.0016, len * 0.9, 'sine', v * 0.7, 0, undefined, this.fx, 0.003);
    const parts = [0.5, 0.28, 0.16, 0.09, 0.05];
    parts.forEach((a, i) => this.tone(freq * (i + 2) * (1 + i * 0.0007), len / (1.6 + i * 0.8), 'sine', v * a, 0, undefined, this.fx, 0.002));
    this.noise(0.03, 0.05 * vel, 0, Math.min(6000, freq * 5), 'bandpass', 2);
  }
  /** Brass bell on the reception desk. */
  deskBell() {
    this.bell(2093, 0.14, 0, 1.6);
    this.noise(0.02, 0.15, 0, 4000, 'bandpass', 4);
  }
  /** A coin flicked into water. */
  wish() {
    this.bell(2637, 0.05, 0, 0.3);
    this.noise(0.25, 0.12, 0.55, 1200, 'bandpass', 1.5, this.fx, 400);
    this.tone(900, 0.12, 'sine', 0.05, 0.56, 300);
  }
  /** Bubbles in a glass. */
  fizz() {
    this.noise(0.8, 0.05, 0, 6000, 'highpass', 1);
    for (let i = 0; i < 8; i++) this.bell(1800 + Math.random() * 1600, 0.012, Math.random() * 0.7, 0.1);
  }
  clink() {
    this.bell(2093, 0.08, 0, 0.8);
    this.bell(2349, 0.06, 0.05, 0.8);
  }
  /** Westminster-like chime from a clock. */
  chime() {
    [659.3, 523.3, 587.3, 392].forEach((f, i) => this.bell(f, 0.1, i * 0.45, 1.6));
  }
  steamWhistle() {
    this.tone(880, 1.1, 'sine', 0.05, 0, 900, this.fx, 0.08);
    this.tone(1108, 1.1, 'sine', 0.04, 0, 1130, this.fx, 0.08);
    this.noise(1.2, 0.08, 0, 3500, 'bandpass', 1);
  }
  /** A gentle, magical shimmer. */
  shimmer() {
    [1046, 1318, 1568, 2093].forEach((f, i) => this.bell(f, 0.04, i * 0.08, 1));
  }
  /** Sternenhimmel: a shooting star streaks across the dome. */
  starFall() {
    this.noise(0.32, 0.07, 0, 5200, 'bandpass', 2, this.fx, 1400);
    this.tone(2600, 0.28, 'sine', 0.018, 0, 1300);
  }
  /** Sternenhimmel: a picked star is hit; the pitch climbs with every hit. */
  starHit(i: number) {
    const f = 587 * Math.pow(2, (i * 2) / 12);
    this.bell(f, 0.16, 0, 0.9);
    this.bell(f * 1.5, 0.07, 0.06, 0.6);
  }
  /** Kratzglück: a short burst of a coin scraping over the coating. */
  scratch() {
    this.noise(0.07, 0.06, 0, 2600 + Math.random() * 1800, 'bandpass', 1.4);
  }
  /** Glühwürmchen-Bingo: a firefly settles on a number. */
  firefly(hit: boolean) {
    this.bell(hit ? 1568 + Math.random() * 200 : 1175 + Math.random() * 300, hit ? 0.1 : 0.04, 0, hit ? 0.7 : 0.3);
  }
  /** The Moth Queen enters a new phase: a low drum, a dark minor stab and a wing rush. */
  bossSting(phase = 2) {
    const root = phase >= 3 ? 98 : 110;
    this.tone(root / 2, 1.2, 'sine', 0.4, 0, root / 3);
    this.noise(0.25, 0.3, 0, 200, 'lowpass', 1);
    for (const [f, d] of [[1, 0.12], [1.189, 0.12], [1.498, 0.12], [2, 0.34], [2.378, 0.34]] as const) {
      this.tone(root * 2 * f, 0.9, 'sawtooth', 0.03, d, undefined, this.fx, 0.03);
      this.tone(root * 2 * f, 1, 'triangle', 0.07, d);
    }
    this.noise(0.9, 0.12, 0.3, 600, 'bandpass', 0.8, this.fx, 3500);
  }
  /** The Queen laughs: a quick falling "ha-ha-ha". */
  queenLaugh() {
    for (let i = 0; i < 4; i++) {
      this.tone(620 - i * 50, 0.09, 'triangle', 0.07, i * 0.12, 520 - i * 50);
      this.noise(0.06, 0.05, i * 0.12, 1800, 'bandpass', 2);
    }
  }
  /** Shop till. */
  till() {
    this.noise(0.05, 0.2, 0, 2500, 'bandpass', 3);
    this.bell(3136, 0.08, 0.08, 0.8);
    this.bell(3951, 0.06, 0.14, 0.8);
  }
  /** Camera shutter: a quick double click with a little spring. */
  shutter() {
    this.noise(0.025, 0.4, 0, 3200, 'bandpass', 4);
    this.noise(0.04, 0.3, 0.07, 1800, 'bandpass', 3);
    this.tone(1600, 0.05, 'triangle', 0.05, 0.07, 900);
  }
  /** Cloth rustle in the changing room. */
  rustle() {
    this.noise(0.35, 0.06, 0, 2500, 'bandpass', 0.8, this.fx, 1200);
  }
  footstep() {
    this.noise(0.05, 0.08, 0, 500 + Math.random() * 200, 'lowpass', 1);
  }
  /** Little glass tick when a plinko moth brushes a peg; pitch climbs with the row. */
  pegTick(row: number) {
    this.bell(900 + row * 90 + Math.random() * 40, 0.05, 0, 0.18);
  }
  /** Plinko moth landing in a bucket. */
  bucket(mult: number) {
    this.noise(0.06, 0.3, 0, 700, 'lowpass', 1);
    this.tone(mult >= 1 ? 660 : 330, 0.15, 'triangle', 0.1);
  }
  /** Rising hum for the crash flight; returns a stop function. */
  flight(): () => void {
    if (!this.ctx || !this.fx) return () => {};
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t0);
    osc2.frequency.setValueAtTime(111.5, t0);
    osc.frequency.exponentialRampToValueAtTime(660, t0 + 30);
    osc2.frequency.exponentialRampToValueAtTime(666, t0 + 30);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t0);
    f.frequency.exponentialRampToValueAtTime(3000, t0 + 30);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.4);
    osc.connect(f);
    osc2.connect(f);
    f.connect(g).connect(this.fx);
    osc.start();
    osc2.start();
    return () => {
      try {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
        osc.stop(ctx.currentTime + 0.3);
        osc2.stop(ctx.currentTime + 0.3);
      } catch {
        /* already stopped */
      }
    };
  }
  /** Night wind catches the moth. */
  fizzle() {
    this.noise(1.1, 0.3, 0, 300, 'bandpass', 0.8, this.fx, 1400);
    this.noise(0.9, 0.18, 0.2, 1800, 'bandpass', 2, this.fx, 500);
    this.tone(400, 0.6, 'sine', 0.1, 0, 120);
  }

  // ---- Teich-Derby, Eisstraße, Zielscheibe ---------------------------------

  /** A rubber-duck quack (two nasal saw blips). */
  quack(pitch = 1) {
    this.tone(560 * pitch, 0.12, 'sawtooth', 0.05, 0, 380 * pitch);
    this.noise(0.1, 0.08, 0, 1300 * pitch, 'bandpass', 5);
    this.tone(520 * pitch, 0.1, 'sawtooth', 0.04, 0.13, 360 * pitch);
  }
  /** Water splash: a noise burst falling in pitch and a few droplets. */
  splash(big = 1) {
    this.noise(0.5 * big, 0.3, 0, 2400, 'bandpass', 0.8, this.fx, 500);
    this.tone(180, 0.25, 'sine', 0.15 * big, 0, 70);
    for (let i = 0; i < 4; i++) this.tone(1200 + Math.random() * 900, 0.06, 'sine', 0.04, 0.12 + i * 0.07, 1800);
  }
  /** Dart into a cork target: a dull wooden thunk with a short twang. */
  thunk() {
    this.tone(150, 0.16, 'sine', 0.5, 0, 70);
    this.noise(0.05, 0.4, 0, 1100, 'lowpass', 1);
    this.tone(420, 0.3, 'triangle', 0.05, 0.02, 380);
  }
  /** Ice cracking: sharp crackles. */
  iceCrack() {
    for (let i = 0; i < 6; i++) this.noise(0.03, 0.35 - i * 0.04, i * 0.045 + Math.random() * 0.02, 3000 + Math.random() * 2500, 'bandpass', 4);
    this.tone(90, 0.3, 'sine', 0.2, 0.05, 50);
  }
  /** A light hop onto ice: soft tap plus a glassy ping. */
  hop(step = 0) {
    this.noise(0.03, 0.25, 0, 2200, 'bandpass', 3);
    this.bell(1046 * Math.pow(2, Math.min(step, 14) / 12), 0.07, 0.01, 0.35);
  }
  /** Starting pistol for the duck race. */
  starter() {
    this.noise(0.18, 0.55, 0, 1800, 'lowpass', 0.7);
    this.tone(90, 0.2, 'sine', 0.3, 0, 45);
  }

  // ---- Arrival ------------------------------------------------------------

  /**
   * A running car: a small engine model (two detuned saws and a sub, pulsed at the
   * firing rate, through a filter that opens with the revs) plus tyre roll on the road.
   * `set(rpm, speed)` glides to new values (both 0..1); `stop()` turns the engine off.
   */
  car(): { set(rpm: number, speed: number, glide?: number): void; stop(): void } {
    const none = { set() {}, stop() {} };
    if (!this.ctx || !this.fx || !this.noiseBuf) return none;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(1, t + 0.25);
    out.connect(this.fx);
    // Engine voices.
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    const sub = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    sub.type = 'square';
    b.detune.value = 14;
    const mix = ctx.createGain();
    mix.gain.value = 0.09;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.05;
    a.connect(mix);
    b.connect(mix);
    sub.connect(subGain).connect(mix);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    // Cylinder pulses: amplitude modulation at the firing rate.
    const am = ctx.createGain();
    am.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth).connect(am.gain);
    mix.connect(lp).connect(am).connect(out);
    // Tyres on asphalt and a little wind.
    const road = ctx.createBufferSource();
    road.buffer = this.noiseBuf;
    road.loop = true;
    const roadF = ctx.createBiquadFilter();
    roadF.type = 'bandpass';
    roadF.frequency.value = 350;
    roadF.Q.value = 0.8;
    const roadG = ctx.createGain();
    roadG.gain.value = 0.0001;
    road.connect(roadF).connect(roadG).connect(out);
    const apply = (rpm: number, speed: number, at: number, glide: number) => {
      const f = 34 + rpm * 62;
      a.frequency.setTargetAtTime(f, at, glide);
      b.frequency.setTargetAtTime(f, at, glide);
      sub.frequency.setTargetAtTime(f / 2, at, glide);
      lfo.frequency.setTargetAtTime(f / 2, at, glide);
      lp.frequency.setTargetAtTime(220 + rpm * 1300, at, glide);
      mix.gain.setTargetAtTime(0.07 + rpm * 0.07, at, glide);
      roadG.gain.setTargetAtTime(0.0001 + speed * 0.07, at, glide);
      roadF.frequency.setTargetAtTime(250 + speed * 500, at, glide);
    };
    apply(0.15, 0, t, 0.01);
    for (const o of [a, b, sub, lfo]) o.start(t);
    road.start(t);
    let stopped = false;
    return {
      set: (rpm, speed, glide = 0.25) => !stopped && apply(rpm, speed, ctx.currentTime, glide),
      stop: () => {
        if (stopped) return;
        stopped = true;
        const n = ctx.currentTime;
        apply(0, 0, n, 0.15);
        out.gain.setTargetAtTime(0.0001, n + 0.1, 0.25);
        for (const o of [a, b, sub, lfo]) o.stop(n + 1.5);
        road.stop(n + 1.5);
      },
    };
  }
  /** Starter motor whirr and the engine catching. */
  ignition() {
    for (let i = 0; i < 4; i++) this.noise(0.09, 0.08, i * 0.11, 900, 'bandpass', 2);
    this.tone(60, 0.4, 'sawtooth', 0.06, 0.42, 90);
  }
  /** Brakes: tyre hiss and a short squeal. */
  brake() {
    this.noise(0.6, 0.06, 0, 900, 'bandpass', 1, this.fx, 300);
    this.tone(2350, 0.35, 'sine', 0.025, 0.05, 2150, this.fx, 0.05);
    this.tone(3120, 0.25, 'sine', 0.012, 0.1, 2950, this.fx, 0.05);
  }
  handbrake() {
    for (let i = 0; i < 5; i++) this.noise(0.02, 0.1, i * 0.035, 3000, 'bandpass', 5);
  }
  /** Car door: handle click and the door swinging open. */
  carDoorOpen() {
    this.noise(0.03, 0.25, 0, 2500, 'bandpass', 4);
    this.noise(0.04, 0.2, 0.06, 1500, 'bandpass', 3);
    this.noise(0.3, 0.03, 0.1, 700, 'bandpass', 2, this.fx, 1100);
  }
  /** Car door slammed shut: deep body thump and a metallic latch. */
  carDoor() {
    this.noise(0.12, 0.4, 0, 450, 'lowpass', 1);
    this.tone(95, 0.22, 'sine', 0.35, 0, 55);
    this.tone(190, 0.08, 'triangle', 0.08, 0.005, 120);
    this.noise(0.05, 0.18, 0.03, 2600, 'bandpass', 6);
    this.noise(0.4, 0.03, 0.05, 300, 'lowpass', 1);
  }
  /** Taxi horn, two friendly toots. */
  horn() {
    for (const d of [0, 0.22]) {
      this.tone(415, 0.14, 'sawtooth', 0.035, d);
      this.tone(523, 0.14, 'sawtooth', 0.03, d);
    }
  }
  /** Heavy casino doors swinging outwards on their hinges. */
  bigDoors() {
    this.noise(0.08, 0.15, 0, 1200, 'bandpass', 3);
    this.tone(180, 0.6, 'triangle', 0.025, 0.05, 140, this.fx, 0.1);
    this.noise(0.7, 0.05, 0.05, 500, 'bandpass', 2, this.fx, 250);
    this.noise(0.15, 0.12, 0.62, 300, 'lowpass', 1);
    this.bell(1568, 0.05, 0.15, 0.9);
    this.bell(2093, 0.04, 0.25, 0.9);
  }

  // ---- Music and ambience -------------------------------------------------

  /** Switches the background: title music, casino floor, or quieter music while playing a game. */
  setScene(s: Scene) {
    if (s === this.scene) return;
    this.scene = s;
    this.applyMood();
    if (!this.ctx) return;
    this.applyMusicLevel();
    if (s === 'casino' || s === 'game') this.startAmbience();
    else this.stopAmbience();
    if (s === 'menu') this.startStreet();
    else this.stopStreet();
    if (s !== 'off' && !this.musicTimer) {
      this.nextBeat = this.ctx.currentTime + 0.1;
      this.musicTimer = window.setInterval(() => this.schedule(), 50);
    }
  }

  private applyMusicLevel() {
    if (!this.ctx || !this.musicBus || !this.ambBus) return;
    // Club floor: louder and fuller near the dance floor; a game ducks it back down.
    const prox = this.scene === 'casino' && this.floorMood in CLUB_BPM ? this.proximity : 0;
    this.clubMix.setLevel(this.ctx, prox);
    const level = !this.musicOn ? 0 : this.scene === 'menu' ? 0.55 : this.scene === 'casino' ? 0.32 + prox * 0.45 : this.scene === 'game' ? 0.18 : 0;
    this.musicBus.gain.setTargetAtTime(Math.max(0.0001, level), this.ctx.currentTime, 0.6);
    const amb = this.scene === 'casino' ? 0.5 : this.scene === 'game' ? 0.25 : this.scene === 'menu' ? 0.45 : 0;
    this.ambBus.gain.setTargetAtTime(Math.max(0.0001, amb), this.ctx.currentTime, 0.8);
  }

  private startAmbience() {
    if (!this.ctx || !this.ambBus || !this.noiseBuf || this.ambNodes.length) return;
    const ctx = this.ctx;
    // Murmur of a crowd: band-limited noise with slow, uneven swells.
    for (const [freq, vol] of [[350, 0.05], [700, 0.03]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = vol;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.13 + Math.random() * 0.2;
      lg.gain.value = vol * 0.5;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.ambBus);
      src.start();
      lfo.start();
      this.ambNodes.push(src, lfo);
    }
    // Distant machines and glasses now and then.
    this.ambTimer = window.setInterval(() => {
      if (!this.ambBus) return;
      const r = Math.random();
      if (r < 0.3) [1319, 1568, 1976].forEach((f, i) => this.bell(f * (Math.random() < 0.5 ? 1 : 0.75), 0.025, i * 0.09, 0.5, this.ambBus));
      else if (r < 0.5) this.bell(2600 + Math.random() * 800, 0.03, 0, 0.3, this.ambBus);
      else if (r < 0.6) for (let i = 0; i < 6; i++) this.bell(2200 + Math.random() * 600, 0.02, i * 0.07, 0.25, this.ambBus);
    }, 1400);
  }

  private streetNodes: AudioNode[] = [];
  private streetTimer = 0;

  /** Title and arrival: drizzle on the pavement, the city humming far off, a car passing now and then. */
  private startStreet() {
    if (!this.ctx || !this.ambBus || !this.noiseBuf || this.streetNodes.length) return;
    const ctx = this.ctx;
    for (const [type, freq, q, vol] of [['highpass', 2600, 0.5, 0.035], ['bandpass', 900, 0.6, 0.02], ['lowpass', 140, 0.7, 0.05]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.ambBus);
      src.start();
      this.streetNodes.push(src);
    }
    this.streetTimer = window.setInterval(() => {
      if (!this.ambBus) return;
      const r = Math.random();
      // A car swishes past on the wet road.
      if (r < 0.18) this.noise(2.2, 0.05, 0, 300, 'bandpass', 1.4, this.ambBus, 1400);
      // Drips from the awning.
      else if (r < 0.5) this.bell(1800 + Math.random() * 900, 0.008, Math.random() * 0.5, 0.15, this.ambBus);
    }, 1100);
  }

  private stopStreet() {
    for (const n of this.streetNodes) {
      try {
        (n as AudioScheduledSourceNode).stop();
      } catch {
        /* ignore */
      }
    }
    this.streetNodes = [];
    clearInterval(this.streetTimer);
    this.streetTimer = 0;
  }

  private stopAmbience() {
    for (const n of this.ambNodes) {
      try {
        (n as AudioScheduledSourceNode).stop();
      } catch {
        /* ignore */
      }
    }
    this.ambNodes = [];
    clearInterval(this.ambTimer);
    this.ambTimer = 0;
  }

  /**
   * Generative lounge jazz: ii–V–I–VI in C with walking bass, soft electric piano and brushes.
   * Scheduled a little ahead of time so it keeps steady time.
   */
  /** Jukebox records: the generative band changes tempo, harmony and feel. */
  private record = 0;
  static readonly RECORDS = [
    { name: 'Lounge', bpm: 88, swing: 0.66, minor: false, bossa: false },
    { name: 'Swing', bpm: 132, swing: 0.66, minor: false, bossa: false },
    { name: 'Mondnacht', bpm: 70, swing: 0.62, minor: true, bossa: false },
    { name: 'Bossa Falter', bpm: 112, swing: 0.5, minor: false, bossa: true },
  ];
  /** Puts on the next record; returns its name. */
  // ---- Club floor (src/core/clubMusic.ts) -------------------------------------------

  private clubMix = new ClubMix();
  private proximity = 0;
  private voiceSet: Voices | null = null;

  private voices(): Voices {
    return (this.voiceSet ??= {
      ctx: this.ctx!,
      tone: (...a) => this.tone(...a),
      noise: (...a) => this.noise(...a),
      bell: (...a) => this.bell(...a),
    });
  }

  /** How close the player is to the dance floor (0..1): the club music layers up and gets louder. */
  setProximity(p: number) {
    p = Math.max(0, Math.min(1, p));
    if (Math.abs(p - this.proximity) < 0.01 && !(p === 0 && this.proximity > 0)) return;
    this.proximity = p;
    this.applyMusicLevel();
  }

  /** Where the band is right now, in beats (fractional), or null before the sound starts. */
  beatPos(): number | null {
    if (!this.ctx || !this.musicTimer) return null;
    return this.beat - (this.nextBeat - this.ctx.currentTime) * (this.moodBpm() / 60);
  }

  /** One-shots for the club props: 'airhorn', 'rewind', 'drop', 'bass', 'lights', 'fog', 'sneaker', 'chain'. */
  clubFx(kind: string) {
    if (this.ctx && this.fx) clubFx(this.voices(), kind, this.fx);
  }

  nextRecord() {
    this.record = (this.record + 1) % Sfx.RECORDS.length;
    this.noise(0.25, 0.08, 0, 3000, 'highpass', 1);
    this.tone(220, 0.15, 'triangle', 0.05, 0.05, 110);
    return Sfx.RECORDS[this.record].name;
  }

  // ---- Floor moods: every floor has its own band, crossfaded when you change floors ----

  private mood: Mood = 'foyer';
  /** The mood of the room you are in; the title and the street play 'street' over it. */
  private floorMood: Mood = 'foyer';
  /** Boss phase on the throne floor (0 = off): the music gets faster and fuller. */
  private intensity = 0;
  private moodOut: GainNode | null = null;
  /** Moods still fading out after a floor change; they keep playing until `until`. */
  private fading: { mood: Mood; gain: GainNode; until: number }[] = [];

  /** Gives the music the identity of a floor style ('foyer', 'velvet', 'garden', 'clockwork', 'crystal', 'throne'). */
  setFloorMood(style: string) {
    this.floorMood = style !== 'street' && (MOODS as readonly string[]).includes(style) ? (style as Mood) : 'foyer';
    this.applyMood();
  }

  /** Crossfades to the mood that fits now: the street's on the title, else the room's. */
  private applyMood() {
    const m: Mood = this.scene === 'menu' ? 'street' : this.floorMood;
    if (m === this.mood) return;
    const old = this.mood;
    this.mood = m;
    if (m !== 'throne') this.intensity = 0;
    if (!this.ctx || !this.musicBus || !this.moodOut) return;
    const now = this.ctx.currentTime;
    const XF = 2.4;
    this.moodOut.gain.cancelScheduledValues(now);
    this.moodOut.gain.setValueAtTime(this.moodOut.gain.value, now);
    this.moodOut.gain.linearRampToValueAtTime(0.0001, now + XF);
    this.fading.push({ mood: old, gain: this.moodOut, until: now + XF });
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(1, now + XF);
    g.connect(this.musicBus);
    this.moodOut = g;
  }

  /** Boss phase 0..3: on the throne floor the band pushes harder from phase 2. */
  setIntensity(phase: number) {
    this.intensity = Math.max(0, Math.min(3, phase));
  }

  private moodBpm() {
    switch (this.mood) {
      case 'velvet':
        return 66;
      case 'garden':
        return 62;
      case 'clockwork':
        return 104;
      case 'crystal':
        return 80;
      case 'throne':
        return 84 + Math.max(0, this.intensity - 1) * 10;
      case 'street':
        return 76;
      case 'club':
      case 'techno':
      case 'hiphop':
        return CLUB_BPM[this.mood];
      default:
        return Sfx.RECORDS[this.record].bpm;
    }
  }

  private schedule() {
    if (!this.ctx || !this.musicBus) return;
    if (!this.moodOut) {
      this.moodOut = this.ctx.createGain();
      this.moodOut.connect(this.musicBus);
    }
    const now = this.ctx.currentTime;
    this.fading = this.fading.filter((f) => {
      if (f.until + 3 > now) return true;
      f.gain.disconnect();
      return false;
    });
    const spb = 60 / this.moodBpm();
    while (this.nextBeat < now + 0.25) {
      this.playMood(this.mood, this.beat, this.nextBeat, spb, this.moodOut);
      for (const f of this.fading) if (f.until > this.nextBeat) this.playMood(f.mood, this.beat, this.nextBeat, spb, f.gain);
      this.nextBeat += spb;
      this.beat++;
    }
  }

  private playMood(m: Mood, beat: number, t: number, spb: number, out: GainNode) {
    const d = t - this.ctx!.currentTime;
    const bar = Math.floor(beat / 4);
    const b = beat % 4;
    switch (m) {
      case 'velvet':
        return this.velvetBeat(bar, b, d, spb, out);
      case 'garden':
        return this.gardenBeat(bar, b, d, spb, out);
      case 'clockwork':
        return this.clockBeat(bar, b, d, spb, out);
      case 'crystal':
        return this.crystalBeat(bar, b, d, spb, out);
      case 'throne':
        return this.throneBeat(bar, b, d, spb, out);
      case 'street':
        return this.streetBeat(beat, t, spb, out);
      case 'club':
      case 'techno':
      case 'hiphop':
        return this.clubMix.play(m, this.voices(), bar, b, d, spb, out);
      default:
        return this.playBeat(beat, t, spb, out);
    }
  }

  /** Muffled versions of the band, one per output (the crossfade makes new outputs). */
  private muffles = new WeakMap<GainNode, BiquadFilterNode>();

  /** Street: the lounge band heard through the casino's doors, muffled and slow. */
  private streetBeat(beat: number, t: number, spb: number, out: GainNode) {
    let lp = this.muffles.get(out);
    if (!lp) {
      lp = this.ctx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 750;
      lp.Q.value = 0.5;
      lp.connect(out);
      this.muffles.set(out, lp);
    }
    this.playBeat(beat, t, spb, lp);
  }

  /** Kerzensaal: a slow, smoky jazz ballad. Upright bass in halves, soft piano, a muted horn. */
  private velvetBeat(bar: number, b: number, d: number, spb: number, out: GainNode) {
    const prog: [number, number[]][] = [
      [110, [261.6, 329.6, 392, 493.9]], // Am9
      [146.8, [261.6, 349.2, 440, 523.3]], // Dm9
      [98, [293.7, 349.2, 440, 493.9]], // G13
      [130.8, [329.6, 392, 493.9, 587.3]], // Cmaj9
      [87.3, [261.6, 329.6, 440, 523.3]], // Fmaj7
      [123.5, [293.7, 349.2, 440, 523.3]], // Bm7b5
      [164.8, [293.7, 415.3, 493.9, 587.3]], // E7
      [110, [261.6, 329.6, 392, 493.9]],
    ];
    const [root, voicing] = prog[bar % 8];
    const swing = spb * 0.66;
    if (b === 0 || b === 2) this.tone(b === 0 ? root : root * 1.5 > 200 ? root * 0.75 : root * 1.5, spb * 1.8, 'triangle', 0.2, d, undefined, out, 0.02);
    if (b === 0 || (b === 2 && Math.random() < 0.5)) for (const f of voicing) this.tone(f, spb * 2.2, 'sine', 0.035, d + (b ? swing : 0), undefined, out, 0.02);
    // Muted horn: a slow phrase from the chord tones, now and then.
    if (Math.random() < 0.3) {
      const f = voicing[Math.floor(Math.random() * voicing.length)] * (Math.random() < 0.5 ? 1 : 2);
      this.tone(f * 0.985, spb * 1.4, 'triangle', 0.035, d + (Math.random() < 0.5 ? 0 : swing), f, out, 0.08);
    }
    if (b === 1 || b === 3) this.noise(spb * 0.9, 0.04, d, 4500, 'bandpass', 0.6, out);
    this.noise(0.04, 0.02, d + swing, 7000, 'highpass', 1, out);
  }

  /** Mondgarten: no drums, a harp rippling over long, soft pads. */
  private gardenBeat(bar: number, b: number, d: number, spb: number, out: GainNode) {
    const prog: [number, number[]][] = [
      [87.3, [349.2, 440, 523.3, 659.3, 493.9]], // Fmaj7#11
      [82.4, [329.6, 392, 523.3, 587.3, 493.9]], // C/E add9
      [73.4, [293.7, 349.2, 440, 523.3, 659.3]], // Dm9
      [116.5, [293.7, 349.2, 440, 466.2, 587.3]], // Bbmaj7
    ];
    const [root, voicing] = prog[Math.floor(bar / 2) % 4];
    if (b === 0 && bar % 2 === 0) {
      this.tone(root, spb * 8, 'sine', 0.14, d, undefined, out, 0.4);
      for (const f of voicing.slice(0, 4)) this.tone(f, spb * 8, 'sine', 0.018, d, undefined, out, 1.2);
    }
    // Harp: two plucks per beat, rising through the chord and falling back.
    for (let k = 0; k < 2; k++) {
      const i = (b * 2 + k + bar * 3) % (voicing.length * 2 - 2);
      const idx = i < voicing.length ? i : voicing.length * 2 - 2 - i;
      const f = voicing[idx] * (bar % 4 < 2 ? 1 : 2);
      this.tone(f, 1.6, 'triangle', 0.045, d + k * spb * 0.5, undefined, out, 0.003);
      this.tone(f * 2, 0.5, 'sine', 0.012, d + k * spb * 0.5, undefined, out, 0.002);
    }
    if (Math.random() < 0.12) this.bell(voicing[Math.floor(Math.random() * voicing.length)] * 4, 0.012, d, 1.6, out);
  }

  /** Uhrwerk: ticking eighths, a woodblock, staccato bass and pizzicato chords; a music box on top. */
  private clockBeat(bar: number, b: number, d: number, spb: number, out: GainNode) {
    const prog: [number, number[]][] = [
      [110, [261.6, 329.6, 440]], // Am
      [87.3, [261.6, 349.2, 440]], // F
      [130.8, [261.6, 329.6, 392]], // C
      [98, [246.9, 293.7, 392]], // G
    ];
    const [root, voicing] = prog[bar % 4];
    const half = spb / 2;
    for (let k = 0; k < 2; k++) {
      this.noise(0.015, 0.05, d + k * half, k ? 2200 : 4200, 'bandpass', 8, out);
      this.tone(k ? root * 2 : root, 0.12, 'triangle', 0.16, d + k * half, undefined, out, 0.004);
    }
    if (b === 0 || b === 2) this.tone(b === 0 ? 880 : 660, 0.06, 'triangle', 0.05, d, undefined, out, 0.002);
    if (b === 1 || b === 3) for (const f of voicing) this.tone(f, 0.11, 'triangle', 0.03, d + half, undefined, out, 0.003);
    if (Math.random() < 0.5) this.bell(voicing[(b + bar) % voicing.length] * 4, 0.022, d + (Math.random() < 0.5 ? 0 : half), 0.4, out);
  }

  /** Kristallsalon: glass bells in slow arpeggios over a quiet pad. */
  private crystalBeat(bar: number, b: number, d: number, spb: number, out: GainNode) {
    const prog: [number, number[]][] = [
      [130.8, [523.3, 659.3, 784, 987.8, 1174.7]], // Cmaj9
      [110, [523.3, 659.3, 784, 987.8]], // Am9
      [87.3, [523.3, 659.3, 698.5, 880, 1046.5]], // Fmaj9
      [98, [587.3, 659.3, 784, 987.8]], // G6
    ];
    const [root, voicing] = prog[bar % 4];
    if (b === 0) {
      this.tone(root, spb * 4, 'sine', 0.12, d, undefined, out, 0.2);
      for (const f of voicing.slice(0, 3)) this.tone(f / 2, spb * 4, 'sine', 0.016, d, undefined, out, 0.8);
    }
    if (b === 2) this.tone(root * 1.5, spb * 2, 'sine', 0.07, d, undefined, out, 0.1);
    for (let k = 0; k < 2; k++) {
      if (k === 1 && Math.random() < 0.4) continue;
      const f = voicing[(b * 2 + k + bar) % voicing.length];
      this.bell(f, 0.03, d + k * spb * 0.5, 1.4, out);
    }
    if (b === 0 && bar % 2 === 0) this.noise(1.2, 0.012, d, 9000, 'highpass', 1, out);
  }

  /** Thron: dark and pulsing; timpani, a low choir, and more drive in each boss phase. */
  private throneBeat(bar: number, b: number, d: number, spb: number, out: GainNode) {
    const prog: [number, number[]][] = [
      [73.4, [293.7, 349.2, 440]], // Dm
      [58.3, [293.7, 349.2, 466.2]], // Bb
      [49, [293.7, 392, 466.2]], // Gm
      [55, [277.2, 329.6, 440]], // A
    ];
    const [root, voicing] = prog[bar % 4];
    const lvl = this.intensity;
    const half = spb / 2;
    // Pulsing bass on every eighth.
    for (let k = 0; k < 2; k++) {
      this.tone(root, half * 0.8, 'triangle', 0.17, d + k * half, undefined, out, 0.006);
      this.tone(root * 2, half * 0.5, 'square', 0.012, d + k * half, undefined, out, 0.006);
    }
    if (b === 0) {
      this.tone(65, 0.7, 'sine', 0.3, d, 44, out, 0.004);
      this.noise(0.25, 0.08, d, 200, 'lowpass', 1, out);
      for (const f of voicing) {
        this.tone(f / 2, spb * 4, 'sine', 0.03, d, undefined, out, 0.6);
        this.tone((f / 2) * 1.004, spb * 4, 'triangle', 0.012, d, undefined, out, 0.8);
      }
    }
    if (b === 2 && bar % 2 === 1) this.tone(65, 0.5, 'sine', 0.2, d, 48, out, 0.004);
    if (lvl >= 2) {
      if (b === 1 || b === 3) this.noise(0.12, 0.06, d, 1800, 'bandpass', 1.2, out);
      this.noise(0.02, 0.02, d + half, 6000, 'highpass', 1, out);
    }
    if (lvl >= 3) {
      // String tremolo on the top note.
      for (let k = 0; k < 4; k++) this.tone(voicing[2], spb / 4, 'triangle', 0.018, d + (k * spb) / 4, undefined, out, 0.01);
      if (b === 0) this.bell(voicing[0] * 2, 0.03, d, 1.2, out);
    }
  }

  private playBeat(beat: number, t: number, spb: number, out: AudioNode) {
    const d = t - this.ctx!.currentTime;
    const bar = Math.floor(beat / 4) % 8;
    const b = beat % 4;
    // Chords (root, then voicing) for an 8-bar loop.
    const rec = Sfx.RECORDS[this.record];
    const major: [number, number[]][] = [
      [146.8, [349.2, 440, 523.3, 659.3]], // Dm9
      [98, [349.2, 440, 493.9, 659.3]], // G13
      [130.8, [329.6, 392, 493.9, 587.3]], // Cmaj9
      [110, [329.6, 392, 466.2, 554.4]], // A7(b9)
      [146.8, [349.2, 440, 523.3, 659.3]],
      [98, [349.2, 415.3, 493.9, 622.3]], // G7alt
      [130.8, [329.6, 392, 493.9, 587.3]],
      [130.8, [329.6, 440, 493.9, 587.3]], // C6/9
    ];
    const minor: [number, number[]][] = [
      [110, [261.6, 329.6, 392, 493.9]], // Am9
      [146.8, [261.6, 349.2, 440, 523.3]], // Dm9
      [164.8, [293.7, 415.3, 493.9, 587.3]], // E7
      [110, [261.6, 329.6, 392, 493.9]],
      [87.3, [261.6, 329.6, 440, 523.3]], // Fmaj7
      [146.8, [261.6, 349.2, 440, 523.3]],
      [123.5, [293.7, 349.2, 440, 523.3]], // Bm7b5
      [164.8, [293.7, 415.3, 493.9, 587.3]],
    ];
    const prog = rec.minor ? minor : major;
    const [root, voicing] = prog[bar];
    const next = prog[(bar + 1) % 8][0];
    // Walking bass: root, fifth, third-ish, approach note to the next root.
    const walk = rec.bossa ? [root, root, root * 1.5, root * 1.5] : [root, root * 1.5, root * 1.26, next * (Math.random() < 0.5 ? 1.06 : 0.944)];
    const bf = walk[b] > 200 ? walk[b] / 2 : walk[b];
    this.tone(bf, spb * 0.9, 'triangle', 0.22, d, undefined, out, 0.01);
    this.tone(bf * 2, spb * 0.3, 'sine', 0.05, d, undefined, out, 0.005);
    // Electric piano comping on beat 1 and the "and" of 2, sometimes 4.
    const swing = spb * rec.swing;
    const hits = rec.bossa
      ? b === 0 ? [0, swing] : b === 1 ? [swing] : b === 2 ? [0] : [swing]
      : b === 0 ? [0] : b === 1 ? [swing] : b === 3 && Math.random() < (rec.bpm > 120 ? 0.8 : 0.4) ? [swing] : [];
    for (const off of hits) {
      for (const f of voicing) {
        this.tone(f, spb * 1.6, 'sine', 0.045, d + off, undefined, out, 0.006);
        this.tone(f * 2, spb * 0.5, 'triangle', 0.012, d + off, undefined, out, 0.003);
      }
    }
    // A few melody notes from the chord, like a vibraphone noodling.
    if (Math.random() < 0.35) {
      const f = voicing[Math.floor(Math.random() * voicing.length)] * 2;
      this.bell(f, 0.03, d + (Math.random() < 0.5 ? 0 : swing), 1.2, out);
    }
    // Brushes: swish on 2 and 4, soft taps on the swung eighths.
    if (rec.bossa) this.noise(0.03, 0.035, d + (b % 2 ? swing : 0), 6000, 'highpass', 1, out);
    else if (b === 1 || b === 3) this.noise(spb * 0.6, 0.05, d, 5000, 'bandpass', 0.7, out);
    this.noise(0.04, 0.025, d + swing, 7000, 'highpass', 1, out);
  }

  // ---- Diamantminen, Drachenturm, Mondmünze ------------------------------------------

  /** A stone cracking open (Diamantminen). */
  crack() {
    this.noise(0.05, 0.35, 0, 2400, 'bandpass', 3);
    this.noise(0.12, 0.22, 0.04, 900, 'bandpass', 2);
    this.tone(160, 0.12, 'sine', 0.18, 0.02, 90);
  }
  /** A soft puff of smoke: no bang, just air and a low thump. */
  puff() {
    this.noise(0.7, 0.22, 0, 700, 'lowpass', 0.8, this.fx, 200);
    this.tone(110, 0.35, 'sine', 0.16, 0, 60);
  }
  /** A brass coin flicked into the air: a ring that wobbles while it spins. */
  coinFlip() {
    this.noise(0.03, 0.3, 0, 3800, 'bandpass', 5);
    for (let i = 0; i < 6; i++) this.bell(2400 + (i % 2) * 300, 0.035 * (1 - i / 7), 0.05 + i * 0.09, 0.15);
  }
  /** The coin landing on brass, with a short rattle. */
  coinLand() {
    this.bell(1760, 0.12, 0, 0.5);
    for (let i = 0; i < 4; i++) this.bell(2200 + Math.random() * 300, 0.05 * (1 - i / 5), 0.08 + i * 0.05 * (1 - i * 0.12), 0.12);
  }
  /** A heavy wooden door creaking open (Drachenturm). */
  creak() {
    this.tone(180, 0.35, 'sawtooth', 0.025, 0, 120, this.fx, 0.05);
    this.noise(0.3, 0.08, 0, 600, 'bandpass', 4, this.fx, 300);
  }

  // ---- Straßenwürfel, Großes Rad, Drei Laternen ----------------------------

  /** A bone die hitting stone (strength 0..1): a dry click with a short knock. */
  diceHit(strength = 1) {
    const v = Math.max(0.05, Math.min(1, strength));
    this.noise(0.025, 0.4 * v, 0, 2600 + Math.random() * 900, 'bandpass', 4);
    this.tone(260 + Math.random() * 80, 0.06, 'triangle', 0.12 * v, 0, 180);
  }
  /** The wheel's leather clicker snapping over a peg. */
  clicker() {
    this.noise(0.016, 0.22, 0, 3200 + Math.random() * 400, 'bandpass', 5);
    this.tone(1500, 0.02, 'square', 0.015);
  }
  /** Soft wing beats of a moth leaving its hiding place. */
  flutter() {
    for (let i = 0; i < 5; i++) this.noise(0.05, 0.09 * (1 - i / 6), i * 0.07, 900 + i * 120, 'bandpass', 1.5);
  }

  // ---- Falter-Poker ------------------------------------------------------------------------

  /** A card snapping over on the felt; `i` lifts the pitch a little per card. */
  pokerCard(i = 0) {
    this.noise(0.05, 0.3, 0, 2600 + i * 160, 'bandpass', 2.5, this.fx, 5200);
    this.noise(0.02, 0.22, 0.045, 1400, 'bandpass', 3);
    this.tone(320 + i * 30, 0.05, 'triangle', 0.05, 0.04);
  }
  /** Hold toggle: a brass latch, brighter when it locks. */
  pokerHold(on: boolean) {
    this.noise(0.025, 0.3, 0, on ? 3800 : 2400, 'bandpass', 5);
    this.tone(on ? 880 : 520, 0.09, 'triangle', 0.09, 0.01, on ? 1320 : 400);
  }

  // ---- Card tables (Blackjack, Baccarat, Kartenleiter) ---------------------

  /** A card sliding off the shoe and slapping onto the felt. */
  cardDeal() {
    this.noise(0.09, 0.16, 0, 1800, 'bandpass', 0.8, this.fx, 4200);
    this.noise(0.035, 0.32, 0.08, 1200, 'lowpass', 1);
  }
  /** A card turned over: a soft snap. */
  cardFlip() {
    this.noise(0.05, 0.22, 0, 3000, 'bandpass', 2);
    this.tone(900, 0.04, 'triangle', 0.03, 0.01);
  }
  /** The slow peel of a squeezed card: paper creaking upwards. */
  cardPeel(duration = 0.8) {
    this.noise(duration, 0.08, 0, 700, 'bandpass', 3, this.fx, 2600);
  }
}

export const sfx = new Sfx();
export type { Sfx };
