// A playable grand piano: tap the keys or use the computer keyboard (A S D F … for white
// keys, W E T Z U O P for black ones). Songs light the next key so anyone can play along.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS, FONT_BODY, glowTexture } from '../core/fx';
import { animate, ease } from '../core/tween';
import { button } from '../core/ui';
import { sfx } from '../core/audio';
import { Panel } from './panel';

/** Semitones above C4. Public domain melodies. */
const SONGS: { name: string; notes: number[] }[] = [
  { name: 'Alle meine Entchen', notes: [0, 2, 4, 5, 7, 7, 9, 9, 9, 9, 7, 9, 9, 9, 9, 7, 5, 5, 5, 5, 4, 4, 2, 2, 2, 2, 0] },
  { name: 'Ode an die Freude', notes: [4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, 4, 2, 2, 4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, 2, 0, 0] },
  { name: 'Hänschen klein', notes: [7, 4, 4, 5, 2, 2, 0, 2, 4, 5, 7, 7, 7, 7, 4, 4, 5, 2, 2, 0, 4, 7, 7, 0] },
];

const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
const WHITE_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
const WHITE_LABEL = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'];
const BLACK: [number, string, string][] = [
  [1, 'KeyW', 'W'],
  [3, 'KeyE', 'E'],
  [6, 'KeyT', 'T'],
  [8, 'KeyY', 'Z'],
  [10, 'KeyU', 'U'],
  [13, 'KeyO', 'O'],
  [15, 'KeyP', 'P'],
];
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];

interface Key {
  semi: number;
  black: boolean;
  g: Graphics;
  hint: Sprite;
  draw(down: boolean): void;
}

export class PianoPanel extends Panel {
  private keys: Key[] = [];
  private octave = 0;
  private song = -1;
  private pos = 0;
  private fxLayer = new Container();
  private songLabel: Text | null = null;

  constructor(
    private onNote: () => void,
    private onSong: (name: string) => void,
    private onClose: () => void,
  ) {
    super();
    this.bgAlpha = 0.8;
    window.addEventListener('keydown', this.onKey);
  }

  protected build() {
    const n = this.narrow;
    const whites = n ? 8 : 11;
    const kw = n ? 64 : 80;
    const kh = n ? 320 : 290;
    this.W = whites * kw + 80;
    const top = n ? 250 : 210;
    this.H = top + kh + 150;
    this.keys = [];
    this.frame('KLAVIER', COLORS.lamp, this.onClose);

    // Song picker.
    const labels = ['Frei spielen', ...SONGS.map((s) => s.name)];
    this.tabs(labels, this.song + 1, 106, (i) => {
      this.song = i - 1;
      this.pos = 0;
      this.rebuild();
    }, n ? 2 : 4, n ? 230 : 210);
    this.songLabel = this.text('', 18, 0xd9c6a0, true);
    this.songLabel.anchor.set(0.5);
    this.songLabel.position.set(this.W / 2, top - 36);
    this.panel.addChild(this.songLabel);
    this.updateSongLabel();

    // Lacquered case and keybed.
    const x0 = 40;
    const cg = new Graphics();
    cg.roundRect(x0 - 22, top - 18, whites * kw + 44, kh + 40, 16).fill(0x0e0a10).stroke({ color: 0x3a3040, width: 2 });
    cg.rect(x0 - 10, top - 8, whites * kw + 20, 8).fill(0x6b1a2e);
    this.panel.addChild(cg);
    const add = (semi: number, black: boolean, x: number, label: string) => {
      const w = black ? kw * 0.6 : kw - 3;
      const h = black ? kh * 0.6 : kh;
      const c = new Container();
      c.position.set(x, top);
      const g = new Graphics();
      const hint = new Sprite(glowTexture());
      hint.anchor.set(0.5);
      hint.position.set(w / 2, h - 36);
      hint.width = hint.height = kw * 1.4;
      hint.tint = COLORS.lamp;
      hint.blendMode = 'add';
      hint.alpha = 0;
      const t = new Text({ text: label, style: { fontFamily: FONT_BODY, fontSize: black ? 15 : 18, fontWeight: '700', fill: black ? 0xd9c6a0 : 0x6a5a4a } });
      t.anchor.set(0.5);
      t.position.set(w / 2, h - 22);
      const draw = (down: boolean) => {
        g.clear();
        if (black) {
          g.roundRect(0, 0, w, h + (down ? 2 : 0), 5).fill(down ? 0x3a2a40 : 0x14080f).stroke({ color: 0x000000, width: 1 });
          if (!down) g.roundRect(4, 2, w - 8, h - 14, 4).fill({ color: 0xffffff, alpha: 0.08 });
        } else {
          g.roundRect(0, 0, w, h, 6).fill(down ? 0xffe7a8 : 0xfff6e6).stroke({ color: 0x8a7a6a, width: 1.5 });
          if (!down) g.rect(0, h - 10, w, 10).fill({ color: 0x000000, alpha: 0.08 });
        }
      };
      draw(false);
      c.addChild(g, hint, t);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointerdown', () => this.press(semi));
      this.panel.addChild(c);
      this.keys.push({ semi, black, g, hint, draw });
    };
    for (let i = 0; i < whites; i++) add(WHITE[i], false, x0 + i * kw, n ? WHITE_LABEL[i] : WHITE_LABEL[i]);
    for (const [semi, , label] of BLACK) {
      const wi = WHITE.indexOf(semi - 1);
      if (wi < 0 || wi >= whites - 1) continue;
      add(semi, true, x0 + (wi + 1) * kw - kw * 0.3 - 1.5, label);
    }
    this.panel.addChild(this.fxLayer);

    // Octave and close.
    const oct = this.text(`Oktave ${this.octave >= 0 ? '+' : ''}${this.octave}`, 18, 0xd9c6a0, true);
    oct.anchor.set(0.5);
    oct.position.set(this.W / 2, this.H - 50);
    this.panel.addChild(oct);
    const down = button({ label: '◀', width: 60, height: 46, color: 0x2a1608, textColor: 0xfff1c4, fontSize: 20, onClick: () => this.shift(-1) });
    down.position.set(this.W / 2 - 100, this.H - 50);
    const up = button({ label: '▶', width: 60, height: 46, color: 0x2a1608, textColor: 0xfff1c4, fontSize: 20, onClick: () => this.shift(1) });
    up.position.set(this.W / 2 + 100, this.H - 50);
    this.panel.addChild(down, up);
    const help = this.text(n ? 'Tippe die Tasten an.' : 'Tasten A S D F … und W E T Z U · Pfeile wechseln die Oktave', 15, 0x8a7a6a);
    help.anchor.set(0.5);
    help.position.set(this.W / 2, top + kh + 40);
    this.panel.addChild(help);
    this.showHint();
  }

  private shift(d: number) {
    this.octave = Math.max(-1, Math.min(1, this.octave + d));
    this.rebuild();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      this.shift(e.code === 'ArrowLeft' ? -1 : 1);
      return;
    }
    const wi = WHITE_KEYS.indexOf(e.code);
    if (wi >= 0) return void this.press(WHITE[wi]);
    const b = BLACK.find(([, code]) => code === e.code);
    if (b) this.press(b[0]);
  };

  private press(semi: number) {
    const key = this.keys.find((k) => k.semi === semi);
    if (!key) return;
    const freq = 261.63 * Math.pow(2, (semi + this.octave * 12) / 12);
    sfx.pianoNote(freq);
    this.onNote();
    key.draw(true);
    setTimeout(() => !key.g.destroyed && key.draw(false), 160);
    // A note rises from the key.
    const p = key.g.parent!;
    const t = new Text({ text: Math.random() < 0.5 ? '♪' : '♫', style: { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: key.black ? 0xc9a0ff : COLORS.lamp } });
    t.anchor.set(0.5);
    t.position.set(p.x + p.width / 2, p.y - 10);
    this.fxLayer.addChild(t);
    const dx = (Math.random() - 0.5) * 40;
    void animate(1000, (k) => {
      if (t.destroyed) return;
      t.position.set(p.x + p.width / 2 + dx * k, p.y - 10 - 90 * k);
      t.alpha = 1 - k;
    }, ease.outCubic).then(() => !t.destroyed && t.destroy());
    // Playing along with a song.
    if (this.song >= 0) {
      const s = SONGS[this.song];
      if (semi === s.notes[this.pos]) {
        this.pos++;
        if (this.pos >= s.notes.length) {
          this.pos = 0;
          sfx.medal();
          this.onSong(s.name);
        }
        this.updateSongLabel();
        this.showHint();
      }
    }
  }

  private updateSongLabel() {
    if (!this.songLabel) return;
    if (this.song < 0) {
      this.songLabel.text = 'Spiel einfach drauflos.';
      return;
    }
    const s = SONGS[this.song];
    const next = s.notes[this.pos];
    this.songLabel.text = `${s.name} · Ton ${this.pos + 1} von ${s.notes.length} · nächster: ${NAMES[next % 12]}`;
  }

  private showHint() {
    const next = this.song >= 0 ? SONGS[this.song].notes[this.pos] : -1;
    for (const k of this.keys) k.hint.alpha = 0;
    const k = this.keys.find((x) => x.semi === next);
    if (k) k.hint.alpha = 0.9;
  }

  update(dtMs: number) {
    super.update(dtMs);
    const next = this.song >= 0 ? SONGS[this.song].notes[this.pos] : -1;
    const k = this.keys.find((x) => x.semi === next);
    if (k) k.hint.alpha = 0.55 + Math.sin(this.time * 6) * 0.35;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    super.destroy();
  }
}
