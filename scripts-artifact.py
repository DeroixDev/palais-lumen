# Turns dist/index.html into a page fragment for publishing as a claude.ai artifact.
import re, sys, pathlib
src = pathlib.Path('dist/index.html').read_text()
head = re.search(r'<head>(.*?)</head>', src, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', src, re.S).group(1)
head = re.sub(r'<meta[^>]*>\s*', '', head)
# Inline built stylesheets so the page never depends on a separate CSS request.
def inline_css(m):
    return '<style>' + pathlib.Path('dist', m.group(1).lstrip('./')).read_text() + '</style>'
head = re.sub(r'<link rel="stylesheet"[^>]*href="(\./assets/[^"]+\.css)"[^>]*>', inline_css, head)
out = head.strip() + '\n' + body.strip() + '\n'
pathlib.Path('dist/artifact.html').write_text(out)
print(len(out))
