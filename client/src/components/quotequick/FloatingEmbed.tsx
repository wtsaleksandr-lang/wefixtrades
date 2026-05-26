/**
 * FloatingEmbed — Wave 29 — floating-button embed mode.
 *
 * In addition to inline embeds, customers can host a pulsing button at
 * bottom-right of their site. Click → an expanding modal with the full
 * widget. Existing sticky-widget-shell pattern (per Alex's repeated
 * request) wraps the modal content.
 *
 * Runtime mode-switch: parent picks <FloatingEmbed mode="floating"> vs
 * inline. The embed script (`qq-widget.js`) reads `data-mode="floating"`
 * to choose between the two.
 *
 * DESIGN-SYSTEM: 2px gaps, semantic tokens, respects prefers-reduced-motion,
 * no hover-shift.
 */

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FloatingEmbedProps {
  /** Visible label inside the launch button (defaults to "Get a quote"). */
  label?: string;
  /** Brand color (CSS color string). Defaults to the chart-1 token. */
  brandColor?: string;
  /** Render the widget contents inside the modal. */
  children: ReactNode;
  /** Whether the button pulses while idle. Defaults to true. */
  pulse?: boolean;
  /** Bottom offset px. Defaults to 24. */
  offsetBottom?: number;
  /** Right offset px. Defaults to 24. */
  offsetRight?: number;
  className?: string;
}

export function FloatingEmbed({
  label = "Get a quote",
  brandColor,
  children,
  pulse = true,
  offsetBottom = 24,
  offsetRight = 24,
  className,
}: FloatingEmbedProps) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Launcher */}
      <Button
        type="button"
        className={cn(
          "fixed z-[60] flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-lg",
          pulse && !reduceMotion && "animate-pulse",
          className,
        )}
        style={{
          bottom: offsetBottom,
          right: offsetRight,
          backgroundColor: brandColor ?? "hsl(var(--chart-1))",
        }}
        onClick={() => setOpen(true)}
        data-testid="floating-embed-launch"
        aria-label={label}
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>

      {/* Modal — sticky widget shell pattern: top header sticky, content
          scrollable, footer sticky bottom. overflow:clip (NOT hidden) to
          preserve sticky inside the modal. */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            data-testid="floating-embed-backdrop"
          >
            <motion.div
              className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-card shadow-2xl"
              style={{ overflow: "clip" /* not :hidden — keeps sticky working */ }}
              initial={reduceMotion ? false : { y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Quote widget"
            >
              <header
                className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-3 py-2"
                style={{
                  borderColor: brandColor ?? undefined,
                }}
              >
                <span className="text-sm font-semibold text-foreground">
                  {label}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  data-testid="floating-embed-close"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </header>

              <div className="flex-1 overflow-auto px-3 py-3">{children}</div>

              <footer className="sticky bottom-0 z-10 border-t bg-card px-3 py-2">
                <p className="text-center text-[10px] text-muted-foreground">
                  Powered by QuoteQuick
                </p>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default FloatingEmbed;
