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
import { BRAKE_FIELD_RTP } from '../games/wheel/rules';
import { FLY_RTP } from '../games/shells/rules';
import { CRUMB_RANGE } from '../games/derby/rules';
import { EYE_RTP } from '../games/target/rules';
import { DESIGNS as SCRATCH_DESIGNS, dustRtp } from '../games/scratch/rules';
import { MIRROR_BEST_RTP } from '../games/hilo/rules';
import { NET_RTP } from '../games/blackjack/rules';

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
  // The seven games that had none (wheel, shells, derby, target, scratch, hilo, blackjack).
  {
    id: 'falternetz',
    name: 'Falternetz',
    desc: 'Die erste Karte einer Runde, mit der du dich überkaufst, fängt das Netz weg – die Hand bleibt stehen. Mit Grundstrategie 103,7 % statt 96 %.',
    price: 60,
    tier: 'mittel',
    duration: { rounds: 5 },
    games: ['blackjack'],
    odds: true,
    rtp: { blackjack: NET_RTP },
  },
  {
    id: 'brotkrumen',
    name: 'Brotkrumen',
    desc: 'Krumen vor deiner Ente: Sie schwimmt um ein Viertel kräftiger, die Quoten bleiben. Jede Wette zahlt 102,2–119,0 % statt 93,9–96,5 %.',
    price: 65,
    tier: 'mittel',
    duration: { rounds: 3 },
    games: ['derby'],
    odds: true,
    rtp: { derby: CRUMB_RANGE.mean },
  },
  {
    id: 'leuchtkaefer',
    name: 'Leuchtkäfer',
    desc: 'Nach dem Tanz setzt sich ein Leuchtkäfer auf eine Laterne. Er mag es dunkel: Nur jedes fünfte Mal sitzt die Motte darunter, unter jeder anderen 2 zu 5. Dort 114,0 % statt 95 %.',
    price: 70,
    tier: 'mittel',
    duration: { rounds: 5 },
    games: ['shells'],
    odds: true,
    rtp: { shells: FLY_RTP },
  },
  {
    id: 'eulenauge',
    name: 'Eulenauge',
    desc: 'Die Eule sieht im Dunkeln: Die Mitte der Zielscheibe wird größer, Fehlwürfe werden seltener. Jeder Wurfstil zahlt genau 110 % statt 95 %.',
    price: 75,
    tier: 'mittel',
    duration: { rounds: 5 },
    games: ['target'],
    odds: true,
    rtp: { target: EYE_RTP },
  },
  {
    id: 'radbremse',
    name: 'Radbremse',
    desc: 'Bleibt das Große Rad auf einem Feld ohne deine Chips im ersten Viertel hinter dem Stift stehen, federt die Bremse es ein Feld zurück. Ein Feld allein: ×1 106,9 %, ×2 115,6 %, ×5 bis ×20 118,8 %.',
    price: 80,
    tier: 'mittel',
    duration: { rounds: 5 },
    games: ['wheel'],
    odds: true,
    rtp: { wheel: BRAKE_FIELD_RTP.x2 },
  },
  {
    id: 'mottenstaub',
    name: 'Mottenstaub',
    desc: 'Zeigt ein Verlierlos zwei Monde und zwei Motten, pustet die Motte Staub darüber und tauscht es einmal gegen ein frisches Los. Mottenflügel 108,7 %, Mondschein 114,4 %, Goldstaub 115,3 %.',
    price: 110,
    tier: 'gross',
    duration: { rounds: 3 },
    games: ['scratch'],
    odds: true,
    rtp: { scratch: dustRtp(SCRATCH_DESIGNS[0]) },
  },
  {
    id: 'mondspiegel',
    name: 'Mondspiegel',
    desc: 'Vor dem ersten Tipp jeder Runde an der Kartenleiter zeigt der Spiegel zwei Kartenhöhen, die als nächste nicht kommen. Mit dem jeweils besten Tipp 112,1 % statt 95 %.',
    price: 130,
    tier: 'gross',
    duration: { rounds: 3 },
    games: ['hilo'],
    odds: true,
    rtp: { hilo: MIRROR_BEST_RTP },
  },
];

for (const { rtp, ...def } of ODDS) {
  registerItem(def);
  for (const [game, r] of Object.entries(rtp)) setItemRtp(game, def.id, r);
}
