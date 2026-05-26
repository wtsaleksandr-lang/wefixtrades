/**
 * AcceptanceFunnel — Wave 29 — multi-step quote-acceptance flow
 * (TradeLine-style).
 *
 * Steps (each is its own URL slug for shareability):
 *   /q/:slug         → "view"     — read the quote
 *   /q/:slug/options → "options"  — pick good/better/best variant
 *   /q/:slug/review  → "review"   — confirm details
 *   /q/:slug/sign    → "sign"     — e-signature canvas (50-LOC, no dep)
 *   /q/:slug/deposit → "deposit"  — Stripe checkout
 *
 * This component renders the progress strip + step-content slots. Parents
 * wire actual content per step. The signature pad ships inline (canvas).
 *
 * Per Wave 29 anti-pattern: no new npm dep for signature — pure canvas.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AcceptanceStep =
  | "view"
  | "options"
  | "review"
  | "sign"
  | "deposit";

export const ACCEPTANCE_STEPS: { id: AcceptanceStep; label: string }[] = [
  { id: "view", label: "View quote" },
  { id: "options", label: "Pick options" },
  { id: "review", label: "Review" },
  { id: "sign", label: "Sign" },
  { id: "deposit", label: "Deposit" },
];

export interface AcceptanceFunnelProps {
  currentStep: AcceptanceStep;
  onAdvance?: (next: AcceptanceStep) => void;
  className?: string;
  /** When the step is "sign", pass through a callback for the signature dataURL. */
  onSignatureCommit?: (dataUrl: string) => void;
}

export function AcceptanceFunnel({
  currentStep,
  onAdvance,
  onSignatureCommit,
  className,
}: AcceptanceFunnelProps) {
  const idx = ACCEPTANCE_STEPS.findIndex((s) => s.id === currentStep);

  function advance() {
    const nextIdx = Math.min(ACCEPTANCE_STEPS.length - 1, idx + 1);
    onAdvance?.(ACCEPTANCE_STEPS[nextIdx].id);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-[11px]">
        {ACCEPTANCE_STEPS.map((step, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={step.id} className="flex items-center gap-1">
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                  done &&
                    "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))]",
                  active &&
                    "bg-[hsl(var(--chart-1)/0.12)] text-[hsl(var(--chart-1))]",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
                data-testid={`step-pill-${step.id}`}
              >
                {done ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <span className="inline-block h-4 w-4 rounded-full bg-current/20 text-center text-[10px] leading-4">
                    {i + 1}
                  </span>
                )}
                {step.label}
              </span>
              {i < ACCEPTANCE_STEPS.length - 1 && (
                <ChevronRight
                  className="h-3 w-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      <Card className="flex flex-col gap-2 p-3">
        {currentStep === "view" && (
          <p className="text-sm text-foreground">
            Review the quote details, then continue to pick options.
          </p>
        )}
        {currentStep === "options" && (
          <p className="text-sm text-foreground">
            Pick the package that works for you. Good / Better / Best variants
            keep the conversation focused.
          </p>
        )}
        {currentStep === "review" && (
          <p className="text-sm text-foreground">
            Confirm the line items + total before signing.
          </p>
        )}
        {currentStep === "sign" && (
          <SignaturePad onCommit={onSignatureCommit} />
        )}
        {currentStep === "deposit" && (
          <p className="text-sm text-foreground">
            Pay the deposit via Stripe to lock in the booking.
          </p>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={advance}
            disabled={idx >= ACCEPTANCE_STEPS.length - 1}
            data-testid="acceptance-next"
          >
            Continue
            <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ─── Signature pad (50-LOC pure canvas) ──────────────────────────────── */

function SignaturePad({
  onCommit,
}: {
  onCommit?: (dataUrl: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const c = ref.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    const evt =
      "touches" in e
        ? e.touches[0] ?? { clientX: 0, clientY: 0 }
        : (e as React.MouseEvent);
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    setDrawing(true);
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }

  function end() {
    setDrawing(false);
  }

  function clear() {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  }

  function commit() {
    const c = ref.current;
    if (!c) return;
    onCommit?.(c.toDataURL("image/png"));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Sign with your finger or trackpad below.
      </p>
      <canvas
        ref={ref}
        width={420}
        height={140}
        className="w-full rounded-md border border-input bg-card touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        data-testid="signature-pad"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={clear} data-testid="sig-clear">
          Clear
        </Button>
        <Button
          size="sm"
          onClick={commit}
          disabled={!hasInk}
          data-testid="sig-commit"
        >
          <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Confirm signature
        </Button>
      </div>
    </div>
  );
}

export default AcceptanceFunnel;
