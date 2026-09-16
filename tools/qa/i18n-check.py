# -*- coding: utf-8 -*-
"""
Check that a translated page is still the same page.

    python3 tools/qa/i18n-check.py

The translation pipeline swaps text nodes and leaves the document structure
alone, so a translated page should differ from its English original in exactly
one way: the words. Anything else means a translation escaped its own segment
and ate some markup — which is silent, because the page still renders, and
fatal, because the demo that reached for that element id is now broken in one
language and fine in eight.

So this compares each built locale page against its English original and
insists that the tag counts, the element ids, the script sources and the link
targets all match. It also looks for the damage a translator can do inside a
segment: a half-written HTML entity, or a placeholder left unfilled.

Run it after tools/build.sh. It exits non-zero on the first kind of problem
that would actually break something.
"""
import json, os, re, sys, collections

TAG   = re.compile(r'<([a-zA-Z][\w:-]*)\b')
ID    = re.compile(r'\bid="([^"]+)"')
SRC   = re.compile(r'\bsrc="([^"]+)"')
HREF  = re.compile(r'\bhref="([^"]+)"')
# Only inside a tag. The English sentinel page contains the prose
# "data-quality scoring with quarantine thresholds", and matching data-*
# anywhere in the document reported that phrase as a lost attribute in every
# language that translated the sentence.
TAGS  = re.compile(r'<[a-zA-Z][^>]*>')
DATA  = re.compile(r'[\s"\'](data-[\w-]+)')

def data_attrs(html):
    out = set()
    for tag in TAGS.findall(html):
        out.update(DATA.findall(tag))
    return out
# An ampersand that is not the start of a well-formed entity.
BADAMP = re.compile(r'&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]{1,31};)')
PLACE  = re.compile(r'\{[a-z]+\}')

# The builder adds its own strip when a page is not fully translated. That is
# markup the English page does not have and is supposed to differ.
NOTE = re.compile(r'(?is)<div class="wrap"><p class="i18n-note".*?</p></div>')

def body(path):
    s = open(path, encoding='utf-8').read()
    m = re.search(r'(?is)<main\b.*?>(.*)</main>', s)
    return NOTE.sub('', m.group(1) if m else s)

def crosstalk():
    """Two languages holding the identical translation of the same sentence.

    Translating nine languages in parallel means nine processes writing nine
    files, and the one failure mode that does not announce itself is a
    Portuguese catalogue quietly receiving Spanish. It renders, it validates,
    it passes every structural check — and it is wrong.

    Plenty of strings really are identical in two languages: a list of file
    formats, a campaign title, a row of language names. So this only looks at
    segments that are a real sentence in English, which is where a coincidence
    stops being plausible.
    """
    import glob
    en_path = 'src/i18n/segments.en.json'
    if not os.path.exists(en_path):
        return []
    en = json.load(open(en_path, encoding='utf-8'))
    cats = {}
    for f in sorted(glob.glob('src/i18n/segments.*.json')):
        code = os.path.basename(f)[9:-5]
        if code in ('en', 'pages'):
            continue
        cats[code] = json.load(open(f, encoding='utf-8'))

    def sentence(k):
        t = en.get(k, '')
        return len(t.split()) >= 6 and re.search(r'[a-z]{3}\s+[a-z]{3}', t)

    out, codes = [], sorted(cats)
    for i, a in enumerate(codes):
        for b in codes[i + 1:]:
            same = [k for k in cats[a]
                    if k in cats[b] and cats[a][k] == cats[b][k] and sentence(k)]
            if same:
                out.append('%s and %s share %d translated sentences — one of them '
                           'is probably in the wrong language, e.g. %r'
                           % (a, b, len(same), cats[a][same[0]][:70]))
    return out

def main():
    locales = [l['code'] for l in
               json.load(open('tools/locales.json', encoding='utf-8'))['locales']
               if not l.get('root')]
    core = ['index', 'pbsd', 'cypha', 'retdec', 'mathscript', 'aegis', 'sentinel',
            'cellai', 'chess', 'kickstarter', 'beta', 'research', 'licensing',
            'about', '404']
    problems, warnings, checked = [], [], 0

    for code in locales:
        for slug in core:
            en_path, tr_path = '%s.html' % slug, '%s/%s.html' % (code, slug)
            if not os.path.exists(tr_path):
                problems.append('%s: missing' % tr_path)
                continue
            en, tr = body(en_path), body(tr_path)
            checked += 1
            where = '%s/%s' % (code, slug)

            a, b = collections.Counter(TAG.findall(en)), collections.Counter(TAG.findall(tr))
            for name in set(a) | set(b):
                if a[name] != b[name]:
                    problems.append('%s: <%s> appears %d times, English has %d'
                                    % (where, name, b[name], a[name]))

            for label, rx in (('id', ID), ('script src', SRC), ('data attribute', None)):
                sa = data_attrs(en) if rx is None else set(rx.findall(en))
                sb = data_attrs(tr) if rx is None else set(rx.findall(tr))
                for missing in sorted(sa - sb):
                    problems.append('%s: lost %s %r' % (where, label, missing))
                for added in sorted(sb - sa):
                    problems.append('%s: invented %s %r' % (where, label, added))

            # Links may gain the locale prefix and nothing else.
            pre = '/' + code
            sa = set(HREF.findall(en))
            sb = set(h[len(pre):] if h.startswith(pre + '/') else h for h in HREF.findall(tr))
            for missing in sorted(sa - sb):
                problems.append('%s: lost link %r' % (where, missing))

            for m in BADAMP.finditer(tr):
                problems.append('%s: broken HTML entity near %r'
                                % (where, tr[max(0, m.start() - 20):m.start() + 20]))
            for m in PLACE.finditer(tr):
                warnings.append('%s: unfilled placeholder %r' % (where, m.group(0)))

    cross = crosstalk()
    for c in cross:
        warnings.append(c)

    for w in warnings:
        print('  ? ' + w)
    if problems:
        print('\n%d structural problem(s):' % len(problems))
        for p in problems[:60]:
            print('  ! ' + p)
        if len(problems) > 60:
            print('  ... and %d more' % (len(problems) - 60))
        sys.exit(1)
    print('%d translated pages checked — same structure as their English originals.'
          % checked)

if __name__ == '__main__':
    main()
