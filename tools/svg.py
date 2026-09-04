# -*- coding: utf-8 -*-
"""
Small SVG toolkit for the Imortek diagrams.

Every diagram on the site is generated from this so the visual language stays
consistent: same palette, same box radius, same arrowheads, same type scale.
Output is a standalone .svg referenced with <img>, which keeps the HTML clean
and lets the browser cache each picture.
"""

# Palette — the site's tokens, hard-coded because an <img>-referenced SVG
# cannot inherit CSS custom properties from the page.
BG        = "#0b0f14"
PANEL     = "#131b24"
PANEL_2   = "#182029"
LINE      = "#243141"
LINE_2    = "#33455a"
INK       = "#e8eef4"
INK_DIM   = "#a3b1c0"
INK_MUTE  = "#78899b"
TEAL      = "#5eead4"
TEAL_DIM  = "#2dd4bf"
VIOLET    = "#a78bfa"
AMBER     = "#fbbf24"
BLUE      = "#60a5fa"
RED       = "#f87171"

SANS = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

# Sequential evidence ramp — validated: monotonic lightness, every step >= 3:1
# contrast on the panel surface. Strongest evidence is brightest.
EVIDENCE_RAMP = ["#7ff3e2", "#5eead4", "#38bfae", "#27968a", "#1c6f68"]


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


class Svg:
    def __init__(self, w, h, label=""):
        self.w, self.h = w, h
        self.label = label
        self.parts = []

    # ---------- primitives ----------
    def rect(self, x, y, w, h, r=10, fill=PANEL, stroke=LINE, sw=1, opacity=None, dash=None):
        o = f' opacity="{opacity}"' if opacity is not None else ""
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{o}{d}/>')
        return self

    def line(self, x1, y1, x2, y2, stroke=LINE_2, sw=1.4, dash=None, arrow=False, opacity=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        a = ' marker-end="url(#ar)"' if arrow else ""
        o = f' opacity="{opacity}"' if opacity is not None else ""
        self.parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" '
            f'stroke-width="{sw}" stroke-linecap="round"{d}{a}{o}/>')
        return self

    def path(self, d, stroke=LINE_2, sw=1.4, fill="none", dash=None, arrow=False, opacity=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        a = ' marker-end="url(#ar)"' if arrow else ""
        o = f' opacity="{opacity}"' if opacity is not None else ""
        self.parts.append(
            f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round"{da}{a}{o}/>')
        return self

    def text(self, x, y, s, size=13, fill=INK, anchor="start", family=SANS,
             weight=400, spacing=None, opacity=None, upper=False):
        ls = f' letter-spacing="{spacing}"' if spacing else ""
        o = f' opacity="{opacity}"' if opacity is not None else ""
        s = str(s).upper() if upper else s
        self.parts.append(
            f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}" font-weight="{weight}"{ls}{o}>{esc(s)}</text>')
        return self

    def circle(self, cx, cy, r, fill=TEAL, stroke=None, sw=1, opacity=None):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        o = f' opacity="{opacity}"' if opacity is not None else ""
        self.parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{st}{o}/>')
        return self

    def poly(self, pts, fill="none", stroke=LINE_2, sw=1.4, opacity=None):
        p = " ".join(f"{x},{y}" for x, y in pts)
        o = f' opacity="{opacity}"' if opacity is not None else ""
        self.parts.append(
            f'<polyline points="{p}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round"{o}/>')
        return self

    # ---------- composites ----------
    def node(self, x, y, w, h, title, sub=None, accent=TEAL, kicker=None, r=10):
        """A labelled box: optional kicker above, title, optional wrapped subtitle."""
        self.rect(x, y, w, h, r=r, fill=PANEL, stroke=LINE_2)
        self.rect(x, y, 3, h, r=1.5, fill=accent, stroke="none")
        ty = y + 24
        if kicker:
            self.text(x + 16, y + 19, kicker, size=9.5, fill=accent, family=MONO,
                      spacing="1.2", upper=True)
            ty = y + 40
        self.text(x + 16, ty, title, size=14, fill=INK, weight=600)
        if sub:
            for i, ln in enumerate(sub if isinstance(sub, list) else [sub]):
                self.text(x + 16, ty + 19 + i * 15, ln, size=11.5, fill=INK_DIM)
        return self

    def chip(self, x, y, label, accent=TEAL, w=None, size=10):
        pad = 9
        w = w or (len(label) * (size * 0.62) + pad * 2)
        self.rect(x, y, w, 20, r=10, fill="none", stroke=accent, sw=1, opacity=.55)
        self.text(x + w / 2, y + 14, label, size=size, fill=accent, anchor="middle",
                  family=MONO, spacing=".5")
        return w

    def caption(self, x, y, s, size=11, fill=INK_MUTE, anchor="start"):
        return self.text(x, y, s, size=size, fill=fill, anchor=anchor, family=MONO, spacing=".4")

    # ---------- output ----------
    def render(self):
        title = f"<title>{esc(self.label)}</title>" if self.label else ""
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" '
            f'width="{self.w}" height="{self.h}" role="img" '
            f'aria-label="{esc(self.label)}">{title}'
            '<defs>'
            f'<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
            f'markerHeight="6" orient="auto-start-reverse">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{LINE_2}"/></marker>'
            f'<marker id="ar-teal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
            f'markerHeight="6" orient="auto-start-reverse">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{TEAL}"/></marker>'
            f'<marker id="ar-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
            f'markerHeight="6" orient="auto-start-reverse">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{RED}"/></marker>'
            '</defs>'
            + "".join(self.parts) + "</svg>")

    def save(self, path):
        with open(path, "w") as f:
            f.write(self.render())
        import os
        return os.path.getsize(path)
