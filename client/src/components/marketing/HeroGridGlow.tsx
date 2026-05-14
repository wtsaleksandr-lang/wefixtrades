import { useEffect, useRef, useState } from "react";

const ACCENT_COLORS = [
  "rgba(13,60,252,0.18)",
  "rgba(13,60,252,0.14)",
  "rgba(13,60,252,0.22)",
  "rgba(13,60,252,0.10)",
];

const GLOW_SHADOW = "0 0 12px rgba(13,60,252,0.10)";
const CELL_TRANSITION = "background-color 0.7s ease, box-shadow 0.7s ease";

interface HeroGridGlowProps {
  cellSize?: number;
  className?: string;
  showCrosshairs?: boolean;
}

export default function HeroGridGlow({
  cellSize = 28,
  className = "",
  showCrosshairs = false,
}: HeroGridGlowProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const parent = wrapper.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      const cols = Math.ceil(width / cellSize) + 2;
      const rows = Math.ceil(height / cellSize) + 2;
      setGrid((prev) => {
        if (prev && prev.cols === cols && prev.rows === rows) return prev;
        return { cols, rows };
      });
    };

    measure();

    const parent = wrapper.parentElement;
    const ro = new ResizeObserver(measure);
    if (parent) ro.observe(parent);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [cellSize]);

  useEffect(() => {
    if (!grid) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const container = gridRef.current;
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

      for (const [idx, activatedAt] of Array.from(activeCells.entries())) {
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
      for (const idx of Array.from(activeCells.keys())) {
        const cell = cells[idx] as HTMLElement | undefined;
        if (cell) {
          cell.style.backgroundColor = "transparent";
          cell.style.boxShadow = "none";
        }
      }
    };
  }, [grid]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {grid && (
        <div
          ref={gridRef}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${grid.cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${grid.rows}, ${cellSize}px)`,
            width: grid.cols * cellSize,
            height: grid.rows * cellSize,
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {Array.from({ length: grid.cols * grid.rows }, (_, i) => {
            const col = i % grid.cols;
            const row = Math.floor(i / grid.cols);
            const isCrosshair =
              showCrosshairs && col % 3 === 0 && row % 3 === 0;
            return (
              <div
                key={i}
                style={{
                  width: cellSize,
                  height: cellSize,
                  boxSizing: "border-box",
                  border: "1px solid rgba(255,255,255,0.04)",
                  transition: CELL_TRANSITION,
                  position: "relative",
                }}
              >
                {isCrosshair && (
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      opacity: 0.35,
                    }}
                  >
                    <line
                      x1="4"
                      y1="1"
                      x2="4"
                      y2="7"
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="0.8"
                    />
                    <line
                      x1="1"
                      y1="4"
                      x2="7"
                      y2="4"
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="0.8"
                    />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
