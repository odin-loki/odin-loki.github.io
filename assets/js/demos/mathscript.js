/* =============================================================
   MathScript — a working miniature CAS.

   Tokeniser → recursive-descent parser → AST → symbolic derivative
   → simplifier → numeric evaluation, Simpson quadrature and
   bisection root finding.

   Same shape as the C++ `symbolic` library, at reading scale.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('ms-demo');
  if (!root) return;

  /* ---------------- Tokeniser ---------------- */
  function tokenize(src) {
    var out = [], i = 0;
    while (i < src.length) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        out.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
        i = j; continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        var k = i;
        while (k < src.length && /[a-zA-Z_0-9]/.test(src[k])) k++;
        out.push({ t: 'id', v: src.slice(i, k) });
        i = k; continue;
      }
      if ('+-*/^(),'.indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      throw new Error('unexpected character "' + c + '" at ' + i);
    }
    return out;
  }

  /* ---------------- AST ---------------- */
  var N = {
    num: function (v) { return { k: 'num', v: v }; },
    va: function (n) { return { k: 'var', n: n }; },
    bin: function (op, a, b) { return { k: 'bin', op: op, a: a, b: b }; },
    neg: function (a) { return { k: 'neg', a: a }; },
    call: function (f, a) { return { k: 'call', f: f, a: a }; }
  };

  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    exp: Math.exp, log: Math.log, sqrt: Math.sqrt, abs: Math.abs,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    asin: Math.asin, acos: Math.acos, atan: Math.atan
  };
  var CONSTS = { pi: Math.PI, e: Math.E };

  /* ---------------- Parser ----------------
     expr   := term (('+'|'-') term)*
     term   := unary (('*'|'/') unary)*
     unary  := '-' unary | power
     power  := atom ('^' unary)?          right associative
     atom   := num | id | id '(' expr ')' | '(' expr ')'
  */
  function parse(tokens) {
    var p = 0;
    function peek() { return tokens[p]; }
    function eat(t) {
      var tok = tokens[p];
      if (!tok || (t && tok.t !== t)) {
        throw new Error('expected ' + (t || 'token') + ' at position ' + p);
      }
      p++; return tok;
    }
    function expr() {
      var left = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        var op = eat().t;
        left = N.bin(op, left, term());
      }
      return left;
    }
    function term() {
      var left = unary();
      while (peek() && (peek().t === '*' || peek().t === '/')) {
        var op = eat().t;
        left = N.bin(op, left, unary());
      }
      return left;
    }
    function unary() {
      if (peek() && peek().t === '-') { eat(); return N.neg(unary()); }
      if (peek() && peek().t === '+') { eat(); return unary(); }
      return power();
    }
    function power() {
      var base = atom();
      if (peek() && peek().t === '^') { eat(); return N.bin('^', base, unary()); }
      return base;
    }
    function atom() {
      var tok = peek();
      if (!tok) throw new Error('unexpected end of expression');
      if (tok.t === 'num') { eat(); return N.num(tok.v); }
      if (tok.t === 'id') {
        eat();
        if (peek() && peek().t === '(') {
          eat('(');
          var arg = expr();
          eat(')');
          if (!FUNCS[tok.v]) throw new Error('unknown function "' + tok.v + '"');
          return N.call(tok.v, arg);
        }
        if (CONSTS.hasOwnProperty(tok.v)) return N.num(CONSTS[tok.v]);
        if (tok.v !== 'x') throw new Error('unknown symbol "' + tok.v + '" (only x is a variable)');
        return N.va(tok.v);
      }
      if (tok.t === '(') { eat('('); var e = expr(); eat(')'); return e; }
      throw new Error('unexpected token at position ' + p);
    }
    var tree = expr();
    if (p < tokens.length) throw new Error('trailing input after position ' + p);
    return tree;
  }

  /* ---------------- Evaluate ---------------- */
  function evaluate(n, x) {
    switch (n.k) {
      case 'num': return n.v;
      case 'var': return x;
      case 'neg': return -evaluate(n.a, x);
      case 'call': return FUNCS[n.f](evaluate(n.a, x));
      case 'bin':
        var a = evaluate(n.a, x), b = evaluate(n.b, x);
        switch (n.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '^': return Math.pow(a, b);
        }
    }
    return NaN;
  }

  /* ---------------- Symbolic derivative ---------------- */
  function d(n) {
    switch (n.k) {
      case 'num': return N.num(0);
      case 'var': return N.num(1);
      case 'neg': return N.neg(d(n.a));
      case 'bin':
        if (n.op === '+' || n.op === '-') return N.bin(n.op, d(n.a), d(n.b));
        if (n.op === '*') {                                   // product rule
          return N.bin('+', N.bin('*', d(n.a), n.b), N.bin('*', n.a, d(n.b)));
        }
        if (n.op === '/') {                                   // quotient rule
          return N.bin('/',
            N.bin('-', N.bin('*', d(n.a), n.b), N.bin('*', n.a, d(n.b))),
            N.bin('^', n.b, N.num(2)));
        }
        if (n.op === '^') {
          if (n.b.k === 'num') {                              // power rule
            return N.bin('*',
              N.bin('*', N.num(n.b.v), N.bin('^', n.a, N.num(n.b.v - 1))),
              d(n.a));
          }
          // general: f^g = exp(g ln f)  →  f^g (g' ln f + g f'/f)
          return N.bin('*', n,
            N.bin('+', N.bin('*', d(n.b), N.call('log', n.a)),
                       N.bin('/', N.bin('*', n.b, d(n.a)), n.a)));
        }
        break;
      case 'call': {
        var u = n.a, du = d(u), inner;
        switch (n.f) {
          case 'sin':  inner = N.call('cos', u); break;
          case 'cos':  inner = N.neg(N.call('sin', u)); break;
          case 'tan':  inner = N.bin('/', N.num(1), N.bin('^', N.call('cos', u), N.num(2))); break;
          case 'exp':  inner = N.call('exp', u); break;
          case 'log':  inner = N.bin('/', N.num(1), u); break;
          case 'sqrt': inner = N.bin('/', N.num(1), N.bin('*', N.num(2), N.call('sqrt', u))); break;
          case 'sinh': inner = N.call('cosh', u); break;
          case 'cosh': inner = N.call('sinh', u); break;
          case 'tanh': inner = N.bin('-', N.num(1), N.bin('^', N.call('tanh', u), N.num(2))); break;
          case 'asin': inner = N.bin('/', N.num(1), N.call('sqrt', N.bin('-', N.num(1), N.bin('^', u, N.num(2))))); break;
          case 'acos': inner = N.neg(N.bin('/', N.num(1), N.call('sqrt', N.bin('-', N.num(1), N.bin('^', u, N.num(2)))))); break;
          case 'atan': inner = N.bin('/', N.num(1), N.bin('+', N.num(1), N.bin('^', u, N.num(2)))); break;
          case 'abs':  inner = N.bin('/', u, N.call('abs', u)); break;
          default: throw new Error('no derivative rule for ' + n.f);
        }
        return N.bin('*', inner, du);                         // chain rule
      }
    }
    return N.num(0);
  }

  /* ---------------- Simplifier ---------------- */
  function isNum(n, v) { return n.k === 'num' && (v === undefined || Math.abs(n.v - v) < 1e-12); }

  function simplify(n) {
    if (n.k === 'neg') {
      var a = simplify(n.a);
      if (a.k === 'num') return N.num(-a.v);
      if (a.k === 'neg') return a.a;
      return N.neg(a);
    }
    if (n.k === 'call') {
      var arg = simplify(n.a);
      if (arg.k === 'num' && isFinite(FUNCS[n.f](arg.v))) return N.num(FUNCS[n.f](arg.v));
      return N.call(n.f, arg);
    }
    if (n.k !== 'bin') return n;

    var a = simplify(n.a), b = simplify(n.b), op = n.op;

    if (a.k === 'num' && b.k === 'num') {
      var v = op === '+' ? a.v + b.v : op === '-' ? a.v - b.v
            : op === '*' ? a.v * b.v : op === '/' ? a.v / b.v
            : Math.pow(a.v, b.v);
      if (isFinite(v)) return N.num(v);
    }
    if (op === '+') {
      if (isNum(a, 0)) return b;
      if (isNum(b, 0)) return a;
      if (b.k === 'neg') return simplify(N.bin('-', a, b.a));
    }
    if (op === '-') {
      if (isNum(b, 0)) return a;
      if (isNum(a, 0)) return N.neg(b);
    }
    if (op === '*') {
      if (isNum(a, 0) || isNum(b, 0)) return N.num(0);
      if (isNum(a, 1)) return b;
      if (isNum(b, 1)) return a;
      if (isNum(a, -1)) return N.neg(b);
      if (isNum(b, -1)) return N.neg(a);
      // lift negation out of a product so coefficients can fold
      if (a.k === 'neg') return simplify(N.neg(N.bin('*', a.a, b)));
      if (b.k === 'neg') return simplify(N.neg(N.bin('*', a, b.a)));
      // fold nested numeric coefficients: c1 * (c2 * u) -> (c1·c2) * u
      if (a.k === 'num' && b.k === 'bin' && b.op === '*' && b.a.k === 'num') {
        return simplify(N.bin('*', N.num(a.v * b.a.v), b.b));
      }
      if (a.k === 'num' && b.k === 'bin' && b.op === '/' && b.a.k === 'num') {
        return simplify(N.bin('/', N.bin('*', N.num(a.v * b.a.v), N.num(1)), b.b));
      }
      if (b.k === 'num' && a.k !== 'num') return simplify(N.bin('*', b, a)); // numbers left
    }
    if (op === '/') {
      if (isNum(a, 0)) return N.num(0);
      if (isNum(b, 1)) return a;
      if (a.k === 'neg') return simplify(N.neg(N.bin('/', a.a, b)));
      if (b.k === 'neg') return simplify(N.neg(N.bin('/', a, b.a)));
      // (c1 * u) / c2 -> (c1/c2) * u
      if (b.k === 'num' && a.k === 'bin' && a.op === '*' && a.a.k === 'num') {
        return simplify(N.bin('*', N.num(a.a.v / b.v), a.b));
      }
      if (b.k === 'num' && a.k === 'num') return N.num(a.v / b.v);
    }
    if (op === '^') {
      if (isNum(b, 1)) return a;
      if (isNum(b, 0)) return N.num(1);
      if (isNum(a, 1)) return N.num(1);
    }
    return N.bin(op, a, b);
  }

  /* ---------------- Printer ---------------- */
  var PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
  function fmtNum(v) {
    if (Math.abs(v - Math.round(v)) < 1e-10) return String(Math.round(v));
    return String(Number(v.toPrecision(6)));
  }
  function print(n, parentPrec) {
    parentPrec = parentPrec || 0;
    var s;
    switch (n.k) {
      case 'num': return fmtNum(n.v);
      case 'var': return n.n;
      case 'neg': s = '-' + print(n.a, 3); return parentPrec > 3 ? '(' + s + ')' : s;
      case 'call': return n.f + '(' + print(n.a, 0) + ')';
      case 'bin': {
        var p = PREC[n.op];
        var left = print(n.a, p);
        var right = print(n.b, n.op === '^' ? p : p + 1);
        s = n.op === '^' ? left + '^' + right : left + ' ' + n.op + ' ' + right;
        return p < parentPrec ? '(' + s + ')' : s;
      }
    }
    return '';
  }
  function countNodes(n) {
    if (!n) return 0;
    if (n.k === 'bin') return 1 + countNodes(n.a) + countNodes(n.b);
    if (n.k === 'neg' || n.k === 'call') return 1 + countNodes(n.a);
    return 1;
  }

  /* ---------------- Numerics ---------------- */
  function simpson(f, a, b, m) {
    m = m || 400;
    if (m % 2) m++;
    var h = (b - a) / m, s = 0, y0 = f(a), yn = f(b);
    if (!isFinite(y0)) y0 = 0;
    if (!isFinite(yn)) yn = 0;
    s = y0 + yn;
    for (var i = 1; i < m; i++) {
      var y = f(a + i * h);
      if (!isFinite(y)) y = 0;
      s += y * (i % 2 ? 4 : 2);
    }
    return s * h / 3;
  }

  function findRoots(f, a, b, steps) {
    steps = steps || 600;
    var roots = [], h = (b - a) / steps, prevX = a, prevY = f(a);
    for (var i = 1; i <= steps; i++) {
      var x = a + i * h, y = f(x);
      if (isFinite(prevY) && isFinite(y) && prevY * y < 0) {
        var lo = prevX, hi = x;
        for (var k = 0; k < 60; k++) {
          var mid = (lo + hi) / 2, ym = f(mid);
          if (!isFinite(ym)) break;
          if (prevY * ym <= 0) hi = mid; else { lo = mid; prevY = ym; }
        }
        roots.push((lo + hi) / 2);
        if (roots.length > 40) break;
      }
      prevX = x; prevY = y;
    }
    return roots;
  }

  /* ---------------- UI ---------------- */
  var input = document.getElementById('ms-input');
  var canvas = document.getElementById('ms-canvas');
  var ctx = canvas.getContext('2d');
  var derivEl = document.getElementById('ms-deriv');
  var resultEl = document.getElementById('ms-result');
  var W = 0, H_PREF = 320, H = H_PREF, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var range = 6;

  var EXAMPLES = [
    'sin(x^2)/(1+x^2)',
    'x^3 - 3*x',
    'exp(-x^2/2)',
    'tanh(x)*sin(3*x)',
    'log(1+x^2)',
    'sqrt(abs(x))*cos(x)'
  ];

  function sizeCanvas() {
    H = window.ImortekFitHeight ? window.ImortekFitHeight(H_PREF) : H_PREF;
    W = canvas.clientWidth || canvas.parentNode.clientWidth;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var state = { f: null, df: null, roots: [], yScale: 1 };

  function compute() {
    var src = input.value.trim();
    try {
      var ast = parse(tokenize(src));
      var simple = simplify(ast);
      var deriv = simplify(d(simple));

      state.f = function (x) { return evaluate(simple, x); };
      state.df = function (x) { return evaluate(deriv, x); };

      derivEl.textContent = "f'(x) = " + print(deriv, 0);
      document.getElementById('ms-nodes').textContent = countNodes(simple) + ' / ' + countNodes(deriv);
      document.getElementById('ms-parse').textContent = 'ok';

      var integral = simpson(state.f, -range, range);
      document.getElementById('ms-int').textContent =
        isFinite(integral) ? integral.toFixed(4) : 'divergent';

      state.roots = findRoots(state.f, -range, range);
      document.getElementById('ms-roots').textContent = state.roots.length;

      resultEl.className = 'verdict is-allow';
      resultEl.innerHTML = '<div class="verdict__label">Ok</div>' +
        '<div class="verdict__why">Parsed, differentiated symbolically, and simplified. ' +
        'Quadrature by composite Simpson; roots by bracketed bisection.</div>';
      draw();
    } catch (err) {
      state.f = null; state.df = null; state.roots = [];
      derivEl.textContent = '';
      document.getElementById('ms-parse').textContent = 'error';
      document.getElementById('ms-int').textContent = '—';
      document.getElementById('ms-roots').textContent = '—';
      document.getElementById('ms-nodes').textContent = '—';
      resultEl.className = 'verdict is-deny';
      resultEl.innerHTML = '<div class="verdict__label">Err</div>' +
        '<div class="verdict__why">' + String(err.message).replace(/[<>&]/g, '') +
        '<br><br>The library returns this as <code>Result&lt;T&gt;</code> rather than throwing.</div>';
      draw();
    }
  }

  function draw() {
    if (!W) sizeCanvas();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, W, H);

    var xs = [], ys = [], dys = [], i, x, y;
    var samples = Math.max(240, Math.floor(W));
    var yMax = 0;
    if (state.f) {
      for (i = 0; i <= samples; i++) {
        x = -range + (2 * range) * (i / samples);
        y = state.f(x);
        var dy = state.df(x);
        xs.push(x);
        ys.push(isFinite(y) ? y : NaN);
        dys.push(isFinite(dy) ? dy : NaN);
        if (isFinite(y)) yMax = Math.max(yMax, Math.abs(y));
        if (isFinite(dy)) yMax = Math.max(yMax, Math.min(Math.abs(dy), 50));
      }
    }
    yMax = Math.max(1, Math.min(yMax * 1.15, 60));

    var toX = function (v) { return ((v + range) / (2 * range)) * W; };
    var toY = function (v) { return H / 2 - (v / yMax) * (H / 2 - 12); };

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    var stepX = range <= 3 ? 0.5 : range <= 8 ? 1 : range <= 14 ? 2 : 5;
    for (var gx = -range; gx <= range; gx += stepX) {
      ctx.beginPath(); ctx.moveTo(toX(gx), 0); ctx.lineTo(toX(gx), H); ctx.stroke();
    }
    var stepY = Math.pow(10, Math.floor(Math.log10(yMax))) / 2;
    for (var gy = -yMax; gy <= yMax; gy += stepY) {
      ctx.beginPath(); ctx.moveTo(0, toY(gy)); ctx.lineTo(W, toY(gy)); ctx.stroke();
    }
    // axes
    ctx.strokeStyle = 'rgba(163,177,192,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, toY(0)); ctx.lineTo(W, toY(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX(0), 0); ctx.lineTo(toX(0), H); ctx.stroke();

    if (!state.f) {
      ctx.fillStyle = '#6b7b8d';
      ctx.font = '400 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Expression did not parse — see Result<T> on the right', W / 2, H / 2 - 6);
      ctx.textAlign = 'left';
      return;
    }

    function plot(arr, colour, width) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      var pen = false;
      for (var i = 0; i < arr.length; i++) {
        var v = arr[i];
        if (!isFinite(v) || Math.abs(v) > yMax * 3) { pen = false; continue; }
        var px = toX(xs[i]), py = toY(v);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    plot(dys, 'rgba(167,139,250,.75)', 1.6);
    plot(ys, '#5eead4', 2.2);

    // roots
    for (i = 0; i < state.roots.length; i++) {
      var rx = toX(state.roots[i]);
      ctx.beginPath();
      ctx.arc(rx, toY(0), 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
    }

    ctx.fillStyle = '#6b7b8d';
    ctx.font = '400 9px ui-monospace, monospace';
    ctx.fillText('x ∈ [−' + range.toFixed(1) + ', ' + range.toFixed(1) + ']', 10, H - 10);
    ctx.fillText('y ±' + yMax.toPrecision(3), W - 78, H - 10);
  }

  // examples
  var exEl = document.getElementById('ms-examples');
  EXAMPLES.forEach(function (ex) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = ex;
    b.addEventListener('click', function () { input.value = ex; compute(); });
    exEl.appendChild(b);
  });

  var debounce = null;
  input.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(compute, 180);
  });
  document.getElementById('ms-range').addEventListener('input', function (e) {
    range = parseFloat(e.target.value);
    document.getElementById('ms-range-v').textContent = '±' + range.toFixed(1);
    compute();
  });
  window.addEventListener('resize', function () { sizeCanvas(); draw(); });

  sizeCanvas();
  compute();
})();
