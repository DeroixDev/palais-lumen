# Minispiele für Unser Party Spiel

Ein Minispiel ist **eine Datei** in diesem Ordner, die ein `MinigameDef` exportiert
(siehe `types.ts`). Den Rest macht das Framework (`flow.ts`): Intro-Karte mit Demo dahinter,
„Üben“, „Bereit“ pro Person, Countdown, Spiel, „Schluss!“, Ergebnis mit Münzen, zurück zum
Brett. Solo und online gleich, ohne eine Zeile Netzwerk-Code im Minispiel.

## In drei Schritten

1. `src/party/minigames/meinspiel.ts` anlegen (Vorlage: `kurbelkarren.ts` ist das kürzeste).
2. In `index.ts` importieren und in `MINIGAMES` eintragen.
3. `npx tsc --noEmit`, dann im Spiel unter **Minispiele üben** ausprobieren.

Die Auswahl im Abend passiert automatisch nach `type` und Spielerzahl: Nach jeder Runde
entscheiden die Feldfarben (Plus/Minus) über 1 gegen 3, 2 gegen 2 oder Jeder gegen jeden;
Duell-Felder und Kumpel-Duelle nehmen ein `duell`. Profi-Regeln nehmen nur `pro: true`.

## Das Interface

```ts
const meinspiel: MinigameDef<S> = {
  id: 'meinspiel', name: 'Mein Spiel', type: 'ffa',   // ffa | 1v3 | 2v2 | duell | koop | muenz
  coin: false,            // Münz-Minispiel: jeder behält, was er sammelt
  seconds: 30,            // Länge; Üben dauert höchstens 20 s
  players: [2, 4],        // unterstützte Spielerzahl
  pro: true,              // auch bei Profi-Regeln (kein reines Glück)
  online: 'gut',
  card: { sub, rules(setup), controls(setup, me), touch(setup, me), meter?(setup, me) },
  init(ctx): S,                              // Startzustand
  step(s, dt, inputs, ctx): void,            // ein Simulationsschritt (1/60 s)
  bot(s, i, ctx): MgInput,                   // Bot-Steuerung für Spieler i
  over?(s, ctx): boolean,                    // vorzeitig fertig?
  result(s, ctx): MgResult,                  // Zeilen: Sieg, Münzen, Notiz, Punkte
  score(s, i): { v: string; out?: boolean }, // Anzeige oben (Chip pro Spieler)
  view(setup): MgView<S>,                    // 3D-Szene: scene, cam, frame(s, dt, t, me), fx(e, me), celebrate(win)
};
```

### Regeln, damit es online automatisch klappt

- **Zustand `S` ist reines JSON** (Zahlen, Strings, Booleans, Arrays, Objekte). Er geht
  ~20-mal pro Sekunde an die Freunde. Felder mit `_` vorne (z. B. `_ai`) bleiben beim
  Gastgeber und werden nicht gesendet: Bot-Gedächtnis und Zufallszustände dort ablegen.
- **Nur `step` verändert den Zustand**, und nur mit `ctx.rng()` als Zufall (gleicher Seed,
  gleiches Spiel). `view.frame` liest nur.
- Zahlen werden bei Freunden zwischen zwei Snapshots **interpoliert**. Arrays von Objekten mit
  einem Feld `id` werden über die `id` zugeordnet (gut für Münzen, Funken, Hindernisse, die
  kommen und gehen). Ohne `id` nach Index, aber nur bei gleicher Länge.
- **Einmalige Effekte** (Sound, „+3“, Treffer) meldet `step` mit `ctx.fx({ k: 'hit', p: i })`.
  `view.fx(e, me)` spielt sie ab, beim Gastgeber sofort und bei Freunden mit dem nächsten
  Snapshot.
- Eingaben: `x`/`y` (Stick, WASD/Pfeile), `a`/`b` (gehalten), `aP`/`bP`/`lP`/`rP` (gerade
  gedrückt). Tastatur: Leertaste/↑/W = A, Shift/X = B, ←/A = links, →/D = rechts. Touch-Knöpfe
  legt `card.touch()` fest (`joy: true` zeigt den Daumen-Stick).
- Team-Nummern stehen in `setup.players[i].team`: bei 1 gegen 3 ist der Einzelne Team 0 und
  steht immer an Index 0, bei 2 gegen 2 die Teams 0 und 1, bei FFA hat jeder sein eigenes.
- `setup.mode` ist `demo` (hinter der Karte, alle Bots), `practice` oder `play`. Was nur im
  echten Spiel zählt, an `mode === 'play'` hängen.

### Münzen

`WIN_COINS` (10) für Sieger ist der Standard. Bei `coin: true` kommt dazu, was gesammelt
wurde. Die Finale-Regel „Doppelte Minispiele“ und die Banden-Teilung rechnet die Engine.

### Gestaltung

Eigene Figuren aus `view3d/figures.ts` (`mgFigures`), Licht/Arena/Wolken aus `common.ts`,
Toon-Materialien und gemeinsame Geometrien aus `view3d/kit.ts`. Statisches mit `Batch`
zusammenfassen (ein Draw-Call), viele gleiche Dinge als `InstancedMesh`, im `frame` nichts
neu anlegen. Alle Texte deutsch, keine fremden Marken oder Figuren.
