#!/usr/bin/env python3
"""When each page first appeared and when it last changed, taken from git.

Google asks for a date on an article, and asks that the date in the structured
data match a date the reader can see. Inventing one is worse than none, and
stamping every page with the build time is the same as having no date at all —
a sitemap where all 186 URLs change every build is noise a crawler learns to
ignore. Git already knows the truth, so ask git.

Two dates per source file: the oldest commit that touched it (published) and
the newest (modified). One git pass gets both for every file at once; a file
git has never seen is new, so it is published today.

    python3 tools/pagedates.py            # write .cache/pagedates.tsv
    python3 tools/pagedates.py show <path>
"""
import os
import subprocess
import sys
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = '.cache/pagedates.tsv'
# Everything a built page is made of. A page's date has to move when its
# translation moves, or nine tenths of the sitemap would freeze on the day the
# English was written.
WATCH = ('src/pages', 'src/i18n', 'assets/i18n')


def git_dates():
    """{path: (oldest, newest)} over WATCH, in one pass."""
    try:
        out = subprocess.run(
            ['git', 'log', '--format=%x01%ad', '--date=short', '--name-only', '--'] + list(WATCH),
            cwd=ROOT, capture_output=True, text=True, timeout=120).stdout
    except Exception:
        return {}
    seen = {}
    date = None
    for line in out.splitlines():
        if line.startswith('\x01'):
            date = line[1:].strip()
        elif line.strip() and date:
            p = line.strip()
            if p in seen:
                # git walks newest first, so the newest is whatever we saw
                # first and the oldest is whatever we see last.
                seen[p] = (date, seen[p][1])
            else:
                seen[p] = (date, date)
    return seen


def main():
    today = datetime.date.today().isoformat()
    dates = git_dates()

    # An uncommitted file has no history. It is being written right now, so
    # today is the honest answer for both ends.
    for base in WATCH:
        for dirpath, _dirs, files in os.walk(os.path.join(ROOT, base)):
            for fn in files:
                p = os.path.relpath(os.path.join(dirpath, fn), ROOT)
                dates.setdefault(p, (today, today))

    # A locale's catalogue changes every page in that locale.
    cat = {}
    for p, d in dates.items():
        for pre, suf in (('src/i18n/segments.', '.json'), ('assets/i18n/', '.json')):
            if p.startswith(pre) and p.endswith(suf):
                code = p[len(pre):-len(suf)].replace('demos.', '')
                if not code or '/' in code or code == 'pages':
                    continue
                old, new = cat.get(code, (d[0], d[1]))
                cat[code] = (min(old, d[0]), max(new, d[1]))

    rows = []
    for p, (old, new) in sorted(dates.items()):
        if not p.startswith('src/pages/') or not p.endswith('.html'):
            continue
        slug = p[len('src/pages/'):-len('.html')]
        rows.append((slug, 'en', old, new))
        for code, (cold, cnew) in sorted(cat.items()):
            if code == 'en':
                continue
            rows.append((slug, code, max(old, cold), max(new, cnew)))

    os.makedirs(os.path.join(ROOT, '.cache'), exist_ok=True)
    with open(os.path.join(ROOT, OUT), 'w', encoding='utf-8') as fh:
        for r in rows:
            fh.write('\t'.join(r) + '\n')
    pages = len({r[0] for r in rows})
    print('  dates: %d pages, %d rows, %s .. %s'
          % (pages, len(rows), min(r[2] for r in rows), max(r[3] for r in rows)))


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'show':
        d = git_dates().get(sys.argv[2])
        print(d if d else 'untracked')
    else:
        main()
