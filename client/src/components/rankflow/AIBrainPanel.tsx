/**
 * AIBrainPanel — visible AI reasoning surface (Wave 24).
 *
 * The UNIQUE differentiator. Competitors (Surfer, Scalenut, Frase) hide
 * their model output behind a "generate" button — RankFlow surfaces the
 * decision, the rationale, the source data, and the 1-click action.
 *
 * Renders only when a fully-populated recommendation exists. No
 * "AI is thinking…" placeholder — if the reasoning chain isn't ready the
 * panel shows an empty state instead.
 *
 * Behaviour:
 *  - Header: "Why RankFlow chose this"
 *  - List of recommendations, each with decision + bulleted rationale
 *  - Source chips (Search Console / SerpAware / DataForSEO)
 *  - "Generate article" button — confirmation gated; calls back into the
 *    portal API. The dashboard wires the dispatch mutation.
 *
 * No raw hex. Chart tokens via Tailwind.
 */

import { useState } from "react";
import {
  Brain,
  Database,
  Dot,
  Globe,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type AIBrainSource = "search_console" | "serp_aware" | "data_for_seo";

export interface AIBrainRecommendation {
  id: string;
  decision: string;
  reasoning: string[];
  sources: AIBrainSource[];
  action: {
    kind: "generate_article";
    label: string;
    topic: string;
    targetKeyword: string;
  } | null;
}

const SOURCE_META: Record<
  AIBrainSource,
  { label: string; icon: typeof Database }
> = {
  search_console: { label: "Search Console", icon: Globe },
  serp_aware: { label: "SerpAware", icon: Sparkles },
  data_for_seo: { label: "DataForSEO", icon: Database },
};

export interface AIBrainPanelProps {
  recommendations: AIBrainRecommendation[];
  isLoading?: boolean;
  /** Called when user confirms a "generate article" action. */
  onDispatch?: (input: {
    topic: string;
    targetKeyword: string;
  }) => Promise<void> | void;
  className?: string;
}

export function AIBrainPanel({
  recommendations,
  isLoading,
  onDispatch,
  className,
}: AIBrainPanelProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // Hard rule from the wave spec: never render "AI is thinking" placeholder.
  // If we're loading AND have no prior data, show a quiet empty state.
  const showEmpty = !isLoading && recommendations.length === 0;
  const showLoading = isLoading && recommendations.length === 0;

  const handleClick = async (rec: AIBrainRecommendation) => {
    if (!rec.action || !onDispatch) return;
    if (confirming !== rec.id) {
      setConfirming(rec.id);
      return;
    }
    setDispatchingId(rec.id);
    try {
      await onDispatch({
        topic: rec.action.topic,
        targetKeyword: rec.action.targetKeyword,
      });
    } finally {
      setDispatchingId(null);
      setConfirming(null);
    }
  };

  return (
    <Card
      className={`p-4 ${className ?? ""}`}
      data-testid="ai-brain-panel"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="rounded-md bg-[hsl(var(--chart-1)/0.12)] p-2">
          <Brain className="h-5 w-5 text-[hsl(var(--chart-1))]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Why RankFlow chose this</div>
          <div className="text-xs text-muted-foreground">
            Live recommendations from the SerpAware brain. Click to act.
          </div>
        </div>
      </div>

      {showLoading ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          Pulling fresh signals…
        </div>
      ) : null}

      {showEmpty ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <div className="text-sm font-medium mb-1">No new actions right now</div>
          <div className="text-xs text-muted-foreground">
            All tracked keywords are either ranking well or queued for work.
          </div>
        </div>
      ) : null}

      {!showLoading && !showEmpty ? (
        <ul className="space-y-3">
          {recommendations.map((rec) => {
            const isConfirming = confirming === rec.id;
            const isDispatching = dispatchingId === rec.id;
            return (
              <li
                key={rec.id}
                className="rounded-md border p-3 space-y-2"
                data-testid={`ai-brain-rec-${rec.id}`}
              >
                <div className="text-sm font-medium text-foreground">
                  {rec.decision}
                </div>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {rec.reasoning.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Dot
                        className="h-4 w-4 text-[hsl(var(--chart-1))] flex-shrink-0 -mx-1"
                        aria-hidden="true"
                      />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                  <div className="flex flex-wrap gap-1">
                    {rec.sources.map((s) => {
                      const meta = SOURCE_META[s];
                      const Icon = meta.icon;
                      return (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          data-testid={`ai-brain-source-${s}`}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      );
                    })}
                  </div>
                  {rec.action && onDispatch ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={isConfirming ? "default" : "outline"}
                      disabled={isDispatching}
                      onClick={() => handleClick(rec)}
                      className="h-7 text-xs"
                      data-testid={`ai-brain-dispatch-${rec.id}`}
                    >
                      {isDispatching ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Starting…
                        </>
                      ) : isConfirming ? (
                        "Confirm — generate"
                      ) : (
                        rec.action.label
                      )}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

export default AIBrainPanel;
