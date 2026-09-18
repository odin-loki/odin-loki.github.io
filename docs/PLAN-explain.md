# Plan: "Explain" — hover, and every word, not just the marked ones

Three changes asked for, in order of how much they cost:

1. Rename the toolbar button from **"Explain the jargon"** to **"Explain"**.
2. Show the meaning on **hover**, not only on click.
3. Make Explain **general** — a reader should be able to ask what *any* word
   means, not only the 472 curated ones. That is what the WordNet dictionary is
   already there for; today it is reachable only by double-click, which nobody
   discovers.

Item 3 is the real change. Items 1 and 2 are small on their own, but 2 and 3
together force a different mechanism, so do them in the order below.

---

## Where things stand today

- `assets/js/glossary.js` walks the page once on load and wraps the **first**
  mention of each known term in `<button class="gloss" data-term="…">`. Click
  opens a popover. 472 curated terms, translated into nine languages.
- A separate `dblclick` handler on `#main` (line ~511) takes whatever word was
  double-clicked, looks it up in 78 WordNet shards under `assets/data/dict/`,
  and shows the same popover. Curated gloss wins where both exist.
- So the dictionary already works. It is just invisible: nothing on the page
  suggests double-clicking does anything.

## The mechanical problem with "hover any word"

Marking the first mention of 472 terms is cheap because it is 472 regex passes
over the DOM, once. **Hovering any word cannot work that way** — you would have
to wrap every word on the page in its own element, which is tens of thousands
of nodes, wrecks text selection, and breaks the i18n text-node contract the
whole build rests on.

The right mechanism is hit-testing at hover time:

```js
// The word under the pointer, without marking anything in advance.
const pos = document.caretPositionFromPoint(x, y)      // Firefox
         || document.caretRangeFromPoint(x, y);        // Chrome/Safari
// expand to word boundaries within that text node, then look it up
```

That gives you the word under the cursor on demand, with no DOM surgery. The
existing `.gloss` chips stay exactly as they are for the curated terms — they
are the discoverability affordance, and they also mark *which* words have a
hand-written explanation rather than a dictionary one.

So: **chips stay, hover is added on top and works everywhere.**

---

## Steps

### 1. Rename the button

`assets/i18n/en.json` key `tools.explain`: "Explain the jargon" → "Explain".

That is a translated string, so it needs the same change in the nine locale
files under `assets/i18n/`. Short word, no layout risk — it gets *shorter*,
which helps the phone toolbar.

While there: the button's stat span currently reads "N terms on this page" and
is hidden below 720px. With a general Explain that count is no longer the whole
truth, so either drop it or change it to something that is still true.

### 2. Hover, with the four things hover always needs

Hover is not just `mouseover`. Get these wrong and it is worse than clicking:

- **Intent delay.** ~250ms before opening, ~400ms before closing. Without it the
  popover strobes as the pointer crosses a paragraph.
- **Hoverable popover.** WCAG 2.1 §1.4.13: the reader must be able to move the
  pointer *into* the popover without it vanishing. Keep it open while the
  pointer is over either the word or the popover.
- **Dismissible.** Escape closes it, and it must not obscure the word it
  explains.
- **Touch has no hover.** `@media (hover: hover) and (pointer: fine)` gates the
  hover path; touch keeps tap-to-open, which is what the chips already do. Do
  not ship hover as the only way in — the whole reason this feature was invisible
  to a reviewer was that it was phone-hostile.

Keyboard: the chips are already `<button>`, so focus opens the popover for free.
Hit-tested words are not focusable and cannot be — that is an accepted limit,
and it is why the curated terms stay chips.

### 3. Fall through to the dictionary

One lookup path, tried in order:

1. curated glossary for this locale → hand-written gloss, marked as such
2. WordNet shard → dictionary definition, already labelled `WordNet` in the
   popover
3. nothing → no popover at all (do **not** show an empty box)

The shard index is by first two letters (`a_-d.json`, `ae-l.json`, …), so a
lookup is one fetch, cached after first use. Hovering across a paragraph must
not fire 40 fetches: debounce on the resolved word, and keep a
`Map<word, result>` for the session.

**The dictionary is English-only.** On a translated page, hovering a word gets a
curated gloss if the term is in that locale's 472, and otherwise nothing. Decide
whether that is acceptable or whether the fallthrough should be English-page-only.
My recommendation: English-only fallthrough, because a French reader getting an
English WordNet definition is worse than getting nothing.

---

## What to check before believing it works

- `node tools/qa/gloss-check.js` — the mid-word invariant. Hit-testing expands to
  word boundaries itself, so it needs the same Unicode-aware boundary the matcher
  uses; do not write a second `\w`-based one. That bug has been fixed twice here.
- `node tools/qa/gloss-reach.js --all` — the chips must still fire as they do now.
- `node tools/qa/responsive-audit.js --only=licensing` — the popover is
  position-fixed and can overflow at 320px.
- Hover manually at 320px in a desktop browser with touch emulation **off** and
  **on**, and confirm the touch path still opens on tap.

## Cost

Item 1 is an afternoon including translations. Item 2 is a day, most of it in the
hover-intent and WCAG behaviour rather than the opening itself. Item 3 is a day,
most of it in the caching and the decision above about translated pages.

## One thing worth reconsidering

"Explain" alone loses what the button *does*. A first-time reader sees a button
called Explain and does not know explain what. "Explain any word" is two words
longer and says it. Your call — the current label is certainly too long.
