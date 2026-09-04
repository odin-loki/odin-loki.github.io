# imortek.com.au

The Imortek website — a business site for the software and research published at
[github.com/odin-loki](https://github.com/odin-loki).

Live at **https://imortek.com.au** (GitHub Pages, custom domain via `CNAME`).

---

## What is here

A static site — no framework, no bundler, no npm install, no build step you have to learn.
Twenty-six pages, each carrying a working interactive demonstration of the thing it
describes, all running client-side.

| Page | What it demonstrates |
|---|---|
| `/` | Live GitHub stats, animated capability lattice, product catalogue |
| `/pbsd.html` | **Interactive:** walk a syscall through a capability reference monitor |
| `/cypha.html` | **Interactive:** train an online classifier by clicking; XOR fails without RFF, exactly as documented |
| `/chess.html` | **Interactive:** play chess against Cypha, distilled from the reference engine |
| `/retdec.html` | **Interactive:** step a function from raw bytes to a named algorithm |
| `/mathscript.html` | **Interactive:** a working mini-CAS — parse, symbolically differentiate, plot, integrate |
| `/aegis.html` | **Interactive:** run a traffic-correlation attack, with and without constant-rate shaping |
| `/sentinel.html` | **Interactive:** KDE hotspots and Rossmo geographic profiling, scored by hit rate |
| `/cellai.html` | **Interactive:** live Gray–Scott reaction-diffusion |
| `/kickstarter.html` | **Interactive:** the PBSD funding model with every assumption exposed |
| `/licensing.html` | **Interactive:** AGPL vs commercial chooser |
| `/research.html` | 46 research areas, filterable, 12 with full write-ups |
| `/research/*.html` | Per-area claims ledgers: every number tagged measured / synthetic / derived / projected / cited |

## Working on it

**Edit `src/pages/*.html`, never the generated `.html` files at the root.**

```bash
./tools/build.sh          # regenerate every page
python3 -m http.server 8123   # then open http://localhost:8123
```

`tools/build.sh` wraps each body in `src/pages/` with the shared head, header and footer,
and writes the result to the repo root where GitHub Pages serves it. Page titles,
descriptions and per-page scripts live in the `PAGES` array at the bottom of that script.

Research pages are generated rather than hand-written:

```bash
python3 tools/gen_research.py   # rebuilds src/pages/research/* and the index
./tools/build.sh
```

Their content lives in `tools/research_data.py`, one entry per area, drawn from the
corresponding folder README in the `Ideas` repository.

## The chess model

`/chess.html` plays against a real distilled model, not a scripted opponent.

```bash
node tools/chess/perft.js    # verify the engine against 5 standard positions
node tools/chess/train.js    # regenerate the model (fixed seed, ~35 min)
```

- `assets/js/chess/engine.js` — 0x88 engine: full legal movegen, alpha-beta, quiescence.
  Verified against startpos, kiwipete and positions 3–5.
- `assets/js/chess/features.js` — 388-dimensional feature map.
- `assets/js/chess/cypha.js` — the Cypha regression head plus its search.
- `assets/data/cypha-chess.json` — the fitted weights (9.4 KB).

Measured on the run that produced the committed model: **held-out R² 0.866**, RMSE 2.50
pawns over 26,568 positions, and **5W–19L–6D** against the teacher engine at equal depth.
Those figures are read out of the model file at page load, not typed into the HTML.

## Video

Optional. Every hero has a video slot that upgrades if the file exists and silently falls
back to its canvas animation if it does not — so clips can be added one at a time without
touching any code.

See **`docs/VIDEO-SCRIPTS.md`** for Runway prompts, ffmpeg encoding commands and the size
budget. Short version: **under 4 MB per clip, under 25 MB total**; GitHub hard-blocks any
single file over 100 MB, and Git LFS is not an option because GitHub Pages serves LFS
pointers as plain text.

## Layout

```
src/pages/          page bodies — edit these
tools/build.sh      the builder
tools/gen_research.py + research_data.py
tools/chess/        engine verification + model training
assets/css/main.css design system
assets/js/site.js   nav, scroll, reveal, hero canvas, live GitHub stats, video slots
assets/js/demos/    one file per interactive demo
assets/js/chess/    engine, features, Cypha head
assets/data/        distilled chess weights
assets/video/       optional Runway clips + generated manifest.json
assets/img/people/  portrait
assets/img/pbsd/    the port mascot
*.html              generated — do not edit
```

## Responsive behaviour

The layout adapts across three regimes rather than just collapsing at one breakpoint.

| Viewport | Behaviour |
|---|---|
| 320–420px | 16px gutters, buttons wrap and go full-width, grid floors use `min(100%, Npx)` so a 300px card never forces a 320px screen to scroll |
| 420–1024px | Fluid single and two-column grids; demo side panels stack under their canvas |
| 1024–1440px | 1200px container, 16px root |
| 1600px+ | Container grows to 1560px and the root font eases 16px → 19px, so everything sized in `rem` scales with it rather than stranding a narrow column on a large display |
| Short/landscape (`max-height: 560px`) | Header un-sticks, section padding halves, and demo canvases size to ~66% of viewport height instead of a fixed 380–400px |
| `pointer: coarse` | Chips, segmented controls, switches and range thumbs all enlarge |

Canvas demos call `window.ImortekFitHeight(preferred)` (in `site.js`) rather than hard-coding
a height, which is what keeps a 400px canvas from exceeding a 390px-tall landscape phone.

Verified across **260 page/viewport combinations** (26 pages × 10 sizes from 320×568 to
2560×1440, including 844×390 landscape): no horizontal overflow and no page errors anywhere.
Re-run it yourself:

```bash
npm i -D playwright              # once
python3 -m http.server 8123 &
node tools/qa/responsive-audit.js
```

It exits non-zero on any failure, so it drops straight into CI if you ever want it there.

There is also a print stylesheet: chrome, demos and decorative canvases drop out, and the
page prints dark-on-white.

## Conventions

- No trackers, no cookies, no analytics, no third-party scripts. The only external request
  is Google Fonts.
- Everything works without JavaScript except the demos, which degrade to static panels.
- `prefers-reduced-motion` is respected throughout — animations freeze and videos are never
  requested.
- Live GitHub data is fetched client-side and cached for 45 minutes; static fallbacks in the
  HTML mean the page reads correctly if the API is unavailable.
- Social cards: `assets/img/og.png` site-wide, overridden per page by convention if
  `assets/img/og-<slug>.jpg` exists (PBSD and the Kickstarter have their own).
- `./tools/build.sh` also regenerates `sitemap.xml` inputs and the video manifest, so run it
  after adding pages or clips.

## Licence

Site content and code: **AGPL-3.0-or-later** (`LICENSE`) with a commercial tier — see
`COMMERCIAL-LICENCE.md` and https://imortek.com.au/licensing.html.

HardenedBSD-derived code in ParanoidBSD remains under its original BSD licence and is not
covered by either.

© 2025–2026 Odin Loch, trading as Imortek. Sydney, Australia.
