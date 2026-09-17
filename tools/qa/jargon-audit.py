#!/usr/bin/env python3
"""Which acronyms on this site have nothing explaining them.

The plain-English layer only helps with words it has been given. Nothing warns
you when a page introduces an acronym the glossary has never heard of — the
layer simply does not mark it, which looks identical to a word that needed no
help. So this asks the question directly: walk the prose the layer is allowed
to mark, pull out every acronym, and list the ones with no gloss behind them.

    python3 tools/qa/jargon-audit.py           # the work list
    python3 tools/qa/jargon-audit.py --gate    # exit 1 if any remain

`--gate` is the version worth running in anger. The plain listing is for
working through the backlog, and prints each term with how often it appears and
where, so the common ones get written first.
"""
import collections
import glob
import html
import json
import os
import re
import sys

# Text the glossary layer refuses to mark, so an acronym living only here could
# not be explained even if it had a gloss. Mirrors SKIP and SKIP_CLASS in
# assets/js/glossary.js — if that list changes, this one has to follow.
SKIP_TAG = re.compile(r'(?is)<(code|pre|script|style|svg|noscript|textarea|samp|kbd)\b.*?</\1>')
SKIP_CLASS = re.compile(
    r'(?is)<([a-z]+)[^>]*class="[^"]*\b(mono|panel__title|spec__k|stat__k|term__title|kv__k|code)\b[^"]*"[^>]*>.*?</\1>')
TAG = re.compile(r'(?s)<[^>]+>')
# A hyphen inside a name belongs to the name: ARIA-INTEL is one thing, and
# splitting it invented an acronym called INTEL that appears nowhere.
ACRONYM = re.compile(r'(?<![A-Za-z0-9])([A-Z]{2,}[0-9+]*(?:-[A-Z0-9]+)*)(?![A-Za-z])')

# Capitals that are not acronyms. Three kinds, and each is a judgement someone
# made rather than a rule a machine can apply, so they are written down.
NOT_JARGON = set('''
AND OR NOT IF THEN ELSE ON OFF YES NO ALL ANY NEW OLD MAX MIN TEMP TEST
PAGE FAULT MISS MAP POWER SELF INIT HANDOFF HARDWARE BOOT SEQUENCE SYSTEM
LITTLE PRECISION FLASH STABLE STEP DONE FAIL PASS OK TODO NOTE WARNING
STOP START READ WRITE OPEN CLOSE SEND RECV FREE BUSY IDLE LIVE DEAD
UNCLASSIFIED SECRET APEX PRO PLUS CORE EDGE HOST GUEST USER ROOT
US UK UN EU NZ AU NATO WWII II III IV VI VII VIII IX XI XII
BY SA MO TU WE TH FR SU AM PM GMT UTC AEST
'''.split())


def prose(path):
    s = open(path, encoding='utf-8').read()
    m = re.search(r'(?is)<main\b[^>]*>(.*)</main>', s)
    s = m.group(1) if m else s
    s = SKIP_TAG.sub(' ', s)
    s = SKIP_CLASS.sub(' ', s)
    return html.unescape(TAG.sub(' ', s))


def known_terms():
    d = json.load(open('assets/data/glossary.json', encoding='utf-8'))
    out = set()
    for t in d['terms']:
        out.add(t['t'].upper())
        for a in t.get('alias', []):
            out.add(a.upper())
    return out


def main():
    # Piping this into head is the normal way to read it.
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (ImportError, AttributeError, ValueError):
        pass
    os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    known = known_terms()
    pages = [f for f in sorted(glob.glob('*.html')) if f != '404.html']
    pages += sorted(glob.glob('research/*.html'))

    seen = collections.Counter()
    where = collections.defaultdict(set)
    for f in pages:
        for m in ACRONYM.finditer(prose(f)):
            w = m.group(1)
            # AGPL-3.0+ arrives here as "AGPL-3", so a version suffix must not
            # hide the fact that AGPL itself is already explained.
            base = re.match(r'[A-Z]+', w).group(0)
            if {w.upper(), base} & (known | NOT_JARGON):
                continue
            seen[w] += 1
            where[w].add(f)

    total = sum(seen.values())
    print('  %d pages, %d glossary terms, %d acronyms with no gloss (%d mentions)'
          % (len(pages), len(known), len(seen), total))
    if not seen:
        print('\nEvery acronym in markable prose has something explaining it.')
        return
    gate = '--gate' in sys.argv
    print()
    for w, n in seen.most_common():
        pp = sorted(where[w])
        print('  %-14s %4d  %s%s' % (w, n, ', '.join(pp[:3]),
                                     ' +%d' % (len(pp) - 3) if len(pp) > 3 else ''))
    if gate:
        sys.exit(1)


if __name__ == '__main__':
    main()
