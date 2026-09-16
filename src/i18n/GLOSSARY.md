# Translating the plain-English layer

`assets/data/glossary.json` holds 199 pieces of jargon and, for each, one or
two sentences a person with no background can read once and understand. The
translated versions live beside it as `glossary.<code>.json`.

    python3 tools/gen_glossary_locale.py dump  <code>   # term<TAB>English, still to do
    python3 tools/gen_glossary_locale.py merge <code>   # reads TSV on stdin
    python3 tools/gen_glossary_locale.py stat           # coverage

Input is tab separated, one term per line:

    kernel	El programa jefe dentro de un ordenador. Todo lo demás le pide permiso.	núcleo, kernel del sistema

Column 1 is the English term key, copied **exactly** — it is the join key and
an unknown one aborts the run. Column 2 is the explanation in the target
language. Column 3 is optional: how that idea is actually written on the
translated pages, comma separated. Those become extra matchers, which is what
makes the layer light up on a page that says *núcleo* rather than *kernel*.

## The one rule that matters

These are not definitions. A definition tells you what a word means to someone
who already knows. An explanation tells you what the thing *is* to someone who
does not.

> capability — a key that opens one door and nothing else. Give a program that
> key and it can only do that one thing.

Not "an unforgeable token conferring authority over a single resource". That is
the same fact written to impress, and it teaches nobody anything.

So, in the target language:

- **Short sentences.** One idea each. Two sentences is the usual length; three
  is the limit.
- **Everyday words only.** If a reader would have to look up a word in your
  explanation, the explanation has failed. Never explain jargon with jargon.
- **Concrete over abstract.** A lock, a key, a filing cabinet, a factory belt,
  a fingerprint. The English versions lean on these deliberately — find the
  comparison that works in your language rather than translating the English
  one word for word. If a metaphor does not travel, replace it.
- **Keep the honesty.** Where the English admits a limit — "roughly two in
  three serious holes are this one mistake", "claimed far more often than it is
  met" — the translation admits the same limit, at the same strength.
- **Names stay as they are.** ParanoidBSD, Cypha, HardenedBSD, FreeBSD, AGPL,
  DBSCAN, BLAS, Qt 6, C++23 and the rest are spelt the same everywhere.

Write for someone intelligent who simply has not met this word before. Not for
a child, and not for a colleague.
