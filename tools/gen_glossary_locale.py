# -*- coding: utf-8 -*-
"""
Build a translated plain-English layer: assets/data/glossary.<code>.json

    python3 tools/gen_glossary_locale.py dump  <code>      # what still needs writing
    python3 tools/gen_glossary_locale.py merge <code>      # reads TSV on stdin
    python3 tools/gen_glossary_locale.py stat              # coverage, all locales

The English file is the master. A locale file has the same entries in the same
order, with two things changed:

  g       the explanation, in that language
  alias   the English aliases, plus however that term is actually written in
          that language on the translated pages

The term key `t` never changes. It is what glossary.js stores against what a
reader has opened, so changing it per language would make Cypha's memory of
one visitor's vocabulary reset every time they switched language. The matching
against the page is done by `t` AND every alias, so adding the local spellings
is what makes the layer light up on a translated page — and leaving the English
key there is what makes it still light up on "DBSCAN", "AGPL-3.0" and
"HardenedBSD", which are spelt the same in every language on earth.

The merge input is tab separated, one term per line:

    kernel<TAB>explanation in the target language<TAB>núcleo, núcleo del sistema

The third column is optional. Anything not supplied keeps the English text, so
a partial file degrades to a partly-English glossary rather than a broken one.
"""
import json, os, sys

EN = 'assets/data/glossary.json'

def path(code):
    return 'assets/data/glossary.%s.json' % code

def load_en():
    return json.load(open(EN, encoding='utf-8'))

def load(code):
    p = path(code)
    if not os.path.exists(p):
        return {}
    d = json.load(open(p, encoding='utf-8'))
    return {t['t']: t for t in d.get('terms', [])}

def dump(code):
    en = load_en()
    have = load(code)
    done = 0
    for t in en['terms']:
        cur = have.get(t['t'])
        if cur and cur.get('g') and cur['g'] != t['g']:
            done += 1
            continue
        sys.stdout.write('%s\t%s\n' % (t['t'], t['g']))
    sys.stderr.write('%s: %d of %d already written\n' % (code, done, len(en['terms'])))

def merge(code):
    en = load_en()
    have = load(code)
    n = 0
    for line in sys.stdin:
        line = line.rstrip('\n')
        if not line.strip() or '\t' not in line:
            continue
        parts = line.split('\t')
        term, gloss = parts[0].strip(), parts[1].strip()
        extra = [a.strip() for a in parts[2].split(',')] if len(parts) > 2 else []
        extra = [a for a in extra if a]
        src = next((t for t in en['terms'] if t['t'] == term), None)
        if src is None:
            sys.exit('unknown term %r — it must match the English file exactly' % term)
        if not gloss:
            continue
        rec = {'t': src['t'], 'd': src['d'], 'g': gloss}
        alias = list(src.get('alias', []))
        for a in extra:
            if a not in alias and a != src['t']:
                alias.append(a)
        if alias:
            rec['alias'] = alias
        have[src['t']] = rec
        n += 1
    terms = []
    for t in en['terms']:
        terms.append(have.get(t['t'], t))
    out = {
        '_note': ('Plain-English layer for the %s pages. The English file at '
                  'assets/data/glossary.json is the master; this one carries the '
                  'same entries with the explanation in this language and the '
                  'local spellings added as aliases. Built by '
                  'tools/gen_glossary_locale.py.' % code),
        'terms': terms,
    }
    with open(path(code), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    en_g = {t['t']: t['g'] for t in en['terms']}
    done = sum(1 for t in terms if t['g'] != en_g[t['t']])
    print('%s: +%d this run, %d of %d terms now translated, %.1f KB'
          % (code, n, done, len(terms), os.path.getsize(path(code)) / 1024))

def stat():
    en = load_en()
    en_g = {t['t']: t['g'] for t in en['terms']}
    import glob
    for p in sorted(glob.glob('assets/data/glossary.*.json')):
        code = os.path.basename(p)[9:-5]
        d = json.load(open(p, encoding='utf-8'))
        done = sum(1 for t in d['terms'] if t['g'] != en_g.get(t['t']))
        print('%-3s %3d/%3d  %5.1f%%' % (code, done, len(en['terms']),
                                         100.0 * done / len(en['terms'])))

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'stat'
    if cmd == 'dump':    dump(sys.argv[2])
    elif cmd == 'merge': merge(sys.argv[2])
    elif cmd == 'stat':  stat()
    else: sys.exit('usage: dump <code> | merge <code> | stat')
