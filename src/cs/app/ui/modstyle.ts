// Styles of the house menu, injected the first time it opens (so nothing of it ships in the page CSS).

export const MOD_CSS = `
.mm-modal .modal { width: min(1080px, 100%); height: min(780px, calc(100dvh - 32px)); padding: 0; display: flex; overflow: hidden; background: linear-gradient(180deg, #161c25, #0f1318); }
.mm-modal .modal-body { flex: 1; min-width: 0; min-height: 0; display: flex; }
.mm-modal .modal-x { top: 10px; right: 10px; }
.mm { flex: 1; min-width: 0; display: grid; grid-template-columns: 200px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; }
.mm-top { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding: 10px 56px 10px 16px; border-bottom: 1px solid var(--line); background: rgba(11,14,18,.6); }
.mm-brand { font: 700 1rem/1 var(--display); letter-spacing: .06em; text-transform: uppercase; color: var(--hot); display: grid; gap: 3px; flex: none; min-width: 150px; }
.mm-brand small { font-size: .68rem; color: var(--dim); letter-spacing: 0; text-transform: none; font-weight: 500; }
.mm-search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; background: var(--bg-2); border: 1px solid var(--line-2); border-radius: 8px; padding: 0 10px; transition: border-color .15s, box-shadow .15s; }
.mm-search:focus-within { border-color: var(--hot); box-shadow: 0 0 0 3px rgba(255,138,31,.16); }
.mm-search span { color: var(--dim); font-size: 1.1rem; }
.mm-search input { flex: 1; min-width: 0; border: 0; background: none; padding: 8px 0; outline: none; color: var(--ink); }
.mm-rail { display: flex; flex-direction: column; gap: 2px; padding: 10px 8px; border-right: 1px solid var(--line); overflow-y: auto; background: rgba(11,14,18,.35); }
.mm-rail button { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 0; border-radius: 8px; background: none; color: var(--ink-2); font: 600 .92rem/1.1 var(--display); text-align: left; letter-spacing: .02em; }
.mm-rail button i { width: 22px; height: 22px; flex: none; display: grid; place-items: center; border-radius: 6px; background: var(--panel-2); font-style: normal; font-size: .8rem; color: var(--dim); }
.mm-rail button span { flex: 1; min-width: 0; }
.mm-rail button b { font-size: .7rem; color: #1f0f02; background: var(--hot); border-radius: 10px; padding: 1px 6px; }
.mm-rail button b:empty { display: none; }
.mm-rail button:hover { background: var(--panel-2); color: var(--ink); }
.mm-rail button.on { background: rgba(255,138,31,.12); color: var(--hot-2); box-shadow: inset 2px 0 0 var(--hot); }
.mm-rail button.on i { background: var(--hot); color: #1f0f02; }
.mm-main { overflow-y: auto; overscroll-behavior: contain; padding: 4px 16px 24px; min-width: 0; }
.mm-pane[hidden], .mm-group[hidden], .mm-row[hidden] { display: none !important; }
.mm-ph { display: none; font-size: .78rem; text-transform: uppercase; letter-spacing: .1em; color: var(--hot); margin: 16px 0 0; }
.mm.searching .mm-ph { display: block; }
.mm-group { margin-top: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); overflow: hidden; }
.mm-group > h3 { font-size: .74rem; text-transform: uppercase; letter-spacing: .1em; color: var(--dim); padding: 9px 12px; background: var(--bg-2); }
.mm-note { margin: 0; padding: 8px 12px 0; color: var(--dim); font-size: .84rem; }
.mm-group > .mm-note { padding: 8px 12px; border-top: 1px solid var(--line); }
.mm-row { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(0, 1.55fr) 118px; gap: 6px 12px; align-items: center; padding: 8px 12px; border-top: 1px solid var(--line); position: relative; }
.mm-row.changed { background: linear-gradient(90deg, rgba(255,138,31,.08), transparent 40%); }
.mm-row.changed::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 0 3px 3px 0; background: var(--hot); }
.mm-row.act { grid-template-columns: minmax(140px, 1fr) minmax(0, 1.55fr); }
.mm-block { grid-template-columns: 1fr; }
.mm-lab { display: grid; gap: 1px; min-width: 0; }
.mm-lab span { font-weight: 600; color: var(--ink); line-height: 1.2; }
.mm-lab small { color: var(--dim); font-size: .8rem; line-height: 1.25; }
.mm-ctl { min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mm-def { display: flex; align-items: center; justify-content: flex-end; gap: 6px; white-space: nowrap; }
.mm-def small { color: var(--dim); font-size: .74rem; max-width: 86px; overflow: hidden; text-overflow: ellipsis; }
.mm-def b { color: var(--ink-2); font-family: var(--mono); font-weight: 500; }
.mm-rst { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--panel-2); color: var(--hot-2); font-size: .95rem; line-height: 1; padding: 0; }
.mm-rst:disabled { opacity: .25; color: var(--dim); cursor: default; }
.mm-rst:not(:disabled):hover { border-color: var(--hot); }
.mm-sl { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; }
.mm-sl input[type=range] { flex: 1; min-width: 60px; accent-color: var(--hot); height: 22px; }
.mm-num, .mm-in { background: var(--bg-2); border: 1px solid var(--line-2); border-radius: 6px; padding: 5px 7px; color: var(--ink); font: 500 .85rem var(--mono); width: 92px; min-width: 0; }
.mm-in.wide { width: 100%; max-width: 280px; font-family: var(--body); font-size: .95rem; }
.mm-num:focus, .mm-in:focus { outline: none; border-color: var(--hot); }
.mm-out { min-width: 64px; text-align: right; color: var(--hot-2); font-size: .82rem; }
.mm-nf { display: inline-flex; align-items: center; gap: 6px; color: var(--dim); font-size: .85rem; }
.mm-nf .mm-in { width: 150px; }
.mm-sel { padding: 6px 10px; max-width: 100%; }
.mm-sw { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; color: var(--ink-2); font-size: .85rem; }
.mm-sw input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.mm-sw i { width: 38px; height: 22px; border-radius: 12px; background: var(--panel-3); border: 1px solid var(--line-2); position: relative; transition: background .15s; flex: none; }
.mm-sw i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--ink-2); transition: transform .15s var(--ease), background .15s; }
.mm-sw input:checked + i { background: rgba(255,138,31,.35); border-color: var(--hot-lo); }
.mm-sw input:checked + i::after { transform: translateX(16px); background: var(--hot); }
.mm-sw input:focus-visible + i { outline: 2px solid var(--hot); outline-offset: 2px; }
.mm-sw input:disabled + i { opacity: .4; }
.mm-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.mm-btns .btn { padding: 7px 10px; font-size: .74rem; }
.mm-btns .btn.armed { background: var(--bad); color: #fff; border-color: var(--bad); }
.mm-info { color: var(--ink-2); font-size: .8rem; flex: 1 1 100%; overflow-wrap: anywhere; }
.mm-info:empty { display: none; }
.mm-inl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.mm-body { min-width: 0; display: grid; gap: 8px; }
.mm-pick { display: grid; gap: 8px; min-width: 0; }
.mm-pick-q { display: flex; gap: 8px; flex-wrap: wrap; }
.mm-pick-q .inp { flex: 1 1 180px; padding: 7px 10px; }
.mm-pick-q .sel { flex: 0 1 160px; padding: 7px 10px; }
.mm-pick-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; max-height: 300px; overflow-y: auto; padding-right: 2px; }
.mm-sk { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg-2); text-align: left; min-width: 0; box-shadow: inset 3px 0 0 var(--rc); }
.mm-sk:hover { border-color: var(--line-2); background: var(--panel-2); }
.mm-sk.on { border-color: var(--hot); background: rgba(255,138,31,.1); }
.mm-sk canvas, .mm-sk .art { flex: none; }
.mm-sk span { display: grid; min-width: 0; }
.mm-sk b { font-size: .82rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mm-sk small { font-size: .72rem; color: var(--dim); }
.mm-more { justify-self: start; }
.mm-give { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px; }
.mm-give-ed { display: grid; gap: 10px; align-content: start; }
.mm-prev { display: grid; justify-items: center; gap: 4px; padding: 8px; border-radius: 10px; background: radial-gradient(circle at 50% 40%, var(--panel-3), var(--bg-2)); border: 1px solid var(--line); }
.mm-prev b { font-size: .88rem; text-align: center; }
.mm-fields { display: grid; gap: 8px; }
.mm-f { display: grid; grid-template-columns: 82px minmax(0, 1fr); align-items: center; gap: 8px; }
.mm-f > span { color: var(--dim); font-size: .82rem; }
.mm-inv { display: grid; gap: 4px; max-height: 460px; overflow-y: auto; }
.mm-it { border: 1px solid var(--line); border-radius: 8px; background: var(--bg-2); box-shadow: inset 3px 0 0 var(--rc); }
.mm-it.open { border-color: var(--line-2); }
.mm-it-h { display: flex; align-items: center; gap: 10px; width: 100%; padding: 4px 10px; border: 0; background: none; text-align: left; min-width: 0; }
.mm-it-c { flex: none; display: flex; }
.mm-it-n { flex: 1; min-width: 0; display: grid; }
.mm-it-n b { font-size: .86rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mm-it-n em { font-style: normal; color: #cf6a32; font-size: .72rem; }
.mm-it-n small { color: var(--dim); font-size: .72rem; }
.mm-it-v { color: var(--ink-2); font-size: .82rem; flex: none; }
.mm-it-ed { display: grid; gap: 8px; padding: 8px 10px 10px; border-top: 1px solid var(--line); }
.mm-ms { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 10px; padding: 6px 0; border-top: 1px dashed var(--line); }
.mm-ms:first-child { border-top: 0; }
.mm-ms small { color: var(--dim); }
.mm-one { display: grid; margin: 8px -12px -8px; }
.mm-case { justify-self: start; max-width: 100%; padding: 7px 10px; }
.mm-bl { display: grid; margin: 0 -12px -8px; }
.mm-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.mm-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 9px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--line-2); font-size: .82rem; }
.mm-chip button { border: 0; background: none; color: var(--dim); width: 20px; height: 20px; border-radius: 50%; padding: 0; font-size: .7rem; }
.mm-chip button:hover { color: var(--bad); background: rgba(255,90,90,.12); }
.mm-json { width: 100%; min-height: 260px; font: 500 .76rem/1.4 var(--mono); resize: vertical; white-space: pre; }
.mm-json.small { min-height: 140px; }
.mm-json.code { min-height: 80px; white-space: pre-wrap; word-break: break-all; }
.mm-foot { grid-column: 1 / -1; min-height: 0; padding: 0 16px; color: var(--good); font-size: .86rem; border-top: 1px solid transparent; transition: padding .15s; overflow: hidden; height: 0; }
.mm-foot.on { height: auto; padding: 7px 16px; border-top-color: var(--line); }
@media (max-width: 720px) {
  .mm-modal { padding: 0; }
  .mm-modal .modal { height: 100dvh; max-height: 100dvh; border-radius: 0; border: 0; }
  .mm { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto; }
  .mm-top { padding: 8px 52px 8px 12px; gap: 10px; }
  .mm-brand { min-width: 0; font-size: .86rem; }
  .mm-rail { flex-direction: row; overflow-x: auto; overflow-y: hidden; border-right: 0; border-bottom: 1px solid var(--line); padding: 6px 8px; scrollbar-width: none; }
  .mm-rail::-webkit-scrollbar { display: none; }
  .mm-rail button { flex: none; padding: 7px 10px; }
  .mm-rail button i { display: none; }
  .mm-rail button.on { box-shadow: inset 0 -2px 0 var(--hot); }
  .mm-main { padding: 0 10px 20px; }
  .mm-row, .mm-row.act { grid-template-columns: minmax(0, 1fr) auto; padding: 8px 10px; }
  .mm-ctl { grid-column: 1 / -1; grid-row: 2; }
  .mm-block { grid-template-columns: minmax(0, 1fr); }
  .mm-give { grid-template-columns: minmax(0, 1fr); }
  .mm-pick-list { grid-template-columns: minmax(0, 1fr); max-height: 240px; }
  .mm-one, .mm-bl { margin: 8px -10px -8px; }
  .mm-out { min-width: 52px; }
  .mm-num { width: 78px; }
}
@media (max-width: 420px) {
  .mm-brand small { display: none; }
}
.mm-fb-btn { width: 100%; display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 10px; text-align: left; color: var(--ink); cursor: pointer;
  border: 1px solid rgba(255,138,31,.55); background: radial-gradient(120% 140% at 0% 50%, rgba(136,71,255,.35), transparent 60%), linear-gradient(135deg, rgba(255,138,31,.22), rgba(75,105,255,.16)); box-shadow: 0 8px 26px -12px rgba(255,138,31,.8), inset 0 1px 0 rgba(255,255,255,.08); transition: filter .15s, transform .12s; }
.mm-fb-btn:hover { filter: brightness(1.15); }
.mm-fb-btn:active { transform: scale(.99); }
.mm-fb-ic { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border-radius: 50%; font-size: 1.4rem; color: #fff; background: radial-gradient(circle at 40% 35%, #c9b8ff, #6a4bff 55%, #241470); box-shadow: 0 0 18px rgba(136,110,255,.8), 0 0 0 2px rgba(255,177,94,.7); }
.mm-fb-btn b { display: block; font: 700 1.02rem/1.15 var(--display); letter-spacing: .05em; text-transform: uppercase; color: var(--hot-2); }
.mm-fb-btn small { display: block; color: var(--ink-2); font-size: .84rem; margin-top: 2px; }
`;
