# Translating what the demos say

Half of what a visitor reads on a product page is never in the HTML. It is
written by the demo while they use it — the verdict of the licence chooser, the
commentary on a syscall walk, what Cypha makes of the position on the board.

    python3 tools/i18n_demos.py extract              # re-scan the JS for D('...')
    python3 tools/i18n_demos.py dump  <demo> <code>  # English, one per line, still to do
    python3 tools/i18n_demos.py merge <demo> <code>  # reads English<TAB>translation
    python3 tools/i18n_demos.py stat                 # coverage

The demos, largest first:

| demo | strings | where |
|---|---|---|
| `licence` | 48 | the AGPL-vs-commercial chooser on `/licensing.html` |
| `capability` | 33 | the syscall walk on `/pbsd.html` |
| `chess` | 15 | the board on `/chess.html` |
| `cypha` | 13 | the live classifier on `/cypha.html` |
| `retdec` | 9 | bytes-to-algorithm on `/retdec.html` |
| `cellai` | 8 | the reaction-diffusion field on `/cellai.html` |
| `aegis` | 2 | the correlation attack on `/aegis.html` |
| `sentinel` | 2 | the hotspot canvas on `/sentinel.html` |

## Input format

The key is the English string, copied **exactly**:

    What are you?	¿Qué eres?
    An individual	Una persona

An unrecognised key aborts the whole batch, which is deliberate — a typo in the
key would silently produce a translation nothing ever reads.

**Pipe the input straight into `merge` in one command.** Do not write a
temporary file first: agents working on other languages share the same
scratchpad directory, and a file written in one call can be overwritten by
another agent before the next call reads it. That has already happened once and
put Spanish into the Portuguese catalogue.

## The rules

**`{n}` is a number the demo fills in.** `Checkmate in {n} moves.` must keep
`{n}`, and put it wherever the number belongs in your language.

**Some of these are labels on a canvas, not sentences.** `PERMITTED`,
`REFUSED`, `NO HANDLE`, `YOUR MOVE`. They are drawn into a small fixed space —
keep them short. If your language cannot say it in roughly the same width, pick
the shorter true word rather than the more precise long one.

**Names and identifiers stay as they are.** `AGPL-3.0+`, `AUD 50,000`,
`HardenedBSD`, `W^X`, `dir:/var/app`, `proc:debug`, `AES-128`, `ChaCha20`,
`Cypha`, `Result<T>`. Numbers follow local convention: `AUD 50,000` becomes
`AUD 50.000` in Spanish.

**Do not move a claim.** The licence chooser tells somebody what they are and
are not allowed to do; the capability walk says which requests are refused and
why. A translation that softens "Denied" or overstates "Allowed" is worse than
no translation. Keep every obligation exactly as strong as the English.

**Match the register.** Plain and direct. These are verdicts and status lines,
not marketing.
