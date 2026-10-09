// A playable grand piano: tap the keys or use the computer keyboard (A S D F … for white
// keys, W E T Z U O P for black ones). Songs light the next key so anyone can play along.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { COLORS, FONT_BODY, glowTexture } from '../core/fx';
import { animate, ease } from '../core/tween';
import { brass, button } from '../core/ui';
import { INK, fillInk, glowAt, paint, rrect } from '../world/painted/brush';
import { CREAM, MUTED, screw } from './kit';
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
  g: Sprite;
  hint: Sprite;
  draw(down: boolean): void;
}

const keyCache = new Map<string, Texture>();
/** Ivory or ebony key, painted; `down` is the pressed look (darker, shorter shine). */
function keyTexture(w: number, h: number, black: boolean, down: boolean) {
  const k = `${w}x${h}-${black}-${down}`;
  let t = keyCache.get(k);
  if (t) return t;
  t = paint(w + 2, h + 4, (c) => {
    c.translate(1, 0);
    const r = black ? 4 : 6;
    if (black) {
      rrect(c, 0, -6, w, h + 6 + (down ? 1 : 0), r);
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, down ? '#2a2030' : '#2e2632');
      g.addColorStop(0.5, down ? '#120c16' : '#0c080e');
      g.addColorStop(1, '#050306');
      fillInk(c, g, 1.4);
      if (!down) {
        rrect(c, w * 0.18, 2, w * 0.64, h - 16, 3);
        const s = c.createLinearGradient(0, 0, 0, h);
        s.addColorStop(0, 'rgba(255,255,255,0.2)');
        s.addColorStop(1, 'rgba(255,255,255,0.03)');
        c.fillStyle = s;
        c.fill();
        rrect(c, 2, h - 12, w - 4, 10, 3);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fill();
      }
    } else {
      rrect(c, 0, -6, w, h + 6, r);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, down ? '#e8d8b0' : '#fffaf0');
      g.addColorStop(0.85, down ? '#f0dca8' : '#f4ead6');
      g.addColorStop(1, down ? '#d8c08a' : '#e2d2b4');
      fillInk(c, g, 1.6);
      if (down) glowAt(c, w / 2, h * 0.6, w * 0.7, h * 0.5, 0xffcf7a, 0.35);
      else {
        // Front lip of the key.
        rrect(c, 1, h - 12, w - 2, 12, r);
        c.fillStyle = 'rgba(120,90,50,0.16)';
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fillRect(3, 0, 2, h - 16);
      }
    }
  }, 2);
  keyCache.set(k, t);
  return t;
}

const caseCache = new Map<string, Texture>();
/** The lacquered piano body around the keys, with a fallboard and a brass nameplate. */
function pianoCase(kw: number, kh: number, narrow: boolean, pad: number) {
  const k = `${kw}x${kh}-${pad}`;
  let t = caseCache.get(k);
  if (t) return t;
  const w = kw + pad * 2;
  const h = kh + 70;
  t = paint(w + 8, h + 10, (c) => {
    rrect(c, 3, 7, w, h, 18);
    c.fillStyle = 'rgba(6,2,8,0.55)';
    c.fill();
    rrect(c, 0, 0, w, h, 18);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a2230');
    g.addColorStop(0.2, '#120c16');
    g.addColorStop(1, '#07050a');
    fillInk(c, g, 2.5);
    // Lacquer shine.
    c.save();
    rrect(c, 0, 0, w, h, 18);
    c.clip();
    glowAt(c, w * 0.28, 8, w * 0.4, 30, 0xfff4dc, 0.18);
    c.strokeStyle = 'rgba(255,240,220,0.35)';
    c.lineWidth = 2;
    rrect(c, 1.5, 1.5, w + 4, h + 4, 18);
    c.stroke();
    c.restore();
    // Gold inlay line and the fallboard edge.
    rrect(c, 8, 8, w - 16, h - 16, 12);
    c.strokeStyle = 'rgba(224,178,90,0.55)';
    c.lineWidth = 1.4;
    c.stroke();
    c.fillStyle = '#5a1428';
    c.fillRect(pad - 4, 40, w - pad * 2 + 8, 6);
    c.fillStyle = 'rgba(255,200,200,0.25)';
    c.fillRect(pad - 4, 40, w - pad * 2 + 8, 1.5);
    // Nameplate.
    const pw = narrow ? 120 : 150;
    rrect(c, w / 2 - pw / 2, 12, pw, 20, 6);
    fillInk(c, brass(c, w / 2 - pw / 2, 12, w / 2 + pw / 3, 34), 1.4);
    c.fillStyle = 'rgba(60,32,8,0.9)';
    c.font = `700 ${narrow ? 11 : 12}px "Barlow Condensed", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N A C H T F A L T E R', w / 2, 23);
    screw(c, 22, 22, 4);
    screw(c, w - 22, 22, 4);
    c.strokeStyle = INK;
  }, 2);
  caseCache.set(k, t);
  return t;
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
    const kw = n ? 43 : 74;
    const kh = n ? 270 : 280;
    const pad = n ? 12 : 24;
    const x0 = n ? (404 - whites * kw) / 2 : 46;
    this.W = n ? 404 : whites * kw + 92;
    const tabsY = n ? 100 : 100;
    const top = n ? 300 : 236;
    this.H = top + kh + (n ? 150 : 140);
    this.keys = [];
    this.frame('KLAVIER', COLORS.lamp, this.onClose);

    // Song picker.
    const labels = ['Frei spielen', ...SONGS.map((s) => s.name)];
    this.tabs(labels, this.song + 1, tabsY, (i) => {
      this.song = i - 1;
      this.pos = 0;
      this.rebuild();
    }, n ? 2 : 4, n ? 176 : 196);
    this.songLabel = this.text('', n ? 16 : 18, 0xe6d6b0, true);
    this.songLabel.anchor.set(0.5);
    this.songLabel.position.set(this.W / 2, top - (n ? 64 : 58));
    this.panel.addChild(this.songLabel);
    this.updateSongLabel();

    // Lacquered case, fallboard with a brass nameplate, and the keybed.
    const caseSpr = new Sprite(pianoCase(whites * kw, kh, n, pad));
    caseSpr.position.set(x0 - pad, top - 46);
    this.panel.addChild(caseSpr);
    const add = (semi: number, black: boolean, x: number, label: string) => {
      const w = black ? Math.round(kw * 0.6) : kw - 2;
      const h = black ? Math.round(kh * 0.6) : kh;
      const c = new Container();
      c.position.set(x, top);
      const g = new Sprite(keyTexture(w, h, black, false));
      const hint = new Sprite(glowTexture());
      hint.anchor.set(0.5);
      hint.position.set(w / 2, h - 40);
      hint.width = hint.height = kw * 1.5;
      hint.tint = COLORS.lamp;
      hint.blendMode = 'add';
      hint.alpha = 0;
      const t = new Text({ text: label, style: { fontFamily: FONT_BODY, fontSize: black ? (n ? 13 : 15) : n ? 15 : 18, fontWeight: '700', fill: black ? 0xd9c6a0 : 0x7a6248 } });
      t.anchor.set(0.5);
      t.position.set(w / 2, h - (black ? 18 : 24));
      const draw = (down: boolean) => {
        g.texture = keyTexture(w, h, black, down);
        t.y = h - (black ? 18 : 24) + (down ? 2 : 0);
      };
      c.addChild(g, hint, t);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointerdown', () => this.press(semi));
      this.panel.addChild(c);
      this.keys.push({ semi, black, g, hint, draw });
    };
    const names = ['C', 'D', 'E', 'F', 'G', 'A', 'H', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < whites; i++) add(WHITE[i], false, x0 + i * kw, n ? names[i] : WHITE_LABEL[i]);
    for (const [semi, , label] of BLACK) {
      const wi = WHITE.indexOf(semi - 1);
      if (wi < 0 || wi >= whites - 1) continue;
      add(semi, true, x0 + (wi + 1) * kw - kw * 0.3 - 1, n ? '' : label);
    }
    this.panel.addChild(this.fxLayer);

    // Octave controls in the thumb zone.
    const oy = this.H - (n ? 52 : 50);
    const oct = this.text(`Oktave ${this.octave > 0 ? '+' : this.octave < 0 ? '−' : '±'}${Math.abs(this.octave)}`, 20, CREAM, true);
    oct.anchor.set(0.5);
    oct.position.set(this.W / 2, oy);
    this.panel.addChild(oct);
    const down = button({ label: '◀', width: 64, height: 52, color: 0x3a1428, textColor: CREAM, fontSize: 20, display: false, onClick: () => this.shift(-1) });
    down.position.set(this.W / 2 - 110, oy);
    const up = button({ label: '▶', width: 64, height: 52, color: 0x3a1428, textColor: CREAM, fontSize: 20, display: false, onClick: () => this.shift(1) });
    up.position.set(this.W / 2 + 110, oy);
    down.setEnabled(this.octave > -1);
    up.setEnabled(this.octave < 1);
    this.panel.addChild(down, up);
    const help = this.text(n ? 'Tippe die Tasten an. Der leuchtende Ton ist der nächste.' : 'Tasten A S D F … und W E T Z U · Pfeile wechseln die Oktave', 15, MUTED);
    help.anchor.set(0.5);
    help.position.set(this.W / 2, top + kh + (n ? 38 : 40));
    if (help.width > this.W - 40) help.scale.set((this.W - 40) / help.width);
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
