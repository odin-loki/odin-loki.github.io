// TRACE in the browser.
//
// Two of the engine's own simulations, run for real: the maze/camera grid and
// the dark-vessel scenario. Nothing here models TRACE — `trace::Engine` does
// the work, out of libtrace_core.a, exactly as the native tools call it.
//
// A whole run is computed at once and handed back as JSON, rather than stepping
// from JavaScript. The engine is the expensive part and it is the same cost
// either way; buffering means the animation never stutters on a scan that took
// longer than a frame, and it lets the page report the real wall-clock cost of
// the whole run instead of a number smeared across requestAnimationFrame.
//
// Built by tools/wasm/README.md.

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <memory>
#include <string>
#include <vector>

#include "trace/backend/simd.hpp"
#include "trace/core/engine.hpp"
#include "trace/sim/maze.hpp"
#include "trace/sim/scenario.hpp"

using namespace trace;
using namespace trace::sim;

namespace {

// One buffer, reused. The caller copies the string out before asking again.
std::string g_out;

// --------------------------------------------------------------------- JSON

struct Json {
    std::string s;

    void raw(const char* t) { s += t; }
    void key(const char* k) {
        if (!s.empty() && s.back() != '{' && s.back() != '[') s += ',';
        s += '"'; s += k; s += "\":";
    }
    void num(const char* k, double v) {
        key(k);
        char buf[48];
        if (std::isfinite(v)) std::snprintf(buf, sizeof(buf), "%.4g", v);
        else std::snprintf(buf, sizeof(buf), "null");
        s += buf;
    }
    void str(const char* k, const std::string& v) {
        key(k); s += '"';
        for (char c : v) {
            if (c == '"' || c == '\\') { s += '\\'; s += c; }
            else if (c >= 0 && c < 0x20) s += ' ';
            else s += c;
        }
        s += '"';
    }
    void boolean(const char* k, bool v) { key(k); s += v ? "true" : "false"; }
    void comma() { if (!s.empty() && s.back() != '[' && s.back() != '{') s += ','; }
};

// The short tail of a track id: "track_00012" reads as "12" on a canvas.
std::string short_id(const std::string& id) {
    std::size_t i = id.size();
    while (i > 0 && id[i - 1] >= '0' && id[i - 1] <= '9') --i;
    std::string n = id.substr(i);
    while (n.size() > 1 && n[0] == '0') n.erase(0, 1);
    return n.empty() ? id : n;
}

// One scan, as the page draws it: where the truth is, where the engine thinks
// it is, how sure it is, and what it noticed.
// Which track, if any, is currently explaining a given truth entity. This is
// the scoring question — the engine never sees truth and never claims a
// correspondence — so it is answered here, by proximity, exactly the way
// sim/scenario.cpp scores a scan.
const TargetReport* nearest_to(const Scenario& s, const ScanReport& r,
                               const std::string& truth_id, Real within) {
    const Entity* e = nullptr;
    for (const auto& x : s.world.entities()) {
        if (x.id == truth_id) { e = &x; break; }
    }
    if (!e) return nullptr;
    const TargetReport* best = nullptr;
    Real best_d = within;
    for (const auto& t : r.targets) {
        const Real d = distance(t.position, e->position);
        if (d < best_d) { best_d = d; best = &t; }
    }
    return best;
}

void write_frame(Json& j, int scan, const Scenario& s, const ScanReport& r,
                 const Metrics& m) {
    j.comma();
    j.raw("{");
    j.num("scan", scan);
    j.num("t", r.timestamp);
    j.num("ms", r.latency_ms);
    j.num("dormant", r.n_dormant);

    j.key("truth"); j.raw("[");
    for (const auto& e : s.world.entities()) {
        j.comma(); j.raw("{");
        j.str("id", e.id);
        j.num("x", e.position.x);
        j.num("y", e.position.y);
        j.str("role", e.role);
        j.raw("}");
    }
    j.raw("]");

    j.key("tracks"); j.raw("[");
    for (const auto& t : r.targets) {
        j.comma(); j.raw("{");
        j.str("id", short_id(t.track_id));
        j.num("x", t.position.x);
        j.num("y", t.position.y);
        // The uncertainty radius is the whole reason to draw a track as a
        // circle rather than a dot: a coasting track visibly swells.
        j.num("u", t.position_uncertainty_m);
        j.num("r", t.existence);          // probability it exists at all
        j.num("age", t.age_scans);
        j.num("miss", t.misses);
        j.num("spd", t.speed_mps);
        j.raw("}");
    }
    j.raw("]");

    j.key("events"); j.raw("[");
    for (std::size_t i = 0; i < r.events.size() && i < 6; ++i) {
        j.comma(); j.raw("{");
        j.str("type", r.events[i].type);
        j.raw("}");
    }
    j.raw("]");

    if (!r.rendezvous.empty()) {
        const auto& w = r.rendezvous.front();
        j.key("rv"); j.raw("{");
        j.str("a", short_id(w.track_a));
        j.str("b", short_id(w.track_b));
        j.num("eta", w.eta_s);
        j.num("conf", w.confidence);
        j.str("method", w.method);
        j.raw("}");
    }

    // Running score, so the page can show the metrics climbing rather than
    // only a verdict at the end.
    j.key("m"); j.raw("{");
    j.num("det", m.detection_rate());
    j.num("rec", m.recovery_of_ceiling());
    j.num("err", m.mean_position_error());
    j.num("sw", m.id_switches);
    j.num("gh", m.ghost_tracks);
    j.raw("}");

    j.raw("}");
}

void write_summary(Json& j, const Metrics& m, double wall_ms) {
    j.key("summary"); j.raw("{");
    j.num("scans", m.scans);
    j.num("det", m.detection_rate());
    j.num("rec", m.recovery_of_ceiling());
    j.num("cov", m.sensor_coverage());
    j.num("err", m.mean_position_error());
    j.num("maxErr", m.max_position_error);
    j.num("sw", m.id_switches);
    j.num("gh", m.ghost_tracks);
    j.num("medianMs", m.median_latency_ms());
    j.num("p95Ms", m.p95_latency_ms());
    j.num("wallMs", wall_ms);
    j.raw("}");
}

double now_ms() {
    using namespace std::chrono;
    return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

}  // namespace

extern "C" {

// The engine's own answer for which kernel it is running, not a claim written
// here. On a desktop the same call says avx2 or avx512f; in a browser it says
// wasm. Getting that wrong in a caption is exactly the kind of thing nobody
// ever checks, so it is not written by hand.
const char* trace_web_version() {
    g_out = std::string("TRACE 0.2.0 / ") + simd::backend_name()
          + " / " + std::to_string(simd::Batch::size) + " lanes";
    return g_out.c_str();
}

// --------------------------------------------------------------- maze demo
//
// The headline simulation. Travellers walk a maze under a grid of cameras,
// some of which are switched off — so the engine has to hold identity across
// a corridor where nothing is watching, and pick it up again on the far side.
const char* trace_web_maze(int width, int height, int panel_cols, int panel_rows,
                           int travellers, int blind, int scans, double pd,
                           double swap, unsigned seed) {
    width = clampi(width, 5, 41);
    height = clampi(height, 5, 25);
    panel_cols = clampi(panel_cols, 1, 8);
    panel_rows = clampi(panel_rows, 1, 8);
    travellers = clampi(travellers, 1, 12);
    scans = clampi(scans, 10, 300);
    blind = clampi(blind, 0, panel_cols * panel_rows - 1);

    const double cell = 8.0;
    Rng rng(seed);

    Maze maze(width, height, cell);
    maze.generate(rng);
    maze.add_loops(rng, 0.10);

    auto panels = CameraGrid::partition(maze, panel_cols, panel_rows, pd, cell * 0.15);
    for (auto& p : panels) p.swap_probability = swap;

    // Switch panels off without replacement, or the run reports more blind
    // corridors than it actually made.
    int off = 0;
    const int want = std::min(blind, static_cast<int>(panels.size()));
    while (off < want) {
        const auto i = static_cast<std::size_t>(
            rng.uniform_int(0, static_cast<int>(panels.size()) - 1));
        if (!panels[i].enabled) continue;
        panels[i].enabled = false;
        ++off;
    }

    Scenario s(seed);
    s.name = "maze-camera-grid";
    s.n_scans = scans;
    s.match_radius_m = cell * 1.5;

    DomainProfile profile = CityCameraSurveillance();
    profile.scan_dt_s = 1.0;
    profile.pos_noise_m = cell * 0.15;
    profile.meas_noise_var = profile.pos_noise_m * profile.pos_noise_m * 4.0;
    profile.p_detection = pd;
    profile.rv_threshold_m = cell * 1.2;
    profile.coloc_dist_m = cell * 2.0;
    profile.chokepoint_m = cell;
    profile.brush_pass_m = cell * 0.8;
    profile.parallel_route_m = cell * 1.5;

    s.engine_config.profile = profile;
    s.engine_config.area = maze.bounds();
    s.engine_config.seed = seed;
    for (auto& cfg : panels) s.sensors.push_back(std::make_unique<CameraPanel>(cfg));

    for (int i = 0; i < travellers; ++i) {
        Entity e;
        e.id = "traveller_" + std::to_string(i);
        const Cell start = maze.random_cell(rng);
        const Cell goal = maze.random_cell(rng);
        e.position = maze.centre_of(start);
        e.goal = maze.centre_of(goal);
        e.waypoints = maze.waypoints(maze.path(start, goal));
        e.velocity = Vec2{1.3 + 0.25 * i, 0.0};
        e.mode = "walking";
        e.role = (i == 0 ? "subject" : "civilian");
        s.world.add(std::move(e));
    }

    s.on_scan = [&maze, &rng](Scenario& sc, int) {
        for (auto& e : sc.world.entities()) {
            if (e.waypoint_index < e.waypoints.size() || e.dwell_remaining_s > 0.0) continue;
            const Cell from = maze.cell_at(e.position);
            const Cell to = maze.random_cell(rng);
            const auto cells = maze.path(from, to);
            if (cells.size() < 2) continue;
            e.waypoints = maze.waypoints(cells);
            e.waypoint_index = 1;
            e.dwell_remaining_s = rng.uniform(0.0, 6.0);
        }
    };

    Json j;
    j.raw("{");
    j.boolean("ok", true);
    j.str("kind", "maze");
    j.num("width", width);
    j.num("height", height);
    j.num("cell", cell);
    j.num("blind", off);

    // Walls, four bits per cell, read back through the public predicate so this
    // does not depend on the private bitmask layout.
    j.key("walls"); j.raw("[");
    for (int row = 0; row < height; ++row) {
        for (int col = 0; col < width; ++col) {
            const Cell c{col, row};
            int bits = 0;
            const Cell n{col, row + 1}, e{col + 1, row}, so{col, row - 1}, w{col - 1, row};
            if (!maze.in_bounds(n)  || maze.wall_between(c, n))  bits |= 1;
            if (!maze.in_bounds(e)  || maze.wall_between(c, e))  bits |= 2;
            if (!maze.in_bounds(so) || maze.wall_between(c, so)) bits |= 4;
            if (!maze.in_bounds(w)  || maze.wall_between(c, w))  bits |= 8;
            j.comma();
            j.s += std::to_string(bits);
        }
    }
    j.raw("]");

    j.key("panels"); j.raw("[");
    for (const auto& p : panels) {
        j.comma(); j.raw("{");
        j.str("id", p.id);
        j.num("x0", p.footprint.xmin);
        j.num("x1", p.footprint.xmax);
        j.num("y0", p.footprint.ymin);
        j.num("y1", p.footprint.ymax);
        j.boolean("on", p.enabled);
        j.raw("}");
    }
    j.raw("]");

    Engine engine(s.engine_config);
    j.key("frames"); j.raw("[");
    s.on_report = [&](const Scenario& sc, int scan, const ScanReport& r,
                      const Metrics& m) { write_frame(j, scan, sc, r, m); };

    const double t0 = now_ms();
    const Metrics m = run(s, engine);
    const double wall = now_ms() - t0;

    j.raw("]");
    write_summary(j, m, wall);
    j.raw("}");

    g_out.swap(j.s);
    return g_out.c_str();
}

// -------------------------------------------------------- dark-vessel demo
//
// Satellite AIS over an ocean basin. One vessel switches its transponder off
// mid-transit and comes back up later. Nothing reports it in between, so the
// only thing holding the identity is the engine's own belief that the track
// still exists — which is what `existence` is for, and why the uncertainty
// circle swells across the gap instead of the track being deleted.
const char* trace_web_vessels(int vessels, int scans, int dark_from, int dark_to,
                              double pd, unsigned seed) {
    vessels = clampi(vessels, 2, 10);
    scans = clampi(scans, 30, 300);
    dark_from = clampi(dark_from, 1, scans - 2);
    dark_to = clampi(dark_to, dark_from + 1, scans - 1);

    Scenario s(seed);
    s.name = "dark-vessel";
    s.n_scans = scans;
    // A vessel covers 21.6 km between hourly scans and the motion model's own
    // one-scan uncertainty is around 13 km, so a tight radius would be scoring
    // the scan rate rather than the tracker.
    s.match_radius_m = 8000.0;

    const std::string suspect = "vessel_" + std::to_string(vessels / 2);
    const Area basin{0, 4400000, 0, 1200000};
    s.engine_config.profile = Maritime();
    s.engine_config.area = basin;
    s.engine_config.seed = seed;

    auto ais = std::make_unique<WideAreaReporter>(WideAreaReporter::Config{
        "AIS_SAT", basin, pd, 200.0, Modality::SIGINT, 0.85, 0.20, true});
    auto* ais_ptr = ais.get();
    s.sensors.push_back(std::move(ais));

    const double lane = 1100000.0 / (vessels + 1);
    for (int i = 0; i < vessels; ++i) {
        Entity v;
        v.id = "vessel_" + std::to_string(i);
        // The suspect sits in the middle lane rather than the edge, so it is
        // surrounded by traffic the association has to keep it apart from.
        v.role = (v.id == suspect ? "suspect" : "traffic");
        const Real y = 60000.0 + (i + 1) * lane;
        // Staggered departures. Five ships leaving the same meridian at the
        // same speed stay in a column forever, which is not what a shipping
        // lane looks like and gives the association nothing to get wrong.
        const Real x0 = 80000.0 + (i * 397000.0);
        v.position = Vec2{x0, y};
        v.velocity = Vec2{6.0, 0.0};                     // about 12 knots
        // A straight transit across the basin, drifting slightly north.
        std::vector<Vec2> path;
        const int steps = 130;
        const Vec2 a{x0, y}, b{x0 + 2600000.0, y + 60000};
        for (int k = 0; k <= steps; ++k) {
            const Real f = static_cast<Real>(k) / steps;
            path.push_back(Vec2{a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f});
        }
        v.waypoints = std::move(path);
        s.world.add(v);
    }

    s.on_scan = [ais_ptr, dark_from, dark_to, &suspect](Scenario&, int scan) {
        if (scan == dark_from) ais_ptr->silenced.insert(suspect);
        if (scan == dark_to) ais_ptr->silenced.erase(suspect);
    };
    s.engine_config.coverage = std::make_shared<ScenarioCoverage>(&s.sensors);

    Json j;
    j.raw("{");
    j.boolean("ok", true);
    j.str("kind", "vessels");
    j.num("x0", basin.xmin); j.num("x1", basin.xmax);
    j.num("y0", basin.ymin); j.num("y1", basin.ymax);
    j.num("darkFrom", dark_from);
    j.num("darkTo", dark_to);

    Engine engine(s.engine_config);
    int dormant_peak = 0;
    // The whole claim of this scenario: the identity on the far side of the
    // blackout is the SAME identity, not a new track that happens to be in the
    // right place. So the track explaining the suspect is recorded each scan,
    // and the ids either side of the gap are compared at the end.
    std::string id_before, id_after;
    // How wide the belief got before the track was retired, and how long the
    // engine went with nothing explaining the suspect.
    //
    // The gap is the unbroken run from the moment the transponder goes off
    // until something is on the vessel again — NOT every scan after that with
    // no track, which would fold in the ordinary misses a 0.8 detection
    // probability produces for the rest of the voyage and made a three-scan
    // blackout read as twenty-one.
    Real max_coast = 0.0;
    int gap = 0;
    bool gap_open = false, gap_closed = false;
    j.key("frames"); j.raw("[");
    s.on_report = [&](const Scenario& sc, int scan, const ScanReport& r,
                      const Metrics& m) {
        dormant_peak = std::max(dormant_peak, r.n_dormant);
        const TargetReport* t = nearest_to(sc, r, suspect, 8000.0);
        if (t) {
            if (scan < dark_from) id_before = t->track_id;
            if (scan > dark_to + 2 && id_after.empty()) id_after = t->track_id;
            if (scan >= dark_from) max_coast = std::max(max_coast, t->position_uncertainty_m);
            if (gap_open) gap_closed = true;
        } else if (scan >= dark_from && !gap_closed) {
            gap_open = true;
            ++gap;
        }
        write_frame(j, scan, sc, r, m);
        // Reopen the frame object to add what only this scenario knows.
        j.s.pop_back();
        j.str("sid", t ? short_id(t->track_id) : std::string());
        j.num("su", t ? t->position_uncertainty_m : 0.0);
        j.num("sr", t ? t->existence : 0.0);
        j.raw("}");
    };

    const double t0 = now_ms();
    const Metrics m = run(s, engine);
    const double wall = now_ms() - t0;

    j.raw("]");
    write_summary(j, m, wall);
    j.num("dormantPeak", dormant_peak);
    j.str("idBefore", short_id(id_before));
    j.str("idAfter", short_id(id_after));
    j.num("maxCoast", max_coast);
    j.num("blindScans", gap);
    j.boolean("sameIdentity",
              !id_before.empty() && !id_after.empty() && id_before == id_after);
    j.raw("}");

    g_out.swap(j.s);
    return g_out.c_str();
}

}  // extern "C"
