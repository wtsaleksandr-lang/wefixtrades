/**
 * AnomalyBanner — AdFlow plain-language anomaly alerts (Wave 30).
 *
 * Renders 0-N anomaly banners at the top of the dashboard. Each banner:
 *   - severity: green / amber / red (color-coded)
 *   - plain-language headline + detail (no PMAX / CPA / "deviation" jargon)
 *   - 1-click action button: Investigate / Approve auto-pause / Dismiss
 *
 * The "Scorpion gap" closer per competitive research: "generic reports
 * with no real accountability". This surface shows accountability in
 * real-time, in language a tradesperson reads in 3 seconds.
 *
 * No raw hex — semantic tokens only.
 */

import { AlertTriangle, ArrowRight, CheckCircle2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AnomalySeverity = "info" | "amber" | "red";
export type AnomalyAction =
  | "investigate"
  | "approve-pause"
  | "approve-boost"
  | "dismiss";

export interface Anomaly {
  id: string;
  severity: AnomalySeverity;
  headline: string;
  detail: string;
  suggestedAction: AnomalyAction;
  actionId: string;
  campaignName?: string;
}

export interface AnomalyBannerProps {
  anomalies: Anomaly[];
  onAction: (anomaly: Anomaly, action: AnomalyAction) => void | Promise<void>;
  isMutating?: boolean;
}

const TONE_VAR: Record<AnomalySeverity, string> = {
  info: "var(--chart-2)",
  amber: "var(--chart-4)",
  red: "var(--chart-5)",
};

const ACTION_LABEL: Record<AnomalyAction, string> = {
  investigate: "Investigate",
  "approve-pause": "Approve auto-pause",
  "approve-boost": "Approve budget boost",
  dismiss: "Dismiss",
};

export function AnomalyBanner({ anomalies, onAction, isMutating }: AnomalyBannerProps) {
  if (anomalies.length === 0) {
    return (
      <Card
        className="flex items-center gap-2 p-3"
        style={{
          backgroundColor: "hsl(var(--chart-2) / 0.06)",
          borderColor: "hsl(var(--chart-2) / 0.3)",
        }}
        data-testid="anomaly-banner-all-clear"
      >
        <CheckCircle2
          className="h-4 w-4 text-[hsl(var(--chart-2))]"
          aria-hidden="true"
        />
        <p className="text-xs text-foreground">
          All campaigns look normal — no anomalies to review.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="anomaly-banner-stack">
      {anomalies.map((a) => (
        <AnomalyRow
          key={a.id}
          anomaly={a}
          onAction={onAction}
          isMutating={isMutating}
        />
      ))}
    </div>
  );
}

function AnomalyRow({
  anomaly,
  onAction,
  isMutating,
}: {
  anomaly: Anomaly;
  onAction: (a: Anomaly, act: AnomalyAction) => void | Promise<void>;
  isMutating?: boolean;
}) {
  const tone = TONE_VAR[anomaly.severity];

  return (
    <Card
      className={cn("flex flex-col gap-2 p-3 md:flex-row md:items-center md:gap-3")}
      style={{
        backgroundColor: `hsl(${tone} / 0.06)`,
        borderColor: `hsl(${tone} / 0.35)`,
      }}
      data-testid={`anomaly-row-${anomaly.id}`}
    >
      <div className="flex flex-1 items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: `hsl(${tone})` }}
          aria-hidden="true"
        />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-foreground">
            {anomaly.headline}
          </p>
          <p className="text-xs text-muted-foreground">{anomaly.detail}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-7 gap-1 px-2 text-xs"
          disabled={isMutating}
          onClick={() => onAction(anomaly, anomaly.suggestedAction)}
          data-testid={`anomaly-action-${anomaly.id}`}
        >
          {ACTION_LABEL[anomaly.suggestedAction]}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          disabled={isMutating}
          onClick={() => onAction(anomaly, "dismiss")}
          data-testid={`anomaly-dismiss-${anomaly.id}`}
          aria-label="Dismiss this anomaly"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}
