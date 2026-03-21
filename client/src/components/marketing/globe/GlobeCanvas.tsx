import { useEffect, useRef, useCallback } from "react";
import createGlobe from "cobe";
import type { GlobeMarker } from "./globeData";

interface GlobeCanvasProps {
  markers: GlobeMarker[];
  size?: number;
}

const AUTO_ROTATE_SPEED = 0.005;
const DRAG_SENSITIVITY = 0.005;
const RESUME_DELAY = 2000; // ms before auto-rotate resumes after drag

export default function GlobeCanvas({ markers, size = 900 }: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const rafRef = useRef<number>(0);
  const pausedRef = useRef(false);

  // Drag state refs (avoid re-renders)
  const draggingRef = useRef(false);
  const pointerXRef = useRef(0);
  const pointerYRef = useRef(0);
  const phiRef = useRef(3.5);
  const thetaRef = useRef(0.1);
  const userDraggingRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isMobile = window.innerWidth < 768;
    const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio, 2);

    phiRef.current = 3.5;
    thetaRef.current = 0.1;

    const cobeMarkers = markers.map((m) => ({
      location: m.location,
      size: m.size,
    }));

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * 2,
      height: size * 2,
      phi: 3.5,
      theta: 0.1,
      dark: 1,
      diffuse: 0.8,
      mapSamples: isMobile ? 10000 : 16000,
      mapBrightness: 6,
      baseColor: [0.3, 0.3, 0.3],
      markerColor: [0.4, 0.91, 0.98],
      glowColor: [0.2, 0.2, 0.2],
      opacity: 0.7,
      scale: 1.05,
      offset: [0, 0],
      markers: cobeMarkers,
    });

    globeRef.current = globe;

    const tick = () => {
      if (!pausedRef.current && !userDraggingRef.current) {
        phiRef.current += AUTO_ROTATE_SPEED;
      }
      globe.update({ phi: phiRef.current, theta: thetaRef.current });
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
      globeRef.current = null;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [markers, size]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    userDraggingRef.current = true;
    pointerXRef.current = e.clientX;
    pointerYRef.current = e.clientY;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - pointerXRef.current;
    const dy = e.clientY - pointerYRef.current;
    pointerXRef.current = e.clientX;
    pointerYRef.current = e.clientY;
    phiRef.current += dx * DRAG_SENSITIVITY;
    thetaRef.current = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, thetaRef.current - dy * DRAG_SENSITIVITY),
    );
  }, []);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    // Resume auto-rotate after a short delay
    resumeTimerRef.current = setTimeout(() => {
      userDraggingRef.current = false;
    }, RESUME_DELAY);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        width: size,
        height: size,
        maxWidth: "100%",
        aspectRatio: "1",
        display: "block",
        position: "relative",
        zIndex: 1,
        cursor: "grab",
        touchAction: "none",
      }}
    />
  );
}
