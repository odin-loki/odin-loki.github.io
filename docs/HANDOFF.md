# Handoff — imortek.com.au

Written for an AI agent picking this up cold. Facts, paths and commands, not
encouragement. Everything below was verified in the session that wrote it; where a
number appears, it was measured rather than estimated.

---

## 1. Orientation

- **Repo:** `odin-loki/odin-loki.github.io`
- **Live:** https://imortek.com.au — GitHub Pages, custom domain via `CNAME`
- **Deploy:** push to `main`. There is no CI and no build step on the server; Pages
  serves the committed `.html` at the repo root. A push is live in about a minute.
- **Owner:** Odin Loch, trading as Imortek. Sydney, Australia. One person, day job as a
  toolmaker.
- **Licence:** AGPL-3.0-or-later with a commercial tier above AUD 50,000/yr revenue.

### The hard rules

1. **Edit `src/pages/*.html`, never the `.html` at the repo root.** The root files are
   generated. Editing them directly is silently undone by the next build.
2. **Run `./tools/build.sh` after every source edit.** It wraps each body in the shared
   head/header/footer, regenerates `sitemap.xml`, and writes the video manifest.
3. **Run the responsive audit before pushing to `main`.** It is the only gate:
   ```bash
   python3 -m http.server 8123 &
   NODE_PATH=/opt/node22/lib/node_modules node tools/qa/responsive-audit.js
   ```
   610 combinations (61 pages × 10 viewports). It exits non-zero on any horizontal
   overflow or page error. It has never been allowed to fail on `main`.
4. **Never push to `main` without the owner saying so.** Pushing deploys to a live
   business site. Work lands on `claude/kickstarter-website-updates-idkade` first.

---

## 2. The voice, and why it matters

This site's entire value proposition is that **every claim on it is checkable**. It is
written for technically sophisticated readers and does not apologise for that. The owner
has been asked directly whether to broaden it and declined:

> "Keep it broad. I like the site. People interested enough will find their niche. Dumb
> people won't bother. I like a little intellectual elitism."

So: **do not dumb the technical pages down.** What was added instead is an *on-ramp* — a
plain-English `#who` section on each product page, a `/beta.html` written in plain English,
and an opt-in glossary layer. The depth stays underneath, untouched.

Concretely, when writing copy for this site:

- Publish the unflattering number next to the flattering one. `/chess.html` says the online
  learner reduces head error 12% **and** that it does not yet win more games (6W–7L–11D).
  `/cypha.html` says compiling the library found a bug in its own ORF implementation.
- Never claim something the reader cannot verify. If a figure cannot be measured, say so
  rather than estimating it silently.
- Do not copy volatile numbers into static pages. The Kickstarter's pledge total and backer
  count are deliberately *not* on the site; the goal and dates are, because those are fixed.
- No trackers, no cookies, no analytics, no third-party scripts. The only external request
  is Google Fonts. Anything stored is per-viewer `localStorage`, wrapped in try/catch.

---

## 3. Repo map

```
src/pages/*.html        page bodies — EDIT THESE
tools/build.sh          the builder; PAGES array + KEYWORDS map at the bottom
tools/qa/responsive-audit.js   the gate
tools/gen_dictionary.py        WordNet -> assets/data/dict/ shards
tools/gen_voice_index.py       page text -> assets/data/voice-index.json
tools/eval-search.py           labelled query set for search quality
tools/chess/rank.js            plays the Elo ladder
tools/chess/train.js           regenerates the distilled chess model
tools/wasm/                    WebAssembly bindings + portability patches
assets/css/main.css     design system; all tokens on :root
assets/js/site.js       nav, reveal, hero canvas, live GitHub stats, video slots
assets/js/glossary.js   plain-English layer + Cypha term prediction
assets/js/dictionary.js 144,440-word lazy trie
assets/js/similar.js    related pages + site search
assets/js/voice.js      text-to-speech, speech-to-text, command interpretation
assets/js/demos/        one file per interactive demo
assets/wasm/            the four compiled libraries
*.html                  GENERATED — do not edit
```

---

## 4. What exists

### Kickstarter (live until 12 November 2026)

Campaign: *Secure Operating System Based on HBSD*, goal **AUD 10,000**, all-or-nothing,
launched 13 Sep 2026, 60 days. `KS_URL` in `tools/build.sh` is the single source of the link.
Pledge total and backer count are deliberately absent — see §2.

### Search and structured data

Every page emits one schema.org `@graph` with stable `@id`s: Organization, Person, WebSite,
WebPage, BreadcrumbList, plus SoftwareApplication (products) or TechArticle (research).
`404.html` is the only `noindex` page. Validate after touching `emit_head`:

```bash
python3 -c "import json,re,glob;[json.loads(re.search(r'ld\+json\">(.*?)</script>',open(f).read(),re.S).group(1)) for f in glob.glob('*.html')+glob.glob('research/*.html')]"
```

### Plain-English layer

63 hand-written glosses in `assets/data/glossary.json` — **written by hand on purpose.** A
model that invented definitions would be the one claim on the site nobody could check.

Which terms get pre-expanded is decided by Cypha's actual algorithm (WorldPrior θ₀ by
Welford, a "wanted" differential with MDL decay, log-likelihood ratio against the prior),
learning from what the reader opens. Tuned against behaviour: taught 3 terms from one domain
on 6 pages, it picks 14, **all in-domain, none outside**. Capped at 6 per page.

Behind it sits a **144,440-word WordNet dictionary**, 76 shards, lazily fetched by first
letter (second letter where a letter is too fat), trie built client-side from a sorted word
list. Double-click any word. Light morphology: `babies`→`baby`, `heavier`→`heavy`.

### Similarity, search, voice

One sparse TF-IDF index (`assets/data/voice-index.json`) backs three things: related pages
(hubness-corrected, wayfinding pages excluded as targets), typed search (press `/`), and
voice navigation.

Search is tuned against `tools/eval-search.py` — 15 labelled queries. **13/15 top-1,
15/15 top-3.** Three things got it there: a stemmer mirrored exactly in Python and
JavaScript, dropping a vocabulary cut that was deleting useful common words, and a 1.35×
prior on the 14 main pages so 46 research articles stop swamping them.

Voice uses the browser's `speechSynthesis` and `SpeechRecognition` for audio — **Cypha does
not do audio and no claim is made that it does.** Cypha ranks candidate interpretations and
learns from corrections (accepted shapes pull up, rejected ones pull down). Recognisers
spell acronyms out, so "paranoid bee es dee" is despelled before anything else sees it.

### Chess

`/chess.html` plays a real distilled model. It now **keeps learning while you play** —
normalised LMS on whitened features toward its own search value, MDL decay back toward the
shipped weights, one model per search depth, persisted per viewer.

Measured and published on the page, both halves:

| | |
|---|---|
| head error vs own search, frozen | 0.743 → 0.778 pawns (4.6% **worse**) |
| head error vs own search, learning | 0.686 → 0.650 pawns (5.2% better) |
| trained copy vs shipped copy | **6W–7L–11D** — a dead heat |

So it learns, and it does not yet play better. Both are on the page. The ladder
(`tools/chess/rank.js`, 210 games, Bradley-Terry MLE, reference d1 anchored to 1000):

```
reference d1 1000        cypha d1  798 ±59
reference d2 1171 ±47    cypha d2 1010 ±46
reference d3 1245 ±50    cypha d3 1161 ±47
```

Cypha runs about one search depth behind the engine it was distilled from. **Internal ladder,
not FIDE** — it has never played a rated human.

---

## 5. The WebAssembly subsystem

Four libraries run in the browser **as themselves**, not as JavaScript retellings. Each is
opt-in: nothing downloads until the reader presses load.

| Page | Module | Size | What runs |
|---|---|---|---|
| `/mathscript.html#wasm` | `mathscript.wasm` | 103 KB | `libms_symbolic` — differentiate, integrate |
| `/cypha.html#wasm` | `cypha.wasm` | 40 KB | `cypha::rff_features` — kernel approximation error |
| `/retdec.html#wasm` | `retdec.wasm` | 791 KB | Capstone 5 x86 — real disassembly |
| `/sentinel.html#wasm` | `sentinel.wasm` | 2.4 MB | `KDEHotspot` + `HawkesProcess` |

Full rebuild instructions are in **`tools/wasm/README.md`**. Toolchains:

- **Emscripten 6.0.9** for MathScript, Cypha, RetDec.
- **Emscripten 3.1.56** for SENTINEL — Qt 6.8 pins that version exactly, it is not
  interchangeable.
- **Qt 6.8.0 `wasm_singlethread`** via `aqtinstall`, plus `linux_gcc_64` host tools.

### Gotchas that cost real time

- `cmake` `FetchContent` cannot reach GitHub through this environment's proxy. Vendor
  dependencies manually instead.
- **Threads are not available.** Threaded WebAssembly needs `SharedArrayBuffer`, which needs
  COOP/COEP response headers, and **GitHub Pages cannot send them.** Everything is built
  single-threaded. This is not negotiable on this host.
- `Qt6::Test` drags in `Qt6::Concurrent`, which single-threaded Qt WASM does not have. The
  SENTINEL build is therefore a *separate minimal target*
  (`tools/wasm/sentinel-wasm-CMakeLists.txt`) linking `Qt6::Core` alone. SENTINEL's own
  CMakeLists is untouched and should stay that way — its Test dependency is correct for the
  desktop build.
- Qt6Core's WASM build uses embind. Linking fails with a wall of `_emval_decref` undefined
  until `-lembind` is added.
- Cypha's core is compiled **with** exceptions; do not link it `-fno-exceptions`.
- embind needs RTTI, and MathScript builds `-fno-rtti`. Use plain C exports and `cwrap`.

---

## 6. Outstanding work

### A. Two patches, not yet applied — the owner's repos, untouched

`tools/wasm/mathscript-portability.patch` and `tools/wasm/cypha-portability.patch`.
48 defects found by cross-compiling. **None are WebAssembly quirks — all affect native
builds.** They have not been pushed to `odin-loki/MathScript` or `odin-loki/Cypha`; the
owner has not given permission and it should be asked for explicitly.

The one that matters most:

> **Cypha `src/rff_features.cpp` — ORF row norm.** `init_rff_weights_orf` divided the chi
> draw by `d_in`, normalising every orthogonal row to unit length. Yu et al. (NeurIPS 2016)
> draw the norm from `chi_d` so an orthogonal row matches the Gaussian row it replaces — a
> `N(0, s² I_d)` row has norm `s·√d`, not `s`. Rows were `√d` too short, so the features
> approximated a *different kernel* and the error never converged.
>
> | D=256 | before | after |
> |---|---|---|
> | iid | 4.20 | 4.20 |
> | SORF | 8.31 | 8.31 |
> | **ORF** | **21.77** (plateaued) | **3.53** (best of three) |
>
> Deleting the division is the entire fix. This is silently degrading every native ORF user
> today. It was invisible natively because nothing compared the approximation against the
> exact kernel — compiling for the web is what ran that comparison.

Also in those patches: 43 Cypha files and 1 MathScript file using `std::max` / `std::fill` /
`std::size_t` without the include, working only because libstdc++ leaks them (breaks Apple
clang); MathScript's `-mavx2 -mfma` handed to every Clang; and MathScript's CPUID gated on
*compiler* rather than *architecture* — `#elif defined(__GNUC__) || defined(__clang__)` →
`#include <cpuid.h>`, which is broken on every aarch64 build today.

### B. Explicitly dropped

AEGIS (Rust), Cell AI (Python) and ParanoidBSD were investigated for WebAssembly and then
**cancelled by the owner** — "Forget about them." Do not restart this without being asked.

### C. Marketing

The 21 plain-English niches (3 per product, in each page's `#who` section) are a **first
draft written by an AI**, not the owner's market research. The owner's marketing contact
should correct them. ParanoidBSD's and AEGIS's are the least confident.

`/beta.html` recruits testers for all seven programs. Applications arrive as email with a
per-product subject line, so they filter cleanly. **SENTINEL is the best recruiting target** —
the only one marked "no coding needed", so crime analysts and fraud investigators can trial it
without a developer.

### D. Suggested next, not started

- The Kickstarter has **0 updates posted** and closes 12 November. Backers are the warmest
  possible beta-tester pool.
- Cypha could learn reading difficulty from word frequency and auto-expand glosses above a
  reader's demonstrated level, rather than waiting for a click.
- The dictionary trie already supports prefix walking; "did you mean" on the double-click
  lookup is unwired.

---

## 7. Verification checklist

Before any push to `main`:

```bash
./tools/build.sh                                    # regenerate
node --check assets/js/*.js assets/js/demos/*.js    # syntax
python3 tools/eval-search.py                        # expect 13/15 top-1, 15/15 top-3
# JSON-LD on all 61 pages — see §4
python3 -m http.server 8123 &
NODE_PATH=/opt/node22/lib/node_modules node tools/qa/responsive-audit.js   # expect 610/610
```

After pushing, verify against the **live** site rather than localhost — GitHub Pages takes
about a minute, and "it worked locally" has not been accepted as evidence in this repo.

---

## 8. Environment notes

- Outbound HTTPS goes through an agent proxy. It only serves GitHub repos the session knows
  about; use `add_repo` for third-party ones (xsimd and Capstone both needed it).
- Playwright and Chromium are preinstalled at `/opt/pw-browsers`; `playwright` is global, so
  set `NODE_PATH=/opt/node22/lib/node_modules`.
- Kickstarter's own page is Cloudflare-protected and usually refuses automation. Its
  `stats.json` endpoint is not, and returns live state, JSON, no auth.
- Writable disk is a fixed per-session allowance; `df` reports it misleadingly.
