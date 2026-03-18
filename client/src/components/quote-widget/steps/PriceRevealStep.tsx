import { useEffect } from 'react';
import { DollarSign, Phone, AlertCircle } from 'lucide-react';
import { useWidgetState } from '../useWidgetState';
import type { StepDefinition } from '@shared/wizardSchema';

interface PriceRevealStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Calculates and displays the estimate. Calls the existing pricing
 * engine via useWidgetState().recalculate() on mount and when
 * estimateInputs change. Zero changes to calculateEstimate.ts.
 */
export default function PriceRevealStep({ step, accentColor }: PriceRevealStepProps) {
  const { estimate, recalculate, estimateInputs } = useWidgetState();

  // Recalculate whenever this step renders or inputs change
  useEffect(() => {
    recalculate();
  }, [recalculate]);

  return (
    <div className="space-y-4">
      {step.title && <h3 className="text-lg font-semibold">{step.title}</h3>}
      {step.subtitle && <p className="text-sm text-muted-foreground">{step.subtitle}</p>}

      {!estimate && (
        <div className="rounded-lg border p-6 text-center text-muted-foreground">
          Calculating...
        </div>
      )}

      {estimate?.type === 'call_for_quote' && (
        <CallForQuoteBlock message={estimate.message} accentColor={accentColor} />
      )}

      {estimate?.type === 'range' && (
        <RangeBlock
          rangeMin={estimate.rangeMin!}
          rangeMax={estimate.rangeMax!}
          accentColor={accentColor}
        />
      )}

      {estimate?.type === 'exact' && (
        <ExactPriceBlock
          total={estimate.total}
          breakdown={estimate.breakdown}
          callUs={estimate.callUs}
          accentColor={accentColor}
        />
      )}
    </div>
  );
}

/* ─── Sub-blocks ─── */

function ExactPriceBlock({
  total,
  breakdown,
  callUs,
  accentColor,
}: {
  total: number;
  breakdown: Array<{ label: string; amount: number }>;
  callUs: boolean;
  accentColor?: string;
}) {
  return (
    <div className="rounded-xl border p-6 space-y-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1">Your Estimate</p>
        <p className="text-4xl font-bold" style={{ color: accentColor }}>
          ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      {breakdown.length > 0 && (
        <div className="border-t pt-3 space-y-2">
          {breakdown.map((line, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{line.label}</span>
              <span className="font-medium">
                ${line.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {callUs && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          <Phone className="h-4 w-4 shrink-0" />
          <span>For jobs this size, we recommend calling us for a custom quote.</span>
        </div>
      )}
    </div>
  );
}

function RangeBlock({
  rangeMin,
  rangeMax,
  accentColor,
}: {
  rangeMin: number;
  rangeMax: number;
  accentColor?: string;
}) {
  return (
    <div className="rounded-xl border p-6 text-center space-y-2">
      <p className="text-sm text-muted-foreground">Estimated Range</p>
      <p className="text-3xl font-bold" style={{ color: accentColor }}>
        ${rangeMin.toLocaleString()} – ${rangeMax.toLocaleString()}
      </p>
      <p className="text-sm text-muted-foreground">
        Contact us for an exact quote tailored to your needs.
      </p>
    </div>
  );
}

function CallForQuoteBlock({
  message,
  accentColor,
}: {
  message?: string;
  accentColor?: string;
}) {
  return (
    <div className="rounded-xl border p-6 text-center space-y-3">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: accentColor ? `${accentColor}15` : '#f1f5f9' }}
      >
        <Phone className="h-6 w-6" style={{ color: accentColor }} />
      </div>
      <p className="text-lg font-semibold">{message || 'Request a Quote'}</p>
      <p className="text-sm text-muted-foreground">
        Fill in your details below and we'll get back to you with a custom quote.
      </p>
    </div>
  );
}
