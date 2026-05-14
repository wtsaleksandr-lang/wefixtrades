/**
 * Three-option choice card for the tradeline phone-number setup wizard.
 *
 * Default-expanded: Option A (get a new number).
 * Other two cards are collapsed with "Show details". Clicking a collapsed
 * card expands it AND collapses the previously-open card (radio-style).
 */

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  PhoneCall,
  ArrowRightLeft,
  Repeat,
  Check,
  ChevronDown,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { TradelineSetupMode } from "@shared/schema";

interface OptionConfig {
  key: TradelineSetupMode;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  tag?: { text: string; tone: "recommended" };
  timeToActive: string;
  cost: string;
  bullets: string[];
  youHandle: string[];
  weHandle: string[];
}

const OPTIONS: OptionConfig[] = [
  {
    key: "new",
    title: "Get a new WeFixTrades number",
    subtitle: "We assign you a fresh local or toll-free number, ready in seconds.",
    icon: PhoneCall,
    tag: { text: "Recommended", tone: "recommended" },
    timeToActive: "Immediate",
    cost: "Included in your plan",
    bullets: [
      "We pick a local or toll-free number based on your service area.",
      "Number is live in seconds and connected to your AI assistant.",
      "Update your Google Business Profile, website, and invoices over ~30 days.",
      "Customers reach AI 24/7 — no missed calls.",
    ],
    youHandle: [
      "Update your business listings over a month",
      "Hand out the new number on business cards",
    ],
    weHandle: [
      "Number provisioning and carrier paperwork",
      "Connecting it to your AI assistant",
      "Template copy + a 30-day checklist",
    ],
  },
  {
    key: "forward",
    title: "Keep your existing number",
    subtitle: "Forward unanswered calls to your AI. Customers never see a new number.",
    icon: ArrowRightLeft,
    timeToActive: "About 5 minutes",
    cost: "Included in your plan",
    bullets: [
      "We give you a hidden WeFixTrades number — your customers never see it.",
      "We detect your carrier and show the exact code to dial.",
      "One tap activates conditional call forwarding on your phone.",
      "A test call verifies forwarding is working before you finish.",
    ],
    youHandle: [
      "Tap once to dial the activation code",
      "Pick up the test call to confirm",
    ],
    weHandle: [
      "Carrier detection and the right code for your network",
      "Number provisioning behind the scenes",
      "Test call to verify it's all wired up",
    ],
  },
  {
    key: "port",
    title: "Port your existing number into WeFixTrades",
    subtitle: "Your number becomes a WeFixTrades number with full AI integration.",
    icon: Repeat,
    timeToActive: "1–3 weeks",
    cost: "Included in your plan",
    bullets: [
      "Your existing number is transferred to WeFixTrades.",
      "Full AI integration on the number your customers already know.",
      "We submit the port to your current carrier on your behalf.",
      "Your existing number keeps working normally during the transfer.",
      "Note: you'll lose the ability to text personally from this number.",
    ],
    youHandle: [
      "Upload a recent phone bill (PDF or photo)",
      "E-sign the Letter of Authorization in the app",
      "Wait 1–3 weeks while your carrier processes the port",
    ],
    weHandle: [
      "Twilio porting submission and paperwork",
      "Status tracking with email updates",
      "Activation when the port completes",
    ],
  },
];

export interface ChoiceCardProps {
  onContinue: (mode: TradelineSetupMode) => void;
  isContinuing?: boolean;
}

export function ChoiceCard({ onContinue, isContinuing = false }: ChoiceCardProps) {
  const [openId, setOpenId] = useState<TradelineSetupMode>("new");

  return (
    <div className="space-y-3">
      {OPTIONS.map((opt) => {
        const isOpen = openId === opt.key;

        return (
          <Collapsible
            key={opt.key}
            open={isOpen}
            onOpenChange={(open) => {
              if (open) setOpenId(opt.key);
            }}
          >
            <div
              className={cn(
                "rounded-xl border bg-white transition-colors",
                isOpen
                  ? "border-indigo-500 ring-2 ring-indigo-100"
                  : "border-gray-200 hover:border-gray-300",
              )}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full text-left p-4 flex items-start gap-3"
                  aria-expanded={isOpen}
                >
                  <div
                    className={cn(
                      "p-2 rounded-lg flex-shrink-0",
                      isOpen ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600",
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
                      <span aria-hidden="true">•</span>
                      <span>{opt.cost}</span>
                    </div>
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
                <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-4">
                  <ul className="space-y-1.5 text-sm text-gray-700">
                    {opt.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <p className="text-xs font-semibold text-blue-900 mb-1.5 uppercase tracking-wide">
                        What you do
                      </p>
                      <ul className="space-y-1 text-xs text-blue-800">
                        {opt.youHandle.map((y, i) => (
                          <li key={i}>• {y}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-900 mb-1.5 uppercase tracking-wide">
                        What we handle
                      </p>
                      <ul className="space-y-1 text-xs text-gray-700">
                        {opt.weHandle.map((w, i) => (
                          <li key={i}>• {w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => onContinue(opt.key)}
                    disabled={isContinuing}
                  >
                    {isContinuing ? "Loading…" : continueLabel(opt.key)}
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

function continueLabel(mode: TradelineSetupMode): string {
  if (mode === "new") return "Continue — get a new number";
  if (mode === "forward") return "Continue — forward my existing number";
  return "Continue — port my existing number";
}
