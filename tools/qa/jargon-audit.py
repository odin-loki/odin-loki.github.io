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
# Mirrors SKIP in assets/js/glossary.js, which is why a, button, h1 and summary
# are in here: the layer will not mark inside a link or a heading, so an
# acronym that only ever appears in one is not a backlog item — it is out of
# reach, and reporting it made the research shelf look far worse than it is.
SKIP_TAG = re.compile(
    r'(?is)<(code|pre|script|style|svg|noscript|textarea|samp|kbd|a|button|h1|summary)\b.*?</\1>')
SKIP_CLASS = re.compile(
    r'(?is)<([a-z]+)[^>]*class="[^"]*\b(mono|panel__title|spec__k|stat__k|term__title|kv__k|code)\b[^"]*"[^>]*>.*?</\1>')
TAG = re.compile(r'(?s)<[^>]+>')
# A hyphen inside a name belongs to the name: ARIA-INTEL is one thing, and
# splitting it invented an acronym called INTEL that appears nowhere.
# A hyphen inside a name belongs to the name: ARIA-INTEL is one thing, and
# splitting it invented an acronym called INTEL that appears nowhere. A
# subscript belongs to it too — VO\u2082 is not a term called VO.
SUB = '\u2070-\u209f\u00b2\u00b3\u00b9'
# A dot inside a designation belongs to it: without this the audit reads
# "MP-4.6P Guardian LE" as the acronym MP-4, reports it as unexplained, and the
# note recording the exception says "a bare table cell, not a term in prose",
# which is wrong twice over. A dot at the end of a sentence is followed by a
# space, so it cannot pull the next word in.
ACRONYM = re.compile(
    r'(?<![A-Za-z0-9])([A-Z]{2,}[0-9+]*(?:[-.][A-Z0-9]+)*)(?![A-Za-z' + SUB + r'])')

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

# A fourth kind, kept apart because each needs its own sentence: capitals that
# only look like an acronym once the markup has been taken out from between
# them. Stripping tags is what lets the audit read a page the way the glossary
# matcher does, and it is also what welds two symbols into a word.
NOT_ACRONYM = {
    'AD': 'the adjacency and degree matrices standing next to each other in '
          'D<sup>\u2212\u00bd</sup>AD<sup>\u2212\u00bd</sup> on research/qgo.html, which is a Laplacian, not a word',
}
NOT_JARGON |= set(NOT_ACRONYM)


# Acronyms this site names but never explains, anywhere. These are not a backlog
# item — there is nothing honest to write, because the source does not say. They
# are listed rather than quietly skipped, because the right fix is on the page:
# either say what the thing is where it is named, or stop naming it.
NO_SOURCE = {
    'BIFROST': 'pbsd.html lists it among the C++23 modules and nothing says what it does',
    'UDA':     'same list, same problem',
    'FAC':     'never stands alone — it only occurs inside K-FAC, so a gloss would '
               'light up on half a word',
    'LE':      'four mentions on research/weapons-police.html, all of them the '
               'product name "Guardian LE", with nothing saying what the two '
               'letters mark',
    'QTR':     'research/hybrid-components.html has a table row "QTR alpha constant '
               'error" and never says what QTR is',
    'PC':      'the program counter, already carried as an alias of SP',
    'ID':      'only ever inside re-ID, already an alias of re-identification',
    'ECE':     'research/gf2-algebra.html names "Paper 7\'s ECE relationship" and the '
               'paper is not on the site, so nothing here says what ECE is',
    'AMS':     'only ever Verilog-AMS, which is glossed under that name',
    'MP-4.6P': 'the model designation of the pistol research/weapons-police.html '
               'is about, in prose, and the page never says what MP stands for',
}


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


def senses():
    """Every term that appears on more than one page, with the sentence it lands
    in on each.

    Three separate readers found three terms carrying two unrelated meanings on
    this site — NMP is a way of scoring a compressor and also a solvent, KDE is
    a Linux desktop and also a way of smoothing dots into a heat map, QR was
    glossed as the code a phone camera reads when every use here is the matrix
    one. Each was found by reading the word in context, which is luck. This
    prints the contexts so it is a skim instead.

        python3 tools/qa/jargon-audit.py --senses | less
    """
    known = {}
    for t in json.load(open('assets/data/glossary.json', encoding='utf-8'))['terms']:
        for form in [t['t']] + t.get('alias', []):
            known.setdefault(form, t['t'])
    pages = [f for f in sorted(glob.glob('*.html')) if f != '404.html']
    pages += sorted(glob.glob('research/*.html'))
    bodies = [(f, re.sub(r'\s+', ' ', prose(f))) for f in pages]

    for form in sorted(known, key=lambda x: (-len(x), x)):
        if not re.fullmatch(r'[A-Z][A-Za-z0-9+\-/]{1,9}', form):
            continue
        hits = []
        rx = re.compile(r'(?<![\w-])' + re.escape(form) + r'(?![\w-])')
        for f, body in bodies:
            m = rx.search(body)
            if m:
                hits.append((f, body[max(0, m.start() - 55):m.end() + 45].strip()))
        if len(hits) > 1:
            print('%s  (%s)' % (form, known[form]))
            for f, ctx in hits[:6]:
                print('    %-34s ...%s...' % (f, ctx))
            print()


def main():
    # Piping this into head is the normal way to read it.
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (ImportError, AttributeError, ValueError):
        pass
    os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    if '--senses' in sys.argv:
        senses()
        return
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
            if {w.upper(), base} & (known | NOT_JARGON | set(NO_SOURCE)):
                continue
            seen[w] += 1
            where[w].add(f)

    total = sum(seen.values())
    print('  %d pages, %d glossary terms, %d acronyms with no gloss (%d mentions)'
          % (len(pages), len(known), len(seen), total))
    if NO_SOURCE:
        print('  %d named but never explained anywhere on the site:' % len(NO_SOURCE))
        for w in sorted(NO_SOURCE):
            print('      %-9s %s' % (w, NO_SOURCE[w]))
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
