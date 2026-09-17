# MathScript in the browser

`/mathscript.html` runs two things. The panel at the top is JavaScript written for
that page — an honest model of the idea, and it says so. The panel below it is
`libms_symbolic` itself, compiled from the MathScript tree to WebAssembly.

**113 KB of WebAssembly, 10 KB of loader.** The full library build is 4.9 MB; this
links only what four calls reach. Nothing is fetched until the reader asks.

## Rebuilding

```bash
git clone --depth 1 https://github.com/odin-loki/MathScript /tmp/ms
git clone --depth 1 --branch 13.2.0 \
    https://github.com/xtensor-stack/xsimd /tmp/xsimd
cp -r /tmp/xsimd/include /tmp/ms/vendor/xsimd/          # CMake's FetchContent
                                                        # needs network; this does not
cd /tmp/ms
# The portability fixes are UPSTREAM now -- odin-loki/MathScript d4e22df --
# so a fresh clone already has them and there is no patch to apply.
cp /path/to/tools/wasm/mathscript_web.cpp web/

source /path/to/emsdk/emsdk_env.sh
emcmake cmake -S . -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DMS_BUILD_TESTS=OFF -DMS_BUILD_INTEGRATION=OFF -DMS_BUILD_GUI=OFF \
  -DMS_BUILD_BENCHMARKS=OFF -DMS_ENABLE_CUDA=OFF -DMS_ENABLE_MPI=OFF \
  -DMS_ENABLE_NCCL=OFF -DMS_ENABLE_AVX512=OFF -DMS_BUILD_JIT=OFF -DMS_BUILD_PLUGIN=OFF
cmake --build build-wasm -j$(nproc)

em++ -std=c++23 -O3 -fno-exceptions -fno-rtti -msimd128 \
  -I include -I build-wasm/include -isystem vendor/xsimd/include \
  web/mathscript_web.cpp \
  build-wasm/src/symbolic/libms_symbolic.a \
  build-wasm/src/core/libms_core.a \
  build-wasm/src/simd/libms_simd.a \
  -o ../assets/wasm/mathscript.js \
  -sMODULARIZE=1 -sEXPORT_NAME=MathScript -sENVIRONMENT=web \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16MB -sFILESYSTEM=0 \
  -sEXPORTED_RUNTIME_METHODS=cwrap,ccall \
  -sEXPORTED_FUNCTIONS=_ms_web_parse,_ms_web_derivative,_ms_web_integral,\
_ms_web_eval,_ms_web_isa,_ms_web_version,_malloc,_free
```

The full build is **1002/1002 objects, no errors**, and links working WASM
executables (`mathscript-repl.js` runs under Node). The library is portable; it
just had not been compiled anywhere that proved it.

## The patch, and why it is not only about WebAssembly

Three defects stopped the build. Every one of them also affects native builds.

| File | Defect | Also breaks |
|---|---|---|
| `src/runtime/cpu/lapack_dpotrf.cpp` | `std::size_t` used with no `<cstddef>` | any libc++ build, Apple clang included |
| `src/simd/CMakeLists.txt` | `-mavx2 -mfma` given to every Clang | every non-x86 target |
| `src/simd/isa.cpp` + `isa.hpp` | `<cpuid.h>` and `__cpuid_count` gated on **compiler**, not **architecture** | aarch64 Linux under GCC or Clang |

The third is the interesting one:

```c
#elif defined(__GNUC__) || defined(__clang__)
#include <cpuid.h>
```

That reads "if the compiler is GCC-like, assume x86". It now gates on
`__i386__ || __x86_64__ || _M_IX86 || _M_X64` through an `MS_ISA_X86` macro, with
`MS_ISA_WASM_SIMD` beside it. `IsaFeatures` gained a `wasm_simd128` flag, so
`isa_summary()` answers `WASM SIMD128` rather than claiming `scalar`.

The panel's ISA line is that call, live. On a desktop the same code answers AVX2
or AVX-512.

---

# Cypha in the browser

`/cypha.html` gains a panel running `cypha::rff_features` — **40 KB** — measuring how well
random Fourier features reconstruct the exact RBF kernel as the feature count grows, for
all three projection kinds the library implements.

`cypha_core` builds clean: **47/47 objects**. Two defect classes had to be fixed.
They are UPSTREAM now -- odin-loki/Cypha `fd6ec5d`, 44 files -- so a fresh clone
already has them; what follows is the record of what they were:

- **43 files** use `std::max`, `std::fill`, `std::sort` and friends without including
  `<algorithm>`. libstdc++ leaks it transitively; libc++ does not. Same class of bug as
  MathScript's, and it breaks Apple clang builds the same way.
- **`src/rff_features.cpp` — a real numerical bug in ORF.**

## The ORF bug

`init_rff_weights_orf` implements Yu et al. (NeurIPS 2016): orthogonal rows whose norms are
drawn from `chi_d`, so an orthogonal row has the same length distribution as the Gaussian row
it replaces. A `N(0, s² I_d)` row has norm `s·√d`. The code had:

```cpp
const double chi_norm = std::sqrt(chi2(rng) / static_cast<double>(std::max(d_in, 1)));
```

Dividing by `d_in` makes `E[chi_norm²] = 1`, i.e. every row is normalised to unit length —
`√d` too short. The features then approximate a *different* kernel, so the error against the
exact RBF never converges. Measured, d=4, γ=0.5, 60 points:

| features D | iid | SORF | ORF before | ORF after |
|---|---|---|---|---|
| 16 | 15.77 | 14.79 | 30.60 | 15.00 |
| 64 | 7.86 | 10.17 | 20.36 | 6.56 |
| 256 | 4.20 | 8.31 | 21.77 (plateaued) | **3.53 (best)** |

Removing the division is the whole fix. ORF goes from three times worse than iid and flat, to
the best of the three — which is what the paper says it should be. It was invisible natively
because nothing compared the approximation against the exact kernel; compiling for the web
happened to be the thing that ran that comparison.

---

# RetDec's decoder in the browser

`/retdec.html` gains the bottom rung of its ladder for real: **Capstone 5, x86, 791 KB**,
the same disassembler `deps/capstone` links natively. Paste bytes, get instructions.

No patch needed — Capstone is pure C and cross-compiles untouched.

The rungs above it do not ship and the page says so: lifting to LLVM IR, structuring and
naming the algorithm are LLVM's work, and LLVM does not fit in a web page at any size.

---

---

# SENTINEL's models in the browser

`/sentinel.html` gains `models/KDEHotspot` and `models/HawkesProcess` — **2.4 MB**, because
Qt6Core comes with them — running on points you click onto a map.

Two obstacles, both real, both worked around rather than wished away.

**Qt6::Test pulls in Qt6::Concurrent.** SENTINEL's `find_package(Qt6 REQUIRED COMPONENTS Core
Widgets Network Charts Sql Test)` fails against a single-threaded WebAssembly Qt, which has no
Concurrent — Concurrent needs threads. The multi-threaded Qt WASM build has it, but that needs
`SharedArrayBuffer`, so COOP/COEP headers, which GitHub Pages cannot send.

The models do not need any of that. They use Qt *value* types only — QVector, QString,
QDateTime, QMap, QPair, QSet — with **no `Q_OBJECT` anywhere**, so no moc either. So the build
here is a separate minimal target (`sentinel-wasm-CMakeLists.txt`) compiling three model
sources plus the logger against `Qt6::Core` alone. SENTINEL's own CMakeLists is untouched.

**Qt6Core's WASM build uses embind.** Linking fails with a wall of `_emval_decref` undefined
until `-lembind` is added; Qt uses emval for locale and clipboard interop.

```bash
python3 -m aqt install-qt all_os wasm 6.8.0 wasm_singlethread -m qtcharts -O /tmp/qt
python3 -m aqt install-qt linux desktop 6.8.0 linux_gcc_64 -O /tmp/qt
cd /tmp/emsdk && ./emsdk install 3.1.56 && ./emsdk activate 3.1.56   # Qt 6.8 pins this exactly
/tmp/qt/6.8.0/wasm_singlethread/bin/qt-cmake -S tools/wasm -B build -G Ninja \
  -DQT_HOST_PATH=/tmp/qt/6.8.0/gcc_64 -DSENTINEL_SRC=/path/to/SENTINEL
```

Verified: two synthetic clusters of 14 and 10 incidents, and KDE ranks them 1 and 2 with the
right counts and centroids. Hawkes fits and reports a branching ratio near zero on evenly
spaced events, which is correct — evenly spaced events carry no self-excitation.

What is **not** here is the application: ingest, the database, provenance, the nine-page
dashboard. This is the maths, not the tool, and the page says so.

---

## What is not here, and why

- **RetDec** — `deps/` is LLVM, Capstone, Keystone, OpenSSL, Eigen and llama.cpp.
  Compiling LLVM to WebAssembly is a multi-hour, multi-gigabyte job and the artifact
  would be far too large to serve.
Cypha and RetDec's decoder are now here; see above. Cypha is built single-threaded, because
threaded WebAssembly needs `SharedArrayBuffer`, which needs COOP/COEP response headers, and
**GitHub Pages cannot send them**.

---

# TRACE's engine in the browser

`/trace.html` runs **two of the engine's own simulations for real** — the maze/camera
grid and `dark-vessel` — with `trace::Engine` out of `libtrace_core.a`, the same
library the native tools link. **410 KB of WebAssembly, 11 KB of loader**, fetched only
when the reader scrolls to the demo.

## No patch

TRACE is the first of these that needed none. `trace_core` built **21/21 objects,
no errors, first try**, both scalar and with the vendored xsimd under
`-msimd128`. Nothing in it assumed x86, assumed libstdc++'s transitive includes,
or reached for a header it had not included. The engine's own
`simd::backend_name()` answers `wasm` in the browser and `avx512f` natively, so
the caption under the demo is the build telling you what it is rather than a
claim typed into HTML.

```bash
git clone --depth 1 https://github.com/odin-loki/TRACE /tmp/trace
cd /tmp/trace
source /path/to/emsdk/emsdk_env.sh

emcmake cmake -S . -B build-wasm-simd -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DTRACE_WITH_XSIMD=ON -DTRACE_NATIVE_ARCH=OFF -DTRACE_BUILD_TESTS=OFF \
  -DCMAKE_CXX_FLAGS="-msimd128"
cmake --build build-wasm-simd --target trace_core -j$(nproc)

em++ -std=c++23 -O3 -fno-rtti -msimd128 \
  -I include -isystem third_party/xsimd/include -DTRACE_WITH_XSIMD \
  /path/to/tools/wasm/trace_web.cpp build-wasm-simd/libtrace_core.a \
  -o /path/to/assets/wasm/trace.js \
  -sMODULARIZE=1 -sEXPORT_NAME=TRACE -sENVIRONMENT=web \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=32MB -sFILESYSTEM=0 \
  -sEXPORTED_RUNTIME_METHODS=cwrap,ccall \
  -sEXPORTED_FUNCTIONS=_trace_web_version,_trace_web_maze,_trace_web_vessels,_malloc,_free
```

`-o` must name `trace.js` exactly: Emscripten bakes the sibling `.wasm` filename into
the loader, so building to a temporary name and renaming the pair afterwards gives a
loader that 404s.

## SIMD128 is worth turning on

Scalar and SIMD both work; the vectorised build is closer to the native figures
and marginally faster. Default maze, 120 scans, against the README's native
numbers (76% detection, 118% recovery, 1.6 m error, 1 switch):

| build | detection | recovery | mean error | id switches |
|---|---|---|---|---|
| scalar | 75.3% | 115.8% | 1.56 m | 2 |
| `-msimd128`, xsimd | **76.4%** | **117.5%** | **1.47 m** | **1** |

The gap is Monte-Carlo noise rather than accuracy: the two draw their normals in
a different order, which TRACE's own README says is the expected difference
between its backends.

## What the demos are, and one bug they caught

The whole run is computed in one call and handed back as JSON for the page to play
back, rather than stepping the engine from JavaScript. The engine costs the same
either way; buffering means the animation never stutters on a slow scan, and the
page can report the real wall-clock cost of the run instead of a number smeared
across `requestAnimationFrame`.

The vessel demo was written with the suspect in the middle lane so the association
has traffic on both sides of it to get wrong. The silencing was still keyed to
`vessel_0`, so for one build **nothing ever went dark** and the demo showed a
flawless track through a blackout that was not happening. It was caught by printing
the suspect's per-scan state and noticing the uncertainty never moved — which is
also why the page now reports the engine's own state for that track rather than the
widest circle on screen. The widest circle in open water is usually a false alarm,
and it was making a rather convincing case for itself.

The finding the fixed demo produces is not the flattering one. Identity survives a
five-scan blackout in 5 seeds out of 5, survives ten scans in 1 of 5, and never
survives fifteen. The cause is in TRACE's own limitations list: re-identification
works by pattern of life, and a vessel on a single straight transit has no pattern
of life to be re-identified by. The page says exactly that.
