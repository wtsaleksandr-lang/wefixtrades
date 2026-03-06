import { useEffect, useRef } from "react";

const ACCENT_COLORS = [
  "rgba(102,232,250,0.18)",
  "rgba(102,232,250,0.14)",
  "rgba(102,232,250,0.22)",
  "rgba(102,232,250,0.10)",
];

const GLOW_SHADOW = "0 0 12px rgba(102,232,250,0.10)";
const CELL_TRANSITION = "background-color 0.7s ease, box-shadow 0.7s ease";

interface HeroGridGlowProps {
  rows?: number;
  cols?: number;
  cellSize?: number;
  className?: string;
}

export default function HeroGridGlow({
  rows = 16,
  cols = 48,
  cellSize = 28,
  className = "",
}: HeroGridGlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const container = containerRef.current;
    if (!container) return;

    const cells = container.children;
    const totalCells = cells.length;
    if (totalCells === 0) return;

    const activeCells = new Map<number, number>();

    const getMaxActive = () => {
      const w = window.innerWidth;
      if (w < 640) return 6;
      if (w < 1024) return 10;
      return 14;
    };

    const tick = () => {
      const now = Date.now();

      for (const [idx, activatedAt] of activeCells) {
        if (now - activatedAt > 2000) {
          const cell = cells[idx] as HTMLElement | undefined;
          if (cell) {
            cell.style.backgroundColor = "transparent";
            cell.style.boxShadow = "none";
          }
          activeCells.delete(idx);
        }
      }

      const maxActive = getMaxActive();
      const toAdd = Math.random() < 0.6 ? 2 : 1;

      for (let i = 0; i < toAdd; i++) {
        if (activeCells.size >= maxActive) break;
        let idx: number;
        let attempts = 0;
        do {
          idx = Math.floor(Math.random() * totalCells);
          attempts++;
        } while (activeCells.has(idx) && attempts < 10);

        if (!activeCells.has(idx)) {
          activeCells.set(idx, now);
          const cell = cells[idx] as HTMLElement | undefined;
          if (cell) {
            cell.style.backgroundColor =
              ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
            cell.style.boxShadow = GLOW_SHADOW;
          }
        }
      }
    };

    const id = setInterval(tick, 320);
    return () => {
      clearInterval(id);
      for (const idx of activeCells.keys()) {
        const cell = cells[idx] as HTMLElement | undefined;
        if (cell) {
          cell.style.backgroundColor = "transparent";
          cell.style.boxShadow = "none";
        }
      }
    };
  }, []);

  const totalCells = rows * cols;

  return (
    <div
      ref={containerRef}
      className={className}
      aria-hidden="true"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
        width: cols * cellSize,
        height: rows * cellSize,
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: totalCells }, (_, i) => (
        <div
          key={i}
          style={{
            width: cellSize,
            height: cellSize,
            boxSizing: "border-box",
            border: "1px solid rgba(255,255,255,0.04)",
            transition: CELL_TRANSITION,
          }}
        />
      ))}
    </div>
  );
}
