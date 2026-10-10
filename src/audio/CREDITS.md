# Recorded instruments: sources and licences

The instrument samples in `src/audio/inst/` are cut, looped and compressed from these free
libraries by `tools/sounds/fetch.py` and `build.py`. The in-game credits (Hilfe → Musik & Klang)
repeat the attributions the CC-BY licences ask for.

| Instruments | Source | Licence |
|---|---|---|
| vibes, vibesbow, sax, harp, harpsi, organ, organq, glock, marimba, xylo, tubbells, chimes, handbells, wine, kalimba, tglock, timpani, timproll, gong, suscym, clash, hihat, snare, kick, tom, triangle, sleigh, marktree, belltree, ratchet, woodblock, claves, shaker, guiro, tamb, cajon, slapstick, vibraslap, whistle, cowbell, anvil, brakedrum, claps | Versilian Community Sample Library (Versilian Studios, Sam Gossner), via smpldsnds/sgossner-vcsl | CC0 1.0 |
| piano, pianof | Splendid Grand Piano (Akai samples), via smpldsnds/sfzinstruments-splendid-grand-piano | Public domain |
| bass | D. Smolken, Rubner double bass pizzicato, via smpldsnds/sfzinstruments-dsmolken-double-bass | CC0 1.0 |
| wurli | Greg Sullivan, Wurlitzer EP200, via smpldsnds/sfzinstruments-greg-sullivan-e-pianos | CC BY 3.0 |
| mutetp, choir, strings, pizz, celesta, musicbox | FluidR3 GM soundfont (Frank Wen), rendered by gleitz/midi-js-soundfonts | CC BY 3.0 |
| flute, cello, trumpet, trombone, horn, tuba | nbrosowsky/tonejs-instruments (npm tonejs-instrument-*-mp3) | CC BY 3.0 |
| lm2, tr808 | smpldsnds/drum-machines (LinnDrum LM-2, Roland TR-808) | Public domain |

All music in the game is composed in code (`src/audio/moods`, `src/core/clubMusic.ts`); the
effects are designed in `src/audio/sfx`.
