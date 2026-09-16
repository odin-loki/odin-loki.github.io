/* =============================================================
   SENTINEL — the statistical models, in the browser.

   Two of the models the analyst actually uses, running as
   themselves rather than as a JavaScript retelling:

     KDEHotspot     kernel density over incident locations, with
                    non-maximum suppression, ranked hottest first
     HawkesProcess  self-exciting intensity — the model that says
                    one burglary raises the odds of the next one
                    nearby, fitted on the points you give it

   SENTINEL's own CMakeLists asks for Qt6::Test, which needs
   Qt6::Concurrent, which does not exist in a single-threaded
   WebAssembly Qt. The models need none of it: Qt value types
   only, no Q_OBJECT anywhere, so this links Qt6::Core alone.

   What is NOT here is the rest of the application — ingest, the
   database, provenance, the nine-page dashboard. This is the
   maths, not the tool.
   ============================================================= */
#include "models/KDEHotspot.h"
#include "models/HawkesProcess.h"

#include <QPair>
#include <QString>
#include <QVector>

#include <cstdio>
#include <string>

#include <emscripten/emscripten.h>

namespace {
std::string g_out;

/* "lat,lon;lat,lon;…" — what the page can cheaply produce. */
QVector<QPair<double, double>> parse_points(const char* csv) {
    QVector<QPair<double, double>> out;
    if (!csv) return out;
    double a = 0.0, b = 0.0;
    const char* p = csv;
    while (*p) {
        if (std::sscanf(p, "%lf,%lf", &a, &b) == 2) out.append({a, b});
        while (*p && *p != ';') ++p;
        if (*p == ';') ++p;
    }
    return out;
}
} // namespace

extern "C" {

/* Top-k hotspots. Returns "lat,lon,peak,count,rank;…" or "!message". */
EMSCRIPTEN_KEEPALIVE
const char* sn_web_kde(const char* points, double latMin, double latMax,
                       double lonMin, double lonMax, int gridN, int topK,
                       double suppressionRadius) {
    const auto pts = parse_points(points);
    if (pts.size() < 3) { g_out = "!need at least three points"; return g_out.c_str(); }

    KDEHotspot kde(gridN > 0 ? gridN : 50, 1.0);
    const auto regions = kde.findHotspots(pts, latMin, latMax, lonMin, lonMax,
                                          topK > 0 ? topK : 5, suppressionRadius);
    g_out.clear();
    char line[256];
    for (const auto& r : regions) {
        std::snprintf(line, sizeof(line), "%.6f,%.6f,%.6g,%d,%d;",
                      r.centroidLat, r.centroidLon, r.peakDensity, r.crimeCount, r.rank);
        g_out += line;
    }
    if (g_out.empty()) g_out = "!no hotspot survived suppression";
    return g_out.c_str();
}

/* Fit the self-exciting model and report what it learned.
   Returns "mu,alpha,fitted" — alpha is the branching ratio: the expected
   number of follow-on events each event triggers. */
EMSCRIPTEN_KEEPALIVE
const char* sn_web_hawkes(const char* points, const char* days, int maxIterations) {
    const auto pts = parse_points(points);
    if (pts.size() < 3) { g_out = "!need at least three events"; return g_out.c_str(); }

    QVector<SpatiotemporalEvent> events;
    const char* d = days ? days : "";
    double t = 0.0;
    for (int i = 0; i < pts.size(); ++i) {
        if (*d && std::sscanf(d, "%lf", &t) == 1) {
            while (*d && *d != ';') ++d;
            if (*d == ';') ++d;
        } else {
            t = static_cast<double>(i);   // evenly spaced if no times given
        }
        events.append(SpatiotemporalEvent{t, pts[i].first, pts[i].second, QStringLiteral("incident")});
    }

    HawkesProcess h;
    const bool ok = h.fit(events, maxIterations > 0 ? maxIterations : 10);
    char line[160];
    std::snprintf(line, sizeof(line), "%.6g,%.6g,%d",
                  h.params().mu, h.branchingRatio(), ok ? 1 : 0);
    g_out = line;
    return g_out.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* sn_web_version() { return "SENTINEL — models/KDEHotspot + models/HawkesProcess"; }

} // extern "C"
