// CS-Bunker: the crate world of our case game, built from our own shapes: a concrete compound
// with warehouses, a conveyor belt, a vault with a huge round door and a freight lift.
// Paths: Ladetor (START) → Weiche West (J1): Lagerhalle (long, safe, shop, Kumpel) or
//   Förderband (short, minus and duel; the belt can push you on) → Nordhof → Weiche Tresor (JV):
//   Tresorgang (behind the vault door, luck fields, the star moves in; only open every 3rd
//   round) or Kontrollgang (with the upper lift station) → Weiche Ost (J3): Verladerampe (long)
//   or Schienenweg (with the lower lift station) → Ladetor.
// Main gimmick (Takt): the vault door opens every 3 rounds for 1 round; the star moves into the
//   vault. When the door closes with the star inside, the star moves out again.
// Board field X: Lastenaufzug. Is the cabin at your station, you ride to the other level (oben:
//   Kontrollgang, unten: Schienenweg). If not, you call it and get 3 coins waiting money.
// Brettfest every 5 rounds: Kistenregen, crates fall from the sky, everybody opens one.

import { buildGraph, type Segment } from '../graph';
import type { BoardApi, BoardDef, BNode } from '../types';
import { ITEMS, ITEM_IDS, MAX_ITEMS } from '../../engine/tables';
import { bunkerDecor } from './view';

const SEGS: Segment[] = [
  { id: 's1', from: 'START', to: 'J1', pts: [[0, 18], [-8, 19.5], [-15, 17.5], [-21, 12]], pat: 'PPEPB' },
  { id: 'a', from: 'J1', to: 'J2', route: 'Lagerhalle', pts: [[-21, 12], [-28.5, 8.5], [-32.5, 1], [-32, -7], [-27.5, -13.5], [-17, -17]], pat: 'PPSPLPBPEPTP' },
  { id: 'b', from: 'J1', to: 'J2', route: 'Förderband', pts: [[-21, 12], [-15.5, 6.5], [-13.5, 0], [-13.5, -7], [-17, -17]], pat: 'MPDPEMPR' },
  { id: 'top', from: 'J2', to: 'JV', pts: [[-17, -17], [-12.5, -18.2], [-8, -15]], pat: 'PL' },
  { id: 'v', from: 'JV', to: 'J3', route: 'Tresorgang', pts: [[-8, -15], [-6.5, -19.5], [0, -22], [6.5, -19.5], [9.5, -15]], pat: 'LELSLE' },
  { id: 'k', from: 'JV', to: 'J3', route: 'Kontrollgang', pts: [[-8, -15], [-4, -10.5], [0.5, -9.3], [5, -10.5], [9.5, -15]], pat: 'PMXDP' },
  { id: 'c', from: 'J3', to: 'J4', route: 'Verladerampe', pts: [[9.5, -15], [16, -19.5], [24.5, -18.5], [30.5, -12], [32, -3], [30, 6], [22, 12.5]], pat: 'PPEPBPLPSPMPP' },
  { id: 'd', from: 'J3', to: 'J4', route: 'Schienenweg', pts: [[9.5, -15], [10.5, -8], [7.5, -1.5], [9, 5.5], [14, 9.2], [22, 12.5]], pat: 'PMXPDPMPL' },
  { id: 's2', from: 'J4', to: 'START', pts: [[22, 12.5], [17, 17], [8, 18.8], [0, 18]], pat: 'PSPLPT' },
];

const graph = buildGraph(SEGS, {
  named: { START: 'G', J1: 'E', J2: 'P', JV: 'L', J3: 'P', J4: 'E' },
  start: 'START',
  // every edge gets our own walkway; the inner west way is a conveyor belt
  flag: (_a, _b, s) => (s.id === 'b' ? 'band' : 'walk'),
});

const N = graph.nodes;
const id = (name: string) => N.find((n) => n.name === name)!.id;
const JV = id('JV');
const VAULT = N.filter((n) => n.seg === 'v').map((n) => n.id);
const V_FIRST = VAULT[0];
/** The star's spot in the vault: the deepest vault space. */
const V_STAR = VAULT.slice().sort((a, b) => N[a].z - N[b].z)[0];
const BELT = new Set(N.filter((n) => n.seg === 'b').map((n) => n.id));
const LIFT_OBEN = N.find((n) => n.type === 'X' && n.seg === 'k')!.id;
const LIFT_UNTEN = N.find((n) => n.type === 'X' && n.seg === 'd')!.id;

export interface BunkerState {
  vault: boolean;
  /** Where the lift cabin waits. */
  lift: 'oben' | 'unten';
  /** Round of the last Kistenregen (0 = no crates lying around). */
  crates: number;
}
const bk = (bs: Record<string, unknown>) => bs as unknown as BunkerState;

const WHERE: Record<string, string> = {
  s1: 'am Ladetor', a: 'in der Lagerhalle', b: 'auf dem Förderband', top: 'im Nordhof', v: 'im Tresor', k: 'im Kontrollgang',
  c: 'an der Verladerampe', d: 'am Schienenweg', s2: 'vor dem Ladetor',
};

async function setVault(api: BoardApi, open: boolean) {
  const s = bk(api.bs);
  s.vault = open;
  await api.emit({ k: 'gimmick', name: 'vault', data: { open } });
  if (open) {
    await api.toast('Die Tresortür ist offen! Der Stern zieht in den Tresor.', '#ffd23f');
    if (api.st.star !== V_STAR) { api.st.star = V_STAR; await api.emit({ k: 'starMove', to: V_STAR }); }
  } else {
    await api.toast('Die Tresortür ist zu. Der Tresorgang ist gesperrt.', '#ff6a3d');
    if (VAULT.includes(api.st.star)) { await api.toast('Der Stern wird aus dem Tresor geholt.', '#ffd23f'); await api.moveStar(); }
  }
}

async function liftTo(api: BoardApi, to: 'oben' | 'unten', rider: number | null) {
  const s = bk(api.bs);
  const from = s.lift;
  s.lift = to;
  await api.emit({ k: 'gimmick', name: 'lift', data: { from, to, ride: rider !== null } });
  if (rider !== null) {
    api.st.players[rider].node = to === 'oben' ? LIFT_OBEN : LIFT_UNTEN;
    await api.emit({ k: 'swap', a: rider, b: rider });
  }
}

const nextVault = (round: number) => (Math.floor(round / 3) + 1) * 3;
const nextFest = (round: number) => (Math.floor(round / 5) + 1) * 5;

const bunker: BoardDef = {
  id: 'bunker',
  name: 'CS-Bunker',
  blurb: `Kistenwelt im Betonbunker: Tresortür, Lastenaufzug und Förderband. ${N.length} Felder, 3 Weichen.`,
  graph,
  xName: 'Lastenaufzug',
  initState: () => ({ vault: false, lift: 'unten', crates: 0 }) satisfies BunkerState,
  blocked(bs, a, b) {
    if (a === JV && b === V_FIRST && !bk(bs).vault) return 'Die Tresortür ist zu';
    return null;
  },
  async roundStart(api, round) {
    const s = bk(api.bs);
    if (s.crates && s.crates < round) { s.crates = 0; await api.emit({ k: 'gimmick', name: 'crates', data: { on: false } }); }
    if (s.vault && round % 3 !== 0) { await api.toast('Brett-Ereignis: Die Tresortür fährt zu!', '#ff6a3d'); await setVault(api, false); }
    else if (!s.vault && round % 3 === 0) { await api.toast('Brett-Ereignis: Die Tresortür öffnet sich für eine Runde!', '#ffd23f'); await setVault(api, true); }
  },
  async onSpace(api, p) {
    const s = bk(api.bs), P = api.st.players[p], name = api.st.seats[p].name;
    const here: 'oben' | 'unten' | null = P.node === LIFT_OBEN ? 'oben' : P.node === LIFT_UNTEN ? 'unten' : null;
    if (!here) { await api.addCoins(p, 3, 'Lastenaufzug'); return; }
    const other = here === 'oben' ? 'unten' : 'oben';
    if (s.lift === here) {
      await api.toast(`Lastenaufzug! Die Kabine steht ${here}: ${name} fährt ${other === 'oben' ? 'hoch zum Kontrollgang' : 'runter zum Schienenweg'}.`, '#ffd23f');
      await liftTo(api, other, p);
    } else {
      await api.toast(`Lastenaufzug! Die Kabine ist ${other}. ${name} ruft sie und bekommt Wartegeld.`, '#ffd23f');
      await liftTo(api, here, null);
      await api.addCoins(p, 3, 'Wartegeld');
    }
  },
  async fest(api) {
    const s = bk(api.bs), st = api.st;
    s.crates = st.round;
    await api.emit({ k: 'banner', text: 'Kistenregen!', color: '#ff9a3d' });
    await api.emit({ k: 'gimmick', name: 'crates', data: { on: true, nodes: st.players.map((q) => q.node) } });
    await api.toast('Brettfest Kistenregen: Kisten fallen vom Himmel. Jede Person öffnet eine!', '#ff9a3d');
    const pool = ITEM_IDS.filter((i) => !st.rules.profi || ITEMS[i].pro);
    for (let p = 0; p < st.players.length; p++) {
      const P = st.players[p];
      const small = 3 + Math.floor(api.rng() * 4), big = 7 + Math.floor(api.rng() * 4);
      const item = pool[Math.floor(api.rng() * pool.length)];
      const options = [`${small} Münzen`, ITEMS[item].name, `${big} Münzen`];
      let pick = Math.floor(api.rng() * 3);
      if (pick === 1 && P.items.length >= MAX_ITEMS) pick = 0;
      await api.emit({ k: 'wheel', p, options, pick });
      if (pick === 1) { P.items.push(item); await api.toast(`${st.seats[p].name} findet ${ITEMS[item].name} in der Kiste.`, '#ff9a3d'); }
      else await api.addCoins(p, pick === 0 ? small : big, 'Kistenregen');
    }
  },
  events: [
    { text: 'Alarm! Die Tresortür springt um.', luck: true, run: (api) => setVault(api, !bk(api.bs).vault) },
    { text: 'Der Hausmeister holt den Lastenaufzug auf die andere Ebene.', run: (api) => liftTo(api, bk(api.bs).lift === 'oben' ? 'unten' : 'oben', null) },
    {
      text: 'Das Förderband läuft: Wer darauf steht, rückt 3 Felder vor.',
      async run(api) {
        const on = api.st.players.map((P, i) => (BELT.has(P.node) ? i : -1)).filter((i) => i >= 0);
        await api.emit({ k: 'gimmick', name: 'belt', data: { fast: true } });
        if (!on.length) { await api.toast('Gerade steht niemand auf dem Band.', '#ffd23f'); return; }
        for (const p of on) {
          const P = api.st.players[p];
          for (let k = 3; k > 0; k--) {
            const n = N[P.node];
            if (!BELT.has(n.id) || n.next.length !== 1) break;
            const from = P.node;
            P.node = n.next[0];
            await api.emit({ k: 'hop', p, from, to: P.node, left: k - 1 });
          }
        }
      },
    },
    {
      text: 'Fundkiste: Ein Gegenstand für dich.',
      async run(api, p) {
        const P = api.st.players[p];
        if (P.items.length >= MAX_ITEMS) { await api.addCoins(p, 4, 'Fundkiste'); return; }
        const pool = ITEM_IDS.filter((i) => !api.st.rules.profi || ITEMS[i].pro);
        const it = pool[Math.floor(api.rng() * pool.length)];
        P.items.push(it);
        await api.toast(`${api.st.seats[p].name} findet ${ITEMS[it].name}.`, '#ff9a3d');
      },
    },
  ],
  info(bs, round, rounds) {
    const s = bk(bs);
    const nv = nextVault(round), nf = nextFest(round);
    return [
      s.vault
        ? { color: '#ffd23f', title: 'Tresortür offen.', text: 'Nur diese Runde: Der Tresorgang ist frei, der Stern liegt im Tresor.' }
        : { color: '#ff6a3d', title: 'Tresortür zu.', text: nv <= rounds ? `Öffnet alle 3 Runden für eine Runde (nächste: Runde ${nv}).` : 'Öffnet sich nicht mehr.' },
      { color: '#35d4ff', title: `Lastenaufzug ${s.lift}.`, text: `Wer an der Station ${s.lift} landet, fährt ${s.lift === 'oben' ? 'runter zum Schienenweg' : 'hoch zum Kontrollgang'}. An der anderen Station gibt es Wartegeld.` },
      s.crates
        ? { color: '#ff9a3d', title: 'Kistenregen.', text: 'Überall liegen Kisten. Jede Person hat eine geöffnet.' }
        : { color: '#ff9a3d', title: nf <= rounds ? `Kistenregen in Runde ${nf}.` : 'Kein Kistenregen mehr.', text: 'Kisten fallen vom Himmel, jede Person öffnet eine.' },
    ];
  },
  where: (n: BNode) => (n.seg ? WHERE[n.seg] : n.name === 'START' ? 'am Ladetor' : 'an einer Weiche') ?? 'an einer Weiche',
  plusFactor: () => 1,
  decor: (kit) => bunkerDecor(kit, { jv: JV, vFirst: V_FIRST, vault: VAULT, oben: LIFT_OBEN, unten: LIFT_UNTEN }),
};

export default bunker;
