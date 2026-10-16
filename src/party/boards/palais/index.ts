// Palais Lumen: the Art-déco grand hotel of our casino game as a board. Night blue and brass,
// carpets with chase lights, a roulette wheel in the middle of the terrace.
// Paths: Foyer (START) → Weiche West (J1): Spielsaal (long, safe, shop, Kumpel, Jetonfeld) or
//   Barpassage to the Westdock (JW) → Weiche JW: Treppenaufgang (on) or Roulette-Steg Ost
//   (across the wheel, only when the bridge lies west–east) → Nordgalerie → Weiche JN:
//   Galerie Ost or Roulette-Steg Süd (across the wheel straight back to the Foyer, only when the
//   bridge lies north–south) → Weiche Ost (J3): Ballsaal (long) or Wintergarten → Foyer.
// Main gimmick (Takt): the Rouletterad turns a quarter every 3 rounds and so switches which wing
//   the bridge on it connects. Whoever stands on the wheel rides along (never stuck).
// Board field X: Jetonfeld: 5 coins on Rot or Schwarz, the ball rolls on the big wheel; a win
//   pays double, a loss goes into the Jackpot, Zero wins half the Jackpot.
// Brettfest every 5 rounds: Jackpot-Gala, the Jackpot (+10 from the house) is paid to all,
//   graded by rank: the last gets the most.

import { buildGraph, type Segment } from '../graph';
import type { BoardApi, BoardDef, BNode } from '../types';
import { ranking } from '../../engine/state';
import { ITEMS, ITEM_IDS, MAX_ITEMS } from '../../engine/tables';
import { POCKETS, RED, WHEEL } from './data';
import { palaisDecor } from './view';

const SEGS: Segment[] = [
  { id: 's1', from: 'START', to: 'J1', pts: [[0, 17], [-8, 18.6], [-15, 17.2], [-20.5, 13]], pat: 'PPEPT' },
  { id: 'a', from: 'J1', to: 'J2', route: 'Spielsaal', pts: [[-20.5, 13], [-27.5, 10.5], [-32, 3.5], [-32.5, -5], [-29, -12.5], [-23, -17.5], [-17, -18.5]], pat: 'PPSPLPBPXPEPP' },
  { id: 'b', from: 'J1', to: 'JW', route: 'Barpassage', pts: [[-20.5, 13], [-15.5, 8.5], [-11.2, 3.5], [-8.6, -2]], pat: 'PMDP' },
  { id: 'b2', from: 'JW', to: 'J2', route: 'Treppenaufgang', pts: [[-8.6, -2], [-10, -8], [-12.5, -13.8], [-17, -18.5]], pat: 'MPEP' },
  { id: 'we', from: 'JW', to: 'ME', route: 'Roulette-Steg Ost', pts: [[-8.6, -2], [0, -2], [8.6, -2]], pat: 'PX' },
  { id: 'top1', from: 'J2', to: 'JN', pts: [[-17, -18.5], [-10, -21], [-5, -17.6], [0, -10.6]], pat: 'PLPMP' },
  { id: 'top2', from: 'JN', to: 'J3', route: 'Galerie Ost', pts: [[0, -10.6], [5, -17.6], [10, -21], [17, -18.5]], pat: 'PEPSP' },
  { id: 'ns', from: 'JN', to: 'START', route: 'Roulette-Steg Süd', pts: [[0, -10.6], [0, -2], [0, 17]], pat: 'MPLPD' },
  { id: 'c', from: 'J3', to: 'J4', route: 'Ballsaal', pts: [[17, -18.5], [23.5, -17.5], [29.5, -12], [32.5, -4], [32, 4], [27.5, 10.5], [20.5, 13]], pat: 'PPEPBPXPLPMPP' },
  { id: 'd1', from: 'J3', to: 'ME', route: 'Wintergarten', pts: [[17, -18.5], [12.8, -13.8], [10, -8], [8.6, -2]], pat: 'MPR' },
  { id: 'd2', from: 'ME', to: 'J4', pts: [[8.6, -2], [10, 4], [14.5, 9.5], [20.5, 13]], pat: 'PDPMP' },
  { id: 's2', from: 'J4', to: 'START', pts: [[20.5, 13], [15, 17.2], [8, 18.6], [0, 17]], pat: 'PSPEPB' },
];

const inHole = (x: number, z: number) => Math.hypot(x - WHEEL.x, z - WHEEL.z) < WHEEL.hole;
const graph = buildGraph(SEGS, {
  named: { START: 'G', J1: 'E', JW: 'P', J2: 'P', JN: 'L', J3: 'P', ME: 'P', J4: 'L' },
  start: 'START',
  skip: inHole,
  // every edge gets its own carpet; the two edges over the wheel are the bridge
  flag: (a, b) => (Math.hypot(a.x - WHEEL.x, a.z - WHEEL.z) < 6 && Math.hypot(b.x - WHEEL.x, b.z - WHEEL.z) < 6 ? 'steg' : 'carpet'),
});

const N = graph.nodes;
const crossing = (seg: string) => graph.edges.find((e) => e.seg === seg && e.flag === 'steg')!;
/** The two crossings of the wheel: west → east and north → south. */
const WE = crossing('we'), NS = crossing('ns');
/** Dock spaces on the wheel by board angle: W, N, E, S. A quarter turn moves W→N→E→S→W. */
const DOCKS = { W: WE.a, E: WE.b, N: NS.a, S: NS.b };
const RIDE: Record<number, number> = { [DOCKS.W]: DOCKS.N, [DOCKS.N]: DOCKS.E, [DOCKS.E]: DOCKS.S, [DOCKS.S]: DOCKS.W };

export interface PalaisState {
  /** Quarter turns of the wheel; even = the bridge lies west–east, odd = north–south. */
  wheel: number;
  jackpot: number;
  /** Round of the last Jackpot-Gala (0 = none running). */
  gala: number;
}
const ps = (bs: Record<string, unknown>) => bs as unknown as PalaisState;
const weOpen = (s: PalaisState) => s.wheel % 2 === 0;

const WHERE: Record<string, string> = {
  s1: 'im Foyer West', a: 'im Spielsaal', b: 'in der Barpassage', b2: 'am Treppenaufgang', we: 'auf dem Roulette-Steg',
  top1: 'in der Nordgalerie', top2: 'in der Galerie Ost', ns: 'auf dem Roulette-Steg', c: 'im Ballsaal', d1: 'im Wintergarten',
  d2: 'im Wintergarten', s2: 'im Foyer Ost',
};

/** Turns the wheel a quarter and carries everybody standing on it. */
async function turnWheel(api: BoardApi) {
  const s = ps(api.bs);
  s.wheel = (s.wheel + 1) % 4;
  const riders = api.st.players.map((P, i) => (RIDE[P.node] !== undefined ? i : -1)).filter((i) => i >= 0);
  await api.emit({ k: 'gimmick', name: 'wheel', data: { wheel: s.wheel } });
  for (const p of riders) {
    api.st.players[p].node = RIDE[api.st.players[p].node];
    await api.emit({ k: 'swap', a: p, b: p });
    await api.toast(`${api.st.seats[p].name} fährt auf dem Rad mit.`, '#f2cf74');
  }
  await api.toast(weOpen(s) ? 'Der Steg liegt West–Ost: Der Roulette-Steg Ost ist offen.' : 'Der Steg liegt Nord–Süd: Der Roulette-Steg Süd ist offen.', '#f2cf74');
}

/** The next round (after this one) in which the wheel turns: 4, 7, 10 … */
const nextTurn = (round: number) => round + 3 - ((round - 1) % 3);
const nextGala = (round: number) => (Math.floor(round / 5) + 1) * 5;

const palais: BoardDef = {
  id: 'palais',
  name: 'Palais Lumen',
  blurb: `Das Grandhotel bei Nacht: Messing, Lichterketten und ein Rouletterad, das die Flügel verbindet. ${N.length} Felder, 4 Weichen.`,
  graph,
  xName: 'Jetonfeld',
  initState: () => ({ wheel: 0, jackpot: 10, gala: 0 }) satisfies PalaisState,
  blocked(bs, a, b) {
    const s = ps(bs);
    if (a === WE.a && b === WE.b && !weOpen(s)) return 'Der Steg auf dem Rouletterad liegt quer';
    if (a === NS.a && b === NS.b && weOpen(s)) return 'Der Steg auf dem Rouletterad liegt quer';
    return null;
  },
  async roundStart(api, round) {
    const s = ps(api.bs);
    if (s.gala && s.gala < round) { s.gala = 0; await api.emit({ k: 'gimmick', name: 'gala', data: { on: false } }); }
    if ((round - 1) % 3 === 0) {
      await api.toast('Brett-Ereignis: Das Rouletterad dreht sich eine Vierteldrehung weiter!', '#f2cf74');
      await turnWheel(api);
    }
  },
  async onSpace(api, p) {
    const s = ps(api.bs), P = api.st.players[p], name = api.st.seats[p].name;
    const bet = Math.min(5, P.coins);
    if (bet <= 0) {
      await api.toast(`Jetonfeld! ${name} hat keinen Jeton. Der Croupier schenkt einen.`, '#f2cf74');
      await api.addCoins(p, 2, 'Trostjeton');
      return;
    }
    const a = (await api.ask(p, { q: 'yesno', title: 'Jetonfeld', text: `Setz ${bet} Münzen: Rot oder Schwarz? Treffer zahlt doppelt, Zero den halben Jackpot.`, yes: 'Rot', no: 'Schwarz' })) as { yes?: boolean };
    const color = a.yes === false ? 'schwarz' : 'rot';
    const n = POCKETS[Math.floor(api.rng() * 37)];
    const hit = n === 0 ? 'grün' : RED.has(n) ? 'rot' : 'schwarz';
    await api.toast(`Jetonfeld! ${name} setzt ${bet} Münzen auf ${color === 'rot' ? 'Rot' : 'Schwarz'}.`, '#f2cf74');
    await api.emit({ k: 'gimmick', name: 'jeton', data: { n, color, jackpot: s.jackpot } });
    if (hit === 'grün') {
      const win = Math.max(2, Math.floor(s.jackpot / 2));
      s.jackpot = Math.max(0, s.jackpot - win);
      await api.toast(`Zero! Die Kugel liegt auf Grün: ${name} bekommt den halben Jackpot.`, '#7dff8a');
      await api.addCoins(p, win, 'Zero-Jackpot');
    } else if (hit === color) {
      await api.toast(`${n} ${hit === 'rot' ? 'Rot' : 'Schwarz'}! Gewonnen, der Einsatz zählt doppelt.`, '#7dff8a');
      await api.addCoins(p, bet, 'Jeton ×2');
    } else {
      s.jackpot += bet;
      await api.toast(`${n} ${hit === 'rot' ? 'Rot' : 'Schwarz'}. Verloren: ${bet} Münzen wandern in den Jackpot.`, '#ff6e8a');
      await api.addCoins(p, -bet, 'Jeton verloren');
    }
    await api.emit({ k: 'gimmick', name: 'jackpot', data: { jackpot: s.jackpot } });
  },
  async fest(api) {
    const s = ps(api.bs), st = api.st;
    s.gala = st.round;
    await api.emit({ k: 'banner', text: 'Jackpot-Gala!', color: '#f2cf74' });
    s.jackpot += 10;
    await api.emit({ k: 'gimmick', name: 'gala', data: { on: true, jackpot: s.jackpot } });
    await api.toast(`Brettfest Jackpot-Gala: Das Haus legt 10 drauf. ${s.jackpot} Münzen gehen an alle, wer hinten liegt, bekommt am meisten.`, '#f2cf74');
    const order = ranking(st);
    const W = order.reduce((sum, _, i) => sum + i + 1, 0);
    const pot = s.jackpot;
    for (let i = order.length - 1; i >= 0; i--) {
      const share = Math.floor((pot * (i + 1)) / W);
      if (share <= 0) continue;
      s.jackpot -= share;
      await api.addCoins(order[i], share, `Jackpot · Platz ${i + 1}`);
    }
    await api.emit({ k: 'gimmick', name: 'jackpot', data: { jackpot: s.jackpot } });
  },
  events: [
    { text: 'Der Croupier dreht das Rouletterad weiter!', run: (api) => turnWheel(api) },
    {
      text: 'Lichterkette funkelt: Der Jackpot spendiert dir 5 Münzen.',
      async run(api, p) {
        const s = ps(api.bs), d = Math.min(5, s.jackpot);
        s.jackpot -= d;
        await api.emit({ k: 'gimmick', name: 'jackpot', data: { jackpot: s.jackpot, flash: true } });
        if (d > 0) await api.addCoins(p, d, 'Jackpot'); else await api.addCoins(p, 2, 'Lichterkette');
      },
    },
    {
      text: 'Trinkgeld für den Pagen: 3 Münzen gehen in den Jackpot.',
      async run(api, p) {
        const s = ps(api.bs), d = Math.min(3, api.st.players[p].coins);
        s.jackpot += d;
        if (d > 0) await api.addCoins(p, -d, 'Trinkgeld');
        await api.emit({ k: 'gimmick', name: 'jackpot', data: { jackpot: s.jackpot } });
      },
    },
    {
      text: 'Zimmerservice: Der Page bringt dir einen Gegenstand.',
      async run(api, p) {
        const P = api.st.players[p];
        const pool = ITEM_IDS.filter((i) => !api.st.rules.profi || ITEMS[i].pro);
        if (P.items.length >= MAX_ITEMS) { await api.addCoins(p, 4, 'Zimmerservice'); return; }
        const it = pool[Math.floor(api.rng() * pool.length)];
        P.items.push(it);
        await api.toast(`${api.st.seats[p].name} bekommt ${ITEMS[it].name}.`, '#f2cf74');
      },
    },
    { text: 'Der Kronleuchter blendet: Der Stern zieht um!', luck: true, run: (api) => api.moveStar() },
  ],
  info(bs, round, rounds) {
    const s = ps(bs);
    const nt = nextTurn(round);
    const when = nt <= rounds ? `nächste Drehung: Runde ${nt}` : 'dreht sich nicht mehr';
    return [
      { color: '#f2cf74', title: `Rouletterad: Steg ${weOpen(s) ? 'West–Ost' : 'Nord–Süd'}.`, text: `${weOpen(s) ? 'Roulette-Steg Ost offen, Steg Süd zu.' : 'Roulette-Steg Süd offen, Steg Ost zu.'} Dreht alle 3 Runden (${when}). Wer auf dem Rad steht, fährt mit.` },
      { color: '#ff6e8a', title: `Jackpot: ${s.jackpot} Münzen.`, text: 'Jetonfeld: 5 Münzen auf Rot oder Schwarz. Verluste füllen den Jackpot, Zero holt die Hälfte.' },
      s.gala
        ? { color: '#7dff8a', title: 'Jackpot-Gala läuft.', text: 'Alle Lichter an! Der Jackpot wurde nach Rang verteilt.' }
        : nextGala(round) <= rounds
          ? { color: '#7dff8a', title: `Jackpot-Gala in Runde ${nextGala(round)}.`, text: 'Der Jackpot geht an alle, die Letzten bekommen am meisten.' }
          : { color: '#7dff8a', title: 'Keine Jackpot-Gala mehr.', text: 'Der Jackpot bleibt fürs Jetonfeld.' },
    ];
  },
  where: (n: BNode) => (n.seg ? WHERE[n.seg] : n.name === 'START' ? 'im Foyer' : 'an einer Weiche') ?? 'an einer Weiche',
  plusFactor: () => 1,
  decor: (kit) => palaisDecor(kit, { we: WE, ns: NS }),
};

export default palais;
