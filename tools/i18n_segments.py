# -*- coding: utf-8 -*-
"""
Extract and re-apply the translatable text of a page body.

    python3 tools/i18n_segments.py extract           # -> src/i18n/segments.en.json
    python3 tools/i18n_segments.py apply <slug> <code>   # translated body on stdout
    python3 tools/i18n_segments.py stat              # coverage per locale

A translated page has to be the SAME page. Every demo on this site reaches
into the body by element id — cap-canvas, cy-surface, cx-board — and the
research shelf filters on data attributes. Rebuilding those pages from a
localised template would mean maintaining nine copies of that markup and
breaking a demo in eight languages the first time one of them drifted.

So nothing is rebuilt. The document structure is left exactly as it is and
only the human-readable leaves are swapped: text nodes, and the handful of
attributes a person actually reads (alt, title, placeholder, aria-label).
Ids, classes, hrefs, data-* and script contents are never touched.

Keys are a hash of the English text, not a position, so re-ordering a section
does not invalidate a translation, and the same sentence appearing on two
pages is translated once. Anything with no translation falls through to
English rather than to a blank, so a partial catalogue degrades into a
partly-English page instead of a broken one.
"""
import hashlib, json, os, re, sys, glob

# Elements whose contents are code, data or drawing instructions rather than prose.
OPAQUE = ('script', 'style', 'svg', 'code', 'pre', 'canvas', 'template')
ATTRS  = ('alt', 'title', 'placeholder', 'aria-label', 'data-subject', 'aria-description')

SEG_DIR = 'src/i18n'
CORE = ['index', 'pbsd', 'cypha', 'retdec', 'mathscript', 'aegis', 'sentinel',
        'cellai', 'chess', 'kickstarter', 'beta', 'research', 'licensing',
        'about', '404']

def key(s):
    return hashlib.sha1(s.encode('utf-8')).hexdigest()[:10]

def norm(s):
    return re.sub(r'\s+', ' ', s).strip()

def translatable(s):
    """Prose, not punctuation or a bare number. Needs a letter and some length,
    and must not be a lone entity or symbol run."""
    t = norm(s)
    if len(t) < 2:
        return False
    if not re.search(r'[A-Za-z]{2}', t):
        return False
    # "&mdash;" style fragments and pure markup leftovers
    if re.fullmatch(r'(&[a-zA-Z]+;|&#\d+;|\W)+', t):
        return False
    return True

TAG = re.compile(r'<(/?)([a-zA-Z][\w:-]*)((?:[^<>"\']|"[^"]*"|\'[^\']*\')*)(/?)>|<!--.*?-->|<!\[CDATA\[.*?\]\]>',
                 re.S)

def walk(html, on_text, on_attr):
    """Single pass over the document. on_text(str)->str|None replaces a text
    node; on_attr(name, value)->str|None replaces an attribute value."""
    out = []
    pos = 0
    depth = 0          # nesting depth inside an opaque element
    noi18n = 0
    for m in TAG.finditer(html):
        text = html[pos:m.start()]
        if text:
            if depth or noi18n:
                out.append(text)
            else:
                out.append(sub_text(text, on_text))
        pos = m.end()
        raw = m.group(0)
        if raw.startswith('<!'):
            out.append(raw)
            continue
        closing, name, attrs, selfclose = m.group(1), m.group(2).lower(), m.group(3) or '', m.group(4)
        if name in OPAQUE:
            if closing:
                depth = max(0, depth - 1)
            elif not selfclose:
                depth += 1
            out.append(raw)
            continue
        if depth:
            out.append(raw)
            continue
        # data-noi18n marks a subtree as verbatim (version strings, code samples).
        if not closing and 'data-noi18n' in attrs:
            if not selfclose:
                noi18n += 1
            out.append(raw)
            continue
        if noi18n:
            if closing and noi18n:
                noi18n = max(0, noi18n - 1)
            out.append(raw)
            continue
        if closing:
            out.append(raw)
            continue
        out.append('<' + name + sub_attrs(attrs, on_attr) + ('/' if selfclose else '') + '>')
    tail = html[pos:]
    if tail:
        out.append(tail if (depth or noi18n) else sub_text(tail, on_text))
    return ''.join(out)

def sub_text(chunk, on_text):
    """Preserve the surrounding whitespace exactly; only the inner run changes,
    so indentation and inline spacing survive a round trip."""
    m = re.match(r'(\s*)(.*?)(\s*)$', chunk, re.S)
    lead, core, trail = m.group(1), m.group(2), m.group(3)
    if not core or not translatable(core):
        return chunk
    rep = on_text(norm(core))
    return chunk if rep is None else lead + rep + trail

ATTR_RE = re.compile(r'([\w:-]+)\s*=\s*"([^"]*)"')

def sub_attrs(attrs, on_attr):
    def one(m):
        name, val = m.group(1).lower(), m.group(2)
        if name not in ATTRS or not translatable(val):
            return m.group(0)
        rep = on_attr(name, norm(val))
        return m.group(0) if rep is None else '%s="%s"' % (m.group(1), rep.replace('"', '&quot;'))
    return ATTR_RE.sub(one, attrs)

PAGES_ROW = re.compile(r'^"([^~"]+)~([^~]*)~([^~]*)~', re.M)
KEYWORD_ROW = re.compile(r'^\s*\[([a-z0-9/-]+)\]="([^"]*)"', re.M)

def page_meta():
    """slug -> (title, description, keywords), read straight out of
    tools/build.sh so the two can never disagree about what a page is called.

    The keyword list travels with them. It is the one string on a page that
    should NOT be translated word for word — somebody searching in Spanish
    types what a Spanish speaker would type, which is rarely the literal
    translation of the English phrase — so it goes through the same catalogue
    and is rewritten per language rather than rendered."""
    src = open('tools/build.sh', encoding='utf-8').read()
    kw = {}
    inmap = False
    for line in src.splitlines():
        if line.startswith('declare -A KEYWORDS=('):
            inmap = True
            continue
        if inmap:
            if line.startswith(')'):
                break
            m = KEYWORD_ROW.match(line)
            if m:
                kw[m.group(1)] = m.group(2)
    out = {}
    for m in PAGES_ROW.finditer(src):
        slug = m.group(1)
        if slug in CORE:
            out[slug] = (m.group(2), m.group(3), kw.get(slug, ''))
    return out

def extract():
    seen, order = {}, []
    per_page = {}
    meta = page_meta()
    for slug in CORE:
        path = 'src/pages/%s.html' % slug
        if not os.path.exists(path):
            continue
        html = open(path, encoding='utf-8').read()
        ks = []
        def t(s):
            k = key(s)
            if k not in seen:
                seen[k] = s
                order.append(k)
            ks.append(k)
            return None
        def a(n, s):
            return t(s)
        walk(html, t, a)
        for m in meta.get(slug, ()):
            if m and translatable(m):
                t(norm(m))
        # Document order, de-duplicated. A translator reads the page, not an
        # alphabetised bag of strings.
        seen_here, ordered = set(), []
        for k in ks:
            if k not in seen_here:
                seen_here.add(k); ordered.append(k)
        per_page[slug] = ordered
    os.makedirs(SEG_DIR, exist_ok=True)
    with open(SEG_DIR + '/segments.en.json', 'w', encoding='utf-8') as fh:
        json.dump({k: seen[k] for k in order}, fh, ensure_ascii=False, indent=0)
    with open(SEG_DIR + '/segments.pages.json', 'w', encoding='utf-8') as fh:
        json.dump(per_page, fh, ensure_ascii=False, indent=0)
    words = sum(len(seen[k].split()) for k in order)
    print('%d segments, %d unique words across %d pages' % (len(order), words, len(per_page)))
    for slug in CORE:
        if slug in per_page:
            n = len(per_page[slug])
            w = sum(len(seen[k].split()) for k in per_page[slug])
            print('  %-12s %4d segments  %5d words' % (slug, n, w))

def dump(slug, code=None):
    """The page's English, numbered in reading order, with any translation
    that already exists. Tab-separated so it round-trips through a shell."""
    en = load('en')
    cat = load(code) if code else {}
    pages = json.load(open(SEG_DIR + '/segments.pages.json', encoding='utf-8'))
    for i, k in enumerate(pages.get(slug, []), 1):
        if k not in en:
            continue
        mark = '=' if k in cat else ' '
        sys.stdout.write('%d%s\t%s\n' % (i, mark, en[k]))

def merge(slug, code):
    """Read `index<TAB>translation` lines on stdin and fold them into this
    locale's catalogue. Indices are the ones `dump` printed for the same page,
    so nothing depends on the hash being typed out by hand."""
    pages = json.load(open(SEG_DIR + '/segments.pages.json', encoding='utf-8'))
    ks = pages.get(slug, [])
    path = '%s/segments.%s.json' % (SEG_DIR, code)
    cat = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    n = 0
    for line in sys.stdin:
        line = line.rstrip('\n')
        if not line.strip() or '\t' not in line:
            continue
        idx, val = line.split('\t', 1)
        idx = idx.strip().rstrip('=')
        if not idx.isdigit():
            continue
        i = int(idx) - 1
        if not (0 <= i < len(ks)):
            sys.exit('%s: index %s out of range (1..%d)' % (slug, idx, len(ks)))
        val = norm(val)
        if val:
            cat[ks[i]] = val
            n += 1
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(cat, fh, ensure_ascii=False, indent=0, sort_keys=True)
    en = load('en')
    have = sum(1 for k in ks if k in cat)
    print('%s/%s: +%d, page now %d/%d segments' % (code, slug, n, have, len(ks)))

def load(code):
    p = '%s/segments.%s.json' % (SEG_DIR, code)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}

# A link in a page body is written as a root-absolute path — /pbsd.html. Inside
# a localised tree that would walk the reader straight back into English, so
# links to pages that DO exist in this locale are re-pointed at it. Everything
# else — research articles, assets, anchors, external links — is left alone,
# because those really do only exist at the root.
LINK = re.compile(r'(\b(?:href|action)=")(/[^"#?]*)(["#?])')

def relink(html, prefix):
    if not prefix:
        return html
    def one(m):
        path = m.group(2)
        slug = 'index' if path == '/' else path.lstrip('/')[:-5] if path.endswith('.html') else None
        if slug in CORE:
            return m.group(1) + prefix + ('/' if path == '/' else path) + m.group(3)
        return m.group(0)
    return LINK.sub(one, html)

def apply(slug, code, prefix=None):
    html = open('src/pages/%s.html' % slug, encoding='utf-8').read()
    cat = load(code)
    def t(s):
        return cat.get(key(s))
    def a(n, s):
        return cat.get(key(s))
    out = walk(html, t, a)
    if prefix is None:
        prefix = '' if code == 'en' else '/' + code
    sys.stdout.write(relink(out, prefix))

def cover(slug, code):
    """How much of this page is actually in the reader's language, by word.
    The builder uses it to decide whether the page needs to admit it is
    part-English — a page that quietly mixes two languages is worse than one
    that says so."""
    en = load('en')
    cat = load(code)
    pages = json.load(open(SEG_DIR + '/segments.pages.json', encoding='utf-8'))
    ks = pages.get(slug, [])
    tot = sum(len(en[k].split()) for k in ks if k in en) or 1
    hit = sum(len(en[k].split()) for k in ks if k in en and k in cat)
    print(int(round(100.0 * hit / tot)))

def stat():
    en = load('en')
    pages = json.load(open(SEG_DIR + '/segments.pages.json', encoding='utf-8'))
    codes = [os.path.basename(f)[9:-5] for f in sorted(glob.glob(SEG_DIR + '/segments.*.json'))]
    codes = [c for c in codes if c not in ('en', 'pages')]
    for c in codes:
        cat = load(c)
        hit = sum(1 for k in en if k in cat)
        wtot = sum(len(v.split()) for v in en.values())
        whit = sum(len(en[k].split()) for k in en if k in cat)
        print('%-3s %4d/%4d segments  %5.1f%% by segment  %5.1f%% by word'
              % (c, hit, len(en), 100.0 * hit / max(1, len(en)), 100.0 * whit / max(1, wtot)))
        for slug in CORE:
            if slug not in pages:
                continue
            ks = pages[slug]
            h = sum(1 for k in ks if k in cat)
            if h < len(ks):
                print('      %-12s %3d/%3d' % (slug, h, len(ks)))

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'extract'
    if cmd == 'extract': extract()
    elif cmd == 'apply': apply(sys.argv[2], sys.argv[3])
    elif cmd == 'cover': cover(sys.argv[2], sys.argv[3])
    elif cmd == 'dump':  dump(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif cmd == 'merge': merge(sys.argv[2], sys.argv[3])
    elif cmd == 'stat':  stat()
    else: sys.exit('usage: extract | apply <slug> <code> | cover <slug> <code> | '
                   'dump <slug> [code] | merge <slug> <code> | stat')
