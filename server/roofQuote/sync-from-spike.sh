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
perl -0pi -e 's{(async function geocode\(addr\)\{)}{const RQ_BASE="/api/roofquote";   // ported into the wefixtrades Express app under this path prefix\n$1}' "$DST"

# 2) Prefix backend route fetches.
perl -pi -e 's{fetch\("/(airender|capture|datalayers|features|geocode|geotiff|lead|solar|streetview|analyze)}{fetch(RQ_BASE+"/$1}g' "$DST"

# 3) Prefix the dynamic module import.
perl -pi -e 's{import\("/(roofgeo|rooffeatures)\.mjs"}{import(RQ_BASE+"/$1.mjs"}g' "$DST"

# 4) Prefix backend URLs used as string/img-src literals (e.g. baBefore.src="/capture?...").
#    Matches `="/capture?` (assignment), never `+"/capture` (the fetch form), so no double-prefix.
perl -pi -e 's{="/(capture|streetview)\?}{="/api/roofquote/$1?}g' "$DST"

# Verify: no raw root-relative backend calls remain.
LEFT=$(grep -oE 'fetch\("/(airender|capture|datalayers|features|geocode|geotiff|lead|solar|streetview|analyze)' "$DST" | wc -l | tr -d ' ')
PREFIXED=$(grep -oE 'RQ_BASE\+"/' "$DST" | wc -l | tr -d ' ')
echo "sync done → unprefixed-left:$LEFT  prefixed-sites:$PREFIXED  RQ_BASE:$(grep -c 'const RQ_BASE' "$DST")"
[ "$LEFT" = "0" ] || { echo "ERROR: $LEFT unprefixed backend fetch(es) remain"; exit 1; }
