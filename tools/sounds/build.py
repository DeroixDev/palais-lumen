# Turns the raw recordings (snd/raw, see fetch.py) into small mono MP3s, base64 in one TS
# module per instrument under casino/src/audio/inst/, loaded on demand by src/audio/sampler.ts.
# Pitched instruments: onset trimmed, cut to `max` seconds with a soft fade, RMS-matched across
# the range. Sustaining ones get a crossfaded loop so notes can be held as long as needed.
# Kits (unpitched): named articulations with velocity layers and round robins, peak-normalised
# per instrument so the layers keep their natural dynamics.
# Usage: python3 build.py [id ...]
import os, sys, re, io, json, base64, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
# Raw downloads live outside the repo (large); override with SND_RAW.
RAW = os.environ.get('SND_RAW', '/home/claude/snd/raw')
OUT = os.path.join(ROOT, '..', '..', 'src', 'audio', 'inst')
SR = 44100


def load(p):
    w = wave.open(p)
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    a = a.reshape(-1, w.getnchannels())
    return a.mean(1) if a.shape[1] > 1 else a[:, 0]


def onset(x, rel=0.03):
    pk = np.abs(x).max()
    i = int(np.argmax(np.abs(x) > pk * rel))
    return max(0, i - int(0.002 * SR))


def fade_out(x, frac=0.25):
    n = len(x)
    f = int(n * frac)
    if f > 8:
        x[-f:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f))
    return x


def natural_end(x, floor_db=-60):
    """Cuts the silent tail: where a 20 ms envelope stays under floor_db relative to the peak."""
    env = np.sqrt(np.convolve(x * x, np.ones(882) / 882, 'same'))
    thr = env.max() * 10 ** (floor_db / 20)
    idx = np.where(env > thr)[0]
    return x[: idx[-1] + 1] if len(idx) else x


def make_loop(x, start, end, xf):
    """Crossfades the end of the loop into the material before its start, so it repeats seamlessly."""
    s, e, L = int(start * SR), int(end * SR), int(xf * SR)
    L = min(L, s, e - s - 1)
    fade = np.linspace(0, 1, L) ** 0.5
    y = x[:e].copy()
    y[e - L : e] = x[e - L : e] * fade[::-1] + x[s - L : s] * fade
    return y


def encode(x, sr, kbps):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype(np.int16).tobytes()
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0', '-ar', str(sr), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', '-f', 'mp3', 'pipe:1'], input=pcm, capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr.decode())
    return p.stdout


def rms(x):
    return float(np.sqrt(np.mean(x * x)) + 1e-9)


# ---- pitched instruments ----
# keys: None = all, or a set of midi notes; every: keep every n-th file; max: seconds;
# loop: (start, length, crossfade) seconds after the onset; gain: dB after matching.
P = {
    'piano': dict(max=4.2, kbps=80, fade=0.35),
    'pianof': dict(max=3.0, kbps=80),
    'bass': dict(max=2.6, sr=32000, kbps=64),
    'vibes': dict(max=4.0, kbps=72, fade=0.4),
    'vibesbow': dict(max=4.0, kbps=64, loop=(1.2, 2.0, 0.4), onset=0.2),
    'sax': dict(every=2, max=3.0, kbps=72, loop=(0.7, 1.4, 0.25)),
    'wurli': dict(max=3.0, kbps=72),
    'mutetp': dict(max=3.0, kbps=64, loop=(0.6, 1.4, 0.3)),
    'harp': dict(every=2, max=3.2, kbps=72, fade=0.4),
    'harpsi': dict(max=2.6, kbps=72),
    'organ': dict(every=2, max=3.0, sr=32000, kbps=64, loop=(0.8, 1.6, 0.4)),
    'organq': dict(every=2, max=3.0, sr=32000, kbps=64, loop=(0.8, 1.6, 0.4)),
    'choir': dict(max=3.0, kbps=64, loop=(0.8, 1.6, 0.45)),
    'strings': dict(keys=set(range(37, 89, 3)), max=3.0, kbps=64, loop=(0.8, 1.6, 0.45)),
    'pizz': dict(every=2, max=1.2, kbps=64),
    'celesta': dict(every=2, max=2.2, kbps=72),
    'musicbox': dict(every=2, max=2.2, kbps=72),
    'flute': dict(max=3.0, kbps=64, loop=(0.6, 1.4, 0.3)),
    'cello': dict(keys=set(range(36, 72, 3)), max=3.0, sr=32000, kbps=64, loop=(0.7, 1.5, 0.35)),
    'trumpet': dict(max=2.6, kbps=72, loop=(0.6, 1.2, 0.25)),
    'trombone': dict(every=2, max=2.6, sr=32000, kbps=64, loop=(0.6, 1.2, 0.25)),
    'horn': dict(max=2.6, sr=32000, kbps=64, loop=(0.6, 1.2, 0.25)),
    'tuba': dict(max=2.6, sr=32000, kbps=56, loop=(0.6, 1.2, 0.25)),
    'glock': dict(max=2.6, kbps=80),
    'marimba': dict(max=1.6, kbps=64),
    'xylo': dict(max=1.0, kbps=64),
    'tubbells': dict(every=2, max=5.0, kbps=72, fade=0.5),
    'chimes': dict(every=2, max=4.0, kbps=72, fade=0.5),
    'wine': dict(max=4.0, kbps=64, loop=(1.0, 2.2, 0.5)),
    'kalimba': dict(every=2, max=1.6, kbps=64),
    'tglock': dict(every=2, max=2.6, kbps=72),
    'timpani': dict(files=r'_v99_|_v127_', max=3.0, sr=32000, kbps=64, vel=True),
    'timproll': dict(files=r'_v83_', max=3.4, sr=32000, kbps=64, loop=(0.8, 2.0, 0.6)),
}

# ---- kits: id -> {articulation: [raw file indices]} ----
K = {
    'hihat': {'c': [2, 3, 4, 5, 6, 7, 8, 9], 'p': [0, 1], 'o': [12, 13], 'l': [10, 11]},
    'snare': {'s': [8, 9, 10, 11, 14, 15, 16, 17], 'ns': [0, 1, 4, 5], 'stick': [25, 26], 'tap': [27, 28], 'roll': [23]},
    'suscym': {'ride': [15, 16, 17], 'hit': [8, 9, 10, 11], 'bell': [12, 13, 14], 'swell': [5], 'roll': [19], 'scrape': [21]},
    'kick': {'k': [0, 2, 4, 6]},
    'tom': {'hit': [6, 8, 10], 'rim': [2, 4]},
    'clash': {'crash': [2, 4, 6], 'short': [8]},
    'gong': {'g': [1, 3], 'scrape': [6]},
    'triangle': {'hit': [0, 1, 2, 3], 'mute': [6, 7], 'roll': [8]},
    'woodblock': {'w': [0, 3, 4, 6], 'hi': [8]},
    'claves': {'c': [0, 1, 2]},
    'shaker': {'roll': [0], 'slap': [2, 3], 'down': [4, 5], 'up': [6, 7]},
    'sleigh': {'hit': [0, 1], 'shake': [2]},
    'ratchet': {'crank': [0, 1], 'fast': [2], 'slow': [3]},
    'whistle': {'double': [0], 'fall': [1], 'med': [2], 'short': [3], 'sus': [4]},
    'cowbell': {'hit': [0, 1, 2], 'mute': [3, 4]},
    'anvil': {'a': [0, 1, 2], 'b': [3, 4, 5]},
    'brakedrum': {'hammer': [1, 2, 3]},
    'claps': {'clap': [0, 1, 2, 3], 'solo': [6, 7, 8, 9]},
    'handbells': {'b': [0, 1, 2]},
    'marktree': {'asc': [0], 'desc': [1], 'random': [3]},
    'belltree': {'s': [0, 2]},
    'tamb': {'hit': [0, 1], 'shake': [5, 6], 'roll': [3]},
    'cajon': {'bass': [1, 3], 'slap': [8, 11], 'tone': [14, 16]},
    'slapstick': {'s': [0, 1, 2]},
    'guiro': {'fast': [0], 'hit': [1, 2], 'slow': [4]},
    'vibraslap': {'v': [0]},
    'lm2': None,
    'tr808': None,
    'mfb': None,
}
KMAX = {'gong': 6.0, 'suscym': 3.5, 'clash': 3.5, 'marktree': 3.5, 'belltree': 3.0, 'triangle': 2.5, 'sleigh': 2.0, 'ratchet': 1.6,
        'whistle': 2.4, 'tamb': 1.6, 'shaker': 1.6, 'handbells': 2.6, 'kick': 1.2, 'hihat': 1.4, 'snare': 1.0, 'tom': 1.2, 'cajon': 0.8}
KSR = {'kick': 32000, 'tom': 32000, 'cajon': 32000, 'gong': 32000}


def files_of(id):
    fs = sorted(os.listdir(os.path.join(RAW, id)))
    return fs


def build_pitched(id, c):
    fs = files_of(id)
    if 'files' in c:
        fs = [f for f in fs if re.search(c['files'], f)]
    keyed = sorted(((int(f.split('_')[0].split('.')[0]), f) for f in fs), key=lambda t: (t[0], t[1]))
    if c.get('keys'):
        keyed = [k for k in keyed if k[0] in c['keys']]
    if c.get('every'):
        keyed = keyed[:: c['every']]
    out, sr, kbps = [], c.get('sr', SR), c.get('kbps', 64)
    xs = []
    for m, f in keyed:
        x = load(os.path.join(RAW, id, f))
        x = x[onset(x, c.get('onset', 0.03)) :]
        loop = c.get('loop')
        if loop:
            st, ln, xf = loop
            if len(x) < (st + ln) * SR + 10:
                st = max(xf + 0.05, len(x) / SR * 0.35)
                ln = len(x) / SR - st - 0.05
            x = make_loop(x, st, st + ln, xf)
            lp = (st, st + ln)
        else:
            x = natural_end(x)[: int(c['max'] * SR)].copy()
            x = fade_out(x, c.get('fade', 0.25))
            lp = None
        vel = None
        if c.get('vel'):
            vel = int(re.search(r'_v(\d+)_', f).group(1)) / 127
        xs.append((m, x, lp, vel))
    # Match loudness across the range on the first 300 ms (what the ear judges), keep velocity layers relative.
    target = 10 ** (-16 / 20)
    ref = {}
    for m, x, lp, vel in xs:
        r = rms(x[: int(0.3 * SR)])
        ref[m] = max(ref.get(m, 0), r)
    for m, x, lp, vel in xs:
        g = target / ref[m]
        y = x * g
        pk = np.abs(y).max()
        if pk > 0.95:
            y *= 0.95 / pk
        b = base64.b64encode(encode(y, sr, kbps)).decode()
        e = [m, b] + ([round(lp[0], 3), round(lp[1], 3)] if lp else [])
        if vel is not None:
            e = [m, b, round(vel, 2)]
        out.append(e)
    return {'k': 'p', 's': out}


def build_kit(id, arts):
    fs = files_of(id)
    if arts is None:
        arts = {re.sub(r'^[^_]*_', '', os.path.splitext(f)[0]) if id == 'tr808' else os.path.splitext(f)[0]: [i] for i, f in enumerate(fs)}
    sr = KSR.get(id, SR)
    mx = KMAX.get(id, 2.0)
    raw = []
    for name, idx in arts.items():
        for i in idx:
            x = load(os.path.join(RAW, id, fs[i]))
            x = x[onset(x, 0.02) :]
            x = fade_out(natural_end(x, -54)[: int(mx * SR)].copy(), 0.2)
            raw.append((name, x))
    top = max(np.abs(x).max() for _, x in raw)
    g = 0.9 / top
    out = []
    for name, x in raw:
        y = x * g
        out.append([name, round(float(np.abs(y).max()), 3), base64.b64encode(encode(y, sr, 80 if id in ('hihat', 'suscym', 'clash', 'triangle', 'tamb', 'shaker', 'sleigh', 'marktree', 'belltree') else 64)).decode()])
    return {'k': 'k', 's': out}


def write(id, data):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, id + '.ts'), 'w') as f:
        f.write('// Generated by tools/sounds/build.py from free recordings (see src/audio/CREDITS.md). Do not edit.\n')
        f.write('export default ' + json.dumps(data, separators=(',', ':')) + ';\n')


def index():
    ids = sorted(os.path.splitext(f)[0] for f in os.listdir(OUT) if f.endswith('.ts') and f != 'index.ts')
    with open(os.path.join(OUT, 'index.ts'), 'w') as f:
        f.write('// Generated by tools/sounds/build.py. One lazy chunk per instrument.\n')
        f.write('export interface InstData {\n  /** p = pitched [midi, mp3 base64, loopStart?, loopEnd?] or [midi, b64, velocity]; k = kit [articulation, peak, b64]. */\n  k: \'p\' | \'k\';\n  s: (string | number)[][];\n}\n')
        f.write('export const INSTRUMENTS = {\n')
        for i in ids:
            f.write(f"  {json.dumps(i)}: () => import('./{i}') as Promise<{{ default: InstData }}>,\n")
        f.write('};\n')
        f.write('export type InstId = keyof typeof INSTRUMENTS;\n')


if __name__ == '__main__':
    ids = sys.argv[1:] or list(P) + list(K)
    for id in ids:
        d = build_pitched(id, P[id]) if id in P else build_kit(id, K[id])
        write(id, d)
        sz = os.path.getsize(os.path.join(OUT, id + '.ts'))
        print(f'{id}: {len(d["s"])} samples, {sz / 1024:.0f} KB')
    index()
