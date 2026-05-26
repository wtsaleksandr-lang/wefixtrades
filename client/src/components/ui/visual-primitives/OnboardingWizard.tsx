/**
 * OnboardingWizard — universal 5-min onboarding scaffold (Wave 33).
 *
 * Goal: under 5 minutes from zero → first live demo for every product.
 *
 * Pattern extracted from the per-product Setup wizards shipped in
 * Waves 26-31 (TradeLine, ReputationShield, QuoteQuick, AdFlow, WebCare).
 * Each of those used the same 3-question shape:
 *
 *   1. Pick (trade / website / platform)
 *   2. Configure (service area / budget / brand voice)
 *   3. Verify (live preview / test send / demo)
 *
 * This primitive owns the wizard chrome (step bar, back/next, skip,
 * localStorage resume, time-tracker, optional live-preview rail) and
 * defers per-step content to small step-renderer functions. Per-product
 * variation lives in the steps prop only.
 *
 * Companion step renderers live in `client/src/components/onboarding/steps/`.
 *
 * Hard rules followed (per DESIGN-SYSTEM.md + Alex memory):
 *   - Semantic tokens only (no raw hex)
 *   - Skip option always visible
 *   - 2px gaps; no big-gap layouts
 *   - prefers-reduced-motion respected
 *   - Resume from localStorage on mount
 *   - State persisted on every change
 *   - No new npm deps
 */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type OnboardingProduct =
  | "tradeline"
  | "reputationshield"
  | "quotequick"
  | "adflow"
  | "webcare"
  | "contentflow"
  | "rankflow"
  | "socialsync"
  | "mapguard";

export type WizardState = Record<string, unknown>;

export type OnboardingStep = {
  /** Stable id used for localStorage + analytics. */
  id: string;
  /** "What's your trade?" — shown in the step header. */
  title: string;
  /** Optional one-liner under the title. */
  description?: string;
  /** Render the step body. Receives the live state + a partial setter. */
  render: (ctx: WizardRenderContext) => ReactNode;
  /** Return an error msg (string) to block Next; return null to allow. */
  validate?: (state: WizardState) => string | null;
  /** Optional — show "(optional)" pill + allow skipping this single step. */
  optional?: boolean;
  /**
   * Rough minutes this step typically takes. Used to compute
   * "Y minutes left" header copy. Default 1.
   */
  estimateMinutes?: number;
};

export type WizardRenderContext = {
  state: WizardState;
  setState: (patch: WizardState) => void;
  product: OnboardingProduct;
};

export type OnboardingWizardProps = {
  product: OnboardingProduct;
  /** Typically 3, max 5. Renderer warns in dev if > 5. */
  steps: OnboardingStep[];
  onComplete: (state: WizardState) => Promise<void> | void;
  onSkip?: () => void;
  initialState?: WizardState;
  /** Optional right-rail render — typically a live preview of the wizard output. */
  livePreview?: (state: WizardState) => ReactNode;
  /** Target completion time in minutes (default 5). */
  targetMinutes?: number;
  /** Friendly product label for the header chip — defaults to the product slug. */
  productLabel?: string;
  /** Optional concierge CTA shown when user blows past targetMinutes. */
  conciergeHref?: string;
  className?: string;
};

const PRODUCT_LABEL: Record<OnboardingProduct, string> = {
  tradeline: "TradeLine",
  reputationshield: "ReputationShield",
  quotequick: "QuoteQuick",
  adflow: "AdFlow",
  webcare: "WebCare",
  contentflow: "ContentFlow",
  rankflow: "RankFlow",
  socialsync: "SocialSync",
  mapguard: "MapGuard",
};

function storageKey(product: OnboardingProduct) {
  return `wft.onboarding.${product}.v1`;
}

function loadDraft(product: OnboardingProduct, initialState?: WizardState): {
  state: WizardState;
  stepIdx: number;
  startedAt: number;
} {
  const fallback = {
    state: initialState ?? {},
    stepIdx: 0,
    startedAt: Date.now(),
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(product));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      state?: WizardState;
      stepIdx?: number;
      startedAt?: number;
    };
    return {
      state: { ...(initialState ?? {}), ...(parsed.state ?? {}) },
      stepIdx: typeof parsed.stepIdx === "number" ? parsed.stepIdx : 0,
      startedAt: parsed.startedAt ?? Date.now(),
    };
  } catch {
    return fallback;
  }
}

function persistDraft(
  product: OnboardingProduct,
  state: WizardState,
  stepIdx: number,
  startedAt: number,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(product),
      JSON.stringify({ state, stepIdx, startedAt }),
    );
  } catch {
    /* private-mode etc. — non-fatal */
  }
}

function clearDraft(product: OnboardingProduct) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(product));
  } catch {
    /* non-fatal */
  }
}

export function OnboardingWizard({
  product,
  steps,
  onComplete,
  onSkip,
  initialState,
  livePreview,
  targetMinutes = 5,
  productLabel,
  conciergeHref,
  className,
}: OnboardingWizardProps) {
  const reduceMotion = useReducedMotion();

  if (process.env.NODE_ENV !== "production" && steps.length > 5) {
    // Soft warn — Alex's directive caps wizards at 5 steps to hold the
    // < 5-min target. Render still proceeds.

    console.warn(
      `[OnboardingWizard] ${product} has ${steps.length} steps — > 5 risks the 5-min target.`,
    );
  }

  // Restore draft (state + which step we were on) on mount.
  const restoredRef = useRef(false);
  const [state, setStateInternal] = useState<WizardState>(() => {
    const d = loadDraft(product, initialState);
    return d.state;
  });
  const [stepIdx, setStepIdx] = useState<number>(() => loadDraft(product, initialState).stepIdx);
  const [startedAt, setStartedAt] = useState<number>(
    () => loadDraft(product, initialState).startedAt,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Persist on any change.
  useEffect(() => {
    if (!restoredRef.current) {
      restoredRef.current = true;
      return;
    }
    persistDraft(product, state, stepIdx, startedAt);
  }, [product, state, stepIdx, startedAt]);

  // Tick once a minute for the "Y minutes left" header copy.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (completed) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, [completed]);

  const setState = useCallback((patch: WizardState) => {
    setStateInternal((cur) => ({ ...cur, ...patch }));
  }, []);

  const currentStep = steps[stepIdx];
  const isLastStep = stepIdx === steps.length - 1;
  const isFirstStep = stepIdx === 0;

  const elapsedMs = Date.now() - startedAt;
  const elapsedMin = Math.floor(elapsedMs / 60_000);
  const remainingMin = Math.max(0, targetMinutes - elapsedMin);
  const overTarget = elapsedMin > targetMinutes;

  const onNext = useCallback(async () => {
    setValidationError(null);
    const err = currentStep?.validate?.(state) ?? null;
    if (err) {
      setValidationError(err);
      return;
    }
    if (!isLastStep) {
      setStepIdx((n) => n + 1);
      return;
    }
    // Last step → complete.
    setSubmitting(true);
    try {
      await onComplete(state);
      setCompleted(true);
      clearDraft(product);
    } catch (err: unknown) {
      setValidationError(
        err instanceof Error ? err.message : "Something went wrong saving. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [currentStep, isLastStep, onComplete, product, state]);

  const onBack = useCallback(() => {
    setValidationError(null);
    setStepIdx((n) => Math.max(0, n - 1));
  }, []);

  const onSkipStep = useCallback(() => {
    if (!currentStep?.optional) return;
    setValidationError(null);
    if (isLastStep) {
      // Treat skip-on-last-step as complete with current state.
      void onNext();
      return;
    }
    setStepIdx((n) => n + 1);
  }, [currentStep, isLastStep, onNext]);

  const onSkipAll = useCallback(() => {
    clearDraft(product);
    onSkip?.();
  }, [onSkip, product]);

  // Reset to start (for analytics / "start over" CTA).
  const reset = useCallback(() => {
    clearDraft(product);
    setStateInternal(initialState ?? {});
    setStepIdx(0);
    setStartedAt(Date.now());
    setValidationError(null);
  }, [initialState, product]);

  const renderContext: WizardRenderContext = useMemo(
    () => ({ state, setState, product }),
    [state, setState, product],
  );

  const label = productLabel ?? PRODUCT_LABEL[product];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Top bar — product chip + step indicator + time + skip-all */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground"
            data-testid="wizard-product-chip"
          >
            <Sparkles className="h-3 w-3 text-[hsl(var(--chart-1))]" aria-hidden="true" />
            {label}
          </span>
          <span
            className="text-[11px] text-muted-foreground"
            data-testid="wizard-step-indicator"
          >
            Setup — Step {stepIdx + 1} of {steps.length}
          </span>
          <span
            className={cn(
              "text-[11px]",
              overTarget ? "text-[hsl(var(--destructive))]" : "text-muted-foreground",
            )}
            data-testid="wizard-time-remaining"
            aria-live="polite"
          >
            {overTarget
              ? `${elapsedMin} min — past target`
              : `~${remainingMin} min left`}
          </span>
        </div>
        {onSkip && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkipAll}
            className="text-[11px]"
            data-testid="wizard-skip-all"
          >
            Skip setup
          </Button>
        )}
      </div>

      {/* Step progress bar */}
      <ol
        className="flex items-center gap-1.5"
        aria-label={`Step ${stepIdx + 1} of ${steps.length}`}
        data-testid="wizard-progress-bar"
      >
        {steps.map((s, i) => (
          <li
            key={s.id}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < stepIdx
                ? "bg-[hsl(var(--chart-1))]"
                : i === stepIdx
                  ? "bg-[hsl(var(--chart-1)/0.6)]"
                  : "bg-muted",
            )}
          />
        ))}
      </ol>

      {/* Body — step content + optional live-preview rail */}
      <div
        className={cn(
          "grid gap-3",
          livePreview ? "lg:grid-cols-[1fr_minmax(0,340px)]" : "",
        )}
      >
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {currentStep?.title}
              </h2>
              {currentStep?.optional && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  optional
                </span>
              )}
            </div>
            {currentStep?.description && (
              <p className="text-xs text-muted-foreground">
                {currentStep.description}
              </p>
            )}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep?.id ?? stepIdx}
              initial={reduceMotion ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
              className="flex flex-col gap-2"
              data-testid={`wizard-step-${currentStep?.id}`}
            >
              {currentStep?.render(renderContext)}
            </motion.div>
          </AnimatePresence>

          {validationError && (
            <p
              className="text-xs text-[hsl(var(--destructive))]"
              role="alert"
              data-testid="wizard-validation-error"
            >
              {validationError}
            </p>
          )}

          {overTarget && conciergeHref && (
            <a
              href={conciergeHref}
              className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--chart-1))] hover:underline"
              data-testid="wizard-concierge-cta"
            >
              <MessageCircle className="h-3 w-3" aria-hidden="true" />
              Need help? Chat with our concierge
            </a>
          )}

          {/* Footer — back / skip-step / next-or-finish */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              disabled={isFirstStep || submitting}
              data-testid="wizard-back"
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              {currentStep?.optional && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSkipStep}
                  disabled={submitting}
                  data-testid="wizard-skip-step"
                >
                  Skip this step
                </Button>
              )}
              <Button
                size="sm"
                onClick={onNext}
                disabled={submitting}
                data-testid={isLastStep ? "wizard-finish" : "wizard-next"}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : isLastStep ? (
                  <>
                    Finish
                    <Check className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {livePreview && (
          <Card className="flex flex-col gap-2 p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Live preview
            </h3>
            <div className="flex flex-col gap-2">{livePreview(state)}</div>
          </Card>
        )}
      </div>

      {completed && (
        <Card className="flex items-center gap-2 p-3" data-testid="wizard-complete">
          <Check className="h-4 w-4 text-[hsl(var(--chart-1))]" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Setup complete. Your {label} is live.
          </p>
        </Card>
      )}

      {/* Tiny "start over" affordance — useful when resuming a stale draft. */}
      {!completed && stepIdx > 0 && (
        <button
          type="button"
          onClick={reset}
          className="self-start text-[10px] text-muted-foreground/70 hover:text-muted-foreground hover:underline"
          data-testid="wizard-reset"
        >
          Start over
        </button>
      )}
    </div>
  );
}
