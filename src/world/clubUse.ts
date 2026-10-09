// What the club floor's usable props do (floor 4): small fun reactions, no economy effects.
// main.ts hands every prop it doesn't know itself to useClubProp.

import type { DecorKind } from '../core/registry';
import { sfx } from '../core/audio';
import { PALETTES, clubShow } from './painted/propsClub';

/** Prompt titles of the club props (merged into room.ts's USE_TITLE). */
export const CLUB_USE_TITLE: Partial<Record<DecorKind, string>> = {
  djStage: 'Platte auflegen',
  clubBar: 'Drink bestellen',
  lightDesk: 'Lichtshow wechseln',
  vipBooth: 'VIP-Sprudel köpfen',
  fogMachine: 'Nebel ablassen',
  turntables: 'Scratchen',
  boombox: 'Boombox aufdrehen',
  sneakerShelf: 'Sneaker bestaunen',
  chainDisplay: 'Goldkette anprobieren',
};

const TRACKS = ['„Mottenflug (Extended Mix)“', '„Neonnacht“', '„Falter im Stroboskop“', '„Mondstein Bounce“', '„4 Uhr früh“'];
const DRINKS = ['Neon-Limo mit Gurke', 'Blue Lagoon ohne Alkohol', 'Ginger-Fizz', 'Mate-Spritz', 'Beeren-Slush in Pink'];
const SNEAKERS = ['„Mondläufer“ in Neon-Lila, limitiert auf 99 Paar.', 'Weiße „Falter Low“ – keine einzige Falte. Respekt.', 'Goldene High-Tops mit Flügel-Logo.', '„Nachtschicht“-Runner mit leuchtender Sohle.'];
const LIGHTS = ['Pink & Türkis', 'Feuer', 'Aurora', 'Weißgold'];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export interface ClubUseHost {
  floatText(text: string, x: number, y: number, color?: number, size?: number): void;
  toast(text: string): void;
}

/** Plays a club prop's reaction; returns false if the prop isn't one of the club's. */
export function useClubProp(prop: DecorKind, cx: number, cy: number, host: ClubUseHost) {
  const y = cy - 40;
  switch (prop) {
    case 'djStage':
      sfx.clubFx('drop');
      host.floatText('DROP!', cx, cy - 120, 0xff3fb4, 30);
      host.toast(`Der DJ legt deinen Wunsch auf: ${pick(TRACKS)}`);
      return true;
    case 'clubBar':
      sfx.fizz();
      host.floatText('Cheers!', cx, y, 0x3fe8ff, 22);
      host.toast(`Du bekommst: ${pick(DRINKS)}.`);
      return true;
    case 'lightDesk':
      sfx.clubFx('lights');
      host.floatText('✦', cx, y, PALETTES[clubShow.palette][0], 28);
      host.toast(`Lichtshow: ${LIGHTS[clubShow.palette % LIGHTS.length]}`);
      return true;
    case 'vipBooth':
      sfx.clink();
      host.floatText('VIP ✦', cx, cy - 90, 0xffd23f, 22);
      host.toast('Wunderkerze an, Traubenschorle im Kübel – ganz ohne Alkohol.');
      return true;
    case 'fogMachine':
      sfx.clubFx('fog');
      host.floatText('~', cx, y, 0xd8c8f0, 30);
      return true;
    case 'turntables':
      sfx.clubFx('rewind');
      sfx.scratch();
      host.floatText('Wikka-wikka!', cx, cy - 100, 0xffd23f, 22);
      return true;
    case 'boombox':
      sfx.clubFx('bass');
      host.floatText('♪ BASS ♪', cx, cy - 150, 0xffd23f, 22);
      host.toast('Die Boombox pumpt – der ganze Floor nickt mit.');
      return true;
    case 'sneakerShelf':
      sfx.clubFx('sneaker');
      host.toast(pick(SNEAKERS));
      return true;
    case 'chainDisplay':
      sfx.clubFx('chain');
      host.floatText('✦', cx, cy - 100, 0xffd23f, 26);
      host.toast('Steht dir! Leider nur zum Anschauen – die Kette bleibt in der Vitrine.');
      return true;
  }
  return false;
}
