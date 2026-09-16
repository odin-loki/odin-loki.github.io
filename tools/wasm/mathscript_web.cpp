/* =============================================================
   MathScript — WebAssembly binding.

   A deliberately small C surface over the symbolic CAS: exactly the
   operations the demo on imortek.com.au/mathscript.html performs,
   and nothing else. Linking only what those reach is what keeps the
   module a few hundred kilobytes instead of tens of megabytes.

   Plain C exports rather than embind: embind pulls in its own
   binding machinery and RTTI, and this library is compiled
   -fno-rtti -fno-exceptions. cwrap on the JavaScript side is enough.

     ms_web_parse       parse, simplify, print back
     ms_web_derivative  d/dvar, simplified
     ms_web_integral    indefinite integral, simplified
     ms_web_eval        evaluate at a point, for plotting
     ms_web_isa         what vector ISA this build actually has
     ms_web_version     the library version it was built from

   Every string returned points at a static buffer owned here and is
   valid until the next call of the same function.
   ============================================================= */
#include "ms/symbolic/symbolic.hpp"
#include "ms/simd/isa.hpp"

#include <map>
#include <string>
#include <utility>

#include <emscripten/emscripten.h>

namespace {

using ms::SymExpr;

std::string& slot(int which) {
    static std::string buffers[6];
    return buffers[which];
}

/* Parse and hand back either the expression or a message the page can show.
   The leading "!" marks a failure — the CAS never prints one, so there is no
   ambiguity with a valid result. */
bool parse_or_message(const char* src, SymExpr& out, std::string& message) {
    auto parsed = ms::sym_parse(src ? src : "");
    if (!parsed) {
        message = "!" + parsed.error().message;
        return false;
    }
    out = std::move(*parsed);
    return true;
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
const char* ms_web_parse(const char* src) {
    std::string& out = slot(0);
    SymExpr e;
    if (!parse_or_message(src, e, out)) return out.c_str();
    out = ms::sym_to_string(ms::sym_simplify(std::move(e)));
    return out.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* ms_web_derivative(const char* src, const char* var) {
    std::string& out = slot(1);
    SymExpr e;
    if (!parse_or_message(src, e, out)) return out.c_str();
    const std::string v = var && *var ? var : "x";
    out = ms::sym_to_string(
        ms::sym_simplify(ms::sym_diff(std::move(e), v)));
    return out.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* ms_web_integral(const char* src, const char* var) {
    std::string& out = slot(2);
    SymExpr e;
    if (!parse_or_message(src, e, out)) return out.c_str();
    const std::string v = var && *var ? var : "x";
    out = ms::sym_to_string(ms::sym_simplify(ms::sym_integrate(e, v)));

    // sym_integrate signals "no closed form I can find" by handing back the
    // unevaluated derivative node (symbolic.hpp documents this convention).
    // Printing that verbatim would read as a wrong answer rather than an
    // honest refusal, so it is reported as one.
    const std::string sentinel = "d/d" + v + "(";
    if (out.compare(0, sentinel.size(), sentinel) == 0) {
        out = "!no closed form found for this integrand";
    }
    return out.c_str();
}

/* Returns NaN when the expression will not parse or will not evaluate; the
   caller plots a gap rather than a lie. */
EMSCRIPTEN_KEEPALIVE
double ms_web_eval(const char* src, const char* var, double at) {
    std::string message;
    SymExpr e;
    if (!parse_or_message(src, e, message)) return __builtin_nan("");
    std::map<std::string, double> env;
    env[var && *var ? var : "x"] = at;
    return ms::sym_eval(e, env);
}

EMSCRIPTEN_KEEPALIVE
const char* ms_web_isa() {
    std::string& out = slot(3);
    out = ms::simd::isa_summary(ms::simd::detect_isa());
    return out.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* ms_web_version() {
    std::string& out = slot(4);
    out = "MathScript 1.0.0";
    return out.c_str();
}

} // extern "C"
