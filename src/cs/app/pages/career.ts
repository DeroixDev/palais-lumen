// Karriere: profile, title ladder, rewards, daily missions, stats, showcase, achievements.

import { ACHIEVEMENTS, DAILY_ID, getCase as _gc, MAX_LEVEL, TITLES, bonusAmount, bonusReadyIn, claimBonus, claimMission, dailyCase, dailyReadyIn, ensureMissions, levelCaseFor, levelInfo, missionDef, msToMidnight, titleOf } from '../lib/career';
import { itemValue } from '../lib/economy';
import { avatarSVG } from '../lib/bots';
import { START_BALANCE, invValue, save } from '../lib/state';
import { sfx } from '../lib/sound';
import { esc, fmt, fmtInt, hms } from '../lib/util';
import { icon } from '../ui/icons';
import { itemCard, names } from '../ui/items';
import { openItemDetail } from '../ui/detail';
import { toast } from '../ui/toast';
import { caseArt } from './cases';
import type { Page } from './page';

export const careerPage: Page = (root) => {
  const draw = () => {
    ensureMissions();
    const li = levelInfo();
    const t = titleOf(li.level);
    const ti = TITLES.indexOf(t);
    const next = TITLES[ti + 1];
    const s = save.stats;
    const balanceNet = save.balance + invValue() - START_BALANCE - s.bonus;
    const showcase = save.inv.slice().sort((a, b) => itemValue(b) - itemValue(a)).slice(0, 5);
    const nextCase = levelCaseFor(Math.min(MAX_LEVEL, li.level + 1));
    const frees = Object.entries(save.freeOpens).filter(([, n]) => n > 0);
    root.innerHTML = `
    <section class="profile">
      <div class="pf-av">${avatarSVG(save.avatar, save.name)}<span class="pf-lvl mono">${li.level}</span></div>
      <div class="pf-main">
        <span class="eyebrow">Karriere · Stufe ${li.level} von ${MAX_LEVEL}</span>
        <h1>${esc(save.name)} <span class="pf-title">${t.name}</span></h1>
        <p class="pf-blurb">${t.blurb}</p>
        <div class="pf-xp"><div class="xpbar"><i style="width:${li.frac * 100}%"></i></div><span class="mono">${li.need ? `${fmtInt(li.into)} / ${fmtInt(li.need)} XP` : 'Höchste Stufe erreicht'}</span></div>
        <div class="pf-next">${li.need ? `Nächste Stufe: ${nextCase ? `Gratis <b>${esc(nextCase.name)}</b>` : ''}${(li.level + 1) % 5 === 0 ? ` + <b>${(li.level + 1) * 4} Coins</b>` : ''}${next ? ` · Titel <b>${next.name}</b> ab Stufe ${next.from}` : ''}` : ''}</div>
      </div>
      <a class="btn ghost sm pf-edit" href="#/settings">${icon('settings')} Profil</a>
    </section>
    <section class="ladder">${TITLES.map((x, i) => `<div class="rung${i < ti ? ' done' : i === ti ? ' on' : ''}"><span class="rg-n mono">${i + 1}</span><b>${x.name}</b><small>ab Stufe ${x.from}</small></div>`).join('')}</section>
    <div class="career-grid">
      <section class="panel rewards">
        <h3 class="panel-h">Belohnungen</h3>
        <a class="rw daily" href="#/case/${DAILY_ID}"><span class="rw-art"></span><span class="rw-t"><b>${esc(dailyCase().name)}</b><small>${dailyReadyIn() ? `wieder in <span class="mono rw-dt">${hms(dailyReadyIn())}</span>` : 'Bereit zum Öffnen!'}</small></span><span class="btn ${dailyReadyIn() ? 'ghost' : 'primary'} sm">${dailyReadyIn() ? 'Ansehen' : 'Öffnen'}</span></a>
        <div class="rw bonus"><span class="rw-ico">${icon('gift')}</span><span class="rw-t"><b>Tagesbonus +${bonusAmount()} Coins</b><small>${bonusReadyIn() ? `wieder in <span class="mono rw-bt">${hms(bonusReadyIn())}</span>` : 'Bereit!'}</small></span><button class="btn ${bonusReadyIn() ? 'ghost' : 'primary'} sm rw-bonus" type="button" ${bonusReadyIn() ? 'disabled' : ''}>Abholen</button></div>
        ${frees.map(([id, n]) => { const c = _gc(id); return c ? `<a class="rw lvlcase" href="#/case/${id}" data-case="${id}"><span class="rw-art"></span><span class="rw-t"><b>${esc(c.name)}</b><small>${n}× gratis öffnen</small></span><span class="btn primary sm">Öffnen</span></a>` : ''; }).join('')}
      </section>
      <section class="panel missions">
        <h3 class="panel-h">Tagesmissionen <small>neu in <span class="mono ms-clock">${hms(msToMidnight())}</span></small></h3>
        ${save.missions.list.map((m) => { const d = missionDef(m.id)!; const done = m.progress >= d.target; return `<div class="ms${m.claimed ? ' claimed' : done ? ' done' : ''}"><div class="ms-t"><b>${esc(d.text)}</b><small>+${d.xp} XP · +${d.coins} Coins</small></div><div class="ms-bar"><i style="width:${Math.min(100, (m.progress / d.target) * 100)}%"></i></div><span class="mono ms-p">${d.target > 9 ? `${fmt(Math.min(m.progress, d.target)).replace(',00', '')}/${d.target}` : `${Math.min(m.progress, d.target)}/${d.target}`}</span><button class="btn ${done && !m.claimed ? 'primary' : 'ghost'} sm ms-claim" type="button" data-id="${m.id}" ${done && !m.claimed ? '' : 'disabled'}>${m.claimed ? 'Erledigt' : 'Abholen'}</button></div>`; }).join('')}
      </section>
    </div>
    <section class="panel">
      <h3 class="panel-h">Statistik</h3>
      <div class="stats">
        <div><small>Kisten geöffnet</small><b class="mono">${fmtInt(s.opened)}</b></div>
        <div><small>Ausgegeben</small><b class="mono">${fmt(s.spent)}</b></div>
        <div><small>Wert aller Drops</small><b class="mono">${fmt(s.dropValue)}</b></div>
        <div><small>Bilanz</small><b class="mono ${balanceNet >= 0 ? 'pos' : 'neg'}">${balanceNet >= 0 ? '+' : ''}${fmt(balanceNet)}</b></div>
        <div><small>★ Gezogen</small><b class="mono">${s.golds}</b></div>
        <div><small>Battles gewonnen</small><b class="mono">${s.battlesWon}/${s.battles}</b></div>
        <div><small>Upgrades geschafft</small><b class="mono">${s.upgradesWon}/${s.upgrades}</b></div>
        <div><small>Verträge</small><b class="mono">${s.contracts}</b></div>
        <div><small>Coinflips gewonnen</small><b class="mono">${s.flipsWon}/${s.flips}</b></div>
        <div><small>Bester Crash</small><b class="mono">${s.crashBest ? s.crashBest.toFixed(2).replace('.', ',') + '×' : '–'}</b></div>
      </div>
      ${s.best ? `<div class="best"><span class="eyebrow">Bester Drop</span><div class="best-row"></div></div>` : ''}
    </section>
    <section class="panel">
      <h3 class="panel-h">Vitrine <small>deine 5 wertvollsten Skins</small></h3>
      <div class="showcase">${showcase.length ? '' : '<div class="empty-state small"><b>Noch leer.</b><a href="#/cases">Kisten öffnen</a></div>'}</div>
    </section>
    <section class="panel">
      <h3 class="panel-h">Erfolge <small class="mono">${Object.keys(save.achievements).length}/${ACHIEVEMENTS.length}</small></h3>
      <div class="achs">${ACHIEVEMENTS.map((a) => `<div class="ach${save.achievements[a.id] ? ' got' : ''}"><span class="ach-i">${a.icon}</span><b>${esc(a.name)}</b><small>${esc(a.text)}</small></div>`).join('')}</div>
    </section>`;
    caseArt(root.querySelector('.rw.daily .rw-art') as HTMLElement, dailyCase(), 96, 72);
    root.querySelectorAll<HTMLElement>('.rw.lvlcase').forEach((a) => { const c = _gc(a.dataset.case!); if (c) caseArt(a.querySelector('.rw-art') as HTMLElement, c, 96, 72); });
    const sc = root.querySelector('.showcase') as HTMLElement;
    showcase.forEach((it, i) => { const c = itemCard(it, { selectable: true }); c.classList.add('pop'); c.style.animationDelay = `${i * 60}ms`; sc.appendChild(c); });
    sc.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest('.icard') as HTMLElement | null;
      const it = c && save.inv.find((x) => x.uid === c.dataset.uid);
      if (it) openItemDetail(it, [], draw);
    });
    if (s.best) {
      const row = root.querySelector('.best-row') as HTMLElement;
      const card = itemCard(s.best.item, { size: 'sm' });
      row.appendChild(card);
      row.insertAdjacentHTML('beforeend', `<div><b>${esc(names(s.best.item).full)}</b><small class="mono">${fmt(s.best.value)} Coins</small></div>`);
    }
    root.querySelector('.rw-bonus')?.addEventListener('click', () => { const n = claimBonus(); if (n) { sfx.coin(); toast('Tagesbonus abgeholt', `+${fmt(n)} Coins`, 'good', '¢'); draw(); } });
    root.querySelectorAll<HTMLButtonElement>('.ms-claim').forEach((b) => b.addEventListener('click', () => { if (claimMission(b.dataset.id!)) { toast('Mission abgeholt', missionDef(b.dataset.id!)!.text, 'good', '✓'); draw(); } }));
  };
  draw();
  const iv = setInterval(() => {
    const d = root.querySelector('.rw-dt'); if (d) d.textContent = hms(dailyReadyIn());
    const b = root.querySelector('.rw-bt'); if (b) b.textContent = hms(bonusReadyIn());
    const m = root.querySelector('.ms-clock'); if (m) m.textContent = hms(msToMidnight());
  }, 1000);
  return () => clearInterval(iv);
};
