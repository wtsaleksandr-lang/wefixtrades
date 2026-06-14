/**
 * Shared 5×5 rank-grid geo-scatter.
 *
 * Produces the 25 lat/lng points of a 5×5 grid centred on (lat, lng) and
 * spread across a radius. This is the SAME math the public Local Rank Grid
 * tool uses to scatter its 25 probe points (server/routes/freeToolsRoutes.ts
 * `buildGrid`) — extracted here so the portal MapGuard dashboard can project
 * its grid cells onto the real Google static map honestly, using the client's
 * stored service-area centre + radius rather than abstract boxes.
 *
 * Index convention (must match the portal grid cells):
 *   point i  →  row = Math.floor(i / 5), col = i % 5
 * Rows run north→south (dy from -1 … +1), cols run west→east (dx from -1 … +1).
 *
 * "1° latitude ≈ 111 km" approximation — accurate enough at city scale.
 * Longitude is scaled by cos(lat) so the grid stays roughly square at any
 * latitude.
 */

export interface RankGridGeoCell {
  row: number;
  col: number;
  lat: number;
  lng: number;
}

/** Evenly spaced steps from -radius to +radius across the 5 columns/rows. */
const GRID_STEPS = [-1, -0.5, 0, 0.5, 1] as const;

const KM_PER_MILE = 1.609344;

/**
 * Build the 25 geo points (row-major, row 0..4 × col 0..4) for a 5×5 grid.
 * @param centerLat  business centre latitude
 * @param centerLng  business centre longitude
 * @param radiusKm   half-extent of the grid in km (the grid spans ±radiusKm)
 */
export function buildRankGridGeoCells(
  centerLat: number,
  centerLng: number,
  radiusKm = 5,
): RankGridGeoCell[] {
  const latDelta = radiusKm / 111;
  const lngDelta =
    radiusKm / (111 * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180)));
  const cells: RankGridGeoCell[] = [];
  for (let r = 0; r < 5; r++) {
    const dy = GRID_STEPS[r];
    for (let c = 0; c < 5; c++) {
      const dx = GRID_STEPS[c];
      cells.push({
        row: r,
        col: c,
        lat: centerLat + dy * latDelta,
        lng: centerLng + dx * lngDelta,
      });
    }
  }
  return cells;
}

/** Normalise a stored radius (miles|km, default miles) to km for the scatter. */
export function radiusToKm(
  value: number | null | undefined,
  unit: string | null | undefined,
): number {
  const v = typeof value === "number" && value > 0 ? value : 25;
  // The grid scatter spans ±radius, so use half the service-area radius as the
  // grid half-extent — keeps all 25 probe points inside the client's actual
  // service area rather than overshooting its boundary.
  const half = v / 2;
  return (unit || "miles").toLowerCase().startsWith("km")
    ? half
    : half * KM_PER_MILE;
}
