# Casino Nachtfalter

Ein Casino-Spiel im Browser mit Spielgeld. Man kann nichts einzahlen und nichts kaufen. Man läuft in einer Top-down-Ansicht durch das Casino und setzt sich an Automaten und Tische. Jeder Abend endet mit einer Abrechnung, Medaillen und Trophäen für die Vitrine.

## Starten

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm run build    # fertige Dateien in dist/
```

## Steuerung

- Laufen: WASD, Pfeiltasten oder irgendwo hintippen
- Spielen: an eine Station gehen und `E` drücken (oder tippen)
- Im Spiel: `Leertaste` dreht, `Esc` geht zurück in den Raum

## Aufbau

```
src/
  core/        Spielzustand, Speichern, Effekte, Sound, Tweens, UI-Bausteine, Registry
  games/       ein Ordner pro Spiel (slots, roulette, plinko, crash) + index.ts zum Registrieren
  rooms/       eine Datei pro Etage (f1 bis f5) + index.ts zum Registrieren
  world/       Raumdarstellung, Möbel (decor.ts), Böden und Wände (styles.ts), Spielfigur, Gäste
  ui/          HUD und Dialoge (HTML), Tagesabrechnung, Vitrine und Aufzug (Pixi)
```

### Ein neues Spiel hinzufügen

1. Ordner `src/games/<name>/` anlegen und eine `GameDefinition` exportieren (siehe `src/core/registry.ts`):
   - `drawStation()` zeichnet Automat oder Tisch für die Raumansicht
   - `create(ctx)` baut die Nahansicht. Über `ctx.state.placeBet()` und `ctx.state.payout()` läuft das Spielgeld, über `ctx.particles`, `ctx.shake()` und `ctx.sfx` die Effekte
   - `houseEdge` ist der Hausvorteil, der dem Spieler offen angezeigt wird
2. In `src/games/index.ts` registrieren.
3. In einem Raum unter `stations` platzieren, zum Beispiel `{ game: 'blackjack', x: 400, y: 300, label: 'Blackjack' }`.

### Eine Etage ändern oder hinzufügen

1. Eine Datei in `src/rooms/` kopieren, `id`, `floor`, Farben und Stil (`theme.style`), Stationen und Möbel (`decor`) anpassen. Alle Möbelarten stehen in `DecorKind` in `src/core/registry.ts` und werden in `src/world/decor.ts` gezeichnet.
2. In `src/rooms/index.ts` registrieren. Der Aufzug listet alle Etagen nach `floor`.
3. Welche Etage an welchem Tag offen ist, regelt `floorForDay()` in `src/core/state.ts` (Etage 1 bis 4 je 3 Tage, Etage 5 ist der Boss-Tag 13).

## Spielstände

Der ganze Spielstand ist ein JSON-Objekt (`SaveData` in `src/core/state.ts`). Es gibt einen Autosave und drei manuelle Plätze. Vor jedem Überschreiben wird ein Backup angelegt, und ein beschädigter Stand fällt auf das Backup zurück. Über „Spielstand übertragen“ lässt sich ein Stand als Text-Code kopieren und woanders einfügen.

Im Coop soll der Host diesen Spielstand besitzen. Die Mitspieler werden unter `players` im Stand des Hosts geführt. Für die Windows-Version wird nur der Speicherort in `src/core/save.ts` gegen echte Dateien getauscht.
