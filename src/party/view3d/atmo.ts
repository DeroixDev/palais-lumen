// The board's atmosphere: time of day across the evening, weather, fog and haze, light, water,
// air particles, lamp cones and the colour grade. Everything is a smooth blend between three
// keys per board (afternoon, sunset, night) plus the weather on top.
//
// Time of day follows the evening: round 1 is afternoon, the middle rounds sink into sunset and
// the finale (the last three rounds) is night. Weather is pure mood (no rules change) and comes
// from the game state alone (seed, seats, round), so every friend online sees the same sky.
// The UI hook: whenever the weather changes, `window` gets a 'party:weather' CustomEvent
// (detail: WeatherEvent) and BoardView.weather holds the current one.

import * as THREE from 'three';
import type { BoardGraph } from '../boards/types';
import type { GameState } from '../engine/state';
import { clamp, lerp, rand } from '../util';
import { aoFlush, makeAir, makeLamps, makeWater, makeWeather, placeStreaks, type Air, type AirArea, type Lamps, type Water, type WaterOpts, type WeatherFx } from './fx3d';
import { fixShadow, getRenderer, type Lights } from './kit';
import { newPostParams, type PostParams } from './post';
import { quality } from './quality';
import { FOG_H, FOG_HC, FX_G, resetShared } from './shaderfx';

// ---------------------------------------------------------------- time and weather from the state
export type WeatherKind = 'clear' | 'rain' | 'fog' | 'stars' | 'snow';
export const WEATHER: Record<WeatherKind, { name: string; text: string }> = {
  clear: { name: 'Klar', text: 'Der Himmel ist klar.' },
  rain: { name: 'Regen', text: 'Es fängt an zu regnen.' },
  fog: { name: 'Nebelbank', text: 'Eine Nebelbank zieht auf.' },
  stars: { name: 'Sternschnuppen', text: 'Sternschnuppen am Himmel!' },
  snow: { name: 'Schnee', text: 'Es schneit!' },
};
export const DAYTIME = ['Nachmittag', 'Abendrot', 'Nacht'] as const;

/** What the UI gets with 'party:weather'. */
export interface WeatherEvent { kind: WeatherKind; name: string; text: string; round: number; daytime: (typeof DAYTIME)[number] }

/** 0 afternoon … 1 sunset … 2 night. Round 1 afternoon, middle rounds sunset, finale night. */
export function todFor(round: number, rounds: number): number {
  if (rounds >= 3 && round >= rounds - 2) return 2;
  if (round <= 1) return 0;
  const last = Math.max(3, rounds - 3);
  return 0.55 + 0.6 * clamp((round - 2) / Math.max(1, last - 2), 0, 1);
}
export const daytimeOf = (tod: number) => DAYTIME[tod < 0.5 ? 0 : tod < 1.6 ? 1 : 2];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
/** The weather of a round: deterministic from the state (same for every friend online). */
export function weatherFor(st: GameState): WeatherKind {
  if (st.round <= 1) return 'clear';
  const seed = (st as GameState & { seed?: number }).seed ?? 0;
  const r = hash(`${seed}|${st.seats.map((s) => s.id).join(',')}|${st.rules.board}|${st.round}`);
  const night = todFor(st.round, st.rules.rounds) >= 1.9;
  if (r < 0.035) return 'snow';
  if (r < 0.15) return 'rain';
  if (r < 0.27) return 'fog';
  if (night && r < 0.62) return 'stars';
  return 'clear';
}

// ---------------------------------------------------------------- moods
/** One time of day of a board. Colours are CSS strings; positions are the sun's offset. */
export interface Key {
  hemi: string; ground: string; hemiI: number;
  sun: string; sunI: number; sunPos: [number, number, number];
  fog: string; fogNear: number; fogFar: number;
  /** Height haze over the water/ground: colour, density 0..1, height where it ends. */
  haze: string; hazeD: number; hazeTop: number;
  /** Sky colours the water mirrors (zenith, horizon), water (shallow, deep). */
  zen: string; hor: string; shal: string; deep: string;
  /** Lamps, windows and neon (0 day … 1 night). */
  glow: number;
  bloom: number; exposure: number; contrast: number; sat: number; lift: string; gain: string; vignette: number;
}
export interface Mood {
  keys: [Key, Key, Key];
  /** Contact shade on walls near the ground (strength, height). */
  ao?: [number, number];
  /** Air particles: amounts (firefly, dust, smoke, confetti) for the current atmosphere. */
  air?: (L: AtmoLive) => [number, number, number, number];
}

/** The current atmosphere (read by the decor and the effects every frame). */
export interface AtmoLive {
  tod: number;
  /** 0..1 from sunset to night. */
  night: number;
  /** Lamps and windows on (0..1). */
  glow: number;
  /** Haze density right now (time of day + weather). */
  haze: number;
  rain: number; fog: number; snow: number; stars: number;
  /** Red alarm light (bunker vault). */
  alarm: number;
  t: number;
}

interface KeyNow {
  hemi: THREE.Color; ground: THREE.Color; sun: THREE.Color; fog: THREE.Color; haze: THREE.Color; zen: THREE.Color; hor: THREE.Color; shal: THREE.Color; deep: THREE.Color; lift: THREE.Color; gain: THREE.Color;
  sunPos: THREE.Vector3;
  hemiI: number; sunI: number; fogNear: number; fogFar: number; hazeD: number; hazeTop: number; glow: number; bloom: number; exposure: number; contrast: number; sat: number; vignette: number;
}
const COLS = ['hemi', 'ground', 'sun', 'fog', 'haze', 'zen', 'hor', 'shal', 'deep', 'lift', 'gain'] as const;
const NUMS = ['hemiI', 'sunI', 'fogNear', 'fogFar', 'hazeD', 'hazeTop', 'glow', 'bloom', 'exposure', 'contrast', 'sat', 'vignette'] as const;
const _a = new THREE.Color(), _b = new THREE.Color(), _v = new THREE.Vector3(), _v2 = new THREE.Vector2();
const RAIN_DAY = new THREE.Color('#8f98ab'), RAIN_NIGHT = new THREE.Color('#252a3c'), SNOW_DAY = new THREE.Color('#e4ebf6'), SNOW_NIGHT = new THREE.Color('#46506c'), ALARM = new THREE.Color('#ff2a1a');

export class Atmo {
  live: AtmoLive = { tod: 0, night: 0, glow: 0, haze: 0, rain: 0, fog: 0, snow: 0, stars: 0, alarm: 0, t: 0 };
  mood: Mood | null = null;
  /** Board gimmicks: force the night (Neonnacht) and the alarm light (0..1 targets). */
  forceNight = 0;
  alarm = 0;
  weather: WeatherKind = 'clear';
  weatherRound = 0;
  private todT = 0;
  private forceK = 0;
  private wT: Record<Exclude<WeatherKind, 'clear'>, number> = { rain: 0, fog: 0, stars: 0, snow: 0 };
  private now: KeyNow;
  private waterFx: Water | null = null;
  private airFx: Air | null = null;
  private wfx: WeatherFx | null = null;
  private lamps: Lamps[] = [];
  private beams: { m: THREE.Material & { opacity: number }; base: number; day: number }[] = [];
  private emis: { m: THREE.MeshToonMaterial | THREE.MeshLambertMaterial; day: number; night: number }[] = [];
  private hooks: ((L: AtmoLive) => void)[] = [];
  private postP: PostParams = newPostParams();
  private shadowDirty = false;
  private sunApplied = new THREE.Vector3(1e9, 0, 0);
  private ov = { x: 0, z: 0, half: 40 };
  private meteor = { next: 2, age: -1, life: 1, x: 0, y: 0, z: 0, dir: new THREE.Vector3() };
  private bg = new THREE.Color();

  constructor(private sc: THREE.Scene, private L: Lights, private graph: BoardGraph) {
    const c = () => new THREE.Color();
    this.now = { hemi: c(), ground: c(), sun: c(), fog: c(), haze: c(), zen: c(), hor: c(), shal: c(), deep: c(), lift: c(), gain: c(), sunPos: new THREE.Vector3(), hemiI: 1, sunI: 1, fogNear: 100, fogFar: 300, hazeD: 0, hazeTop: 2, glow: 0, bloom: 0.5, exposure: 1, contrast: 1, sat: 1, vignette: 0.25 };
    sc.onBeforeRender = () => this.push();
    sc.onAfterRender = () => resetShared();
  }

  // ---------- building (called by the board's decor) ----------
  setMood(m: Mood) { this.mood = m; }
  water(o: WaterOpts) { this.waterFx = makeWater(this.sc, o); return this.waterFx.mesh; }
  air(areas: AirArea[]) { this.airFx = makeAir(this.sc, areas); return this.airFx.mesh; }
  /** Light cones and pools under lamps (shown from dusk on, stronger in haze). */
  lampLights(pts: [number, number, number][], color: string, o: { r?: number; pool?: number; ground?: number; base?: number } = {}) { if (pts.length) this.lamps.push(makeLamps(this.sc, pts, color, o)); }
  /** A transparent light beam: opacity = base × (day … 1 at night) × more in haze. */
  beam(m: THREE.Material & { opacity: number }, base: number, day = 0.6) { this.beams.push({ m, base, day }); }
  /** Lit windows: emissive intensity from `day` to `night`. */
  emissive(m: THREE.MeshToonMaterial | THREE.MeshLambertMaterial, day: number, night: number) { this.emis.push({ m, day, night }); }
  on(fn: (L: AtmoLive) => void) { this.hooks.push(fn); }

  /** After the decor: contact shadows, weather meshes (puddles on the paths), the shadow frustum. */
  finish(ov: { x: number; z: number; w: number; d: number }) {
    this.ov = { x: ov.x, z: ov.z, half: Math.hypot(ov.w, ov.d) * 0.5 + 9 };
    aoFlush(this.sc);
    const spots: { x: number; y: number; z: number; ry: number; sx: number; sz: number }[] = [];
    const nodes = this.graph.nodes;
    for (const e of this.graph.edges) {
      if (e.flag && e.flag !== 'carpet' && e.flag !== 'walk') continue;
      const A = nodes[e.a], B = nodes[e.b], len = Math.hypot(B.x - A.x, B.z - A.z);
      if (len < 3.2 || Math.random() > 0.45) continue;
      const k = rand(0.35, 0.65);
      spots.push({ x: lerp(A.x, B.x, k), y: 0.108, z: lerp(A.z, B.z, k), ry: Math.atan2(B.x - A.x, B.z - A.z), sx: rand(0.7, 1.05), sz: rand(1.2, Math.min(2.2, len - 2.2)) });
    }
    this.wfx = makeWeather(this.sc, spots);
    if (!this.mood) return;
    this.update(0, 0, null, null);
  }

  // ---------- driving ----------
  /** Time of day target (0 afternoon, 1 sunset, 2 night). */
  setTime(tod: number, instant = false) {
    this.todT = clamp(tod, 0, 2);
    if (instant) this.live.tod = Math.max(this.todT, this.forceK * 2);
  }
  /** A board gimmick turns the night on (Neonnacht) or off again. */
  setForceNight(on: boolean, instant = false) {
    this.forceNight = on ? 1 : 0;
    if (instant) { this.forceK = this.forceNight; this.live.tod = Math.max(this.todT, this.forceK * 2); }
  }
  setWeather(k: WeatherKind, instant = false) {
    this.weather = k;
    if (instant) for (const w of Object.keys(this.wT) as (keyof typeof this.wT)[]) this.wT[w] = w === k ? 1 : 0;
  }
  /** Follows the game state (called for every event; `instant` on a sync). */
  track(st: GameState, instant = false) {
    const tod = todFor(st.round, st.rules.rounds);
    this.setTime(tod, instant);
    const w = weatherFor(st);
    if (w !== this.weather || st.round !== this.weatherRound) {
      const changed = w !== this.weather;
      this.weatherRound = st.round;
      this.setWeather(w, instant);
      if (changed || instant) {
        const detail: WeatherEvent = { kind: w, ...WEATHER[w], round: st.round, daytime: daytimeOf(tod) };
        try { window.dispatchEvent(new CustomEvent('party:weather', { detail })); } catch { /* no window (tests) */ }
      }
    }
  }
  get info(): WeatherEvent { return { kind: this.weather, ...WEATHER[this.weather], round: this.weatherRound, daytime: daytimeOf(this.todT) }; }

  /** True once after the sun moved far enough that the baked shadow map must be redrawn. */
  takeShadowDirty() { const d = this.shadowDirty; this.shadowDirty = false; return d; }

  post(): PostParams | null { return this.mood ? this.postP : null; }

  update(dt: number, t: number, cam: THREE.PerspectiveCamera | null, tgt: THREE.Vector3 | null) {
    const M = this.mood;
    if (!M) return;
    const A = this.live;
    A.t = t;
    // approach the targets (time of day ~2.5 s for a full step, weather ~3 s)
    this.forceK += clamp(this.forceNight - this.forceK, -dt * 0.6, dt * 0.6);
    const goal = Math.max(this.todT, this.forceK * 2);
    A.tod += clamp(goal - A.tod, -dt * 0.4, dt * 0.4);
    for (const w of Object.keys(this.wT) as (keyof typeof this.wT)[]) {
      const to = this.weather === w ? 1 : 0;
      this.wT[w] += clamp(to - this.wT[w], -dt * 0.33, dt * 0.33);
    }
    A.alarm += clamp(this.alarm - A.alarm, -dt * 2.5, dt * 4);
    const R = this.wT.rain, F = this.wT.fog, S = this.wT.snow;
    A.rain = R; A.fog = F; A.snow = S; A.stars = this.wT.stars;
    // blend the keys
    const tod = clamp(A.tod, 0, 2), i = tod < 1 ? 0 : 1, f = tod - i, ka = M.keys[i], kb = M.keys[i + 1], K = this.now;
    for (const c of COLS) K[c].copy(_a.set(ka[c])).lerp(_b.set(kb[c]), f);
    for (const n of NUMS) K[n] = lerp(ka[n], kb[n], f);
    K.sunPos.set(...ka.sunPos).lerp(_v.set(...kb.sunPos), f);
    A.night = clamp(tod - 1, 0, 1);
    A.glow = clamp(K.glow + R * 0.3 + F * 0.35, 0, 1);
    // weather on top
    const nk = A.night;
    if (R > 0) { _a.copy(RAIN_DAY).lerp(RAIN_NIGHT, nk); K.fog.lerp(_a, 0.5 * R); K.haze.lerp(_a, 0.4 * R); K.hor.lerp(_a, 0.5 * R); K.zen.lerp(_a, 0.5 * R); }
    if (S > 0) { _a.copy(SNOW_DAY).lerp(SNOW_NIGHT, nk); K.fog.lerp(_a, 0.45 * S); K.haze.lerp(_a, 0.45 * S); K.hemi.lerp(_a, 0.25 * S); }
    if (F > 0) { K.fog.lerp(K.haze, 0.55 * F); }
    K.hemiI *= 1 - 0.2 * R - 0.08 * F;
    K.sunI *= 1 - 0.5 * R - 0.35 * F - 0.25 * S;
    K.fogNear *= 1 - 0.35 * R - 0.62 * F - 0.3 * S;
    K.fogFar *= 1 - 0.3 * R - 0.48 * F - 0.25 * S;
    K.hazeD = Math.min(1, Math.max(K.hazeD + 0.18 * R + 0.15 * S, K.hazeD * (1 - F) + 0.8 * F));
    K.hazeTop += 3.2 * F + 0.8 * R;
    K.sat *= 1 - 0.16 * R - 0.18 * F - 0.12 * S;
    K.bloom *= 1 + 0.35 * F + 0.2 * R;
    K.contrast *= 1 - 0.06 * F;
    A.haze = K.hazeD;
    if (A.alarm > 0.001) {
      const pulse = A.alarm * (0.55 + 0.45 * Math.sin(t * 8));
      K.hemi.lerp(ALARM, 0.34 * pulse);
      K.sun.lerp(ALARM, 0.22 * pulse);
    }
    // lights
    const Lt = this.L;
    Lt.hemi.color.copy(K.hemi);
    Lt.hemi.groundColor.copy(K.ground);
    Lt.hemi.intensity = K.hemiI;
    Lt.sun.color.copy(K.sun);
    Lt.sun.intensity = K.sunI;
    // the sun moves with the time of day: the baked shadow map is redrawn in a few steps only
    if (K.sunPos.distanceTo(this.sunApplied) > 2.5 || (dt === 0 && !this.sunApplied.equals(K.sunPos))) {
      this.sunApplied.copy(K.sunPos);
      Lt.offset.copy(K.sunPos);
      fixShadow(Lt, this.ov.x, this.ov.z, this.ov.half);
      this.shadowDirty = true;
    }
    // fog (the background is the fog colour; the sky itself is never in view)
    const fog = this.sc.fog as THREE.Fog | null;
    if (fog) { fog.color.copy(K.fog); fog.near = K.fogNear; fog.far = K.fogFar; }
    if (!(this.sc.background instanceof THREE.Color)) this.sc.background = this.bg;
    this.bg.copy(K.fog);
    // post
    const P = this.postP;
    P.bloom = K.bloom; P.exposure = K.exposure; P.contrast = K.contrast; P.saturation = K.sat; P.vignette = K.vignette;
    P.lift.copy(K.lift); P.gain.copy(K.gain);
    P.tint.set(ALARM.r, ALARM.g, ALARM.b, A.alarm * (0.1 + 0.1 * Math.sin(t * 8)));
    // water
    const sunDir = _v.copy(K.sunPos).normalize();
    const W = this.waterFx;
    if (W) {
      const u = W.u;
      u.uT.value = t;
      (u.uDeep.value as THREE.Color).copy(K.deep);
      (u.uShal.value as THREE.Color).copy(K.shal);
      (u.uZen.value as THREE.Color).copy(K.zen);
      (u.uHor.value as THREE.Color).copy(K.hor);
      (u.uSun.value as THREE.Vector3).copy(sunDir);
      (u.uSunC.value as THREE.Color).copy(K.sun).multiplyScalar(0.5 + 0.2 * K.sunI);
      u.uGlit.value = (1 - 0.45 * nk) * (1 - 0.75 * R) * (1 - 0.7 * F);
      u.uNight.value = A.glow;
      u.uRain.value = R;
      if (W.streaks && cam) placeStreaks(W.streaks, cam, t, A.glow * (1 - 0.5 * F));
      (u.uFoamC.value as THREE.Color).setRGB(1, 1, 1).lerp(K.hor, 0.25 + 0.4 * nk).multiplyScalar(1 - 0.45 * nk);
    }
    // air particles (governor: they sleep with the other effects)
    const fx = quality.fx;
    const scale = cam ? getRenderer().getDrawingBufferSize(_v2).y / (2 * Math.tan((cam.fov * Math.PI) / 360)) : 600;
    if (this.airFx) {
      this.airFx.mesh.visible = fx;
      if (fx && M.air) {
        const u = this.airFx.u, [a, b, c, d] = M.air(A);
        u.uT.value = t; u.uScale.value = scale;
        (u.uAmt.value as THREE.Vector4).set(a * (1 - 0.6 * R), b * (1 - 0.8 * R), c, d * (1 - 0.5 * R));
        (u.uSmokeC.value as THREE.Color).setRGB(0.92, 0.9, 0.96).multiplyScalar(0.35 + 0.65 * (1 - nk));
      }
    }
    // weather meshes
    const X = this.wfx;
    if (X) {
      const center = tgt ?? _v.set(this.ov.x, 0, this.ov.z);
      const wide = cam ? clamp(cam.position.y * 0.55, 30, 70) : 34;
      X.rain.visible = fx && R > 0.01;
      if (X.rain.visible) { X.ru.uT.value = t; X.ru.uAmt.value = R; X.ru.uB.value = wide; (X.ru.uC.value as THREE.Vector3).copy(center); (X.ru.uCol.value as THREE.Color).setRGB(0.85, 0.9, 1).multiplyScalar(1 - 0.55 * nk); }
      X.snow.visible = fx && S > 0.01;
      if (X.snow.visible) { X.su.uT.value = t; X.su.uAmt.value = S; X.su.uB.value = wide; X.su.uScale.value = scale; (X.su.uC.value as THREE.Vector3).copy(center); }
      X.puddles.visible = R > 0.02;
      if (X.puddles.visible) { X.pu.uT.value = t; X.pu.uWet.value = R; (X.pu.uZen.value as THREE.Color).copy(K.zen).lerp(K.fog, 0.3); (X.pu.uHor.value as THREE.Color).copy(K.hor); }
      this.meteors(dt, A, center);
    }
    // lamp cones and pools, light beams, windows
    for (const Lm of this.lamps) {
      const on = A.glow > 0.02;
      Lm.cones.visible = Lm.pools.visible = on;
      Lm.cm.opacity = Lm.base * A.glow * (0.07 + 0.33 * A.haze);
      Lm.pm.opacity = Lm.base * A.glow * 0.55;
    }
    for (const b of this.beams) b.m.opacity = b.base * (b.day + (1 - b.day) * A.glow) * (0.75 + 1.1 * A.haze);
    for (const e of this.emis) e.m.emissiveIntensity = lerp(e.day, e.night, A.glow);
    for (const h of this.hooks) h(A);
  }

  /** Shooting stars across the far part of the view (weather 'stars', at night). */
  private meteors(dt: number, A: AtmoLive, c: THREE.Vector3) {
    const X = this.wfx!, m = this.meteor;
    const on = A.stars > 0.5 && A.night > 0.6;
    if (m.age >= 0) {
      m.age += dt;
      const k = m.age / m.life;
      if (k >= 1) { m.age = -1; X.star.visible = false; }
      else {
        (X.mu.uHead.value as THREE.Vector3).set(m.x, m.y, m.z).addScaledVector(m.dir, m.age * 34);
        (X.mu.uDir.value as THREE.Vector3).copy(m.dir);
        X.mu.uA.value = Math.sin(k * Math.PI) * 1.4 * A.stars;
        X.mu.uLen.value = 6 + 6 * k;
      }
      return;
    }
    if (!on) return;
    m.next -= dt;
    if (m.next > 0) return;
    m.next = rand(1.8, 4.5);
    const s = Math.random() < 0.5 ? -1 : 1;
    m.x = c.x - s * rand(12, 26); m.y = rand(9, 15); m.z = c.z - rand(22, 34);
    m.dir.set(s * rand(0.75, 1), -rand(0.18, 0.35), rand(-0.15, 0.2)).normalize();
    m.life = rand(0.7, 1.1);
    m.age = 0;
    X.star.visible = true;
  }

  /** Shared shader values (height haze, contact shade, wet ground) right before the board renders. */
  private push() {
    const K = this.now, A = this.live, M = this.mood;
    if (!M) return;
    FOG_H[0] = A.haze; FOG_H[1] = -1.4; FOG_H[2] = K.hazeTop; FOG_H[3] = 0.022;
    FOG_HC[0] = K.haze.r; FOG_HC[1] = K.haze.g; FOG_HC[2] = K.haze.b;
    FX_G[0] = M.ao?.[0] ?? 0.45; FX_G[1] = M.ao?.[1] ?? 0.9; FX_G[2] = A.rain * 0.9 + A.snow * 0.3;
  }
}
