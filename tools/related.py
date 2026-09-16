# -*- coding: utf-8 -*-
"""
The "Related reading" block, written into the page instead of onto it.

    python3 tools/related.py cache        # every page, every language, one run

Four semantically nearest pages, chosen by term overlap, are the best
navigation this site has — and until now they existed only inside
similar.js. A crawler never saw them. A reader with JavaScript off never saw
them. On the forty-six research ledgers that mattered most: the whole
crawlable link graph out of an article was the shelf and the licence page,
two links, because the four good ones were in a script.

The neighbours are already computed offline by tools/gen_voice_index.py, so
nothing new is calculated here — this only reads what is in the index and
emits the same markup similar.js would have built. That script still runs
and still bails out when it finds the block already present, so a page keeps
working either way.

The build therefore runs twice: once to make the pages, then the index over
them, then again to fold the neighbours in. gen_voice_index.py strips this
block before reading a page, so the second pass cannot feed itself.
"""
import html, json, os, sys

def catalogue(code):
    p = 'assets/i18n/%s.json' % code
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}

def index(code):
    p = 'assets/data/voice-index.json' if code == 'en' else 'assets/data/voice-index.%s.json' % code
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None

def block(url, code):
    idx = index(code)
    if not idx:
        return ''
    page = next((p for p in idx['pages'] if p['u'] == url), None)
    if not page or not page.get('n'):
        return ''
    t = catalogue(code)
    e = html.escape

    out = ['<section class="section section--tight related">', '  <div class="wrap">',
           '    <div class="section-head" style="margin-bottom:1.5rem">',
           '      <span class="eyebrow">%s</span>' % e(t.get('related.eyebrow', 'Closest on this site')),
           '      <h2 style="font-size:clamp(1.2rem,2.2vw,1.6rem)">%s</h2>'
           % e(t.get('related.title', 'Related reading')),
           '    </div>', '    <div class="grid grid-2">']
    for n in page['n']:
        out.append('      <a class="card card--hover related__item" href="%s">' % e(n['u']))
        out.append('        <div class="card__glow"></div>')
        out.append('        <h3 style="font-size:.98rem;margin:0">%s</h3>' % e(n['t']))
        out.append('      </a>')
    out += ['    </div>',
            '    <p class="tiny muted" style="margin-top:14px">%s</p>'
            % e(t.get('related.note', '')),
            '  </div>', '</section>']
    return '\n'.join(out) + '\n'

CACHE = '.cache/related'

def cache():
    """One block per page, on disk, for the builder to paste in.

    The builder is a shell script and this is Python, so calling it per page
    meant 196 interpreter starts per pass, each re-reading a 280 KB index —
    it turned a four-second build into minutes. One run writes them all."""
    locales = [l['code'] for l in
               json.load(open('tools/locales.json', encoding='utf-8'))['locales']]
    n = 0
    for code in locales:
        idx = index(code)
        if not idx:
            continue
        for p in idx['pages']:
            url = p['u']
            pre = '' if code == 'en' else '/' + code
            slug = url[len(pre):].lstrip('/')
            slug = 'index' if slug in ('', 'index.html') else slug[:-5]
            path = os.path.join(CACHE, code, slug + '.html')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(block(url, code))
            n += 1
    print('  related: %d blocks cached across %d languages' % (n, len(locales)))

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'cache':
        cache()
    else:
        sys.stdout.write(block(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'en'))
