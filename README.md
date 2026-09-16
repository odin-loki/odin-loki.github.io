# imortek.com.au

The Imortek website — a business site for the software and research published at
[github.com/odin-loki](https://github.com/odin-loki).

Live at **https://imortek.com.au** (GitHub Pages, custom domain via `CNAME`).

---

## What is here

A static site — no framework, no bundler, no npm install, no build step you have to learn.
Sixty-one pages in English, each carrying a working interactive demonstration of the thing it
describes, all running client-side, plus fifteen of them again in nine more languages.

Two audiences share the site. The product pages stay technical, because the people who
evaluate this software want the detail — but each one opens its `#who` section in plain
English, naming three concrete groups the thing is actually for and the problem each of them
has. `/beta.html` is plain English throughout. Keep it that way: if a sentence there needs a
computer-science degree, it belongs further down the page, not in the pitch.

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
| `/beta.html` | Recruits beta testers for all seven programs — written in plain English, no jargon |
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

## Languages

English lives at the root and every URL it has ever had still works. Nine more languages are
served from `/<code>/`, listed in `tools/locales.json`: Chinese, Hindi, Spanish, Arabic,
French, Bengali, Portuguese, Russian and Urdu — the ten most-spoken languages by total
speakers. Arabic and Urdu are right-to-left.

```bash
python3 tools/i18n_segments.py extract            # re-scan the English pages for text
python3 tools/i18n_segments.py dump  <slug> <code>   # English, numbered, in reading order
python3 tools/i18n_segments.py merge <slug> <code>   # reads index<TAB>text on stdin
python3 tools/i18n_segments.py stat               # coverage per language, by word
./tools/build.sh                                  # writes all 196 pages
python3 tools/gen_voice_index.py                  # one search index per language
```

**A translated page is the same page.** Every demo here reaches into the body by element id —
`cap-canvas`, `cy-surface`, `cx-board` — so rebuilding those pages from a localised template
would mean maintaining nine copies of that markup and breaking a demo in eight languages the
first time one drifted. Nothing is rebuilt: the document structure is left alone and only the
human-readable leaves are swapped — text nodes, and `alt`, `title`, `placeholder`,
`aria-label`. Ids, classes, hrefs, `data-*` and script contents are never touched. Applying an
empty catalogue reproduces the source byte for byte, and `tools/qa/i18n-check.py` proves the
built pages still match.

Keys are a hash of the English text rather than a position, so moving a section does not
invalidate its translation and a sentence appearing on two pages is translated once. Anything
untranslated falls through to English, and the builder measures that coverage per page and
makes the page say so above the fold below 92%.

### The other seven thousand languages

Ten are written by hand. Everyone else arrives through Chrome, Edge, Safari or Google
Translate — and so does anybody reading the forty-six research ledgers, which are published in
English only. Machine translation is not a hypothetical here; it is how most of the world will
read most of this site.

There is no translate widget and there will not be one. Every page says *no trackers, no
cookies, no analytics*, and a third-party script that watches every visitor would make that a
lie. What the site does instead is the two things that actually matter:

- **`<html lang>` is correct on all 196 pages.** That single attribute is what every browser's
  built-in translator keys off, and it is why a reader can right-click any page here and get a
  usable translation without the site doing anything at all.
- **`translate="no"` on what must not be mangled**, added at build time by
  `tools/i18n_protect.py` — 483 elements across the research pages, 87 on each core page.
  Machine translation reorders numbers and happily translates `exp`. A ledger cell reading
  `0.543 · exp(-0.041 · s)` or `exact for n < 3.317 × 10²⁴` does not survive that, and this is
  a site whose entire argument is that every number is checkable. Code is protected wherever
  it appears; monospace cells are protected in the body but not in the footer, so the prose
  there still translates like prose.

The research ledgers are deliberately **not** translated by hand. Every figure in them is a claim
somebody can check, and a mistranslated claim is a false claim. They stay in English, the
shelf says so in the reader's language, and no `hreflang` promises otherwise.

Everything else keeps working per language: the selector (top right, server-rendered as plain
links so it works with JavaScript off and a crawler can follow it), the search index, the
spoken command vocabulary in `assets/data/say.<code>.json`, speech synthesis and recognition
on the locale's own BCP-47 tag, the glossary, and the demos.

The demos need saying separately, because half of what a visitor reads on a product page is
never in the HTML — it is written by the demo as they use it. 151 strings across eight demos
go through `D()`, keyed by the English string itself:

```bash
python3 tools/i18n_demos.py extract              # re-scan the JS for D('...')
python3 tools/i18n_demos.py dump  <demo> <code>
python3 tools/i18n_demos.py merge <demo> <code>  # English<TAB>translation
```

That catalogue is inlined by the builder, not fetched, because a demo writes its first status
line while it starts up and a fetch would land after the reader had already seen English. Only
the demos a page loads are inlined, so the licence chooser's forty-eight strings never ride
along with the chess board. Canvas draws no wrapping and no shrinking of its own, so labels
there shrink to fit, then break across two lines — "Credential store" is "Armazenamento de
credenciais" in Portuguese and used to run clean off the panel.

Two rules learnt the hard way, both in `assets/js/i18n.js`:

- Never run the English stemmer on another language. `/[a-z][a-z'+-]+/` on
  "операционная система" yields no tokens at all, so the search box was not ranking the wrong
  pages — it was never forming a query.
- A word ends where a run of letters **and marks** ends. Python counts a Devanagari vowel sign
  as a non-word character, so `\w+` shreds "ऑपरेटिंग" into three fragments and the Hindi index
  came out with 23 usable terms in it.

`src/i18n/TRANSLATING.md` is the brief for a page, `src/i18n/GLOSSARY.md` for the glossary.

## Plain English

`assets/data/glossary.json` holds 199 pieces of jargon and, for each, one or two sentences a
person with no background can read once and understand. Click *Explain the jargon* in the page
toolbar and the first occurrence of each is marked; the layer averages 39 marked terms a page.
Double-click any other word and it falls through to a 144,440-word WordNet dictionary, loaded
one shard at a time.

All 199 are written in all ten languages, with the local spelling of each term added as a
matcher so the layer lights up on a page that says *núcleo* rather than *kernel*. Arabic
attaches its article to the front of a word and Russian, Hindi and Bengali inflect the end, so
outside English an alias of five characters or more may carry a short prefix or suffix — five
rather than four, because at four the Hindi for "fixed" matched inside the Hindi for
"deterministic".

```bash
python3 tools/gen_glossary.py                 # English — refuses to build if it gets clever
python3 tools/gen_glossary_locale.py stat     # translated coverage
```

The file is generated rather than hand-edited because the checks are the point. It refuses an
explanation longer than 36 words, a sentence over 24, a word longer than 11 letters that is
not on the allow-list, or one that leans on another piece of jargon to do the work. These are
not definitions — a definition tells you what a word means to someone who already knows:

> **capability** — a key that opens one door and nothing else. Give a program that key and it
> can only do that one thing.

Not "an unforgeable token conferring authority over a single resource", which is the same fact
written to impress.

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
src/i18n/           translation catalogues, one per language, plus the two briefs
tools/build.sh      the builder
tools/locales.json  the ten languages, their direction and their speech tags
tools/i18n_segments.py   extract / apply / measure a page's translatable text
tools/gen_glossary.py    the plain-English layer, with its simplicity checks
tools/gen_glossary_locale.py
tools/gen_research.py + research_data.py
tools/gen_voice_index.py one search index per language
tools/qa/           responsive audit, structural i18n check, feature smoke test
tools/chess/        engine verification + model training
assets/css/main.css design system, logical properties throughout so RTL mirrors
assets/i18n/        the chrome strings, one file per language
assets/js/i18n.js   locale runtime — strings, URLs, tokenising
assets/js/site.js   nav, scroll, reveal, hero canvas, live GitHub stats, video slots
assets/js/demos/    one file per interactive demo
assets/js/chess/    engine, features, Cypha head
assets/data/        glossary, search indexes, spoken vocabulary, chess weights
assets/video/       optional Runway clips + generated manifest.json
assets/img/people/  portrait
assets/img/pbsd/    the port mascot
*.html, <code>/*.html   generated — do not edit
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

Verified across **1,960 page/viewport combinations** (196 pages × 10 sizes from 320×568 to
2560×1440, including 844×390 landscape, in all ten languages and both writing directions):
no horizontal overflow and no page errors anywhere. Re-run it yourself:

```bash
npm i -D playwright              # once
python3 -m http.server 8123 &
node tools/qa/responsive-audit.js   # every page, every size, every language
python3 tools/qa/i18n-check.py      # translated pages still structurally identical
node tools/qa/i18n-smoke.js         # selector, search, read-aloud, glossary, per language
```

All three exit non-zero on failure, so they drop straight into CI if you ever want them there.
The responsive audit is the one that found the header: it fitted English on a wide laptop and
nothing else, because Russian needs about 500px more for the same navigation. Rather than
guess a breakpoint per language, the row now gives up ornament as space runs out — tagline,
then the endonym beside the globe, then the two links reachable elsewhere, then padding.

There is also a print stylesheet: chrome, demos and decorative canvases drop out, and the
page prints dark-on-white.

## Search

Every page carries one `<script type="application/ld+json">` block holding a schema.org
`@graph`, emitted by `emit_head` in `tools/build.sh`. The `@id`s are stable across all 60
pages, so the organisation, the person and the site are understood as three entities
referenced repeatedly rather than 180 unrelated copies.

| Node | On | Why |
|---|---|---|
| `Organization`, `Person`, `WebSite` | every page | Identity — ties the site, Imortek, Odin Loch, the GitHub profile and the Kickstarter together |
| `WebPage` / `AboutPage` / `CollectionPage` | every page | The page itself, with its canonical URL and social card |
| `BreadcrumbList` | every page | The one node here that produces a visible SERP feature; research articles nest under the shelf |
| `SoftwareApplication` | product pages | Name, licence and `codeRepository`, so a page and its source are the same thing |
| `TechArticle` | research pages | Headline, author, licence, `isAccessibleForFree` |

The `robots` directive asks for `max-image-preview:large` and unbounded snippets, which is
what lets a result render as a card rather than a line of blue text. `404.html` is the one
page emitted `noindex`.

`<meta name="keywords">` is also emitted — per page from the `KEYWORDS` map, and derived from
the title for research articles. Google has ignored it since 2009; it is there for the smaller
engines and site-search tools that still read it, not because it moves Google. It is written
per language rather than translated word for word, because somebody searching in Spanish types
what a Spanish speaker types.

Every translated page carries `hreflang` alternates for all ten languages plus `x-default`,
and `sitemap.xml` repeats the whole cluster on each of its 186 URLs. Only pages that genuinely
exist in more than one language get alternates: pointing `hreflang` at a page that is not
actually translated promises a reader a language the page does not speak.

Validate after changing anything in `emit_head`:

```bash
./tools/build.sh
python3 -c "import json,re,glob;[json.loads(re.search(r'ld\+json\">(.*?)</script>',open(f).read(),re.S).group(1)) for f in glob.glob('*.html')+glob.glob('research/*.html')]"
```

Malformed JSON-LD is silently ignored by crawlers, so it fails quietly rather than loudly —
run the check.

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
- The Kickstarter is live until **12 November 2026**. Campaign facts that are fixed for its
  duration (goal, dates, funding model) are stated on `/kickstarter.html`; the pledge total and
  backer count deliberately are not, because a running total typed into a static page is wrong
  immediately. `KS_URL` in `tools/build.sh` is the single source of the campaign link.
- `./tools/build.sh` also regenerates `sitemap.xml` inputs and the video manifest, so run it
  after adding pages or clips.

## Licence

Site content and code: **AGPL-3.0-or-later** (`LICENSE`) with a commercial tier — see
`COMMERCIAL-LICENCE.md` and https://imortek.com.au/licensing.html.

HardenedBSD-derived code in ParanoidBSD remains under its original BSD licence and is not
covered by either.

© 2025–2026 Odin Loch, trading as Imortek. Sydney, Australia.
