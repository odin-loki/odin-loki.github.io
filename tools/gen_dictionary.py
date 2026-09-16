# -*- coding: utf-8 -*-
"""
Build the lazy dictionary shards from WordNet 3.1.

    python3 tools/gen_dictionary.py /path/to/wordnet/dict

WordNet is the source because its glosses are short, modern and written to be
read. Webster's 1913 is the other free option and it defines anopheles as "a
genus of mosquitoes which are secondary hosts of the malaria parasites" — which
is not what a plain-English layer is for.

Output is one shard per first letter in assets/data/dict/, each a sorted word
list plus a parallel gloss list. The trie is built in the browser from the
sorted list rather than serialised: a nested-object trie in JSON is several
times the size of the words it holds, and building one from 5,000 sorted words
takes about a millisecond. See assets/js/dictionary.js.

Licence: WordNet 3.1, Princeton University. Free for any use with the
copyright notice preserved — see assets/data/dict/LICENSE.
"""
import json, os, re, sys, collections

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/wn/dict'
OUT = 'assets/data/dict'
POS = {'noun': 'n', 'verb': 'v', 'adj': 'a', 'adv': 'r'}
MAX_GLOSS = 140

def parse_data(path):
    """offset -> gloss, from a WordNet data.* file."""
    out = {}
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if line.startswith('  '):
                continue
            head, _, gloss = line.partition(' | ')
            if not gloss:
                continue
            out[head[:8]] = gloss.strip()
    return out

def clean(gloss):
    # Drop the usage examples — they are quoted and come after the definition.
    gloss = re.sub(r';\s*"[^"]*"', '', gloss).strip().rstrip(';').strip()
    # WordNet writes some glosses as "(chiefly British) ..." — keep it, it is short.
    if len(gloss) > MAX_GLOSS:
        cut = gloss.rfind(';', 0, MAX_GLOSS)
        gloss = (gloss[:cut] if cut > 40 else gloss[:MAX_GLOSS].rsplit(' ', 1)[0]) + '…'
    return gloss

def main():
    if not os.path.isdir(SRC):
        sys.exit('WordNet dict directory not found: ' + SRC)

    glosses = {}
    for name, tag in POS.items():
        p = os.path.join(SRC, 'data.' + name)
        if os.path.exists(p):
            for off, g in parse_data(p).items():
                glosses[(tag, off)] = g

    # index.* lists each lemma's synsets in order of how often that sense is
    # used, so the first offset is the sense a reader most likely means.
    words = {}
    for name, tag in POS.items():
        p = os.path.join(SRC, 'index.' + name)
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                if line.startswith('  '):
                    continue
                parts = line.split()
                if len(parts) < 6:
                    continue
                lemma = parts[0].replace('_', ' ')
                if not re.match(r"^[a-z][a-z' .-]*$", lemma) or len(lemma) < 2:
                    continue
                if lemma.count(' ') > 2:
                    continue
                g = clean(glosses.get((tag, parts[-1]), ''))
                if not g or len(g) < 8:
                    continue
                # Keep the first part of speech that defines it; nouns win ties
                # because index files are read noun, verb, adj, adv.
                if lemma not in words:
                    words[lemma] = (g, tag)

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.json'):
            os.remove(os.path.join(OUT, f))

    # First-letter shards, then split any that are too fat by their second
    # letter. "s" alone is 1.2 MB, which is not a lazy fetch on a phone.
    TARGET = 220 * 1024
    first = collections.defaultdict(list)
    for w in sorted(words):
        first[w[0] if w[0].isalpha() else '_'].append(w)

    def weight(ws):
        return sum(len(w) + len(words[w][0]) + 6 for w in ws)

    shards = {}
    for letter, ws in first.items():
        if weight(ws) <= TARGET or len(ws) < 400:
            shards[letter] = ws
            continue
        sub = collections.defaultdict(list)
        for w in ws:
            c = w[1] if len(w) > 1 and w[1].isalpha() else '_'
            sub[letter + c].append(w)
        # Recombine tiny neighbours so one letter does not explode into 27 files.
        run, acc = [], []
        for key in sorted(sub):
            acc.extend(sub[key]); run.append(key)
            if weight(acc) >= TARGET * 0.6:
                shards[run[0] + '-' + run[-1][-1] if len(run) > 1 else run[0]] = acc
                run, acc = [], []
        if acc:
            shards[run[0] + '-' + run[-1][-1] if len(run) > 1 else run[0]] = acc

    manifest, total = {}, 0
    for letter, ws in sorted(shards.items()):
        payload = {'w': ws,
                   'g': [words[w][0] for w in ws],
                   'p': ''.join(words[w][1] for w in ws)}
        path = os.path.join(OUT, letter + '.json')
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))
        size = os.path.getsize(path)
        total += size
        manifest[letter] = {'n': len(ws), 'bytes': size}
        print('  %s  %6d words  %6.1f KB' % (letter, len(ws), size / 1024))

    # The client needs to know which shard holds a given word without guessing,
    # so publish each shard's inclusive first/last word.
    for name in manifest:
        ws = shards[name]
        manifest[name]['lo'] = ws[0]
        manifest[name]['hi'] = ws[-1]

    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump({'source': 'WordNet 3.1, Princeton University',
                   'shards': manifest,
                   'words': len(words),
                   'bytes': total}, fh, separators=(',', ':'))
    print('  %d words, %.1f MB across %d shards' % (len(words), total / 1048576, len(shards)))

if __name__ == '__main__':
    main()
