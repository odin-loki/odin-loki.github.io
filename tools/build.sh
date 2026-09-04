#!/usr/bin/env bash
# ---------------------------------------------------------------
# Imortek static site builder.
# Wraps each body in src/pages/*.html with the shared head/header/footer
# and writes the result to the repo root for GitHub Pages.
#
#   ./tools/build.sh
#
# Edit src/pages/*.html — never the generated files at the root.
# ---------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

SITE_URL="https://imortek.com.au"
BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

emit_head() {
  local title="$1" desc="$2" slug="$3" extra_css="$4" og_type="$5"
  local canon="$SITE_URL/"
  [[ "$slug" != "index" ]] && canon="$SITE_URL/$slug.html"
  cat <<HEAD
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>$title</title>
<meta name="description" content="$desc">
<meta name="author" content="Odin Loch — Imortek">
<meta name="theme-color" content="#06080b">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="$canon">

<meta property="og:site_name" content="Imortek">
<meta property="og:type" content="$og_type">
<meta property="og:title" content="$title">
<meta property="og:description" content="$desc">
<meta property="og:url" content="$canon">
<meta property="og:image" content="$SITE_URL/assets/img/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$title">
<meta name="twitter:description" content="$desc">
<meta name="twitter:image" content="$SITE_URL/assets/img/og.png">

<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/mark.svg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/css/main.css">
$extra_css
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="progress-bar" aria-hidden="true"></div>

<header class="site-header">
  <div class="wrap">
    <nav class="nav" aria-label="Primary">
      <a class="brand" href="/">
        <svg class="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="bg1" x1="0" y1="0" x2="32" y2="32">
              <stop offset="0%" stop-color="#5eead4"/><stop offset="100%" stop-color="#a78bfa"/>
            </linearGradient>
          </defs>
          <path d="M16 2.5 28.5 9v14L16 29.5 3.5 23V9z" stroke="url(#bg1)" stroke-width="1.6" fill="rgba(94,234,212,.06)"/>
          <path d="M16 9.5 22.5 13v6L16 22.5 9.5 19v-6z" fill="url(#bg1)" opacity=".9"/>
          <circle cx="16" cy="16" r="1.9" fill="#06080b"/>
        </svg>
        <span>Imortek</span>
        <span class="brand__sub">Research &amp; Systems</span>
      </a>

      <button class="nav__toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Toggle navigation">
        <span></span>
      </button>

      <div class="nav__links" id="nav-links">
        <div class="nav__group">
          <a class="nav__link" href="/#products" aria-haspopup="true">Products</a>
          <div class="nav__menu">
            <a href="/pbsd.html"><strong>ParanoidBSD</strong><span>Capability-secured C++23 operating system</span></a>
            <a href="/cypha.html"><strong>Cypha</strong><span>First-principles AI — classify, sample, generate</span></a>
            <a href="/chess.html"><strong>Cypha Chess</strong><span>Play the model, distilled from a real engine</span></a>
            <a href="/retdec.html"><strong>RetDec Imortek</strong><span>Specification-extraction decompiler</span></a>
            <a href="/mathscript.html"><strong>MathScript</strong><span>C++23 computer algebra &amp; numerics</span></a>
            <a href="/aegis.html"><strong>AEGIS</strong><span>Metadata-hiding transport</span></a>
            <a href="/sentinel.html"><strong>SENTINEL</strong><span>Crime analytics &amp; investigative leads</span></a>
            <a href="/cellai.html"><strong>Cell AI</strong><span>Reaction-diffusion sequence model</span></a>
          </div>
        </div>
        <a class="nav__link" href="/research.html">Research</a>
        <a class="nav__link" href="/licensing.html">Licensing</a>
        <a class="nav__link" href="/about.html">About</a>
        <a class="nav__link" href="/kickstarter.html">Kickstarter</a>
        <a class="btn btn--fund btn--sm nav__cta" href="/kickstarter.html">Back PBSD</a>
      </div>
    </nav>
  </div>
</header>

<main id="main">
HEAD
}

emit_foot() {
  local extra_js="$1"
  cat <<FOOT
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer__grid">
      <div class="footer__col">
        <a class="brand" href="/" style="margin-bottom:14px">
          <svg class="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <defs><linearGradient id="fg1" x1="0" y1="0" x2="32" y2="32">
              <stop offset="0%" stop-color="#5eead4"/><stop offset="100%" stop-color="#a78bfa"/>
            </linearGradient></defs>
            <path d="M16 2.5 28.5 9v14L16 29.5 3.5 23V9z" stroke="url(#fg1)" stroke-width="1.6" fill="rgba(94,234,212,.06)"/>
            <path d="M16 9.5 22.5 13v6L16 22.5 9.5 19v-6z" fill="url(#fg1)" opacity=".9"/>
            <circle cx="16" cy="16" r="1.9" fill="#06080b"/>
          </svg>
          <span>Imortek</span>
        </a>
        <p class="small muted" style="max-width:38ch">
          Independent research and systems software by Odin Loch. Sydney, Australia.
          Source-available under AGPL-3.0+ with a tiered commercial licence.
        </p>
        <div class="badge-row" style="margin-top:16px">
          <span class="badge badge--teal">AGPL-3.0+</span>
          <span class="badge">Commercial licence available</span>
        </div>
      </div>

      <div class="footer__col">
        <h4>Products</h4>
        <ul>
          <li><a href="/pbsd.html">ParanoidBSD</a></li>
          <li><a href="/cypha.html">Cypha</a></li>
          <li><a href="/chess.html">Cypha Chess</a></li>
          <li><a href="/retdec.html">RetDec Imortek</a></li>
          <li><a href="/mathscript.html">MathScript</a></li>
          <li><a href="/aegis.html">AEGIS</a></li>
          <li><a href="/sentinel.html">SENTINEL</a></li>
          <li><a href="/cellai.html">Cell AI</a></li>
        </ul>
      </div>

      <div class="footer__col">
        <h4>Company</h4>
        <ul>
          <li><a href="/about.html">About Imortek</a></li>
          <li><a href="/research.html">Research shelf</a></li>
          <li><a href="/licensing.html">Licensing</a></li>
          <li><a href="/kickstarter.html">PBSD Kickstarter</a></li>
          <li><a data-email data-subject="Commercial licence enquiry" href="#">Commercial enquiries</a></li>
        </ul>
      </div>

      <div class="footer__col">
        <h4>Source</h4>
        <ul>
          <li><a href="https://github.com/odin-loki" target="_blank" rel="noopener">GitHub profile</a></li>
          <li><a href="https://github.com/odin-loki/ParanoidBSD" target="_blank" rel="noopener">ParanoidBSD repo</a></li>
          <li><a href="https://github.com/odin-loki/Ideas" target="_blank" rel="noopener">Ideas / research</a></li>
          <li><a href="https://www.gnu.org/licenses/agpl-3.0.en.html" target="_blank" rel="noopener">AGPL-3.0 text</a></li>
          <li><a href="/sitemap.xml">Sitemap</a></li>
        </ul>
      </div>
    </div>

    <div class="footer__bottom">
      <span>&copy; 2025&ndash;<span data-year>2026</span> Odin Loch, trading as Imortek. Sydney, Australia.</span>
      <span class="mono tiny">Built $BUILT &middot; No trackers, no cookies, no analytics.</span>
    </div>
  </div>
</footer>

<script src="/assets/js/site.js" defer></script>
$extra_js
</body>
</html>
FOOT
}

# slug~title~description~extra_css~extra_js~og_type
PAGES=(
"index~Imortek — Secure systems, original AI, and honest engineering~Imortek builds ParanoidBSD, Cypha, RetDec Imortek, MathScript, AEGIS and SENTINEL — source-available systems software under AGPL-3.0+ with commercial licensing. By Odin Loch, Sydney.~~<script src=\"/assets/js/demos/lattice.js\" defer></script>~website"
"pbsd~ParanoidBSD — a capability-secured C++23 operating system | Imortek~ParanoidBSD (PBSD) ports HardenedBSD 15-STABLE to C++23 with KDE Plasma 6 and a capability/handle security nucleus. Explore the interactive security model.~~<script src=\"/assets/js/demos/capability.js\" defer></script>~product"
"cypha~Cypha — a first-principles AI architecture | Imortek~Cypha unifies classification, regression, latent sampling and generation in one type. Built from AIXI/MDL, information geometry, active inference and the information bottleneck. Try the live classifier.~~<script src=\"/assets/js/demos/cypha.js\" defer></script>~product"
"retdec~RetDec Imortek — specification-extraction decompiler | Imortek~A decompiler that recovers algorithms, concurrency patterns and serialization formats from binaries — not just pseudocode. Qt 6 GUI, optional offline neural refinement.~~<script src=\"/assets/js/demos/retdec.js\" defer></script>~product"
"mathscript~MathScript — C++23 computer algebra and numerics | Imortek~Dense and sparse linear algebra, ODE/PDE/FEM, statistics, optimisation and a symbolic CAS in one C++23 library with in-tree BLAS/LAPACK. Try the live plotter.~~<script src=\"/assets/js/demos/mathscript.js\" defer></script>~product"
"aegis~AEGIS — metadata-hiding transport for consortiums | Imortek~Traffic-analysis resistant transport that hides who talks to whom, when, and how much. Constant-rate mixnet plus a bulk plane. Run the live correlation attack.~~<script src=\"/assets/js/demos/aegis.js\" defer></script>~product"
"sentinel~SENTINEL — crime analytics and investigative leads | Imortek~A C++23 / Qt 6 analyst tool: Poisson and Hawkes models, DBSCAN series detection, KDE hotspots and Rossmo geographic profiling, with full provenance. Try the live hotspot model.~~<script src=\"/assets/js/demos/sentinel.js\" defer></script>~product"
"cellai~Cell AI — a reaction-diffusion sequence model | Imortek~A deliberately non-transformer architecture: partition dynamics, in-forward Hebbian/BCM plasticity, spectral PDE. An honest research log. Run the live simulation.~~<script src=\"/assets/js/demos/cellai.js\" defer></script>~product"
"chess~Play chess against Cypha | Imortek~Cypha distilled from a real chess engine — tens of thousands of positions labelled with the engine's own search evaluations, fitted with WorldPrior whitening and natural-gradient updates. Play it in your browser.~~<script src=\"/assets/js/chess/engine.js\" defer></script><script src=\"/assets/js/chess/features.js\" defer></script><script src=\"/assets/js/chess/cypha.js\" defer></script><script src=\"/assets/js/demos/chess.js\" defer></script>~product"
"kickstarter~Back ParanoidBSD — the PBSD Kickstarter | Imortek~ParanoidBSD is porting a hardened BSD to C++23. The campaign funds the AI credits and verification compute that finish the port. Pre-launch — get notified.~~<script src=\"/assets/js/demos/funding.js\" defer></script>~website"
"research~Research shelf — cryptography, AI, physics, materials | Imortek~Odin Loch's R&D shelf: design documents and proofs of concept across cryptography, AI, tracking, mathematics, physics, materials and policy. Honestly labelled.~~<script src=\"/assets/js/demos/research.js\" defer></script>~website"
"licensing~Licensing — AGPL-3.0+ and commercial terms | Imortek~Free under AGPL-3.0+ for personal use, charity, education and organisations under AUD 50,000/yr. Tiered commercial licence above that. Work out which applies to you.~~<script src=\"/assets/js/demos/licence.js\" defer></script>~website"
"about~About Imortek and Odin Loch | Imortek~A one-person research and systems engineering practice in Sydney, Australia. What Imortek is, how it works, and how to get in touch.~~~profile"
"research/aria-aead~ARIA — an AEAD scheme that cannot lose nonce synchronisation | Imortek Research~Authenticated encryption that derives the nonce from the message and session key instead of transmitting it, making sender/receiver drift structurally impossible.~~~article"
"research/compression~Three frameworks for compression under one vocabulary | Imortek Research~Shared-PRF coordination, graded reversibility, and neural networks treated as measurable compression operators — unified under one information-theoretic vocabulary.~~~article"
"research/uhpm~UHPM — memory retrieval and inference under one loss function | Imortek Research~Locality-sensitive-hash memory and hierarchical predictive coding unified under a single free-energy functional, reporting a 289× query-latency speedup over full attention at 100K tokens.~~~article"
"research/neural-decompiler~Neural Decompiler — decompilation as conditional sequence modelling | Imortek Research~An encoder–decoder Transformer with hierarchical memory and a load-balanced mixture of experts, reframing assembly-to-source recovery as a sequence modelling problem.~~~article"
"research/modelling-aes~Modelling AES — two neural attacks, both honestly negative | Imortek Research~A paired study attacking AES-128 from both directions with neural networks, reporting that neither works — and quantifying exactly how far short each falls.~~~article"
"research/gf2-algebra~GF(2) algebra — seven papers on the smallest interesting field | Imortek Research~From an exhaustive enumeration of all 16 binary operations to permutation polynomials, circuit optimisation and differentiable logic gates — including a uniqueness theorem for AND.~~~article"
"research/asset-tracking~ARIA-INTEL — multi-source tracking to actionable intelligence, on one CPU core | Imortek Research~A PMBM random-finite-set tracker with pattern-of-life modelling, eight tradecraft detectors and Bayesian threat scoring — 2,363 lines, NumPy and SciPy only, 28 ms per scan.~~~article"
"research/filtering~GH-SR-IMM — separating heavy tails from manoeuvre | Imortek Research~A heavy-tailed multi-target tracker that decouples outlier robustness from manoeuvre handling, reporting a 51.6% average GOSPA improvement.~~<script src=\"/assets/js/demos/filtering.js\" defer></script>~article"
"research/physics~Non-local field-gravity, and an argument about superluminal recession | Imortek Research~A variational non-local gravity programme that keeps causal messaging at speeds ≤ c, paired with an essay arguing that superluminal recession is an interpretational split rather than a failure of ΛCDM.~~~article"
"research/carbide~Carbide tooling for HRC 40–70, where WC-Co gives out and CBN is too narrow | Imortek Research~A functionally-graded carbide substrate, a five-layer coating stack, and a forge-to-machine supply chain — targeting the gap between where conventional inserts fail and where CBN geometries exist.~~~article"
"research/economics~Wealth measured in megajoules, and a structural read on SPX call volume | Imortek Research~Two lines: recasting national wealth into physical energy units to break the circular dependency on monetary institutions, and five models converging on a 2028–2029 window for a gamma unwind.~~~article"
"research/fungal~Topology as memory — a network that stores history in its own shape | Imortek Research~A bio-inspired self-organising network where edges and weights are the consequence of input history rather than the storage medium, growing and pruning by purely local rules.~~~article"
"404~Page not found | Imortek~That page does not exist. Head back to the Imortek homepage.~~~website"
)

count=0
for row in "${PAGES[@]}"; do
  IFS='~' read -r slug title desc extra_css extra_js og_type <<< "$row"
  body="src/pages/$slug.html"
  if [[ ! -f "$body" ]]; then
    echo "  ! missing $body — skipped"
    continue
  fi
  out="$slug.html"
  mkdir -p "$(dirname "$out")"
  { emit_head "$title" "$desc" "$slug" "$extra_css" "$og_type"
    cat "$body"
    emit_foot "$extra_js"
  } > "$out"
  count=$((count+1))
  printf '  built %-18s %6s bytes\n' "$out" "$(wc -c < "$out")"
done

echo "Built $count pages at $BUILT"
