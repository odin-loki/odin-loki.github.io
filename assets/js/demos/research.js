/* Research shelf — client-side field filter. */
(function () {
  'use strict';
  var filters = document.getElementById('r-filters');
  var grid = document.getElementById('r-grid');
  var count = document.getElementById('r-count');
  if (!filters || !grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.rcard'));

  function apply(field) {
    var shown = 0;
    cards.forEach(function (c) {
      var ok = field === 'all'
        || (field === '__written' && c.dataset.written === 'true')
        || c.dataset.field === field;
      c.classList.toggle('is-hidden', !ok);
      if (ok) shown++;
    });
    count.textContent = shown;
  }

  filters.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-field]');
    if (!btn) return;
    filters.querySelectorAll('[data-field]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b === btn));
    });
    apply(btn.dataset.field);
    try { history.replaceState(null, '', btn.dataset.field === 'all' ? location.pathname
      : location.pathname + '#' + encodeURIComponent(btn.dataset.field)); } catch (err) {}
  });

  // Deep link: /research.html#Cryptography
  if (location.hash) {
    var want = decodeURIComponent(location.hash.slice(1));
    var target = filters.querySelector('[data-field="' + CSS.escape(want) + '"]');
    if (target) target.click();
  }
})();
