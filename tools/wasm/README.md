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
git apply /path/to/tools/wasm/mathscript-portability.patch
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

`cypha_core` builds clean: **47/47 objects**. Two defect classes had to be fixed
(`tools/wasm/cypha-portability.patch`, 44 files):

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
