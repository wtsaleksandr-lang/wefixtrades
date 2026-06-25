#!/usr/bin/env bash
# Regenerate the app-served roof widget assets from the canonical spike source.
# The ONLY difference is that backend fetches/imports are re-based under
# /api/roofquote (via the RQ_BASE const). Run from repo root after editing the
# spike: bash server/roofQuote/sync-from-spike.sh
set -euo pipefail

SRC_DIR="spikes/roof-quote"
DST_DIR="server/roofQuote/assets"

# Static modules copy verbatim (no path rewriting needed inside them).
cp "$SRC_DIR/roofgeo.mjs"      "$DST_DIR/roofgeo.mjs"
cp "$SRC_DIR/rooffeatures.mjs" "$DST_DIR/rooffeatures.mjs"

# Widget HTML: copy then re-base backend calls under /api/roofquote.
cp "$SRC_DIR/roof3d.html" "$DST_DIR/roof3d.html"
DST="$DST_DIR/roof3d.html"

# 1) Inject the RQ_BASE const just before the first backend helper.
#    Also expose it as a window global: the dynamic module import (step 3) lives in
#    a SECOND <script type="module"> block, which does NOT share top-level scope with
#    this first block. Referencing the bare `RQ_BASE` const there throws
#    "RQ_BASE is not defined", so the second block reads window.RQ_BASE instead.
perl -0pi -e 's{(async function geocode\(addr[^)]*\)\{)}{const RQ_BASE="/api/roofquote";window.RQ_BASE=RQ_BASE;   // ported into the wefixtrades Express app under this path prefix; window.* so the 2nd module block can see it\n$1}' "$DST"

# 2) Prefix backend route fetches.
perl -pi -e 's{fetch\("/(airender|capture|datalayers|features|geocode|geotiff|lead|pvwatts|rates|solar|streetview|sun|analyze)}{fetch(RQ_BASE+"/$1}g' "$DST"

# 3) Prefix the dynamic module import.
#    This import lives in the SECOND <script type="module"> block (after the first block
#    closes), which has its own top-level scope and cannot see the `const RQ_BASE` from
#    block 1. Use window.RQ_BASE (set in step 1) so the reference resolves at runtime —
#    referencing the bare const here threw "RQ_BASE is not defined" and left the 3D model,
#    measurements, sun builders and the Materials (#bRoof) button dead in prod.
perl -pi -e 's{import\("/(roofgeo|rooffeatures)\.mjs"}{import(window.RQ_BASE+"/$1.mjs"}g' "$DST"

# 4) Prefix backend URLs used as string/img-src literals (e.g. baBefore.src="/capture?...").
#    Matches `="/capture?` (assignment), never `+"/capture` (the fetch form), so no double-prefix.
perl -pi -e 's{="/(capture|streetview)\?}{="/api/roofquote/$1?}g' "$DST"

# Verify: no raw root-relative backend calls remain.
# `|| LEFT=0` so a zero-match grep (the SUCCESS case — no unprefixed calls left) doesn't abort under set -e/pipefail
LEFT=$(grep -oE 'fetch\("/(airender|capture|datalayers|features|geocode|geotiff|lead|pvwatts|rates|solar|streetview|sun|analyze)' "$DST" | wc -l | tr -d ' ') || LEFT=0
PREFIXED=$(grep -oE 'RQ_BASE\+"/' "$DST" | wc -l | tr -d ' ') || PREFIXED=0
echo "sync done → unprefixed-left:$LEFT  prefixed-sites:$PREFIXED  RQ_BASE:$(grep -c 'const RQ_BASE' "$DST")"
[ "$LEFT" = "0" ] || { echo "ERROR: $LEFT unprefixed backend fetch(es) remain"; exit 1; }
