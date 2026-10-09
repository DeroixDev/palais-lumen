# Turns dist/index.html into a page fragment for publishing as a claude.ai artifact.
import re, sys, pathlib
src = pathlib.Path('dist/index.html').read_text()
head = re.search(r'<head>(.*?)</head>', src, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', src, re.S).group(1)
head = re.sub(r'<meta[^>]*>\s*', '', head)
out = head.strip() + '\n' + body.strip() + '\n'
pathlib.Path('dist/artifact.html').write_text(out)
print(len(out))
