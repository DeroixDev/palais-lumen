// Dev only (devpages/render.html, driven by tools/sounds/render.mjs): renders a mood or an
// effect offline through the real mixing graph and hands back a 16-bit WAV as base64.
import { SfxClass } from '../core/audio';
import { MOOD_DEFS } from '../audio/moods';
import type { InstId } from '../audio/voices';

interface Spec {
  mood?: string;
  sfx?: string;
  args?: unknown[];
  seconds: number;
  intensity?: number;
  record?: number;
  proximity?: number;
  /** Extra instruments to load before rendering. */
  need?: InstId[];
}

function wav(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  data.setUint32(4, 36 + len * ch * 2, true);
  w(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < ch; c++) {
      data.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 32767, true);
      o += 2;
    }
  const bytes = new Uint8Array(data.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

(window as unknown as { render: (s: Spec) => Promise<string> }).render = async (spec: Spec) => {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * spec.seconds), sr);
  const s = new SfxClass();
  s.setMuted(false);
  s.attach(ctx);
  const need: InstId[] = [...(spec.need ?? [])];
  if (spec.mood) need.push(...(MOOD_DEFS[spec.mood === 'street' ? 'foyer' : spec.mood]?.instruments ?? []));
  await s.v!.need(...need);
  await s.v!.need(...((s as unknown as { sfxInstruments?: InstId[] }).sfxInstruments ?? []));
  if (spec.mood) s.renderSchedule(spec.mood, spec.seconds, spec);
  else if (spec.sfx) (s as unknown as Record<string, (...a: unknown[]) => void>)[spec.sfx](...(spec.args ?? []));
  const out = await ctx.startRendering();
  return wav(out);
};
document.getElementById('s')!.textContent = 'ready';
