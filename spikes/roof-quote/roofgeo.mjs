// roofgeo.mjs
// ----------------------------------------------------------------------------
// PURE, dependency-free ES module that turns a set of roof-facet polygons into
// an EagleView-grade structured roof model: per-facet geometry (area, pitch,
// azimuth, orientation), classified edges (ridge/hip/valley/eave/rake), and
// linear footage totals.
//
// No network, no DOM, no imports (except node:assert/strict in the self-test
// block, which only runs when the file is executed directly).
//
// Coordinate convention:
//   - Input rings are 2D (x = easting/east, y = northing/north) in METERS.
//   - sampleHeight(x, y) lifts each vertex to a 3D elevation Z in METERS.
//   - Compass: 0 = North (+y), 90 = East (+x), 180 = South, 270 = West.
// ----------------------------------------------------------------------------

const FT_PER_M = 3.28084;          // meters -> feet (linear)
const SQFT_PER_SQM = 10.7639;      // square meters -> square feet
// Default endpoint-merge tolerance for direct callers. The real value is passed
// per-call via opts.shareTolM from facetsToRoofModel (roof3d.html): ~0.6 m for the
// analytic plane-intersection path (its adjacent facets snap each shared crease to
// the SAME exact intersection LINE, so perpendicular separation is ~0 — 0.6 m pairs
// the two on-line copies whose endpoints differ ALONG the line, without the old
// fuzzy ~1 m snap that collapsed distinct-but-near edges), and 1.0 m for the legacy
// raster fallback's independently-regularized rings. This constant only applies if a
// caller omits opts.shareTolM.
const SHARE_TOL_M = 0.6;            // default endpoint-merge distance (m); overridden per-call

// --- small vector helpers ---------------------------------------------------

function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function norm3(a) { return Math.hypot(a[0], a[1], a[2]); }
function dist2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

// Close a ring if the last point repeats the first; return a copy with no
// duplicate closing vertex (so edges = consecutive pairs wrapping around).
function openRing(ring) {
  const r = ring.slice();
  if (r.length > 1) {
    const f = r[0], l = r[r.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) r.pop();
  }
  return r;
}

// --- plane fitting & geometry ----------------------------------------------

// Least-squares best-fit plane normal for a set of 3D points.
// Uses the Newell method for a robust polygon normal (area-weighted), which
// for a planar polygon equals the true plane normal and is stable for the
// slightly-noisy lifted vertices we get from sampleHeight.
function fitNormal(pts3) {
  let nx = 0, ny = 0, nz = 0;
  const n = pts3.length;
  for (let i = 0; i < n; i++) {
    const cur = pts3[i];
    const nxt = pts3[(i + 1) % n];
    nx += (cur[1] - nxt[1]) * (cur[2] + nxt[2]);
    ny += (cur[2] - nxt[2]) * (cur[0] + nxt[0]);
    nz += (cur[0] - nxt[0]) * (cur[1] + nxt[1]);
  }
  let normal = [nx, ny, nz];
  const len = norm3(normal);
  if (len < 1e-12) return [0, 0, 1];
  normal = [normal[0] / len, normal[1] / len, normal[2] / len];
  // Orient upward (roof normals point to the sky).
  if (normal[2] < 0) normal = [-normal[0], -normal[1], -normal[2]];
  return normal;
}

// True 3D area of a planar polygon (sum of triangle-fan cross products / 2).
function area3D(pts3) {
  let acc = [0, 0, 0];
  const n = pts3.length;
  const o = pts3[0];
  for (let i = 1; i < n - 1; i++) {
    const c = cross3(sub3(pts3[i], o), sub3(pts3[i + 1], o));
    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
  }
  return norm3(acc) / 2;
}

function centroid3(pts3) {
  let x = 0, y = 0, z = 0;
  for (const p of pts3) { x += p[0]; y += p[1]; z += p[2]; }
  const n = pts3.length;
  return [x / n, y / n, z / n];
}

// 8-point compass label from a compass azimuth in degrees.
function compass8(az) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((az % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

// Pitch & facing from an upward plane normal.
//   pitchDeg  = angle between normal and vertical (0 = flat, 90 = wall).
//   azimuth   = compass direction the surface faces DOWNHILL = the horizontal
//               projection of the steepest-descent direction.
function pitchAndAzimuth(normal) {
  const [nx, ny, nz] = normal;
  // Angle from vertical:
  const pitchDeg = Math.acos(Math.min(1, Math.max(-1, nz))) * 180 / Math.PI;
  // Steepest-descent (downhill) horizontal direction = the horizontal part of
  // the UPWARD normal. For a plane that is higher on its +x side, the upward
  // normal tilts toward -x (the low side), so (nx, ny) already points downhill
  // — i.e. the way water runs / the direction the surface faces.
  const dx = nx, dy = ny;
  let azimuthDeg;
  if (Math.hypot(dx, dy) < 1e-9) {
    azimuthDeg = 0; // flat roof: no meaningful facing
  } else {
    // Compass: 0=N(+y), 90=E(+x) => az = atan2(east, north).
    azimuthDeg = Math.atan2(dx, dy) * 180 / Math.PI;
    azimuthDeg = ((azimuthDeg % 360) + 360) % 360;
  }
  return { pitchDeg, azimuthDeg };
}

// --- main builder -----------------------------------------------------------

export function buildRoofModel(planes, sampleHeight, opts) {
  opts = opts || {};
  // Endpoint-merge tolerance: the analytic extractor passes IDENTICAL shared
  // intersection coords → use a tight 0.05 m. The legacy raster fallback passes
  // independently-regularized rings → keep the original ~1 m fuzzy match.
  const shareTol = (typeof opts.shareTolM === "number") ? opts.shareTolM : SHARE_TOL_M;

  // --- DEGENERATE-GEOMETRY GUARD (anti-spike) --------------------------------
  // The analytic extractor lifts each vertex with p.liftZ = a·E + b·N + c (a plane
  // equation that EXTRAPOLATES LINEARLY). Two real-world inputs make that explode into
  // the "giant needle / spike" artifact seen on 7 Painter Ave:
  //   • a Solar segment with an implausible pitch (steep tanP) → a tiny plan error
  //     becomes a huge vertical error;
  //   • a clip-corner vertex (line∩line) landing far from the plane's valid extent,
  //     or a NaN/Inf height → the lifted Z balloons to thousands of metres.
  // A single such vertex draws a line from the roof out to that altitude = the spike.
  // Defence in depth: (1) clamp every lifted Z into a plausible band around the facet's
  // OWN robust-median height (the slope can only carry it so far across the facet's plan
  // span); (2) reject a whole facet whose pitch is wall-steep or whose lifted ring is
  // degenerate. Rejected facets are reported via model.degenerate so the caller can fall
  // back to a clean massing / photoreal instead of rendering garbage.
  const MAX_ROOF_PITCH_DEG = 72;     // a residential roof facet steeper than this is a wall / bad plane
  const median = (arr) => { const s = arr.slice().sort((a, b) => a - b); const n = s.length; return n ? (n & 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

  // Sanitize one lifted ring in place: replace NaN/Inf with the ring's median height,
  // then clamp each Z so it cannot stray further from the median than the facet could
  // plausibly rise/fall across its own plan extent (planSpan · tan(MAX_PITCH) + slack).
  // Returns { ring3, clamped } where clamped counts how many vertices were corrected.
  function sanitizeRing3(ring3) {
    let clamped = 0;
    const finiteZ = ring3.map((v) => v[2]).filter((z) => isFinite(z));
    if (!finiteZ.length) return { ring3, clamped: ring3.length, dead: true };
    const medZ = median(finiteZ);
    // plan extent of the ring bounds how far Z may legitimately travel across the facet.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of ring3) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const planSpan = Math.hypot(maxX - minX, maxY - minY);
    // The band is the SMALLER of two bounds, so a single wild vertex is pulled back to roughly
    // where the facet's OTHER vertices already sit — not merely to the theoretical max-pitch reach
    // (which is so wide a 46 m corner survives and still spikes/over-tilts the facet):
    //   • spread of the INLIER heights (those within a generous max-pitch reach of the median) + 1 m;
    //   • the geometric max-pitch reach over the plan span (a hard ceiling).
    const maxReach = Math.max(3, planSpan * Math.tan(MAX_ROOF_PITCH_DEG * Math.PI / 180) + 2);
    const inliers = finiteZ.filter((z) => Math.abs(z - medZ) <= maxReach);
    const inlierSpread = inliers.length ? Math.max(...inliers) - Math.min(...inliers) : 0;
    const reach = Math.max(1.5, Math.min(maxReach, inlierSpread + 1));
    const lo = medZ - reach, hi = medZ + reach;
    const out = ring3.map(([x, y, z]) => {
      let zz = z;
      if (!isFinite(zz)) { zz = medZ; clamped++; }
      else if (zz < lo) { zz = lo; clamped++; }
      else if (zz > hi) { zz = hi; clamped++; }
      return [x, y, zz];
    });
    return { ring3: out, clamped, dead: false };
  }

  // PLAN-SPACE spike test: a clip-corner from two near-parallel crease lines (or a runaway
  // footprint vertex on a bad geocode) lands a single ring vertex hundreds of metres away IN
  // PLAN — a flat horizontal NEEDLE (the 7 Painter Ave artifact: a facet/wall mesh spiking
  // ~100 m in northing while staying at roof height). Z-clamping can't fix that (the height is
  // fine; the X/Y is wild). Detect it: a vertex whose plan distance from the ring's median
  // centre is far beyond the bulk of the ring → the facet is degenerate, drop it.
  function ringPlanSpike(ring2) {
    const n = ring2.length; if (n < 3) return false;
    const xs = ring2.map((v) => v[0]).sort((a, b) => a - b);
    const ys = ring2.map((v) => v[1]).sort((a, b) => a - b);
    const mx = xs[(n - 1) >> 1], my = ys[(n - 1) >> 1];          // median centre (robust to the outlier)
    const d = ring2.map(([x, y]) => Math.hypot(x - mx, y - my)).sort((a, b) => a - b);
    const medD = d[(n - 1) >> 1] || 0;                            // typical vertex distance from centre
    const maxD = d[d.length - 1];
    // a real building facet is compact: its farthest vertex is at most a few × the median reach,
    // and never more than ~60 m from centre (a residential parcel). Either breach ⇒ a spike.
    return maxD > 60 || (medD > 0.5 && maxD > medD * 8);
  }

  // 1) Per-plane geometry --------------------------------------------------
  const degenerate = [];   // ids of facets dropped as degenerate (spike / wall / sliver)
  const facets = [];
  for (const p of planes) {
    const ring2 = openRing(p.ring);
    if (ring2.length < 3) { degenerate.push(p.id); continue; }
    if (ringPlanSpike(ring2)) { degenerate.push(p.id); continue; }   // horizontal-needle facet → drop (anti-spike)
    // Lift each vertex to 3D. If the plane carries an exact analytic height function
    // (p.liftZ — the analytic extractor passes one), use it: it is smooth and exact, so
    // crease endpoints get the TRUE roof elevation instead of a noisy DSM sample, which
    // makes ridge/hip/valley classification (edge-vs-centroid height) reliable and lets
    // the 3D overlay ride the real slope. Falls back to the shared DSM sampleHeight.
    const lift = (typeof p.liftZ === "function") ? p.liftZ : sampleHeight;
    const liftedRaw = ring2.map(([x, y]) => [x, y, lift(x, y)]);
    // anti-spike: clamp wild / NaN heights into a facet-plausible band before any geometry is computed
    const san = sanitizeRing3(liftedRaw);
    if (san.dead) { degenerate.push(p.id); continue; }   // every vertex height was NaN/Inf → unrenderable
    const ring3 = san.ring3;
    const normal = fitNormal(ring3);
    const { pitchDeg, azimuthDeg } = pitchAndAzimuth(normal);
    // reject a wall-steep facet: a plane this vertical is a bad Solar segment / clip artifact,
    // not a roof face. Drawing it produces the flat-slab + needle look; drop it and let the
    // caller's area-sanity gate fall back to a clean massing / photoreal if too much is lost.
    if (!isFinite(pitchDeg) || pitchDeg > MAX_ROOF_PITCH_DEG) { degenerate.push(p.id); continue; }
    const pitchX12 = Math.round(Math.tan(pitchDeg * Math.PI / 180) * 12);
    const areaSqM = area3D(ring3);
    const areaSqFt = areaSqM * SQFT_PER_SQM;
    if (!isFinite(areaSqFt) || areaSqFt < 1) { degenerate.push(p.id); continue; }   // near-zero / NaN area sliver
    facets.push({
      id: p.id,
      ring: ring2,
      ring3,
      normal,
      pitchDeg,
      pitchX12,
      azimuthDeg,
      orientation: compass8(azimuthDeg),
      areaSqFt,
      centroid: centroid3(ring3),
    });
  }

  // 2) Collect every directed facet edge with its 3D endpoints ------------
  const rawEdges = [];
  facets.forEach((f, fi) => {
    const n = f.ring3.length;
    for (let i = 0; i < n; i++) {
      const a = f.ring3[i];
      const b = f.ring3[(i + 1) % n];
      rawEdges.push({ facetIndex: fi, a, b });
    }
  });

  // Two edges are "the same physical edge" if their endpoints coincide within
  // shareTol in either orientation, OR they are COLLINEAR & OVERLAPPING. The latter
  // is what the analytic half-plane-clip extractor produces: adjacent facets share the
  // SAME crease LINE, but each facet's crease segment ends where ITS own boundary turns,
  // so the two segments overlap on the line without coincident endpoints. A pure
  // endpoint matcher would miss them and mis-label both as outer (eave/rake) instead of
  // ridge/hip/valley. We treat them as the same edge when both endpoints of the shorter
  // segment sit on the longer segment's line (perp dist < shareTol) and their 1-D spans
  // along that line overlap by a real amount.
  const COLLINEAR_PERP = Math.max(shareTol, 0.35);   // m: how far off-line still counts as "on" the crease
  function collinearOverlap(e1, e2) {
    // work in the plan (x,y); use e1 as the reference line
    const ax = e1.a[0], ay = e1.a[1], bx = e1.b[0], by = e1.b[1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L < 1e-6) return false;
    const ux = dx / L, uy = dy / L;            // unit dir of e1
    const px = -uy, py = ux;                    // perp
    const perp = (q) => Math.abs((q[0] - ax) * px + (q[1] - ay) * py);
    if (perp(e2.a) > COLLINEAR_PERP || perp(e2.b) > COLLINEAR_PERP) return false;  // e2 not on e1's line
    // 1-D spans along e1's dir
    const proj = (q) => (q[0] - ax) * ux + (q[1] - ay) * uy;
    const s2a = proj(e2.a), s2b = proj(e2.b);
    const lo1 = 0, hi1 = L, lo2 = Math.min(s2a, s2b), hi2 = Math.max(s2a, s2b);
    const overlap = Math.min(hi1, hi2) - Math.max(lo1, lo2);
    // require a real overlap (≥ shareTol and ≥ ~30% of the shorter segment)
    const shorter = Math.min(L, Math.abs(s2b - s2a));
    return overlap > shareTol && overlap > 0.3 * shorter;
  }
  function sameEdge(e1, e2) {
    const fwd = dist2(e1.a, e2.a) < shareTol && dist2(e1.b, e2.b) < shareTol;
    const rev = dist2(e1.a, e2.b) < shareTol && dist2(e1.b, e2.a) < shareTol;
    if (fwd || rev) return true;
    return collinearOverlap(e1, e2);
  }

  // Group raw edges into unique physical edges, tracking adjacent facets.
  const unique = []; // { a, b, facetIndices:Set }
  for (const e of rawEdges) {
    let g = unique.find((u) =>
      sameEdge({ a: u.a, b: u.b }, e) && !u.facetIndices.has(e.facetIndex)
    );
    if (!g) {
      // Either brand-new, or an edge whose only match already includes this
      // facet (self — keep separate). Try to merge with any existing group
      // that doesn't yet contain this facet; otherwise create new.
      g = unique.find((u) => sameEdge({ a: u.a, b: u.b }, e));
      if (g && !g.facetIndices.has(e.facetIndex)) {
        g.facetIndices.add(e.facetIndex);
        continue;
      }
      unique.push({ a: e.a, b: e.b, facetIndices: new Set([e.facetIndex]) });
    } else {
      g.facetIndices.add(e.facetIndex);
    }
  }

  // 3) Classify each unique edge ------------------------------------------
  const RIDGE_LEVEL_FRAC = 0.08;  // |Δz| / horizLen below this => "level"
  const EAVE_LEVEL_FRAC = 0.08;

  const edges = [];
  for (const u of unique) {
    const a = u.a, b = u.b;
    const horizLen = dist2(a, b);
    const len3 = norm3(sub3(b, a));
    const lengthFt = len3 * FT_PER_M;
    const dz = Math.abs(a[2] - b[2]);
    const levelFrac = horizLen > 1e-9 ? dz / horizLen : 0;
    const edgeMeanZ = (a[2] + b[2]) / 2;
    const facetIndices = [...u.facetIndices];
    const planeIds = facetIndices.map((fi) => facets[fi].id);

    let type;
    if (facetIndices.length >= 2) {
      // Shared (interior) edge: compare edge height to the two facet centroids.
      const c0 = facets[facetIndices[0]].centroid[2];
      const c1 = facets[facetIndices[1]].centroid[2];
      const aboveBoth = edgeMeanZ > c0 && edgeMeanZ > c1;
      const belowBoth = edgeMeanZ < c0 && edgeMeanZ < c1;
      if (aboveBoth) {
        // Both facets slope down AWAY from the edge.
        type = levelFrac <= RIDGE_LEVEL_FRAC ? "ridge" : "hip";
      } else if (belowBoth) {
        // Both facets slope down TOWARD the edge => valley.
        type = "valley";
      } else {
        // Mixed (one above, one below): a sloped junction — treat as hip if
        // it climbs, else valley. Default to hip for an inclined shared edge.
        type = levelFrac <= RIDGE_LEVEL_FRAC ? "ridge" : "hip";
      }
    } else {
      // Unshared outer edge: level => eave (low side), sloped => rake.
      type = levelFrac <= EAVE_LEVEL_FRAC ? "eave" : "rake";
    }

    edges.push({
      type,
      lengthFt,
      a: [a[0], a[1]],
      b: [b[0], b[1]],
      az: a[2],   // real lifted elevation (m) of endpoint A — lets the 3D overlay draw a TRUE
      bz: b[2],   // sloped roof edge (ABSOLUTE altitude) instead of a flat mesh-draped line.
      planeIds,
    });
  }

  // 4) Totals --------------------------------------------------------------
  const totals = {
    roofAreaSqFt: 0,
    squares: 0,
    ridgeFt: 0,
    hipFt: 0,
    valleyFt: 0,
    eaveFt: 0,
    rakeFt: 0,
    penetrations: 0,
    predominantPitchX12: 0,
    facetCount: facets.length,
  };
  for (const f of facets) totals.roofAreaSqFt += f.areaSqFt;
  totals.squares = totals.roofAreaSqFt / 100;
  for (const e of edges) {
    if (e.type === "ridge") totals.ridgeFt += e.lengthFt;
    else if (e.type === "hip") totals.hipFt += e.lengthFt;
    else if (e.type === "valley") totals.valleyFt += e.lengthFt;
    else if (e.type === "eave") totals.eaveFt += e.lengthFt;
    else if (e.type === "rake") totals.rakeFt += e.lengthFt;
  }
  // Predominant pitch = pitch of the largest-area facet.
  let biggest = facets[0];
  for (const f of facets) if (f && f.areaSqFt > (biggest?.areaSqFt ?? -1)) biggest = f;
  totals.predominantPitchX12 = biggest ? biggest.pitchX12 : 0;

  // Public per-plane shape (strip internal scratch fields).
  // ring3 (the lifted [x,y,zAbs] polygon ring) is exposed so the 3D massing
  // can triangulate each TRUE facet polygon at its real elevation — adjacent
  // facets share the same lifted crease vertices, so they meet exactly.
  const outPlanes = facets.map((f) => ({
    id: f.id,
    ring: f.ring,
    ring3: f.ring3,
    normal: f.normal,
    areaSqFt: f.areaSqFt,
    pitchX12: f.pitchX12,
    pitchDeg: f.pitchDeg,
    azimuthDeg: f.azimuthDeg,
    orientation: f.orientation,
  }));

  // degenerate = ids of facets dropped by the anti-spike guard (wall-steep plane, NaN/
  // wild lifted vertices, or zero-area sliver). The caller (buildSceneAnalytic) inspects
  // this + the built-vs-Google area ratio to decide whether to render our model or fall
  // back to a clean massing / photoreal, so a single bad Solar segment never spikes.
  return { planes: outPlanes, edges, totals, degenerate };
}

// ============================================================================
// SELF-TEST — runs only when executed directly (`node roofgeo.mjs`).
// ============================================================================

function isMain() {
  // ESM-safe "is this the entrypoint?" check without importing url/path APIs
  // by string-comparing argv[1] against import.meta.url.
  try {
    const argv1 = process.argv[1] || "";
    const here = decodeURIComponent(import.meta.url.replace(/^file:\/\/\/?/, ""));
    const norm = (s) => s.replace(/\\/g, "/").toLowerCase();
    return norm(here).endsWith(norm(argv1).split("/").pop() || " ");
  } catch {
    return false;
  }
}

if (isMain()) {
  const assert = (await import("node:assert/strict")).default;
  let passed = 0, failed = 0;
  const results = [];
  function test(name, fn) {
    try { fn(); passed++; results.push(`  PASS  ${name}`); }
    catch (e) { failed++; results.push(`  FAIL  ${name}\n        ${e.message}`); }
  }
  const within = (got, want, fracTol) =>
    Math.abs(got - want) <= Math.abs(want) * fracTol;

  // --------------------------------------------------------------------
  // FIXTURE 1 — Simple gable, 6/12 pitch.
  //
  // Footprint: 12 m (x, eave-to-eave run) × 8 m (y, ridge length).
  // Ridge runs along y at x = 6. Two facets, each 6 m run horizontally.
  // 6/12 pitch => rise = run * 6/12 = 0.5 * run. Over a 6 m half-run the
  // ridge sits 3 m above the eaves. Tent height function: z increases
  // linearly from each eave (x=0 and x=12) up to the ridge (x=6).
  // --------------------------------------------------------------------
  const EAVE_Z = 0;
  const SLOPE = 6 / 12; // rise per unit horizontal run
  function gableHeight(x, y) {
    // distance from ridge line x=6, horizontally
    const distFromRidge = Math.abs(x - 6);
    const ridgeZ = EAVE_Z + SLOPE * 6; // 3 m
    return ridgeZ - SLOPE * distFromRidge;
  }
  // West facet (x 0..6) and East facet (x 6..12), each 8 m long in y.
  const gablePlanes = [
    { id: "west", ring: [[0, 0], [6, 0], [6, 8], [0, 8]] },
    { id: "east", ring: [[6, 0], [12, 0], [12, 8], [6, 8]] },
  ];
  const gable = buildRoofModel(gablePlanes, gableHeight);

  test("gable: facetCount = 2", () => {
    assert.equal(gable.totals.facetCount, 2);
  });
  test("gable: exactly 1 ridge", () => {
    assert.equal(gable.edges.filter((e) => e.type === "ridge").length, 1);
  });
  test("gable: exactly 2 eaves", () => {
    assert.equal(gable.edges.filter((e) => e.type === "eave").length, 2);
  });
  test("gable: >= 2 rakes", () => {
    assert.ok(gable.edges.filter((e) => e.type === "rake").length >= 2);
  });
  test("gable: 0 valleys", () => {
    assert.equal(gable.edges.filter((e) => e.type === "valley").length, 0);
  });
  test("gable: 0 hips", () => {
    assert.equal(gable.edges.filter((e) => e.type === "hip").length, 0);
  });
  test("gable: pitchX12 ~ 6 on both facets", () => {
    for (const p of gable.planes) assert.equal(p.pitchX12, 6);
  });
  test("gable: ridge LF ~ 8 m (26.25 ft) within 2%", () => {
    const ridgeFt = gable.totals.ridgeFt;
    assert.ok(within(ridgeFt, 8 * FT_PER_M, 0.02),
      `ridgeFt=${ridgeFt.toFixed(2)} want~${(8 * FT_PER_M).toFixed(2)}`);
  });
  test("gable: eave LF ~ 16 m total (52.5 ft) within 2%", () => {
    // two eaves, each 8 m long => 16 m total
    assert.ok(within(gable.totals.eaveFt, 16 * FT_PER_M, 0.02),
      `eaveFt=${gable.totals.eaveFt.toFixed(2)}`);
  });
  test("gable: area sane — squares ~ 2D*slope_factor/100", () => {
    // 2D footprint = 12*8 = 96 m^2. Slope factor for 6/12 = sqrt(1+0.25)=1.118.
    // 3D area = 96 * 1.118 = 107.3 m^2 => sqft = 1155 => squares ~ 11.55
    const expectSqFt = 96 * Math.sqrt(1 + SLOPE * SLOPE) * SQFT_PER_SQM;
    assert.ok(within(gable.totals.roofAreaSqFt, expectSqFt, 0.02),
      `area=${gable.totals.roofAreaSqFt.toFixed(1)} want~${expectSqFt.toFixed(1)}`);
    assert.ok(gable.totals.squares > 10 && gable.totals.squares < 13);
  });
  test("gable: predominantPitchX12 = 6", () => {
    assert.equal(gable.totals.predominantPitchX12, 6);
  });
  test("gable: orientations are opposite (E faces one way, W the other)", () => {
    const w = gable.planes.find((p) => p.id === "west");
    const e = gable.planes.find((p) => p.id === "east");
    // West facet (x 0..6) slopes down toward x=0 (west) => faces W.
    // East facet slopes down toward x=12 (east) => faces E.
    assert.equal(w.orientation, "W", `west orientation=${w.orientation}`);
    assert.equal(e.orientation, "E", `east orientation=${e.orientation}`);
  });

  // --------------------------------------------------------------------
  // FIXTURE 2 — Hip + valley exerciser.
  //
  // A simple hip roof: square footprint 12x12, apex in the center, four
  // triangular facets meeting at a central peak. Each shared edge between
  // adjacent triangles rises from an eave corner up to the apex => HIP.
  // Then we add an L-notch with two facets sloping toward a common low
  // line to force a VALLEY.
  // --------------------------------------------------------------------
  // Hip pyramid: apex at (6,6) height 4; corners at height 0.
  function pyramidHeight(x, y) {
    const apexZ = 4;
    // radial linear cone from center; clamp to >=0
    const d = Math.hypot(x - 6, y - 6);
    const maxD = Math.hypot(6, 6);
    return apexZ * (1 - d / maxD);
  }
  const hipPlanes = [
    { id: "h_s", ring: [[0, 0], [12, 0], [6, 6]] }, // south triangle
    { id: "h_e", ring: [[12, 0], [12, 12], [6, 6]] }, // east triangle
    { id: "h_n", ring: [[12, 12], [0, 12], [6, 6]] }, // north triangle
    { id: "h_w", ring: [[0, 12], [0, 0], [6, 6]] }, // west triangle
  ];
  const hip = buildRoofModel(hipPlanes, pyramidHeight);
  test("hip: at least one hip detected", () => {
    assert.ok(hip.edges.filter((e) => e.type === "hip").length >= 1,
      `hips=${hip.edges.filter((e) => e.type === "hip").length}`);
  });
  test("hip: no valley on a pure pyramid", () => {
    assert.equal(hip.edges.filter((e) => e.type === "valley").length, 0);
  });

  // Valley fixture: two facets sloping DOWN toward a shared low diagonal.
  // Facet A: triangle whose interior sits high, sharing a low edge with B.
  // Build a "V" gutter: both facets' centroids are ABOVE the shared edge.
  function valleyHeight(x, y) {
    // Low line along y=x (the valley bottom). Height grows with |y - x|.
    return Math.abs(y - x) * 0.5;
  }
  const valleyPlanes = [
    // Facet above the y=x line (y > x region): centroid high, edge along y=x low.
    { id: "v_a", ring: [[0, 0], [10, 10], [0, 10]] },
    // Facet below the y=x line (y < x region).
    { id: "v_b", ring: [[0, 0], [10, 0], [10, 10]] },
  ];
  const valley = buildRoofModel(valleyPlanes, valleyHeight);
  test("valley: at least one valley detected", () => {
    assert.ok(valley.edges.filter((e) => e.type === "valley").length >= 1,
      `valleys=${valley.edges.filter((e) => e.type === "valley").length}`);
  });

  // --------------------------------------------------------------------
  // FIXTURE 4 — ANTI-SPIKE guard (the P0 on 7 Painter Ave).
  //   (a) a single wild lifted vertex (one corner shot to 9000 m altitude, as a bad
  //       analytic liftZ extrapolation does) must NOT survive into ring3 — it is clamped
  //       back into the facet's plausible band, so no needle is drawn.
  //   (b) a wall-steep facet (near-vertical plane from a bad Solar segment) is DROPPED and
  //       reported in model.degenerate, so the caller can fall back instead of rendering a slab.
  //   (c) a clean facet alongside the bad one is preserved (the guard is surgical, not nuke-all).
  // --------------------------------------------------------------------
  // (a) a real 4/12 gable-ish facet (coherent slope) where ONE vertex's height comes back
  //     as a wild 9000 m extrapolation (the analytic-liftZ spike) — the rest are sane. The
  //     guard must clamp that one Z back into the band so the facet still renders cleanly,
  //     with NO needle. (A facet whose geometry is genuinely degenerate is dropped instead —
  //     covered by the wall test below; here the facet is otherwise valid.)
  function spikeHeight(x, y) {
    if (x > 9 && y > 9) return 9000;           // the single bad vertex
    return 3 - x * (4 / 12);                    // clean 4/12 plane for the other corners
  }
  const spikePlanes = [{ id: "spk", ring: [[0, 0], [10, 0], [10, 10], [0, 10]] }];
  const spiked = buildRoofModel(spikePlanes, spikeHeight);
  test("anti-spike: wild vertex clamped — no ring3 Z exceeds a plausible roof band", () => {
    // band ≈ median(±~3 m) + slope reach over a ~14 m diagonal; 9000 m must be gone.
    const maxZ = Math.max(...spiked.planes.flatMap((p) => p.ring3.map((v) => v[2])), 0);
    assert.ok(maxZ < 60, `clamped maxZ=${maxZ} (want « 9000)`);
  });
  test("anti-spike: clamped facet still renders (not dropped)", () => {
    assert.ok(spiked.planes.length === 1, `planes=${spiked.planes.length}`);
    assert.deepEqual(spiked.degenerate, []);
  });
  // (b) a near-vertical wall plane (huge Z gradient) next to a clean roof facet. The guard
  //     must ensure the wall NEVER renders as a spike — either by clamping its impossible
  //     heights into a bounded band OR by dropping it — while the clean roof facet is kept.
  function wallAndRoofHeight(x, y) {
    // x<6 region: a near-vertical wall (Z rockets with x). x>=6: a gentle 4/12 roof.
    return x < 6 ? x * 20 : 3 - (x - 6) * (4 / 12);
  }
  const mixedPlanes = [
    { id: "wall", ring: [[0, 0], [5.9, 0], [5.9, 8], [0, 8]] },
    { id: "roof", ring: [[6, 0], [12, 0], [12, 8], [6, 8]] },
  ];
  const mixed = buildRoofModel(mixedPlanes, wallAndRoofHeight);
  test("anti-spike: no wall facet survives as a spike (clamped flat or dropped)", () => {
    const wall = mixed.planes.find((p) => p.id === "wall");
    if (wall) {
      // kept → its lifted ring must be flattened to a plausible vertical spread (no needle).
      const zs = wall.ring3.map((v) => v[2]);
      const spread = Math.max(...zs) - Math.min(...zs);
      assert.ok(spread < 12, `wall vertical spread ${spread.toFixed(1)} m must be bounded (no spike)`);
    } else {
      // dropped → must be reported as degenerate.
      assert.ok(mixed.degenerate.includes("wall"), `degenerate=${JSON.stringify(mixed.degenerate)}`);
    }
  });
  test("anti-spike: clean roof facet survives alongside the bad wall", () => {
    assert.ok(mixed.planes.some((p) => p.id === "roof"), "roof facet should remain");
  });
  // (d) a PLAN-SPACE horizontal needle: one ring vertex shot ~100 m away in plan (a clip-corner from
  //     near-parallel creases / a runaway footprint vertex — the 7 Painter Ave artifact) must be
  //     dropped & reported, while a neighbouring compact facet survives.
  const spikePlanPlanes = [
    { id: "needle", ring: [[0, 0], [10, 0], [10, 103], [0, 8]] },   // 3rd vertex 103 m north = the needle
    { id: "ok2", ring: [[20, 0], [26, 0], [26, 6], [20, 6]] },
  ];
  const spikePlan = buildRoofModel(spikePlanPlanes, (x, y) => 3 - x * (4 / 12));
  test("anti-spike: plan-space horizontal needle facet is dropped & reported", () => {
    assert.ok(spikePlan.degenerate.includes("needle"), `degenerate=${JSON.stringify(spikePlan.degenerate)}`);
    assert.ok(spikePlan.planes.some((p) => p.id === "ok2"), "compact neighbour facet should survive");
    // and prove NO surviving facet ring has a plan extent anywhere near the needle (no 100 m mesh):
    const maxPlan = Math.max(...spikePlan.planes.flatMap((p) => {
      const xs = p.ring3.map((v) => v[0]), ys = p.ring3.map((v) => v[1]);
      return [Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))];
    }), 0);
    assert.ok(maxPlan < 50, `surviving facet plan extent ${maxPlan.toFixed(0)} m must be compact`);
  });
  // (c) a fully unrenderable facet (every vertex height NaN, e.g. a DSM hole) is dropped + reported.
  const deadPlanes = [
    { id: "dead", ring: [[0, 0], [6, 0], [6, 6], [0, 6]] },
    { id: "ok", ring: [[7, 0], [13, 0], [13, 6], [7, 6]] },
  ];
  const deadModel = buildRoofModel(deadPlanes, (x) => (x < 6.5 ? NaN : 3 - (x - 7) * (4 / 12)));
  test("anti-spike: all-NaN facet is dropped & reported, neighbour kept", () => {
    assert.ok(deadModel.degenerate.includes("dead"), `degenerate=${JSON.stringify(deadModel.degenerate)}`);
    assert.ok(deadModel.planes.some((p) => p.id === "ok"), "valid neighbour facet should remain");
  });
  // DELIBERATE-FAILURE proof: WITHOUT the guard (raw lift), the wild vertex WOULD reach 9000 m —
  // proving the clamp above is load-bearing, not vacuous.
  test("anti-spike deliberate-failure: raw (unguarded) lift would spike to 9000 m", () => {
    const rawMaxZ = Math.max(...spikePlanes[0].ring.map(([x, y]) => spikeHeight(x, y)));
    assert.ok(rawMaxZ >= 9000, "the unguarded height fn must produce the spike the guard removes");
    // and confirm the GUARDED model disagrees (the guard fired):
    const guardedMaxZ = Math.max(...spiked.planes.flatMap((p) => p.ring3.map((v) => v[2])));
    assert.ok(guardedMaxZ < rawMaxZ, `guarded ${guardedMaxZ} must be « raw ${rawMaxZ}`);
  });

  // --------------------------------------------------------------------
  // FIXTURE 3 — Deliberate-failure: a REGRESSED classifier that calls every
  // shared edge "ridge" must FAIL the gable assertions, proving the guard
  // is real (not vacuously passing).
  // --------------------------------------------------------------------
  function buildRoofModelRegressed(planes, sampleHeight) {
    const m = buildRoofModel(planes, sampleHeight);
    // Regression: reclassify every interior (shared) edge as a ridge.
    m.edges = m.edges.map((e) =>
      e.planeIds.length >= 2 ? { ...e, type: "ridge" } : e
    );
    // recompute totals so the bug is internally consistent
    m.totals.ridgeFt = m.totals.hipFt = m.totals.valleyFt = 0;
    for (const e of m.edges) {
      if (e.type === "ridge") m.totals.ridgeFt += e.lengthFt;
      else if (e.type === "hip") m.totals.hipFt += e.lengthFt;
      else if (e.type === "valley") m.totals.valleyFt += e.lengthFt;
    }
    return m;
  }
  test("deliberate-failure: regressed classifier FAILS the hip assertion", () => {
    const badHip = buildRoofModelRegressed(hipPlanes, pyramidHeight);
    const hips = badHip.edges.filter((e) => e.type === "hip").length;
    // The good model finds hips; the regressed one calls them all ridge => 0 hips.
    // This proves the "at least one hip" guard would have caught the regression.
    assert.equal(hips, 0,
      "regressed model should report 0 hips (all shared->ridge)");
    // And confirm the GOOD model disagrees (real guard would fire):
    assert.ok(hip.edges.filter((e) => e.type === "hip").length >= 1);
  });
  test("deliberate-failure: regressed classifier FAILS gable valley/hip-free check is moot; check ridge inflation", () => {
    const badGable = buildRoofModelRegressed(gablePlanes, gableHeight);
    // Gable already has its only shared edge as ridge, so ridge count stays 1 —
    // instead prove the regression is detectable on a multi-shared-edge roof:
    const badHip = buildRoofModelRegressed(hipPlanes, pyramidHeight);
    const goodRidges = hip.edges.filter((e) => e.type === "ridge").length;
    const badRidges = badHip.edges.filter((e) => e.type === "ridge").length;
    assert.ok(badRidges > goodRidges,
      `regressed ridges (${badRidges}) should exceed good ridges (${goodRidges})`);
  });

  // --------------------------------------------------------------------
  console.log(results.join("\n"));
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
