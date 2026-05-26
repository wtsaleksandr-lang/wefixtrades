/**
 * AdCopyComposer — AdFlow AI ad-copy generator (Wave 30).
 *
 * Anyword-style 3-variant generator. Each variant card shows:
 *   - headline, body, CTA
 *   - KpiGauge size="sm" predictive performance score (0-100)
 *   - "Use this variant" button → pushes to ContentFlow + kicks off a live
 *      ad campaign update via the run-action flow
 *
 * Plus a bottom "Regenerate all 3" action.
 *
 * Backend: POST /api/portal/adflow/copy/generate
 * Activation: handled by the parent dashboard via the run-action mutation
 * (action="swap-ad-copy").
 *
 * No raw hex — semantic tokens only. Reuses KpiGauge from Wave 22A
 * shared visual primitives.
 */

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { KpiGauge } from "@/components/ui/visual-primitives";

interface CopyVariant {
  id: string;
  headline: string;
  body: string;
  cta: string;
  predictedScore: number;
}

export interface AdCopyComposerProps {
  defaultTrade?: string;
  onUseVariant?: (variant: CopyVariant) => void | Promise<void>;
}

export function AdCopyComposer({
  defaultTrade = "plumbing",
  onUseVariant,
}: AdCopyComposerProps) {
  const { toast } = useToast();
  const [trade, setTrade] = useState(defaultTrade);
  const [offer, setOffer] = useState("");
  const [variants, setVariants] = useState<CopyVariant[]>([]);

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portal/adflow/copy/generate", {
        trade,
        offer: offer || undefined,
      });
      return res as unknown as { variants: CopyVariant[] };
    },
    onSuccess: (data) => {
      setVariants(data.variants);
    },
    onError: (err: any) => {
      toast({
        title: "Could not generate ad copy",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  const canRegenerate = trade.trim().length > 0;

  return (
    <Card
      className="flex flex-col gap-3 p-4"
      id="composer"
      data-testid="adflow-ad-copy-composer"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            AI ad-copy composer
          </h2>
          <p className="text-[11px] text-muted-foreground">
            3 variants scored on predicted performance — pick a winner.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="composer-trade" className="text-[11px]">
            What trade?
          </Label>
          <Input
            id="composer-trade"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            placeholder="e.g. plumbing"
            className="h-8 text-xs"
            data-testid="composer-trade"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="composer-offer" className="text-[11px]">
            Offer (optional)
          </Label>
          <Input
            id="composer-offer"
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="$49 drain cleaning special"
            className="h-8 text-xs"
            data-testid="composer-offer"
          />
        </div>
      </div>

      {variants.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-6 text-center">
          <Sparkles className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Generate 3 fresh ad-copy variants tuned to your trade.
          </p>
          <Button
            size="sm"
            onClick={() => generate.mutate()}
            disabled={!canRegenerate || generate.isPending}
            data-testid="composer-generate"
          >
            {generate.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Generate 3 variants
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {variants.map((v) => (
              <VariantCard
                key={v.id}
                variant={v}
                onUse={async () => {
                  await onUseVariant?.(v);
                }}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              data-testid="composer-regenerate"
            >
              {generate.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              )}
              Regenerate all 3
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function VariantCard({
  variant,
  onUse,
}: {
  variant: CopyVariant;
  onUse: () => Promise<void>;
}) {
  const [using, setUsing] = useState(false);
  return (
    <Card
      className="flex flex-col gap-2 p-3"
      data-testid={`copy-variant-${variant.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {variant.headline}
        </h3>
        <KpiGauge
          value={variant.predictedScore}
          max={100}
          size="sm"
          label="Predicted score"
          unit="/100"
          color="auto"
        />
      </div>
      <p className="text-xs text-muted-foreground">{variant.body}</p>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          CTA: {variant.cta}
        </span>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={using}
          onClick={async () => {
            setUsing(true);
            try {
              await onUse();
            } finally {
              setUsing(false);
            }
          }}
          data-testid={`copy-variant-use-${variant.id}`}
        >
          {using ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          )}
          Use this variant
        </Button>
      </div>
    </Card>
  );
}
