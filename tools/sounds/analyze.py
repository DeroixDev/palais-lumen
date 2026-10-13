import sys, os, wave, numpy as np
def load(p):
    w = wave.open(p); n = w.getnframes(); ch = w.getnchannels()
    a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    return a.reshape(-1, ch), w.getframerate()
for d in sys.argv[1:]:
    rows = []
    for f in sorted(os.listdir(d)):
        a, sr = load(os.path.join(d, f))
        if len(a) == 0: rows.append(f + ":EMPTY"); continue
        m = np.abs(a).max(1); pk = m.max()
        on = np.argmax(m > pk * 0.05) / sr
        # time until the envelope falls 40 dB under the peak
        env = np.convolve(m, np.ones(441) / 441, 'same'); ip = env.argmax()
        tail = np.where(env[ip:] > env[ip] * 0.01)[0]
        dec = (tail[-1] if len(tail) else 0) / sr
        rows.append(f"{f.split('.')[0]}:{len(a)/sr:.1f}s/on{on*1000:.0f}/d{dec:.1f}/pk{20*np.log10(pk+1e-9):.0f}/ch{a.shape[1]}")
    print(os.path.basename(d), ' '.join(rows))
