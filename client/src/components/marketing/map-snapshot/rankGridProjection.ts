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
export const rankPinColor = (rank: number | null): string => {
  if (rank == null) return "#dc2626";
  const t = Math.max(0, Math.min(1, (rank - 1) / 19));
  const g = [22, 163, 74];
  const y = [234, 179, 8];
  const r = [220, 38, 38];
  const mix = (a: number[], b: number[], u: number) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const c = t < 0.5 ? mix(g, y, t / 0.5) : mix(y, r, (t - 0.5) / 0.5);
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

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
