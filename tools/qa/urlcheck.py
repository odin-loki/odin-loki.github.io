#!/usr/bin/env python3
"""Every URL this site publishes, checked against the site it actually serves.

Search Console reports "Page with redirect" when it crawls a URL that 301s
somewhere else. Most of the time that is the old address of a site that moved
and it is the move working correctly — odin-loki.github.io redirecting to
imortek.com.au is supposed to happen. What is NOT supposed to happen is the
site pointing at its own redirects: a sitemap entry that bounces, a link with a
missing trailing slash, a canonical that disagrees with the sitemap. Those are
self-inflicted and this catches them.

    python3 tools/qa/urlcheck.py           # offline: links, canonicals, sitemap
    python3 tools/qa/urlcheck.py --live    # also fetch every URL for real

GitHub Pages serves a directory only at its trailing-slash form. A link to
/zh gets a 301 to /zh/, so the offline pass treats a missing slash as an error
even though a browser would follow it — a crawler counts the hop.
"""
import os
import re
import sys
import glob
import subprocess
import concurrent.futures

SITE = 'https://imortek.com.au'
LEGACY = 'https://odin-loki.github.io'
HREF = re.compile(r'(?:href|action)="(/[^"]*)"')
CANON = re.compile(r'<link rel="canonical" href="([^"]+)"')
LOC = re.compile(r'<loc>([^<]+)</loc>')
ASSET = re.compile(r'\.(css|js|json|svg|png|jpe?g|webp|ico|txt|xml|woff2?|mp4|webm|wasm)$')


# The page bodies under src/ are inputs, not pages. They have no head, no
# canonical and no address, and counting them would report fifteen problems
# that are the build working as designed.
SRC = ('src/', 'node_modules/', '.cache/', 'tools/')

def pages():
    out = []
    for pat in ('*.html', '*/*.html', '*/*/*.html'):
        out += glob.glob(pat)
    return sorted(p for p in out
                  if not p.startswith('.') and not p.startswith(SRC))


def serves(path):
    """Does GitHub Pages serve this path without a redirect?"""
    p = path.split('#')[0].split('?')[0]
    if p.endswith('/'):
        return os.path.isfile(p.lstrip('/') + 'index.html') or p == '/'
    if os.path.isfile(p.lstrip('/')):
        return True
    # A bare directory is the one shape that costs a redirect.
    return None if os.path.isdir(p.lstrip('/')) else False


def offline():
    problems = []
    all_pages = pages()

    # 1. Every internal link resolves to something served directly.
    seen = {}
    for f in all_pages:
        for u in set(HREF.findall(open(f, encoding='utf-8').read())):
            seen.setdefault(u, f)
    for u, first in sorted(seen.items()):
        got = serves(u)
        if got is None:
            problems.append('link %s needs a redirect to %s/ (first in %s)' % (u, u, first))
        elif got is False:
            problems.append('link %s resolves to nothing on disk (first in %s)' % (u, first))

    # 2. The sitemap and the canonicals have to be the same claim.
    if not os.path.isfile('sitemap.xml'):
        return problems + ['no sitemap.xml']
    locs = LOC.findall(open('sitemap.xml', encoding='utf-8').read())
    if len(locs) != len(set(locs)):
        problems.append('sitemap lists %d URLs but only %d are distinct'
                        % (len(locs), len(set(locs))))
    locset = set(locs)

    for u in sorted(locset):
        path = u[len(SITE):] or '/'
        if serves(path) is not True:
            problems.append('sitemap URL %s does not resolve to a served file' % u)

    canon_of = {}
    for f in all_pages:
        m = CANON.search(open(f, encoding='utf-8').read())
        if not m:
            problems.append('%s has no canonical' % f)
            continue
        canon_of[f] = m.group(1)

    # A page in the sitemap must name itself as canonical, and a page that
    # names a canonical other than itself must not be in the sitemap twice.
    for f, c in sorted(canon_of.items()):
        # Every 404 is noindex and deliberately absent from the sitemap.
        if os.path.basename(f) == '404.html':
            continue
        expect = SITE + '/' + f
        if f.endswith('index.html'):
            expect = SITE + '/' + f[:-len('index.html')]
        if c == expect and c not in locset:
            problems.append('%s is canonical for itself but missing from the sitemap' % f)
        if c != expect and c in locset and expect in locset:
            problems.append('%s points its canonical at %s, and both are in the sitemap' % (f, c))
    return problems


def head(url, tries=2):
    """Twelve requests at once occasionally loses one to a timeout. A single
    retry is the difference between a gate that means something and a gate
    everyone learns to ignore."""
    for attempt in range(tries):
        try:
            out = subprocess.run(
                ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}',
                 '--max-time', '25', url],
                capture_output=True, text=True, timeout=40).stdout.split(' ', 1)
        except Exception as e:
            if attempt + 1 == tries:
                return url, '000', str(e)
            continue
        code = out[0]
        if code != '000' or attempt + 1 == tries:
            return url, code, (out[1].strip() if len(out) > 1 else '')
    return url, '000', ''


def live():
    problems = []
    locs = LOC.findall(open('sitemap.xml', encoding='utf-8').read())
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for url, code, to in ex.map(head, locs):
            if code != '200':
                problems.append('sitemap URL %s returned %s%s'
                                % (url, code, ' -> ' + to if to else ''))
    print('  %d sitemap URLs fetched' % len(locs))

    # The move itself. These SHOULD redirect; a 200 here would mean two live
    # copies of the site competing for the same search results.
    for src, want in ((LEGACY + '/', SITE + '/'),
                      (LEGACY + '/about.html', SITE + '/about.html'),
                      ('http://imortek.com.au/', SITE + '/'),
                      ('https://www.imortek.com.au/', SITE + '/')):
        _u, code, to = head(src)
        if not code.startswith('30'):
            problems.append('%s answered %s — it should redirect to %s' % (src, code, want))
        elif to.rstrip('/') != want.rstrip('/'):
            problems.append('%s redirects to %s, expected %s' % (src, to, want))
        else:
            print('  %-42s %s -> %s' % (src, code, to))
    return problems


def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    problems = offline()
    print('  %d pages, %d sitemap URLs — offline checks done' % (
        len(pages()), len(LOC.findall(open('sitemap.xml', encoding='utf-8').read()))))
    if '--live' in sys.argv:
        problems += live()
    if problems:
        print('\n%d problem(s):' % len(problems))
        for p in problems[:60]:
            print('  ! ' + p)
        if len(problems) > 60:
            print('  ... and %d more' % (len(problems) - 60))
        sys.exit(1)
    print('\nNo URL on this site points at one of its own redirects.')


if __name__ == '__main__':
    main()
