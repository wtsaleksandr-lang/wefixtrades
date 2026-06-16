// LogoCropModal — #15 crop + zoom step for the Style tab logo upload.
//
// After a user picks a logo file, this modal lets them DRAG the image to
// reposition and ZOOM in/out with a slider before it's committed to
// `state.logo`. The crop frame is a fixed square; the output is rendered with
// the Canvas API (no new dependency — react-easy-crop etc. are deliberately
// avoided per the brief) and handed back as a data URL.
//
// Output sizing: the cropped square is rasterised at OUTPUT_PX so the stored
// logo stays small (data URL persisted in shell state) while remaining crisp.
// PNG is used to preserve transparency (logos are commonly transparent PNG/SVG).

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { AE } from './appleEditor';

/** On-screen crop frame size (square, px). The image is drawn into this box. */
const FRAME_PX = 240;
/** Rasterised output resolution (square, px). 2× the frame for crispness. */
const OUTPUT_PX = 480;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

export interface LogoCropModalProps {
  /** Raw source image (data URL) the user just picked. */
  src: string;
  /** Commit the cropped square (data URL) back to the caller. */
  onApply: (dataUrl: string) => void;
  /** Dismiss without changing the logo. */
  onCancel: () => void;
  /** Editor theme so the modal chrome matches light / dark. */
  theme?: 'light' | 'dark';
}

interface Offset { x: number; y: number }

/**
 * Compute the base "contain" scale: the factor that fits the WHOLE image
 * inside the square frame at zoom = 1, so the entire logo is visible before
 * the user zooms in. Zoom multiplies this base.
 */
function containScale(imgW: number, imgH: number): number {
  if (!imgW || !imgH) return 1;
  return Math.min(FRAME_PX / imgW, FRAME_PX / imgH);
}

export default function LogoCropModal({ src, onApply, onCancel, theme = 'light' }: LogoCropModalProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Load the source image once.
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) setImg(image); };
    image.onerror = () => { if (!cancelled) setImg(null); };
    image.src = src;
    return () => { cancelled = true; };
  }, [src]);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  const base = useMemo(
    () => (img ? containScale(img.naturalWidth, img.naturalHeight) : 1),
    [img],
  );

  // The on-screen rendered size of the image at the current zoom.
  const drawnW = img ? img.naturalWidth * base * zoom : 0;
  const drawnH = img ? img.naturalHeight * base * zoom : 0;

  /** Clamp the pan so the image edges never pull inside the frame (no gaps)
   *  while it's larger than the frame; when smaller, keep it centred. */
  const clampOffset = useCallback((o: Offset, w: number, h: number): Offset => {
    const maxX = Math.max(0, (w - FRAME_PX) / 2);
    const maxY = Math.max(0, (h - FRAME_PX) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, o.x)),
      y: Math.min(maxY, Math.max(-maxY, o.y)),
    };
  }, []);

  // Re-clamp whenever zoom changes (image grew/shrank).
  useEffect(() => {
    setOffset((prev) => clampOffset(prev, drawnW, drawnH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, drawnW, drawnH]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      originX: offset.x, originY: offset.y,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, [offset]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const next = { x: d.originX + (e.clientX - d.startX), y: d.originY + (e.clientY - d.startY) };
    setOffset(clampOffset(next, drawnW, drawnH));
  }, [clampOffset, drawnW, drawnH]);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
  }, []);

  const reset = useCallback(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, []);

  /** Render the visible crop frame to a square canvas → PNG data URL. The
   *  on-screen geometry maps 1:1 to the canvas scaled by OUTPUT_PX/FRAME_PX. */
  const apply = useCallback(() => {
    if (!img) return;
    const scale = OUTPUT_PX / FRAME_PX;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Top-left of the drawn image relative to the frame's top-left.
    const left = (FRAME_PX - drawnW) / 2 + offset.x;
    const top = (FRAME_PX - drawnH) / 2 + offset.y;
    ctx.drawImage(
      img,
      left * scale, top * scale,
      drawnW * scale, drawnH * scale,
    );
    try {
      onApply(canvas.toDataURL('image/png'));
    } catch {
      // Tainted canvas / quota — fall back to the original source unchanged.
      onApply(src);
    }
  }, [img, drawnW, drawnH, offset, onApply, src]);

  const node = (
    <div
      className="qq-logocrop-overlay"
      data-theme={theme}
      role="dialog"
      aria-modal="true"
      aria-label="Crop and zoom your logo"
      data-testid="logo-crop-modal"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="qq-logocrop-card">
        <div className="qq-logocrop-header">
          <span className="qq-logocrop-title">Crop your logo</span>
          <button
            type="button"
            className="qq-logocrop-close"
            aria-label="Close without saving"
            data-testid="logo-crop-cancel"
            onClick={onCancel}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="qq-logocrop-body">
          <div
            className="qq-logocrop-frame"
            style={{ width: FRAME_PX, height: FRAME_PX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            data-testid="logo-crop-frame"
          >
            {img && (
              <img
                src={src}
                alt=""
                draggable={false}
                className="qq-logocrop-img"
                style={{
                  width: drawnW,
                  height: drawnH,
                  // Centre the image in the frame, then pan by the live offset.
                  left: (FRAME_PX - drawnW) / 2 + offset.x,
                  top: (FRAME_PX - drawnH) / 2 + offset.y,
                }}
              />
            )}
            <div className="qq-logocrop-mask" aria-hidden="true" />
          </div>

          <div className="qq-logocrop-controls">
            <button
              type="button"
              className="qq-logocrop-zoombtn"
              aria-label="Zoom out"
              data-testid="logo-crop-zoom-out"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
            >
              <ZoomOut style={{ width: 16, height: 16 }} />
            </button>
            <input
              type="range"
              className="qq-logocrop-slider"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={zoom}
              aria-label="Zoom level"
              data-testid="logo-crop-zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <button
              type="button"
              className="qq-logocrop-zoombtn"
              aria-label="Zoom in"
              data-testid="logo-crop-zoom-in"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
            >
              <ZoomIn style={{ width: 16, height: 16 }} />
            </button>
            <button
              type="button"
              className="qq-logocrop-reset"
              aria-label="Reset crop"
              data-testid="logo-crop-reset"
              onClick={reset}
            >
              <RotateCcw style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        <div className="qq-logocrop-footer">
          <button
            type="button"
            className="qq-logocrop-btn qq-logocrop-btn-ghost"
            data-testid="logo-crop-cancel-2"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="qq-logocrop-btn qq-logocrop-btn-primary"
            data-testid="logo-crop-apply"
            disabled={!img}
            onClick={apply}
          >
            Use this crop
          </button>
        </div>
      </div>

      <style>{`
        .qq-logocrop-overlay {
          position: fixed; inset: 0; z-index: 11000;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          background: rgba(15, 23, 42, 0.55);
          -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
          font-family: ${AE.font.family};
        }
        .qq-logocrop-card {
          width: 100%; max-width: 320px;
          display: flex; flex-direction: column;
          background: ${AE.color.bg};
          color: ${AE.color.text};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.lg};
          box-shadow: ${AE.shadow.pop};
          overflow: hidden;
        }
        .qq-logocrop-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid ${AE.color.hairline};
        }
        .qq-logocrop-title { font-size: 14px; font-weight: 600; }
        .qq-logocrop-close {
          background: transparent; border: none; cursor: pointer;
          color: ${AE.color.secondary}; padding: 4px; border-radius: 6px;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .qq-logocrop-close:hover { background: ${AE.color.surfaceHover}; color: ${AE.color.text}; }
        .qq-logocrop-body {
          padding: 14px;
          display: flex; flex-direction: column; align-items: center; gap: 12px;
        }
        .qq-logocrop-frame {
          position: relative; overflow: hidden;
          border-radius: ${AE.radius.md};
          background:
            repeating-conic-gradient(${AE.color.surface} 0% 25%, ${AE.color.bg} 0% 50%)
            50% / 20px 20px;
          border: 1px solid ${AE.color.hairline};
          cursor: grab; touch-action: none;
          user-select: none; -webkit-user-select: none;
        }
        .qq-logocrop-frame:active { cursor: grabbing; }
        .qq-logocrop-img {
          /* Absolute within the frame; left/top are computed inline (centre +
             live pan offset) so the drawn geometry maps 1:1 to the canvas
             crop math in apply(). */
          position: absolute;
          pointer-events: none;
          image-rendering: auto;
          max-width: none; max-height: none;
        }
        .qq-logocrop-mask {
          position: absolute; inset: 0; pointer-events: none;
          box-shadow: inset 0 0 0 1px rgba(13, 60, 252, 0.55);
          border-radius: ${AE.radius.md};
        }
        .qq-logocrop-controls {
          display: flex; align-items: center; gap: 8px; width: 100%;
        }
        .qq-logocrop-slider {
          flex: 1 1 auto; accent-color: ${AE.color.accent};
          height: 4px; cursor: pointer;
        }
        .qq-logocrop-zoombtn, .qq-logocrop-reset {
          background: ${AE.color.surface}; border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.sm}; cursor: pointer;
          color: ${AE.color.text};
          width: 32px; height: 32px; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .qq-logocrop-zoombtn:hover, .qq-logocrop-reset:hover { background: ${AE.color.surfaceHover}; }
        .qq-logocrop-footer {
          display: flex; gap: 8px; justify-content: flex-end;
          padding: 12px 14px;
          border-top: 1px solid ${AE.color.hairline};
        }
        .qq-logocrop-btn {
          min-height: 40px; padding: 0 16px; border-radius: ${AE.radius.md};
          font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
          border: 1px solid transparent;
        }
        .qq-logocrop-btn-ghost {
          background: ${AE.color.surface}; border-color: ${AE.color.hairline};
          color: ${AE.color.text};
        }
        .qq-logocrop-btn-ghost:hover { background: ${AE.color.surfaceHover}; }
        .qq-logocrop-btn-primary {
          background: ${AE.color.accent}; color: ${AE.color.publishText};
        }
        .qq-logocrop-btn-primary:hover { background: ${AE.color.accentHover}; }
        .qq-logocrop-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-card {
          background: #1e293b; color: #e2e8f0; border-color: rgba(255,255,255,0.10);
        }
        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-header,
        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-footer {
          border-color: rgba(255,255,255,0.08);
        }
        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-frame {
          border-color: rgba(255,255,255,0.12);
        }
        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-zoombtn,
        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-reset,
        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-btn-ghost {
          background: #0f172a; border-color: rgba(255,255,255,0.12); color: #e2e8f0;
        }
        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-close { color: #94a3b8; }
        .qq-logocrop-overlay[data-theme="dark"] .qq-logocrop-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}
