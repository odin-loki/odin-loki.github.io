# -*- coding: utf-8 -*-
"""Generate src/pages/research/*.html and the research index from research_data."""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from research_data import RESEARCH, ALL_FOLDERS, TIER_LABEL, BASIS

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'pages', 'research')
os.makedirs(OUT, exist_ok=True)
REPO = 'https://github.com/odin-loki/Ideas/tree/main/'

def folder_url(name):
    return REPO + urllib.parse.quote(name)

# Field labels and prose carry bare ampersands ("AI & machine learning"), which
# are invalid in markup even where browsers forgive them. Escape only the ones
# that are not already the start of an entity, so &mdash; and friends survive.
_BARE_AMP = re.compile(r'&(?![a-zA-Z][a-zA-Z0-9]{1,31};|#\d{1,6};|#x[0-9a-fA-F]{1,5};)')


def amp(t):
    return _BARE_AMP.sub('&amp;', t)


CALLOUT_CLASS = {'red': 'note--red', 'amber': 'note--amber',
                 'violet': 'note--violet', 'teal': ''}

def page(e):
    tier_name, tier_badge, tier_desc = TIER_LABEL[e['tier']]
    o = []
    A = o.append

    # ---------- hero ----------
    A('<section class="phero">')
    A('  <div class="gridlines" aria-hidden="true"></div>')
    A('  <div class="wrap phero__inner">')
    A('    <p class="tiny mono muted" style="margin-bottom:18px">')
    A('      <a href="/research.html" style="color:var(--ink-mute)">Research shelf</a> '
      '<span style="opacity:.5">/</span> ' + e['field'] + ' <span style="opacity:.5">/</span> ' + e['name'])
    A('    </p>')
    A('    <div class="split split--wide-left">')
    A('      <div>')
    A('        <span class="eyebrow">' + e['field'] + '</span>')
    A('        <h1>' + e['title'] + '</h1>')
    A('        <p class="lede">' + e['lede'] + '</p>')
    A('        <div class="badge-row" style="margin-top:22px">')
    A('          <span class="badge ' + tier_badge + '">' + tier_name + '</span>')
    A('          <span class="badge">AGPL-3.0+ / commercial</span>')
    A('        </div>')
    A('        <div class="btn-row" style="margin-top:22px">')
    A('          <a class="btn btn--ghost" href="' + folder_url(e['folder']) +
      '" target="_blank" rel="noopener">Read the source documents &rarr;</a>')
    if e.get('related'):
        A('          <a class="btn btn--ghost" href="' + e['related'][0] + '">' + e['related'][1] + '</a>')
    A('        </div>')
    A('      </div>')
    A('      <div>')
    A('        <div class="card card--pad-lg">')
    A('          <span class="eyebrow" style="margin-bottom:16px">Evidence level</span>')
    order = ['speculative', 'design', 'reference', 'result']
    labels = ['Speculative', 'Design', 'Reference', 'Result']
    upto = order.index(e['tier'])
    segs = ''.join('<i class="%s" data-l="%s"></i>' % ('on' if i <= upto else '', labels[i])
                   for i in range(4))
    A('          <div class="tier-meter" data-tier="' + e['tier'] + '">' + segs + '</div>')
    A('          <p class="small dim" style="margin:16px 0 0">' + tier_desc + '</p>')
    A('          <div class="spec" style="border:0;margin-top:14px">')
    A('            <div class="spec__row" style="padding-inline:0"><span class="spec__k">Folder</span>'
      '<span class="spec__v mono" style="font-size:.8rem">' + e['folder'] + '</span></div>')
    A('            <div class="spec__row" style="padding-inline:0"><span class="spec__k">Field</span>'
      '<span class="spec__v">' + e['field'] + '</span></div>')
    A('            <div class="spec__row" style="padding-inline:0;border-bottom:0"><span class="spec__k">Status</span>'
      '<span class="spec__v">' + e['status'] + '</span></div>')
    A('          </div>')
    A('        </div>')
    A('      </div>')
    A('    </div>')
    A('  </div>')
    A('</section>')

    # ---------- what it is ----------
    A('<section class="section section--alt">')
    A('  <div class="wrap wrap-narrow">')
    A('    <div class="section-head reveal" style="margin-bottom:1.6rem">')
    A('      <span class="eyebrow">What it is</span>')
    A('      <h2>' + e['blurb'] + '</h2>')
    A('    </div>')
    A('    <div class="reveal stack" style="font-size:1.02rem">')
    for para in e['what']:
        A('      <p class="dim">' + para + '</p>')
    A('    </div>')
    if e.get('callout'):
        tone, head, body = e['callout']
        A('    <div class="note ' + CALLOUT_CLASS[tone] + ' reveal" style="margin-top:28px">')
        A('      <strong>' + head + '</strong> ' + body)
        A('    </div>')
    A('  </div>')
    A('</section>')

    # ---------- claims ledger ----------
    A('<section class="section">')
    A('  <div class="wrap">')
    A('    <div class="section-head reveal">')
    A('      <span class="eyebrow">Claims ledger</span>')
    A('      <h2>Every number, and what stands behind it</h2>')
    A('      <p class="lede">A claim is only worth the evidence attached to it. Each row below carries '
      'its basis: measured on the author&rsquo;s own hardware, derived from the construction, measured '
      'on synthetic data, projected from literature, or simply cited.</p>')
    A('    </div>')
    A('    <figure class="diagram reveal" style="margin-bottom:26px">')
    A('      <div class="diagram__scroll">')
    A('        <img src="/assets/img/diagrams/research/' + e['slug'] + '.svg" '
      'alt="Breakdown of this page\u2019s claims by what stands behind each one" '
      'loading="lazy" decoding="async">')
    A('      </div>')
    A('      <span class="diagram__hint">scroll to see the whole chart &rarr;</span>')
    A('      <figcaption><b>Every claim, weighted by its evidence.</b> The table below is the '
      'same data row by row.</figcaption>')
    A('    </figure>')
    A('    <div class="table-scroll reveal">')
    A('      <table class="data">')
    A('        <thead><tr><th>Claim</th><th>Figure</th><th>Basis</th><th>Context</th></tr></thead>')
    A('        <tbody>')
    for claim, figure, basis, ctx in e['claims']:
        blabel, bcls, _ = BASIS[basis]
        cls = {'ok': 'badge--teal', 'warn': 'badge--amber',
               'vi': 'badge--violet', '': ''}[bcls]
        A('          <tr><td>' + claim + '</td><td class="mono" style="color:var(--ink)">' + figure +
          '</td><td><span class="badge ' + cls + '">' + blabel + '</span></td>'
          '<td class="muted">' + (ctx or '&nbsp;') + '</td></tr>')
    A('        </tbody>')
    A('      </table>')
    A('    </div>')
    A('    <p class="tiny muted reveal" style="margin-top:14px">')
    A('      <strong>Measured</strong> — author-run experiment on the stated setup. '
      '<strong>Synthetic</strong> — measured, but on synthetic rather than real data. '
      '<strong>Derived</strong> — follows from the stated construction or proof. '
      '<strong>Projected</strong> — paper-stated projection, not an author-run benchmark. '
      '<strong>Cited</strong> — taken from external literature.')
    A('    </p>')
    A('  </div>')
    A('</section>')

    # ---------- demo slot ----------
    if e.get('demo'):
        A(DEMOS[e['demo']])

    # ---------- methods + limits ----------
    A('<section class="section section--alt">')
    A('  <div class="wrap">')
    A('    <div class="split">')
    A('      <div class="reveal">')
    A('        <span class="eyebrow eyebrow--violet">Methods</span>')
    A('        <h2 style="font-size:clamp(1.4rem,2.6vw,2rem)">How it works</h2>')
    A('        <ul class="flist flist--violet" style="margin-top:1.4rem">')
    for name, desc in e['methods']:
        A('          <li><strong>' + name + '.</strong> ' + desc + '</li>')
    A('        </ul>')
    A('      </div>')
    A('      <div class="reveal" data-delay=".08">')
    A('        <span class="eyebrow eyebrow--amber">Stated limitations</span>')
    A('        <h2 style="font-size:clamp(1.4rem,2.6vw,2rem)">What it does not do</h2>')
    A('        <p class="dim">Taken from the folder&rsquo;s own README. Nothing here has been softened.</p>')
    A('        <ul class="flist flist--amber" style="margin-top:1.4rem">')
    for lim in e['limits']:
        A('          <li>' + lim + '</li>')
    A('        </ul>')
    A('      </div>')
    A('    </div>')
    A('  </div>')
    A('</section>')

    # ---------- footer CTA ----------
    A('<section class="section section--tight">')
    A('  <div class="wrap">')
    A('    <div class="cta-band reveal" style="background:radial-gradient(900px 320px at 50% -10%,'
      'rgba(94,234,212,.08),transparent 70%),linear-gradient(180deg,var(--panel) 0%,var(--bg-elev) 100%)">')
    A('      <div class="gridlines" aria-hidden="true" style="opacity:.6"></div>')
    A('      <div class="cta-band__inner">')
    A('        <span class="eyebrow">Use it</span>')
    A('        <h2 style="max-width:24ch;margin-inline:auto;font-size:clamp(1.4rem,2.8vw,2.1rem)">'
      'Free under AGPL-3.0+ for almost everyone</h2>')
    A('        <p class="lede" style="margin-inline:auto;text-align:center;margin-bottom:1.6rem">'
      'Personal use, charities, education and organisations under AUD&nbsp;50,000 a year pay nothing. '
      'A tiered commercial licence covers everyone else.</p>')
    A('        <div class="btn-row" style="justify-content:center">')
    A('          <a class="btn btn--primary" href="' + folder_url(e['folder']) +
      '" target="_blank" rel="noopener">Open the folder</a>')
    A('          <a class="btn btn--ghost" href="/licensing.html">Licensing terms</a>')
    A('          <a class="btn btn--ghost" href="/research.html">Back to the shelf</a>')
    A('        </div>')
    A('      </div>')
    A('    </div>')
    A('  </div>')
    A('</section>')
    return '\n'.join(o) + '\n'


FILTER_DEMO = '''<section class="section" id="demo">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">Interactive</span>
      <h2>Why a heavy tail breaks a Gaussian tracker</h2>
      <p class="lede">
        A target moves; a sensor reports its position with noise. Most of the time that noise is
        well behaved. Occasionally it is not &mdash; a glint, a reflection, a clutter return lands
        far from truth. Turn the outlier rate up and watch what each filter does with it.
      </p>
    </div>

    <div class="demo reveal" id="filt-demo">
      <div class="demo__head">
        <h3 class="demo__label"><span class="dot dot--pulse"></span> GH-SR-IMM &mdash; heavy-tailed estimation</h3>
        <div class="seg" role="group" aria-label="Filter">
          <button type="button" data-filt="both" aria-pressed="true">Both</button>
          <button type="button" data-filt="gauss">Gaussian only</button>
          <button type="button" data-filt="gh">Heavy-tailed only</button>
        </div>
      </div>
      <div class="demo__split">
        <div class="demo__stage">
          <canvas class="demo-canvas" id="filt-canvas" height="340"
                  aria-label="A target track with noisy measurements, filtered two ways"></canvas>
          <div class="legend" style="margin-top:14px">
            <span><i style="background:#6b7b8d"></i> True track</span>
            <span><i style="background:rgba(248,113,113,.8)"></i> Measurements</span>
            <span><i style="background:#60a5fa"></i> Gaussian filter</span>
            <span><i style="background:#5eead4"></i> Heavy-tailed (NIG)</span>
          </div>
          <div class="controls" style="margin-top:20px">
            <div class="ctrl">
              <label for="filt-out">Outlier rate <b id="filt-out-v">12%</b></label>
              <input type="range" id="filt-out" min="0" max="45" step="1" value="12">
            </div>
            <div class="ctrl">
              <label for="filt-noise">Sensor noise <b id="filt-noise-v">0.020</b></label>
              <input type="range" id="filt-noise" min="0.004" max="0.06" step="0.002" value="0.02">
            </div>
            <div class="ctrl">
              <label for="filt-manv">Manoeuvre <b id="filt-manv-v">1.0&times;</b></label>
              <input type="range" id="filt-manv" min="0" max="3" step="0.1" value="1">
            </div>
          </div>
        </div>
        <div class="demo__side">
          <div class="readout" style="grid-template-columns:1fr 1fr">
            <div class="readout__item">
              <div class="readout__k">Gaussian RMSE</div>
              <div class="readout__v" id="filt-rmse-g" style="color:#60a5fa">&mdash;</div>
            </div>
            <div class="readout__item">
              <div class="readout__k">NIG RMSE</div>
              <div class="readout__v" id="filt-rmse-h">&mdash;</div>
            </div>
          </div>
          <div class="readout" style="grid-template-columns:1fr">
            <div class="readout__item">
              <div class="readout__k">Improvement</div>
              <div class="readout__v amber" id="filt-gain">&mdash;</div>
            </div>
          </div>
          <p class="tiny muted">
            Both filters see identical measurements. The Gaussian filter trusts every one of them in
            proportion to its distance; the heavy-tailed filter down-weights a return that is far
            enough out to be implausible, rather than letting it drag the estimate.
          </p>
          <button class="btn btn--sm btn--block" id="filt-reset">Re-run with a new track</button>
          <div class="note" style="font-size:.8rem;padding:12px 14px">
            The repository reports <strong>51.6% average GOSPA improvement</strong> across four
            multi-target scenarios, peaking at 72.8%. This single-target toy shows the mechanism,
            not that figure.
          </div>
        </div>
      </div>
      <div class="panel__foot">
        A 2-D single-target illustration written for this page. The real tracker adds a three-model
        IMM bank, square-root cubature filtering and the GH-JPDA association fix.
      </div>
    </div>
  </div>
</section>
'''


PRIME_DEMO = '''<section class="section" id="demo">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">Interactive</span>
      <h2>Run the sieve the network rediscovered</h2>
      <p class="lede">
        Three generators scan the same window of consecutive integers. The conventional one walks
        the 6k&plusmn;1 lattice, trial-divides by small primes, and verifies with Miller&ndash;Rabin.
        The augmented one swaps the trial division for the distilled scorer and keeps the verifier.
        The third uses the scorer alone. Move the scale up and watch which one stops working.
      </p>
    </div>

    <div class="demo reveal" id="prime-demo">
      <div class="demo__head">
        <h3 class="demo__label"><span class="dot dot--pulse"></span> 6k&plusmn;1 sieve &mdash; live in your browser</h3>
        <div class="seg" role="group" aria-label="Highlight">
          <button type="button" data-lane="all" aria-pressed="true">Everything</button>
          <button type="button" data-lane="conv">Real primes</button>
          <button type="button" data-lane="nn">Scorer accepts</button>
          <button type="button" data-lane="lost">Primes it lost</button>
        </div>
      </div>
      <div class="demo__split">
        <div class="demo__stage">
          <canvas class="demo-canvas" id="prime-canvas" height="200"
                  aria-label="A window of consecutive integers, each coloured by how the three generators classified it"></canvas>
          <div class="legend" style="margin-top:14px">
            <span><i style="background:rgba(107,123,141,.30)"></i> Off the 6k&plusmn;1 lattice</span>
            <span><i style="background:rgba(107,123,141,.62)"></i> Rejected</span>
            <span><i style="background:#5eead4"></i> Prime, scorer agreed</span>
            <span><i style="background:#f87171"></i> Prime, scorer missed it</span>
            <span><i style="background:#fbbf24"></i> Composite, scorer accepted</span>
          </div>
          <div class="table-scroll" style="margin-top:18px">
            <table class="data">
              <thead><tr><th>&nbsp;</th><th>Conventional</th><th>NN-augmented</th><th>Pure NN</th></tr></thead>
              <tbody>
                <tr>
                  <td>Primes found</td>
                  <td class="mono" id="pr-conv-found">&mdash;</td>
                  <td class="mono" id="pr-aug-found">&mdash;</td>
                  <td class="mono" id="pr-pure-found">&mdash;</td>
                </tr>
                <tr>
                  <td>Miller&ndash;Rabin calls</td>
                  <td class="mono" id="pr-conv-mr">&mdash;</td>
                  <td class="mono" id="pr-aug-mr">&mdash;</td>
                  <td class="mono">0</td>
                </tr>
                <tr>
                  <td>Primes skipped</td>
                  <td class="mono" id="pr-conv-missed">&mdash;</td>
                  <td class="mono" id="pr-aug-missed">&mdash;</td>
                  <td class="mono" id="pr-pure-missed">&mdash;</td>
                </tr>
                <tr>
                  <td>Filter cost per candidate</td>
                  <td class="mono" id="pr-conv-us">&mdash;</td>
                  <td class="mono" id="pr-aug-us">&mdash;</td>
                  <td class="mono" id="pr-pure-us">&mdash;</td>
                </tr>
                <tr>
                  <td>False positives</td>
                  <td><span class="badge badge--teal">None</span></td>
                  <td><span class="badge badge--teal">None</span></td>
                  <td><span class="badge badge--red">Recall <b id="pr-pure-recall">&mdash;</b></span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="demo__side">
          <div class="ctrl">
            <label for="pr-scale">Scale <b id="pr-scale-v">10^5</b></label>
            <input type="range" id="pr-scale" min="3" max="8" step="1" value="5">
          </div>
          <div class="ctrl">
            <label for="pr-tau">Threshold &tau; <b id="pr-tau-v">0.50</b></label>
            <input type="range" id="pr-tau" min="10" max="90" step="5" value="50">
          </div>
          <div class="spec" style="border:0">
            <div class="spec__row" style="padding-inline:0">
              <span class="spec__k">Trial divisors used</span>
              <span class="spec__v mono" id="pr-filter">&mdash;</span>
            </div>
            <div class="spec__row" style="padding-inline:0">
              <span class="spec__k">Composites accepted</span>
              <span class="spec__v mono" id="pr-pure-fp">&mdash;</span>
            </div>
            <div class="spec__row" style="padding-inline:0">
              <span class="spec__k">Verifier calls saved</span>
              <span class="spec__v mono" id="pr-mrsaved">&mdash;</span>
            </div>
            <div class="spec__row" style="padding-inline:0;border-bottom:0">
              <span class="spec__k">Filter cost ratio</span>
              <span class="spec__v mono" id="pr-slowdown">&mdash;</span>
            </div>
          </div>
          <p class="tiny muted" id="pr-verdict">&nbsp;</p>
          <button class="btn btn--sm btn--block" id="pr-again">Scan a new window</button>
          <div class="note" style="font-size:.8rem;padding:12px 14px">
            The paper reports the NN-augmented generator running <strong>30&ndash;80&times;
            slower</strong> than the conventional one &mdash; MLP inference per candidate, with no
            matching reduction in candidate count &mdash; and pure-NN primality recall of
            <strong>0.21&ndash;0.68</strong> at &tau;&nbsp;=&nbsp;0.5. The ratio here is larger
            because it isolates the filter; the paper&rsquo;s figure is end-to-end, with the
            verifier in both denominators. This page reproduces the mechanism, not the figures.
          </div>
        </div>
      </div>
      <div class="panel__foot">
        Miller&ndash;Rabin here is the real thing &mdash; the first thirteen primes as witnesses,
        deterministic below 3.317&nbsp;&times;&nbsp;10<sup>24</sup>, so every &ldquo;prime&rdquo; on
        this page is exactly that. The scorer is a real 105&nbsp;&rarr;&nbsp;64&nbsp;&rarr;&nbsp;1
        forward pass over the same deliberately redundant feature set the paper used, but its first
        layer is hand-set rather than trained: twelve units form clipped ramps reading zero when
        <em>p</em> divides <em>n</em>, for <em>p</em> in {5,&nbsp;7,&nbsp;11,&nbsp;13,&nbsp;17,&nbsp;19},
        weighted by &minus;log(1&nbsp;&minus;&nbsp;1/<em>p</em>). That is trial division written as a
        likelihood ratio &mdash; the function Paper&nbsp;1 distilled out of the trained weights. The
        other fifty-two units carry the redundant features at small random weights; they are what
        costs the network its recall, and what costs it its speed.
      </div>
    </div>
  </div>
</section>
'''


DEMOS = {'filtering': FILTER_DEMO, 'primes': PRIME_DEMO}

count = 0
for e in RESEARCH:
    path = os.path.join(OUT, e['slug'] + '.html')
    with open(path, 'w') as f:
        f.write(amp(page(e)))
    count += 1
print('wrote %d research page bodies' % count)

# Emit the build.sh page rows so the builder picks them up.
rows = []
for e in RESEARCH:
    # Keep titles inside what a search result actually renders (~60 chars).
    title = e.get('seo_title') or (e['name'] + ' — ' + e['field'] + ' | Imortek')
    desc = e['blurb'].replace('"', "'")
    js = ('<script src=\\"/assets/js/demos/%s.js\\" defer></script>' % e['demo']) if e.get('demo') else ''
    rows.append('"research/%s~%s~%s~~%s~article"' % (e['slug'], title, desc, js))
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'research_rows.txt'), 'w') as f:
    f.write('\n'.join(rows) + '\n')
print('wrote tools/research_rows.txt')


# ============================ RESEARCH INDEX ============================
by_slug = {e['folder']: e for e in RESEARCH}
fields = sorted(set(f for _, f in ALL_FOLDERS))

idx = []
A = idx.append
A('<section class="phero">')
A('  <div class="gridlines" aria-hidden="true"></div>')
A('  <div class="wrap phero__inner">')
A('    <span class="eyebrow">The research shelf</span>')
A('    <h1>Forty-six folders of <span class="gradient-text">work in progress</span></h1>')
A('    <p class="lede">')
A('      This is a shelf, not a product catalogue. Some of it is result-bearing research with')
A('      experiments and numbers. Some of it is a design document. Some of it is speculative and')
A('      says so in its own README. Every folder now has a full write-up, drawn from the source')
A('      papers rather than the folder READMEs, with every claim listed next to the evidence')
A('      behind it &mdash; including the ones that report a negative result.')
A('    </p>')
A('    <div class="badge-row" style="margin-top:24px">')
A('      <span class="badge badge--teal">' + str(len(RESEARCH)) + ' full write-ups</span>')
A('      <span class="badge">' + str(len(ALL_FOLDERS)) + ' folders total</span>')
A('      <span class="badge">' + str(len(fields)) + ' fields</span>')
A('      <span class="badge">AGPL-3.0+ / commercial</span>')
A('    </div>')
A('  </div>')
A('</section>')

A('<section class="section section--alt">')
A('  <div class="wrap">')
A('    <div class="note note--amber reveal" style="margin-bottom:36px">')
A('      <strong>Read this first.</strong> Defence-register language appears in several folders as a')
A('      stylistic choice. It does not indicate real classification, fielded materiel, or any')
A('      government relationship. Many systems here remain unbuilt or unvalidated, and speculative')
A('      items carry explicit labels in their own README files. Nothing on this shelf has been')
A('      independently verified.')
A('    </div>')

A('    <div class="section-head reveal">')
A('      <span class="eyebrow">Browse</span>')
A('      <h2>Filter the shelf</h2>')
A('    </div>')
A('    <div class="chips reveal" id="r-filters" style="margin-bottom:12px">')
A('      <button type="button" class="chip" data-field="all" aria-pressed="true">Everything'
  '<span class="chip__n">' + str(len(ALL_FOLDERS)) + '</span></button>')
# The "full write-up" chip only means something while some folders lack one.
if len(RESEARCH) < len(ALL_FOLDERS):
    A('      <button type="button" class="chip" data-field="__written" aria-pressed="false">Full write-up'
      '<span class="chip__n">' + str(len(RESEARCH)) + '</span></button>')
for f in fields:
    n = sum(1 for _, ff in ALL_FOLDERS if ff == f)
    A('      <button type="button" class="chip" data-field="' + f + '" aria-pressed="false">' + f +
      '<span class="chip__n">' + str(n) + '</span></button>')
A('    </div>')
A('    <p class="rcount reveal" style="margin-bottom:24px"><span id="r-count">' +
  str(len(ALL_FOLDERS)) + '</span> of ' + str(len(ALL_FOLDERS)) + ' shown</p>')

A('    <div class="rgrid" id="r-grid">')
for folder, field in ALL_FOLDERS:
    e = by_slug.get(folder)
    written = 'true' if e else 'false'
    if e:
        tier_name, tier_badge, _ = TIER_LABEL[e['tier']]
        A('      <a class="rcard rcard--linked" href="/research/' + e['slug'] + '.html"'
          ' data-field="' + field + '" data-written="true">')
        A('        <div class="rcard__head">')
        A('          <h3>' + e['name'] + '</h3>')
        A('          <span class="badge ' + tier_badge + '">' + tier_name + '</span>')
        A('        </div>')
        A('        <span class="rcard__field">' + field + '</span>')
        A('        <p style="margin-top:10px">' + e['blurb'] + '</p>')
        A('        <span class="rcard__more">Full write-up &rarr;</span>')
        A('      </a>')
    else:
        A('      <a class="rcard rcard--linked rcard--plain" target="_blank" rel="noopener"'
          ' href="' + folder_url(folder) + '" data-field="' + field + '" data-written="false">')
        A('        <div class="rcard__head">')
        A('          <h3>' + folder + '</h3>')
        A('        </div>')
        A('        <span class="rcard__field">' + field + '</span>')
        A('        <p style="margin-top:10px">Source documents in the <code>Ideas</code> repository. '
          'No write-up on this site yet.</p>')
        A('        <span class="rcard__more" style="color:var(--ink-mute)">Open on GitHub &rarr;</span>')
        A('      </a>')
A('    </div>')
A('  </div>')
A('</section>')

A('<section class="section">')
A('  <div class="wrap wrap-narrow">')
A('    <span class="eyebrow eyebrow--violet">How to read this shelf</span>')
A('    <h2>Four evidence levels, used consistently</h2>')
A('    <figure class="diagram reveal" style="margin:24px 0 30px">')
A('      <div class="diagram__scroll">')
A('        <img src="/assets/img/diagrams/evidence-tiers.svg" alt="The four evidence levels used '
  'across the research shelf, from speculative through design document and reference '
  'implementation to result-bearing" loading="lazy" decoding="async">')
A('      </div>')
A('      <span class="diagram__hint">scroll to see the whole diagram &rarr;</span>')
A('      <figcaption><b>Nothing reaches a fifth level.</b> There is no \u201cvalidated\u201d tier '
  'in use, because nothing here has been independently replicated or externally audited.'
  '</figcaption>')
A('    </figure>')
A('    <p class="lede" style="margin-bottom:2rem">Every write-up carries one of these, and a claims '
  'ledger that marks each individual number as measured, synthetic, derived, projected or cited.</p>')
for key in ['speculative', 'design', 'reference', 'result']:
    name, badge, desc = TIER_LABEL[key]
    A('    <div class="card reveal" style="margin-bottom:12px">')
    A('      <div style="display:flex;gap:14px;align-items:baseline;flex-wrap:wrap">')
    A('        <span class="badge ' + badge + '">' + name + '</span>')
    A('        <p class="small dim" style="margin:0;flex:1;min-width:220px">' + desc + '</p>')
    A('      </div>')
    A('    </div>')
A('    <div class="note note--violet" style="margin-top:24px">')
A('      <strong>Nothing reaches a fifth level.</strong> There is no &ldquo;validated&rdquo; tier in use, '
  'because no item on this shelf has been independently replicated or externally audited. When one is, '
  'it will say so and name who did it.')
A('    </div>')
A('  </div>')
A('</section>')

with open(os.path.join(OUT, '..', 'research.html'), 'w') as f:
    f.write(amp('\n'.join(idx) + '\n'))
print('wrote research index')
