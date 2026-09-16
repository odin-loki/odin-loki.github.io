# Translating a page

Everything a translator touches lives in `src/i18n/segments.<code>.json`.
Nothing else is edited by hand — the HTML at `<code>/*.html` is generated.

    python3 tools/i18n_segments.py dump  <slug> <code>   # English, numbered
    python3 tools/i18n_segments.py merge <slug> <code>   # reads index<TAB>text
    python3 tools/i18n_segments.py cover <slug> <code>   # percent done, by word

`dump` prints one line per segment, in reading order:

    12 	Nothing is done until it is verified.
    13=	Compile-only is unverified.

A `=` after the number means that segment is already translated. Leave those
alone unless they are wrong. `merge` takes the same numbers back, tab separated,
on standard input:

    python3 tools/i18n_segments.py merge pbsd es <<'T'
    12	Nada está hecho hasta que está verificado.
    T

## The rules

**Keep every HTML entity exactly as it appears.** `&middot;` `&mdash;` `&rsquo;`
`&hellip;` `&amp;` `&ldquo;` `&rdquo;` `&rarr;` `&lt;` `&gt;` `&nbsp;` `&copy;`
`&ndash;`. They are markup, not text. A segment that reads
`Result&lt;T&gt;, no exceptions` keeps `&lt;` and `&gt;` where they are.

**Leave these in English**, in every language: ParanoidBSD, PBSD, Cypha,
RetDec Imortek, MathScript, AEGIS, SENTINEL, Cell AI, Imortek, Odin Loch,
HardenedBSD, FreeBSD, Kickstarter, GitHub, KDE Plasma 6, Qt 6, AGPL-3.0+,
BSD, C, C++23, Rust, Python, LLVM, Clang, ELF, PE, WASM, ASan, UBSan,
DBSCAN, BLAS, LAPACK, CTest — along with file paths, URLs, code, version
strings and command names.

**Do not move a claim.** This site's whole argument is that every number is
checkable. "roughly two in three" must not become "most", "is not externally
reviewed" must not soften, and a hedge that is in the English has to be in the
translation. If a sentence is uncomfortable in English it stays uncomfortable.

**Match the register.** Plain, direct, unsentimental. No marketing warmth that
is not in the original, no exclamation marks, no words added to sound serious.
Where the English is blunt — "Dropping the gates would make the whole exercise
pointless" — be blunt.

**Numbers follow local convention.** 10,000 is 10 000 in French and 10.000 in
Spanish. Dates are written the way the language writes them. Currency stays AUD.

**Keywords** — the last segment of each page — are the one string that is not
translated. Write what somebody searching in that language would actually type,
keeping the Latin product names, which people search as they are spelt.
