// Types shared by the engine, the views, the minigames and the network.

/** The four figures of our own cast (knuffige Bohnen), each with its look feature. */
export type Feat = 'cap' | 'ears' | 'ant' | 'horns';
export const FEATS: { id: Feat; name: string; acc: string }[] = [
  { id: 'cap', name: 'Kappe', acc: '#ff3d9a' },
  { id: 'ears', name: 'Hasenohren', acc: '#ffe14a' },
  { id: 'ant', name: 'Antenne', acc: '#ff3d9a' },
  { id: 'horns', name: 'Hörnchen', acc: '#8a4bff' },
];
/** Player colours: every seat at the table has its own. */
export const COLORS = ['#b8f02a', '#ff5fae', '#35d4ff', '#ffc93c', '#a77bff', '#ff8a3d', '#4fe3a0', '#ff5a5a'] as const;

export type BotLevel = 'leicht' | 'normal' | 'stark';
export const BOT_NAMES = ['Kiki', 'Bruno', 'Nele', 'Mira', 'Tobi', 'Ozzy'];

/** Who sits at seat i. `kind` says who plays it: this browser, a bot, or a friend online. */
export interface Seat {
  id: string;
  name: string;
  color: string;
  feat: Feat;
  acc: string;
  kind: 'local' | 'bot' | 'remote';
  bot: BotLevel;
  /** Remote seat currently disconnected: a bot plays it until they are back. */
  away?: boolean;
}

export type MgType = 'ffa' | '1v3' | '2v2' | 'duell' | 'koop' | 'muenz';
export const MG_TYPE_NAME: Record<MgType, string> = {
  ffa: 'Jeder gegen jeden', '1v3': '1 gegen 3', '2v2': '2 gegen 2', duell: 'Duell', koop: 'Koop-Boss', muenz: 'Münz-Minispiel',
};

export type Quality = 'auto' | 'hoch' | 'mittel' | 'niedrig';

/** The rules of an evening, chosen in the lobby. */
export interface Rules {
  rounds: 10 | 15 | 20;
  board: string;
  profi: boolean;
  /** Minigame types allowed in the rotation. */
  types: Record<MgType, boolean>;
}

export const DEFAULT_RULES: Rules = {
  rounds: 10,
  board: 'neonstadt',
  profi: false,
  types: { ffa: true, '1v3': true, '2v2': true, duell: true, koop: true, muenz: true },
};
