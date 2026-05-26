/**
 * OnboardingWalkthrough — guided product intro overlay.
 *
 * Part of Wave 22A. Pure-React step-by-step tour. Targets are CSS
 * selectors; for each step we measure the target, draw a soft highlight
 * cutout, and float a tooltip on the chosen side. Next / Back / Skip
 * close out the tour and persist completion in localStorage so it never
 * re-shows for the same user.
 *
 * No new deps (react-joyride etc. deliberately avoided). Respects
 * `prefers-reduced-motion` — tooltip skips fade and snaps in.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type WalkthroughStep = {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
};

export type OnboardingWalkthroughProps = {
  steps: WalkthroughStep[];
  storageKey: string;
  onComplete?: () => void;
  className?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 320;

function measure(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function tooltipPosition(rect: Rect, placement: WalkthroughStep["placement"]) {
  const p = placement ?? "bottom";
  if (p === "top") {
    return {
      top: rect.top - TOOLTIP_GAP,
      left: rect.left + rect.width / 2,
      transform: "translate(-50%, -100%)",
    };
  }
  if (p === "left") {
    return {
      top: rect.top + rect.height / 2,
      left: rect.left - TOOLTIP_GAP,
      transform: "translate(-100%, -50%)",
    };
  }
  if (p === "right") {
    return {
      top: rect.top + rect.height / 2,
      left: rect.left + rect.width + TOOLTIP_GAP,
      transform: "translate(0, -50%)",
    };
  }
  return {
    top: rect.top + rect.height + TOOLTIP_GAP,
    left: rect.left + rect.width / 2,
    transform: "translate(-50%, 0)",
  };
}

export function OnboardingWalkthrough({
  steps,
  storageKey,
  onComplete,
  className,
}: OnboardingWalkthroughProps) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState<boolean>(false);
  const [idx, setIdx] = useState<number>(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // On mount: open if storageKey not set yet.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!window.localStorage.getItem(storageKey)) {
        setOpen(true);
      }
    } catch {
      // private mode etc. — still show the tour; it just won't persist.
      setOpen(true);
    }
  }, [storageKey]);

  const updateRect = useCallback(() => {
    if (!open) return;
    const step = steps[idx];
    if (!step) return;
    setRect(measure(step.target));
  }, [open, idx, steps]);

  useLayoutEffect(() => {
    updateRect();
  }, [updateRect]);

  useEffect(() => {
    if (!open) return;
    const handler = () => updateRect();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, updateRect]);

  const finish = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, String(Date.now()));
      } catch {
        // ignore
      }
    }
    setOpen(false);
    setIdx(0);
    onComplete?.();
  }, [storageKey, onComplete]);

  if (!open || steps.length === 0) return null;
  const step = steps[idx];
  if (!step) return null;

  const isFirst = idx === 0;
  const isLast = idx === steps.length - 1;
  const pos = rect ? tooltipPosition(rect, step.placement) : null;

  return (
    <div
      className={cn("fixed inset-0 z-[100]", className)}
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      {/* Dim layer */}
      <div className="absolute inset-0 bg-[hsl(var(--foreground)/0.55)]" />

      {/* Highlight cutout — a transparent box with an outline + soft shadow
       * that punches through the dim layer visually. Implemented as a
       * positioned div with box-shadow spread, not an SVG mask. */}
      {rect ? (
        <motion.div
          className="absolute rounded-md pointer-events-none"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow:
              "0 0 0 9999px hsl(var(--foreground) / 0.55), 0 0 0 2px hsl(var(--chart-1))",
          }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      ) : null}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        {pos ? (
          <motion.div
            key={idx}
            className="absolute rounded-lg border bg-popover text-popover-foreground shadow-lg p-4"
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.transform,
              width: TOOLTIP_WIDTH,
              borderColor: "var(--border)",
            }}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            data-testid="walkthrough-tooltip"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="text-sm font-semibold">{step.title}</h4>
              <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                {idx + 1} / {steps.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {step.content}
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={finish}
                data-testid="walkthrough-skip"
              >
                Skip
              </Button>
              <div className="flex items-center gap-2">
                {!isFirst ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIdx((n) => Math.max(0, n - 1))}
                    data-testid="walkthrough-back"
                  >
                    Back
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => {
                    if (isLast) finish();
                    else setIdx((n) => Math.min(steps.length - 1, n + 1));
                  }}
                  data-testid="walkthrough-next"
                >
                  {isLast ? "Done" : "Next"}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default OnboardingWalkthrough;
