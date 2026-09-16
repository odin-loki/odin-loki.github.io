# -*- coding: utf-8 -*-
"""
The strings the interactive demos write into the page.

    python3 tools/i18n_demos.py extract              # scan for D('...') calls
    python3 tools/i18n_demos.py dump  <demo> <code>
    python3 tools/i18n_demos.py merge <demo> <code>  # reads English<TAB>translation
    python3 tools/i18n_demos.py blob  <code> <demo>...   # the inline <script>
    python3 tools/i18n_demos.py stat

Half of what a visitor reads on a product page is not in the HTML at all. It is
written by the demo: the verdict of the licence chooser, the running commentary
of the syscall walk, what Cypha thinks of the position on the board. Translating
the page and leaving those in English gets you a Spanish page that turns back
into English the moment you click anything.

Keys are the English string itself. There is no key to invent, forget or
mistype, the demo source stays readable — D('Your move') says what it does —
and a string used by two demos is translated once.

The catalogue is inlined per page rather than fetched, because a demo writes
its first status line during start-up and would otherwise flash English before
a fetch came back. Only the demos a page actually loads are inlined, so the
licence chooser's forty-nine strings never ride along with the chess board.
"""
import json, os, re, sys, glob

SRC = 'assets/js'
OUT = 'assets/i18n'
CALL = re.compile(r"""\bD\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*\)""")

def unescape(s):
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), s)

def scan():
    """demo name -> the English strings it uses, in source order."""
    out = {}
    files = sorted(glob.glob(SRC + '/demos/*.js')) + sorted(glob.glob(SRC + '/chess/*.js'))
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        txt = open(f, encoding='utf-8').read()
        seen, ordered = set(), []
        for m in CALL.finditer(txt):
            s = unescape(m.group(1) if m.group(1) is not None else m.group(2))
            if s and s not in seen:
                seen.add(s)
                ordered.append(s)
        if ordered:
            out[name] = ordered
    return out

def extract():
    per = scan()
    os.makedirs(OUT, exist_ok=True)
    with open(OUT + '/demos.json', 'w', encoding='utf-8') as fh:
        json.dump(per, fh, ensure_ascii=False, indent=1)
    total = sum(len(v) for v in per.values())
    uniq = len({s for v in per.values() for s in v})
    print('%d strings across %d demos (%d unique)' % (total, len(per), uniq))
    for k in sorted(per, key=lambda k: -len(per[k])):
        print('  %-18s %3d' % (k, len(per[k])))

def load_en():
    p = OUT + '/demos.json'
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}

def load(code):
    p = '%s/demos.%s.json' % (OUT, code)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}

def dump(demo, code):
    en, cat = load_en(), load(code)
    for s in en.get(demo, []):
        if s in cat:
            continue
        sys.stdout.write(s.replace('\n', ' ') + '\n')

def merge(demo, code):
    en, cat = load_en(), load(code)
    known = set(en.get(demo, []))
    n = 0
    for line in sys.stdin:
        line = line.rstrip('\n')
        if not line.strip() or '\t' not in line:
            continue
        src, dst = line.split('\t', 1)
        src, dst = src.strip(), dst.strip()
        if src not in known:
            sys.exit('%s: %r is not one of this demo\'s strings' % (demo, src[:60]))
        if dst:
            cat[src] = dst
            n += 1
    with open('%s/demos.%s.json' % (OUT, code), 'w', encoding='utf-8') as fh:
        json.dump(cat, fh, ensure_ascii=False, indent=0, sort_keys=True)
    have = sum(1 for s in known if s in cat)
    print('%s/%s: +%d, %d/%d strings' % (code, demo, n, have, len(known)))

def blob(code, demos):
    """The inline script for one page: only the strings its demos use."""
    if code == 'en':
        return ''
    en, cat = load_en(), load(code)
    want = {}
    for d in demos:
        for s in en.get(d, []):
            if s in cat:
                want[s] = cat[s]
    if not want:
        return ''
    js = json.dumps(want, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003C')
    return '<script>window.__IMORTEK_DEMO=%s;</script>' % js

def stat():
    en = load_en()
    total = len({s for v in en.values() for s in v})
    for p in sorted(glob.glob(OUT + '/demos.*.json')):
        code = os.path.basename(p)[6:-5]
        if code == 'en':
            continue
        cat = load(code)
        print('%-3s %3d/%3d  %5.1f%%' % (code, len(cat), total, 100.0 * len(cat) / max(1, total)))

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'stat'
    if cmd == 'extract': extract()
    elif cmd == 'dump':  dump(sys.argv[2], sys.argv[3])
    elif cmd == 'merge': merge(sys.argv[2], sys.argv[3])
    elif cmd == 'blob':  sys.stdout.write(blob(sys.argv[2], sys.argv[3:]))
    elif cmd == 'stat':  stat()
    else: sys.exit('usage: extract | dump <demo> <code> | merge <demo> <code> | '
                   'blob <code> <demo>... | stat')
