# Level report and a picture of a rendered WAV (tools/sounds/render.mjs):
# peak / RMS / loudest 3 s window, clipping, energy per band, and a PNG with a spectrogram
# (log frequency, 40 Hz..16 kHz) over a level curve, so a mix can be checked by eye.
import sys, wave, numpy as np
from PIL import Image

p = sys.argv[1]
w = wave.open(p)
sr = w.getframerate()
a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32).reshape(-1, w.getnchannels()) / 32768
m = a.mean(1)
db = lambda x: 20 * np.log10(max(x, 1e-9))
peak = np.abs(a).max()
rms = np.sqrt(np.mean(m * m))
win = int(sr * 3)
st = [np.sqrt(np.mean(m[i : i + win] ** 2)) for i in range(0, max(1, len(m) - win), sr // 2)] or [rms]
clip = int((np.abs(a) > 0.995).sum())
spec = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2
f = np.fft.rfftfreq(len(m), 1 / sr)
bands = [(20, 120, 'sub/bass'), (120, 500, 'low-mid'), (500, 2000, 'mid'), (2000, 6000, 'presence'), (6000, 16000, 'air')]
tot = spec.sum() + 1e-12
bs = '  '.join(f'{n} {100 * spec[(f >= lo) & (f < hi)].sum() / tot:.0f}%' for lo, hi, n in bands)
side = np.sqrt(np.mean(((a[:, 0] - a[:, 1]) / 2) ** 2)) if a.shape[1] > 1 else 0
print(f'{p}\n  length {len(m) / sr:.1f}s  peak {db(peak):.1f} dBFS  RMS {db(rms):.1f} dBFS  loudest-3s {db(max(st)):.1f}  quietest-3s {db(min(st)):.1f}  clipped samples {clip}  width(side/mid) {side / (rms + 1e-9):.2f}')
print(f'  bands: {bs}')

# Spectrogram picture.
W, H = 900, 260
hop = max(1, len(m) // W)
n = 2048
fr = np.fft.rfftfreq(n, 1 / sr)
edges = np.geomspace(40, 16000, H + 1)
img = np.zeros((H, W))
for x in range(W):
    s = m[x * hop : x * hop + n]
    if len(s) < n:
        s = np.pad(s, (0, n - len(s)))
    mag = np.abs(np.fft.rfft(s * np.hanning(n))) ** 2
    for y in range(H):
        sel = (fr >= edges[y]) & (fr < edges[y + 1])
        img[H - 1 - y, x] = mag[sel].mean() if sel.any() else (mag[np.argmin(np.abs(fr - edges[y]))])
img = 10 * np.log10(img + 1e-12)
img = np.clip((img - (img.max() - 80)) / 80, 0, 1)
rgb = np.stack([img ** 0.7 * 255, img ** 1.6 * 200, (1 - img) * img * 4 * 120], -1).astype(np.uint8)
lv = np.zeros((80, W, 3), np.uint8)
for x in range(W):
    s = m[x * hop : (x + 1) * hop]
    v = db(np.sqrt(np.mean(s * s)) if len(s) else 0)
    h = int(np.clip((v + 60) / 60, 0, 1) * 79)
    lv[79 - h :, x] = (90, 200, 120)
lv[79 - int((-20 + 60) / 60 * 79), :, :] = (200, 60, 60)  # -20 dBFS guide
Image.fromarray(np.concatenate([rgb, lv], 0)).save(p[:-4] + '.png')
print(f'  picture {p[:-4]}.png (top: spectrogram 40 Hz-16 kHz log, bottom: level, red line = -20 dBFS)')
