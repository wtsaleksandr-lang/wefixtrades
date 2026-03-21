import { useEffect, useRef, useCallback } from "react";
import createGlobe from "cobe";
import type { GlobeMarker } from "./globeData";

interface GlobeCanvasProps {
  markers: GlobeMarker[];
  size?: number;
  activeMarkerIndex: number | null;
  onMarkerClick?: (index: number) => void;
}

/* ── Eldora-UI–inspired config ─────────────────────────────────────── */

// Globe orientation (North America center)
const CENTER_PHI = 4.5;
const CENTER_THETA = 0.45;
const GLOBE_SCALE = 1.8;

// Appearance (dark theme, cyan markers)
const DARK = 1;
const DIFFUSE = 0.8;
const MAP_BRIGHTNESS = 6;
const BASE_COLOR: [number, number, number] = [0.3, 0.3, 0.3];
const MARKER_COLOR: [number, number, number] = [0.4, 0.91, 0.98];
const GLOW_COLOR: [number, number, number] = [0.2, 0.2, 0.2];
const OPACITY = 0.7;

// Interaction
const DRAG_SENSITIVITY = 0.004;
const PHI_RANGE = 0.5;
const THETA_RANGE = 0.3;
const AUTO_DRIFT_SPEED = 0.005;
const RESUME_DELAY = 3000;
const CLICK_THRESHOLD = 5;
const MARKER_HIT_RADIUS = 50;

/** Project a lat/lon marker to screen coordinates given current globe rotation. */
function projectToScreen(
  lat: number,
  lon: number,
  phi: number,
  theta: number,
  displaySize: number,
  scale: number,
) {
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180;

  const cosLat = Math.cos(latR);
  const sinLat = Math.sin(latR);
  const dLon = lonR - phi;

  const x1 = cosLat * Math.sin(dLon);
  const y1 = -sinLat;
  const z1 = cosLat * Math.cos(dLon);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const x2 = x1;
  const y2 = y1 * cosT + z1 * sinT;
  const z2 = -y1 * sinT + z1 * cosT;

  const r = displaySize / 2;
  return {
    x: r + x2 * r * scale,
    y: r + y2 * r * scale,
    visible: z2 > 0,
  };
}

export default function GlobeCanvas({
  markers,
  size = 900,
  activeMarkerIndex,
  onMarkerClick,
}: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const pausedRef = useRef(false);

  // Drag state
  const draggingRef = useRef(false);
  const pxRef = useRef(0);
  const pyRef = useRef(0);
  const dragDistRef = useRef(0);

  // Globe orientation
  const phiRef = useRef(CENTER_PHI);
  const thetaRef = useRef(CENTER_THETA);

  // User interaction state (auto-draggable variant)
  const userDraggingRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback refs
  const onClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // Card DOM ref for per-frame position updates
  const cardElRef = useRef<HTMLDivElement>(null);
  const activeIdxRef = useRef(activeMarkerIndex);
  useEffect(() => {
    activeIdxRef.current = activeMarkerIndex;
  }, [activeMarkerIndex]);

  // ─── COBE lifecycle (Eldora UI pattern) ────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isMobile = window.innerWidth < 768;
    const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio, 2);

    phiRef.current = CENTER_PHI;
    thetaRef.current = CENTER_THETA;

    const cobeMarkers = markers.map((m) => ({
      location: m.location,
      size: m.size,
    }));

    let width = canvas.offsetWidth;

    const onResize = () => {
      if (canvas) width = canvas.offsetWidth;
    };
    window.addEventListener("resize", onResize);

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * 2,
      height: size * 2,
      phi: CENTER_PHI,
      theta: CENTER_THETA,
      dark: DARK,
      diffuse: DIFFUSE,
      mapSamples: isMobile ? 12000 : 20000,
      mapBrightness: MAP_BRIGHTNESS,
      baseColor: BASE_COLOR,
      markerColor: MARKER_COLOR,
      glowColor: GLOW_COLOR,
      opacity: OPACITY,
      scale: GLOBE_SCALE,
      offset: [0, 0],
      markers: cobeMarkers,
    });

    // Fade in
    setTimeout(() => {
      if (canvas) canvas.style.opacity = "1";
    }, 100);

    const tick = () => {
      // Auto-rotate unless user is dragging
      if (!pausedRef.current && !userDraggingRef.current) {
        phiRef.current += AUTO_DRIFT_SPEED;
      }

      globe.update({ phi: phiRef.current, theta: thetaRef.current });

      // Update card position via DOM (no React re-render)
      const idx = activeIdxRef.current;
      if (
        cardElRef.current &&
        idx !== null &&
        idx >= 0 &&
        idx < markers.length
      ) {
        const m = markers[idx];
        const p = projectToScreen(
          m.location[0],
          m.location[1],
          phiRef.current,
          thetaRef.current,
          size,
          GLOBE_SCALE,
        );
        cardElRef.current.style.left = (p.x / size) * 100 + "%";
        cardElRef.current.style.top = (p.y / size) * 100 + "%";
        cardElRef.current.style.opacity = p.visible ? "1" : "0";
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const observer = new IntersectionObserver(
      ([entry]) => {
        pausedRef.current = !entry.isIntersecting;
      },
      { threshold: 0.1 },
    );
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
      globe.destroy();
      window.removeEventListener("resize", onResize);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [markers, size]);

  // ─── Pointer handlers (auto-draggable variant) ─────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    userDraggingRef.current = true;
    pxRef.current = e.clientX;
    pyRef.current = e.clientY;
    dragDistRef.current = 0;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;

    const dx = e.clientX - pxRef.current;
    const dy = e.clientY - pyRef.current;
    pxRef.current = e.clientX;
    pyRef.current = e.clientY;
    dragDistRef.current += Math.abs(dx) + Math.abs(dy);

    phiRef.current -= dx * DRAG_SENSITIVITY;
    thetaRef.current = Math.max(
      CENTER_THETA - THETA_RANGE,
      Math.min(
        CENTER_THETA + THETA_RANGE,
        thetaRef.current + dy * DRAG_SENSITIVITY,
      ),
    );
  }, []);

  const scheduleResume = useCallback(() => {
    draggingRef.current = false;
    resumeTimerRef.current = setTimeout(() => {
      userDraggingRef.current = false;
    }, RESUME_DELAY);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const wasClick = dragDistRef.current < CLICK_THRESHOLD;
      scheduleResume();

      if (wasClick && onClickRef.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleF = size / rect.width;
        const cx = (e.clientX - rect.left) * scaleF;
        const cy = (e.clientY - rect.top) * scaleF;

        let bestIdx = -1;
        let bestDist = MARKER_HIT_RADIUS;

        markers.forEach((m, i) => {
          const p = projectToScreen(
            m.location[0],
            m.location[1],
            phiRef.current,
            thetaRef.current,
            size,
            GLOBE_SCALE,
          );
          if (!p.visible) return;
          const d = Math.hypot(p.x - cx, p.y - cy);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        });

        if (bestIdx >= 0) onClickRef.current(bestIdx);
      }
    },
    [markers, size, scheduleResume],
  );

  // ─── Render ─────────────────────────────────────────────────────────
  const activeMarker =
    activeMarkerIndex !== null && activeMarkerIndex >= 0
      ? markers[activeMarkerIndex]
      : null;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        maxWidth: "100%",
        aspectRatio: "1",
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={scheduleResume}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          cursor: "grab",
          touchAction: "none",
          opacity: 0,
          transition: "opacity 1s ease",
        }}
      />

      {/* Card overlay — positioned per-frame by the onRender callback */}
      {activeMarker && (
        <div
          ref={cardElRef}
          style={{
            position: "absolute",
            transform: "translate(-50%, -130%)",
            pointerEvents: "none",
            zIndex: 10,
            opacity: 0,
            transition: "opacity 0.4s ease",
          }}
        >
          <div
            className="globe-card"
            style={{
              background: "rgba(34,40,42,0.82)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: "12px 16px",
              minWidth: 180,
              maxWidth: 230,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            <div
              className="globe-card-stat"
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.3,
                marginBottom: 4,
              }}
            >
              {activeMarker.stat}
            </div>
            <div
              className="globe-card-label"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "rgba(255,255,255,0.45)",
                lineHeight: 1.3,
              }}
            >
              {activeMarker.label}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
