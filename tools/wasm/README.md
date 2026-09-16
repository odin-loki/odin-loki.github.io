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

## What is not here, and why

- **SENTINEL** — `sentinel_core` links `Qt6::Core/Network/Sql/Charts/Widgets`, so the
  analytics are not separable from the GUI toolkit. Qt for WebAssembly exists, needs
  its own SDK, and its Charts/Sql/HttpServer support is partial.
- **RetDec** — `deps/` is LLVM, Capstone, Keystone, OpenSSL, Eigen and llama.cpp.
  Compiling LLVM to WebAssembly is a multi-hour, multi-gigabyte job and the artifact
  would be far too large to serve.
- **Cypha** — plausible: C++23, and CUDA/Qt/OpenSSL/SQLite all default off. The
  obstacle is `std::thread`; threaded WebAssembly needs `SharedArrayBuffer`, which
  needs COOP/COEP response headers, and **GitHub Pages cannot send them**. It has to
  build single-threaded.
