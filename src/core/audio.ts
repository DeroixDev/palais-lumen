// Synthesised sound effects (no audio files needed). Starts after the first click.

const MUTE_KEY = 'nachtfalter.muted';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
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
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, delay = 0, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, delay = 0, highpass = 800) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = highpass;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  click() {
    this.tone(900, 0.05, 'square', 0.12);
  }
  chip() {
    this.noise(0.06, 0.25, 0, 2500);
    this.tone(2200, 0.04, 'triangle', 0.1);
  }
  tick() {
    this.tone(1400, 0.02, 'square', 0.05);
  }
  thud() {
    this.tone(140, 0.18, 'sine', 0.5, 0, 60);
    this.noise(0.05, 0.15, 0, 300);
  }
  whoosh() {
    this.noise(0.35, 0.18, 0, 600);
  }
  spinStart() {
    this.tone(300, 0.25, 'sawtooth', 0.12, 0, 900);
  }
  ballRoll(duration: number) {
    for (let i = 0; i < duration * 14; i++) {
      const p = i / (duration * 14);
      this.noise(0.03, 0.06 * (1 - p * 0.6), Math.pow(p, 1.4) * duration, 3000);
    }
  }
  coin(delay = 0) {
    this.tone(1800 + Math.random() * 600, 0.12, 'triangle', 0.15, delay);
    this.tone(2600 + Math.random() * 600, 0.1, 'sine', 0.08, delay + 0.03);
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.25, i * 0.08));
  }
  bigWin() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, 0.25, 'square', 0.12, i * 0.1));
    seq.forEach((f, i) => this.tone(f / 2, 0.25, 'triangle', 0.2, i * 0.1));
    for (let i = 0; i < 14; i++) this.coin(0.3 + i * 0.07);
  }
  lose() {
    this.tone(330, 0.2, 'triangle', 0.12, 0, 220);
  }
  medal() {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.22, i * 0.09));
    this.noise(0.8, 0.08, 0.5, 5000);
  }
  door() {
    this.tone(220, 0.3, 'sine', 0.2, 0, 330);
  }
}

export const sfx = new Sfx();
export type { Sfx };
