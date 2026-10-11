# Writes CHANGELOG.md from src/data/devlog.json (the in-game "Neuigkeiten" page uses the same data).
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
log = json.loads((root / 'src/data/devlog.json').read_text())
out = ['# Casino Nachtfalter: Update-Log', '', 'Alle Versionen, neueste zuerst. Im Spiel unter „Neuigkeiten“ (Titelbildschirm und Hilfe).', '']
for e in log:
    y, m, d = e['date'].split('-')
    out += [f"## v{e['v']}: {e['title']}", '', f"*{e['kind']} · {int(d)}.{int(m)}.{y}*", '']
    if e.get('intro'):
        out += [e['intro'], '']
    for s in e['sections']:
        out += [f"**{s['h']}**", ''] + [f"- {i}" for i in s['items']] + ['']
(root / 'CHANGELOG.md').write_text('\n'.join(out))
print('CHANGELOG.md', len(log), 'entries')
