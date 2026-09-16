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
import json, math, os, re, sys, collections, random, unicodedata, html as _html

OUT   = 'assets/data/voice-index.json'
DIM   = 64
SEED  = 20260916
STOP  = set('''a an and are as at be been but by for from has have how i if in into is it its
of on or that the their then there these they this to was were what when where which who will
with you your not no can could would should do does did just very more most some such own same
than too s t are our we us he she his her them'''.split())

# The related block is now written into the page by the builder, from this
# very index. Reading it back would let a page's neighbours become part of
# what the page is about, and the two passes would chase each other. Strip it.
RELATED = re.compile(r'(?is)<section class="section section--tight related">.*?</section>')

def text_of(path):
    html = open(path, encoding='utf-8', errors='replace').read()
    html = re.sub(r'(?is)<(script|style|svg)\b.*?</\1>', ' ', html)
    html = RELATED.sub(' ', html)
    body = re.search(r'(?is)<main\b.*?>(.*)</main>', html)
    html = body.group(1) if body else html
    html = re.sub(r'(?s)<[^>]+>', ' ', html)
    html = re.sub(r'&[a-z]+;|&#\d+;', ' ', html)
    return html

def stem(w):
    """A deliberately small stemmer, mirrored exactly in assets/js/similar.js
    and assets/js/voice.js. Without it "commercially" never reaches the page
    that says "commercial", which is the whole question somebody is asking."""
    if len(w) > 4 and w.endswith('ies'):  return w[:-3] + 'y'
    if len(w) > 4 and w.endswith('sses'): return w[:-2]
    if len(w) > 4 and w.endswith('ally'): return w[:-4] + 'al'
    if len(w) > 4 and w.endswith('ly'):   return w[:-2]
    if len(w) > 5 and w.endswith('ing'):
        b = w[:-3]
        return b[:-1] if len(b) > 3 and b[-1] == b[-2] else b
    if len(w) > 4 and w.endswith('ed'):
        b = w[:-2]
        return b[:-1] if len(b) > 3 and b[-1] == b[-2] else b
    if len(w) > 3 and w.endswith('s') and not w.endswith('ss'): return w[:-1]
    return w

def tokens_en(s):
    # Two-letter words are kept. "AI" is dropped by the usual len > 2 rule, and
    # on this site that is the single most likely thing somebody says out loud.
    return [stem(w) for w in re.findall(r"[a-z][a-z'+-]+", s.lower()) if w not in STOP]

tokens = tokens_en

# Scripts with no space between words. Chinese is the one here; a whitespace
# tokeniser returns one enormous token per sentence and the index is useless.
CJK = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]')

# Where one word ends and the next begins, for a script this file knows
# nothing else about. Everything that is a separator, punctuation mark, symbol,
# digit or control character breaks a word; everything else continues one.
#
# The obvious \w+ cannot be used. Python counts a Devanagari vowel sign as a
# non-word character, so \w+ turns "ऑपरेटिंग" into ['ऑपर', 'ट', 'ग'] — the word
# is shredded at every mark, and the Hindi index came out with 23 usable terms
# in it. Combining marks are part of the word. This keeps them.
_SEP = {}

def _is_sep(ch):
    v = _SEP.get(ch)
    if v is None:
        v = unicodedata.category(ch)[0] in 'ZPSNC' or ch == '_'
        _SEP[ch] = v
    return v

def word_tokens(s):
    out, buf = [], []
    for ch in s:
        if _is_sep(ch):
            if buf:
                out.append(''.join(buf))
                buf = []
        else:
            buf.append(ch)
    if buf:
        out.append(''.join(buf))
    return out

def tokens_i18n(s):
    """Tokens for a language that is not English.

    No stemming. The English stemmer turns Spanish "ambientales" into
    "ambiental" by luck and Russian "операционная" into nothing at all, and a
    wrong stem is worse than none: it silently merges words that are not the
    same. What does carry across is the shape of the problem — a term that
    appears in one page and not the others is still the discriminating one —
    so TF-IDF works unchanged over raw word forms.

    Words are lower-cased and kept whole, combining marks included — see
    word_tokens above for why that needs saying. Han characters are indexed as
    overlapping bigrams, which is the standard trick for a language that does
    not write spaces and is enough to tell 操作系统 from 反编译器.
    """
    s = s.lower()
    out = [w for w in word_tokens(s)
           if len(w) > 1 and not CJK.search(w) and w not in STOP]
    for run in re.findall(r'[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]+', s):
        out.extend(run[i:i + 2] for i in range(len(run) - 1))
        if len(run) == 1:
            out.append(run)
    return out

def main(code='en'):
    """Build the index for one language tree.

    English lives at the root and indexes everything. Another locale indexes
    its own fifteen pages plus the English research shelf: a research ledger
    is not translated, but its product names and its numbers are the same in
    every language, so leaving it out would mean a reader searching in Spanish
    could never reach it at all. It stays flagged as non-core, so the pages
    that do speak the reader's language rank ahead of it.
    """
    global tokens
    root = '' if code == 'en' else code + '/'
    tokens = tokens_en if code == 'en' else tokens_i18n
    pages = []
    src = {}          # url path -> file on disk
    base = code if code != 'en' else '.'
    for f in sorted(os.listdir(base)):
        if f.endswith('.html') and f != '404.html':
            pages.append(root + f)
            src[root + f] = os.path.join(base, f)
    for f in sorted(os.listdir('research')):
        if f.endswith('.html'):
            pages.append('research/' + f)
            src['research/' + f] = 'research/' + f

    docs, titles = {}, {}
    for p in pages:
        html = open(src[p], encoding='utf-8', errors='replace').read()
        m = re.search(r'(?is)<title>(.*?)</title>', html)
        titles[p] = _html.unescape(re.sub(r'\s*\|\s*Imortek.*$', '', m.group(1))).strip() if m else p

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
    # Drop only what appears once — a typo or a one-off is not a search term.
    # The near-universal used to be cut here too, at 60% of pages, which threw
    # away "commercial" on a site where every product page mentions it and left
    # "what does it cost to use commercially" with nothing to match on. IDF
    # already discounts common words; cutting them as well was doing it twice.
    vocab = sorted(w for w, n in df.items()
                   if n >= 2 and n <= len(docs) * float(os.environ.get('VI_DF', '0.99')))
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
    TOP = int(os.environ.get('VI_TOP', '200'))

    def vector(counter):
        v = {}
        for w, n in counter.items():
            if w in idf:
                v[w] = (1 + math.log(n)) * idf[w]
        top = sorted(v.items(), key=lambda kv: -kv[1])[:TOP]
        norm = math.sqrt(sum(x * x for _, x in top)) or 1.0
        return {w: round(x / norm, 4) for w, x in top}

    # Nearest neighbours, so every page can point at what it is actually
    # closest to rather than at a hand-maintained "see also" list that rots.
    vecs = {pg: vector(docs[pg]) for pg in pages}
    def cos(a, b):
        return sum(v * b[w] for w, v in a.items() if w in b)
    # Hubness correction. The homepage and the campaign page mention every
    # product, so raw cosine makes them everyone's nearest neighbour, which is
    # useless as a "see also". Subtracting each page's mean similarity to the
    # whole corpus leaves what is distinctively close.
    # Wayfinding pages are never a "see also". They exist to send you somewhere
    # else, so they mention everything and would otherwise be everyone's
    # nearest neighbour. They stay in the search index; they just stop being
    # suggested as related reading.
    HUBS = set(root + h for h in ('index.html', 'beta.html', 'kickstarter.html',
                                  'licensing.html', 'about.html', 'research.html',
                                  '404.html'))
    targets = [p for p in pages if p not in HUBS]

    sim = {a: {b: cos(vecs[a], vecs[b]) for b in targets if b != a} for a in pages}
    hub = {b: sum(sim[a][b] for a in pages if a != b) / max(1, len(pages) - 1) for b in targets}
    near = {}
    for a in pages:
        scored = sorted(((sim[a][b] - hub[b], sim[a][b], b) for b in targets if b != a), reverse=True)
        near[a] = [{'u': '/' + b if b != root + 'index.html' else '/' + root,
                    't': titles[b], 's': round(raw, 3)}
                   for adj, raw, b in scored[:4] if adj > 0.01]

    out = {'top': TOP,
           'idf': {w: round(idf[w], 3) for w in vocab},
           'boost': float(os.environ.get('VI_BOOST', '1.35')),
           'pages': [{'u': '/' + p if p != root + 'index.html' else '/' + root,
                      't': titles[p],
                      'v': vecs[p],
                      'm': 0 if p.startswith('research/') else 1,
                      'n': near[p]} for p in pages]}

    path = OUT if code == 'en' else OUT.replace('.json', '.%s.json' % code)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, separators=(',', ':'), ensure_ascii=False)
    print('  %-3s %3d pages, %5d vocab terms -> %6.1f KB'
          % (code, len(pages), len(vocab), os.path.getsize(path) / 1024))

if __name__ == '__main__':
    codes = sys.argv[1:]
    if not codes:
        codes = ['en'] + [l['code'] for l in
                          json.load(open('tools/locales.json', encoding='utf-8'))['locales']
                          if not l.get('root') and os.path.isdir(l['code'])]
    for c in codes:
        main(c)
