/**
 * Entry page for the "install my chat widget for me" service.
 *
 * Pro tier: button creates the request directly + redirects to the
 *   onboarding form.
 * Starter tier: button opens Stripe Checkout for $79 one-time.
 *
 * If STRIPE_CHAT_INSTALL_PRICE_ID isn't configured server-side, falls
 * back to a "we'll reach out manually" message.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import PortalLayout from "@/components/portal/PortalLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, MessageSquare, Sparkles, AlertCircle } from "lucide-react";

interface IntentResponse {
  ok: boolean;
  requestId: number;
  path: "pro_direct" | "stripe_checkout" | "stripe_not_configured";
  redirectTo?: string;
  checkoutUrl?: string;
  message?: string;
}

const BENEFITS = [
  "We install the widget for you — no copy/paste, no developer needed",
  "Works on WordPress, Wix, Squarespace, Shopify, or custom websites",
  "Branded greeting + welcome message dialed in for your business",
  "Smart placement — bottom-right by default, customizable per page",
  "Test call from our team to confirm everything works",
  "Done within 1 business day of payment",
];

export default function ChatWidgetInstallEntry() {
  usePageTitle("Install chat widget");
  const [, setLocation] = useLocation();
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: async (): Promise<IntentResponse> => {
      const res = await fetch("/api/portal/tradeline/chat-widget/install/intent", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to start install");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.path === "pro_direct" && data.redirectTo) {
        setLocation(data.redirectTo);
      } else if (data.path === "stripe_checkout" && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.path === "stripe_not_configured") {
        setFallbackMsg(data.message || "We'll reach out manually.");
      }
    },
  });

  const cancelled = new URLSearchParams(window.location.search).get("cancelled") === "1";

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <BackButton to="/portal/tradeline/chat-widget" label="Back to chat widget" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Have us install your chat widget</h1>
          <p className="text-sm text-gray-600 mt-1">
            We'll add the WeFixTrades chat widget to your website for you. One-time service, included
            free on Pro or $79 on Starter.
          </p>
        </div>

        {cancelled && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">
                Checkout cancelled. No charge was made. You can start again any time.
              </p>
            </div>
          </Card>
        )}

        {fallbackMsg && (
          <Card className="p-4 border-blue-200 bg-blue-50">
            <p className="text-sm text-blue-900">{fallbackMsg}</p>
          </Card>
        )}

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-gray-900">What's included</h2>
          </div>
          <ul className="space-y-2 mb-5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-gray-700">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Price</p>
              <p className="text-2xl font-bold text-gray-900">
                $79 <span className="text-sm font-normal text-gray-500">one-time</span>
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                <Sparkles className="w-3 h-3 inline mr-0.5" /> Free on Pro tier (auto-detected)
              </p>
            </div>
            <Button
              type="button"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="start-install-request"
            >
              {startMutation.isPending ? "Starting…" : "Get started"}
            </Button>
          </div>

          {startMutation.error && (
            <p className="text-xs text-rose-700 mt-3">{(startMutation.error as Error).message}</p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-gray-900 mb-2">Prefer to install it yourself?</h3>
          <p className="text-sm text-gray-600 mb-3">
            We give every Starter and Pro account a copy/paste snippet you can drop into your site
            yourself — no install service required.
          </p>
          <Badge variant="outline" className="text-[10px]">
            Snippet on your TradeLine settings page (coming with the chat-widget launch)
          </Badge>
        </Card>
      </div>
    </PortalLayout>
  );
}
