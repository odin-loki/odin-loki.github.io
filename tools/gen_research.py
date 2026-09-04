# -*- coding: utf-8 -*-
"""Generate src/pages/research/*.html and the research index from research_data."""
import os, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from research_data import RESEARCH, ALL_FOLDERS, TIER_LABEL, BASIS

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'pages', 'research')
os.makedirs(OUT, exist_ok=True)
REPO = 'https://github.com/odin-loki/Ideas/tree/main/'

def folder_url(name):
    return REPO + urllib.parse.quote(name)

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
    if e.get('demo') == 'filtering':
        A(FILTER_DEMO)

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

count = 0
for e in RESEARCH:
    path = os.path.join(OUT, e['slug'] + '.html')
    with open(path, 'w') as f:
        f.write(page(e))
    count += 1
print('wrote %d research page bodies' % count)

# Emit the build.sh page rows so the builder picks them up.
rows = []
for e in RESEARCH:
    title = e['title'] + ' | Imortek Research'
    desc = e['blurb'].replace('"', "'")
    js = '<script src=\\"/assets/js/demos/filtering.js\\" defer></script>' if e.get('demo') else ''
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
A('      says so in its own README. Twelve areas have a full write-up here, with every claim')
A('      listed next to the evidence behind it.')
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
    f.write('\n'.join(idx) + '\n')
print('wrote research index')
