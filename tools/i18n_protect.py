# -*- coding: utf-8 -*-
"""
Mark the parts of a page that must survive machine translation.

    python3 tools/i18n_protect.py < body.html > body.html

Ten languages are written by hand. The other seven thousand arrive through
Chrome, Edge, Safari or Google Translate, and so do the forty-six research
ledgers, which are deliberately published in English only. Machine
translation is therefore not a hypothetical for this site — it is how most
of the world will read most of it.

It is also careless with exactly the things this site is about. A ledger cell
reading `0.543 · exp(-0.041 · s)` comes back with `exp` translated and the
decimal separator swapped; `exact for n < 3.317 x 10^24` comes back with the
digits reordered. A page whose entire argument is that every number is
checkable cannot afford that.

`translate="no"` is a global HTML attribute and both the browsers and Google
honour it. This adds it to code and to the monospace cells that hold figures,
formulas and identifiers — inside <main> only, so the footer and the header
still translate like the prose they are.
"""
import re, sys

# Always code, wherever it appears.
CODE = ('code', 'pre', 'samp', 'kbd')

TAG = re.compile(r'<(/?)([a-zA-Z][\w:-]*)((?:[^<>"\']|"[^"]*"|\'[^\']*\')*)(/?)>')
CLASS = re.compile(r'\bclass\s*=\s*"([^"]*)"')

def protect(html):
    """Add translate="no" to code anywhere, and to the monospace cells that
    hold figures and identifiers.

    The input is a page body — the builder wraps it in <main> afterwards — so
    everything here is main content and the default is on. The <main> tracking
    below is for the case where a whole document is passed in instead, which
    is how this is tested and how it would be used on an already-built page.
    The header and footer never reach this filter, so the tagline and the
    built-at line keep translating like the prose they are.

    Nesting needs no special handling: the attribute inherits, so a <code>
    inside a protected cell carries it twice and behaves the same."""
    out, pos, inmain = [], 0, True
    for m in TAG.finditer(html):
        out.append(html[pos:m.start()])
        pos = m.end()
        closing, name, attrs, selfclose = m.group(1), m.group(2).lower(), m.group(3) or '', m.group(4)

        if name == 'main':
            inmain = not closing
            out.append(m.group(0))
            continue
        if closing:
            out.append(m.group(0))
            continue

        wants = name in CODE
        if not wants and inmain:
            cls = CLASS.search(attrs)
            wants = bool(cls and re.search(r'(^|\s)mono(\s|$)', cls.group(1)))

        if wants and 'translate=' not in attrs:
            attrs = attrs.rstrip() + ' translate="no"'
        out.append('<' + name + attrs + ('/' if selfclose else '') + '>')
    out.append(html[pos:])
    return ''.join(out)

if __name__ == '__main__':
    # --dateline drops the written/updated line into the placeholder the
    # research generator leaves behind. It rides along here because the body
    # already passes through this filter and a page is not worth a third
    # interpreter just to substitute one string.
    line = ''
    if len(sys.argv) > 2 and sys.argv[1] == '--dateline':
        line = sys.argv[2]
    body = protect(sys.stdin.read())
    sys.stdout.write(body.replace('<!--dateline-->', line))
