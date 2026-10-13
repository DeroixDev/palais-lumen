/**
 * Art worker: renders weapon skins and case boxes on an OffscreenCanvas and sends them back as
 * PNG blobs, so the page never blocks on pattern generation, wear noise or supersampling.
 * Protocol: see ./async.ts.
 */
import { setDpr } from './canvas';
import { renderSkinShared, setRenderCacheSize, warmTextures } from './render';
import { renderCaseImpl } from './case';
import type { CaseDef, RenderOpts } from '../contract';

export type ArtJob =
  | { t: 'skin'; id: number; o: RenderOpts }
  | { t: 'case'; id: number; c: CaseDef; w: number; h: number }
  | { t: 'warm'; id: number; skins: string[] };
export type ArtMsg = { t: 'init'; dpr: number } | ArtJob;
export type ArtReply = { id: number; blob?: Blob; err?: string };

setRenderCacheSize(24);
// (typed by hand: pulling in lib.webworker would retype the page's globals too)
const scope = self as unknown as { onmessage: ((e: MessageEvent<ArtMsg>) => void) | null; postMessage(m: ArtReply): void };

async function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return (c as unknown as OffscreenCanvas).convertToBlob({ type: 'image/png' });
}

scope.onmessage = async (e: MessageEvent<ArtMsg>) => {
  const m = e.data;
  if (m.t === 'init') { setDpr(m.dpr); return; }
  try {
    if (m.t === 'skin') scope.postMessage({ id: m.id, blob: await toBlob(renderSkinShared(m.o)) } satisfies ArtReply);
    else if (m.t === 'case') scope.postMessage({ id: m.id, blob: await toBlob(renderCaseImpl(m.c, m.w, m.h)) } satisfies ArtReply);
    else { warmTextures(m.skins); scope.postMessage({ id: m.id } satisfies ArtReply); }
  } catch (err) {
    scope.postMessage({ id: m.id, err: String(err) } satisfies ArtReply);
  }
};
