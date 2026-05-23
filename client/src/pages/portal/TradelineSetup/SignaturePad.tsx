/**
 * Lightweight signature pad — HTML canvas, pointer events, touch+mouse.
 * No external deps. Outputs base64 PNG on demand.
 *
 * Sized 4:1 aspect ratio at sensible DPR. The line is anti-aliased and
 * 2px wide; readable on every modern device.
 */

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";

export interface SignaturePadHandle {
  toDataURL: () => string;
  clear: () => void;
  isEmpty: () => boolean;
}

interface Props {
  className?: string;
  onChange?: (hasInk: boolean) => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { className, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [, force] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.setPointerCapture(e.pointerId);
    const p = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const p = pointerPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasInkRef.current) {
      hasInkRef.current = true;
      onChange?.(true);
      force((x) => x + 1);
    }
  }

  function end() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hasInkRef.current = false;
    onChange?.(false);
    force((x) => x + 1);
  }

  useImperativeHandle(ref, () => ({
    toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
    clear,
    isEmpty: () => !hasInkRef.current,
  }));

  return (
    <div data-theme="light" className={className}>
      <div className="relative rounded-lg border-2 border-dashed border-gray-300 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="block w-full aspect-[4/1] touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {!hasInkRef.current && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-gray-400 select-none">
            Sign here using your finger, stylus, or trackpad
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={clear}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Clear signature
        </button>
      </div>
    </div>
  );
});
