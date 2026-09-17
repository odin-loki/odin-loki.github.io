#!/usr/bin/env python3
"""Every class a page uses, checked against the stylesheet that has to style it.

A class name that matches no rule fails silently. Nothing errors, nothing logs,
the element just renders with browser defaults — which for most elements looks
close enough to intentional that it survives review. The TRACE page shipped
`.table-wrap` and `.table` when the site's idiom is `.table-scroll` and
`table.data`; the tables had no scroll container, and the only symptom was 76px
of sideways overflow on one page in one language at phone width, found by the
responsive audit three steps later rather than here.

    python3 tools/qa/classcheck.py

Classes the JavaScript adds at runtime are listed below rather than guessed at,
because a class this tool cannot see in the CSS is either a bug or a thing
somebody decided on purpose, and the difference belongs in writing.
"""
import glob
import os
import re
import sys

# Added by a script rather than written in a page, and styled by a rule this
# tool does see — they appear here only because the page's markup does not.
RUNTIME = {
    'is-open', 'is-active', 'is-on', 'is-done', 'gloss', 'marked',
}


def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    sheets = sorted(glob.glob('assets/css/*.css'))
    if not sheets:
        sys.exit('no stylesheets found')
    css = '\n'.join(open(s, encoding='utf-8').read() for s in sheets)
    defined = set(re.findall(r'\.([A-Za-z][\w-]*)', css)) | RUNTIME

    pages = sorted(glob.glob('src/pages/*.html')) + sorted(glob.glob('src/pages/**/*.html',
                                                                     recursive=True))
    pages = sorted(set(pages))
    problems, used_total = [], set()
    for f in pages:
        used = set()
        for m in re.finditer(r'class="([^"]+)"', open(f, encoding='utf-8').read()):
            used.update(c for c in m.group(1).split() if c and not c.startswith('{'))
        used_total |= used
        for c in sorted(used - defined):
            problems.append('%s: class %r matches no rule in %s'
                            % (f, c, ', '.join(sheets)))

    print('  %d pages, %d distinct classes, %d rules' % (len(pages), len(used_total), len(defined)))
    if problems:
        print('\n%d problem(s):' % len(problems))
        for p in problems[:40]:
            print('  ! ' + p)
        if len(problems) > 40:
            print('  ... and %d more' % (len(problems) - 40))
        sys.exit(1)
    print('\nEvery class a page uses has a rule behind it.')


if __name__ == '__main__':
    main()
