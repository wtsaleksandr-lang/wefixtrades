/**
 * ActionsStack — Tinder-style swipe-dismiss AI recommendations.
 *
 * Wave 27 MapGuard upgrade. Right-rail panel showing 3-5 AI Insights
 * recommendations (Wave 7). The top card can be dragged horizontally to
 * dismiss (>120px or velocity > 800px/s); on dismiss we POST to
 * /api/portal/ai-insights/dismiss-action so it doesn't reappear. Each
 * recommendation may also carry a 1-click `action` whitelisted server
 * side (Step 7) — clicking the primary button POSTs to /run-action.
 *
 * Mobile: full-width cards, tap to expand reasoning. Swipe up/down to
 * dismiss when horizontal space is limited.
 *
 * Empty state: "All caught up. Next recommendations land at 09:00 UTC
 * daily." per spec.
 *
 * Respects `prefers-reduced-motion`: drag still works but the snap-back
 * + fade-out are instant rather than spring-animated.
 */

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  Calendar,
  Check,
  ExternalLink,
  MessageSquare,
  Send,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ActionId =
  | "schedule-gbp-post"
  | "request-review"
  | "fix-citation-nap"
  | "start-citation-campaign"
  | "acknowledge";

export interface StackAction {
  id: ActionId;
  label: string;
  /** Optional params bag passed through to the run-action endpoint. */
  params?: Record<string, unknown>;
}

export interface StackCard {
  /** Stable identifier (the AI Insights action title, used for dismiss). */
  id: string;
  title: string;
  reasoning: string;
  /** Optional impact line shown beneath title ("Could lift Top 3 by ~6%"). */
  impact?: string;
  /** Primary 1-click action attached to this card. */
  action?: StackAction;
}

export interface ActionsStackProps {
  cards: StackCard[];
  onDismiss: (cardId: string) => void | Promise<void>;
  onRunAction: (
    cardId: string,
    action: StackAction,
  ) => void | Promise<void>;
  /** Show the demo-mode dismiss without backend persistence. */
  previewMode?: boolean;
  className?: string;
}

const ACTION_ICON: Record<ActionId, React.ElementType> = {
  "schedule-gbp-post": Calendar,
  "request-review": Star,
  "fix-citation-nap": Check,
  "start-citation-campaign": TrendingUp,
  acknowledge: MessageSquare,
};

const ACTION_PRIMARY_LABEL: Record<ActionId, string> = {
  "schedule-gbp-post": "Schedule post",
  "request-review": "Send review request",
  "fix-citation-nap": "Fix NAP now",
  "start-citation-campaign": "Start citation campaign",
  acknowledge: "Got it",
};

export function ActionsStack({
  cards,
  onDismiss,
  onRunAction,
  previewMode,
  className,
}: ActionsStackProps) {
  const reduceMotion = useReducedMotion();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => cards.filter((c) => !removed.has(c.id)),
    [cards, removed],
  );

  const top = visible[0];
  const queue = visible.slice(1, 3); // show up to 2 cards behind

  const handleDismiss = async (cardId: string) => {
    setRemoved((s) => new Set(s).add(cardId));
    try {
      await onDismiss(cardId);
    } catch (err) {
      // Failed to persist — roll back so it reappears on refresh.
      setRemoved((s) => {
        const next = new Set(s);
        next.delete(cardId);
        return next;
      });
    }
  };

  const handleRunAction = async (cardId: string, action: StackAction) => {
    try {
      await onRunAction(cardId, action);
    } finally {
      // Acknowledge dismisses inline; other actions stay visible until the
      // customer explicitly swipes them away.
      if (action.id === "acknowledge") {
        await handleDismiss(cardId);
      }
    }
  };

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-testid="actions-stack"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Actions to take
        </h2>
        {visible.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {visible.length} pending · swipe to dismiss
          </span>
        )}
      </div>

      <div className="relative h-[260px]">
        <AnimatePresence initial={false}>
          {/* Queued cards behind the top one — visual stack effect. */}
          {queue.map((card, i) => (
            <motion.div
              key={`queue-${card.id}`}
              aria-hidden
              className="absolute inset-x-0 top-0"
              initial={{ scale: 1, y: 0, opacity: 0 }}
              animate={{
                scale: 1 - (i + 1) * 0.04,
                y: (i + 1) * 8,
                opacity: 1,
              }}
              exit={{ opacity: 0 }}
              transition={
                reduceMotion ? { duration: 0 } : { duration: 0.3 }
              }
              style={{ zIndex: 5 - i }}
            >
              <StackCardShell tone="muted">
                <div className="space-y-1">
                  <h3 className="line-clamp-1 text-sm font-medium text-muted-foreground">
                    {card.title}
                  </h3>
                </div>
              </StackCardShell>
            </motion.div>
          ))}

          {top && (
            <TopCard
              key={top.id}
              card={top}
              expanded={expanded.has(top.id)}
              onToggleExpand={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  if (next.has(top.id)) next.delete(top.id);
                  else next.add(top.id);
                  return next;
                })
              }
              onDismiss={() => handleDismiss(top.id)}
              onRunAction={(action) => handleRunAction(top.id, action)}
              previewMode={previewMode}
            />
          )}

          {!top && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center"
              data-testid="actions-stack-empty"
            >
              <Card className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Check
                  className="h-6 w-6 text-[hsl(var(--gauge-emerald))]"
                  aria-hidden
                />
                <p className="text-sm font-medium text-foreground">
                  All caught up.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Next recommendations land at 09:00 UTC daily.
                </p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StackCardShell({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <Card
      className={cn(
        "h-[240px] overflow-hidden p-4",
        tone === "muted" && "bg-muted/40",
      )}
    >
      {children}
    </Card>
  );
}

function TopCard({
  card,
  expanded,
  onToggleExpand,
  onDismiss,
  onRunAction,
  previewMode,
}: {
  card: StackCard;
  expanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
  onRunAction: (action: StackAction) => void;
  previewMode?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-10, 0, 10]);
  const opacity = useTransform(x, [-200, -120, 0, 120, 200], [0.4, 0.7, 1, 0.7, 0.4]);

  const action = card.action;
  const PrimaryIcon = action ? ACTION_ICON[action.id] : Send;
  const primaryLabel = action
    ? action.label || ACTION_PRIMARY_LABEL[action.id]
    : "Got it";

  return (
    <motion.div
      key={`top-${card.id}`}
      className="absolute inset-x-0 top-0 z-10"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      style={{ x, rotate, opacity }}
      onDragEnd={(_, info) => {
        const distance = Math.abs(info.offset.x);
        const velocity = Math.abs(info.velocity.x);
        if (distance > 120 || velocity > 800) {
          onDismiss();
        }
      }}
      initial={
        reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96 }
      }
      animate={{ opacity: 1, scale: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, x: 400, transition: { duration: 0.25 } }
      }
      transition={
        reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 28 }
      }
      data-testid="actions-stack-top-card"
    >
      <StackCardShell>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">
                {card.title}
              </h3>
              {card.impact && (
                <p className="mt-0.5 text-[11px] font-medium text-[hsl(var(--gauge-emerald))]">
                  {card.impact}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss recommendation"
              data-testid="actions-stack-dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex-1 overflow-y-auto">
            <p
              className={cn(
                "text-xs text-muted-foreground",
                !expanded && "line-clamp-3",
              )}
            >
              {card.reasoning}
            </p>
            {card.reasoning.length > 140 && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="mt-1 text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
                aria-expanded={expanded}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            {action && (
              <Button
                size="sm"
                onClick={() => onRunAction(action)}
                className="flex-1 gap-1"
                data-testid="actions-stack-primary"
                disabled={previewMode}
              >
                <PrimaryIcon className="h-3.5 w-3.5" />
                {primaryLabel}
                {action.id !== "acknowledge" && (
                  <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
                )}
              </Button>
            )}
            {!action && (
              <Button
                size="sm"
                variant="outline"
                onClick={onDismiss}
                className="flex-1"
                data-testid="actions-stack-acknowledge"
              >
                <Check className="h-3.5 w-3.5" />
                Got it
              </Button>
            )}
          </div>
        </div>
      </StackCardShell>
    </motion.div>
  );
}
