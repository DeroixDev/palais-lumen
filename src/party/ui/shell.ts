// The page skeleton: title screen, lobby, the game screen (full-screen stage, the HUD is built by
// ./hud) and the overlays
// (minigame card, results, podium, settings). Built once at start; the modules fill the parts.

import { backSVG, gearSVG, titleHTML } from './avatars';

const muteSVG = '<svg viewBox="0 0 24 24"><path class="spk" d="M4 9h4l5-4v14l-5-4H4z"/><path class="wav" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M17 9l5 6M22 9l-5 6"/></svg>';

const tbar = (info: string) => `
  <header class="tbar">
    <a class="back" href="./index.html" aria-label="Alle Spiele">${backSVG}<span>Alle Spiele</span></a>
    <div class="tmid">${titleHTML}${info}</div>
    <div class="tright">
      <button class="ib gear" type="button" data-act="settings" aria-label="Einstellungen">${gearSVG}</button>
      <button class="ib mute" type="button" data-act="mute" aria-label="Ton aus" aria-pressed="false">${muteSVG}</button>
    </div>
  </header>`;

export function buildShell(root: HTMLElement) {
  root.innerHTML = `
<div class="screen mscr" id="scrTitle">
  ${tbar('')}
  <main class="t-main">
    <section class="t-hero">
      <h2 class="hero-title"><span class="h1">Unser</span><span class="h2">Party</span><span class="h3">Spiel</span></h2>
      <p class="t-tag">Brettspiel-Abend mit Würfeln, Sternen und Minispielen. Allein gegen Bots oder online mit bis zu drei Freunden.</p>
    </section>
    <div class="cast3d" id="cast" aria-hidden="true"></div>
    <nav class="t-menu" id="menu" aria-label="Hauptmenü"></nav>
    <p class="menu-note" id="menuNote"></p>
  </main>
</div>

<div class="screen mscr" id="scrLobby" hidden>
  ${tbar('<div class="tinfo"><b id="lobbyKind">Neuer Abend</b><span>Vorbereitung</span></div>')}
  <main class="lb" id="lobby"></main>
</div>

<div class="app" id="app">
  <main class="main">
    <section class="stage" id="stage" aria-label="Spielbrett">
      <canvas id="gl" aria-hidden="true"></canvas>
      <div class="labels" id="labels"></div>
      <div class="bhud">
        <div class="hud" id="hud"></div>
        <div class="banner" aria-hidden="true"><div class="banner-band" id="bannerBand"></div></div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
        <div class="wheel" id="wheel" hidden><small>Glücksrad</small><span id="wheelTxt"></span></div>
        <div class="choice" id="choice" hidden></div>
        <div class="ask" id="ask" role="dialog" aria-labelledby="askT" hidden><b id="askT"></b><span id="askS"></span><div id="askB"></div></div>
        <div class="watch" id="watch" hidden></div>
      </div>
      <div class="mghud" id="mgHud">
        <div class="mg-top"><div class="mg-name" id="mgName">Minispiel</div><div class="timer" id="mgTimer">30</div></div>
        <div class="mg-scores" id="mgScores"></div>
        <div class="turbo" id="turboBar"><span id="turboLbl">Turbo</span><i id="turboFill"></i></div>
        <div class="touch" id="touch">
          <div class="joy" id="joy"><i id="joyKnob"></i></div>
          <div class="tbtns" id="tbtns"></div>
        </div>
        <div class="stamp" id="stamp">Übung · zählt nicht <button type="button" id="endPractice">Übung beenden</button></div>
      </div>
      <div class="count" id="count" aria-live="assertive"></div>
      <div class="net-note" id="netNote" hidden></div>
      <div class="nogl" id="nogl" hidden><p>Dein Browser kann hier kein WebGL anzeigen. Unser Party Spiel braucht 3D.</p></div>
    </section>
  </main>
</div>

<div class="ov" id="ovIntro" role="dialog" aria-modal="true" aria-labelledby="mgTitle">
  <div class="ov-in">
    <article class="mg" id="mgCard">
      <div class="mg-head" id="mgHead"></div>
      <h2 class="mg-title" id="mgTitle"><span>Minispiel</span></h2>
      <p class="mg-sub" id="mgSub"></p>
      <div class="teams" id="mgTeams"></div>
      <ul class="mg-rules" id="mgRules"></ul>
      <div class="ctrls" id="mgCtrls"></div>
      <p class="mg-spec" id="mgSpec" hidden></p>
      <ul class="ready" id="ready"></ul>
      <div class="mg-actions">
        <div class="meta"><button class="btn ghost" type="button" id="btnLeave" hidden>Zurück</button></div>
        <button class="btn ghost" type="button" id="btnPractice">Üben</button>
        <button class="btn go" type="button" id="btnReady">Bereit!</button>
      </div>
    </article>
  </div>
</div>

<div class="ov" id="ovRes" role="dialog" aria-modal="true" aria-labelledby="resTitle">
  <div class="ov-in">
    <section class="res">
      <span class="res-k" id="resK">Ergebnis</span>
      <h2 class="res-title" id="resTitle"><span>Sieg!</span></h2>
      <ol class="res-list" id="resList"></ol>
      <div class="res-actions"><button class="btn go" type="button" id="resNext">Weiter</button></div>
    </section>
  </div>
</div>

<div class="ov" id="ovPod" role="dialog" aria-modal="true" aria-labelledby="podTitle">
  <section class="pod">
    <span class="pod-k" id="podK">Ende des Abends</span>
    <h2 class="pod-title" id="podTitle"><span>Siegerehrung</span></h2>
    <div class="bonus" id="bonus"></div>
    <div class="pod-space"></div>
    <div class="fourth" id="fourth"></div>
    <div class="statbox" id="statbox" hidden></div>
    <div class="pod-actions">
      <button class="mbtn ghost" type="button" id="podStats">Statistik</button>
      <button class="mbtn ghost" type="button" id="podTitleBtn" data-back>Zum Titel</button>
      <button class="mbtn go" type="button" id="podAgain">Nochmal!</button>
    </div>
  </section>
</div>

<div class="ov" id="ovSet" role="dialog" aria-modal="true" aria-labelledby="setTitle">
  <div class="ov-in"><section class="setcard" id="setCard"></section></div>
</div>`;
}
