// Every brand term the player sees, in one place. The house name is a working title and may
// still change: everything that shows it (title screen, HUD, help, learn page, screenreader
// texts, photos, the facade sign) reads it from here, so a rename is a one-line change.
//
// Grammar note: the German sentences around these words assume the current genders.
// "Lumen" is neuter and the same in singular and plural ("ein Lumen", "1.000 Lumen");
// "Palais" is neuter too ("im Palais"). A replacement with another gender needs a quick
// read through the texts that use it (search for the constant's name).
//
// Not brand terms and never renamed: save IDs (achievements, items, charms, wardrobe,
// companions, album entries), the localStorage prefix "nachtfalter.save." and the Tauri
// identifier. The founder keeps his name: Leopold Nachtfalter opened the house as
// "Casino Nachtfalter", and Selene renamed it.

// ---- The house -------------------------------------------------------------------------------

/** Full name of the house, as on the title screen and the facade. */
export const HOUSE = 'Palais Lumen';
/** The name in capitals for signs and plaques (facade, lift, slot tops). */
export const HOUSE_CAPS = HOUSE.toLocaleUpperCase('de-DE');
/** File-name form ("palais-lumen-tag3-….png"). */
export const HOUSE_SLUG = HOUSE.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Short form in running text: "Willkommen im Palais." */
export const HOUSE_SHORT = 'Palais';
/** The line under the name. */
export const HOUSE_TAGLINE = 'Haus des Lichts';
/** Motto of the learn page ("Wie das Haus gewinnt"): the house shows its odds openly. */
export const LEARN_MOTTO = 'Licht ins Spiel bringen';
/** What the house was called when Leopold ran it (lore only). */
export const HOUSE_FORMER = 'Casino Nachtfalter';
/** The founder. Stays: he is the reason for the old name. */
export const FOUNDER = 'Leopold Nachtfalter';
export const FOUNDER_FIRST = 'Leopold';

// ---- Money -----------------------------------------------------------------------------------

/** The play currency, singular ("ein Lumen"). */
export const CURRENCY = 'Lumen';
/** Plural ("1.000 Lumen"); the same word for Lumen. */
export const CURRENCY_PLURAL = 'Lumen';
/** Unit symbol for tight spots (photometric unit, lower case). */
export const CURRENCY_SHORT = 'lm';
/** Name of the coin face that shows the house emblem (the other face is "Mond"). */
export const COIN_FACE = 'Sonne';
/** "1.250 Lumen" from an already formatted number. */
export const money = (formatted: string | number) => `${formatted} ${CURRENCY_PLURAL}`;

// ---- The boss --------------------------------------------------------------------------------

/** The hostess the season ends with. */
export const BOSS_NAME = 'Selene';
export const BOSS_TITLE = 'Herrin der Lampen';
/** Her name in capitals for plaques and banners. */
export const BOSS_CAPS = BOSS_NAME.toLocaleUpperCase('de-DE');
/** "Selene, Herrin der Lampen" */
export const BOSS_FULL = `${BOSS_NAME}, ${BOSS_TITLE}`;
/** Genitive for "Lebenskraft von …" style labels. */
export const BOSS_GEN = 'Selenes';

// ---- Floors ----------------------------------------------------------------------------------

export const FLOOR_NAMES = {
  f1: 'Kerzensaal',
  f2: 'Mondgarten',
  f3: 'Laternenwerk',
  f4: 'Club Neon',
  /** Floor 5 as a place (the dome under the moon lamp). */
  f5: 'Die Kuppel',
} as const;
/** Floor 5's corridor of five gates that leads into the dome. */
export const BOSS_CORRIDOR = 'Gang zur Kuppel';
/** Floor 5 in running text: "unter der Kuppel". */
export const DOME = 'Kuppel';
/** The boss evening (day 13), as the regulars call it. */
export const BOSS_EVENING = 'Kuppelabend';
/** The club's sound system brand on the speakers. */
export const CLUB_SOUND = 'NEON SOUND';

// ---- Games and machines that carry brand names -----------------------------------------------

export const GAME_NAMES = {
  plinko: 'Funkenfall',
  blackjack: 'Selene 21',
  poker: 'Salon-Poker',
  queen: 'Duell im Lichtkegel',
} as const;
/** Slot cabinet themes (machine labels and the title on the cabinet). */
export const SLOT_CLASSIC = 'Laterne';
export const SLOT_GOLD = 'Goldlicht';
/** The slot joker symbol. */
export const SLOT_WILD = 'Goldener Lüster';

// ---- People and figures ----------------------------------------------------------------------

/** Floor 4's mini-boss. */
export const DJ_NAME = 'DJ Stroboskop';
/** The professor keeps his name; he now studies light. */
export const PROFESSOR = 'Professor Theodor Seidenspinner';
export const PROFESSOR_SHORT = 'Prof. Seidenspinner';
export const PROFESSOR_ROLE = 'ein Lichtforscher';

// ---- Things in the house ---------------------------------------------------------------------

/** The event that used to be the moth swarm. */
export const EVENT_FESTIVAL = 'Lichterfest';
/** Charm that lowers the boss-day goal. */
export const CHARM_BOSS = 'Kuppel-Bann';

/**
 * The collection book: 36 lamps from the history of light. ALBUM_NAME is the plain noun for
 * running text ("im Lampenbuch", "das ganze Lampenbuch"); ALBUM_TITLE is the title with its
 * article for plaques, the HUD key and the lectern.
 */
export const ALBUM_NAME = 'Lampenbuch';
export const ALBUM_TITLE = 'Das Lampenbuch';
/** One entry ("eine Leuchte"), feminine. */
export const ALBUM_ENTRY = 'Leuchte';
export const ALBUM_ENTRIES = 'Leuchten';
