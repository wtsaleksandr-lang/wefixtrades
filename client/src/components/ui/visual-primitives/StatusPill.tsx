/**
 * StatusPill — animated state transitions for content / publishing pipelines.
 *
 * Part of Wave 22A. Color-coded by status (semantic tokens), small dot
 * icon on the left, label on the right. When `pulse` is true, the pill
 * emits a subtle outward ripple. Status changes crossfade in 200ms.
 *
 * No raw hex — chart + destructive tokens. Respects `prefers-reduced-motion`.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type StatusPillStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "approved"
  | "published"
  | "failed";

export type StatusPillProps = {
  status: StatusPillStatus;
  label?: string;
  pulse?: boolean;
  className?: string;
};

// Each status maps to (a) a token-based text class and (b) a background tint.
// We use opacity-scoped chart tokens so the pill reads on both light + dark
// surfaces without needing per-theme branches.
const STYLES: Record<
  StatusPillStatus,
  { dot: string; text: string; bg: string; ring: string; defaultLabel: string }
> = {
  draft: {
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    bg: "bg-muted",
    ring: "ring-[color:var(--border)]",
    defaultLabel: "Draft",
  },
  scheduled: {
    dot: "bg-[hsl(var(--chart-1))]",
    text: "text-[hsl(var(--chart-1))]",
    bg: "bg-[hsl(var(--chart-1)/0.12)]",
    ring: "ring-[color:hsl(var(--chart-1)/0.3)]",
    defaultLabel: "Scheduled",
  },
  in_progress: {
    dot: "bg-[hsl(var(--chart-4))]",
    text: "text-[hsl(var(--chart-4))]",
    bg: "bg-[hsl(var(--chart-4)/0.12)]",
    ring: "ring-[color:hsl(var(--chart-4)/0.3)]",
    defaultLabel: "In progress",
  },
  approved: {
    dot: "bg-[hsl(var(--chart-2))]",
    text: "text-[hsl(var(--chart-2))]",
    bg: "bg-[hsl(var(--chart-2)/0.12)]",
    ring: "ring-[color:hsl(var(--chart-2)/0.3)]",
    defaultLabel: "Approved",
  },
  published: {
    dot: "bg-[hsl(var(--chart-2))]",
    text: "text-[hsl(var(--chart-2))]",
    bg: "bg-[hsl(var(--chart-2)/0.16)]",
    ring: "ring-[color:hsl(var(--chart-2)/0.45)]",
    defaultLabel: "Published",
  },
  failed: {
    dot: "bg-[hsl(var(--destructive))]",
    text: "text-[hsl(var(--destructive))]",
    bg: "bg-[hsl(var(--destructive)/0.12)]",
    ring: "ring-[color:hsl(var(--destructive)/0.35)]",
    defaultLabel: "Failed",
  },
};

export function StatusPill({ status, label, pulse, className }: StatusPillProps) {
  const reduceMotion = useReducedMotion();
  const s = STYLES[status];
  const text = label ?? s.defaultLabel;

  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        s.bg,
        s.text,
        s.ring,
        className
      )}
      data-testid="status-pill"
      data-status={status}
    >
      <span className="relative inline-flex h-3 w-3 items-center justify-center">
        <span className={cn("inline-block h-3 w-3 rounded-full", s.dot)} />
        {pulse && !reduceMotion ? (
          <motion.span
            className={cn("absolute inset-0 rounded-full", s.dot)}
            initial={{ opacity: 0.5, scale: 1 }}
            animate={{ opacity: 0, scale: 2.4 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            aria-hidden="true"
          />
        ) : null}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${status}-${text}`}
          initial={reduceMotion ? false : { opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 2 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default StatusPill;
