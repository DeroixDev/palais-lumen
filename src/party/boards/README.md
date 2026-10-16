# Spielbretter für Unser Party Spiel

Ein Brett ist **ein Ordner** mit einem Modul, das ein `BoardDef` exportiert (siehe
`types.ts`). Vorlage: `neonstadt/` (`index.ts` = Daten und Regeln, `view.ts` = 3D-Deko).

## In drei Schritten

1. `src/party/boards/meinbrett/index.ts` (+ `view.ts`) anlegen.
2. In `index.ts` hier in `BOARDS` eintragen. Die Lobby zeigt es dann mit `name` und `blurb`.
3. `npx tsc --noEmit`, dann einen Abend mit `?fast&auto&test` durchlaufen lassen.

## Felder und Wege

Wege werden als **Segmente** beschrieben (`graph.ts`): Stützpunkte `pts` in Brettkoordinaten
(x nach rechts, z nach vorn), daraus wird eine glatte Kurve und alle `spacing` Einheiten ein
Feld. `pat` legt die Feldtypen der Reihe nach fest, `from`/`to` verbinden Segmente an
benannten Knoten (Weichen, Start). Ein Segment mit `route: 'Name'` bekommt an der Weiche einen
Pfeil mit Namen und Länge.

Feldtypen (`SpaceType`): `P` Plus, `M` Minus, `E` Ereignis, `L` Glücksrad, `S` Laden,
`D` Duell, `B` Kumpel, `T` Bande, `R` Rivale, `X` Brett-Feld (eigene Regel, Name in `xName`),
`G` Start. Die Engine kennt alle; nur `X` ruft dein `onSpace` auf.

## Regeln des Bretts

- `initState()`: eigener Zustand (reines JSON, landet im Spielstand und geht an Freunde).
- `blocked(bs, a, b)`: Grund, warum der Schritt a → b gerade gesperrt ist (oder `null`).
  Gesperrte Wege zeigt die Weiche ausgegraut; der Brückenschlüssel öffnet sie einmal.
- `roundStart(api, round)`: das Haupt-Gimmick (z. B. Zugbrücke kippt).
- `onSpace(api, p)`: das Brett-Feld `X`.
- `fest(api)`: Brettfest alle 5 Runden.
- `events`: zusätzliche Ereignisse (`luck: true` fällt bei Profi-Regeln weg).
- `info(...)`: Zeilen für die Seitenleiste, `where(node)`: „am Hafenweg“ usw.
- `plusFactor(bs)`: Plus-Felder doppelt (z. B. Neonnacht).

Alles, was sich ändert, läuft über `api` (`api.emit({ k: 'gimmick', name, data })`,
`api.toast`, `api.addCoins`, `api.moveStar`). So sehen es Gastgeber und Freunde gleich.

## Deko (`decor(kit)`)

Bekommt `kit.scene`, den Graphen, das Licht und `kit.clearOfPath(x, z, rN, rE)` (frei von
Feldern und Wegen?). Gibt `{ update(dt, t), apply(bs), play(name, data), overview }` zurück:
`apply` stellt den Zustand ohne Animation her (Laden, Wiedereinstieg), `play` spielt ein
Gimmick-Ereignis ab (awaited), `overview` ist der Ausschnitt für die Übersicht.

Für 60 fps: statische Deko mit `Batch` zu wenigen Meshes zusammenfassen, Gebäude/Bäume als
`InstancedMesh`, Materialien aus `kit.ts` (`toon()` ist gecacht), keine Allokationen in
`update`. Nur eigene Grafik, alle Texte deutsch.
