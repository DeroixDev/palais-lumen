// A short illustrated chapter of the house's story, shown after each win against the Queen
// (src/core/story.ts decides which). A painted scene with the regulars as chibis, two or three
// pages of text, "Weiter" and "Überspringen". Scenes are painted once; only a few moths drift
// (still under reduced motion). Screen readers hear each page.

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { COLORS, announce, emblemTexture, reducedMotion } from '../core/fx';
import { button } from '../core/ui';
import { sfx } from '../core/audio';
import { CHAPTER_COUNT, REGULARS, chapterDue, markChapter, type RegularId } from '../core/story';
import type { GameState } from '../core/state';
import { buildQueen } from '../games/queen/paint';
import { Chibi } from '../world/painted/chibi';
import { GOLD, INK, ellipse, fillInk, glowAt, gold, paint, rgb, rrect, seeded, type Ctx } from '../world/painted/brush';
import { CREAM } from './kit';
import { Panel } from './panel';

import { BOSS_NAME, DOME, FOUNDER } from '../core/brand';
/** Scene size in its own units; scaled to the frame. */
const SW = 640;
const SH = 300;

type Who = RegularId | 'you' | 'queen';

interface Chapter {
  title: string;
  pages: string[];
  scene: (c: Ctx) => void;
  /** Who stands in the scene, where (scene units, feet) and how big. */
  cast: { who: Who; x: number; y: number; s?: number; face?: number }[];
  /** Moth colour drifting in the scene. */
  moths: number;
}

// ---- Painted backdrops ------------------------------------------------------------------------

function sky(c: Ctx, top: string, bottom: string) {
  const g = c.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, SW, SH);
}

function stars(c: Ctx, n: number, seed: number, maxY = SH * 0.6) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * SW;
    const y = r() * maxY;
    glowAt(c, x, y, 2 + r() * 3, 2 + r() * 3, 0xfff4dc, 0.3 + r() * 0.5);
  }
}

function floorBand(c: Ctx, y: number, col: string, col2: string) {
  const g = c.createLinearGradient(0, y, 0, SH);
  g.addColorStop(0, col);
  g.addColorStop(1, col2);
  c.fillStyle = g;
  c.fillRect(0, y, SW, SH - y);
  c.strokeStyle = 'rgba(224,178,90,0.35)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, y);
  c.lineTo(SW, y);
  c.stroke();
}

function column(c: Ctx, x: number, top: number, bottom: number) {
  rrect(c, x - 14, top, 28, bottom - top, 4);
  const g = c.createLinearGradient(x - 14, 0, x + 14, 0);
  g.addColorStop(0, '#2a1838');
  g.addColorStop(0.4, '#5a3a78');
  g.addColorStop(1, '#1a0c24');
  fillInk(c, g, 2);
  rrect(c, x - 18, top - 6, 36, 10, 3);
  fillInk(c, gold(c, x - 18, top - 6, x + 18, top + 4), 1.6);
  rrect(c, x - 18, bottom - 6, 36, 10, 3);
  fillInk(c, gold(c, x - 18, bottom - 6, x + 18, bottom + 4), 1.6);
}

function table(c: Ctx, x: number, y: number, w: number) {
  ellipse(c, x, y, w, w * 0.28);
  const g = c.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, '#3a1e10');
  g.addColorStop(0.5, '#7a4a28');
  g.addColorStop(1, '#2a140a');
  fillInk(c, g, 2);
  rrect(c, x - 5, y + w * 0.2, 10, 46, 3);
  fillInk(c, '#2a140a', 1.6);
}

/** Throne room: the round moon window, columns, the crown laid on a little table. */
function sceneThrone(c: Ctx) {
  sky(c, '#1a0c2a', '#2a1236');
  // Moon window.
  glowAt(c, SW / 2, 96, 150, 120, 0xc9d8ff, 0.35);
  c.beginPath();
  c.arc(SW / 2, 96, 70, 0, Math.PI * 2);
  const m = c.createRadialGradient(SW / 2 - 18, 80, 8, SW / 2, 96, 70);
  m.addColorStop(0, '#fbf6ff');
  m.addColorStop(0.7, '#c9d4f0');
  m.addColorStop(1, '#8a90c0');
  fillInk(c, m, 4);
  c.strokeStyle = rgb(GOLD);
  c.lineWidth = 3;
  c.stroke();
  for (const a of [0, Math.PI / 2]) {
    c.beginPath();
    c.moveTo(SW / 2 + Math.cos(a) * 70, 96 + Math.sin(a) * 70);
    c.lineTo(SW / 2 - Math.cos(a) * 70, 96 - Math.sin(a) * 70);
    c.strokeStyle = 'rgba(60,40,80,0.6)';
    c.lineWidth = 3;
    c.stroke();
  }
  column(c, 90, 20, 230);
  column(c, SW - 90, 20, 230);
  floorBand(c, 222, '#3a1840', '#14081a');
  // Carpet to the throne.
  c.beginPath();
  c.moveTo(SW / 2 - 60, 222);
  c.lineTo(SW / 2 + 60, 222);
  c.lineTo(SW / 2 + 130, SH);
  c.lineTo(SW / 2 - 130, SH);
  c.closePath();
  c.fillStyle = '#6b1a2e';
  c.fill();
  // Doorway on the left, warm light from the corridor.
  rrect(c, 22, 92, 70, 140, 34);
  fillInk(c, '#3a1e10', 2.4);
  rrect(c, 30, 100, 54, 132, 28);
  const dl = c.createLinearGradient(0, 100, 0, 232);
  dl.addColorStop(0, '#ffd890');
  dl.addColorStop(1, '#8a5a28');
  c.fillStyle = dl;
  c.fill();
  glowAt(c, 57, 200, 70, 40, 0xffd890, 0.35);
  table(c, 470, 238, 34);
  // Selene's old lamplighter pole, leaning on the table.
  c.beginPath();
  c.moveTo(452, 262);
  c.lineTo(500, 128);
  c.strokeStyle = INK;
  c.lineWidth = 5;
  c.stroke();
  c.strokeStyle = gold(c, 452, 128, 500, 262);
  c.lineWidth = 3;
  c.stroke();
  c.beginPath();
  c.arc(503, 122, 7, Math.PI * 0.9, Math.PI * 2.2);
  c.strokeStyle = rgb(GOLD);
  c.lineWidth = 2.6;
  c.stroke();
  glowAt(c, 503, 122, 16, 16, 0xffd890, 0.5);
}

/** The cashier's office: an open safe, a desk with the ledger under a green lamp. */
function sceneLedger(c: Ctx) {
  sky(c, '#24140e', '#160a08');
  // Wood panelling.
  c.fillStyle = 'rgba(90,50,24,0.35)';
  for (let x = 20; x < SW; x += 70) c.fillRect(x, 20, 56, 180);
  // Safe on the left, door ajar.
  rrect(c, 40, 70, 120, 150, 8);
  fillInk(c, '#3a3a44', 2.4);
  rrect(c, 54, 84, 92, 122, 6);
  c.fillStyle = '#121218';
  c.fill();
  c.save();
  c.translate(146, 84);
  c.transform(0.45, 0.08, 0, 1, 0, 0);
  rrect(c, 0, 0, 92, 122, 6);
  fillInk(c, '#5a5a66', 2);
  c.beginPath();
  c.arc(46, 61, 16, 0, Math.PI * 2);
  fillInk(c, gold(c, 30, 45, 62, 77), 1.6);
  c.restore();
  floorBand(c, 222, '#3a2014', '#1a0c08');
  // Desk with the ledger and the lamp.
  rrect(c, 300, 182, 250, 22, 4);
  fillInk(c, '#5a3018', 2);
  rrect(c, 312, 204, 16, 40, 2);
  fillInk(c, '#3a1e10', 1.4);
  rrect(c, 522, 204, 16, 40, 2);
  fillInk(c, '#3a1e10', 1.4);
  glowAt(c, 470, 170, 110, 70, 0xb8f0a0, 0.3);
  // Open ledger.
  c.save();
  c.translate(400, 176);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(s * 52, -6);
    c.lineTo(s * 50, 10);
    c.lineTo(0, 14);
    c.closePath();
    fillInk(c, '#f4e8c8', 1.4);
    c.strokeStyle = 'rgba(60,40,30,0.5)';
    c.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.moveTo(s * 8, 1 + k * 3);
      c.lineTo(s * 44, -3 + k * 3);
      c.stroke();
    }
  }
  c.beginPath();
  c.moveTo(10, 10);
  c.lineTo(40, 6);
  c.strokeStyle = '#b8243a';
  c.lineWidth = 1.6;
  c.stroke();
  c.restore();
  // Banker's lamp.
  rrect(c, 486, 160, 6, 22, 2);
  fillInk(c, gold(c, 486, 160, 492, 182), 1);
  c.beginPath();
  c.ellipse(489, 158, 24, 9, 0, Math.PI, 0);
  c.closePath();
  fillInk(c, '#1f6a3a', 1.8);
}

/** The service stairs to the roof: a locked door with silver light through the keyhole. */
function sceneStairs(c: Ctx) {
  sky(c, '#120a1c', '#0a0610');
  // Stone wall.
  const r = seeded(7);
  for (let y = 0; y < 230; y += 26)
    for (let x = (y / 26) % 2 ? -30 : 0; x < SW; x += 60) {
      rrect(c, x + 2, y + 2, 56, 22, 3);
      c.fillStyle = `rgba(70,50,90,${0.25 + r() * 0.2})`;
      c.fill();
    }
  // Steps rising to the right.
  for (let i = 0; i < 8; i++) {
    const x = 120 + i * 50;
    const y = 270 - i * 22;
    c.beginPath();
    c.rect(x, y, 60, SH - y);
    const g = c.createLinearGradient(0, y, 0, y + 30);
    g.addColorStop(0, '#5a4268');
    g.addColorStop(1, '#2a1a34');
    fillInk(c, g, 1.6);
  }
  // The door at the top.
  const dx = 540;
  const dy = 40;
  rrect(c, dx - 40, dy, 80, 120, 36);
  fillInk(c, '#3a2214', 2.6);
  rrect(c, dx - 32, dy + 10, 64, 104, 30);
  c.strokeStyle = 'rgba(224,178,90,0.4)';
  c.lineWidth = 2;
  c.stroke();
  // Light beam from the keyhole.
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.beginPath();
  c.moveTo(dx + 10, dy + 74);
  c.lineTo(dx - 300, dy + 40);
  c.lineTo(dx - 300, dy + 150);
  c.closePath();
  const b = c.createLinearGradient(dx, 0, dx - 300, 0);
  b.addColorStop(0, 'rgba(210,220,255,0.55)');
  b.addColorStop(1, 'rgba(210,220,255,0)');
  c.fillStyle = b;
  c.fill();
  c.restore();
  c.beginPath();
  c.arc(dx + 12, dy + 70, 4, 0, Math.PI * 2);
  c.rect(dx + 10, dy + 70, 4, 9);
  c.fillStyle = '#e8eeff';
  c.fill();
  glowAt(c, dx + 12, dy + 74, 18, 18, 0xdfe6ff, 0.6);
}

/** The bar: the big mirror, glasses, the letter with its moth seal on the counter. */
function sceneLetter(c: Ctx) {
  sky(c, '#2a0e1a', '#140810');
  // Mirror behind the bar.
  rrect(c, 140, 24, 360, 130, 10);
  fillInk(c, gold(c, 140, 24, 500, 154), 3);
  rrect(c, 152, 36, 336, 106, 6);
  const m = c.createLinearGradient(152, 36, 488, 142);
  m.addColorStop(0, '#5a6a8a');
  m.addColorStop(0.5, '#2a3048');
  m.addColorStop(1, '#4a5a7a');
  c.fillStyle = m;
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(200, 140);
  c.lineTo(260, 40);
  c.moveTo(240, 140);
  c.lineTo(290, 50);
  c.stroke();
  // Shelf with bottles of lemonade.
  const cols = ['#e04a6a', '#7bd47b', '#ffcf7a', '#9fc4ff', '#ff9ac0'];
  for (let i = 0; i < 9; i++) {
    const x = 170 + i * 36;
    rrect(c, x, 154, 14, 30, 4);
    fillInk(c, cols[i % cols.length], 1.4);
  }
  floorBand(c, 240, '#2a1018', '#120608');
  // Counter.
  rrect(c, 40, 196, SW - 80, 40, 6);
  const g = c.createLinearGradient(0, 196, 0, 236);
  g.addColorStop(0, '#8a4a28');
  g.addColorStop(1, '#3a1a0c');
  fillInk(c, g, 2.4);
  c.fillStyle = rgb(GOLD, 0.8);
  c.fillRect(40, 196, SW - 80, 3);
  // The envelope.
  c.save();
  c.translate(322, 200);
  c.rotate(-0.08);
  rrect(c, -34, -20, 68, 40, 3);
  fillInk(c, '#efe0b8', 1.6);
  c.beginPath();
  c.moveTo(-34, -20);
  c.lineTo(0, 4);
  c.lineTo(34, -20);
  c.strokeStyle = 'rgba(90,60,30,0.6)';
  c.lineWidth = 1.2;
  c.stroke();
  c.beginPath();
  c.arc(0, 4, 7, 0, Math.PI * 2);
  fillInk(c, '#a01830', 1.2);
  c.restore();
  glowAt(c, 322, 196, 50, 26, 0xffe8b0, 0.3);
}

/** The roof at night: stars, the city below and the great moon lamp. */
function sceneRoof(c: Ctx, dawn = false) {
  if (dawn) sky(c, '#f0a0a8', '#ffd8a8');
  else sky(c, '#0c0a24', '#2a1a48');
  stars(c, dawn ? 8 : 60, 11);
  if (dawn) glowAt(c, SW * 0.78, SH * 0.62, 180, 90, 0xfff0c0, 0.7);
  // City skyline.
  const r = seeded(5);
  for (let x = -10; x < SW; x += 28 + r() * 30) {
    const h = 30 + r() * 70;
    const w = 24 + r() * 26;
    c.fillStyle = dawn ? '#a0607a' : '#1a1030';
    c.fillRect(x, 230 - h, w, h);
    for (let k = 0; k < 4; k++)
      if (r() < 0.5) {
        c.fillStyle = dawn ? 'rgba(255,230,190,0.5)' : 'rgba(255,207,122,0.8)';
        c.fillRect(x + 4 + r() * (w - 10), 230 - h + 6 + r() * (h - 14), 3, 4);
      }
  }
  // Roof edge and tiles.
  floorBand(c, 222, dawn ? '#7a4a5a' : '#3a2440', dawn ? '#4a2a3a' : '#14081a');
  // The lamp on its post.
  const lx = 292;
  rrect(c, lx - 5, 120, 10, 104, 3);
  fillInk(c, gold(c, lx - 5, 120, lx + 5, 224), 1.6);
  glowAt(c, lx, 96, 160, 130, dawn ? 0xfff4dc : 0xdfe8ff, dawn ? 0.4 : 0.6);
  c.beginPath();
  c.moveTo(lx - 24, 120);
  c.lineTo(lx - 18, 76);
  c.lineTo(lx + 18, 76);
  c.lineTo(lx + 24, 120);
  c.closePath();
  const gl = c.createRadialGradient(lx, 98, 2, lx, 98, 30);
  gl.addColorStop(0, '#ffffff');
  gl.addColorStop(1, '#c9d8ff');
  fillInk(c, gl, 2.4);
  c.beginPath();
  c.moveTo(lx - 26, 78);
  c.quadraticCurveTo(lx, 50, lx + 26, 78);
  c.closePath();
  fillInk(c, gold(c, lx - 26, 50, lx + 26, 78), 2);
}

function sceneDawn(c: Ctx) {
  sceneRoof(c, true);
}

// ---- The chapters ---------------------------------------------------------------------------------

const CHAPTERS: Chapter[] = [
  {
    title: 'Die Lampenanzünderin',
    pages: [
      `Der Lichtfächer der Herrin der Lampen sinkt. Für einen Moment ist es still unter der ${DOME} – nur die Lampen flackern leise um den Mond im Fenster.`,
      'Sie nimmt die Krone ab und legt sie auf den kleinen Tisch. „Gut gespielt“, sagt sie leise. „Und gut aufgehört, als der Abend vorbei war.“',
      `In der Tür steht Anselm, der alte Croupier. „${BOSS_NAME}“, sagt er nur. Sie lächelt. „Du hast es ihnen also nie erzählt.“ – „Noch nicht“, sagt er. „Aber bald.“`,
    ],
    scene: sceneThrone,
    cast: [
      { who: 'queen', x: 320, y: 236, s: 0.95 },
      { who: 'you', x: 220, y: 280, face: -0.6 },
      { who: 'anselm', x: 70, y: 268, face: 0 },
    ],
    moths: 0xdfe6ff,
  },
  {
    title: 'Das Kassenbuch',
    pages: [
      'Kommissarin Brandt hat den alten Tresor im Kassenraum geöffnet. Darin: kein Gold. Nur ein abgegriffenes Kassenbuch.',
      `Die letzte Zeile, vierzig Jahre alt, in ${FOUNDER}s Handschrift: „Einsatz: alles. Ich höre auf.“`,
      'Selene liest über Brandts Schulter mit. „Er hat aufgehört“, sagt sie. „Das war das Mutigste, was er je getan hat.“ Die Kommissarin klappt ihr Notizbuch zu – und gleich wieder auf.',
    ],
    scene: sceneLedger,
    cast: [
      { who: 'ida', x: 360, y: 272, face: -1.2 },
      { who: 'queen', x: 548, y: 236, s: 0.72 },
      { who: 'you', x: 220, y: 284 },
    ],
    moths: 0xffe0a0,
  },
  {
    title: 'Wohin das Licht zieht',
    pages: [
      'Professor Seidenspinner ist sich sicher: Das Licht im Haus zieht nicht zum Gold. Es zieht nach oben. Also steigt ihr die alte Dienstbotentreppe hinauf, Stufe um Stufe.',
      'Ganz oben wartet eine verschlossene Tür. Durch das Schlüsselloch fällt silbernes Licht, schwach und flackernd, als wäre es müde.',
      '„Die Mondlampe“, flüstert der Professor. Hinter euch legt Anselm die Hand auf seine Westentasche. Etwas Kleines, Schweres klimpert darin.',
    ],
    scene: sceneStairs,
    cast: [
      { who: 'theo', x: 430, y: 128, face: -0.3 },
      { who: 'you', x: 330, y: 172, face: -0.3 },
      { who: 'anselm', x: 160, y: 262, face: 0 },
    ],
    moths: 0xdfe6ff,
  },
  {
    title: 'Der Brief hinter dem Spiegel',
    pages: [
      'Mira reicht dir den vergilbten Umschlag mit dem alten Wachssiegel. „Für die Person, die Selene die Krone abnimmt“, steht darauf. Jonas schaut neugierig über deine Schulter.',
      '„Ich konnte nie aufhören, wenn der Abend vorbei war“, schreibt Leopold. „Also bin ich gegangen, bevor das Haus mit mir untergeht. Selene weiß, wann die Lampen ausgehen. Darum gehört ihr das Haus.“',
      '„Pass gut auf sie auf. Und geh nach Hause, wenn es Zeit ist. – L.“ Jonas sagt lange nichts. Dann stellt er seinen Wecker eine Stunde früher.',
    ],
    scene: sceneLetter,
    cast: [
      { who: 'mira', x: 450, y: 196, face: Math.PI / 2 },
      { who: 'you', x: 300, y: 290 },
      { who: 'jonas', x: 200, y: 290, face: 0 },
    ],
    moths: 0xffcf7a,
  },
  {
    title: 'Die Mondlampe',
    pages: [
      'Anselm dreht den alten Schlüssel im Schloss. Die Tür zum Dach geht auf, die Nachtluft riecht nach Regen und Lindenblüten. Alle sind da: Mira, Jonas, die Kommissarin, der Professor.',
      'In der Mitte steht die Mondlampe, kaum heller als eine Kerze. Selene reicht dir die lange Messingstange, die sie früher jeden Abend getragen hat. „Zusammen“, sagt sie.',
      'Die Lampe flammt auf. Tausend Lichter gehen in allen Fenstern des Hauses an und leuchten über die Stadt. Unten auf der Straße bleiben Leute stehen und schauen nach oben.',
    ],
    scene: sceneRoof,
    cast: [
      { who: 'mira', x: 46, y: 268 },
      { who: 'jonas', x: 108, y: 286 },
      { who: 'anselm', x: 168, y: 270, face: 0 },
      { who: 'you', x: 236, y: 290, face: -0.4 },
      { who: 'queen', x: 420, y: 250, s: 0.72 },
      { who: 'ida', x: 528, y: 272, face: Math.PI },
      { who: 'theo', x: 592, y: 286 },
    ],
    moths: 0xfff1c4,
  },
  {
    title: 'Morgengrauen',
    pages: [
      'Der Himmel wird rosa. Einer nach dem anderen gehen die Stammgäste nach Hause – Jonas zuerst, pfeifend, die Hände in den Taschen.',
      'Selene gibt dir einen kleinen Messingschlüssel. „Für die Tür“, sagt sie. „Komm, wann du willst. Und geh, wann du willst. Das ist das ganze Geheimnis dieses Hauses.“',
      'Die Mondlampe leuchtet weiter, auch am Tag, ganz leise. Die Geschichte ist erzählt. Das Haus bleibt offen – und jeder Abend darf enden.',
    ],
    scene: sceneDawn,
    cast: [
      { who: 'you', x: 340, y: 290, face: 0 },
      { who: 'queen', x: 440, y: 250, s: 0.72 },
      { who: 'mira', x: 520, y: 270 },
      { who: 'anselm', x: 590, y: 284 },
      { who: 'jonas', x: 70, y: 274, face: Math.PI },
    ],
    moths: 0xfff4dc,
  },
];

export const chapterTitle = (n: number) => CHAPTERS[n - 1]?.title ?? '';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const sceneCache = new Map<number, Texture>();
function sceneTexture(n: number) {
  let t = sceneCache.get(n);
  if (!t) {
    const ch = CHAPTERS[n - 1];
    t = paint(SW, SH, (c) => {
      ch.scene(c);
      // Painted vignette inside the frame.
      const v = c.createRadialGradient(SW / 2, SH / 2, SH * 0.4, SW / 2, SH / 2, SW * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(8,2,10,0.55)');
      c.fillStyle = v;
      c.fillRect(0, 0, SW, SH);
    }, 2);
    sceneCache.set(n, t);
  }
  return t;
}

/** Brass picture frame around the scene. */
function frameTexture(w: number, h: number) {
  return paint(w + 16, h + 16, (c) => {
    c.translate(8, 8);
    rrect(c, -4, -4, w + 8, h + 8, 10);
    c.lineWidth = 8;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = 5;
    c.strokeStyle = gold(c, 0, 0, w, h);
    c.stroke();
    rrect(c, 1, 1, w - 2, h - 2, 6);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,240,200,0.5)';
    c.stroke();
  }, 2);
}

// ---- The panel ------------------------------------------------------------------------------------

export class ChapterPanel extends Panel {
  private page = 0;
  private ch: Chapter;

  constructor(
    private state: GameState,
    private n: number,
    private onDone: () => void,
  ) {
    super();
    this.ch = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length, n) - 1)];
    this.bgAlpha = 0.82;
    markChapter(state, n);
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') this.close();
    else if (e.code === 'ArrowRight') this.next();
  };

  private closed = false;
  private close() {
    if (this.closed) return;
    this.closed = true;
    this.onDone();
  }

  private next() {
    if (this.page >= this.ch.pages.length - 1) return this.close();
    this.page++;
    sfx.rustle();
    this.rebuild();
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    super.destroy();
  }

  /** The scene with its cast; built once and kept across pages. */
  private buildScene() {
    const c = new Container();
    const bg = new Sprite(sceneTexture(this.n));
    c.addChild(bg);
    const people = new Container();
    people.sortableChildren = true;
    c.addChild(people);
    for (const m of this.ch.cast) {
      if (m.who === 'queen') {
        const q = buildQueen();
        q.c.position.set(m.x, m.y - 76 * (m.s ?? 1));
        q.c.scale.set(m.s ?? 1);
        q.c.zIndex = m.y;
        people.addChild(q.c);
        continue;
      }
      let p: Chibi;
      if (m.who === 'you') {
        const host = this.state.data.players.host;
        p = new Chibi(host?.color ?? COLORS.lamp, { skin: host?.skin, ...this.state.look });
      } else {
        const r = REGULARS.find((x) => x.id === m.who)!;
        p = new Chibi(r.color, r.look);
      }
      p.faceTowards(m.face ?? Math.PI / 2);
      // Settle the facing (no walking): a few silent updates.
      for (let k = 0; k < 20; k++) p.update(50, null);
      p.view.position.set(m.x, m.y);
      p.view.scale.set(0.82 * (m.s ?? 1.25));
      p.view.zIndex = m.y;
      people.addChild(p.view);
    }
    // A few moths drifting through the light.
    const moths: { s: Sprite; x: number; y: number; ph: number; sp: number }[] = [];
    const r = seeded(this.n * 17);
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(emblemTexture());
      s.anchor.set(0.5);
      s.tint = this.ch.moths;
      s.alpha = 0.75;
      s.scale.set(0.16 + r() * 0.12);
      const x = 40 + r() * (SW - 80);
      const y = 30 + r() * 140;
      s.position.set(x, y);
      c.addChild(s);
      moths.push({ s, x, y, ph: r() * 10, sp: 0.4 + r() * 0.5 });
    }
    const mask = new Graphics().roundRect(0, 0, SW, SH, 8).fill(0xffffff);
    c.addChild(mask);
    c.mask = mask;
    return { c, moths };
  }

  protected build() {
    const n = this.narrow;
    const W = (this.W = n ? 404 : 860);
    const sw = n ? 372 : 760;
    const sh = (sw * SH) / SW;
    const top = n ? 92 : 98;
    const textY = top + sh + (n ? 22 : 26);
    const textW = n ? 360 : 720;
    const size = n ? 18 : 21;
    const last = this.page >= this.ch.pages.length - 1;
    const body = this.text(this.ch.pages[this.page], size, CREAM, false, textW);
    body.style.align = 'left';
    const textH = Math.max(body.height, n ? 124 : 80);
    const final = this.n >= CHAPTER_COUNT;
    this.frame(final ? 'LETZTES KAPITEL' : `KAPITEL ${ROMAN[this.n - 1] ?? this.n}`, 0xc9a0ff, () => this.close());
    const title = this.text(`„${this.ch.title}“`, n ? 22 : 26, 0xfff1c4, true);
    title.anchor.set(0.5, 0);
    title.position.set(W / 2, n ? 50 : 52);
    if (title.width > W - 120) title.scale.set((W - 120) / title.width);
    this.panel.addChild(title);
    // Scene in its brass frame.
    const fr = new Sprite(frameTexture(sw, sh));
    fr.position.set((W - sw) / 2 - 8, top - 8);
    const { c: scene, moths } = this.buildScene();
    scene.scale.set(sw / SW);
    scene.position.set((W - sw) / 2, top);
    this.panel.addChild(scene, fr);
    if (!reducedMotion())
      this.tickers.push((t) => {
        for (const m of moths) {
          const a = t * m.sp + m.ph;
          m.s.position.set(m.x + Math.sin(a) * 30, m.y + Math.sin(a * 1.7) * 14 - ((t * 6 * m.sp) % 40));
          m.s.scale.x = Math.abs(m.s.scale.y) * (0.35 + 0.65 * Math.abs(Math.cos(t * 16 + m.ph)));
        }
      });
    body.position.set((W - textW) / 2, textY);
    this.panel.addChild(body);
    // Page dots, then the buttons.
    const bottom = textY + textH + 14;
    const dots = new Graphics();
    this.ch.pages.forEach((_, i) => {
      const x = W / 2 + (i - (this.ch.pages.length - 1) / 2) * 18;
      dots.circle(x, bottom, 5).fill({ color: i === this.page ? COLORS.brass : 0x4a2a3a }).stroke({ color: 0x1a0b10, width: 1.5 });
    });
    this.panel.addChild(dots);
    const nextLabel = last ? (final ? 'ENDE' : 'SCHLIESSEN') : 'WEITER';
    const nb = button({ label: nextLabel, width: n ? 300 : 220, height: 56, color: COLORS.brass, fontSize: 21, onClick: () => this.next() });
    const sb = button({ label: 'Überspringen', width: n ? 300 : 200, height: 48, color: 0x3a1428, textColor: 0xf2e6c9, fontSize: 18, display: false, onClick: () => this.close() });
    if (n) {
      nb.position.set(W / 2, bottom + 48);
      sb.position.set(W / 2, bottom + 108);
      this.H = bottom + 150;
    } else {
      nb.position.set(W - 150, bottom + 46);
      sb.position.set(140, bottom + 46);
      this.H = bottom + 86;
    }
    this.panel.addChild(nb);
    if (!last) this.panel.addChild(sb);
    announce(`Kapitel ${this.n}: ${this.ch.title}. Seite ${this.page + 1} von ${this.ch.pages.length}. ${this.ch.pages[this.page]}`);
  }
}

/**
 * After a won season: shows the next unread chapter, if any. Returns false when there is
 * none (then `then` is not called and the caller goes on as usual).
 */
export function showChapterIfDue(state: GameState, show: (p: ChapterPanel) => void, then: () => void) {
  const n = chapterDue(state.data);
  if (n <= 0) return false;
  sfx.chime();
  show(new ChapterPanel(state, n, then));
  return true;
}
