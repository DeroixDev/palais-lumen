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

## Kleinkram und Leben (für alle Bretter)

Die Brettansicht baut nach `decor` für jedes Brett: leicht erhöhte Felder mit Glanzkante und
animiertem Symbol, einen Stand an jedem Laden, einen Ring an jedem Duell, Markierungen auf
normalen Wegen, Laub, Konfetti und Pfützen am Wegrand, Tauben (fliegen auf, wenn eine Figur
vorbeihüpft), Münzen am Boden (hüpfen hoch) und Zuschauer am Stern (jubeln beim Sternkauf).

- `leben.lifeConfig(kit.scene, { … })` stellt das pro Brett ein (z. B. `pigeons: 0` drinnen,
  eigene Laub- und Konfettifarben), `leben.setSpotFilter(kit.scene, (x, z) => …)` sagt, wo
  Tauben, Münzen und Zuschauer stehen dürfen (nicht in Gebäuden, nicht im Wasser).
- Helfer zum Selbstbauen: `leben.ts` (`wobbly` Büsche, `lanterns` Laternen, die beim
  Vorbeigehen angehen, `convoy` Fahrzeuge mit Tunnel, `pigeons`, `groundCoins`, `GEO.shopper`
  Passanten mit Tüten, `nearOnly` für Kleinkram, der in der Übersicht verschwindet) und
  `feinkram.ts` (`pavingDeco` Fugen/Moos/Flecken für `groundTex`, `woodTex`, `roofTex`,
  `facadeTex` Fenster mit Rahmen, Atlas-Schilder/Plakate/Graffiti als ein Mesh, `bake` statt
  `instanced` für statischen Kleinkram in einem Batch, Lichterketten, Wäscheleinen).
- Alles Bewegte schläft mit der Effekt-Stufe der Qualität (`quality.fx`), wirft keinen
  Schatten und legt pro Frame nichts an.
