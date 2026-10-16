// Neonstadt: the pastel city on an island with a neon rim (the board of the Bildprobe).
// 68 spaces on 7 path pieces, two junctions with two ways each:
//   Weiche A: Hafenweg (12, safe, shop and Kumpel) or Brückenweg (9, over the drawbridge).
//   Weiche B: Riesenradbogen (13) or Plaza-Abkürzung (9, closed when the stage faces north).
// Main gimmick: the drawbridge tips every 2 rounds. Board field (X): the Drehbühne on the plaza
// turns and opens or closes the Plaza-Abkürzung. Brettfest: Neonnacht, plus fields pay double.

import { buildGraph, type Segment } from '../graph';
import type { BoardDef, BNode } from '../types';
import { inCanal, neonDecor } from './view';

const SEGS: Segment[] = [
  { id: 's1', from: 'START', to: 'J1', pts: [[0, 17], [-8, 18.6], [-16, 17.6], [-23, 13]], pat: 'PEPLTMP' },
  { id: 'a', from: 'J1', to: 'J3', route: 'Hafenweg', pts: [[-23, 13], [-29, 8], [-31.5, 0], [-31, -8], [-26, -15], [-17, -18.5]], pat: 'PPBPMPLPSPPE' },
  { id: 'b', from: 'J1', to: 'J3', route: 'Brückenweg', pts: [[-23, 13], [-17, 8], [-12.5, 2.5], [-12.5, -2.5], [-14, -10], [-17, -18.5]], pat: 'MPRPDPMPP' },
  { id: 'top', from: 'J3', to: 'J4', pts: [[-17, -18.5], [-8, -21], [2, -20.5], [10, -18.5], [16, -14]], pat: 'PPLPESXMPP' },
  { id: 'c', from: 'J4', to: 'J5', route: 'Riesenradbogen', pts: [[16, -14], [24, -15.5], [30.5, -9], [32.5, 0], [29.5, 9], [21, 14]], pat: 'PPEPBPTLPMPPE' },
  { id: 'd', from: 'J4', to: 'J5', route: 'Plaza-Abkürzung', pts: [[16, -14], [12, -7], [10.5, 1], [14, 9], [21, 14]], pat: 'MPXPDPMLP' },
  { id: 's2', from: 'J5', to: 'START', pts: [[21, 14], [14, 17.2], [7, 18], [0, 17]], pat: 'PSPEPB' },
];

const graph = buildGraph(SEGS, {
  named: { START: 'G', J1: 'E', J3: 'P', J4: 'P', J5: 'L' },
  start: 'START',
  skip: inCanal,
  flag: (a, b, s) => ((s.id === 'a' || s.id === 'b') && Math.sign(a.z) !== Math.sign(b.z) && a.x < -6 ? (s.id === 'b' ? 'draw' : 'fixed') : undefined),
});

const J4 = graph.nodes.find((n) => n.name === 'J4')!.id;
const D_FIRST = graph.nodes.find((n) => n.seg === 'd')!.id;
const DRAW = graph.edges.find((e) => e.flag === 'draw')!;

export interface NeonState { bridgeUp: boolean; plazaOpen: boolean; night: number }

const WHERE: Record<string, string> = { s1: 'am Start', a: 'am Hafenweg', b: 'am Brückenweg', top: 'an der Nordstraße', c: 'am Riesenradbogen', d: 'an der Plaza', s2: 'vor dem Ziel' };

const ns = (bs: Record<string, unknown>) => bs as unknown as NeonState;

const neonstadt: BoardDef = {
  id: 'neonstadt',
  name: 'Neonstadt',
  blurb: 'Pastellstadt mit Neonrand: Zugbrücke, Riesenrad und Drehbühne. 68 Felder, 2 Weichen.',
  graph,
  xName: 'Drehbühne',
  initState: () => ({ bridgeUp: false, plazaOpen: true, night: 0 }) satisfies NeonState,
  blocked(bs, a, b) {
    const s = ns(bs);
    if (s.bridgeUp && a === DRAW.a && b === DRAW.b) return 'Zugbrücke oben';
    if (!s.plazaOpen && a === J4 && b === D_FIRST) return 'Drehbühne zeigt nach Norden';
    return null;
  },
  async roundStart(api, round) {
    if (round % 2 === 0) {
      const s = ns(api.bs);
      s.bridgeUp = !s.bridgeUp;
      await api.toast('Brett-Ereignis: Die Zugbrücke kippt!', '#2fe6ff');
      await api.emit({ k: 'gimmick', name: 'bridge', data: { up: s.bridgeUp } });
      await api.toast(s.bridgeUp ? 'Die Zugbrücke ist oben. Der Brückenweg ist gesperrt!' : 'Die Zugbrücke ist unten. Der Brückenweg ist offen!', s.bridgeUp ? '#ff3d6e' : '#7dff8a');
    }
    const s = ns(api.bs);
    if (s.night && s.night < round) { s.night = 0; await api.emit({ k: 'gimmick', name: 'night', data: { on: false } }); }
  },
  async onSpace(api, p) {
    const s = ns(api.bs);
    s.plazaOpen = !s.plazaOpen;
    await api.toast(`Drehbühne! ${api.st.seats[p].name} dreht die Plaza.`, '#ff7ad9');
    await api.emit({ k: 'gimmick', name: 'plaza', data: { open: s.plazaOpen } });
    await api.toast(s.plazaOpen ? 'Die Bühne zeigt nach Osten: Die Plaza-Abkürzung ist offen.' : 'Die Bühne zeigt nach Norden: Die Plaza-Abkürzung ist zu.', '#ff7ad9');
    await api.addCoins(p, 3, 'Drehbühne');
  },
  async fest(api) {
    const s = ns(api.bs);
    s.night = api.st.round;
    await api.emit({ k: 'banner', text: 'Neonnacht!', color: '#b46bff' });
    await api.emit({ k: 'gimmick', name: 'night', data: { on: true } });
    await api.toast('Brettfest Neonnacht: Licht aus, Laternen an. Plusfelder zahlen diese Runde doppelt!', '#b46bff');
  },
  events: [
    {
      text: 'Brückenwärter: Die Zugbrücke kippt!',
      async run(api) {
        const s = ns(api.bs);
        s.bridgeUp = !s.bridgeUp;
        await api.emit({ k: 'gimmick', name: 'bridge', data: { up: s.bridgeUp } });
      },
    },
    {
      text: 'Bühnenwind: Die Drehbühne dreht sich!',
      async run(api) {
        const s = ns(api.bs);
        s.plazaOpen = !s.plazaOpen;
        await api.emit({ k: 'gimmick', name: 'plaza', data: { open: s.plazaOpen } });
      },
    },
  ],
  info(bs, round, rounds) {
    const s = ns(bs);
    const nextBridge = round % 2 === 0 ? round + 2 : round + 1;
    const nb = nextBridge <= rounds ? `nächste: Runde ${nextBridge}` : 'kippt nicht mehr';
    return [
      { color: s.bridgeUp ? '#ff3d6e' : '#7dff8a', title: `Zugbrücke ${s.bridgeUp ? 'oben' : 'unten'}.`, text: `Kippt alle 2 Runden (${nb}). ${s.bridgeUp ? 'Der Brückenweg ist gesperrt.' : 'Der Brückenweg ist offen.'}` },
      { color: s.plazaOpen ? '#7dff8a' : '#ff7ad9', title: `Drehbühne ${s.plazaOpen ? 'Ost' : 'Nord'}.`, text: s.plazaOpen ? 'Die Plaza-Abkürzung ist offen.' : 'Die Plaza-Abkürzung ist zu. Landet jemand auf der Drehbühne, dreht sie sich.' },
      ...(s.night ? [{ color: '#b46bff', title: 'Neonnacht.', text: 'Plusfelder zahlen diese Runde doppelt.' }] : []),
    ];
  },
  where: (n: BNode) => (n.seg ? WHERE[n.seg] : 'an einer Weiche') ?? 'an einer Weiche',
  plusFactor: (bs) => (ns(bs).night ? 2 : 1),
  decor: (kit) => neonDecor(kit, { draw: DRAW, j4: J4, dFirst: D_FIRST }),
};

export default neonstadt;
