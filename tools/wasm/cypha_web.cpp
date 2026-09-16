/* =============================================================
   Cypha — random Fourier features, in the browser.

   /cypha.html argues that random features are what let a linear
   head separate things a linear head cannot, and that the
   orthogonal variants do it with fewer features. That is a
   measurable claim, so this measures it, with the library's own
   code rather than a retelling.

     ‖K − K̂‖_F   the Frobenius distance between the exact RBF
                  kernel matrix and the one random features
                  reconstruct, over n sampled points

   Fewer features, worse approximation. The interesting part is
   that SORF and ORF — structured and dense orthogonal rows —
   close the gap sooner than iid Gaussian rows do, which is the
   whole reason they are in the library.

   Single-threaded on purpose: threaded WebAssembly needs
   SharedArrayBuffer, which needs COOP/COEP response headers, and
   GitHub Pages cannot send them.
   ============================================================= */
#include "cypha/rff_features.hpp"

#include <random>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

namespace {
std::string g_out;

std::vector<double> sample_points(int n, int d, unsigned seed) {
    std::mt19937 rng(seed);
    std::normal_distribution<double> g(0.0, 1.0);
    std::vector<double> X(static_cast<std::size_t>(n) * d);
    for (auto& v : X) v = g(rng);
    return X;
}

cypha::RffProjectionKind kind_of(int k) {
    switch (k) {
        case 1:  return cypha::RffProjectionKind::Sorf;
        case 2:  return cypha::RffProjectionKind::Orf;
        default: return cypha::RffProjectionKind::IidGaussian;
    }
}
} // namespace

extern "C" {

/* Frobenius error of the random-feature kernel against the exact RBF kernel.
   kind: 0 iid Gaussian, 1 SORF, 2 ORF. */
EMSCRIPTEN_KEEPALIVE
double cy_web_rff_error2(int kind, int D, int d_in, int n, double gamma, unsigned seed, int kmscale) {
    if (D < 1 || d_in < 1 || n < 2) return -1.0;
    std::mt19937 rng(seed);
    std::vector<double> W, b;
    cypha::init_rff_weights(kind_of(kind), rng, gamma, D, d_in, W, b, kmscale != 0);
    const std::vector<double> X = sample_points(n, d_in, seed ^ 0x9e3779b9u);
    return cypha::rff_kernel_frobenius_error(X.data(), n, d_in, W.data(), b.data(), D, gamma);
}

/* The exact RBF kernel between two points, for the page to show alongside. */
EMSCRIPTEN_KEEPALIVE
double cy_web_rff_error(int kind, int D, int d_in, int n, double gamma, unsigned seed) {
    return cy_web_rff_error2(kind, D, d_in, n, gamma, seed, 0);
}

EMSCRIPTEN_KEEPALIVE
double cy_web_rbf(double ax, double ay, double bx, double by, double gamma) {
    const double a[2] = {ax, ay};
    const double bpt[2] = {bx, by};
    return cypha::rbf_kernel_value(a, bpt, 2, gamma);
}

/* A whole sweep in one call: error at D = 2,4,8,… up to maxD, comma separated.
   One crossing of the WASM boundary instead of a dozen. */
EMSCRIPTEN_KEEPALIVE
const char* cy_web_sweep(int kind, int maxD, int d_in, int n, double gamma, unsigned seed) {
    g_out.clear();
    for (int D = 2; D <= maxD; D *= 2) {
        const double e = cy_web_rff_error(kind, D, d_in, n, gamma, seed);
        if (!g_out.empty()) g_out += ",";
        g_out += std::to_string(D) + ":" + std::to_string(e);
    }
    return g_out.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* cy_web_version() { return "Cypha 2.4.0 — cypha::rff_features"; }

} // extern "C"
