// Regulars ("Stammgäste") and the house's story. Five named guests stand in fixed spots in the
// foyer and on the floors (where depends on the day). Each has a story that moves forward over
// the seasons, reactions to what you have done (medals, floors, an empty purse, items, mini
// bosses, the Queen) and small talk for the moment. Every line heard is kept in
// `storySeen` as `<regular>.<beat>.<line>`, so a conversation picks up where it stopped, across
// sessions and seasons. After each win against the Queen a chapter (`ch:<n>`) continues the
// story of the house (src/ui/chapter.ts). Story only: never touches money or odds.

import { floorRooms } from './registry';
import { BOSS_DAY, floorForDay, type GameState, type SaveData } from './state';
import type { PlayerLook } from '../world/player';

export type RegularId = 'anselm' | 'jonas' | 'mira' | 'ida' | 'theo';
export type RegularProp = 'rake' | 'chips' | 'watch' | 'tray' | 'magnifier' | 'net';

/** What the lines can depend on, read once from the save. */
export interface StoryCtx {
  season: number;
  day: number;
  bestDay: number;
  won: number;
  lost: number;
  /** Chapters already read. */
  chapters: number;
  golds: number;
  diamonds: number;
  medals: number;
  /** The purse was ever (nearly) empty. */
  broke: boolean;
  /** Can't afford a bet right now. */
  brokeNow: boolean;
  items: number;
  minis: number;
  moths: number;
  rounds: number;
  goal: boolean;
  boss: boolean;
  heat: number;
}

interface Beat {
  id: string;
  when?: (c: StoryCtx) => boolean;
  lines: string[];
}

export interface RegularDef {
  id: RegularId;
  /** Full name and role, for the prompt and screen readers. */
  name: string;
  /** Short name on the bubble's brass tag. */
  tag: string;
  role: string;
  color: number;
  look: PlayerLook;
  prop(c: StoryCtx, seen: Set<string>): RegularProp;
  /** Room the regular stands in today, or null (not in the house today). */
  where(d: SaveData): string | null;
  /** Preferred spot as a share of the room's size (the nearest free floor spot is used). */
  spot(roomId: string): { x: number; y: number };
  /** The story, beat by beat, in order. A beat waits until its condition holds. */
  story: Beat[];
  /** One-off reactions to progress, said before the next story beat. */
  react: Beat[];
  /** Small talk when there is nothing new: lines for the moment, then the usual ones. */
  idle(c: StoryCtx): string[];
}

// ---- Where they stand -------------------------------------------------------------------------

/** Main room of today's floor; the foyer on the boss day (the corridor belongs to the Queen). */
function todayRoom(d: SaveData) {
  const f = floorForDay(d.evening.number);
  const main = floorRooms(f).find((r) => !r.parent);
  return main && !main.corridor ? main.id : 'foyer';
}

/** Main room of floor `f` if it is open today, else the foyer. */
function floorRoom(d: SaveData, f: number) {
  if (f > floorForDay(d.evening.number)) return 'foyer';
  const main = floorRooms(f).find((r) => !r.parent);
  return main && !main.corridor ? main.id : 'foyer';
}

const bossDay = (d: SaveData) => d.evening.number >= BOSS_DAY;

// ---- The regulars -------------------------------------------------------------------------------

const read = (n: number) => (c: StoryCtx) => c.chapters >= n;

export const REGULARS: RegularDef[] = [
  {
    id: 'anselm',
    name: 'Anselm Kranich',
    tag: 'Anselm',
    role: 'der alte Croupier',
    color: 0xe0b25a,
    look: { skin: 0xf1c9a5, hair: 0xe4ded2, jacket: 0x1f3a2a, hairStyle: 'sidePart', outfit: 'suit', hat: 'none', accessory: 'bowTie' },
    prop: () => 'rake',
    where: (d) => (bossDay(d) || d.evening.number % 3 === 1 ? 'foyer' : todayRoom(d)),
    spot: (r) => (r === 'foyer' ? { x: 0.42, y: 0.6 } : { x: 0.22, y: 0.42 }),
    story: [
      {
        id: 'a1',
        lines: [
          'Ah, ein neues Gesicht. Anselm Kranich, Croupier – seit die Kugel noch aus Elfenbein war.',
          'Ganz oben wohnt die Mottenkönigin. Man sagt, sie war nicht immer eine Königin.',
          'Komm wieder, wenn du ihr begegnet bist. Dann erzähle ich dir mehr.',
        ],
      },
      {
        id: 'a2',
        when: (c) => c.bestDay >= BOSS_DAY || c.won > 0,
        lines: [
          'Du hast sie gesehen, nicht wahr? Die Flügel, das Silberlicht.',
          'Ich kannte sie, als sie noch Selene hieß. Sie hat hier jeden Abend die Lampen angezündet, mit einer langen Messingstange.',
          'Gespielt hat sie nie. Sie hat nur zugesehen, wie die Motten ins Licht fliegen.',
        ],
      },
      {
        id: 'a3',
        when: read(1),
        lines: [
          'Weißt du, was sie getan hat, nachdem du gewonnen hattest? Gelächelt. Zum ersten Mal seit Jahren.',
          'Das Haus hatte einen Gründer, Leopold Nachtfalter. In der Nacht, als er verschwand, trug Selene zum ersten Mal die Krone.',
        ],
      },
      {
        id: 'a4',
        when: read(2),
        lines: [
          'Leopold war mein Freund. Ein guter Mann. Aber er konnte nie aufhören, wenn der Abend vorbei war.',
          'Ich habe ihm hundertmal gesagt: Die Kugel hat kein Gedächtnis. Sie weiß nicht, dass du „dran“ bist.',
          'Er hat genickt. Und weitergespielt.',
        ],
      },
      {
        id: 'a5',
        when: read(3),
        lines: [
          'Die Tür zum Dach … Ja. Ich habe den Schlüssel. Leopold hat ihn mir in jener Nacht in die Hand gedrückt.',
          '„Wenn jemand Selene die Krone abnimmt, zeig ihm das Licht.“ Das waren seine Worte. Ich habe vierzig Jahre gewartet.',
        ],
      },
      {
        id: 'a6',
        when: read(5),
        lines: [
          'Wir waren alle oben auf dem Dach. Die Lampe brennt wieder. Ich habe geweint wie ein Schuljunge.',
          'Ich werde alt. Aber jetzt weiß ich, dass das Haus in guten Händen ist. In Selenes. Und ein bisschen in deinen.',
        ],
      },
      {
        id: 'a7',
        when: read(6),
        lines: ['Ich drehe die Kugel jetzt nur noch sonntags. Die übrigen Abende sitze ich hier und schaue den Motten zu. Wie Selene früher.'],
      },
    ],
    react: [
      { id: 'rLost', when: (c) => c.lost > 0, lines: ['Eine Saison ist zu Ende gegangen, ich hab’s gehört. Das Haus merkt sich keine Niederlagen. Ich übrigens auch nicht.'] },
      { id: 'rGold', when: (c) => c.golds + c.diamonds > 0, lines: ['Gold! Ich hab’s an der Art gesehen, wie du durchs Foyer gehst. Nicht zu stolz – das gefällt mir.'] },
      { id: 'rClock', when: (c) => c.bestDay >= 7, lines: ['Im Uhrwerk warst du also auch schon. Dort oben tickt alles ein bisschen lauter, findest du nicht?'] },
    ],
    idle: (c) => [
      ...(c.boss ? ['Heute ist Thronabend. Grüß Selene von mir. Und verbeug dich ein bisschen – sie mag das.'] : []),
      ...(c.goal && !c.boss ? ['Dein Ziel hast du heute schon. Alles darüber ist Zugabe – oder Rückgabe. Die Kugel kennt den Unterschied nicht.'] : []),
      'Die Kugel hat kein Gedächtnis. Das ist das Ehrlichste an ihr.',
      'Rien ne va plus – nichts geht mehr. Der schönste Satz des Abends. Danach kann man nur noch zuschauen.',
      'Auf jedem Tisch steht, wie viel er im Schnitt zurückgibt. Leopold wollte das so. Ich auch.',
    ],
  },
  {
    id: 'jonas',
    name: 'Jonas Brenner',
    tag: 'Jonas',
    role: 'ein junger Gast',
    color: 0x7bd4c8,
    look: { skin: 0xf1c9a5, hair: 0xb3402a, jacket: 0xa8782a, hairStyle: 'curly', outfit: 'suit', hat: 'none', accessory: 'tie' },
    prop: (_c, seen) => (seen.has('jonas.j4.0') ? 'watch' : 'chips'),
    where: (d) => (bossDay(d) || d.evening.number % 2 === 1 ? 'foyer' : todayRoom(d)),
    spot: (r) => (r === 'foyer' ? { x: 0.84, y: 0.8 } : { x: 0.72, y: 0.82 }),
    story: [
      {
        id: 'j1',
        lines: [
          'Oh! Hallo. Ich bin Jonas. Ich bin nur kurz hier. Wie jeden Abend, haha.',
          'Heute hab ich ein gutes Gefühl. Nach drei Verlusten muss doch mal ein Gewinn kommen, oder?',
        ],
      },
      {
        id: 'j2',
        when: (c) => c.rounds >= 20 || c.day >= 2 || c.season > 1,
        lines: [
          'Anselm sagt, die Kugel hat kein Gedächtnis. Dreimal Rot heißt nicht, dass jetzt Schwarz dran ist.',
          'Klingt logisch. Fühlt sich aber falsch an. Komisch, oder?',
        ],
      },
      {
        id: 'j3',
        when: (c) => c.day >= 4 || c.season > 1,
        lines: [
          'Gestern hab ich bis zum letzten Falter gespielt. Ich wollte nur zurückholen, was weg war.',
          'Mira hat mir einen Kakao hingestellt und nichts gesagt. Das war irgendwie lauter als jede Predigt.',
        ],
      },
      {
        id: 'j4',
        when: (c) => c.day >= 7 || c.season > 1,
        lines: [
          'Ich probier was Neues: Vor dem Abend stecke ich mir einen festen Betrag ein. Wenn der weg ist, gehe ich.',
          'Und wenn ich vorne liege, kommt die Hälfte in die andere Tasche. Die bleibt zu. Und ich hab mir einen Wecker gestellt.',
        ],
      },
      {
        id: 'j5',
        when: (c) => c.won > 0 || c.season > 2,
        lines: [
          'Es hat geklappt! Gestern hat der Wecker geklingelt und ich bin gegangen. Mitten im Spiel. Einfach so.',
          'Und weißt du was? Der Abend war trotzdem schön. Vielleicht sogar schöner.',
        ],
      },
      {
        id: 'j6',
        when: read(2),
        lines: [
          'Ich komme jetzt seltener. Dienstags spiele ich Klavier im Foyer. Das Klavier gewinnt nie – aber es verliert auch nie.',
          'Ich mag das Haus immer noch. Die Lichter, die Musik. Ich muss nur nicht jeden Abend alles setzen, um es zu mögen.',
        ],
      },
      {
        id: 'j7',
        when: read(4),
        lines: [
          'Leopolds Brief … „Ich konnte nie aufhören.“ Das hätte ich sein können.',
          'Danke, dass du mir zugehört hast. Die ganze Zeit. Echt.',
        ],
      },
      {
        id: 'j8',
        when: read(6),
        lines: ['Ich hab jetzt eine Stelle in der Musikschule. Abends unterrichte ich Kinder. Nur am Wochenende komme ich vorbei, auf eine Limo.'],
      },
    ],
    react: [
      { id: 'rBroke', when: (c) => c.broke, lines: ['Ganz leer gewesen? Kenn ich. Was hilft: aufstehen, Kakao, schlafen. Morgen sieht das anders aus.'] },
      { id: 'rItems', when: (c) => c.items > 0, lines: ['Du benutzt die Sachen aus dem Beutel? Gut, dass dabei steht, was sie wirklich bringen. Ich hab früher an Glückssocken geglaubt.'] },
      { id: 'rDiamond', when: (c) => c.diamonds > 0, lines: ['Diamant?! Und dann war der Abend einfach zu Ende, und du bist nach Hause? So will ich das auch können.'] },
    ],
    idle: (c) => [
      ...(c.brokeNow ? ['Tasche leer für heute? Das ist ein guter Moment für einen Spaziergang. Glaub mir.'] : []),
      ...(c.goal && !c.brokeNow ? ['Ziel geschafft? Dann mach’s wie ich: Hälfte in die andere Tasche. Die bleibt zu.'] : []),
      ...(c.boss ? ['Thronabend! Ich drück dir die Daumen. Ich hab heute nur fünfzig Falter dabei. Mehr nicht. Mit Absicht.'] : []),
      'Mein Wecker klingelt um elf. Dann ist Schluss, egal wie es steht. Bis jetzt hat’s geklappt.',
      'Weißt du, was das Beste am Gewinnen ist? Aufhören, solange es sich noch gut anfühlt.',
      'Ich zähl jetzt nicht mehr, was ich verloren hab. Ich zähl, wie viele schöne Abende ich hatte.',
    ],
  },
  {
    id: 'mira',
    name: 'Mira Holunder',
    tag: 'Mira',
    role: 'die Barkeeperin',
    color: 0xff9ac0,
    look: { skin: 0x8d5a3b, hair: 0x1b1b22, jacket: 0x1f5a44, hairStyle: 'bun', outfit: 'dress', hat: 'none', accessory: 'necklace' },
    prop: () => 'tray',
    where: (d) => (d.evening.number <= 3 ? 'f1' : 'foyer'),
    spot: (r) => (r === 'foyer' ? { x: 0.66, y: 0.74 } : { x: 0.17, y: 0.74 }),
    story: [
      {
        id: 'm1',
        lines: [
          'Willkommen! Mira. Bei mir gibt’s Saft, Limo und Geschichten – die sind sowieso stärker.',
          'Ich hör alles, was hier geredet wird. Weitererzählen tu ich nur das Nette.',
        ],
      },
      {
        id: 'm2',
        when: (c) => c.day >= 3 || c.season > 1,
        lines: [
          'Kennst du Jonas? Lieber Kerl. Wenn es spät wird, stell ich ihm einen Kakao hin.',
          'Mehr muss man manchmal nicht tun. Einfach da sein, wenn einer merkt, dass der Abend vorbei ist.',
        ],
      },
      {
        id: 'm3',
        when: read(1),
        lines: [
          'Seit du die Königin besiegt hast, summt sie beim Lampenputzen. Das hab ich noch nie gehört.',
          'Ich schreibe übrigens alles auf. Die Chronik des Hauses. Du stehst jetzt auch drin.',
        ],
      },
      {
        id: 'm4',
        when: read(3),
        lines: [
          'Beim Putzen hab ich hinter dem Barspiegel was gefunden. Einen vergilbten Umschlag mit einem Mottensiegel.',
          'Adressiert an „die Person, die Selene die Krone abnimmt“. Ich hab ihn nicht geöffnet. Ich glaube, er ist für dich. Nach deinem nächsten Sieg.',
        ],
      },
      {
        id: 'm5',
        when: read(4),
        lines: ['Leopold ist also ans Meer gegangen und hat Selene das Haus anvertraut. Ich hätte geweint, wenn ich nicht gerade Gläser poliert hätte.'],
      },
      {
        id: 'm6',
        when: read(6),
        lines: ['Die Chronik ist voll. Ich fang ein neues Buch an. Erstes Kapitel: du.'],
      },
    ],
    react: [
      { id: 'rMini', when: (c) => c.minis > 0, lines: ['Einen Etagenwächter besiegt! Darauf einen Holunder-Spritz. Ohne Alkohol, versteht sich.'] },
      { id: 'rThrone', when: (c) => c.bestDay >= BOSS_DAY, lines: ['Du warst oben am Thron! Wie war sie? Erzähl’s nicht Anselm, er wird sonst sentimental.'] },
    ],
    idle: (c) => [
      ...(c.brokeNow ? ['Auf’s Haus: ein Kakao. Der kostet nichts, und er ist das Beste, was man um diese Uhrzeit trinken kann.'] : []),
      ...(c.boss ? ['Heute ist Thronabend. Ich stell schon mal Gläser kalt – egal, wie es ausgeht.'] : []),
      'Mondschein-Limo, Falterfizz, Holunder-Spritz. Alles ohne Alkohol. Klare Köpfe spielen schöner.',
      'Weißt du, wer hier die besten Abende hat? Die, die wissen, wann sie ihren Mantel holen.',
      'Theo hat wieder eine Motte in seinem Glas gefunden. Diesmal ist sie geblieben, bis er ausgetrunken hatte.',
    ],
  },
  {
    id: 'ida',
    name: 'Kommissarin Ida Brandt',
    tag: 'Ida Brandt',
    role: 'eine Kommissarin',
    color: 0x9fc4ff,
    look: { skin: 0xe8b48a, hair: 0x6b3a1e, jacket: 0x8a6a3e, hairStyle: 'short', outfit: 'suit', hat: 'fedora', hatColor: 0x3a2a20, accessory: 'tie' },
    prop: () => 'magnifier',
    where: (d) => (bossDay(d) || d.evening.number % 2 === 0 ? 'foyer' : floorRoom(d, 1 + ((d.evening.number + d.season.number) % floorForDay(d.evening.number)))),
    spot: (r) => (r === 'foyer' ? { x: 0.3, y: 0.36 } : { x: 0.84, y: 0.36 }),
    story: [
      {
        id: 'i1',
        lines: [
          'Brandt, Kommissarin. Keine Sorge, Sie haben nichts angestellt. Ich ermittle in einem alten Fall.',
          'Vor vierzig Jahren verschwand der Gründer dieses Hauses. Spurlos. Die Akte wurde nie geschlossen.',
        ],
      },
      {
        id: 'i2',
        when: (c) => c.day >= 5 || c.season > 1,
        lines: [
          'Seltsam: Im Uhrwerk-Saal steht eine Uhr still. Auf 3:13. Um diese Zeit verschwand Leopold Nachtfalter.',
          'Am Spieltisch gibt es Zufall. In meinen Akten nicht.',
        ],
      },
      {
        id: 'i3',
        when: read(1),
        lines: [
          'Die Mottenkönigin hat mir einen Tee angeboten. Verdächtige bieten mir selten Tee an.',
          'Sie sagt, sie habe Leopold nichts getan. Ich glaube ihr. Aber sie verschweigt etwas.',
        ],
      },
      {
        id: 'i4',
        when: read(2),
        lines: [
          'Das Kassenbuch. Letzte Zeile, Leopolds Handschrift: „Einsatz: alles. Ich höre auf.“',
          'Das klingt nach Abschied, nicht nach Verbrechen. Ich bleibe trotzdem dran. Berufskrankheit.',
        ],
      },
      {
        id: 'i5',
        when: read(4),
        lines: [
          'Fall gelöst. Kein Verbrechen. Nur ein Mann, der gegangen ist – spät, aber rechtzeitig.',
          'Ich bleibe trotzdem noch ein paar Abende. Die Limonade hier ist zu gut, um sie in einer Akte abzulegen.',
        ],
      },
      {
        id: 'i6',
        when: read(6),
        lines: ['Ich habe Leopold eine Postkarte geschrieben. An eine Adresse am Meer. Gestern kam eine Antwort: eine gemalte Motte. Sonst nichts. Das genügt.'],
      },
    ],
    react: [
      { id: 'rMini', when: (c) => c.minis > 0, lines: ['Sie haben einen der Etagenwächter besiegt, höre ich. Ich habe ihn befragt. Er schweigt wie seine Uhren.'] },
      { id: 'rLost', when: (c) => c.lost > 0, lines: ['Ihre Saison ist zu Ende gegangen? Kommt in den besten Akten vor. Wichtig ist, was man sich daraus notiert.'] },
    ],
    idle: (c) => [
      ...(c.boss ? ['Thronabend. Ich bleibe unten und beobachte. Viel Glück – aber verlassen Sie sich nicht darauf.'] : []),
      'Ich notiere alles. Sogar, wie oft die Null kommt. Ergebnis: so oft, wie sie soll. Langweilig, aber ehrlich.',
      'Ein Fall ist wie ein Abend am Tisch: Man muss wissen, wann man ihn schließt.',
      'Haben Sie Herrn Seidenspinner gesehen? Er schuldet mir eine Lupe.',
    ],
  },
  {
    id: 'theo',
    name: 'Professor Theodor Seidenspinner',
    tag: 'Prof. Seidenspinner',
    role: 'ein Mottenforscher',
    color: 0xb8e07a,
    look: { skin: 0xf1c9a5, hair: 0xd8d2c4, jacket: 0x5a3a20, hairStyle: 'bald', outfit: 'suit', hat: 'none', accessory: 'bowTie' },
    prop: () => 'net',
    where: (d) => (bossDay(d) || d.evening.number % 2 === 0 ? 'foyer' : todayRoom(d)),
    spot: (r) => (r === 'foyer' ? { x: 0.14, y: 0.32 } : { x: 0.5, y: 0.3 }),
    story: [
      {
        id: 't1',
        lines: [
          'Pst! Nicht bewegen. Da – ein Kleines Nachtpfauenauge! … Ach. Weg ist es.',
          'Professor Theodor Seidenspinner, Mottenforscher. Ich untersuche, warum in diesem Haus so viele Motten wohnen.',
        ],
      },
      {
        id: 't2',
        when: (c) => c.day >= 4 || c.season > 1,
        lines: [
          'Bemerkenswert: Die Motten hier fliegen nicht zum Gold und nicht zu den Automaten. Sie fliegen alle … nach oben.',
          'Irgendwo über uns muss ein Licht sein, das heller ist als alles im Haus.',
        ],
      },
      {
        id: 't3',
        when: read(1),
        lines: [
          'Die Königin hat mir erlaubt, ihre Flügel zu vermessen! Spannweite: beachtlich. Muster: einzigartig.',
          'Sie sagt, jede Motte im Haus kennt ihren Namen. Wissenschaftlich unhaltbar. Wunderschön trotzdem.',
        ],
      },
      {
        id: 't4',
        when: read(2),
        lines: [
          'Ich hab’s! Auf dem Dach steht eine Lampe. Die Mondlampe. Ihretwegen leben die Motten hier, seit hundert Jahren.',
          'Aber ihr Licht wird schwächer, jede Saison ein bisschen. Das beunruhigt mich.',
        ],
      },
      {
        id: 't5',
        when: read(3),
        lines: ['Die Lampe brennt nicht mit Strom und nicht mit Öl. Sie brennt mit … ich würde sagen: mit Zuversicht. Unwissenschaftlich, ich weiß.'],
      },
      {
        id: 't6',
        when: read(5),
        lines: ['Seit die Mondlampe wieder brennt, zähle ich doppelt so viele Arten! Ich brauche ein neues Notizbuch. Oder drei.'],
      },
    ],
    react: [
      { id: 'rAlbum', when: (c) => c.moths > 0, lines: ['Sie führen ein Mottenalbum? Herrlich! Wenn Sie eine Art nicht bestimmen können – Sie wissen, wo Sie mich finden.'] },
      { id: 'rMoon', when: (c) => c.heat > 0, lines: ['Eine höhere Mondstufe! Bei vollem Mond fliegen die Motten unruhiger. Wie manche Gäste, vermutlich.'] },
    ],
    idle: (c) => [
      ...(c.boss ? ['Heute Thronabend? Achten Sie auf die Flügel der Königin. Das Muster ist … ach, gehen Sie einfach. Viel Glück!'] : []),
      'Eine Motte fliegt ins Licht, weil sie nicht anders kann. Wir Menschen können anders. Das ist unser Vorteil.',
      'Haben Sie gewusst, dass manche Falter nur eine einzige Nacht leben? Sie verbringen sie nicht am Spieltisch.',
      'Die Motte im Mottenfall fällt rein zufällig. Ich habe zweitausend Würfe gezählt. Sehr entspannend.',
    ],
  },
];

export const regular = (id: string) => REGULARS.find((r) => r.id === id);

// ---- Reading the save -----------------------------------------------------------------------------

const BROKE_KEY = 'st:broke';

export function storyCtx(d: SaveData): StoryCtx {
  const seen = d.storySeen ?? [];
  const m = d.medals;
  return {
    season: d.season.number,
    day: d.evening.number,
    bestDay: Math.max(d.records.bestEvening, d.evening.number),
    won: d.records.seasonsWon,
    lost: Math.max(0, d.records.seasonsPlayed - d.records.seasonsWon),
    chapters: seen.filter((s) => s.startsWith('ch:')).length,
    golds: m.gold,
    diamonds: m.diamond,
    medals: m.bronze + m.silver + m.gold + m.diamond,
    broke: (d.counters[BROKE_KEY] ?? 0) > 0,
    brokeNow: d.balance < 10,
    items: d.counters['it:used'] ?? 0,
    minis: (d.minibosses ?? []).filter((x) => !x.includes(':')).length,
    moths: Object.values(d.album ?? {}).reduce((s, n) => s + (n > 0 ? 1 : 0), 0),
    rounds: d.stats.rounds,
    goal: d.balance >= d.evening.startBalance + d.evening.quota,
    boss: d.evening.number >= BOSS_DAY,
    heat: d.heat,
  };
}

/** Regulars standing in this room today. */
export function regularsIn(d: SaveData, roomId: string) {
  return REGULARS.filter((r) => r.where(d) === roomId);
}

export interface Line {
  text: string;
  /** Key stored in storySeen, or null for small talk. */
  key: string | null;
  /** More lines of the same beat follow. */
  more: boolean;
}

/** Day stamp: a regular starts at most one new story beat per day, so the story unfolds slowly. */
const dayStamp = (d: SaveData) => d.season.number * 1000 + d.evening.number;
const beatKey = (id: string) => `st:${id}`;

/** First beat with an unheard line whose condition holds: reactions first, then the story in order. */
function openBeat(r: RegularDef, c: StoryCtx, seen: Set<string>, toldToday = false) {
  const unheard = (b: Beat) => b.lines.findIndex((_, i) => !seen.has(`${r.id}.${b.id}.${i}`));
  // A story beat already started is finished first.
  for (const b of r.story) {
    const i = unheard(b);
    if (i > 0) return { b, i };
  }
  for (const b of r.react) {
    const i = unheard(b);
    if (i >= 0 && (!b.when || b.when(c))) return { b, i };
  }
  for (const b of r.story) {
    const i = unheard(b);
    if (i < 0) continue;
    // The story is told in order: a later beat waits for this one (and for tomorrow).
    return !toldToday && (!b.when || b.when(c)) ? { b, i } : null;
  }
  return null;
}

/** Small talk turns over between conversations (not saved). */
const idleTurn = new Map<string, number>();

/** What the regular says next. Does not mark it as heard (see `hear`). */
export function nextLine(d: SaveData, id: string): Line | null {
  const r = regular(id);
  if (!r) return null;
  const seen = new Set(d.storySeen ?? []);
  const c = storyCtx(d);
  const open = openBeat(r, c, seen, d.counters[beatKey(id)] === dayStamp(d));
  if (open) return { text: open.b.lines[open.i], key: `${r.id}.${open.b.id}.${open.i}`, more: open.i < open.b.lines.length - 1 };
  const idle = r.idle(c);
  const k = idleTurn.get(id) ?? Math.floor(Math.random() * idle.length);
  return { text: idle[k % idle.length], key: null, more: false };
}

/** The line has been said: remember it (and turn the small talk over). */
export function hear(state: GameState, id: string, line: Line) {
  const d = state.data;
  if (!d.storySeen) d.storySeen = [];
  if (line.key && !d.storySeen.includes(line.key)) {
    d.storySeen.push(line.key);
    // A finished story beat: the next one waits for another day.
    const [, beat] = line.key.split('.');
    const b = regular(id)?.story.find((x) => x.id === beat);
    if (b && line.key.endsWith(`.${b.lines.length - 1}`)) d.counters[beatKey(id)] = dayStamp(d);
  }
  if (!line.key) idleTurn.set(id, (idleTurn.get(id) ?? 0) + 1);
  else idleTurn.delete(id);
}

/** True while the regular has something new to tell (a story beat or a reaction). */
export function hasNews(d: SaveData, id: string) {
  const r = regular(id);
  return !!r && !!openBeat(r, storyCtx(d), new Set(d.storySeen ?? []), d.counters[beatKey(id)] === dayStamp(d));
}

/** True when the next line continues a conversation already started. */
export function midConversation(d: SaveData, id: string) {
  const l = nextLine(d, id);
  return !!l?.key && !l.key.endsWith('.0');
}

export function propFor(d: SaveData, r: RegularDef) {
  return r.prop(storyCtx(d), new Set(d.storySeen ?? []));
}

// ---- Chapters -------------------------------------------------------------------------------------

/** How many chapters the story has (the last one is the ending). */
export const CHAPTER_COUNT = 6;

/** The chapter to show after a won season: the first unread one, at most one per Queen victory. */
export function chapterDue(d: SaveData): number {
  const seen = new Set(d.storySeen ?? []);
  const upTo = Math.min(CHAPTER_COUNT, d.records.seasonsWon);
  for (let n = 1; n <= upTo; n++) if (!seen.has(`ch:${n}`)) return n;
  return 0;
}

export function markChapter(state: GameState, n: number) {
  const d = state.data;
  if (!d.storySeen) d.storySeen = [];
  if (!d.storySeen.includes(`ch:${n}`)) d.storySeen.push(`ch:${n}`);
  state.emit();
}

/** Keeps the "purse was empty" flag for the reactions. */
export function installStory(state: GameState) {
  state.onChange(() => {
    const d = state.data;
    if (d.balance < 10 && d.stats.rounds > 0 && !d.counters[BROKE_KEY]) d.counters[BROKE_KEY] = 1;
  });
}
