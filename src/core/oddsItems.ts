// The odds items: modifier items bound to one game (or a few) that change its real chances.
// Each one's effect lives in its game (asks isActive before a round); the exact payout share
// with the item is computed in the game's rules and proven in its rtp script
// (scripts/rtp-*.mjs, scripts/slots-rtp.mjs). Registered here once, with that payout share
// for the default setting; games whose share depends on the setting (risk, traps, level,
// stars, card size) update it with setItemRtp while the player changes it.

import { registerItem, setItemRtp, type ItemDef } from './modifiers';
import { MAGNET_RTP } from '../games/roulette/rules';
import { wingRtp } from '../games/plinko/rules';
import { SHIELD_RTP } from '../games/crash/rules';
import { LOADED_LINE_RTP } from '../games/craps/rules';
import { PEEK_BEST_RTP } from '../games/baccarat/rules';
import { guardRtp } from '../games/mines/rules';
import { scoutRtp } from '../games/tower/rules';
import { steadyRtp } from '../games/ice/rules';
import { starRtp as kenoStarRtp } from '../games/keno/rules';
import { MODES, starRtp as bingoStarRtp } from '../games/bingo/rules';
import { FEATHER_RTP } from '../games/slots/slots';

const ODDS: (ItemDef & { rtp: Record<string, number> })[] = [
  {
    id: 'gluecksfeder',
    name: 'Glücksfeder',
    desc: 'Bringt ein Dreh am Automaten keine Linie, streicht die Feder über das mittlere Feld und es wird einmal neu gezogen. Auszahlungsquote 105,3 % statt 94,9 %.',
    price: 50,
    tier: 'mittel',
    duration: { rounds: 10 },
    games: ['slots'],
    odds: true,
    rtp: { slots: FEATHER_RTP },
  },
  {
    id: 'magnetkugel',
    name: 'Magnetkugel',
    desc: 'Fällt die Kugel in die Null, zieht der Magnet sie einmal heraus und sie rollt in ein neues Fach. Jede Wette ohne die Null zahlt so 99,9 % statt 97,3 % zurück.',
    price: 60,
    tier: 'mittel',
    duration: { rounds: 5 },
    games: ['roulette'],
    odds: true,
    rtp: { roulette: MAGNET_RTP },
  },
  {
    id: 'mondschirm',
    name: 'Mondschirm',
    desc: 'Reißt ein Windstoß die Motte vor 1,10× vom Himmel (auch gleich beim Start), fängt der Schirm sie auf: Einsatz zurück. Wer ab 1,10× einsammelt, bekommt 108,7 % statt 96 %.',
    price: 70,
    tier: 'mittel',
    duration: { rounds: 5 },
    games: ['crash'],
    odds: true,
    rtp: { crash: SHIELD_RTP },
  },
  {
    id: 'gezinkte',
    name: 'Gezinkte Würfel',
    desc: 'Eine 2, 3 oder 12 beim Anwurf zählt nicht: Die Würfel rollen einmal neu. Die Linie zahlt 106,5 % statt 95,9 %, das Feld bleibt bei 94,4 %.',
    price: 75,
    tier: 'mittel',
    duration: { rounds: 3 },
    games: ['craps'],
    odds: true,
    rtp: { craps: LOADED_LINE_RTP },
  },
  {
    id: 'mottenfluegel',
    name: 'Mottenflügel',
    desc: 'Am zweiten Stift schlägt der Flügel die Motte nach außen, in dieselbe Richtung wie am ersten. Außenbecher werden doppelt so wahrscheinlich: Ruhig 98,1 %, Mittel 107,8 %, Wild 123,7 %.',
    price: 80,
    tier: 'mittel',
    duration: { rounds: 5 },
    games: ['plinko'],
    odds: true,
    rtp: { plinko: wingRtp('mid') },
  },
  {
    id: 'roentgenbrille',
    name: 'Röntgenbrille',
    desc: 'Vor dem Einsatz siehst du die erste Karte des Schuhs – die erste Spieler-Karte – und wählst danach. Mit der jeweils besten Wette 105,1 % statt höchstens 96,6 %.',
    price: 120,
    tier: 'gross',
    duration: { rounds: 3 },
    games: ['baccarat'],
    odds: true,
    rtp: { baccarat: PEEK_BEST_RTP },
  },
  {
    id: 'ruhigehand',
    name: 'Ruhige Hand',
    desc: 'Auf der Eisstraße hält die erste Scholle immer. Jeder Kassier-Punkt zahlt dann 95 % ÷ (1 − Bruchrisiko): Leicht 103,3 %, Mittel 113,1 %, Schwer 126,7 %, Extrem 158,3 %.',
    price: 140,
    tier: 'gross',
    duration: { rounds: 3 },
    games: ['ice'],
    odds: true,
    rtp: { ice: steadyRtp('mid') },
  },
  {
    id: 'minensucher',
    name: 'Minensucher',
    desc: 'Diamantminen: Der erste Stein ist immer ein Diamant (95 % × 25 ÷ Diamanten, z. B. 3 Fallen 108,0 %). Drachenturm: Er zeigt einen Drachen im ersten Stockwerk (Leicht 126,7 %, Mittel und Schwer 142,5 %).',
    price: 180,
    tier: 'gross',
    duration: { rounds: 3 },
    games: ['mines', 'tower'],
    odds: true,
    rtp: { mines: guardRtp(3), tower: scoutRtp('mid') },
  },
  {
    id: 'sternschnuppe',
    name: 'Sternschnuppe',
    desc: 'Beim Sternenhimmel fällt eine 11. Sternschnuppe, beim Glühwürmchen-Bingo fliegt ein Glühwürmchen mehr aus dem Glas – die Gewinntabelle bleibt. Sternenhimmel 104,5–147,5 %, Bingo 119,1 % (3×3) bzw. 126,5 % (4×4).',
    price: 320,
    tier: 'legendaer',
    duration: { rounds: 3 },
    games: ['keno', 'bingo'],
    odds: true,
    rtp: { keno: kenoStarRtp(5), bingo: bingoStarRtp(MODES[3]) },
  },
];

for (const { rtp, ...def } of ODDS) {
  registerItem(def);
  for (const [game, r] of Object.entries(rtp)) setItemRtp(game, def.id, r);
}
