// Little lines from the people (and machines) of the house: the bartender, the croupier,
// the slot machine's voice, the moon-flight pilot, the plinko announcer and the guests.
// Driven by round reports; at most one line every ~20 s, never during a big-win stage.
// Losing streaks only ever get a kind word and the offer of a break — never "keep going".

export type Speaker = 'bar' | 'guest' | 'roulette' | 'slots' | 'crash' | 'plinko';
export type Situation = 'winStreak' | 'loseStreak' | 'big10' | 'big50' | 'goal' | 'day' | 'idle';

export const SPEAKER_NAME: Record<Speaker, string> = {
  bar: 'Barkeeper',
  guest: 'Gast',
  roulette: 'Croupier',
  slots: 'Automat',
  crash: 'Mondflug-Pilot',
  plinko: 'Plinko-Ansager',
};

const LINES: Record<Speaker, Record<Situation, string[]>> = {
  bar: {
    winStreak: [
      'Drei in Folge? Ich poliere schon mal ein Glas für den Ruhm.',
      'Du hast heute ein Händchen. Ich eins für Limonade.',
      'Glückssträhne! Die Motten tuscheln schon über dich.',
    ],
    loseStreak: [
      'Pause an der Bar? Geht aufs Haus: Wasser mit Zitrone.',
      'Manche Abende sind zum Gewinnen, manche zum Plaudern. Ich hab Zeit.',
      'Kein Spiel schuldet dir etwas. Ein Minztee vielleicht?',
      'Kurz durchatmen? Der Hocker hier ist noch frei.',
    ],
    big10: ['Das hab ich bis hinter die Theke gehört! Bravo.', 'Zehnfach! Dafür gibt’s ein Schirmchen extra.'],
    big50: ['Fünfzigfach?! Ich muss mich kurz setzen.', 'Davon erzählen wir noch, wenn die Motten längst schlafen.'],
    goal: ['Tagesziel geschafft! Alles Weitere ist Kür, mit Sahne obendrauf.', 'Ziel erreicht. Jetzt darfst du ganz entspannt genießen.'],
    day: ['Guten Abend! Die Limo ist kalt, die Lampen sind warm.', 'Neuer Tag, frische Zitronen. Was darf’s sein?', 'Schön, dich zu sehen. Die Motten haben schon gefragt.'],
    idle: [
      'Ich poliere dieses Glas seit zwanzig Minuten. Es glänzt.',
      'Mocktail des Abends: Falterfizz mit Minze.',
      'Hier wird nur Saft geschüttelt. Und ab und zu eine Hand.',
      'Motten lieben Licht. Ich liebe ein ordentliches Flaschenregal.',
    ],
  },
  guest: {
    winStreak: ['Man erzählt sich, du hast einen Lauf! Glückwunsch.', 'Ich hab dich vorhin jubeln hören. Schön!'],
    loseStreak: ['Ich mach jetzt erst mal Pause. Die Bar hat Kakao!', 'Mir hilft ein Spaziergang durch den Saal. Kommst du mit?', 'Weißt du, was nie verliert? Ein Glas Wasser an der Bar.'],
    big10: ['War das eben dein Gewinn? Der halbe Saal hat geklatscht!'],
    big50: ['Fünfzigfach! Darf ich mich kurz neben dich stellen? Für das Gefühl.'],
    goal: ['Ziel erreicht? Dann gönn dir was Schönes!', 'Glückwunsch zum Tagesziel! Jetzt wird geschlendert.'],
    day: ['Was für ein schöner Abend!', 'Hast du die Bar schon gesehen? Herrlich.', 'Ich liebe es, wenn die Lampen angehen.'],
    idle: [
      'Ob die Motten auch Trinkgeld bekommen?',
      'Mein Großvater hat hier schon getanzt.',
      'Schicke Garderobe heute, alle miteinander.',
      'Ich bin nur wegen der Musik hier. Und der Brezeln.',
    ],
  },
  roulette: {
    winStreak: ['Drei Treffer. Die Kugel scheint dich zu mögen.', 'Ich verneige mich. Rein beruflich, versteht sich.'],
    loseStreak: [
      'Die Kugel hat kein Gedächtnis. Und du jedes Recht auf eine Pause.',
      'Nimm dir Zeit. Das Rad dreht sich auch später noch.',
      'Ein Glas Wasser an der Bar ist nie ein schlechter Zug.',
    ],
    big10: ['Ausgezeichnet gesetzt, Madame, Monsieur.', 'Das Rad applaudiert. Leise, aber es applaudiert.'],
    big50: ['Dreißig Jahre am Kessel, und so was sieht man selten.'],
    goal: ['Tagesziel erreicht. Rien ne va plus für Sorgen.', 'Ziel geschafft! Ab jetzt spielt die Kugel nur noch zum Vergnügen.'],
    day: ['Faites vos jeux! Der Kessel ist frisch poliert.', 'Willkommen am Tisch. Die Kugel ist ausgeschlafen.'],
    idle: ['Ich warte gern. Croupiers sind geduldige Menschen.', 'Rot, Schwarz, oder erst mal nur schauen?', 'Die Null ist die Diva am Tisch: grün und eigenwillig.'],
  },
  slots: {
    winStreak: ['Bling! Bling! Bling! Ich glaube, wir verstehen uns.', 'Meine Walzen werden ganz verlegen.'],
    loseStreak: [
      'Psst. Ich bin nur eine Maschine. Mach ruhig eine Pause.',
      'Meine Walzen drehen auch ohne dich. Eine Limo an der Bar?',
      'Kurze Pause? Ich laufe nicht weg. Ich kann gar nicht laufen.',
    ],
    big10: ['Klingeling! Ich hab mich selbst überrascht.', 'Hörst du das? Das sind meine Glöckchen.'],
    big50: ['Systemmeldung: Freude überlastet. Bitte nicht neu starten.', 'Ich glühe! Das sind keine Lampen, das ist Stolz.'],
    goal: ['Tagesziel erreicht! Ich würde zwinkern, hätte ich ein Auge.'],
    day: ['Guten Abend! Walzen geölt, Lämpchen poliert.', 'Hallo! Ich bin ganz Ohr. Also, ganz Walze.'],
    idle: ['Ich summe ein bisschen vor mich hin. Bsss.', 'Glocken, Kirschen, Motten und ich. Wir warten.', 'Jeden Abend zähle ich meine Kirschen. Alle noch da.'],
  },
  crash: {
    winStreak: ['Drei sichere Landungen! Du fliegst wie ein Profi.', 'Copilot, notieren: perfekte Serie.'],
    loseStreak: [
      'Auch Piloten machen Pausen. Vorschrift, sogar.',
      'Der Mond bleibt, wo er ist. Kurz landen und durchatmen?',
      'Bodenpersonal empfiehlt: ein Glas Wasser und ein Blick in die Sterne.',
    ],
    big10: ['Hui, das war hoch! Sauber ausgestiegen.', 'Schöner Flug! Der Tower ist beeindruckt.'],
    big50: ['Ich sehe den Mond von hinten! Was für ein Flug!'],
    goal: ['Tagesziel erreicht! Der Tower winkt.'],
    day: ['Kabine bereit, Mond in Sicht. Guten Flug!', 'Wetter heute: klar, mit Aussicht auf Motten.'],
    idle: ['Der Motor schnurrt. Ich auch, ein bisschen.', 'Motten navigieren nach dem Mond. Ich übrigens auch.'],
  },
  plinko: {
    winStreak: ['Sie hüpft und hüpft … und trifft! Schon wieder!', 'Meine Damen und Herren: eine Serie!'],
    loseStreak: [
      'Die Stifte sind heute launisch. Wie wär’s mit einer Pause?',
      'Zeit für eine Limo? Die Motten fallen später auch noch.',
      'Kurze Verschnaufpause? Ich halte so lange die Motten fest.',
    ],
    big10: ['Was für ein Fall! Applaus für die Motte!'],
    big50: ['UNGLAUBLICH! Ganz außen gelandet! Mir bleibt die Stimme weg!'],
    goal: ['Tagesziel erreicht! Konfetti, bitte! … Gut, dann eben Motten.'],
    day: ['Willkommen zum großen Fall des Abends!', 'Die Stifte sind gestimmt, die Motten aufgewärmt!'],
    idle: ['Ping, ping, ping. Ich übe schon mal die Geräusche.', 'Die Motten stehen bereit. Sie warten nur auf dich.'],
  },
};

/** Picks a line, avoiding the ones said recently. */
export class QuipPicker {
  private recent: string[] = [];

  pick(speaker: Speaker, s: Situation): string {
    const pool = LINES[speaker][s];
    const fresh = pool.filter((l) => !this.recent.includes(l));
    const from = fresh.length ? fresh : pool.filter((l) => l !== this.recent[this.recent.length - 1]);
    const line = from[Math.floor(Math.random() * from.length)] ?? pool[0];
    this.recent.push(line);
    if (this.recent.length > 8) this.recent.shift();
    return line;
  }
}

/** Game ids that have their own voice. */
export function gameSpeaker(game: string | null): Speaker | null {
  return game === 'roulette' || game === 'slots' || game === 'crash' || game === 'plinko' ? game : null;
}

const PRIORITY: Record<Situation, number> = { big50: 5, big10: 4, goal: 4, loseStreak: 3, winStreak: 2, day: 1, idle: 0 };
/** Minimum time between two lines. */
const GAP = 20000;
/** Quiet time after the start of a big-win stage (≥ 20×). */
const STAGE_QUIET = 7000;
const IDLE_AFTER = 55000;

interface RoundLike {
  stake: number;
  win: number;
}

/**
 * Decides *when* something is said and *what about*; `deliver` decides who says it and
 * returns false when nobody can right now (a menu is open, nobody is around).
 */
export class QuipEngine {
  private now = 0;
  private lastLine = -GAP + 8000;
  private lastActivity = 0;
  private quietUntil = 0;
  private notBefore = 0;
  private wins = 0;
  private losses = 0;
  private pending: { s: Situation; until: number } | null = null;

  constructor(private deliver: (s: Situation) => boolean) {}

  private queue(s: Situation, lifeMs: number, delayMs = 0) {
    if (this.pending && this.pending.until > this.now && PRIORITY[this.pending.s] > PRIORITY[s]) return;
    this.pending = { s, until: this.now + delayMs + lifeMs };
    this.notBefore = Math.max(this.notBefore, this.now + delayMs);
  }

  round(r: RoundLike) {
    this.lastActivity = this.now;
    const mult = r.stake > 0 ? r.win / r.stake : 0;
    if (mult >= 20) this.stage();
    if (r.win > r.stake) {
      this.wins++;
      this.losses = 0;
    } else if (r.win < r.stake) {
      this.losses++;
      this.wins = 0;
    }
    if (mult >= 50) this.queue('big50', 14000, 600);
    else if (mult >= 10) this.queue('big10', 10000, 900);
    else if (this.wins === 3 || this.wins === 6 || this.wins === 10) this.queue('winStreak', 12000, 600);
    else if (this.losses === 4 || this.losses === 8 || this.losses === 12) this.queue('loseStreak', 45000, 800);
  }

  /** A ≥ 20× stage started: say nothing for a while, and drop what was about to be said. */
  stage() {
    this.quietUntil = this.now + STAGE_QUIET;
  }

  get quiet() {
    return this.now < this.quietUntil;
  }

  goal() {
    this.queue('goal', 25000, 1500);
  }

  day() {
    this.wins = 0;
    this.losses = 0;
    this.queue('day', 5 * 60000, 6000);
  }

  /** Something happened (a room was entered, a menu closed): idle chatter waits. */
  touch(delayMs = 0) {
    this.lastActivity = this.now;
    this.notBefore = Math.max(this.notBefore, this.now + delayMs);
  }

  update(dtMs: number) {
    this.now += dtMs;
    if (this.pending && this.now > this.pending.until) this.pending = null;
    if (this.now < this.quietUntil || this.now < this.notBefore || this.now - this.lastLine < GAP) return;
    if (!this.pending && this.now - Math.max(this.lastLine, this.lastActivity) > IDLE_AFTER) this.pending = { s: 'idle', until: this.now + 4000 };
    if (!this.pending) return;
    if (this.deliver(this.pending.s)) {
      this.pending = null;
      this.lastLine = this.now;
    } else if (this.pending.s === 'idle') {
      this.pending = null;
      this.lastActivity = this.now;
    }
  }
}
