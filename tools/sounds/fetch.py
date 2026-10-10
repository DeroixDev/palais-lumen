# Downloads the raw instrument recordings for Casino Nachtfalter into snd/raw/<id>/.
# Every source is free: CC0 (VCSL, Virtuosity), public domain (Splendid Grand, drum machines),
# royalty-free (D. Smolken bass) or CC-BY 3.0 (Greg Sullivan e-pianos, tonejs-instruments, FluidR3).
# Usage: python3 fetch.py [id ...]
import json, os, re, sys, base64, subprocess, urllib.parse, urllib.request, io, tarfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
# Raw downloads live outside the repo (large); override with SND_RAW.
RAW = os.environ.get('SND_RAW', '/home/claude/snd/raw')
GH = 'https://raw.githubusercontent.com/'
VCSL = GH + 'smpldsnds/sgossner-vcsl/main/'
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'nf'}), timeout=60) as r:
                return r.read()
        except Exception as e:
            err = e
    raise RuntimeError(f'{url}: {err}')


def q(path):
    return urllib.parse.quote(path)


def parse_sfz(text):
    """Flattens an sfz file into regions with inherited opcodes."""
    defines = dict(re.findall(r'#define\s+(\$\w+)\s+(\S+)', text))
    text = re.sub(r'//.*', '', text)
    for k, v in defines.items():
        text = text.replace(k, v)
    regions, levels, cur, header = [], {'control': {}, 'global': {}, 'master': {}, 'group': {}}, None, None
    for tok in re.split(r'(<\w+>)', text):
        m = re.match(r'<(\w+)>', tok)
        if m:
            header = m.group(1)
            if header in levels:
                if header == 'global':
                    levels['master'] = {}; levels['group'] = {}
                if header == 'master':
                    levels['group'] = {}
                levels[header] = {}
            if header == 'region':
                cur = {}
                regions.append(cur)
            continue
        if header is None:
            continue
        ops = dict(re.findall(r'(\w+)=(.+?)(?=\s+\w+=|\s*$)', tok.strip().replace('\n', ' ')))
        if header == 'region':
            base = {**levels['control'], **levels['global'], **levels['master'], **levels['group']}
            cur.update({**base, **ops})
        elif header in levels:
            levels[header].update(ops)
    return regions


def midi_of(v):
    if v is None:
        return None
    v = str(v).strip()
    if re.fullmatch(r'-?\d+', v):
        return int(v)
    m = re.fullmatch(r'([A-Ga-g])([#b]?)(-?\d)', v)
    if not m:
        return None
    n = NOTE[m.group(1).upper()] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return n + (int(m.group(3)) + 1) * 12


def to_wav(data, ext, dest):
    """Decodes through a temp file (mp4 needs a seekable input) and refuses empty results."""
    import tempfile
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.' + ext) as tmp:
        tmp.write(data); tmp.flush()
        p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-ar', '44100', '-c:a', 'pcm_s16le', dest], capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr.decode()[:300])
    if os.path.getsize(dest) < 2000:
        os.remove(dest)
        raise RuntimeError('empty decode')


def pick(regions, keys=None, step=None, vel=None, rr=1, limit=None):
    """Keeps regions whose key centre is in `keys` (or every `step` semitones), at the velocity layer that covers `vel`."""
    out = []
    for r in regions:
        kc = midi_of(r.get('pitch_keycenter') or r.get('key') or r.get('lokey'))
        if kc is None:
            continue
        r['kc'] = kc
        lo, hi = int(r.get('lovel', 0) or 0), int(r.get('hivel', 127) or 127)
        if vel is not None and not (lo <= vel <= hi):
            continue
        if rr is not None and int(r.get('seq_position', 1) or 1) > rr:
            continue
        out.append(r)
    if keys is not None:
        out = [r for r in out if r['kc'] in keys]
    if step:
        out.sort(key=lambda r: r['kc'])
        kept, last = [], -99
        for r in out:
            if r['kc'] - last >= step:
                kept.append(r)
                last = r['kc']
        out = kept
    return out[:limit] if limit else out


def fetch_vcsl(id, sfz, name=lambda r, i: f"{r['kc']}", **kw):
    text = get(VCSL + q(sfz) + '.sfz').decode('utf-8', 'replace')
    base = sfz[: sfz.rfind('/') + 1]
    regs = pick(parse_sfz(text), **kw)
    jobs = []
    for i, r in enumerate(regs):
        s = r['sample'].replace('\\', '/')
        s = re.sub(r'\.\w+$', '', s)
        jobs.append((VCSL + q(base + s) + '.m4a', 'm4a', os.path.join(RAW, id, name(r, i) + '.wav'), r))
    return jobs


def fetch_sfz(id, url_base, sfz, prefix='', ext='m4a', name=lambda r, i: f"{r['kc']}", use_default_path=True, **kw):
    text = get(url_base + q(sfz)).decode('utf-8', 'replace')
    regs = pick(parse_sfz(text), **kw)
    jobs = []
    for i, r in enumerate(regs):
        s = ((r.get('default_path', '') if use_default_path else '') + r['sample']).replace('\\', '/')
        s = re.sub(r'\.\w+$', '', s)
        jobs.append((url_base + q(prefix + s) + '.' + ext, ext, os.path.join(RAW, id, name(r, i) + '.wav'), r))
    return jobs


def fetch_files(id, base, names, ext='m4a', rename=None):
    return [(base + q(n) + '.' + ext, ext, os.path.join(RAW, id, (rename(n) if rename else n.replace('/', '_')) + '.wav'), {}) for n in names]


def fetch_fluid(id, inst, notes):
    """FluidR3 GM (CC-BY 3.0) from the midi-js-soundfonts repo: one JS file of base64 mp3s per instrument."""
    js = get(GH + f'gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/{inst}-mp3.js').decode()
    jobs = []
    for m in notes:
        names = [k for k in re.findall(r'"([A-G]b?\d)":', js) if midi_of(k) == m]
        if not names:
            continue
        b64 = re.search(r'"%s":\s*"data:audio/mp3;base64,([^"]+)"' % re.escape(names[0]), js).group(1)
        jobs.append((base64.b64decode(b64), 'mp3', os.path.join(RAW, id, f'{m}.wav'), {}))
    return jobs


def fetch_npm(id, pkg, keep=None):
    meta = json.loads(get('https://registry.npmjs.org/' + pkg))
    tb = get(meta['versions'][meta['dist-tags']['latest']]['dist']['tarball'])
    jobs = []
    with tarfile.open(fileobj=io.BytesIO(tb)) as t:
        for m in t.getmembers():
            fn = os.path.basename(m.name)
            mm = re.fullmatch(r'([A-G])(s?)(\d)\.mp3', fn)
            if not mm:
                continue
            midi = NOTE[mm.group(1)] + (1 if mm.group(2) else 0) + (int(mm.group(3)) + 1) * 12
            if keep and midi not in keep:
                continue
            jobs.append((t.extractfile(m).read(), 'mp3', os.path.join(RAW, id, f'{midi}.wav'), {}))
    return jobs


def rng(lo, hi, step):
    return set(range(lo, hi + 1, step))


def rr_name(r, i):
    return f"{r['kc']}_v{r.get('hivel', 127)}_r{r.get('seq_position', 1)}"


def idx_name(r, i):
    return f"{i:02d}_{r['kc']}"


def piano_layer(id, layer, step):
    samples = json.load(open(os.path.join(ROOT, 'piano-layers.json')))[layer]
    kept, last = [], -99
    for m, n in samples:
        if 28 <= m <= 100 and m - last >= step:
            kept.append((m, n)); last = m
    return [(PIANO + q(n) + '.m4a', 'm4a', os.path.join(RAW, id, f'{m}.wav'), {}) for m, n in kept]


GS = GH + 'smpldsnds/sfzinstruments-greg-sullivan-e-pianos/main/'
SM = GH + 'smpldsnds/sfzinstruments-dsmolken-double-bass/main/'
PIANO = GH + 'smpldsnds/sfzinstruments-splendid-grand-piano/main/samples/'
DM = GH + 'smpldsnds/drum-machines/main/'
NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

SOURCES = {
    # --- keys and band ---
    'piano': lambda: piano_layer('piano', 'MP', 3),
    'pianof': lambda: piano_layer('pianof', 'FF', 5),
    'wurli': lambda: fetch_sfz('wurli', GS + 'wurlitzer-ep200/', 'Wurlitzer EP200.sfz', prefix='samples/', use_default_path=False, step=3, vel=80),
    'bass': lambda: fetch_sfz('bass', SM, 'd_smolken_rubner_bass_pizz.sfz', step=2, rr=1, keys=set(range(24, 60))),
    'vibes': lambda: fetch_vcsl('vibes', 'Idiophones/Struck Idiophones/Vibraphone - Soft Mallets', vel=60),
    'vibesbow': lambda: fetch_vcsl('vibesbow', 'Idiophones/Struck Idiophones/Vibraphone - Bowed', step=3),
    'sax': lambda: fetch_vcsl('sax', 'Aerophones/Reed Aerophones/Tenor Saxophone - Vibrato', vel=70, step=2),
    'mutetp': lambda: fetch_fluid('mutetp', 'muted_trumpet', rng(55, 84, 3)),
    # --- orchestra ---
    'harp': lambda: fetch_vcsl('harp', 'Chordophones/Composite Chordophones/Concert Harp', vel=80, step=3),
    'harpsi': lambda: fetch_vcsl('harpsi', "Chordophones/Zithers/Harpsichord, Flemish - 8'", step=3),
    'organ': lambda: fetch_vcsl('organ', 'Aerophones/Edge-blown Aerophones/Pipe Organ - Loud', step=3),
    'organq': lambda: fetch_vcsl('organq', 'Aerophones/Edge-blown Aerophones/Pipe Organ - Quiet', step=3),
    'choir': lambda: fetch_fluid('choir', 'choir_aahs', rng(43, 79, 3)),
    'strings': lambda: fetch_fluid('strings', 'string_ensemble_1', rng(31, 88, 3)),
    'pizz': lambda: fetch_fluid('pizz', 'pizzicato_strings', rng(36, 84, 3)),
    'celesta': lambda: fetch_fluid('celesta', 'celesta', rng(60, 96, 3)),
    'musicbox': lambda: fetch_fluid('musicbox', 'music_box', rng(60, 96, 3)),
    'flute': lambda: fetch_npm('flute', 'tonejs-instrument-flute-mp3'),
    'cello': lambda: fetch_npm('cello', 'tonejs-instrument-cello-mp3'),
    'trumpet': lambda: fetch_npm('trumpet', 'tonejs-instrument-trumpet-mp3'),
    'trombone': lambda: fetch_npm('trombone', 'tonejs-instrument-trombone-mp3'),
    'horn': lambda: fetch_npm('horn', 'tonejs-instrument-french-horn-mp3'),
    'tuba': lambda: fetch_npm('tuba', 'tonejs-instrument-tuba-mp3'),
    # --- mallets, bells, glass ---
    'glock': lambda: fetch_vcsl('glock', 'Idiophones/Struck Idiophones/Glockenspiel', vel=80, step=3),
    'marimba': lambda: fetch_vcsl('marimba', 'Idiophones/Struck Idiophones/Marimba', vel=80, step=3),
    'xylo': lambda: fetch_vcsl('xylo', 'Idiophones/Struck Idiophones/Xylophone - Medium Mallets', vel=80, step=3),
    'tubbells': lambda: fetch_vcsl('tubbells', 'Idiophones/Struck Idiophones/Tubular Bells 1', vel=80, step=2),
    'chimes': lambda: fetch_vcsl('chimes', 'Idiophones/Struck Idiophones/Hand Chimes', vel=80, step=3),
    'handbells': lambda: fetch_vcsl('handbells', 'Idiophones/Struck Idiophones/Hand Bells, Nepalese', name=idx_name, rr=None),
    'wine': lambda: fetch_vcsl('wine', 'Idiophones/Friction Idiophones/Wine Glasses - Slow', step=2),
    'kalimba': lambda: fetch_vcsl('kalimba', 'Idiophones/Plucked Idiophones/Kalimba, Kenya', vel=80),
    'tglock': lambda: fetch_vcsl('tglock', 'Idiophones/Struck Idiophones/Tubular Glockenspiel', vel=80, step=2),
    # --- percussion ---
    'timpani': lambda: fetch_vcsl('timpani', 'Membranophones/Struck Membranophones/Timpani 1 - Hit', name=rr_name, rr=1),
    'timproll': lambda: fetch_vcsl('timproll', 'Membranophones/Struck Membranophones/Timpani 1 - Roll', name=rr_name),
    'gong': lambda: fetch_vcsl('gong', 'Idiophones/Struck Idiophones/Gong 1', name=idx_name, rr=None),
    'suscym': lambda: fetch_vcsl('suscym', 'Idiophones/Struck Idiophones/Suspended Cymbal 1', name=idx_name, rr=None),
    'clash': lambda: fetch_vcsl('clash', 'Idiophones/Struck Idiophones/Clash Cymbals 1', name=idx_name, rr=None),
    'hihat': lambda: fetch_vcsl('hihat', 'Idiophones/Struck Idiophones/Hi-Hat Cymbal', name=idx_name, rr=None),
    'snare': lambda: fetch_vcsl('snare', 'Membranophones/Struck Membranophones/Snare Drum, Modern 1', name=idx_name, rr=None),
    'kick': lambda: fetch_vcsl('kick', 'Membranophones/Struck Membranophones/Bass Drum 1', name=idx_name, rr=None),
    'tom': lambda: fetch_vcsl('tom', 'Membranophones/Struck Membranophones/Tom 1', name=idx_name, rr=None),
    'fingercym': lambda: fetch_vcsl('fingercym', 'Idiophones/Struck Idiophones/Finger Cymbals', name=idx_name, rr=None),
    'triangle': lambda: fetch_vcsl('triangle', 'Idiophones/Struck Idiophones/Triangles', name=idx_name, rr=None),
    'sleigh': lambda: fetch_vcsl('sleigh', 'Idiophones/Struck Idiophones/Sleigh Bells', name=idx_name, rr=None),
    'marktree': lambda: fetch_vcsl('marktree', 'Idiophones/Struck Idiophones/Mark Trees', name=idx_name, rr=None),
    'belltree': lambda: fetch_vcsl('belltree', 'Idiophones/Struck Idiophones/Bell Tree - Stroke', name=idx_name, rr=None),
    'ratchet': lambda: fetch_vcsl('ratchet', 'Idiophones/Struck Idiophones/Ratchet', name=idx_name, rr=None),
    'woodblock': lambda: fetch_vcsl('woodblock', 'Idiophones/Struck Idiophones/Woodblock', name=idx_name, rr=None),
    'claves': lambda: fetch_vcsl('claves', 'Idiophones/Struck Idiophones/Claves', name=idx_name, rr=None),
    'shaker': lambda: fetch_vcsl('shaker', 'Idiophones/Struck Idiophones/Shaker, Small', name=idx_name, rr=None),
    'cabasa': lambda: fetch_vcsl('cabasa', 'Idiophones/Struck Idiophones/Cabasa', name=idx_name, rr=None),
    'guiro': lambda: fetch_vcsl('guiro', 'Idiophones/Struck Idiophones/Guiro', name=idx_name, rr=None),
    'tamb': lambda: fetch_vcsl('tamb', 'Idiophones/Struck Idiophones/Tambourine 1', name=idx_name, rr=None),
    'whistle': lambda: fetch_vcsl('whistle', 'Aerophones/Edge-blown Aerophones/Train Whistle, Toy', name=idx_name, rr=None),
    'slapstick': lambda: fetch_vcsl('slapstick', 'Idiophones/Struck Idiophones/Slapstick', name=idx_name, rr=None),
    'anvil': lambda: fetch_vcsl('anvil', 'Idiophones/Struck Idiophones/Anvil', name=idx_name, rr=None),
    'cowbell': lambda: fetch_vcsl('cowbell', 'Idiophones/Struck Idiophones/Cowbells', name=idx_name, rr=None),
    'brakedrum': lambda: fetch_vcsl('brakedrum', 'Idiophones/Struck Idiophones/Brake Drum', name=idx_name, rr=None),
    'cajon': lambda: fetch_vcsl('cajon', 'Idiophones/Struck Idiophones/Cajon', name=idx_name, rr=None),
    'claps': lambda: fetch_vcsl('claps', 'Idiophones/Struck Idiophones/Claps', name=idx_name, rr=None),
    'vibraslap': lambda: fetch_vcsl('vibraslap', 'Idiophones/Struck Idiophones/Vibraslap', name=idx_name, rr=None),
    'oceandrum': lambda: fetch_vcsl('oceandrum', 'Membranophones/Other Membranophones/Ocean Drum', name=idx_name, rr=None),
    # --- drum machines (public domain) ---
    'lm2': lambda: fetch_files('lm2', DM + 'LM-2/', json.loads(get(DM + 'LM-2/dm.json'))['samples']),
    'tr808': lambda: fetch_files('tr808', DM + 'TR-808/', [s for s in json.loads(get(DM + 'TR-808/dm.json'))['samples'] if re.search(r'/(cp|cl|cb|ch|oh00|oh10|bd2550|bd5050|bd7550|bd0050|sd0050|sd2550|sd5050|rs|lt00|mt00|ht00|ma|cy1050|cy2550)$', s)]),
}


def run(ids):
    for id in ids:
        try:
            jobs = SOURCES[id]()
        except Exception as e:
            print('FAIL', id, e)
            continue

        def one(j):
            src, ext, dest, _ = j
            if os.path.exists(dest):
                return 0
            try:
                try:
                    data = src if isinstance(src, bytes) else get(src)
                    to_wav(data, ext, dest)
                except Exception:
                    if isinstance(src, bytes) or ext != 'm4a':
                        raise
                    to_wav(get(src[:-4] + '.ogg'), 'ogg', dest)
            except Exception as e:
                print('  skip', dest.split('/raw/')[1], str(e)[-40:])
                return 0
            return 1

        with ThreadPoolExecutor(8) as ex:
            try:
                n = sum(ex.map(one, jobs))
            except Exception as e:
                print('FAIL', id, e)
                continue
        print(f'{id}: {len(jobs)} samples ({n} new)')


if __name__ == '__main__':
    run(sys.argv[1:] or list(SOURCES))
