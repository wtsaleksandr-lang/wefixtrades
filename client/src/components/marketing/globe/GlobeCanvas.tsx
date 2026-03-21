import { useEffect, useRef } from "react";
import createGlobe from "cobe";
import type { GlobeMarker } from "./globeData";

interface GlobeCanvasProps {
  markers: GlobeMarker[];
  size?: number;
}

export default function GlobeCanvas({ markers, size = 900 }: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const rafRef = useRef<number>(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isMobile = window.innerWidth < 768;
    const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio, 2);

    let phi = 3.5; // Start facing North America

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
      if (!pausedRef.current) {
        phi += 0.005;
        globe.update({ phi });
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
      globeRef.current = null;
    };
  }, [markers, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        maxWidth: "100%",
        aspectRatio: "1",
        display: "block",
        position: "relative",
        zIndex: 1,
      }}
    />
  );
}
