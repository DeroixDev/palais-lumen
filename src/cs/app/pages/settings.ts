// Profil & Einstellungen: name, avatar, sound, quick mode, save code export/import, reset.

import { avatarSVG } from '../lib/bots';
import { commit, exportCode, importCode, resetSave, save } from '../lib/state';
import { sfx } from '../lib/sound';
import { esc } from '../lib/util';
import { icon } from '../ui/icons';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import { pageHead, type Page } from './page';

export const settingsPage: Page = (root) => {
  root.innerHTML = `
  ${pageHead('Profil & Einstellungen')}
  <div class="set-grid">
    <section class="panel">
      <h3 class="panel-h">Profil</h3>
      <label class="field"><span>Name</span><input class="inp s-name" maxlength="18" value="${esc(save.name)}" autocomplete="nickname"></label>
      <span class="field-l">Avatar</span>
      <div class="av-pick">${Array.from({ length: 12 }, (_, i) => `<button type="button" class="av-b${save.avatar === i ? ' on' : ''}" data-i="${i}" aria-label="Avatar ${i + 1}">${avatarSVG(i)}</button>`).join('')}</div>
    </section>
    <section class="panel">
      <h3 class="panel-h">Ton & Ablauf</h3>
      <label class="switch"><input type="checkbox" class="s-sound" ${save.settings.sound ? 'checked' : ''}><span></span>Ton</label>
      <label class="field"><span>Lautstärke</span><input type="range" class="s-vol" min="0" max="1" step="0.05" value="${save.settings.volume}"></label>
      <label class="switch"><input type="checkbox" class="s-fast" ${save.settings.fast ? 'checked' : ''}><span></span>Schnell öffnen (kurze Animationen)</label>
    </section>
    <section class="panel">
      <h3 class="panel-h">Spielstand</h3>
      <p class="muted">Dein Spielstand liegt in diesem Browser. Mit dem Code nimmst du ihn auf ein anderes Gerät mit.</p>
      <div class="row-btns"><button class="btn ghost s-exp" type="button">Code erzeugen</button><button class="btn ghost s-copy" type="button" hidden>Kopieren</button></div>
      <textarea class="inp code s-code" rows="3" readonly hidden aria-label="Spielstand-Code"></textarea>
      <label class="field"><span>Code einfügen</span><textarea class="inp code s-imp" rows="3" placeholder="CSG1…"></textarea></label>
      <div class="row-btns"><button class="btn primary s-load" type="button">Laden</button><button class="btn danger s-reset" type="button">Neu anfangen</button></div>
    </section>
    <section class="panel">
      <h3 class="panel-h">Mehr Spiele</h3>
      <a class="game-link" href="./casino.html">${icon('palace')}<span><b>Unser Casino Spiel</b><small>Das Palais Lumen, unser Casino-Hotel. Gleicher Link, anderes Spiel.</small></span></a>
      <a class="game-link all" href="./index.html">${icon('games')}<span><b>Alle Spiele</b><small>Zurück zum Launcher.</small></span></a>
    </section>
  </div>`;
  const nameIn = root.querySelector('.s-name') as HTMLInputElement;
  nameIn.addEventListener('change', () => { save.name = nameIn.value.trim().slice(0, 18) || 'Du'; commit(); toast('Name gespeichert', save.name, 'good'); });
  root.querySelector('.av-pick')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.av-b') as HTMLElement | null;
    if (!b) return;
    save.avatar = Number(b.dataset.i);
    root.querySelectorAll('.av-b').forEach((x) => x.classList.toggle('on', x === b));
    sfx.click();
    commit();
  });
  root.querySelector('.s-sound')!.addEventListener('change', (e) => { save.settings.sound = (e.target as HTMLInputElement).checked; commit(); sfx.click(); });
  root.querySelector('.s-vol')!.addEventListener('input', (e) => { save.settings.volume = Number((e.target as HTMLInputElement).value); commit(); sfx.tick(); });
  root.querySelector('.s-fast')!.addEventListener('change', (e) => { save.settings.fast = (e.target as HTMLInputElement).checked; commit(); });
  const code = root.querySelector('.s-code') as HTMLTextAreaElement;
  const copy = root.querySelector('.s-copy') as HTMLButtonElement;
  root.querySelector('.s-exp')!.addEventListener('click', () => { code.value = exportCode(); code.hidden = false; copy.hidden = false; code.select(); });
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code.value); toast('Kopiert', 'Der Code liegt in der Zwischenablage.', 'good'); } catch { code.select(); } });
  root.querySelector('.s-load')!.addEventListener('click', () => {
    const v = (root.querySelector('.s-imp') as HTMLTextAreaElement).value;
    if (importCode(v)) { toast('Spielstand geladen', '', 'good'); location.hash = '#/career'; }
    else { sfx.error(); toast('Code ungültig', 'Bitte den ganzen Code einfügen.', 'bad'); }
  });
  root.querySelector('.s-reset')!.addEventListener('click', () => {
    const m = openModal('<div class="confirm"><h2>Neu anfangen?</h2><p>Coins, Skins und Karriere werden gelöscht. Erzeuge vorher einen Code, wenn du den Stand behalten willst.</p><div class="actions"><button class="btn danger yes" type="button">Alles löschen</button><button class="btn ghost no" type="button">Abbrechen</button></div></div>', { label: 'Neu anfangen' });
    m.body.querySelector('.yes')!.addEventListener('click', () => { resetSave(); m.close(); toast('Neuer Spielstand', '50 Coins zum Start', 'good'); location.hash = '#/cases'; });
    m.body.querySelector('.no')!.addEventListener('click', () => m.close());
  });
};
