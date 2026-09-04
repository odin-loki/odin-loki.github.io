/* =============================================================
   Licence chooser — four questions, computed locally.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('lic-demo');
  if (!root) return;

  var QUESTIONS = [
    {
      id: 'who',
      q: 'What are you?',
      options: [
        { v: 'person',   l: 'An individual', d: 'Personal projects, learning, hobby work' },
        { v: 'nonprofit',l: 'A charity, school or university', d: 'Non-commercial or educational' },
        { v: 'org',      l: 'A company or other organisation', d: 'Commercial activity of any size' }
      ]
    },
    {
      id: 'size',
      q: 'What is your organisation’s annual income?',
      when: function (a) { return a.who === 'org'; },
      options: [
        { v: 'under',  l: 'Under AUD 50,000', d: 'Below the free-tier threshold' },
        { v: 'over',   l: 'AUD 50,000 or more', d: 'Above the free-tier threshold' }
      ]
    },
    {
      id: 'network',
      q: 'Will users reach it over a network?',
      options: [
        { v: 'no',  l: 'No', d: 'Installed locally, or used internally only' },
        { v: 'yes', l: 'Yes', d: 'A hosted service, SaaS product, or public API' }
      ]
    },
    {
      id: 'private',
      q: 'Do you need to keep your modifications private?',
      options: [
        { v: 'no',  l: 'No, we can publish them', d: 'Happy to share changes back under the same licence' },
        { v: 'yes', l: 'Yes, they must stay closed', d: 'Proprietary changes you cannot release' }
      ]
    }
  ];

  var answers = {};

  function visible() {
    return QUESTIONS.filter(function (q) { return !q.when || q.when(answers); });
  }

  function decide() {
    var vis = visible();
    var answered = vis.every(function (q) { return answers[q.id] !== undefined; });
    if (!answered) return null;

    var freeByStatus = answers.who === 'person' || answers.who === 'nonprofit' ||
                       (answers.who === 'org' && answers.size === 'under');
    var needsPrivate = answers.private === 'yes';

    if (needsPrivate) {
      return {
        licence: 'commercial',
        headline: 'COMMERCIAL LICENCE',
        why: freeByStatus
          ? 'You qualify for the free tier on size, but you need to keep modifications private — and AGPL-3.0+ does not allow that. A commercial licence removes the obligation.'
          : 'You are above the threshold and you need modifications to stay closed. Both point the same way.',
        obligations: [
          ['ok', 'No obligation to publish your modifications'],
          ['ok', 'No copyleft reach into your own codebase'],
          ['ok', 'Network use triggers nothing'],
          ['ok', 'Attribution optional'],
          ['warn', 'Priced by organisation size — quoted per enquiry']
        ]
      };
    }
    if (!freeByStatus) {
      return {
        licence: 'commercial',
        headline: 'COMMERCIAL LICENCE',
        why: 'Your organisation is at or above AUD 50,000 annual income, which is where the free tier ends. You could still use AGPL-3.0+ if you are willing to meet its obligations in full — but the commercial tier is the intended route.',
        obligations: [
          ['ok', 'No obligation to publish your modifications'],
          ['ok', 'Direct support by arrangement'],
          ['warn', 'Priced by organisation size — quoted per enquiry'],
          ['ok', 'Per-project or catalogue-wide, your choice']
        ]
      };
    }

    var netWarning = answers.network === 'yes';
    return {
      licence: 'agpl',
      headline: 'AGPL-3.0+ — FREE',
      why: answers.who === 'person'
        ? 'You are an individual. The free tier covers you.'
        : answers.who === 'nonprofit'
          ? 'Charities, schools and universities are explicitly covered by the free tier.'
          : 'Your organisation is under AUD 50,000 annual income, which is inside the free tier.',
      obligations: [
        ['ok', 'Costs nothing'],
        ['ok', 'Use it in a product, modify it freely'],
        ['warn', 'Publish your modifications under the same dual licence'],
        ['warn', 'Carry the attribution line: “Powered by Ideas, developed by Odin Loch. Licensed under AGPL-3.0+.”'],
        ['warn', 'Research built on the software must be open-sourced'],
        netWarning
          ? ['err', 'Network use counts as distribution — users of your hosted version are entitled to its source']
          : ['ok', 'No network-distribution clause engaged, since it is not offered over a network']
      ]
    };
  }

  function render() {
    var box = document.getElementById('lic-questions');
    box.innerHTML = '';
    visible().forEach(function (q, idx) {
      var wrap = document.createElement('div');
      var h = document.createElement('h4');
      h.className = 'panel__title';
      h.style.marginBottom = '12px';
      h.textContent = (idx + 1) + '. ' + q.q;
      wrap.appendChild(h);

      var chips = document.createElement('div');
      chips.className = 'chips';
      chips.style.flexDirection = 'column';
      chips.style.alignItems = 'stretch';
      q.options.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.style.textAlign = 'left';
        b.style.borderRadius = 'var(--r)';
        b.style.padding = '12px 16px';
        b.setAttribute('aria-pressed', String(answers[q.id] === o.v));
        b.innerHTML = '<strong style="display:block;font-size:.92rem">' + o.l + '</strong>' +
                      '<span class="tiny muted">' + o.d + '</span>';
        b.addEventListener('click', function () {
          answers[q.id] = o.v;
          // dropping out of "org" invalidates the size answer
          if (q.id === 'who' && o.v !== 'org') delete answers.size;
          render();
        });
        chips.appendChild(b);
      });
      wrap.appendChild(chips);
      box.appendChild(wrap);
    });

    var res = decide();
    var v = document.getElementById('lic-verdict');
    var ob = document.getElementById('lic-obligations');
    var cta = document.getElementById('lic-cta');

    if (!res) {
      v.className = 'verdict';
      v.innerHTML = '<div class="verdict__label">Answer the questions</div>' +
        '<div class="verdict__why">The recommendation updates as you go.</div>';
      ob.innerHTML = '';
      cta.innerHTML = '';
      return;
    }

    v.className = 'verdict ' + (res.licence === 'agpl' ? 'is-allow' : '');
    if (res.licence === 'commercial') {
      v.style.borderColor = 'rgba(167,139,250,.5)';
      v.style.background = 'rgba(167,139,250,.05)';
    } else {
      v.style.borderColor = '';
      v.style.background = '';
    }
    v.innerHTML = '<div class="verdict__label"' +
      (res.licence === 'commercial' ? ' style="color:var(--violet)"' : '') + '>' +
      res.headline + '</div><div class="verdict__why">' + res.why + '</div>';

    var ICON = {
      ok: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5L13 4.5" stroke="#5eead4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      warn: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v6M8 12v.5" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/></svg>',
      err: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="#f87171" stroke-width="2" stroke-linecap="round"/></svg>'
    };
    ob.innerHTML = res.obligations.map(function (o) {
      return '<li>' + ICON[o[0]] + '<span>' + o[1] + '</span></li>';
    }).join('');

    cta.innerHTML = res.licence === 'commercial'
      ? '<a class="btn btn--primary btn--block" data-email data-subject="Commercial licence enquiry" href="#">Email about a commercial licence</a>'
      : '<a class="btn btn--ghost btn--block" href="https://www.gnu.org/licenses/agpl-3.0.en.html" target="_blank" rel="noopener">Read the AGPL-3.0 text</a>';

    // re-bind the mailto on any freshly inserted button
    var link = cta.querySelector('[data-email]');
    if (link) {
      link.setAttribute('href', 'mailto:' + 'odin.loch' + '@' + 'outlook.com.au' +
        '?subject=' + encodeURIComponent(link.dataset.subject));
    }
  }

  document.getElementById('lic-reset').addEventListener('click', function () {
    answers = {};
    render();
  });

  render();
})();
