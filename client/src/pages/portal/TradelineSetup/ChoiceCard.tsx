/**
 * Three-option choice card for the tradeline phone-number setup wizard.
 *
 * Default-expanded: Option C (port) — the recommended path for serious
 * businesses (Wave 87). Other two cards are collapsed with "Show details".
 * Clicking a collapsed card expands it AND collapses the previously-open
 * card (radio-style).
 *
 * Wave 87 — copy rewrite. Each card now leads with a clear tradeoff
 * narrative:
 *   - mode "new"     → fastest, requires updating business listings
 *   - mode "forward" → voice forwards, SMS does NOT (two-number problem)
 *   - mode "port"    → recommended; keep number forever; 1-4 weeks
 *
 * "Important tradeoff" lines that exceed the card real estate are surfaced
 * via a small "?" trigger using the existing Radix Tooltip primitive
 * (mounted globally in App.tsx — no new dependency).
 */

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PhoneCall,
  ArrowRightLeft,
  Repeat,
  Check,
  X,
  ChevronDown,
  Clock,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { TradelineSetupMode } from "@shared/schema";

/* ── Tradeoff line — text plus optional tooltip detail for deeper context. */
interface TradeoffLine {
  tone: "good" | "bad" | "neutral";
  text: string;
  tooltip?: string;
}

interface OptionConfig {
  key: TradelineSetupMode;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  tag?: { text: string; tone: "recommended" };
  timeToActive: string;
  bestFor: string;
  /** Heading shown above the tradeoff list. */
  tradeoffsLabel: string;
  tradeoffs: TradeoffLine[];
  /** Optional note rendered at the bottom of the expanded card. */
  note?: string;
  /** When-to-choose hint shown below tradeoffs (forward mode). */
  whenToChoose?: string;
}

const OPTIONS: OptionConfig[] = [
  {
    key: "new",
    title: "Get a new dedicated business number",
    subtitle: "We assign you a fresh local or toll-free number, ready in seconds.",
    icon: PhoneCall,
    timeToActive: "Live in 5 minutes",
    bestFor: "Starting fresh, or if you don't mind updating your Google Business / website",
    tradeoffsLabel: "Includes",
    tradeoffs: [
      { tone: "good", text: "Your AI receptionist answers" },
      { tone: "good", text: "SMS automation works immediately" },
      { tone: "good", text: "Pick a number with your area code" },
    ],
    note:
      "You'll keep your personal number for personal calls. We just give you a dedicated line for business.",
  },
  {
    key: "forward",
    title: "Forward your existing number",
    subtitle: "Forward unanswered calls to your AI. Customers never see a new number for voice.",
    icon: ArrowRightLeft,
    timeToActive: "~10 minutes to set up",
    bestFor: "Trades who want to keep their existing voice line without porting",
    tradeoffsLabel: "Important tradeoff",
    tradeoffs: [
      { tone: "good", text: "Voice calls forward perfectly to our AI" },
      {
        tone: "bad",
        text: "SMS doesn't forward — customers can't text your existing number",
        tooltip:
          "SMS forwarding is not supported by carriers the way voice call-forwarding is. Customer texts to your existing number stay on your personal phone — they don't reach the AI.",
      },
      {
        tone: "bad",
        text: "Automated SMS replies come from a new number your customers haven't seen before",
        tooltip:
          "When the AI sends an SMS (appointment confirmation, follow-up), it goes out from a separate WeFixTrades number. To the customer, that's a different sender than the number they called.",
      },
      {
        tone: "neutral",
        text: "Net result: customers see two different numbers from you (voice vs. text)",
        tooltip:
          "Voice goes to your existing number (forwarded to AI). Text goes to a new WeFixTrades number. Some customers will be confused by the mismatch.",
      },
    ],
    whenToChoose:
      "Choose this only if you're trying it temporarily, or your business doesn't rely on SMS.",
  },
  {
    key: "port",
    title: "Keep your existing number forever",
    subtitle: "Port your number into WeFixTrades. Voice and SMS both work after the port completes.",
    icon: Repeat,
    tag: { text: "Recommended", tone: "recommended" },
    timeToActive: "1-4 weeks for the port to complete",
    bestFor: "Established trades who want zero customer confusion",
    tradeoffsLabel: "The good",
    tradeoffs: [
      { tone: "good", text: "Customers keep using your existing number for everything" },
      { tone: "good", text: "Voice AND SMS both work after porting completes" },
      { tone: "good", text: "You own the number permanently — no carrier lock-in" },
      {
        tone: "good",
        text: "We handle 100% of the paperwork",
        tooltip:
          "Our AI extracts the carrier info from your phone bill, generates the Letter of Authorization, submits the port to Twilio, and tracks progress through every milestone.",
      },
      {
        tone: "good",
        text: "Free — we cover Twilio's porting fee",
      },
      {
        tone: "bad",
        text: "7-14 business days for carrier processing",
        tooltip:
          "Number porting is regulated by the FCC / CRTC. The 7-14 business day window is set by your current carrier and the receiving carrier — we can't speed this up.",
      },
      {
        tone: "neutral",
        text: "We send SMS + email updates at every milestone",
      },
      {
        tone: "neutral",
        text: "During the wait, we set up call forwarding from a new number you can use immediately",
        tooltip:
          "While the port is processing, your existing number stays with your old carrier. We give you a temporary WeFixTrades number you can hand out today, then auto-switch on port completion.",
      },
    ],
    note:
      "Your existing carrier might charge a small final bill (last month's service). After they're paid, the port completes.",
  },
];

export interface ChoiceCardProps {
  onContinue: (mode: TradelineSetupMode) => void;
  isContinuing?: boolean;
}

export function ChoiceCard({ onContinue, isContinuing = false }: ChoiceCardProps) {
  /* Wave 87: default-open the recommended option (port). */
  const [openId, setOpenId] = useState<TradelineSetupMode>("port");

  return (
    <div className="space-y-3">
      {OPTIONS.map((opt) => {
        const isOpen = openId === opt.key;
        const isRecommended = opt.tag?.tone === "recommended";

        return (
          <Collapsible
            key={opt.key}
            open={isOpen}
            onOpenChange={(open: boolean) => {
              if (open) setOpenId(opt.key);
            }}
          >
            <div
              className={cn(
                "rounded-xl border bg-white transition-colors",
                isOpen
                  ? isRecommended
                    ? "border-emerald-500 ring-2 ring-emerald-100"
                    : "border-brand-blue-500 ring-2 ring-brand-blue-100"
                  : isRecommended
                    ? "border-emerald-300 hover:border-emerald-400"
                    : "border-gray-200 hover:border-gray-300",
              )}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full text-left p-4 flex items-start gap-3"
                  aria-expanded={isOpen}
                  data-testid={`choice-card-${opt.key}`}
                >
                  <div
                    className={cn(
                      "p-2 rounded-lg flex-shrink-0",
                      isOpen
                        ? isRecommended
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-brand-blue-100 text-brand-blue-700"
                        : "bg-gray-100 text-gray-600",
                    )}
                  >
                    <opt.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{opt.title}</h3>
                      {opt.tag && (
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded",
                            opt.tag.tone === "recommended" && "bg-emerald-100 text-emerald-800",
                          )}
                        >
                          {opt.tag.text}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{opt.subtitle}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {opt.timeToActive}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-600">
                      <span className="font-semibold text-gray-700">Best for: </span>
                      {opt.bestFor}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-gray-400 flex-shrink-0 transition-transform mt-1",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent
                className={cn(
                  "overflow-hidden",
                  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1",
                  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1",
                )}
              >
                <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                    {opt.tradeoffsLabel}
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-700">
                    {opt.tradeoffs.map((line, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <TradeoffIcon tone={line.tone} />
                        <span className="flex-1 flex items-start gap-1.5">
                          <span>{line.text}</span>
                          {line.tooltip && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`More detail: ${line.text}`}
                                  className="text-gray-400 hover:text-gray-600 focus:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-400 rounded-full flex-shrink-0 mt-0.5"
                                  data-testid={`tradeoff-tooltip-${opt.key}-${i}`}
                                >
                                  <HelpCircle className="w-3 h-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="max-w-xs text-xs leading-snug"
                              >
                                {line.tooltip}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {opt.whenToChoose && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="font-semibold">When to choose this: </span>
                      {opt.whenToChoose}
                    </p>
                  )}

                  {opt.note && (
                    <p className="text-xs text-gray-600 leading-relaxed">{opt.note}</p>
                  )}

                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => onContinue(opt.key)}
                    disabled={isContinuing}
                    data-testid={`choice-card-${opt.key}-continue`}
                  >
                    {isContinuing ? "Loading…" : `Choose this — ${chooseLabel(opt.key)}`}
                  </Button>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}

function TradeoffIcon({ tone }: { tone: TradeoffLine["tone"] }) {
  if (tone === "good") {
    return <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" aria-hidden="true" />;
  }
  if (tone === "bad") {
    return <X className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" aria-hidden="true" />;
  }
  return (
    <span
      className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center text-gray-400"
      aria-hidden="true"
    >
      •
    </span>
  );
}

function chooseLabel(mode: TradelineSetupMode): string {
  if (mode === "new") return "get a new number";
  if (mode === "forward") return "forward my existing number";
  return "keep my existing number";
}
