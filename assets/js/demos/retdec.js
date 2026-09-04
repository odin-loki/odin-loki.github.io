/* =============================================================
   RetDec Imortek — abstraction-ladder walkthrough.
   Scripted stages for real recovery targets, stepped by the reader.
   ============================================================= */
(function () {
  'use strict';
  var root = document.getElementById('rd-demo');
  if (!root) return;

  var STAGES = ['bytes', 'disasm', 'ir', 'pseudo', 'semantic'];
  var STAGE_LABEL = { bytes: 'Raw bytes', disasm: 'Disassembly', ir: 'Lifted IR',
                      pseudo: 'C pseudocode', semantic: 'Semantics' };

  var SAMPLES = {
    aes: {
      name: 'AES-128 key schedule',
      verdict: 'AES-128 · key expansion',
      family: 'Cryptographic primitive',
      conf: { blind: 0.91, named: 0.99 },
      evidence: [
        ['ok',   'rcon table  01 02 04 08 10 20 40 80 1b 36'],
        ['ok',   'S-box constant block, 256 bytes, matches FIPS-197'],
        ['ok',   'loop trip count 10 → 128-bit key schedule'],
        ['ok',   'RotWord/SubWord composition on 4-byte lanes'],
        ['warn', 'no AES-NI instructions — software path']
      ],
      bytes:
'00401a20  63 7c 77 7b f2 6b 6f c5  30 01 67 2b fe d7 ab 76   |c|w{.ko.0.g+...v|\n' +
'00401a30  ca 82 c9 7d fa 59 47 f0  ad d4 a2 af 9c a4 72 c0   |...}.YG.......r.|\n' +
'00401a40  b7 fd 93 26 36 3f f7 cc  34 a5 e5 f1 71 d8 31 15   |...&6?..4...q.1.|\n' +
'00401b00  01 02 04 08 10 20 40 80  1b 36 00 00 00 00 00 00   |..... @..6......|',
      disasm:
'0x401c40  push   rbp\n' +
'0x401c41  mov    rbp, rsp\n' +
'0x401c44  mov    ecx, 0x1                  ; round = 1\n' +
'0x401c49  lea    rdx, [rip+0x4b0]          ; rcon table\n' +
'0x401c50  mov    eax, [rdi+rcx*4-0x4]\n' +
'0x401c54  rol    eax, 0x8                  ; RotWord\n' +
'0x401c57  movzx  esi, al\n' +
'0x401c5a  movzx  esi, byte [r8+rsi]        ; SubWord via S-box\n' +
'0x401c5f  xor    eax, [rdx+rcx]            ; ^ rcon[round]\n' +
'0x401c62  xor    eax, [rdi+rcx*4-0x10]\n' +
'0x401c66  mov    [rdi+rcx*4], eax\n' +
'0x401c6a  inc    ecx\n' +
'0x401c6c  cmp    ecx, 0xa                  ; 10 rounds\n' +
'0x401c6f  jle    0x401c50',
      ir:
'define void @fn_401c40(i8* %key) {\n' +
'entry:\n' +
'  br label %round\n' +
'round:\n' +
'  %r    = phi i32 [ 1, %entry ], [ %r.next, %round ]\n' +
'  %prev = load i32, i32* getelementptr(%key, %r, -1)\n' +
'  %rot  = call i32 @llvm.fshl.i32(i32 %prev, i32 %prev, i32 8)\n' +
'  %sub  = call i32 @sbox.lookup(i32 %rot)\n' +
'  %rc   = load i8,  i8*  getelementptr(@rcon, i32 %r)\n' +
'  %x1   = xor i32 %sub, %rc\n' +
'  %x2   = xor i32 %x1,  %prev4\n' +
'  store i32 %x2, i32* getelementptr(%key, %r)\n' +
'  %r.next = add i32 %r, 1\n' +
'  %done   = icmp sgt i32 %r.next, 10\n' +
'  br i1 %done, label %exit, label %round\n' +
'}',
      pseudo:
'void fn_401c40(uint8_t *key) {\n' +
'    for (int r = 1; r <= 10; ++r) {\n' +
'        uint32_t t = ((uint32_t *)key)[r * 4 - 1];\n' +
'        t = (t << 8) | (t >> 24);\n' +
'        t = (sbox[(t >> 24) & 0xff] << 24)\n' +
'          | (sbox[(t >> 16) & 0xff] << 16)\n' +
'          | (sbox[(t >>  8) & 0xff] <<  8)\n' +
'          |  sbox[ t        & 0xff];\n' +
'        t ^= rcon[r];\n' +
'        ((uint32_t *)key)[r * 4] = ((uint32_t *)key)[r * 4 - 4] ^ t;\n' +
'    }\n' +
'}',
      semantic:
'// ── Semantic recovery ──────────────────────────────────────\n' +
'algorithm : AES-128 key expansion (FIPS-197 §5.2)\n' +
'family    : block cipher / key schedule\n' +
'key_bits  : 128            (from 10-round trip count)\n' +
'tables    : sbox @ 0x401a20, rcon @ 0x401b00\n' +
'primitive : RotWord ∘ SubWord ∘ XOR rcon\n' +
'\n' +
'// Reconstructed interface\n' +
'void aes128_key_expand(const uint8_t key[16],\n' +
'                       uint8_t round_keys[176]);\n' +
'\n' +
'// This is the output that matters. The C above tells you what the\n' +
'// bytes do; this tells you which specification they implement.'
    },

    sort: {
      name: 'std::sort (introsort)',
      verdict: 'Introsort · libstdc++ std::sort',
      family: 'Sorting algorithm',
      conf: { blind: 0.74, named: 0.98 },
      evidence: [
        ['ok',   'depth limit = 2·⌊log2(n)⌋ — introsort signature'],
        ['ok',   'fallback to heapsort when depth exhausted'],
        ['ok',   'insertion-sort cutoff at threshold 16'],
        ['ok',   'median-of-three pivot selection'],
        ['warn', 'inlined — no call boundary to key on']
      ],
      bytes:
'004022c0  55 48 89 e5 41 57 41 56  41 55 41 54 53 48 83 ec   |UH..AWAVAUATSH..|\n' +
'004022d0  38 48 89 7d c8 48 89 75  c0 48 8b 45 c8 48 2b 45   |8H.}.H.u.H.E.H+E|\n' +
'004022e0  c0 48 c1 f8 03 48 85 c0  0f 8e 4a 02 00 00 0f bd   |.H...H....J.....|',
      disasm:
'0x4022e0  sar    rax, 0x3                  ; (last - first) / 8\n' +
'0x4022e4  test   rax, rax\n' +
'0x4022e7  jle    0x402536\n' +
'0x4022ed  bsr    rdx, rax                  ; ⌊log2(n)⌋\n' +
'0x4022f1  add    edx, edx                  ; ×2 → depth limit\n' +
'0x4022f3  call   0x402100                  ; introsort_loop\n' +
'...\n' +
'0x402150  cmp    r12, 0x10                 ; threshold 16\n' +
'0x402154  jle    0x4023a0                  ; → insertion sort\n' +
'0x40215a  test   edx, edx                  ; depth exhausted?\n' +
'0x40215c  je     0x402480                  ; → heapsort',
      ir:
'define void @sort(i8* %first, i8* %last) {\n' +
'  %n     = sdiv i64 %span, 8\n' +
'  %lg    = call i64 @llvm.ctlz.i64(i64 %n)\n' +
'  %depth = mul i64 %lg2, 2                 ; 2·⌊log2 n⌋\n' +
'  call void @introsort_loop(%first, %last, i64 %depth)\n' +
'  call void @final_insertion_sort(%first, %last)\n' +
'  ret void\n' +
'}',
      pseudo:
'void sort(T *first, T *last) {\n' +
'    if (first == last) return;\n' +
'    long n = last - first;\n' +
'    int depth = 2 * ilog2(n);\n' +
'    introsort_loop(first, last, depth);\n' +
'    final_insertion_sort(first, last);\n' +
'}\n' +
'\n' +
'void introsort_loop(T *first, T *last, int depth) {\n' +
'    while (last - first > 16) {\n' +
'        if (depth == 0) { partial_sort(first, last, last); return; }\n' +
'        --depth;\n' +
'        T *cut = unguarded_partition_pivot(first, last);\n' +
'        introsort_loop(cut, last, depth);\n' +
'        last = cut;\n' +
'    }\n' +
'}',
      semantic:
'// ── Semantic recovery ──────────────────────────────────────\n' +
'algorithm  : introsort (Musser 1997)\n' +
'family     : comparison sort, hybrid\n' +
'provenance : libstdc++ std::sort\n' +
'complexity : O(n log n) worst case — guaranteed by the heapsort fallback\n' +
'threshold  : 16 elements → insertion sort\n' +
'depth      : 2·⌊log2 n⌋ → heapsort\n' +
'pivot      : median of three\n' +
'\n' +
'// The depth limit is the tell. Quicksort has no such counter;\n' +
'// its presence, with a heapsort target, is introsort and nothing else.'
    },

    chacha: {
      name: 'ChaCha20 block function',
      verdict: 'ChaCha20 · block function',
      family: 'Stream cipher',
      conf: { blind: 0.88, named: 0.99 },
      evidence: [
        ['ok',   'constant "expand 32-byte k" — 61707865 3320646e 79622d32 6b206574'],
        ['ok',   'rotation set 16, 12, 8, 7 — ChaCha quarter-round'],
        ['ok',   '20 rounds = 10 double-rounds'],
        ['ok',   '4×4 state of 32-bit words'],
        ['warn', 'no SIMD — scalar reference path']
      ],
      bytes:
'00403100  65 78 70 61 6e 64 20 33  32 2d 62 79 74 65 20 6b   |expand 32-byte k|\n' +
'00403110  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00   |................|',
      disasm:
'0x403240  add    eax, edx                  ; a += b\n' +
'0x403242  xor    ecx, eax                  ; d ^= a\n' +
'0x403244  rol    ecx, 0x10                 ; d <<<= 16\n' +
'0x403247  add    esi, ecx                  ; c += d\n' +
'0x403249  xor    edx, esi                  ; b ^= c\n' +
'0x40324b  rol    edx, 0xc                  ; b <<<= 12\n' +
'0x40324e  add    eax, edx\n' +
'0x403250  xor    ecx, eax\n' +
'0x403252  rol    ecx, 0x8                  ; d <<<= 8\n' +
'0x403255  add    esi, ecx\n' +
'0x403257  xor    edx, esi\n' +
'0x403259  rol    edx, 0x7                  ; b <<<= 7',
      ir:
'define void @qr(i32* %a, i32* %b, i32* %c, i32* %d) {\n' +
'  %1 = add i32 %av, %bv\n' +
'  %2 = xor i32 %dv, %1\n' +
'  %3 = call i32 @llvm.fshl.i32(i32 %2, i32 %2, i32 16)\n' +
'  %4 = add i32 %cv, %3\n' +
'  %5 = xor i32 %bv, %4\n' +
'  %6 = call i32 @llvm.fshl.i32(i32 %5, i32 %5, i32 12)\n' +
'  ; ... rotations 8 and 7 follow\n' +
'}',
      pseudo:
'#define QR(a,b,c,d)                       \\\n' +
'    a += b; d ^= a; d = rotl32(d, 16);    \\\n' +
'    c += d; b ^= c; b = rotl32(b, 12);    \\\n' +
'    a += b; d ^= a; d = rotl32(d,  8);    \\\n' +
'    c += d; b ^= c; b = rotl32(b,  7);\n' +
'\n' +
'void block(uint32_t out[16], const uint32_t in[16]) {\n' +
'    uint32_t x[16];\n' +
'    memcpy(x, in, sizeof x);\n' +
'    for (int i = 0; i < 10; ++i) {\n' +
'        QR(x[0], x[4], x[ 8], x[12]);   /* columns */\n' +
'        QR(x[1], x[5], x[ 9], x[13]);\n' +
'        QR(x[2], x[6], x[10], x[14]);\n' +
'        QR(x[3], x[7], x[11], x[15]);\n' +
'        QR(x[0], x[5], x[10], x[15]);   /* diagonals */\n' +
'        QR(x[1], x[6], x[11], x[12]);\n' +
'        QR(x[2], x[7], x[ 8], x[13]);\n' +
'        QR(x[3], x[4], x[ 9], x[14]);\n' +
'    }\n' +
'    for (int i = 0; i < 16; ++i) out[i] = x[i] + in[i];\n' +
'}',
      semantic:
'// ── Semantic recovery ──────────────────────────────────────\n' +
'algorithm : ChaCha20 block function (RFC 8439 §2.3)\n' +
'family    : ARX stream cipher\n' +
'rounds    : 20  (10 double-rounds)\n' +
'rotations : 16, 12, 8, 7\n' +
'constant  : "expand 32-byte k" @ 0x403100\n' +
'state     : 4×4 uint32\n' +
'\n' +
'// Reconstructed interface\n' +
'void chacha20_block(uint32_t out[16], const uint32_t in[16]);\n' +
'\n' +
'// The rotation quadruple 16/12/8/7 identifies ChaCha uniquely.\n' +
'// Salsa20 uses 7/9/13/18 over a different word ordering.'
    }
  };

  var current = 'aes', stage = 0, symbols = false, timer = null;

  var samplesEl = document.getElementById('rd-samples');
  var stepsEl = document.getElementById('rd-steps');
  var viewEl = document.getElementById('rd-view');
  var verdictEl = document.getElementById('rd-verdict');
  var evEl = document.getElementById('rd-evidence');
  var confEl = document.getElementById('rd-conf');
  var modeEl = document.getElementById('rd-mode');

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function renderSamples() {
    samplesEl.innerHTML = '';
    Object.keys(SAMPLES).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = SAMPLES[k].name;
      b.setAttribute('aria-pressed', String(k === current));
      b.addEventListener('click', function () {
        current = k; stage = 0; stop(); render();
      });
      samplesEl.appendChild(b);
    });
  }

  function renderSteps() {
    stepsEl.innerHTML = '';
    STAGES.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'step' + (i < stage ? ' is-done' : '');
      if (i === stage) b.setAttribute('aria-current', 'step');
      b.textContent = STAGE_LABEL[s];
      b.addEventListener('click', function () { stage = i; stop(); render(); });
      stepsEl.appendChild(b);
    });
  }

  function colourise(text, s) {
    var t = esc(text);
    if (s === 'bytes') {
      return t.replace(/\|(.*?)\|/g, '<span class="c-str">|$1|</span>')
              .replace(/^([0-9a-f]{8})/gm, '<span class="c-com">$1</span>');
    }
    if (s === 'disasm') {
      return t.replace(/;(.*)$/gm, '<span class="c-com">;$1</span>')
              .replace(/^(0x[0-9a-f]+)/gm, '<span class="c-com">$1</span>')
              .replace(/\b(push|mov|lea|rol|xor|add|inc|cmp|jle|je|call|ret|test|sar|bsr|movzx|sub|store|load)\b/g,
                       '<span class="c-key">$1</span>');
    }
    if (s === 'ir') {
      return t.replace(/;(.*)$/gm, '<span class="c-com">;$1</span>')
              .replace(/\b(define|br|label|phi|call|load|store|add|xor|mul|sdiv|icmp|ret|void|i32|i64|i8|i1)\b/g,
                       '<span class="c-key">$1</span>')
              .replace(/(%[\w.]+)/g, '<span class="c-fn">$1</span>');
    }
    if (s === 'pseudo') {
      return t.replace(/(\/\*.*?\*\/|\/\/.*$)/gm, '<span class="c-com">$1</span>')
              .replace(/\b(void|int|long|for|while|if|return|const|uint8_t|uint32_t|define|memcpy|sizeof|T)\b/g,
                       '<span class="c-key">$1</span>')
              .replace(/\b(0x[0-9a-f]+|\d+)\b/g, '<span class="c-num">$1</span>');
    }
    return t.replace(/(\/\/.*$)/gm, '<span class="c-com">$1</span>')
            .replace(/^(\w[\w_]*)\s*:/gm, '<span class="c-str">$1</span>:');
  }

  function render() {
    var s = SAMPLES[current];
    renderSamples();
    renderSteps();
    var key = STAGES[stage];
    viewEl.innerHTML = colourise(s[key], key);

    modeEl.textContent = symbols ? 'name-assisted' : 'name-blind';
    var conf = symbols ? s.conf.named : s.conf.blind;

    if (stage === STAGES.length - 1) {
      verdictEl.className = 'verdict is-allow';
      verdictEl.innerHTML =
        '<div class="verdict__label">' + esc(s.verdict) + '</div>' +
        '<div class="verdict__why">' + esc(s.family) + '</div>';
      confEl.textContent = (conf * 100).toFixed(0) + '%';
      evEl.innerHTML = s.evidence.map(function (e) {
        return '<span class="' + e[0] + '">' + (e[0] === 'ok' ? '✓ ' : '! ') + esc(e[1]) + '</span>';
      }).join('\n');
    } else {
      verdictEl.className = 'verdict';
      verdictEl.innerHTML =
        '<div class="verdict__label">Not yet recovered</div>' +
        '<div class="verdict__why">Stage ' + (stage + 1) + ' of ' + STAGES.length +
        ' — ' + STAGE_LABEL[STAGES[stage]] + '. Keep stepping.</div>';
      confEl.textContent = '—';
      evEl.innerHTML = '<span class="">awaiting semantic stage…</span>';
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    document.getElementById('rd-auto').textContent = 'Auto-run';
  }

  document.getElementById('rd-next').addEventListener('click', function () {
    stop();
    stage = Math.min(STAGES.length - 1, stage + 1);
    render();
  });
  document.getElementById('rd-prev').addEventListener('click', function () {
    stop();
    stage = Math.max(0, stage - 1);
    render();
  });
  document.getElementById('rd-auto').addEventListener('click', function () {
    if (timer) { stop(); return; }
    this.textContent = 'Stop';
    stage = 0; render();
    timer = setInterval(function () {
      if (stage >= STAGES.length - 1) { stop(); return; }
      stage++; render();
    }, 1500);
  });
  document.getElementById('rd-symbols').addEventListener('change', function (e) {
    symbols = e.target.checked;
    render();
  });

  render();
})();
