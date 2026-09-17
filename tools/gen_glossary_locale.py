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
import hashlib, json, os, sys

EN = 'assets/data/glossary.json'

def path(code):
    return 'assets/data/glossary.%s.json' % code

def stamp(gloss):
    """A short fingerprint of the English a translation was made from.

    Without it, correcting an English gloss rather than adding one leaves nine
    translations of the old sentence in place, saying something the site no
    longer says, and no command will ever surface them: `dump` only offers
    terms with no translation at all. That happened three times on this
    glossary before anyone noticed — benchmark, tracker and QR — and each was
    caught by a person reading, not by a tool.
    """
    return hashlib.sha1(gloss.encode('utf-8')).hexdigest()[:8]

# A limit of the fingerprint, written down because it already caught someone out
# once: it records the English as it stood when MERGE RAN, not the English the
# translator actually read. A translation written against an older master and
# merged later is stamped as current and `stale` will not see it. That is what
# happened to the Bengali KDE and QR — a batch prepared before the English was
# corrected, merged after, and it silently reverted both. If a translation is
# merged long after it was written, check the terms whose English moved in
# between by hand; the fingerprint cannot do it for you.

def sync():
    """Push the English aliases into every locale, keeping each one's own.

    `merge` builds a record's alias list from the English entry plus whatever
    the translator supplied, which is right at the moment of writing and wrong
    ever after: an alias added to the English master later never reaches the
    locales, because nothing re-touches an entry that is already translated.
    Glosses are not touched here — only the alias lists and the fingerprints.
    """
    import glob
    en = {t['t']: t for t in load_en()['terms']}
    keys = set(en)
    total = 0
    for p in sorted(glob.glob('assets/data/glossary.*.json')):
        code = os.path.basename(p)[len('glossary.'):-len('.json')]
        if code == 'json' or '.' in code:
            continue
        d = json.load(open(p, encoding='utf-8'))
        before = json.dumps(d, ensure_ascii=False, sort_keys=True)
        changed = []
        for t in d['terms']:
            src = en.get(t['t'])
            if not src:
                continue
            want = list(src.get('alias', []))
            # An alias dropped from the master looks exactly like one the
            # translator added, so sync cannot simply keep every extra. The one
            # thing it can decide on its own is the invariant the English file
            # is now checked for: an alias that is another entry's own term
            # shadows it, and does so in every language. Those go.
            # The translator's own aliases are whatever is not, and was not,
            # English. Where a record predates `ena` there is no way to tell,
            # so everything unknown is kept — losing a translator's work is the
            # worse mistake of the two.
            was = set(t.get('ena', []))
            mine = [a for a in t.get('alias', [])
                    if a not in want and a != t['t'] and a not in keys and a not in was]
            merged = want + mine
            if merged != t.get('alias', []):
                # An entry whose alias list empties has to LOSE the key, not
                # keep the old one: assigning only when merged is truthy left
                # the stale list in place and made sync report the same entry
                # as changed on every run without ever changing it.
                if merged:
                    t['alias'] = merged
                else:
                    t.pop('alias', None)
                changed.append(t['t'])
            # Only stamp entries that have actually been translated; an
            # untranslated one still carries the English and is not stale.
            if t['g'] != src['g']:
                t.setdefault('en', stamp(src['g']))
                if src.get('alias'):
                    t['ena'] = list(src['alias'])
                else:
                    t.pop('ena', None)
        # Write on any change, not only an alias one: the fingerprints are the
        # point of the exercise and were being computed and thrown away.
        if json.dumps(d, ensure_ascii=False, sort_keys=True) != before:
            with open(p, 'w', encoding='utf-8') as fh:
                json.dump(d, fh, ensure_ascii=False, separators=(',', ':'))
            total += len(changed)
            print('  %-3s %s' % (code, ('%d entries picked up an English alias: %s'
                                        % (len(changed), ', '.join(changed[:4])))
                                 if changed else 'fingerprints recorded'))
        else:
            print('  %-3s already matches the master' % code)
    print('%d entries updated' % total)

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
        rec = {'t': src['t'], 'd': src['d'], 'g': gloss, 'en': stamp(src['g'])}
        # What the English aliases were at this moment. Without it, an alias the
        # master later drops is indistinguishable from one this translator
        # added, and sync has to keep both — which is how five locales went on
        # calling a matrix decomposition a QR code.
        if src.get('alias'):
            rec['ena'] = list(src['alias'])
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

def stale():
    """Translations made from an English sentence that has since been rewritten.

    This is the failure the fingerprint exists for. Correcting an English gloss
    leaves nine translations of the old one behind, and no other command will
    ever offer them again — `dump` only lists terms with no translation at all.
    It had happened four times here before anyone noticed: benchmark, tracker,
    KDE and QR, each caught by a person reading rather than by a tool.
    """
    import glob
    en = {t['t']: t for t in load_en()['terms']}
    total = 0
    for p in sorted(glob.glob('assets/data/glossary.*.json')):
        code = os.path.basename(p)[len('glossary.'):-len('.json')]
        if code == 'json' or '.' in code:
            continue
        d = json.load(open(p, encoding='utf-8'))
        out = []
        for t in d['terms']:
            src = en.get(t['t'])
            if not src or t['g'] == src['g']:
                continue        # untranslated, so not stale
            want = stamp(src['g'])
            if t.get('en') and t['en'] != want:
                out.append(t['t'])
        total += len(out)
        print('  %-3s %s' % (code, ', '.join(out) if out else 'up to date'))
    if total:
        print('\n%d translation(s) made from English that has since changed. '
              'Re-translate them; merge will restamp.' % total)
        sys.exit(1)
    print('\nEvery translation was made from the English that is there now.')


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
    elif cmd == 'sync':  sync()
    elif cmd == 'stale': stale()
    elif cmd == 'stat':  stat()
    else: sys.exit('usage: dump <code> | merge <code> | stat')
