# -*- coding: utf-8 -*-
"""
Per-research-page evidence chart.

Each research page gets a chart of its OWN claims ledger, broken down by what
stands behind each figure. The encoding is a sequential ramp because evidence
basis is ordered, not categorical — strongest evidence is brightest. That also
sidesteps the CVD failure a five-hue categorical palette hits (violet/blue sit
0.3 dE apart under deuteranopia).

Every segment carries a direct label, so identity is never colour-alone.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svg import *
from research_data import RESEARCH, TIER_LABEL

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                   'assets', 'img', 'diagrams', 'research')
os.makedirs(OUT, exist_ok=True)

# Ordered strongest -> weakest. Ramp validated: monotonic lightness,
# every step >= 3:1 contrast on the panel surface.
ORDER = ['measured', 'synthetic', 'derived', 'projected', 'cited']
LABEL = {'measured': 'Measured', 'synthetic': 'Synthetic', 'derived': 'Derived',
         'projected': 'Projected', 'cited': 'Cited'}
GLOSS = {
    'measured':  'author-run experiment',
    'synthetic': 'measured, on synthetic data',
    'derived':   'follows from the construction',
    'projected': 'paper-stated projection',
    'cited':     'external literature',
}
RAMP = dict(zip(ORDER, EVIDENCE_RAMP))

def _relative_luminance(hex_colour):
    """WCAG relative luminance, used to choose readable label ink per segment."""
    h = hex_colour.lstrip('#')
    chans = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        chans.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2]


W_MAX = 1000
written = []

for e in RESEARCH:
    counts = {k: 0 for k in ORDER}
    for _claim, _fig, basis, _ctx in e['claims']:
        counts[basis] = counts.get(basis, 0) + 1
    total = sum(counts.values())
    present = [k for k in ORDER if counts[k]]

    # Lay the legend out first so the canvas is exactly as tall as the content.
    _lx, _rows = 22, 1
    for k in present:
        _w = 20 + len(f"{LABEL[k]} — {GLOSS[k]}") * 5.55 + 22
        if _lx + _w > W_MAX - 200 and _lx > 22:
            _lx = 22; _rows += 1
        _lx += _w
    W = W_MAX
    H = 58 + 46 + 30 + (_rows - 1) * 22 + 66
    tier_name, _badge, _desc = TIER_LABEL[e['tier']]
    s = Svg(W, H, f"{e['name']}: {total} claims broken down by what stands behind each one — "
                  + ", ".join(f"{counts[k]} {LABEL[k].lower()}" for k in present))

    s.text(22, 32, f"What stands behind {e['name']}’s {total} claims", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, tier_name, size=11, fill=INK_MUTE, anchor="end", family=MONO, upper=True,
           spacing=".8")

    # ---- the bar: one stacked row, 2px surface gaps between segments
    bx, by, bw, bh = 22, 58, W - 44, 46
    x = bx
    for i, k in enumerate(present):
        seg = (counts[k] / total) * bw
        gap = 2 if i < len(present) - 1 else 0
        w = max(seg - gap, 6)
        s.rect(x, by, w, bh, r=4, fill=RAMP[k], stroke="none")
        # direct label inside when it fits, so identity is never colour-alone
        if w > 74:
            # Pick label ink from the segment's actual luminance, not from its name —
            # which step a category lands on depends on which categories are present.
            ink = "#06231f" if _relative_luminance(RAMP[k]) > 0.45 else INK
            s.text(x + 11, by + 21, LABEL[k], size=11.5, fill=ink, weight=600)
            s.text(x + 11, by + 36, f"{counts[k]} of {total}", size=10.5, fill=ink, opacity=.85,
                   family=MONO)
        x += seg

    # ---- legend, always present; also the place small segments get named
    ly = by + bh + 30
    lx = 22
    for k in present:
        s.rect(lx, ly - 9, 11, 11, r=3, fill=RAMP[k], stroke="none")
        s.text(lx + 18, ly, f"{LABEL[k]} — {GLOSS[k]}", size=11, fill=INK_DIM)
        lx += 20 + len(f"{LABEL[k]} — {GLOSS[k]}") * 5.55 + 22
        if lx > W - 200:
            lx = 22
            ly += 22

    # ---- the honest footer
    strong = counts['measured'] + counts['synthetic']
    soft = counts['projected'] + counts['cited']
    if not total:
        note = ""
    elif soft == 0:
        note = (f"All {total} rest on the author's own experiments or on the construction. "
                f"None is externally audited.")
    elif strong == 0:
        note = (f"None of the {total} rests on an author-run experiment. "
                f"{soft} are projections or citations.")
    else:
        note = (f"{strong} of {total} rest on measurement by the author; "
                f"{soft} are projections or citations. None is externally audited.")
    s.line(22, H - 44, W - 22, H - 44, stroke=LINE, sw=1)
    s.caption(22, H - 22, note, size=10.5)

    n = s.save(os.path.join(OUT, e['slug'] + '.svg'))
    written.append((e['slug'], total, n))

print("wrote %d research charts" % len(written))
for slug, total, n in written:
    print("  %-20s %2d claims  %4.1f KB" % (slug, total, n / 1024))
