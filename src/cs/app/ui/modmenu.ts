// The house menu behind the code pad: categories on the left, a search over every value, and
// controls that act at once. Nothing it changes leaves a mark anywhere else on the site.

import { RARITIES, type CaseDef } from '../../contract';
import { CASES, skinById } from '../lib/assets';
import { caseRTP, casePrice, tierOdds } from '../lib/economy';
import {
  ACHIEVEMENTS, DAILY_ID, MAX_LEVEL, TITLES, cheapestCase, dailyCase, ensureMissions, levelInfo, missionDef, titleOf, xpToNext,
} from '../lib/career';
import { BOT_NAMES } from '../lib/bots';
import * as M from '../lib/mods';
import { setCode } from '../lib/panel';
import { START_BALANCE, addCoins, commit, exportCode, importCode, invValue, onChange, resetSave, save, type Stats } from '../lib/state';
import { esc, fmt, pct } from '../lib/util';
import { names, rName } from './items';
import { openModal } from './modal';
import { actions, block, group, modBind, numField, refreshAll, rows, select, slider, textField, toggle, type Bind, type Row } from './modctl';
import { inventoryPane, skinPicker } from './modinv';
import { MOD_CSS } from './modstyle';

const BASE_BOTS = [...BOT_NAMES];
M.applyBotNames(BOT_NAMES, BASE_BOTS);
M.onMods(() => M.applyBotNames(BOT_NAMES, BASE_BOTS));

const luckFmt = (v: number) => (v > 0 ? `+${v}` : String(v));
const xFmt = (v: number) => `×${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`;
const pFmt = (v: number) => `${v.toLocaleString('de-DE', { maximumFractionDigits: 3 })} %`;
const allCases = (): CaseDef[] => [...CASES, dailyCase()];

/** Bind to a value in the save; every change redraws the shell. */
function saveBind<T>(get: () => T, setV: (v: T) => void, def: T): Bind<T> {
  return { get, set: (v) => { setV(v); commit(); }, def };
}
const xpForLevel = (lvl: number) => { let x = 0; for (let l = 1; l < lvl; l++) x += xpToNext(l); return x; };

let say: (t: string) => void = () => {};

// ---------- Konto ----------

const STAT_LABEL: Partial<Record<keyof Stats, string>> = {
  opened: 'Kisten geöffnet', spent: 'Ausgegeben', dropValue: 'Wert aller Drops', sold: 'Verkauft für', golds: '★ gezogen', coverts: 'Verdeckt gezogen',
  battles: 'Battles gespielt', battlesWon: 'Battles gewonnen', upgrades: 'Upgrades', upgradesWon: 'Upgrades geschafft', contracts: 'Verträge',
  flips: 'Coinflips', flipsWon: 'Coinflips gewonnen', crash: 'Crash-Runden', crashWon: 'Crash gewonnen', crashBest: 'Bester Crash (×)', bonus: 'Erhaltene Boni',
};

function kontoPane(): HTMLElement[] {
  const coins = numField('Kontostand', saveBind(() => save.balance, (v) => { save.balance = Math.max(0, Math.round((v ?? 0) * 100) / 100); }, START_BALANCE), { min: 0, step: 0.01, unit: 'Coins', keys: 'coins geld balance', fmt: fmt });
  const add = actions('Coins hinzufügen', [
    ['+10', () => { addCoins(10); commit(); }], ['+100', () => { addCoins(100); commit(); }], ['+1.000', () => { addCoins(1000); commit(); }],
    ['+10.000', () => { addCoins(10000); commit(); }], ['×2', () => { save.balance = Math.round(save.balance * 200) / 100; commit(); }], ['Auf 0!', () => { save.balance = 0; commit(); }, 'danger'],
  ], { keys: 'coins geld add', info: () => `${fmt(save.balance)} Coins` });
  const xp = numField('XP gesamt', saveBind(() => save.xp, (v) => { save.xp = Math.max(0, Math.round(v ?? 0)); save.rewardedLevel = Math.max(save.rewardedLevel, levelInfo().level); }, 0), { min: 0, step: 1, keys: 'erfahrung' });
  const lvl = numField('Stufe', saveBind(() => levelInfo().level, (v) => { const l = Math.max(1, Math.min(MAX_LEVEL, Math.round(v ?? 1))); save.xp = xpForLevel(l); save.rewardedLevel = Math.max(save.rewardedLevel, l); }, 1), { min: 1, max: MAX_LEVEL, step: 1, help: 'Setzt die XP auf den Anfang der Stufe. Ohne Stufen-Belohnungen.', keys: 'level' });
  const title = select('Karriere-Titel', saveBind(() => titleOf().name, (v) => { const t = TITLES.find((x) => x.name === v); if (t) { save.xp = xpForLevel(t.from); save.rewardedLevel = Math.max(save.rewardedLevel, t.from); } }, TITLES[0].name), TITLES.map((t) => [t.name, `${t.name} (ab Stufe ${t.from})`]), { keys: 'titel rang' });
  const name = textField('Name', saveBind(() => save.name, (v) => { save.name = v.trim().slice(0, 18) || 'Du'; }, 'Du'), { max: 18 });
  const avatar = numField('Avatar', saveBind(() => save.avatar, (v) => { save.avatar = Math.max(0, Math.min(11, Math.round(v ?? 0))); }, 0), { min: 0, max: 11, step: 1, help: '0 bis 11' });

  const cool = actions('Abklingzeiten', [
    ['Tagesbonus bereit', () => { save.daily.bonusAt = 0; commit(); say('Tagesbonus ist bereit.'); }],
    ['Tageskiste bereit', () => { save.daily.caseAt = 0; commit(); say('Tageskiste ist bereit.'); }],
    ['Rettung bereit', () => { save.daily.rescueAt = 0; commit(); say('Rettung ist bereit.'); }],
  ], { keys: 'cooldown tagesbonus tageskiste rettung reset' });
  const rescue = actions('Rettung gutschreiben', [
    ['Jetzt gutschreiben', () => { const n = M.ov('eco.rescue', Math.max(15, Math.ceil(cheapestCase() * 3))); addCoins(n); save.stats.bonus += n; commit(); say(`+${fmt(n)} Coins.`); }],
  ], { keys: 'rescue pleite', help: 'Ohne Wartezeit und ohne Pleite-Prüfung.' });

  const stats = (Object.keys(STAT_LABEL) as (keyof Stats)[]).map((k) => numField(STAT_LABEL[k]!, saveBind(() => Number(save.stats[k] ?? 0), (v) => { (save.stats as unknown as Record<string, number>)[k] = Math.max(0, v ?? 0); }, 0), { min: 0, step: k === 'spent' || k === 'dropValue' || k === 'sold' || k === 'bonus' || k === 'crashBest' ? 0.01 : 1, keys: `statistik ${k}` }));
  const net = numField('Bilanz', saveBind(() => Math.round((save.balance + invValue() - START_BALANCE - save.stats.bonus) * 100) / 100, (v) => { save.stats.bonus = Math.round((save.balance + invValue() - START_BALANCE - (v ?? 0)) * 100) / 100; }, 0), { step: 0.01, help: 'Gewinn auf der Karriereseite (verschiebt "Erhaltene Boni").', keys: 'profit gewinn statistik' });
  const best = actions('Bester Drop', [['Löschen', () => { delete save.stats.best; commit(); }]], { info: () => (save.stats.best ? `${names(save.stats.best.item).full} · ${fmt(save.stats.best.value)}` : '–'), help: 'Setzen: im Inventar ein Item öffnen, "Als besten Drop".', keys: 'best drop statistik' });

  const missions = block('Heutige Missionen', (host) => {
    const draw = () => {
      ensureMissions();
      host.innerHTML = save.missions.list.map((m) => { const d = missionDef(m.id); return d ? `<div class="mm-ms"><span>${esc(d.text)} <small class="mono">${Math.min(m.progress, d.target)}/${d.target}${m.claimed ? ' · abgeholt' : ''}</small></span><div class="mm-btns"><button type="button" class="btn ghost sm" data-a="done" data-id="${m.id}">Erfüllen</button><button type="button" class="btn ghost sm" data-a="reset" data-id="${m.id}">Zurücksetzen</button></div></div>` : ''; }).join('');
    };
    host.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      const m = b && save.missions.list.find((x) => x.id === b.dataset.id);
      const d = m && missionDef(m.id);
      if (!m || !d) return;
      if (b!.dataset.a === 'done') m.progress = d.target; else { m.progress = 0; m.claimed = false; }
      commit(); draw();
    });
    draw();
    return draw;
  }, { keys: 'missionen mission erfüllen' });
  const missionAll = actions('Alle Missionen', [
    ['Alle erfüllen', () => { ensureMissions(); for (const m of save.missions.list) m.progress = missionDef(m.id)?.target ?? m.progress; commit(); }],
    ['Alle zurücksetzen', () => { for (const m of save.missions.list) { m.progress = 0; m.claimed = false; } commit(); }],
    ['Neu würfeln', () => { save.missions = { day: '', list: [] }; ensureMissions(); commit(); }],
  ], { keys: 'missionen reset' });

  const achs = ACHIEVEMENTS.map((a) => toggle(`${a.icon} ${a.name}`, saveBind(() => !!save.achievements[a.id], (v) => { if (v) save.achievements[a.id] = Date.now(); else delete save.achievements[a.id]; }, false), { help: a.text, keys: 'erfolg achievement' }));
  const achAll = actions('Alle Erfolge', [
    ['Alle freischalten', () => { for (const a of ACHIEVEMENTS) save.achievements[a.id] ||= Date.now(); commit(); }],
    ['Alle sperren', () => { save.achievements = {}; commit(); }],
  ], { help: 'Gesperrte Erfolge, deren Bedingung schon erfüllt ist, kommen beim nächsten Spielzug wieder.', keys: 'erfolge reset' });

  return [
    group('Konto', [coins, add, name, avatar]),
    group('Karriere', [lvl, xp, title]),
    group('Abklingzeiten', [cool, rescue]),
    group('Missionen', [missions, missionAll]),
    group('Erfolge', [achAll, ...achs]),
    group('Statistik', [net, best, ...stats]),
  ];
}

// ---------- Kisten ----------

const WEAR_OPTS: [string, string][] = [['normal', 'Normal'], ['FN', 'Nur Fabrikneu'], ['MW', 'Nur Minimale Spuren'], ['FT', 'Nur Einsatzerprobt'], ['WW', 'Nur Abgenutzt'], ['BS', 'Nur Kampfspuren'], ['range', 'Eigener Bereich']];

function kistenPane(): HTMLElement[] {
  const global = [
    ...RARITIES.map((r) => slider(`Gewicht ${rName(r)}`, modBind(`cs.w.${r}`), { min: 0, max: 20, step: 0.05, fmt: xFmt, keys: `seltenheit stufe tier rarity ${r} chance`, help: r === 'gold' ? 'Messer und Handschuhe' : undefined })),
    slider('Gold-Chance', modBind('cs.gold'), { min: 0, max: 100, step: 0.01, fmt: pFmt, nullText: 'Normal', nullAt: 0.26, help: 'Fester Anteil für ★ in jeder Kiste mit Gold.', keys: 'messer handschuhe gold knife' }),
    slider('StatTrak-Chance', modBind('cs.st'), { min: 0, max: 100, step: 0.5, fmt: pFmt, nullText: '10 %', nullAt: 10, keys: 'stattrak st' }),
    select('Abnutzung', modBind('cs.wear'), WEAR_OPTS, { help: 'Zwingt den Float in einen Bereich.', keys: 'float wear fn fabrikneu abnutzung' }),
    numField('Float von', modBind('cs.fmin'), { min: 0, max: 1, step: 0.001, help: 'Nur bei "Eigener Bereich"', keys: 'float min bereich' }),
    numField('Float bis', modBind('cs.fmax'), { min: 0, max: 1, step: 0.001, help: 'Nur bei "Eigener Bereich"', keys: 'float max bereich' }),
    slider('Float-Neigung', modBind('cs.fbias'), { min: -100, max: 100, step: 1, fmt: luckFmt, help: 'Plus = niedriger Float (besser), Minus = abgenutzter.', keys: 'float bias' }),
    toggle('Auch für Bots in Battles', modBind('bt.botMods'), { help: 'Sonst gelten die Kistenwerte nur für dich.', keys: 'bots battle' }),
  ];
  const shop = [
    slider('Preisfaktor', modBind('cs.price'), { min: 0.05, max: 5, step: 0.05, fmt: xFmt, help: 'Alle Kistenpreise.', keys: 'preis price kosten' }),
    toggle('Alle Kisten freischalten', modBind('cs.unlock'), { help: 'Ignoriert die Stufen-Sperre.', keys: 'unlock level sperre' }),
    slider('Öffnungstempo', modBind('cs.speed'), { min: 0.25, max: 6, step: 0.05, fmt: xFmt, help: 'Walzen auf der Kistenseite.', keys: 'speed tempo schnell' }),
    toggle('Spannung bei ★', modBind('cs.suspense'), { help: 'Das langsame Ausrollen mit Ton vor Gold.', keys: 'suspense reveal' }),
  ];

  // next drop
  const fMode = select('Nächster Drop', modBind('force.mode'), [['off', 'Aus'], ['once', 'Einmal'], ['always', 'Immer']], { help: 'Gilt für deine Kisten (auch im Battle).', keys: 'force erzwingen next drop' });
  const fCase = select('Nur in Kiste', modBind('force.case'), [['', 'Jede Kiste'], ...allCases().map((c): [string, string] => [c.id, c.name])], { keys: 'force kiste' });
  const fSkin = block('Skin für den nächsten Drop', (host) => {
    host.innerHTML = '<p class="mm-note mm-fs"></p><div class="mm-fp"></div>';
    const lbl = host.querySelector('.mm-fs') as HTMLElement;
    const draw = () => { const s = skinById(M.str('force.skin')); lbl.innerHTML = s ? `Gewählt: <b>${esc(names({ skin: s.id, statTrak: false }).full)}</b> <small>(Float ${s.floatMin}–${s.floatMax})</small>` : 'Noch kein Skin gewählt.'; };
    skinPicker(host.querySelector('.mm-fp') as HTMLElement, (s) => { M.set('force.skin', s.id); if (M.str('force.mode') === 'off') M.set('force.mode', 'once'); say(`Nächster Drop: ${names({ skin: s.id, statTrak: false }).full}`); refreshAll(); }, () => M.str('force.skin'));
    draw();
    return draw;
  }, { keys: 'force skin erzwingen picker' });
  const fFloat = slider('Float des Drops', modBind('force.float'), { min: 0, max: 1, step: 0.0001, fmt: (v) => v.toFixed(4), nullText: 'Zufall', nullAt: 0, keys: 'force float' });
  const fSeed = numField('Muster des Drops', modBind('force.seed'), { min: 0, max: 999, step: 1, nullText: 'Zufall', keys: 'force seed muster' });
  const fSt = toggle('StatTrak™ beim Drop', modBind('force.st'), { keys: 'force stattrak' });

  // one case
  const one = block('Werte einer Kiste', (host) => {
    let id = CASES[0].id;
    host.innerHTML = `<select class="sel mm-case" aria-label="Kiste">${allCases().map((c) => `<option value="${c.id}">${esc(c.name)}${c.id === DAILY_ID ? '' : ` · ${c.category}`}</option>`).join('')}</select><div class="mm-one"></div>`;
    const sel = host.querySelector('select') as HTMLSelectElement;
    const box = host.querySelector('.mm-one') as HTMLElement;
    let own: Row[] = [];
    const build = () => {
      own.forEach((r) => rows.delete(r));
      const c = allCases().find((x) => x.id === id)!;
      const base = tierOdds(c);
      const eff = () => M.odds(c, base, 'you');
      own = [
        ...base.map((o) => numField(`${rName(o.rarity)} %`, modBind(`case.${c.id}.p.${o.rarity}`), { min: 0, max: 100, step: 0.001, nullText: (o.p * 100).toFixed(3).replace('.', ','), fmt: pFmt })),
        ...(c.contents.gold?.length ? [slider('Gold-Chance', modBind(`case.${c.id}.gold`), { min: 0, max: 100, step: 0.01, fmt: pFmt, nullText: 'Global', nullAt: 0 })] : []),
        slider('StatTrak-Chance', modBind(`case.${c.id}.st`), { min: 0, max: 100, step: 0.5, fmt: pFmt, nullText: 'Global', nullAt: 10 }),
        select('Abnutzung', { get: () => String(M.get(`case.${c.id}.wear`) ?? ''), set: (v) => M.set(`case.${c.id}.wear`, v || null), def: '' }, [['', 'Global'], ...WEAR_OPTS]),
        slider('Float-Neigung', modBind(`case.${c.id}.fbias`), { min: -100, max: 100, step: 1, fmt: luckFmt, nullText: 'Global', nullAt: 0 }),
        ...(c.id === DAILY_ID ? [] : [slider('Preisfaktor', modBind(`case.${c.id}.price`), { min: 0.05, max: 5, step: 0.05, fmt: xFmt, nullText: 'Global', nullAt: 1 })]),
        actions('Effektiv', [['Kiste zurücksetzen', () => { for (const k of M.changedKeys()) if (k.startsWith(`case.${c.id}.`)) M.reset(k); }]], {
          info: () => `${eff().map((o) => `${rName(o.rarity)} ${pct(o.p, o.p < 0.01 ? 3 : 2)}`).join(' · ')}${c.id === DAILY_ID ? '' : ` · Preis ${fmt(casePrice(c))} · RTP ${pct(caseRTP(c), 1)}`}`,
        }),
      ];
      box.replaceChildren(...own.map((r) => r.el));
    };
    sel.addEventListener('change', () => { id = sel.value; build(); });
    build();
  }, { keys: 'einzelne kiste case per gewicht chance seltenheit preis gold' });

  return [
    group('Alle Kisten · Ziehung', global, 'Gilt für deine Öffnungen. Die angezeigten Chancen auf den Seiten bleiben unverändert.'),
    group('Alle Kisten · Laden', shop),
    group('Nächster Drop', [fMode, fCase, fSkin, fFloat, fSeed, fSt]),
    group('Einzelne Kiste', [one]),
  ];
}

// ---------- Glück ----------

function glueckPane(): HTMLElement[] {
  const L = (label: string, k: string, help?: string) => slider(label, modBind(k), { min: -100, max: 100, step: 1, fmt: luckFmt, help, keys: 'luck glück' });
  const perBot = block('Glück einzelner Bots', (host) => {
    host.innerHTML = `<div class="mm-inl"><select class="sel mm-bsel" aria-label="Bot"></select><button type="button" class="btn ghost sm mm-badd">Hinzufügen</button></div><div class="mm-bl"></div>`;
    const sel = host.querySelector('select') as HTMLSelectElement;
    const box = host.querySelector('.mm-bl') as HTMLElement;
    let own: Row[] = [];
    const draw = () => {
      const keys = M.changedKeys().filter((k) => k.startsWith('luck.bot.'));
      const have = keys.map((k) => k.slice(9));
      if (have.join() === own.map((r) => r.el.dataset.bot).join()) return;
      own.forEach((r) => rows.delete(r));
      own = have.map((n) => { const r = L(n, `luck.bot.${n}`); r.el.dataset.bot = n; return r; });
      box.replaceChildren(...own.map((r) => r.el));
      sel.innerHTML = BOT_NAMES.filter((n) => !have.includes(n)).map((n) => `<option>${esc(n)}</option>`).join('');
    };
    host.querySelector('.mm-badd')!.addEventListener('click', () => { if (sel.value) { M.set(`luck.bot.${sel.value}`, 50); refreshAll(); } });
    sel.innerHTML = BOT_NAMES.map((n) => `<option>${esc(n)}</option>`).join('');
    draw();
    return draw;
  }, { keys: 'bot glück luck spieler' });

  return [
    group('Glück', [
      L('Globales Glück', 'luck.global', 'Für alle Spieler. 0 = fair, +100 = immer Gewinn, −100 = immer Verlust.'),
      L('Du', 'luck.you', 'Kommt zum globalen Wert dazu.'),
      L('Alle Bots', 'luck.bots', 'Battles: Bots ziehen mit diesem Glück.'),
      perBot,
    ], 'Kisten: Glück verschiebt die Chancen auf Verdeckt und ★ (bis ×8). Upgrader, Verträge, Coinflip, Crash: wie im Casino.'),
    group('Upgrader', [
      slider('Chancen-Faktor', modBind('up.mult'), { min: 0, max: 5, step: 0.05, fmt: xFmt, help: 'Angezeigt wird weiter die normale Chance.', keys: 'upgrade' }),
      select('Ausgang', modBind('up.force'), [['off', 'Normal'], ['win', 'Immer Gewinn'], ['lose', 'Immer Verlust']], { keys: 'upgrade force' }),
    ]),
    group('Verträge', [
      slider('Aufstiegs-Chance', modBind('ct.chance'), { min: 0, max: 100, step: 0.5, fmt: pFmt, nullText: 'Normal', nullAt: 50, keys: 'vertrag contract' }),
      select('Ausgang', modBind('ct.force'), [['off', 'Normal'], ['win', 'Immer Aufstieg'], ['lose', 'Nie Aufstieg']], { keys: 'vertrag contract force' }),
    ]),
    group('Battles', [
      select('Sieger', modBind('bt.rig'), [['off', 'Normal'], ['you', 'Du (bester Zug pro Runde)'], ['team', 'Dein Team'], ['bot', 'Bots']], { help: 'Verteilt die Züge jeder Runde passend.', keys: 'battle rig gewinner' }),
    ]),
    group('Coinflip', [
      slider('Gewinnchance', modBind('cf.chance'), { min: 0, max: 100, step: 0.5, fmt: pFmt, nullText: '50 %', nullAt: 50, keys: 'coinflip münze' }),
    ]),
    group('Crash', [
      numField('Absturz erzwingen bei', modBind('cr.force'), { min: 1, step: 0.01, unit: '×', nullText: 'Aus', keys: 'crash force' }),
      select('Erzwingen', modBind('cr.forceMode'), [['once', 'Nächste Runde'], ['always', 'Jede Runde']], { keys: 'crash' }),
      numField('Mindestens', modBind('cr.min'), { min: 1, step: 0.01, unit: '×', keys: 'crash min' }),
      numField('Höchstens', modBind('cr.max'), { min: 1, step: 0.01, unit: '×', nullText: 'Offen', keys: 'crash max' }),
      slider('Hausvorteil', modBind('cr.edge'), { min: 0, max: 50, step: 0.5, fmt: pFmt, keys: 'crash edge house' }),
    ]),
  ];
}

// ---------- Wirtschaft ----------

function wirtschaftPane(): HTMLElement[] {
  const cats = M.CATS.map((cat) => {
    const list = CASES.filter((c) => c.category === cat);
    return slider(`RTP ${cat}`, modBind(`eco.rtp.${cat}`), { min: 10, max: 300, step: 0.5, fmt: pFmt, nullText: 'Normal', nullAt: 90, help: `${list.length} Kisten, Ziel-Auszahlung. Preise werden neu berechnet.`, keys: 'rtp auszahlung preis kategorie' });
  });
  return [
    group('Werte', [
      slider('Verkaufsfaktor', modBind('eco.sell'), { min: 0, max: 5, step: 0.05, fmt: xFmt, help: 'Was beim Verkaufen gutgeschrieben wird.', keys: 'sell verkauf' }),
      slider('Itemwert gesamt', modBind('eco.val'), { min: 0.05, max: 10, step: 0.05, fmt: xFmt, keys: 'value wert' }),
      ...RARITIES.map((r) => slider(`Itemwert ${rName(r)}`, modBind(`eco.val.${r}`), { min: 0.05, max: 10, step: 0.05, fmt: xFmt, keys: `value wert seltenheit ${r}` })),
    ]),
    group('Kistenpreise', [
      ...cats,
      actions('Durchschnitt', [], { info: () => M.CATS.map((cat) => { const l = CASES.filter((c) => c.category === cat); return l.length ? `${cat} ${pct(l.reduce((a, c) => a + caseRTP(c), 0) / l.length, 1)}` : ''; }).filter(Boolean).join(' · '), keys: 'rtp' }),
    ]),
    group('Boni', [
      numField('Tagesbonus', modBind('eco.bonus'), { min: 0, step: 0.5, unit: 'Coins', nullText: 'Auto (10 + 2 je Stufe)', keys: 'daily bonus' }),
      numField('Rettung', modBind('eco.rescue'), { min: 0, step: 0.5, unit: 'Coins', nullText: 'Auto', keys: 'rescue rettung pleite' }),
      slider('XP-Faktor', modBind('eco.xp'), { min: 0, max: 20, step: 0.1, fmt: xFmt, keys: 'xp erfahrung level' }),
    ]),
  ];
}

// ---------- Live-Feed & Bots ----------

function feedPane(): HTMLElement[] {
  const names = block('Bot-Namen', (host) => {
    host.innerHTML = `<div class="mm-chips"></div><div class="mm-inl"><input class="inp mm-in wide" maxlength="20" placeholder="Neuer Name" aria-label="Neuer Bot-Name"><button type="button" class="btn ghost sm mm-nadd">Hinzufügen</button><button type="button" class="btn ghost sm mm-nres">Original</button></div>`;
    const chips = host.querySelector('.mm-chips') as HTMLElement;
    const inp = host.querySelector('input') as HTMLInputElement;
    const draw = () => { chips.innerHTML = BOT_NAMES.map((n) => `<span class="mm-chip">${esc(n)}<button type="button" data-n="${esc(n)}" aria-label="${esc(n)} entfernen">✕</button></span>`).join(''); };
    chips.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) { M.removeBot(b.dataset.n!); draw(); } });
    const add = () => { M.addBot(inp.value); inp.value = ''; draw(); };
    host.querySelector('.mm-nadd')!.addEventListener('click', add);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    host.querySelector('.mm-nres')!.addEventListener('click', () => { M.restoreBots(); draw(); });
    draw();
    return draw;
  }, { help: 'Mindestens 4 bleiben.', keys: 'bots namen spieler' });
  return [
    group('Live-Drops', [
      slider('Tempo', modBind('feed.speed'), { min: 0.1, max: 10, step: 0.1, fmt: xFmt, keys: 'feed speed live' }),
      toggle('Pausieren', modBind('feed.pause'), { keys: 'feed pause stop live' }),
      slider('Seltenheit der Bot-Drops', modBind('feed.bias'), { min: -100, max: 100, step: 1, fmt: luckFmt, help: 'Plus = mehr Verdeckt und ★ im Band.', keys: 'feed bias bot rarity' }),
    ]),
    group('Bots', [names]),
  ];
}

// ---------- Anzeige ----------

function anzeigePane(): HTMLElement[] {
  return [
    group('Spielgefühl', [
      slider('Animationstempo', modBind('fx.anim'), { min: 0.25, max: 4, step: 0.05, fmt: xFmt, help: 'Walzen, Münze, Upgrader, Verträge, Battle-Countdown.', keys: 'animation speed' }),
      slider('Walzendauer', modBind('fx.reel'), { min: 0.2, max: 3, step: 0.05, fmt: xFmt, keys: 'reel walze länge dauer' }),
      slider('Partikel', modBind('fx.particles'), { min: 0, max: 4, step: 0.1, fmt: xFmt, keys: 'particles konfetti' }),
      toggle('Wenig Bewegung erzwingen', modBind('fx.reduced'), { keys: 'reduced motion' }),
      toggle('Schnell öffnen', saveBind(() => save.settings.fast, (v) => { save.settings.fast = v; }, false), { keys: 'fast' }),
    ]),
    group('Ton', [
      toggle('Ton', saveBind(() => save.settings.sound, (v) => { save.settings.sound = v; }, true), { keys: 'sound' }),
      slider('Lautstärke', saveBind<number | null>(() => save.settings.volume, (v) => { save.settings.volume = Math.max(0, Math.min(1, v ?? 0.7)); }, 0.7), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %`, keys: 'volume sound' }),
    ]),
  ];
}

// ---------- Daten ----------

function codeOf(json: string): string {
  const b = btoa(unescape(encodeURIComponent(json)));
  let h = 0;
  for (let i = 0; i < b.length; i++) h = (h * 31 + b.charCodeAt(i)) >>> 0;
  return `CSG1.${h.toString(36)}.${b}`;
}

function datenPane(close: () => void): HTMLElement[] {
  const raw = block('Spielstand (JSON)', (host) => {
    host.innerHTML = `<textarea class="inp mm-json" spellcheck="false" aria-label="Spielstand als JSON"></textarea><div class="mm-btns"><button type="button" class="btn ghost sm j-load">Neu laden</button><button type="button" class="btn ghost sm j-check">Prüfen</button><button type="button" class="btn primary sm j-apply">Übernehmen</button></div>`;
    const ta = host.querySelector('textarea') as HTMLTextAreaElement;
    const load = () => { ta.value = JSON.stringify(save, null, 1); };
    const check = (): object | null => {
      try {
        const o = JSON.parse(ta.value);
        if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Kein Objekt');
        if (typeof o.balance !== 'number') throw new Error('"balance" fehlt oder ist keine Zahl');
        if (!Array.isArray(o.inv)) throw new Error('"inv" ist keine Liste');
        const bad = o.inv.findIndex((i: { skin?: unknown; float?: unknown }) => !i || typeof i.skin !== 'string' || typeof i.float !== 'number' || !skinById(i.skin));
        if (bad >= 0) throw new Error(`Gegenstand ${bad + 1} ist ungültig`);
        return o;
      } catch (e) { say(`Fehler: ${(e as Error).message}`); return null; }
    };
    host.querySelector('.j-load')!.addEventListener('click', () => { load(); say('Neu geladen.'); });
    host.querySelector('.j-check')!.addEventListener('click', () => { if (check()) say('JSON ist gültig.'); });
    host.querySelector('.j-apply')!.addEventListener('click', () => { const o = check(); if (o && importCode(codeOf(JSON.stringify(o)))) { load(); refreshAll(); say('Spielstand übernommen.'); } });
    load();
  }, { keys: 'json raw save daten editor spielstand' });

  const modsRaw = block('Mod-Werte (JSON)', (host) => {
    host.innerHTML = `<textarea class="inp mm-json small" spellcheck="false" aria-label="Mod-Werte als JSON"></textarea><div class="mm-btns"><button type="button" class="btn ghost sm m-load">Neu laden</button><button type="button" class="btn primary sm m-apply">Übernehmen</button></div>`;
    const ta = host.querySelector('textarea') as HTMLTextAreaElement;
    const load = () => { ta.value = JSON.stringify(M.dump(), null, 1); };
    host.querySelector('.m-load')!.addEventListener('click', load);
    host.querySelector('.m-apply')!.addEventListener('click', () => { try { M.load(JSON.parse(ta.value)); load(); refreshAll(); say('Mod-Werte übernommen.'); } catch (e) { say(`Fehler: ${(e as Error).message}`); } });
    load();
  }, { keys: 'json mods export' });

  const code = block('Spielstand-Code', (host) => {
    host.innerHTML = `<textarea class="inp mm-json code" spellcheck="false" placeholder="CSG1…" aria-label="Spielstand-Code"></textarea><div class="mm-btns"><button type="button" class="btn ghost sm c-exp">Erzeugen</button><button type="button" class="btn ghost sm c-copy">Kopieren</button><button type="button" class="btn primary sm c-imp">Laden</button></div>`;
    const ta = host.querySelector('textarea') as HTMLTextAreaElement;
    host.querySelector('.c-exp')!.addEventListener('click', () => { ta.value = exportCode(); say('Code erzeugt.'); });
    host.querySelector('.c-copy')!.addEventListener('click', () => { ta.select(); void navigator.clipboard?.writeText(ta.value).then(() => say('Kopiert.'), () => say('Kopieren nicht möglich, bitte markieren.')); });
    host.querySelector('.c-imp')!.addEventListener('click', () => { say(importCode(ta.value) ? 'Spielstand geladen.' : 'Code ungültig.'); refreshAll(); });
  }, { keys: 'export import code' });

  const pin = block('Code ändern', (host) => {
    host.innerHTML = `<div class="mm-inl"><input class="inp mm-in" type="password" inputmode="numeric" maxlength="8" placeholder="Neuer Code" aria-label="Neuer Code"><input class="inp mm-in" type="password" inputmode="numeric" maxlength="8" placeholder="Wiederholen" aria-label="Code wiederholen"><button type="button" class="btn ghost sm">Ändern</button></div>`;
    const [a, b] = Array.from(host.querySelectorAll('input')) as HTMLInputElement[];
    host.querySelector('button')!.addEventListener('click', () => {
      if (!/^\d{4,8}$/.test(a.value)) { say('Der Code braucht 4 bis 8 Ziffern.'); return; }
      if (a.value !== b.value) { say('Die Codes stimmen nicht überein.'); return; }
      setCode(a.value); a.value = b.value = ''; say('Code geändert.');
    });
  }, { keys: 'pin code passwort' });

  return [
    group('Rohdaten', [raw, modsRaw]),
    group('Sichern', [code]),
    group('Zurücksetzen', [
      actions('Mod-Werte', [['Alle auf Standard!', () => { M.resetAll(); say('Alle Mod-Werte auf Standard.'); }, 'danger']], { keys: 'reset mods standard', info: () => `${M.changedKeys().length} geändert` }),
      actions('Spielstand', [['Komplett neu!', () => { resetSave(); say('Spielstand zurückgesetzt.'); }, 'danger']], { keys: 'reset spielstand neu' }),
      actions('Menü', [['Schließen', close]]),
    ]),
    group('Zugang', [pin]),
  ];
}

// ---------- Dev ----------

/** The big button that opens the fountain page (closes the menu first). */
function fountainRow(close: () => void) {
  return block('Zauberbrunnen', (host) => {
    host.innerHTML = `<button type="button" class="mm-fb-btn"><span class="mm-fb-ic" aria-hidden="true">✺</span><span><b>Zauberbrunnen öffnen</b><small>Beliebig viele zufällige Items aus dem Brunnen britzeln lassen</small></span></button>`;
    host.querySelector('button')!.addEventListener('click', () => { location.hash = '#/brunnen'; close(); });
  }, { keys: 'zauberbrunnen brunnen dev spiel items random zufall fountain' });
}
function devPane(close: () => void): HTMLElement[] {
  return [group('Dev-Spiele', [fountainRow(close)], 'Nur über dieses Menü erreichbar.')];
}

// ---------- shell ----------

const CATS: { id: string; label: string; icon: string; build: (close: () => void) => HTMLElement[] }[] = [
  { id: 'konto', label: 'Konto', icon: '◉', build: kontoPane },
  { id: 'inventar', label: 'Inventar', icon: '▦', build: (close) => [group('Zauberbrunnen', [fountainRow(close)]), ...inventoryPane(say)] },
  { id: 'kisten', label: 'Kisten', icon: '◆', build: kistenPane },
  { id: 'glueck', label: 'Glück', icon: '✦', build: glueckPane },
  { id: 'wirtschaft', label: 'Wirtschaft', icon: '¢', build: wirtschaftPane },
  { id: 'feed', label: 'Live-Feed & Bots', icon: '≋', build: feedPane },
  { id: 'anzeige', label: 'Anzeige', icon: '✧', build: anzeigePane },
  { id: 'daten', label: 'Daten', icon: '⌘', build: datenPane },
  { id: 'dev', label: 'Dev', icon: '✺', build: devPane },
];

let lastCat = 'konto';
let styled = false;

export function openModMenu() {
  if (!styled) { const st = document.createElement('style'); st.textContent = MOD_CSS; document.head.appendChild(st); styled = true; }
  rows.clear();
  const root = document.createElement('div');
  root.className = 'mm';
  root.innerHTML = `
  <header class="mm-top"><div class="mm-brand">Mod-Menü<small class="mono"></small></div><label class="mm-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Alle Einstellungen durchsuchen" aria-label="Einstellungen durchsuchen"></label></header>
  <nav class="mm-rail" aria-label="Kategorien">${CATS.map((c) => `<button type="button" data-c="${c.id}"><i aria-hidden="true">${c.icon}</i><span>${esc(c.label)}</span><b class="mono"></b></button>`).join('')}</nav>
  <div class="mm-main"></div>
  <footer class="mm-foot" aria-live="polite"></footer>`;
  const main = root.querySelector('.mm-main') as HTMLElement;
  const foot = root.querySelector('.mm-foot') as HTMLElement;
  let msgT = 0;
  say = (t) => { foot.textContent = t; foot.classList.add('on'); clearTimeout(msgT); msgT = window.setTimeout(() => foot.classList.remove('on'), 3500); };

  let dirty = false;
  const m = openModal(root, {
    cls: 'mm-modal', label: 'Mod-Menü',
    onClose: () => {
      offMods(); offSave(); rows.clear();
      M.flush();
      // Pages that show prices, locks or values redraw once the menu is gone.
      const page = location.hash.replace(/^#\/?/, '').split('/')[0] || 'cases';
      if (dirty && !['crash', 'battle', 'upgrader', 'coinflip', 'contracts', 'brunnen'].includes(page)) setTimeout(() => dispatchEvent(new HashChangeEvent('hashchange')), 230);
    },
  });
  const close = () => m.close();

  const panes = new Map<string, HTMLElement>();
  for (const c of CATS) {
    const p = document.createElement('section');
    p.className = 'mm-pane';
    p.dataset.c = c.id;
    p.innerHTML = `<h2 class="mm-ph">${esc(c.label)}</h2>`;
    p.append(...c.build(close));
    panes.set(c.id, p);
    main.appendChild(p);
  }
  const rowOf = new Map<HTMLElement, Row>();
  rows.forEach((r) => rowOf.set(r.el, r));

  const counts = () => {
    const keys = M.changedKeys();
    const n: Record<string, number> = { kisten: keys.filter((k) => k.startsWith('cs.') || k.startsWith('case.') || k.startsWith('force.')).length, glueck: keys.filter((k) => /^(luck|up|ct|bt|cf|cr)\./.test(k)).length, wirtschaft: keys.filter((k) => k.startsWith('eco.')).length, feed: keys.filter((k) => k.startsWith('feed.')).length + M.botsAdded().length + M.botsRemoved().length, anzeige: keys.filter((k) => k.startsWith('fx.')).length };
    root.querySelectorAll<HTMLElement>('.mm-rail button').forEach((b) => { const v = n[b.dataset.c!] ?? 0; (b.querySelector('b') as HTMLElement).textContent = v ? String(v) : ''; });
    (root.querySelector('.mm-brand small') as HTMLElement).textContent = keys.length ? `${keys.length} aktiv` : 'alles Standard';
  };
  const showRows = (p: HTMLElement) => p.querySelectorAll<HTMLElement>('.mm-block').forEach((el) => { if (!el.hidden) rowOf.get(el)?.show?.(); });

  const pick = (id: string) => {
    lastCat = id;
    root.querySelectorAll<HTMLElement>('.mm-rail button').forEach((b) => b.classList.toggle('on', b.dataset.c === id));
    panes.forEach((p, k) => { p.hidden = k !== id; });
    showRows(panes.get(id)!);
    main.scrollTop = 0;
  };
  root.querySelector('.mm-rail')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
    if (!b) return;
    search.value = '';
    root.classList.remove('searching');
    panes.forEach((p) => p.querySelectorAll<HTMLElement>('.mm-row, .mm-group').forEach((x) => (x.hidden = false)));
    pick(b.dataset.c!);
  });

  const search = root.querySelector('.mm-search input') as HTMLInputElement;
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { root.classList.remove('searching'); panes.forEach((p) => p.querySelectorAll<HTMLElement>('.mm-row, .mm-group').forEach((x) => (x.hidden = false))); pick(lastCat); return; }
    root.classList.add('searching');
    root.querySelectorAll('.mm-rail button').forEach((b) => b.classList.remove('on'));
    const words = q.split(/\s+/);
    for (const [id, p] of panes) {
      const cat = CATS.find((c) => c.id === id)!.label.toLowerCase();
      let any = false;
      p.querySelectorAll<HTMLElement>('.mm-group').forEach((g) => {
        const gt = (g.querySelector('h3')?.textContent ?? '').toLowerCase();
        let hit = false;
        g.querySelectorAll<HTMLElement>(':scope > .mm-row').forEach((r) => {
          const ok = words.every((w) => `${cat} ${gt} ${r.dataset.k}`.includes(w));
          r.hidden = !ok; hit ||= ok;
        });
        g.hidden = !hit; any ||= hit;
      });
      p.hidden = !any;
      if (any) showRows(p);
    }
    main.scrollTop = 0;
  });

  const offMods = M.onMods(() => { dirty = true; counts(); });
  const offSave = onChange(() => { dirty = true; });
  counts();
  refreshAll();
  pick(lastCat);
  setTimeout(() => { if (matchMedia('(min-width: 721px)').matches) search.focus({ preventScroll: true }); }, 60);
}
