# -*- coding: utf-8 -*-
"""Generate every architecture diagram on the site."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svg import *

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'img', 'diagrams')
os.makedirs(OUT, exist_ok=True)
written = []

def save(s, name):
    n = s.save(os.path.join(OUT, name))
    written.append((name, n))

# ============================================================ PBSD: port pipeline
def pbsd_pipeline():
    W, H = 1000, 300
    s = Svg(W, H, "The ParanoidBSD port pipeline: inventory, deterministic passes, "
                  "agent loop, and a verification gate that rejects work back into the loop")
    stages = [
        ("STAGE 1", "Inventory",  ["Score every C source", "c_inventory.csv"], TEAL),
        ("STAGE 2", "Deterministic passes", ["Safe rewrites, tiers 0–4", "No model involved"], TEAL),
        ("STAGE 3", "Agent loop", ["Fills refusals + stubs", "This is what funding buys"], VIOLET),
        ("STAGE 4", "Verification gate", ["Compile · ASan · UBSan", "Differential · IR"], AMBER),
    ]
    bw, gap, x0, y = 214, 30, 22, 66
    for i, (k, t, sub, acc) in enumerate(stages):
        x = x0 + i * (bw + gap)
        s.node(x, y, bw, 108, t, sub, accent=acc, kicker=k)
        if i < len(stages) - 1:
            s.line(x + bw + 6, y + 54, x + bw + gap - 8, y + 54, arrow=True)

    # the reject path — the part that makes the pipeline honest
    gx = x0 + 3 * (bw + gap)
    s.path(f"M{gx + bw/2} {y+108} L{gx + bw/2} {y+150} L{x0 + bw + gap + bw/2} {y+150} "
           f"L{x0 + bw + gap + bw/2} {y+112}", stroke=RED, sw=1.4, dash="5 4")
    s.parts.append(f'<path d="M{x0 + bw + gap + bw/2 - 5} {y+120} L{x0 + bw + gap + bw/2} {y+110} '
                   f'L{x0 + bw + gap + bw/2 + 5} {y+120}" fill="none" stroke="{RED}" stroke-width="1.4"/>')
    s.text(W/2, y + 168, "rejected — agent_port_failures.jsonl", size=11, fill=RED,
           anchor="middle", family=MONO)

    s.text(22, 32, "How a file becomes a ported file", size=15, fill=INK, weight=600)
    s.caption(22, H - 16, "A file that only compiles is unverified. Nothing counts as done until "
                          "differential or IR verification passes.")
    save(s, "pbsd-pipeline.svg")

# ============================================================ PBSD: authority models
def pbsd_authority():
    W, H = 1000, 330
    s = Svg(W, H, "Two authority models compared: under ambient authority a process can name every "
                  "resource and is refused afterwards; under the handle nucleus it can only name "
                  "what it holds a handle to")
    half = (W - 66) / 2

    # state: "allow" — reached; "refused" — the request was formed, then denied;
    # "unreachable" — no name exists to ask with in the first place.
    def panel(x, title, kicker, accent, rows, note):
        s.rect(x, 56, half, 226, r=14, fill=BG, stroke=LINE)
        s.text(x + 20, 82, title, size=14.5, fill=INK, weight=600)
        s.text(x + 20, 100, kicker, size=10, fill=accent, family=MONO, spacing="1", upper=True)
        s.rect(x + 20, 118, 108, 52, r=8, fill=PANEL, stroke=LINE_2)
        s.text(x + 74, 140, "process", size=11.5, fill=INK, anchor="middle")
        s.text(x + 74, 156, "uid 1001", size=9.5, fill=INK_MUTE, anchor="middle", family=MONO)
        ry = 112
        for i, (label, state) in enumerate(rows):
            yy = ry + i * 30
            col = {"allow": accent, "refused": RED, "unreachable": LINE_2}[state]
            s.rect(x + 196, yy, half - 216, 24, r=6,
                   fill=PANEL if state != "unreachable" else "none",
                   stroke=col, sw=1, opacity=1 if state != "unreachable" else .5)
            s.text(x + 206, yy + 16, label, size=10.5,
                   fill=INK_DIM if state != "unreachable" else INK_MUTE, family=MONO)
            # A refused request still travelled — that is the point of the comparison.
            s.line(x + 130, 144, x + 192, yy + 12, stroke=col, sw=1.1,
                   dash=None if state != "unreachable" else "3 3",
                   opacity=.85 if state != "unreachable" else .28,
                   arrow=(state != "unreachable"))
            if state == "refused":
                s.text(x + half - 30, yy + 16, "denied after the fact", size=9,
                       fill=RED, anchor="end", family=MONO)
        s.caption(x + 20, 266, note, size=10.5)

    panel(22, "Ambient authority", "traditional unix", AMBER, [
            ("socket()", "allow"),
            ("execve(\"/bin/sh\")", "allow"),
            ("ptrace(sibling)", "allow"),
            ("/etc/master.passwd", "refused"),
          ],
          "It can name everything. The check comes after.")
    panel(22 + half + 22, "Handle nucleus", "paranoidbsd", TEAL, [
            ("dir:/var/app → config", "allow"),
            ("socket()", "unreachable"),
            ("execve()", "unreachable"),
            ("/etc/master.passwd", "unreachable"),
          ],
          "No handle, no name, no request to refuse.")

    s.text(22, 32, "Where the check happens", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "solid = the request travels · dashed = it cannot be formed", size=11,
           fill=INK_MUTE, anchor="end", family=MONO)
    save(s, "pbsd-authority.svg")

# ============================================================ Cypha: architecture
def cypha_stack():
    W, H = 1000, 340
    s = Svg(W, H, "The Cypha pipeline: encoder, projection, world prior, class differentials, "
                  "memory and tiered context, ending in a classification with confidence and "
                  "an out-of-distribution flag")
    layers = [
        ("Encoder", "Vector · RFF · Concat", TEAL),
        ("EncoderProjection", "Fisher–Rao contrastive", TEAL),
        ("WorldPrior θ₀", "diagonal Gaussian, Welford", VIOLET),
        ("ClassDifferential Δk", "natural-parameter offsets", VIOLET),
        ("DIFMemory", "log-likelihood ratios", TEAL),
        ("TieredContextBuffer", "short · mid · long", TEAL),
    ]
    x, y, bw, bh, gap = 22, 74, 152, 96, 5.6
    for i, (t, sub, acc) in enumerate(layers):
        xx = x + i * (bw + gap)
        s.rect(xx, y, bw, bh, r=9, fill=PANEL, stroke=LINE_2)
        s.rect(xx, y, bw, 3, r=1.5, fill=acc, stroke="none")
        # wrap the title if needed
        s.text(xx + bw/2, y + 34, t, size=12.5, fill=INK, anchor="middle", weight=600)
        s.text(xx + bw/2, y + 54, sub, size=10, fill=INK_DIM, anchor="middle")
        if i < len(layers) - 1:
            s.line(xx + bw + .5, y + bh/2, xx + bw + gap - 1.5, y + bh/2, stroke=LINE_2, sw=1.2)

    # input / output rails
    s.text(22, 60, "raw input", size=10, fill=INK_MUTE, family=MONO, upper=True, spacing="1")
    s.text(W - 22, 60, "argmax + confidence", size=10, fill=TEAL, family=MONO,
           anchor="end", upper=True, spacing="1")

    oy = y + bh + 30
    outs = [("class", TEAL), ("confidence", TEAL), ("anomaly score", AMBER), ("OOD flag", RED)]
    ox = 22
    for label, col in outs:
        w = s.chip(ox, oy, label, accent=col)
        ox += w + 10
    s.text(22, 32, "One type, four jobs", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "classify · regress · sample latents · generate", size=11,
           fill=INK_MUTE, anchor="end", family=MONO)
    s.caption(22, H - 16, "Every layer exists because one of the four formal programmes demands it — "
                          "MDL priors, natural gradient, active inference, information bottleneck.")
    save(s, "cypha-stack.svg")

# ============================================================ Chess distillation
def chess_distill():
    W, H = 1000, 290
    s = Svg(W, H, "How Cypha learned chess: a verified reference engine labels positions, those "
                  "become features, and Cypha's regression head is fitted to reproduce the "
                  "engine's evaluation")
    steps = [
        ("TEACHER", "Reference engine", ["0x88, alpha-beta,", "quiescence · perft-verified"], TEAL),
        ("DATA", "26,568 positions", ["self-play, randomised", "labelled at depth 4"], TEAL),
        ("FEATURES", "388 dimensions", ["384 piece-square", "+ pair, doubled, mobility, phase"], VIOLET),
        ("FIT", "Cypha head", ["WorldPrior whitening,", "NLMS, MDL decay, replay"], VIOLET),
        ("RESULT", "9.4 KB of weights", ["held-out R² 0.866", "5W–19L–6D vs teacher"], AMBER),
    ]
    bw, gap, x0, y = 178, 18, 22, 68
    for i, (k, t, sub, acc) in enumerate(steps):
        x = x0 + i * (bw + gap)
        s.node(x, y, bw, 112, t, sub, accent=acc, kicker=k)
        if i < len(steps) - 1:
            s.line(x + bw + 3, y + 56, x + bw + gap - 5, y + 56, arrow=True)
    s.text(22, 32, "Distillation, not discovery", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "the architecture is unchanged — only the features are chess", size=11,
           fill=INK_MUTE, anchor="end", family=MONO)
    s.caption(22, H - 16, "Cypha reproduced an evaluation function it was shown. It did not learn "
                          "chess from scratch, and nothing here claims it did.")
    save(s, "chess-distill.svg")

# ============================================================ RetDec ladder
def retdec_ladder():
    W, H = 1000, 330
    s = Svg(W, H, "The abstraction ladder a function climbs: raw bytes, disassembly, lifted IR, "
                  "C pseudocode, and finally the named algorithm")
    rungs = [
        ("Raw bytes",     "63 7c 77 7b f2 6b 6f c5", INK_MUTE, 0),
        ("Disassembly",   "rol eax, 0x8   ; RotWord", BLUE, 1),
        ("Lifted IR",     "%rot = fshl.i32(%prev, 8)", BLUE, 2),
        ("C pseudocode",  "t = (t << 8) | (t >> 24);", TEAL, 3),
        ("Semantics",     "AES-128 key expansion, FIPS-197 §5.2", AMBER, 4),
    ]
    x, bw, bh, gy = 22, W - 44, 44, 62
    for i, (label, sample, col, idx) in enumerate(rungs):
        y = gy + i * 50
        inset = idx * 26
        s.rect(x + inset, y, bw - inset, bh, r=8, fill=PANEL if i < 4 else PANEL_2,
               stroke=col if i == 4 else LINE_2, sw=1.4 if i == 4 else 1)
        s.rect(x + inset, y, 3, bh, r=1.5, fill=col, stroke="none")
        s.text(x + inset + 16, y + 20, label, size=12.5, fill=INK, weight=600)
        s.text(x + inset + 16, y + 36, sample, size=10.5, fill=INK_DIM, family=MONO)
        if i < 4:
            s.line(x + inset + 40, y + bh + 1, x + inset + 40, y + 48, stroke=LINE_2, sw=1.2, arrow=True)
    s.text(22, 32, "What a decompiler should return", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "the last rung is the product", size=11, fill=AMBER,
           anchor="end", family=MONO)
    s.caption(22, H - 16, "Pseudocode tells you what the bytes do. The semantic layer tells you "
                          "which specification they implement.")
    save(s, "retdec-ladder.svg")

# ============================================================ MathScript domains
def mathscript_domains():
    W, H = 1000, 320
    s = Svg(W, H, "MathScript's six library domains over an in-tree linear algebra core, "
                  "with Result<T> error handling throughout")
    domains = [
        ("Core systems", ["dense + sparse linalg", "LU · QR · SVD · eig · Cholesky"], TEAL),
        ("Numerical", ["ODE · PDE · FEM · CFD", "special functions, quadrature"], TEAL),
        ("Statistics & ML", ["distributions, inference", "regression, optimisation"], VIOLET),
        ("Applied", ["signal · image", "control · finance"], VIOLET),
        ("Symbolic", ["computer algebra", "alongside the numerics"], BLUE),
        ("Specialised", ["graphs · geometry", "topology · quantum"], BLUE),
    ]
    cols, bw, gap, x0, y0 = 3, 306, 22, 22, 62
    for i, (t, sub, acc) in enumerate(domains):
        cx = x0 + (i % cols) * (bw + gap)
        cy = y0 + (i // cols) * 96
        s.node(cx, cy, bw, 82, t, sub, accent=acc)
    # the base rail
    s.rect(22, 258, W - 44, 34, r=8, fill=PANEL_2, stroke=LINE_2)
    s.text(38, 280, "Result<T> — no exceptions, no raw pointers, no unsafe casts", size=11.5,
           fill=TEAL, family=MONO)
    s.text(W - 38, 280, "35 static libraries · 816 CTest suites", size=11,
           fill=INK_MUTE, anchor="end", family=MONO)
    s.text(22, 32, "One library, six domains", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "no Eigen, no OpenBLAS — the kernels are in-tree", size=11,
           fill=INK_MUTE, anchor="end", family=MONO)
    save(s, "mathscript-domains.svg")

# ============================================================ AEGIS wire profile
def aegis_wire():
    W, H = 1000, 340
    s = Svg(W, H, "Two wire profiles: unshaped traffic where bursts are traceable between "
                  "sender and receiver, and constant-rate shaped traffic where the wire is flat")
    import math, random
    random.seed(11)

    def trace(x, y, w, h, shaped, colour, label, sub):
        s.rect(x, y, w, h, r=9, fill=BG, stroke=LINE)
        s.text(x + 14, y + 22, label, size=12.5, fill=INK, weight=600)
        s.text(x + 14, y + 38, sub, size=10.5, fill=INK_DIM)
        base = y + h - 22
        amp = h - 74
        n = 130
        pts = []
        for i in range(n):
            t = i / (n - 1)
            if shaped:
                v = 0.62 + random.uniform(-0.012, 0.012)
            else:
                burst = 1 if (i % 26) < 7 else 0
                v = burst * (0.55 + random.uniform(0, 0.35))
            pts.append((x + 14 + t * (w - 28), base - v * amp))
        s.poly(pts, stroke=colour, sw=1.5)
        s.line(x + 14, base, x + w - 14, base, stroke=LINE, sw=1)
        return base

    half = (W - 66) / 2
    trace(22, 62, half, 132, False, AMBER, "Unshaped", "volume and timing carry the signal")
    trace(22 + half + 22, 62, half, 132, True, TEAL, "Constant-rate shaped",
          "the wire says the same thing regardless")

    # what the adversary concludes
    s.rect(22, 214, half, 74, r=9, fill=PANEL, stroke=RED, sw=1.2)
    s.text(38, 238, "Relationship graph recovered", size=12.5, fill=RED, weight=600)
    s.text(38, 258, "~3.4 of 5 pairs correct from volume alone.", size=11, fill=INK_DIM)
    s.text(38, 275, "No cipher was broken.", size=11, fill=INK_MUTE)

    s.rect(22 + half + 22, 214, half, 74, r=9, fill=PANEL, stroke=TEAL, sw=1.2)
    s.text(38 + half + 22, 238, "Nothing above chance", size=12.5, fill=TEAL, weight=600)
    s.text(38 + half + 22, 258, "~0.8 of 5 — chance is 1. Correlation has", size=11, fill=INK_DIM)
    s.text(38 + half + 22, 275, "nothing to bite on. Cost: bandwidth and latency.", size=11, fill=INK_MUTE)

    s.text(22, 32, "What the adversary actually sees", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "a global passive observer, watching every link", size=11,
           fill=INK_MUTE, anchor="end", family=MONO)
    save(s, "aegis-wire.svg")

# ============================================================ SENTINEL pipeline
def sentinel_pipeline():
    W, H = 1000, 300
    s = Svg(W, H, "The SENTINEL pipeline from ingest through models to ranked leads, with a "
                  "provenance rail running underneath every stage")
    stages = [
        ("INGEST", "Sources", ["UK Police API, CSV,", "weather · quality scoring"], TEAL),
        ("NLP", "Rule-based", ["modus operandi,", "crime classification"], TEAL),
        ("MODELS", "Statistical", ["Poisson · Hawkes · DBSCAN", "KDE · Gaussian process"], VIOLET),
        ("INFERENCE", "Analysis", ["Rossmo profiling, MO,", "co-offending PageRank"], VIOLET),
        ("OUTPUT", "Ranked leads", ["every one traceable to", "its source record"], AMBER),
    ]
    bw, gap, x0, y = 178, 18, 22, 66
    for i, (k, t, sub, acc) in enumerate(stages):
        x = x0 + i * (bw + gap)
        s.node(x, y, bw, 108, t, sub, accent=acc, kicker=k)
        if i < len(stages) - 1:
            s.line(x + bw + 3, y + 54, x + bw + gap - 5, y + 54, arrow=True)
    # provenance rail
    ry = y + 122
    s.rect(22, ry, W - 44, 34, r=8, fill=PANEL_2, stroke=TEAL, sw=1, opacity=.9)
    s.text(38, ry + 22, "Provenance chain — source record · model · parameters, at every stage",
           size=11.5, fill=TEAL, family=MONO)
    for i in range(5):
        x = x0 + i * (bw + gap) + bw / 2
        s.line(x, y + 108, x, ry, stroke=TEAL, sw=1, dash="3 3", opacity=.45)
    s.text(22, 32, "Ingest to lead, with the receipt attached", size=15, fill=INK, weight=600)
    s.caption(22, H - 14, "If an analyst cannot show why a lead ranked where it did, it should not "
                          "be a lead. That is why the audit log is one of the nine pages.")
    save(s, "sentinel-pipeline.svg")

# ============================================================ Cell AI signal path
def cellai_path():
    W, H = 1000, 300
    s = Svg(W, H, "The Cell AI signal path, from token embedding through the reaction-diffusion "
                  "core and in-forward plasticity to output logits")
    chain = [
        ("cl100k_base", "embedding", TEAL),
        ("CellularPDE", "N=4 · D=256 · λ=0.01", VIOLET),
        ("Metaplasticity", "BCM, in forward pass", VIOLET),
        ("MemoryFormation", "", TEAL),
        ("ResonanceSystem", "FFT phase coupling", TEAL),
        ("CrystalLattice", "K = 3", TEAL),
        ("MultiModal", "routing → logits", BLUE),
    ]
    x, y, bw, bh, gap = 22, 76, 128, 84, 6
    for i, (t, sub, acc) in enumerate(chain):
        xx = x + i * (bw + gap)
        s.rect(xx, y, bw, bh, r=8, fill=PANEL, stroke=LINE_2)
        s.rect(xx, y, bw, 3, r=1.5, fill=acc, stroke="none")
        s.text(xx + bw/2, y + 34, t, size=11, fill=INK, anchor="middle", weight=600)
        if sub:
            s.text(xx + bw/2, y + 52, sub, size=9, fill=INK_DIM, anchor="middle")
        if i < len(chain) - 1:
            s.line(xx + bw + .5, y + bh/2, xx + bw + gap - 1.5, y + bh/2, stroke=LINE_2, sw=1.2)

    # the honest scoreboard
    sy = y + bh + 28
    s.rect(22, sy, W - 44, 62, r=9, fill=PANEL_2, stroke=RED, sw=1.1)
    s.text(38, sy + 24, "Cell AI v1  ·  training perplexity 450,000 – 1,180,000", size=12.5,
           fill=RED, weight=600)
    s.text(38, sy + 44, "GPT-2 baseline  ·  ~20.    Four orders of magnitude, published on the "
                        "README's first screen.", size=11, fill=INK_DIM)
    s.text(22, 32, "What replaces attention", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "125.8M parameters", size=11, fill=INK_MUTE, anchor="end", family=MONO)
    save(s, "cellai-path.svg")

# ============================================================ Homepage: the catalogue
def imortek_map():
    W, H = 1000, 360
    s = Svg(W, H, "How the Imortek products relate: a secured operating system underneath, "
                  "original AI architectures, and analysis tools, all sharing one verification standard")
    bands = [
        ("SYSTEMS", 62, [("ParanoidBSD", "capability-secured C++23 OS", AMBER),
                         ("AEGIS", "metadata-hiding transport", TEAL)]),
        ("INTELLIGENCE", 168, [("Cypha", "first-principles AI", TEAL),
                               ("Cell AI", "reaction-diffusion model", VIOLET)]),
        ("TOOLS", 250, [("RetDec Imortek", "specification-extraction decompiler", BLUE),
                        ("MathScript", "computer algebra + numerics", VIOLET),
                        ("SENTINEL", "crime analytics", BLUE)]),
    ]
    for kicker, y, items in bands:
        s.text(22, y - 10, kicker, size=9.5, fill=INK_MUTE, family=MONO, spacing="1.4", upper=True)
        n = len(items)
        gap = 18
        bw = (W - 44 - gap * (n - 1)) / n
        for i, (name, desc, acc) in enumerate(items):
            x = 22 + i * (bw + gap)
            h = 74 if kicker != "TOOLS" else 66
            s.node(x, y, bw, h, name, desc, accent=acc)
    # the shared standard underneath
    s.rect(22, 326, W - 44, 26, r=6, fill="none", stroke=TEAL, sw=1, dash="4 4", opacity=.55)
    s.text(W/2, 343, "one standard: compile-only is unverified · models never self-certify · "
                     "limitations on the front page", size=10.5, fill=TEAL, anchor="middle", family=MONO)
    s.text(22, 32, "Seven systems, one engineering standard", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "AGPL-3.0+ with a commercial tier", size=11, fill=INK_MUTE,
           anchor="end", family=MONO)
    save(s, "imortek-map.svg")

# ============================================================ Licensing decision
def licence_flow():
    W, H = 1000, 290
    s = Svg(W, H, "Licensing decision: individuals, charities, education and organisations under "
                  "AUD 50,000 use AGPL-3.0+ free; everyone else, and anyone needing private "
                  "modifications, takes a commercial licence")
    s.node(22, 96, 210, 86, "Who are you?", ["individual · charity", "education · company"],
           accent=INK_MUTE, kicker="START")
    s.line(238, 139, 288, 139, arrow=True)
    s.node(294, 62, 210, 76, "Under AUD 50,000/yr?", ["or not a company at all"], accent=TEAL)
    s.node(294, 160, 210, 76, "AUD 50,000 or more", ["or modifications must stay private"], accent=VIOLET)
    s.line(510, 100, 560, 100, arrow=True)
    s.line(510, 198, 560, 198, arrow=True)
    s.node(566, 62, 412, 76, "AGPL-3.0 or later — free", [
        "Publish modifications · keep the attribution line · network use counts as distribution"],
        accent=TEAL, kicker="NO COST")
    s.node(566, 160, 412, 76, "Commercial licence", [
        "Keep modifications private · no copyleft reach · tiered by organisation size"],
        accent=VIOLET, kicker="QUOTED PER ENQUIRY")
    s.text(22, 32, "Which licence applies to you", size=15, fill=INK, weight=600)
    s.caption(22, H - 14, "HardenedBSD-derived code in ParanoidBSD stays BSD and is covered by neither.")
    save(s, "licence-flow.svg")

# ============================================================ Evidence tiers
def evidence_tiers():
    W, H = 1000, 230
    s = Svg(W, H, "The four evidence levels used across the research shelf, from speculative "
                  "through design and reference implementation to result-bearing")
    tiers = [
        ("Speculative", "theory or design only", RED, 1),
        ("Design document", "specified; implementation partial", AMBER, 2),
        ("Reference implementation", "code exists and runs", BLUE, 3),
        ("Result-bearing", "experiments run, numbers reported", TEAL, 4),
    ]
    bw, gap, x0, ybase = 232, 20, 22, 190
    for i, (t, sub, col, fill_n) in enumerate(tiers):
        x = x0 + i * (bw + gap)
        h = 34 + i * 26
        s.rect(x, ybase - h, bw, h, r=8, fill=PANEL, stroke=col, sw=1.2)
        s.text(x + 14, ybase - h + 22, t, size=12.5, fill=col, weight=600)
        s.text(x + 14, ybase + 18, sub, size=10.5, fill=INK_DIM)
        # tier meter
        for k in range(4):
            s.rect(x + 14 + k * 18, ybase - 12, 13, 4, r=2,
                   fill=col if k < fill_n else LINE_2, stroke="none")
    s.text(22, 32, "How to read anything on the research shelf", size=15, fill=INK, weight=600)
    s.text(W - 22, 32, "no item reaches a fifth level", size=11, fill=INK_MUTE,
           anchor="end", family=MONO)
    s.caption(22, H - 12, "There is no “validated” tier in use, because nothing here has been "
                          "independently replicated or externally audited.")
    save(s, "evidence-tiers.svg")

for fn in (pbsd_pipeline, pbsd_authority, cypha_stack, chess_distill, retdec_ladder,
           mathscript_domains, aegis_wire, sentinel_pipeline, cellai_path,
           imortek_map, licence_flow, evidence_tiers):
    fn()

print("wrote %d diagrams" % len(written))
for n, b in written:
    print("  %-28s %5.1f KB" % (n, b / 1024))
