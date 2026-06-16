/**
 * Shared rank-grid map projection — Web Mercator math used to overlay
 * geo-located rank pins on the server-proxied Google Static Map
 * (/api/audit/static-map). Keeps the audit report and the /tools rank grid
 * visually identical without duplicating the projection in each surface.
 */

export const SM_TILE = 256;

const lngToWorldX = (lng: number) => ((lng + 180) / 360) * SM_TILE;
const latToWorldY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  const n = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  return n * SM_TILE;
};
const worldYToLat = (wy: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * wy) / SM_TILE))) * 180) / Math.PI;

/** green → yellow → red gradient across rank 1..20. null rank = deep red. */
export const rankPinRgb = (rank: number | null): [number, number, number] => {
  if (rank == null) return [220, 38, 38];
  const t = Math.max(0, Math.min(1, (rank - 1) / 19));
  const g = [22, 163, 74];
  const y = [234, 179, 8];
  const r = [220, 38, 38];
  const mix = (a: number[], b: number[], u: number) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const c = t < 0.5 ? mix(g, y, t / 0.5) : mix(y, r, (t - 0.5) / 0.5);
  return [c[0], c[1], c[2]];
};

export const rankPinColor = (rank: number | null): string => {
  const [r, g, b] = rankPinRgb(rank);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/** Lighten an rgb triple toward white by u (0..1). */
const lighten = (
  [r, g, b]: [number, number, number],
  u: number,
): [number, number, number] => [
  Math.round(r + (255 - r) * u),
  Math.round(g + (255 - g) * u),
  Math.round(b + (255 - b) * u),
];

/**
 * Premium pin styling for a rank cell. Returns ready-to-use CSS strings in
 * both rgb() (for color-guarded surfaces) and a radial-gradient fill that goes
 * highlight → saturated base, plus a rank-colored outer glow for top-3 cells.
 * `selected` = outline only (never a brighter fill), preserving the convention.
 */
export interface RankPinStyle {
  base: string;
  /** radial-gradient: bright highlight top-left → saturated base */
  gradient: string;
  /** soft outer glow box-shadow (top-3 only) + crisp white ring */
  shadow: string;
  /** outline ring color for the selected state */
  ringColor: string;
}
export const rankPinStyle = (
  rank: number | null,
  opts: { selected?: boolean } = {},
): RankPinStyle => {
  const rgb = rankPinRgb(rank);
  const [r, g, b] = rgb;
  const hi = lighten(rgb, 0.55);
  const base = `rgb(${r}, ${g}, ${b})`;
  const gradient =
    `radial-gradient(circle at 32% 28%, ` +
    `rgb(${hi[0]}, ${hi[1]}, ${hi[2]}) 0%, ` +
    `rgb(${r}, ${g}, ${b}) 72%)`;
  const topThree = rank != null && rank <= 3;
  // White ring is rendered via box-shadow spread; top-3 add a colored glow.
  const ring = `0 0 0 2px rgb(255, 255, 255)`;
  const glow = topThree
    ? `, 0 0 14px 2px rgba(${r}, ${g}, ${b}, 0.55), 0 0 4px 0 rgba(${r}, ${g}, ${b}, 0.7)`
    : `, 0 1px 3px 0 rgba(15, 23, 42, 0.35)`;
  const shadow = `${ring}${glow}`;
  return {
    base,
    gradient,
    shadow,
    ringColor: base,
  };
};

/**
 * Industry-standard geo-grid metrics (Local Falcon vocabulary, now the
 * category norm). Computed from the per-cell rank data so the hero and the
 * pins agree on the same source of truth:
 *
 *  - SoLV  (Share of Local Voice)        = % of cells ranking Top 3 (Map Pack).
 *  - ARP   (Average Rank Position)        = avg rank across cells where the
 *                                           business APPEARS (ranked ≤ cap).
 *  - ATRP  (Average Total Rank Position)  = avg across ALL cells; unranked
 *                                           cells count as `cap` (≈ the legacy
 *                                           "average map rank").
 *
 * A cell "appears" when its rank is a finite number ≤ `cap` (default 20).
 * Unranked / null cells are excluded from ARP but counted in ATRP & SoLV
 * denominators. `unavailable` cells (provider throttle) are excluded entirely
 * by passing them as `null` AND omitting them from `total` upstream — callers
 * filter those out before calling this.
 */
export interface RankGridMetrics {
  /** % of cells ranking Top 3 (0..100), or null when there are no cells. */
  solv: number | null;
  /** Average rank where the business appears, or null when it appears nowhere. */
  arp: number | null;
  /** Average rank across all cells (unranked = cap), or null with no cells. */
  atrp: number | null;
  /** Cells counted in the denominator (appeared + unranked). */
  total: number;
  /** Cells where the business appeared (rank ≤ cap). */
  appeared: number;
  /** Cells ranking Top 3. */
  top3: number;
}

export function computeRankGridMetrics(
  ranks: (number | null | undefined)[],
  cap = 20,
): RankGridMetrics {
  const cells = ranks.filter((r): r is number | null => r !== undefined);
  const total = cells.length;
  if (total === 0) {
    return { solv: null, arp: null, atrp: null, total: 0, appeared: 0, top3: 0 };
  }
  let appeared = 0;
  let top3 = 0;
  let appearedSum = 0;
  let totalSum = 0;
  for (const r of cells) {
    const ranked = r != null && Number.isFinite(r) && r <= cap;
    if (ranked) {
      appeared++;
      appearedSum += r as number;
      if ((r as number) <= 3) top3++;
      totalSum += r as number;
    } else {
      // Unranked cells count as the cap for ATRP (a worst-case anchor).
      totalSum += cap;
    }
  }
  return {
    solv: Math.round((top3 / total) * 100),
    arp: appeared > 0 ? appearedSum / appeared : null,
    atrp: totalSum / total,
    total,
    appeared,
    top3,
  };
}

export interface RankGridGeoPoint {
  lat: number;
  lng: number;
}

export interface FittedRankGridMap {
  centerLat: number;
  centerLng: number;
  zoom: number;
  /** Project a lat/lng to a pixel coordinate inside the w×h viewport. */
  project: (lat: number, lng: number) => { x: number; y: number };
  /** Static-map proxy URL for the fitted center/zoom at the given size. */
  src: (w: number, h: number) => string;
}

/**
 * Fit all grid points inside a w×h viewport: pick the center + the largest
 * zoom that keeps every point within the padded viewport, then return a
 * projector that maps lat/lng → pixel and a static-map URL builder.
 */
export function fitRankGridMap(
  points: RankGridGeoPoint[],
  w = 600,
  h = 440,
  pad = 0.82,
): FittedRankGridMap {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centerLng = (minLng + maxLng) / 2;
  const centerLat = worldYToLat((latToWorldY(minLat) + latToWorldY(maxLat)) / 2);
  const spanX = Math.abs(lngToWorldX(maxLng) - lngToWorldX(minLng));
  const spanY = Math.abs(latToWorldY(maxLat) - latToWorldY(minLat));
  const zx = spanX > 0 ? Math.log2((w * pad) / spanX) : 20;
  const zy = spanY > 0 ? Math.log2((h * pad) / spanY) : 20;
  let zoom = Math.floor(Math.min(zx, zy));
  if (!Number.isFinite(zoom)) zoom = 13;
  zoom = Math.max(8, Math.min(16, zoom));
  const scale = Math.pow(2, zoom);
  const cwx = lngToWorldX(centerLng) * scale;
  const cwy = latToWorldY(centerLat) * scale;
  const project = (lat: number, lng: number) => ({
    x: lngToWorldX(lng) * scale - cwx + w / 2,
    y: latToWorldY(lat) * scale - cwy + h / 2,
  });
  const src = (sw: number, sh: number) =>
    `/api/audit/static-map?lat=${centerLat.toFixed(6)}&lng=${centerLng.toFixed(6)}&zoom=${zoom}&w=${sw}&h=${sh}`;
  return { centerLat, centerLng, zoom, project, src };
}
