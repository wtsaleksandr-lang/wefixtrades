/**
 * AIActionCard — universal AI-recommendation-with-approval card.
 *
 * Wave 34. ONE component renders every "AI says: do X, click to approve"
 * recommendation across every product (portal + admin). Reads the
 * registry entry (label, description, icon, confirmationLevel,
 * destructive) keyed by `actionKey` so the SAME recommendation looks
 * consistent on MapGuard's ActionsStack, ReputationShield's drawer,
 * AdFlow's anomaly banner, WebCare's maintenance log, and the admin
 * alerts table.
 *
 * Confirmation behaviour:
 *   - "none" → fire immediately on primary-button click.
 *   - "soft" → 2-step inline: first click flips the button to a 4-second
 *               "Click again to confirm" state.
 *   - "hard" → opens AlertDialog modal with explicit "Yes, do it" button.
 *               Destructive variant uses a red-tinted confirm button.
 *
 * Keyboard:
 *   - `A` = approve  (when card is focused)
 *   - `X` = dismiss  (when card is focused, onDismiss is wired)
 *
 * DESIGN-SYSTEM compliance: semantic tokens only (no raw hex), no
 * hover-transform, 2px gaps, primary action uses brand button colors,
 * destructive uses `hsl(var(--destructive))`, respects
 * `prefers-reduced-motion`.
 *
 * Parent owns the API call. The card calls the `onApprove` prop with
 * the actionKey + params; the parent does the network request and
 * returns `{ success, message? }`. The card handles loading state,
 * success flash + animate-out, and failure-restore + error-toast.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  Archive,
  BadgePercent,
  Bot,
  CalendarPlus,
  Check,
  Download,
  Flag,
  HardDrive,
  Layers,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Pause,
  Play,
  Replace,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getAction,
  type AIActionContext,
  type AIActionProduct,
} from "@shared/aiActions";

/** Icon name → lucide component. Centralised so the registry stays
 *  string-only (no React imports in shared/). */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  AlertTriangle,
  ArrowUpRight,
  Archive,
  BadgePercent,
  CalendarPlus,
  Check,
  Download,
  Flag,
  HardDrive,
  Layers,
  Mail,
  MessageCircle,
  MessageSquare,
  Pause,
  Play,
  Replace,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  TrendingUp,
  Wrench,
  Zap,
};

export interface AIActionRecommendation {
  /** Unique recommendation id (used for the audit log + dismiss path). */
  id: string;
  /** Short human-readable headline — e.g. "Pause underperforming campaign". */
  title: string;
  /** One-paragraph AI reasoning — e.g. "Costs $80/booking vs $45 target". */
  reasoning: string;
  /** Matches registry key for the (product, context). */
  actionKey: string;
  product: AIActionProduct;
  context?: AIActionContext;
  actionParams?: Record<string, unknown>;
}

export interface AIActionApproveResult {
  success: boolean;
  message?: string;
}

export interface AIActionCardProps {
  recommendation: AIActionRecommendation;
  /** Network call. Parent decides whether to POST `/api/ai-actions/dispatch`
   *  (preferred) or the legacy per-product endpoint. */
  onApprove: (
    actionKey: string,
    params: Record<string, unknown>,
  ) => Promise<AIActionApproveResult>;
  onDismiss?: () => void;
  /** Compact = small card in a stack. Expanded = right-rail detail. */
  layout?: "compact" | "expanded";
  className?: string;
}

const PRIMARY_BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function AIActionCard({
  recommendation,
  onApprove,
  onDismiss,
  layout = "compact",
  className,
}: AIActionCardProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const context: AIActionContext = recommendation.context ?? "portal";
  const action = useMemo(
    () => getAction(recommendation.product, context, recommendation.actionKey),
    [recommendation.product, context, recommendation.actionKey],
  );

  const [submitting, setSubmitting] = useState(false);
  const [softConfirmAt, setSoftConfirmAt] = useState<number | null>(null);
  const [hardConfirmOpen, setHardConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Soft-confirm window auto-expires after 4 seconds.
  useEffect(() => {
    if (softConfirmAt === null) return;
    const id = window.setTimeout(() => setSoftConfirmAt(null), 4000);
    return () => window.clearTimeout(id);
  }, [softConfirmAt]);

  const fire = useCallback(async () => {
    if (!action) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await onApprove(
        recommendation.actionKey,
        recommendation.actionParams ?? {},
      );
      if (result.success) {
        setSuccessMessage(result.message ?? "Done.");
        // Animate-out after a short success flash.
        window.setTimeout(() => setDismissed(true), 900);
      } else {
        setErrorMessage(result.message ?? "Action failed. Please try again.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message ? String(err.message) : "Action failed.");
    } finally {
      setSubmitting(false);
      setSoftConfirmAt(null);
      setHardConfirmOpen(false);
    }
  }, [action, onApprove, recommendation.actionKey, recommendation.actionParams]);

  const handlePrimaryClick = useCallback(() => {
    if (!action || submitting) return;
    // Destructive actions always use hard confirmation regardless of
    // the registry entry (defence-in-depth).
    const effectiveLevel =
      action.destructive === true ? "hard" : action.confirmationLevel;
    if (effectiveLevel === "none") {
      void fire();
      return;
    }
    if (effectiveLevel === "soft") {
      if (softConfirmAt && Date.now() - softConfirmAt < 4000) {
        void fire();
        return;
      }
      setSoftConfirmAt(Date.now());
      return;
    }
    // hard
    setHardConfirmOpen(true);
  }, [action, submitting, softConfirmAt, fire]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (submitting || dismissed) return;
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        handlePrimaryClick();
        return;
      }
      if (e.key.toLowerCase() === "x" && onDismiss) {
        e.preventDefault();
        onDismiss();
      }
    },
    [handlePrimaryClick, onDismiss, submitting, dismissed],
  );

  if (!action) {
    // Fail soft: registry miss should never crash the surface — render
    // a muted placeholder so dev/QA notices.
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground",
          className,
        )}
        data-testid="ai-action-card-missing"
      >
        AI recommendation '{recommendation.actionKey}' is not registered.
      </div>
    );
  }

  const isDestructive = action.destructive === true;
  const effectiveLevel = isDestructive ? "hard" : action.confirmationLevel;
  const IconComponent = action.icon ? ICON_MAP[action.icon] : undefined;
  const softArmed = softConfirmAt !== null;

  // Card root container animation: animate-out on success.
  return (
    <AnimatePresence>
      {dismissed ? null : (
        <motion.div
          ref={rootRef}
          layout={!reduceMotion}
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={
            reduceMotion ? undefined : { opacity: 0, height: 0, marginTop: 0 }
          }
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          tabIndex={0}
          role="group"
          aria-label={`AI recommendation: ${recommendation.title}`}
          onKeyDown={handleKeyDown}
          className={cn(
            "relative rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:hsl(var(--chart-1))]",
            isDestructive
              ? "border-[color:hsl(var(--destructive)/0.4)]"
              : "border-border",
            successMessage &&
              "ring-2 ring-[color:hsl(var(--chart-2)/0.6)] ring-offset-1",
            layout === "expanded" && "p-5",
            className,
          )}
          data-testid={`ai-action-card-${recommendation.id}`}
          data-confirmation-level={effectiveLevel}
          data-destructive={isDestructive ? "true" : undefined}
        >
          {/* Dismiss (X) — top-right */}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              disabled={submitting}
              aria-label="Dismiss recommendation"
              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              data-testid="ai-action-dismiss"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}

          {/* AI badge + title */}
          <div className="mb-2 flex items-start gap-2 pr-6">
            <span
              className={cn(
                "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                isDestructive
                  ? "bg-[color:hsl(var(--destructive)/0.12)] text-[color:hsl(var(--destructive))]"
                  : "bg-[color:hsl(var(--chart-1)/0.12)] text-[color:hsl(var(--chart-1))]",
              )}
              aria-hidden="true"
            >
              <Bot className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold leading-snug">
                {recommendation.title}
              </h3>
              <p
                className={cn(
                  "mt-1 text-xs leading-relaxed text-muted-foreground",
                  layout === "expanded" && "text-sm",
                )}
              >
                {recommendation.reasoning}
              </p>
            </div>
          </div>

          {/* Action description from the registry */}
          <p className="mb-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              <span>Recommended action</span>
            </span>
          </p>
          <p className="mb-3 text-xs text-foreground/80">{action.description}</p>

          {/* Estimated runtime hint */}
          {action.estimatedSeconds && action.estimatedSeconds > 0 ? (
            <p className="mb-3 text-[11px] text-muted-foreground">
              Estimated time: ~
              {action.estimatedSeconds < 60
                ? `${action.estimatedSeconds}s`
                : `${Math.round(action.estimatedSeconds / 60)} min`}
            </p>
          ) : null}

          {/* Error message (if last attempt failed) */}
          {errorMessage ? (
            <div
              role="alert"
              className="mb-3 rounded-md bg-[color:hsl(var(--destructive)/0.08)] px-3 py-2 text-xs text-[color:hsl(var(--destructive))] ring-1 ring-inset ring-[color:hsl(var(--destructive)/0.3)]"
              data-testid="ai-action-error"
            >
              {errorMessage}
            </div>
          ) : null}

          {/* Success flash */}
          {successMessage ? (
            <div
              role="status"
              className="mb-3 rounded-md bg-[color:hsl(var(--chart-2)/0.12)] px-3 py-2 text-xs font-medium text-[color:hsl(var(--chart-2))] ring-1 ring-inset ring-[color:hsl(var(--chart-2)/0.4)]"
              data-testid="ai-action-success"
            >
              {successMessage}
            </div>
          ) : null}

          {/* Footer: primary action button */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handlePrimaryClick}
              disabled={submitting || dismissed}
              data-testid="ai-action-primary"
              data-state={
                submitting
                  ? "loading"
                  : softArmed
                    ? "soft-armed"
                    : "idle"
              }
              className={cn(
                PRIMARY_BTN_BASE,
                isDestructive
                  ? "bg-[color:hsl(var(--destructive))] text-[color:hsl(var(--destructive-foreground))] hover:bg-[color:hsl(var(--destructive)/0.9)]"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : softArmed ? (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              ) : IconComponent ? (
                <IconComponent className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {submitting
                  ? "Working…"
                  : softArmed
                    ? "Click again to confirm"
                    : action.label}
              </span>
            </button>
          </div>

          {/* Hard-confirmation modal */}
          <AlertDialog
            open={hardConfirmOpen}
            onOpenChange={(open) => {
              if (!submitting) setHardConfirmOpen(open);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isDestructive ? "Confirm destructive action" : "Confirm action"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block font-medium text-foreground">
                    {action.label}
                  </span>
                  <span className="mt-1 block">{action.description}</span>
                  {isDestructive ? (
                    <span className="mt-2 block text-[color:hsl(var(--destructive))]">
                      This action is destructive. It may not be reversible.
                    </span>
                  ) : null}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={submitting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  // Must be an explicit click — Radix's onSelect would
                  // fire on Enter-key when the dialog is auto-focused.
                  // We override with a button that doesn't auto-fire on
                  // any key shortcut.
                  asChild
                >
                  <button
                    type="button"
                    onClick={() => void fire()}
                    disabled={submitting}
                    onKeyDown={(e) => {
                      // Block Enter key from firing destructive confirms — Alex's
                      // explicit anti-pattern from the brief. Click only.
                      if (isDestructive && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                      }
                    }}
                    className={cn(
                      PRIMARY_BTN_BASE,
                      isDestructive
                        ? "bg-[color:hsl(var(--destructive))] text-[color:hsl(var(--destructive-foreground))] hover:bg-[color:hsl(var(--destructive)/0.9)]"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                    data-testid="ai-action-hard-confirm"
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Yes, do it
                  </button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AIActionCard;
