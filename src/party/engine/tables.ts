// Items, Kumpel (buddies), bonus stars and finale rules: the fixed tables of the game.

export type ItemId = 'dw' | 'tw' | 'hw' | 'joker' | 'sh' | 'mag' | 'key' | 'pfeife' | 'kompass' | 'tausch' | 'fahne' | 'tuete';

export interface ItemDef {
  id: ItemId;
  name: string;
  price: number;
  text: string;
  /** Used before the roll (all but the passive ones). */
  use: boolean;
  /** Allowed in Profi rules. */
  pro: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dw: { id: 'dw', name: 'Doppelwürfel', price: 5, text: 'Zwei Würfelblöcke, die Summe zählt.', use: true, pro: true },
  tw: { id: 'tw', name: 'Dreifachwürfel', price: 10, text: 'Drei Würfelblöcke.', use: true, pro: false },
  hw: { id: 'hw', name: 'Halbwürfel', price: 2, text: 'Würfelt nur 1 bis 3. Gut zum Zielen.', use: true, pro: true },
  joker: { id: 'joker', name: 'Würfel-Joker', price: 8, text: 'Wähl eine Zahl von 1 bis 6.', use: true, pro: true },
  sh: { id: 'sh', name: 'Glitzerschild', price: 3, text: 'Das nächste Minusfeld zählt nicht (wirkt von selbst).', use: false, pro: true },
  mag: { id: 'mag', name: 'Münzmagnet', price: 6, text: 'Klaut beim Überholen 3 Münzen pro Person.', use: true, pro: false },
  key: { id: 'key', name: 'Brückenschlüssel', price: 4, text: 'Öffnet eine gesperrte Abkürzung einmal (wirkt von selbst).', use: false, pro: false },
  pfeife: { id: 'pfeife', name: 'Kumpelpfeife', price: 7, text: 'Ruft den freien Kumpel sofort zu dir.', use: true, pro: false },
  kompass: { id: 'kompass', name: 'Sternkompass', price: 12, text: 'Der Stern zieht 10 Felder näher an dich heran.', use: true, pro: false },
  tausch: { id: 'tausch', name: 'Tauschkarte', price: 9, text: 'Tausche die Plätze mit einer gewählten Person.', use: true, pro: false },
  fahne: { id: 'fahne', name: 'Bannerfähnchen', price: 4, text: 'Leg eine Falle auf dein Feld: Wer darauf landet, zahlt dir 5.', use: true, pro: false },
  tuete: { id: 'tuete', name: 'Goldene Tüte', price: 15, text: 'Nur im Finale: 1 Stern, wenn du direkt danach auf Plus landest.', use: true, pro: false },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const MAX_ITEMS = 3;

export type BuddyId = 'lumi' | 'pips' | 'klecks' | 'bolle' | 'funz' | 'mopp';
export interface BuddyDef { id: BuddyId; name: string; look: string; text: string; color: string }
export const BUDDIES: Record<BuddyId, BuddyDef> = {
  lumi: { id: 'lumi', name: 'Lumi', look: 'gelbes Licht mit Flügelchen', text: 'Feldwirkungen zählen doppelt.', color: '#fff6b0' },
  pips: { id: 'pips', name: 'Pips', look: 'grüner Hüpfball', text: 'Wirft einen Bonuswürfel 1 bis 3 mit.', color: '#7dff8a' },
  klecks: { id: 'klecks', name: 'Klecks', look: 'lila Tintentropfen', text: 'Klaut beim Überholen 2 Münzen.', color: '#b46bff' },
  bolle: { id: 'bolle', name: 'Bolle', look: 'dicke Wolke', text: 'Schützt vor Minusfeldern und Duell-Verlusten.', color: '#ffffff' },
  funz: { id: 'funz', name: 'Funz', look: 'Funke mit Zylinder', text: 'Läden geben 50 % Rabatt.', color: '#ffb340' },
  mopp: { id: 'mopp', name: 'Mopp', look: 'flauschiger Staubwedel', text: 'Sammelt 1 Münze pro gelaufenem Feld.', color: '#ff9ad5' },
};
export const BUDDY_IDS = Object.keys(BUDDIES) as BuddyId[];
/** Own turns a buddy stays. */
export const BUDDY_TURNS = 3;
/** First round a buddy shows up. */
export const BUDDY_ROUND = 3;

export type BonusId = 'ass' | 'sammler' | 'laeufer' | 'ereignis' | 'laden' | 'pech' | 'kumpel' | 'bande';
export interface BonusDef { id: BonusId; name: string; text: string; stat: keyof PStats }
export interface PStats {
  mgWins: number;
  coinsGot: number;
  steps: number;
  events: number;
  spent: number;
  minus: number;
  buddyTurns: number;
  bandeCoins: number;
  starsBought: number;
  duelsWon: number;
}
export const newStats = (): PStats => ({ mgWins: 0, coinsGot: 0, steps: 0, events: 0, spent: 0, minus: 0, buddyTurns: 0, bandeCoins: 0, starsBought: 0, duelsWon: 0 });

export const BONUS: Record<BonusId, BonusDef> = {
  ass: { id: 'ass', name: 'Minispiel-Ass', text: 'Die meisten Minispiele gewonnen', stat: 'mgWins' },
  sammler: { id: 'sammler', name: 'Münzsammler', text: 'Insgesamt die meisten Münzen eingesammelt', stat: 'coinsGot' },
  laeufer: { id: 'laeufer', name: 'Weitläufer', text: 'Die meisten Felder gelaufen', stat: 'steps' },
  ereignis: { id: 'ereignis', name: 'Ereignis-Fan', text: 'Am öftesten auf Ereignisfeldern gelandet', stat: 'events' },
  laden: { id: 'laden', name: 'Ladenkönig', text: 'Das meiste im Laden ausgegeben', stat: 'spent' },
  pech: { id: 'pech', name: 'Pechvogel', text: 'Am öftesten auf Minusfeldern gelandet', stat: 'minus' },
  kumpel: { id: 'kumpel', name: 'Kumpelfreund', text: 'Die meisten Züge mit Kumpel', stat: 'buddyTurns' },
  bande: { id: 'bande', name: 'Bandenchef', text: 'Die meisten Münzen aus Banden', stat: 'bandeCoins' },
};
export const BONUS_IDS = Object.keys(BONUS) as BonusId[];

export type FinaleRule = 'mgDouble' | 'cheapStar' | 'catchup';
export const FINALE_RULES: Record<FinaleRule, { name: string; text: string }> = {
  mgDouble: { name: 'Doppelte Minispiele', text: 'Minispiel-Münzen zählen bis zum Schluss doppelt.' },
  cheapStar: { name: 'Sternschnäppchen', text: 'Der Stern kostet bis zum Schluss nur 15 Münzen.' },
  catchup: { name: 'Aufholjagd', text: 'Der Letzte bekommt sofort 10 Münzen.' },
};

export const START_COINS = 10;
export const STAR_PRICE = 20;
