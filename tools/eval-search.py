import json, math, re, collections, subprocess, sys, html as _html, os
sys.path.insert(0, 'tools')

GOLD = [
 ("hide who is talking to whom", "/aegis.html"),
 ("the thing that finds patterns in crime data", "/sentinel.html"),
 ("memory safe operating system", "/pbsd.html"),
 ("maths library for c++", "/mathscript.html"),
 ("work out what a program does without source code", "/retdec.html"),
 ("an ai that keeps learning", "/cypha.html"),
 ("play chess against the model", "/chess.html"),
 ("what does it cost to use commercially", "/licensing.html"),
 ("how do i become a beta tester", "/beta.html"),
 ("back the crowdfunding campaign", "/kickstarter.html"),
 ("who built this and how do i contact them", "/about.html"),
 ("reaction diffusion sequence model", "/cellai.html"),
 ("traffic analysis resistance", "/aegis.html"),
 ("geographic profiling hotspots", "/sentinel.html"),
 ("capability security kernel", "/pbsd.html"),
]

def stem(w):
    if len(w)>4 and w.endswith('ies'): return w[:-3]+'y'
    if len(w)>4 and w.endswith('sses'): return w[:-2]
    if len(w)>4 and w.endswith('ally'): return w[:-4]+'al'
    if len(w)>4 and w.endswith('ly'): return w[:-2]
    if len(w)>5 and w.endswith('ing'):
        b=w[:-3]; return b[:-1] if len(b)>3 and b[-1]==b[-2] else b
    if len(w)>4 and w.endswith('ed'):
        b=w[:-2]; return b[:-1] if len(b)>3 and b[-1]==b[-2] else b
    if len(w)>3 and w.endswith('s') and not w.endswith('ss'): return w[:-1]
    return w

def evaluate(path):
    d = json.load(open(path))
    idf = d['idf']
    pages = {p['u']: p['v'] for p in d['pages']}
    mult = {p['u']: (d.get('boost',1.0) if p.get('m') else 1.0) for p in d['pages']}
    top1 = top3 = 0
    misses = []
    for q, want in GOLD:
        toks = [stem(w) for w in re.findall(r"[a-z][a-z'+-]+", q.lower())]
        v = {}
        for t in toks:
            if t in idf: v[t] = v.get(t, 0) + idf[t]
        n = math.sqrt(sum(x*x for x in v.values())) or 1
        v = {k: x/n for k, x in v.items()}
        scored = sorted(((sum(x*pages[u].get(k,0) for k,x in v.items())*mult[u], u) for u in pages), reverse=True)
        names = [u for _, u in scored[:3]]
        if names and names[0] == want: top1 += 1
        elif want in names: top3 += 1; misses.append((q, names[0], 'in top3'))
        else: misses.append((q, names[0] if names else '-', 'MISS'))
    return top1, top1+top3, misses

if __name__ == '__main__':
    t1, t3, miss = evaluate('assets/data/voice-index.json')
    print('  top-1 %d/%d   top-3 %d/%d' % (t1, len(GOLD), t3, len(GOLD)))
    for q, got, how in miss:
        print('    %-46s -> %-24s %s' % (q[:46], got, how))
