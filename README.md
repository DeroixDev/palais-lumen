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
  games/       ein Ordner pro Spiel (slots, roulette) + index.ts zum Registrieren
  rooms/       eine Datei pro Raum (lobby, vip) + index.ts zum Registrieren
  world/       Raumdarstellung, Spielfigur, Trophäen-Grafiken
  ui/          HUD und Dialoge (HTML), Abendabrechnung und Vitrine (Pixi)
```

### Ein neues Spiel hinzufügen

1. Ordner `src/games/<name>/` anlegen und eine `GameDefinition` exportieren (siehe `src/core/registry.ts`):
   - `drawStation()` zeichnet Automat oder Tisch für die Raumansicht
   - `create(ctx)` baut die Nahansicht. Über `ctx.state.placeBet()` und `ctx.state.payout()` läuft das Spielgeld, über `ctx.particles`, `ctx.shake()` und `ctx.sfx` die Effekte
   - `houseEdge` ist der Hausvorteil, der dem Spieler offen angezeigt wird
2. In `src/games/index.ts` registrieren.
3. In einem Raum unter `stations` platzieren, zum Beispiel `{ game: 'blackjack', x: 400, y: 300, label: 'Blackjack' }`.

### Einen neuen Raum hinzufügen

1. `src/rooms/lobby.ts` kopieren, `id`, Größe, Farben (`theme`), Stationen und Deko anpassen. Mit `unlockCost` muss der Raum erst mit Spielgeld freigeschaltet werden.
2. In `src/rooms/index.ts` registrieren.
3. In einem bestehenden Raum eine Tür eintragen: `doors: [{ to: '<id>', x: 900, label: 'Name' }]`.

## Spielstände

Der ganze Spielstand ist ein JSON-Objekt (`SaveData` in `src/core/state.ts`). Es gibt einen Autosave und drei manuelle Plätze. Vor jedem Überschreiben wird ein Backup angelegt, und ein beschädigter Stand fällt auf das Backup zurück. Über „Spielstand übertragen“ lässt sich ein Stand als Text-Code kopieren und woanders einfügen.

Im Coop soll der Host diesen Spielstand besitzen. Die Mitspieler werden unter `players` im Stand des Hosts geführt. Für die Windows-Version wird nur der Speicherort in `src/core/save.ts` gegen echte Dateien getauscht.
