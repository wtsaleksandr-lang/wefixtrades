/**
 * LiveCallMonitor — TradeLine UI upgrade Wave 26.
 *
 * Right-rail panel showing currently-active TradeLine calls in real time.
 * Polls /api/portal/tradeline/active-calls every 5s. Each active call
 * card shows:
 *  - Masked caller phone
 *  - Elapsed seconds (ticking client-side between polls)
 *  - Pure-CSS animated waveform (8 vertical bars, randomised heights)
 *  - Live transcript (last 8 utterances, karaoke-style — most recent
 *    line is highlighted)
 *  - Sentiment pill (positive / neutral / negative)
 *  - "Listen in" button (admin only — surfaced when listenUrl present)
 *
 * Empty state: "All quiet. Last call ended X minutes ago." matching the
 * spec.
 *
 * Privacy: per CLAUDE.md anti-pattern rules — no live audio playback in
 * the client portal, no raw VAPI key client-side. The "Listen in" button
 * opens the Vapi-supplied URL in a new tab (audio playback happens in
 * Vapi's own page, gated by their auth).
 *
 * No raw hex, semantic tokens only. Waveform respects prefers-reduced-motion
 * (snaps to a static bar pattern when reduced).
 */

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Headphones, Mic, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/visual-primitives";

export interface ActiveCallSummary {
  callId: string;
  vapiAssistantId: string;
  startedAt: string | null;
  secondsElapsed: number;
  callerMasked: string;
  sentiment: "positive" | "neutral" | "negative";
  recentTranscript: Array<{ role: string; text: string }>;
  listenUrl: string | null;
}

export interface LiveCallMonitorProps {
  calls: ActiveCallSummary[];
  lastEndedAgoMinutes: number | null;
  upstreamError?: string | null;
  isAdmin?: boolean;
  className?: string;
}

const SENTIMENT_TO_STATUS: Record<
  ActiveCallSummary["sentiment"],
  { status: "approved" | "draft" | "failed"; label: string }
> = {
  positive: { status: "approved", label: "Positive" },
  neutral: { status: "draft", label: "Neutral" },
  negative: { status: "failed", label: "Negative" },
};

/** Waveform — 8 vertical bars that scale-y between 0.2 and 1 on a stagger. */
function Waveform({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const bars = Array.from({ length: 10 });
  return (
    <div
      aria-hidden="true"
      className="flex h-6 items-center gap-[2px]"
      data-testid="live-call-waveform"
    >
      {bars.map((_, i) => (
        <span
          key={i}
          className={cn(
            "block w-[3px] rounded-full bg-[hsl(var(--chart-1))]",
            active && !reduceMotion ? "tl-waveform-bar" : "h-1/2",
          )}
          style={
            active && !reduceMotion
              ? ({
                  animationDelay: `${i * 80}ms`,
                  animationDuration: `${600 + ((i * 37) % 400)}ms`,
                } as React.CSSProperties)
              : undefined
          }
        />
      ))}
      <style>{`
        @keyframes tl-waveform-pulse {
          0%, 100% { height: 18%; }
          50% { height: 100%; }
        }
        .tl-waveform-bar {
          height: 18%;
          animation-name: tl-waveform-pulse;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .tl-waveform-bar { animation: none; height: 50%; }
        }
      `}</style>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function LiveCallMonitor({
  calls,
  lastEndedAgoMinutes,
  upstreamError,
  isAdmin,
  className,
}: LiveCallMonitorProps) {
  // Client-side seconds ticker — keeps the "1:23" elapsed counters smooth
  // between 5s polls.
  const [tickOffset, setTickOffset] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTickOffset((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hasCalls = calls.length > 0;
  const lastEndedLabel = useMemo(() => {
    if (lastEndedAgoMinutes == null) return null;
    if (lastEndedAgoMinutes < 1) return "less than a minute ago";
    if (lastEndedAgoMinutes < 60) return `${lastEndedAgoMinutes} minute${lastEndedAgoMinutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(lastEndedAgoMinutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }, [lastEndedAgoMinutes]);

  return (
    <aside
      className={cn(
        "flex flex-col rounded-lg border bg-card p-4",
        className,
      )}
      data-testid="live-call-monitor"
      aria-label="Live call monitor"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-[hsl(var(--chart-1))]" aria-hidden="true" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Live calls
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide",
            hasCalls
              ? "text-[hsl(var(--chart-2))]"
              : "text-muted-foreground/70",
          )}
        >
          <span
            className={cn(
              "inline-block h-3 w-3 rounded-full",
              hasCalls
                ? "bg-[hsl(var(--chart-2))] motion-safe:animate-pulse"
                : "bg-muted-foreground/40",
            )}
            aria-hidden="true"
          />
          {hasCalls ? `${calls.length} active` : "Idle"}
        </span>
      </div>

      {upstreamError && (
        <p className="mb-3 rounded-md border border-[color:hsl(var(--chart-4)/0.4)] bg-[hsl(var(--chart-4)/0.08)] p-2 text-[11px] text-muted-foreground">
          Live data unavailable — {upstreamError}. The widget will retry
          automatically.
        </p>
      )}

      {!hasCalls ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[color:var(--border)] py-8 text-center">
          <Volume2 className="h-5 w-5 text-muted-foreground/70" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground">All quiet.</p>
          {lastEndedLabel ? (
            <p className="text-[11px] text-muted-foreground/70">
              Last call ended {lastEndedLabel}.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              When a call comes in, you'll see it live here.
            </p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-[2px]">
          {calls.map((c) => {
            const elapsed = c.secondsElapsed + tickOffset;
            const sentiment = SENTIMENT_TO_STATUS[c.sentiment];
            const lastUtterance = c.recentTranscript[c.recentTranscript.length - 1];
            return (
              <li
                key={c.callId}
                className="rounded-md border bg-muted/10 p-3"
                data-testid={`live-call-${c.callId}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold tabular-nums">
                      {c.callerMasked}
                    </span>
                    <span className="text-[11px] text-muted-foreground/80">
                      {formatElapsed(elapsed)} elapsed
                    </span>
                  </div>
                  <Waveform active />
                </div>

                <div className="mt-2 max-h-24 overflow-y-auto rounded-sm bg-muted/30 p-2">
                  {c.recentTranscript.length === 0 ? (
                    <p className="text-[11px] italic text-muted-foreground/70">
                      Listening — transcript will appear here…
                    </p>
                  ) : (
                    c.recentTranscript.map((m, i, arr) => {
                      const isLatest = i === arr.length - 1;
                      return (
                        <p
                          key={i}
                          className={cn(
                            "mb-1 text-[11px] leading-snug last:mb-0",
                            m.role === "assistant"
                              ? "text-[hsl(var(--chart-1))]"
                              : "text-foreground",
                            isLatest && "font-semibold",
                          )}
                        >
                          <span className="mr-1 text-muted-foreground/70">
                            {m.role === "assistant" ? "AI" : "Caller"}:
                          </span>
                          {m.text}
                        </p>
                      );
                    })
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <StatusPill
                    status={sentiment.status}
                    label={sentiment.label}
                  />
                  {isAdmin && c.listenUrl ? (
                    <a
                      href={c.listenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:hsl(var(--ring))]"
                      data-testid={`listen-in-${c.callId}`}
                    >
                      <Headphones className="h-3 w-3" aria-hidden="true" />
                      Listen in
                    </a>
                  ) : null}
                </div>

                {lastUtterance && (
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    Updated as the call progresses.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

export default LiveCallMonitor;
