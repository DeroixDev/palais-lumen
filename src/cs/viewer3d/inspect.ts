import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildModel, MODEL_WIDTH, type BuiltModel, type PartMaterials } from './build';
import { addStatTrak } from './stattrak';
import { deriveWearMask, plainMaterials, skinMaterial } from './materials';
import type { ArtSource, InspectHandle, InspectItem, InspectOptions } from './source';

const DEFAULT_YAW = -0.32;
const DEFAULT_PITCH = 0.1;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2.6;
const IDLE_MS = 3000;
const IDLE_SPEED = 0.22; // rad/s
const INTRO_MS = 1400;

/** Mounts the inspect view into `host`. All state is local; dispose() frees everything. */
export function openInspectWith(host: HTMLElement, first: InspectItem, art: ArtSource, opts: InspectOptions = {}): InspectHandle {
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const texSize = opts.textureSize ?? 1024;

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;outline:none;';
  if ((opts.background ?? 'studio') === 'studio') {
    canvas.style.background = 'radial-gradient(ellipse 75% 65% at 50% 42%, #3a3f4a 0%, #22252c 45%, #121318 100%)';
  }
  const hostPos = getComputedStyle(host).position;
  const restorePos = hostPos === 'static' ? host.style.position : null;
  if (hostPos === 'static') host.style.position = 'relative';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  });
  pmrem.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

  const key = new THREE.DirectionalLight(0xfff3e6, 2.1);
  key.position.set(-3, 4, 5);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 2.6);
  rim.position.set(4, 2.5, -5);
  const rim2 = new THREE.DirectionalLight(0xffe2c4, 1.2);
  rim2.position.set(-5, 1, -3);
  const fill = new THREE.HemisphereLight(0xdfe8ff, 0x1a1a1f, 0.35);
  scene.add(key, rim, rim2, fill);

  // Pivot: yaw/pitch from the user, intro offsets on top.
  const stage = new THREE.Group();
  const pivot = new THREE.Group();
  stage.add(pivot);
  scene.add(stage);

  // Contact shadow: blurred radial gradient on a plane under the model.
  const shadowTex = radialShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.75 });
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  scene.add(shadow);

  const plain = plainMaterials();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  // ---------- item state ----------
  let weaponId = '';
  let built: BuiltModel | null = null;
  let skinMat: THREE.MeshPhysicalMaterial | null = null;
  let skinTextures: THREE.Texture[] = [];
  let fitDist = 8;

  function makeSkin(it: InspectItem): THREE.MeshPhysicalMaterial {
    for (const t of skinTextures) t.dispose();
    skinMat?.dispose();
    const tc = art.renderSkinTexture(it.skin, it.float, it.seed, texSize);
    const map = new THREE.CanvasTexture(tc);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    let wear: HTMLCanvasElement | null = null;
    try {
      if (art.renderWearMask) wear = art.renderWearMask(it.skin, it.float, it.seed, Math.min(512, texSize));
      else if (it.float > 0.07) wear = deriveWearMask(tc, art.renderSkinTexture(it.skin, 0, it.seed, Math.min(512, texSize)));
    } catch {
      wear = null;
    }
    const { mat, textures } = skinMaterial(map, wear, it.float);
    skinTextures = [map, ...textures];
    skinMat = mat;
    return mat;
  }

  let removeStatTrak = () => {};

  function freeModel() {
    removeStatTrak();
    removeStatTrak = () => {};
    if (!built) return;
    pivot.remove(built.group);
    for (const g of built.geometries) g.dispose();
    built = null;
  }

  function load(it: InspectItem) {
    const w = art.weaponOf(it.skin);
    const wid = w?.id ?? '';
    const sm = makeSkin(it);
    if (built && wid === weaponId) {
      built.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.userData.skin) m.material = sm;
      });
    } else {
      freeModel();
      weaponId = wid;
      const model = art.weaponModel(wid);
      const mats: PartMaterials = { ...plain.mats, skin: sm };
      built = buildModel(model, w?.kind ?? 'rifle', mats);
      built.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material === sm) m.userData.skin = true;
      });
      pivot.add(built.group);
    }
    removeStatTrak();
    removeStatTrak = it.statTrak && w?.kind !== 'gloves' && built ? addStatTrak(built.group) : () => {};
    layoutShadow();
    fit();
    dirty = true;
  }

  // ---------- view state ----------
  let yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH, zoom = 1, zoomTarget = 1;
  let vYaw = 0, vPitch = 0;
  let resetting = false;
  let lastInput = performance.now();
  let idleBlend = 0;
  let introStart = reduced ? -1 : 0; // 0 = start on the next frame, -1 = off
  let dirty = true;
  let curIy = 0, curIp = 0;

  function fit() {
    if (!built) return;
    const w = Math.max(built.size.x, MODEL_WIDTH * 0.6);
    const h = built.size.y;
    const aspect = camera.aspect || 1;
    const vfov = (camera.fov * Math.PI) / 180;
    const distH = (h * 1.5) / 2 / Math.tan(vfov / 2);
    const distW = (w * 1.22) / 2 / (Math.tan(vfov / 2) * aspect);
    fitDist = Math.max(distH, distW);
  }

  function layoutShadow() {
    if (!built) return;
    shadow.position.y = -built.size.y * 0.5 - 0.22;
  }

  function resize() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // ---------- input ----------
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let lastMove = 0;

  function touchInput() {
    lastInput = performance.now();
    idleBlend = 0;
    resetting = false;
    if (introStart >= 0) { yaw += curIy; pitch += curIp; introStart = -1; } // grab mid-swing without a jump
  }

  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinchDist = pinchSpan();
    vYaw = vPitch = 0;
    canvas.style.cursor = 'grabbing';
    touchInput();
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    touchInput();
    if (pointers.size >= 2) {
      const d = pinchSpan();
      if (pinchDist > 0) zoomTarget = clamp(zoomTarget * (d / pinchDist), ZOOM_MIN, ZOOM_MAX);
      pinchDist = d;
      return;
    }
    const now = performance.now();
    const dt = Math.max(8, now - lastMove) / 1000;
    lastMove = now;
    const sx = 0.0085, sy = 0.006;
    yaw += dx * sx;
    pitch = clamp(pitch + dy * sy, -1.0, 1.0);
    // Velocity for inertia (smoothed).
    vYaw = vYaw * 0.4 + ((dx * sx) / dt) * 0.6;
    vPitch = vPitch * 0.4 + ((dy * sy) / dt) * 0.6;
    dirty = true;
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) canvas.style.cursor = 'grab';
    if (performance.now() - lastMove > 90) vYaw = vPitch = 0; // held still before release
    vYaw = clamp(vYaw, -9, 9);
    vPitch = clamp(vPitch, -5, 5);
    touchInput();
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 0.05 : 0.0015;
    zoomTarget = clamp(zoomTarget * Math.exp(-e.deltaY * k), ZOOM_MIN, ZOOM_MAX);
    touchInput();
  };
  const onDbl = (e: MouseEvent) => {
    e.preventDefault();
    lastInput = performance.now();
    idleBlend = 0;
    vYaw = vPitch = 0;
    zoomTarget = 1;
    // Unwind yaw to the nearest turn so the reset takes the short way.
    const turn = Math.PI * 2;
    yaw = DEFAULT_YAW + (((yaw - DEFAULT_YAW) % turn) + turn * 1.5) % turn - turn / 2;
    resetting = true;
  };
  const onCtx = (e: Event) => e.preventDefault();
  function pinchSpan() {
    const ps = [...pointers.values()];
    return ps.length < 2 ? 0 : Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl);
  canvas.addEventListener('contextmenu', onCtx);

  const onContextLost = (e: Event) => e.preventDefault();
  canvas.addEventListener('webglcontextlost', onContextLost);

  // ---------- loop ----------
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = false;

    // Inertia.
    if (pointers.size === 0 && (Math.abs(vYaw) > 0.001 || Math.abs(vPitch) > 0.001)) {
      yaw += vYaw * dt;
      pitch = clamp(pitch + vPitch * dt, -1.0, 1.0);
      const decay = Math.exp(-dt * 3.2);
      vYaw *= decay; vPitch *= decay;
      if (Math.abs(vYaw) < 0.002) vYaw = 0;
      if (Math.abs(vPitch) < 0.002) vPitch = 0;
      moving = true;
    }

    // Double-click reset.
    if (resetting) {
      const k = 1 - Math.exp(-dt * 7);
      yaw += (DEFAULT_YAW - yaw) * k;
      pitch += (DEFAULT_PITCH - pitch) * k;
      if (Math.abs(yaw - DEFAULT_YAW) < 1e-3 && Math.abs(pitch - DEFAULT_PITCH) < 1e-3) resetting = false;
      moving = true;
    }

    // Idle turn after 3 s, eased in; pitch drifts back towards the default.
    if (!reduced && pointers.size === 0 && introStart < 0 && now - lastInput > IDLE_MS && vYaw === 0) {
      idleBlend = Math.min(1, idleBlend + dt * 0.6);
      yaw += IDLE_SPEED * idleBlend * idleBlend * dt;
      pitch += (DEFAULT_PITCH - pitch) * (1 - Math.exp(-dt * 0.8));
      moving = true;
    }

    // Zoom easing.
    if (Math.abs(zoomTarget - zoom) > 1e-4) {
      zoom += (zoomTarget - zoom) * (1 - Math.exp(-dt * 10));
      moving = true;
    }

    // Intro swing: the weapon comes up from below-right, turned, and settles with a little overshoot.
    let iy = 0, ip = 0, ir = 0, ipos = 0, isc = 1;
    if (introStart === 0) introStart = now;
    if (introStart > 0) {
      const t = Math.min(1, (now - introStart) / INTRO_MS);
      const e = 1 - t;
      const swing = Math.exp(-3.6 * t) * Math.cos(t * 4.4); // damped
      iy = 1.25 * swing;
      ip = -0.25 * e * e * e;
      ir = 0.35 * swing;
      ipos = -0.9 * e * e * e;
      isc = 0.82 + 0.18 * (1 - e * e * e);
      if (t >= 1) { introStart = -1; lastInput = now; }
      curIy = iy; curIp = ip;
      moving = true;
    }

    if (!moving && !dirty) return;
    dirty = false;

    pivot.rotation.set(pitch + ip, yaw + iy, ir, 'XYZ');
    stage.position.y = ipos;
    stage.scale.setScalar(isc);
    camera.position.set(0, 0.15, fitDist / zoom);
    camera.lookAt(0, -0.05, 0);

    // Shadow footprint follows the model's turn.
    if (built) {
      const cy = Math.abs(Math.cos(yaw + iy)), sy = Math.abs(Math.sin(yaw + iy));
      const w = built.size.x * isc, d = Math.max(built.size.z, 0.3) * isc;
      shadow.scale.set(w * cy + d * sy + 0.8, w * sy + d * cy + 0.6, 1);
      shadow.position.y = (-built.size.y * 0.5 - 0.22) * isc + ipos;
      shadowMat.opacity = 0.7 * (1 - Math.min(1, Math.abs(ipos) * 0.8));
    }
    renderer.render(scene, camera);
  }

  load(first);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    setItem(it: InspectItem) {
      if (disposed) return;
      load(it);
      // New item: back to the default view and swing it in again, like a fresh inspect.
      yaw = DEFAULT_YAW; pitch = DEFAULT_PITCH; zoomTarget = 1; vYaw = vPitch = 0; resetting = false;
      idleBlend = 0; lastInput = performance.now();
      if (!reduced) introStart = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('contextmenu', onCtx);
      freeModel();
      for (const t of skinTextures) t.dispose();
      skinMat?.dispose();
      for (const m of Object.values(plain.mats)) m.dispose();
      for (const t of plain.textures) t.dispose();
      shadowGeo.dispose(); shadowMat.dispose(); shadowTex.dispose();
      envRT.dispose();
      scene.environment = null;
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.remove();
      if (restorePos !== null) host.style.position = restorePos;
    },
  };
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function radialShadowTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
