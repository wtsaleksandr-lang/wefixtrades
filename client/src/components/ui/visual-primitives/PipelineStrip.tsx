/**
 * PipelineStrip — horizontal status pipeline.
 *
 * Part of Wave 22A. Stages render as chips with icon + label + count,
 * connected by dotted lines. The line connecting the active stage to its
 * predecessor animates (dotted flow) to indicate work in-flight. Current
 * stage pulses gently. Counts animate on change via framer-motion layout.
 *
 * Mobile: stacks vertically with vertical connectors (CSS-driven via
 * flex-col on small screens).
 *
 * No raw hex — semantic tokens. Respects `prefers-reduced-motion`.
 */

import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type PipelineStripStatus = "idle" | "active" | "complete" | "error";

export type PipelineStripStage = {
  id: string;
  label: string;
  count: number;
  icon?: ReactNode;
  status?: PipelineStripStatus;
};

export type PipelineStripProps = {
  stages: PipelineStripStage[];
  highlightCurrent?: string;
  className?: string;
};

const STATUS_RING: Record<PipelineStripStatus, string> = {
  idle: "border-[color:var(--border)] text-muted-foreground",
  active: "border-[color:hsl(var(--chart-1))] text-foreground",
  complete: "border-[color:hsl(var(--chart-2))] text-foreground",
  error: "border-[color:hsl(var(--destructive))] text-foreground",
};

const STATUS_DOT: Record<PipelineStripStatus, string> = {
  idle: "bg-muted-foreground/40",
  active: "bg-[hsl(var(--chart-1))]",
  complete: "bg-[hsl(var(--chart-2))]",
  error: "bg-[hsl(var(--destructive))]",
};

export function PipelineStrip({ stages, highlightCurrent, className }: PipelineStripProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-stretch gap-2 md:gap-0 w-full",
        className
      )}
      data-testid="pipeline-strip"
      role="list"
    >
      {stages.map((stage, idx) => {
        const status = stage.status ?? "idle";
        const isCurrent = highlightCurrent === stage.id;
        const showPulse = isCurrent && status === "active" && !reduceMotion;
        const isLast = idx === stages.length - 1;

        return (
          <div
            key={stage.id}
            role="listitem"
            className="flex md:flex-1 flex-row md:flex-col items-center md:items-stretch"
          >
            <div className="relative flex items-center justify-center md:flex-1">
              <motion.div
                className={cn(
                  "relative inline-flex items-center gap-2 rounded-md border px-3 py-2 bg-card",
                  STATUS_RING[status]
                )}
                animate={
                  showPulse
                    ? {
                        boxShadow: [
                          "0 0 0 0 hsl(var(--chart-1) / 0.4)",
                          "0 0 0 6px hsl(var(--chart-1) / 0)",
                        ],
                      }
                    : { boxShadow: "0 0 0 0 hsl(var(--chart-1) / 0)" }
                }
                transition={
                  showPulse
                    ? { duration: 1.6, repeat: Infinity, ease: "easeOut" }
                    : { duration: 0.2 }
                }
              >
                <span className={cn("inline-block h-3 w-3 rounded-full", STATUS_DOT[status])} />
                {stage.icon ? <span className="text-muted-foreground">{stage.icon}</span> : null}
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-muted text-xs font-semibold tabular-nums px-1.5">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={stage.count}
                      initial={reduceMotion ? false : { y: -8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={reduceMotion ? undefined : { y: 8, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {stage.count}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </motion.div>
            </div>

            {!isLast && (
              <div
                className={cn(
                  // horizontal mode: thin dotted line between chips
                  "hidden md:flex flex-1 items-center justify-center",
                  "px-1"
                )}
                aria-hidden="true"
              >
                <div
                  className={cn(
                    "h-px w-full border-t border-dashed",
                    status === "active" || status === "complete"
                      ? "border-[color:hsl(var(--chart-1))]"
                      : "border-[color:var(--border)]"
                  )}
                  style={
                    !reduceMotion && status === "active"
                      ? {
                          backgroundImage:
                            "linear-gradient(90deg, hsl(var(--chart-1) / 0.4) 50%, transparent 50%)",
                          backgroundSize: "8px 1px",
                          backgroundRepeat: "repeat-x",
                          animation: "pipeline-flow 1.2s linear infinite",
                          border: "none",
                          height: "1px",
                        }
                      : undefined
                  }
                />
              </div>
            )}

            {/* Mobile vertical connector */}
            {!isLast && (
              <div className="md:hidden flex items-center justify-center w-full h-3" aria-hidden="true">
                <div className="w-px h-3 border-l border-dashed border-[color:var(--border)]" />
              </div>
            )}
          </div>
        );
      })}
      {/* Keyframes injected inline; @keyframes can't live in arbitrary
       * inline-style without globalCSS, so we use a tag here. Scoped by
       * `data-pipeline-strip` to avoid name clashes. */}
      <style>{`
        @keyframes pipeline-flow {
          from { background-position: 0 0; }
          to { background-position: 8px 0; }
        }
      `}</style>
    </div>
  );
}

export default PipelineStrip;
