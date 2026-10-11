// Save version 9 turned the moth album into the Lampenbuch. Every old entry has exactly one
// successor on the same page, with the same rarity and the same place where it shows up, so a
// save keeps everything it had caught: the Goldene Wachsmotte became the Goldener
// Kerzenleuchter. This file has no imports, so save.ts can use it without pulling in the
// game registry.

/** Old album ID (save version 8 and older) -> Lampenbuch ID. */
export const ALBUM_RENAME: Readonly<Record<string, string>> = {
  // Page 1
  kerzenmotte: 'talglicht',
  samtfluegel: 'bienenwachs',
  dochtfalter: 'oellaempchen',
  rotrock: 'kandelaber',
  hinterzimmer: 'argand',
  wachsgold: 'kerzenleuchter',
  // Page 2
  tauperle: 'gluehwuermchen',
  mondblatt: 'papierlaterne',
  nachtkerze: 'gartenfackel',
  radschlaeger: 'radlaterne',
  mondspiegel: 'mondglas',
  brautschleier: 'lunalampion',
  // Page 3
  zahnradeule: 'gaslaterne',
  messing: 'petroleum',
  pendel: 'gluehstrumpf',
  teichlaeufer: 'davy',
  drachenturm: 'bogenlampe',
  unruh: 'unruhlampe',
  // Page 4
  neonbaer: 'edison',
  glanzmotte: 'neonroehre',
  bass: 'spiegelkugel',
  goldkette: 'schwarzlicht',
  kartenzaehler: 'stroboskop',
  lichtorgel: 'lichtorgel',
  // Page 5
  thronwache: 'fresnel',
  kronentraeger: 'signallampe',
  uhrmacher: 'kristall',
  schatten: 'mondsplitter',
  purpurmantel: 'lampenstange',
  prinzessin: 'mondlampe',
  // Page 6
  groschen: 'groschenlampe',
  kerzenschein: 'sturmlaterne',
  schwarmfuehrerin: 'lichterfest',
  galaschleppe: 'galaluester',
  nullpunkt: 'nulllicht',
  sternenstaub: 'sternschnuppe',
};

/**
 * Album counts with old IDs renamed. Safe to run on any save: new IDs pass through, and if a
 * save somehow holds both an old and its new ID, the counts are added up.
 */
export function renameAlbum(album: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(album)) {
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    const to = ALBUM_RENAME[id] ?? id;
    out[to] = (out[to] ?? 0) + n;
  }
  return out;
}
