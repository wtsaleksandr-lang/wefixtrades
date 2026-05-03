import { useEffect, useRef } from "react";
import Globe from "globe.gl";
import * as topojson from "topojson-client";
import { MeshPhongMaterial, Color, CanvasTexture } from "three";
import type { GlobeMarker } from "./globeData";
import { GLOBE_ARCS } from "./globeData";

/* ── Config ─────────────────────────────────────────────────────────── */

const LAND_DATA_URL = "//cdn.jsdelivr.net/npm/world-atlas/land-110m.json";
const ACCENT = "#66E8FA";
const ACCENT_RGB = "102,232,250";
const SITE_BG = "#181D1F";

// Dot texture settings
const TEX_W = 2048;
const TEX_H = 1024;
const DOT_GAP = 7; // px between dot centers (denser like Cloudflare)
const DOT_R = 1.2; // dot radius in px (finer dots)

/* ── SVG icon paths (Lucide-compatible) ─────────────────────────────── */

const ICON_PATHS: Record<string, string> = {
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  "map-pin":
    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  calculator:
    '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  briefcase:
    '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
};

/* ── Dotted earth texture generator ─────────────────────────────────── */

function createDottedEarthCanvas(
  landFeatures: any[],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;

  // Black background (matches site bg for ocean)
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Rasterize land mask onto a temp canvas
  const mask = document.createElement("canvas");
  mask.width = TEX_W;
  mask.height = TEX_H;
  const mCtx = mask.getContext("2d")!;
  mCtx.fillStyle = "#fff";

  landFeatures.forEach((feature: any) => {
    const geom = feature.geometry;
    const polys =
      geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    polys.forEach((polygon: number[][][]) => {
      polygon.forEach((ring: number[][], ringIdx: number) => {
        mCtx.beginPath();
        ring.forEach(([lng, lat]: number[], j: number) => {
          const x = ((lng + 180) / 360) * TEX_W;
          const y = ((90 - lat) / 180) * TEX_H;
          j === 0 ? mCtx.moveTo(x, y) : mCtx.lineTo(x, y);
        });
        mCtx.closePath();
        if (ringIdx === 0) mCtx.fill();
      });
    });
  });

  const maskData = mCtx.getImageData(0, 0, TEX_W, TEX_H);

  // Draw graticule grid lines (more visible, like Cloudflare)
  ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.12)`;
  ctx.lineWidth = 0.8;
  for (let lng = -180; lng <= 180; lng += 30) {
    const x = ((lng + 180) / 360) * TEX_W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TEX_H);
    ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const y = ((90 - lat) / 180) * TEX_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEX_W, y);
    ctx.stroke();
  }

  // Draw dots only where land mask is white
  ctx.fillStyle = "#fff"; // white dots — emissive color tints them cyan
  for (let y = DOT_GAP / 2; y < TEX_H; y += DOT_GAP) {
    for (let x = DOT_GAP / 2; x < TEX_W; x += DOT_GAP) {
      const idx = (Math.round(y) * TEX_W + Math.round(x)) * 4;
      if (maskData.data[idx] > 128) {
        ctx.beginPath();
        ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return canvas;
}

/* ── Component ──────────────────────────────────────────────────────── */

interface GlobeCanvasProps {
  markers: GlobeMarker[];
  size?: number;
  activeMarkerIndex: number | null;
  onMarkerClick?: (index: number) => void;
}

export default function GlobeCanvas({
  markers,
  size = 900,
  activeMarkerIndex,
  onMarkerClick,
}: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const onClickRef = useRef(onMarkerClick);
  onClickRef.current = onMarkerClick;

  // ── Mount globe.gl instance ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any previous content
    containerRef.current.innerHTML = "";

    const globe = new Globe(containerRef.current)
      .backgroundColor("rgba(0,0,0,0)")
      .showGlobe(true)
      .showAtmosphere(false)
      .width(size)
      .height(size);

    globeRef.current = globe;

    // Camera controls — constrained to North America since that's where the
    // service currently operates. Drag is enabled but limited to roughly
    // ±60° azimuth around -95° longitude (so the user can pan East to the
    // Atlantic and West to the Pacific but never sees the empty back of
    // the globe). Vertical tilt is also clamped.
    const controls = globe.controls();
    controls.autoRotate = false;             // off — would carry past the clamp
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controls.dampingFactor = 0.15;
    controls.enableDamping = true;
    // Three.js OrbitControls — azimuth = horizontal rotation, polar = vertical
    // The globe library composes the camera target so we constrain in radians.
    // Center azimuth on roughly -95° lng → North America; allow ±60° drag.
    const DEG = Math.PI / 180;
    controls.minAzimuthAngle = -60 * DEG;
    controls.maxAzimuthAngle = 60 * DEG;
    controls.minPolarAngle = 50 * DEG;       // can't tilt above the equator
    controls.maxPolarAngle = 110 * DEG;      // can't drop below the south pole

    // Initial view — centered on North America, zoomed out to show ~half globe
    globe.pointOfView({ lat: 32, lng: -95, altitude: 2.8 });

    // ── Load land data → dotted texture ─────────────────────────────
    fetch(LAND_DATA_URL)
      .then((res) => res.json())
      .then((landTopo) => {
        const land = topojson.feature(
          landTopo,
          landTopo.objects.land,
        ) as any;

        const textureCanvas = createDottedEarthCanvas(land.features);
        const texture = new CanvasTexture(textureCanvas);

        // Emissive material: semi-transparent globe with cyan dots
        const material = new MeshPhongMaterial({
          color: new Color(SITE_BG),
          emissive: new Color(ACCENT),
          emissiveMap: texture,
          emissiveIntensity: 0.9,
          shininess: 5,
          transparent: true,
          opacity: 0.82,
        });

        globe.globeMaterial(material);
      });

    // ── Arcs ────────────────────────────────────────────────────────
    const arcs = GLOBE_ARCS.map(([from, to]) => ({
      startLat: markers[from].location[0],
      startLng: markers[from].location[1],
      endLat: markers[to].location[0],
      endLng: markers[to].location[1],
    }));

    globe
      .arcsData(arcs)
      .arcColor(() => [`rgba(${ACCENT_RGB},0.5)`, `rgba(${ACCENT_RGB},0.15)`])
      .arcDashLength(0.4)
      .arcDashGap(0.25)
      .arcDashAnimateTime(3000)
      .arcStroke(0.5)
      .arcsTransitionDuration(0);

    // ── Rings (pulsing at active marker) ────────────────────────────
    globe
      .ringColor(() => (t: number) => `rgba(${ACCENT_RGB},${1 - t})`)
      .ringMaxRadius(4)
      .ringPropagationSpeed(3)
      .ringRepeatPeriod(1200);

    // ── HTML markers ────────────────────────────────────────────────
    globe
      .htmlElementsData(markers)
      .htmlLat((d: any) => d.location[0])
      .htmlLng((d: any) => d.location[1])
      .htmlAltitude(0.02)
      .htmlElement((d: any) => {
        const idx = markers.indexOf(d);
        const el = document.createElement("div");
        el.className = "globe-marker";
        el.dataset.markerIdx = String(idx);
        el.innerHTML = `
          <div class="globe-marker-card" data-idx="${idx}">
            <div class="globe-marker-card__stat">${d.stat}</div>
            <div class="globe-marker-card__label">${d.label}</div>
          </div>
          <div class="globe-marker-circle" data-idx="${idx}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="${ACCENT}" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              ${ICON_PATHS[d.icon] || ICON_PATHS.zap}
            </svg>
          </div>
        `;
        el.style.cursor = "pointer";
        el.style.pointerEvents = "auto";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onClickRef.current?.(idx);
        });
        return el;
      });

    // Fade-in
    setTimeout(() => {
      if (containerRef.current) containerRef.current.style.opacity = "1";
    }, 400);

    return () => {
      globe._destructor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, size]);

  // ── Update active marker ring + highlight ───────────────────────────
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    // Pulse ring at active marker
    if (activeMarkerIndex !== null && activeMarkerIndex >= 0) {
      const m = markers[activeMarkerIndex];
      globe.ringsData([{ lat: m.location[0], lng: m.location[1] }]);
    } else {
      globe.ringsData([]);
    }

    // Toggle active class on marker DOM elements + cards
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll(".globe-marker-circle").forEach((el) => {
      const idx = Number((el as HTMLElement).dataset.idx);
      el.classList.toggle("active", idx === activeMarkerIndex);
    });
    container.querySelectorAll(".globe-marker-card").forEach((el) => {
      const idx = Number((el as HTMLElement).dataset.idx);
      el.classList.toggle("active", idx === activeMarkerIndex);
    });
  }, [activeMarkerIndex, markers]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: size,
          maxWidth: "100%",
          height: size,
          opacity: 0,
          transition: "opacity 1s ease",
          cursor: "grab",
        }}
      />

      {/* Marker styles */}
      <style>{`
        .globe-marker-circle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(${ACCENT_RGB}, 0.10);
          border: 1.5px solid rgba(${ACCENT_RGB}, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.35s ease;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          position: relative;
        }
        .globe-marker-circle::after {
          content: "";
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 1px solid rgba(${ACCENT_RGB}, 0.12);
        }
        .globe-marker-circle.active {
          background: rgba(${ACCENT_RGB}, 0.22);
          border-color: ${ACCENT};
          box-shadow: 0 0 20px rgba(${ACCENT_RGB}, 0.35);
          transform: scale(1.15);
        }
        .globe-marker-circle.active::after {
          border-color: rgba(${ACCENT_RGB}, 0.3);
          animation: globe-marker-ping 2s ease-out infinite;
        }
        @keyframes globe-marker-ping {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }

        /* ── Floating card above marker ──────────────────────── */
        .globe-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
        }
        .globe-marker-card {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%) translateY(6px);
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(24px) saturate(1.2);
          -webkit-backdrop-filter: blur(24px) saturate(1.2);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 10px 12px;
          width: max-content;
          max-width: 170px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2), inset 0 0.5px 0 rgba(255,255,255,0.04);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.35s ease, transform 0.35s ease;
          white-space: nowrap;
          z-index: 20;
        }
        .globe-marker-card.active {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        .globe-marker-card__stat {
          font-size: 11.5px;
          font-weight: 400;
          color: rgba(255,255,255,0.78);
          line-height: 1.35;
          margin-bottom: 3px;
          letter-spacing: 0.01em;
          white-space: normal;
        }
        .globe-marker-card__label {
          font-size: 9.5px;
          font-weight: 400;
          color: rgba(255,255,255,0.3);
          line-height: 1.3;
          letter-spacing: 0.02em;
        }

        @media (max-width: 768px) {
          .globe-marker-circle {
            width: 32px;
            height: 32px;
          }
          .globe-marker-circle svg {
            width: 13px;
            height: 13px;
          }
          .globe-marker-card {
            max-width: 145px;
            padding: 8px 10px;
            border-radius: 10px;
          }
          .globe-marker-card__stat {
            font-size: 10.5px;
          }
          .globe-marker-card__label {
            font-size: 9px;
          }
        }
      `}</style>
    </>
  );
}
