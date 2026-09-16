# -*- coding: utf-8 -*-
"""
Build the voice navigation index.

    python3 tools/gen_voice_index.py

Speech recognition gives you a rough transcript, not a command. Somebody who
cannot see the screen says "take me to the thing that finds patterns in crime
data" and means /sentinel.html. Matching that needs to know what each page is
about, which is a retrieval problem, so this builds the retrieval side offline.

Each page becomes a TF-IDF vector over the site's own vocabulary, projected
down to 64 dimensions by a seeded random projection (Johnson-Lindenstrauss —
distances survive the squash, and 61 x 64 floats is 30 KB instead of 61 x 9000).
The IDF table ships too, so a spoken query can be encoded the same way in the
browser and compared by cosine.

No language model is involved and none is downloaded. The vectors come from the
site's own words and the dictionary's glosses, so the whole thing is
reproducible from this repository.
"""
import json, math, os, re, collections, random

OUT   = 'assets/data/voice-index.json'
DIM   = 64
SEED  = 20260916
STOP  = set('''a an and are as at be been but by for from has have how i if in into is it its
of on or that the their then there these they this to was were what when where which who will
with you your not no can could would should do does did just very more most some such own same
than too s t are our we us he she his her them'''.split())

def text_of(path):
    html = open(path, encoding='utf-8', errors='replace').read()
    html = re.sub(r'(?is)<(script|style|svg)\b.*?</\1>', ' ', html)
    body = re.search(r'(?is)<main\b.*?>(.*)</main>', html)
    html = body.group(1) if body else html
    html = re.sub(r'(?s)<[^>]+>', ' ', html)
    html = re.sub(r'&[a-z]+;|&#\d+;', ' ', html)
    return html

def tokens(s):
    # Two-letter words are kept. "AI" is dropped by the usual len > 2 rule, and
    # on this site that is the single most likely thing somebody says out loud.
    return [w for w in re.findall(r"[a-z][a-z'+-]+", s.lower()) if w not in STOP]

def main():
    pages = []
    for f in sorted(os.listdir('.')):
        if f.endswith('.html') and f != '404.html':
            pages.append(f)
    for f in sorted(os.listdir('research')):
        if f.endswith('.html'):
            pages.append('research/' + f)

    docs, titles = {}, {}
    for p in pages:
        html = open(p, encoding='utf-8', errors='replace').read()
        m = re.search(r'(?is)<title>(.*?)</title>', html)
        titles[p] = re.sub(r'\s*\|\s*Imortek.*$', '', m.group(1)).strip() if m else p

        c = collections.Counter(tokens(text_of(p)))
        # Somebody asking out loud for "the kickstarter" means the page called
        # Kickstarter, not the homepage that happens to mention it. Titles and
        # headings say what a page IS; body text only says what it mentions.
        c.update({w: 6 for w in tokens(titles[p])})
        for tag, boost in (('h1', 4), ('h2', 2)):
            for h in re.findall(r'(?is)<' + tag + r'\b[^>]*>(.*?)</' + tag + '>', html):
                c.update({w: boost for w in tokens(re.sub(r'(?s)<[^>]+>', ' ', h))})
        docs[p] = c

    df = collections.Counter()
    for p in docs:
        df.update(docs[p].keys())
    # Drop the very rare and the near-universal: neither helps tell pages apart.
    vocab = sorted(w for w, n in df.items() if 2 <= n <= len(docs) * 0.6)
    idf = {w: math.log(len(docs) / df[w]) for w in vocab}
    vi = {w: i for i, w in enumerate(vocab)}

    # No random projection. A spoken query is two or three words, which is far
    # too sparse for a Johnson-Lindenstrauss squash to mean anything — the
    # projection of a 2-term vector is mostly hash collisions, and the first
    # attempt duly matched "the operating system" to AEGIS.
    #
    # Instead each page keeps its strongest TF-IDF terms and the cosine is
    # computed in term space, exactly. Sparse, small, and interpretable: you
    # can read why a page matched.
    TOP = 90

    def vector(counter):
        v = {}
        for w, n in counter.items():
            if w in idf:
                v[w] = (1 + math.log(n)) * idf[w]
        top = sorted(v.items(), key=lambda kv: -kv[1])[:TOP]
        norm = math.sqrt(sum(x * x for _, x in top)) or 1.0
        return {w: round(x / norm, 4) for w, x in top}

    out = {'top': TOP,
           'idf': {w: round(idf[w], 3) for w in vocab},
           'pages': [{'u': '/' + p if p != 'index.html' else '/',
                      't': titles[p],
                      'v': vector(docs[p])} for p in pages]}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print('  %d pages, %d vocab terms, top %d terms each -> %.1f KB'
          % (len(pages), len(vocab), TOP, os.path.getsize(OUT) / 1024))

if __name__ == '__main__':
    main()
