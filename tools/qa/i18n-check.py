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
DATA  = re.compile(r'\b(data-[\w-]+)')
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

            for label, rx in (('id', ID), ('script src', SRC), ('data attribute', DATA)):
                sa, sb = set(rx.findall(en)), set(rx.findall(tr))
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
