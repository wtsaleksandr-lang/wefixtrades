import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Code, Copy, CheckCircle2, Lock, Loader2, Star, ExternalLink, ChevronLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* Q3: small reusable back-to-parent link. Mirrors the pattern used by
   PortalServiceDetail / PortalTicketDetail / PaymentMethodsPage. */
function BackToReviews() {
  return (
    <Link
      href="/portal/reviews"
      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
      data-testid="back-to-reviews"
    >
      <ChevronLeft className="w-3.5 h-3.5" /> Back to Reviews
    </Link>
  );
}

interface WidgetData {
  active: boolean;
  widgetToken?: string;
  badgeAccess?: boolean;
  carouselAccess?: boolean;
  widgetAccess?: boolean;
  settings?: {
    enabled: boolean;
    type: string;
    min_rating: number;
    max_reviews: number;
    show_reviewer_name: boolean;
    show_date: boolean;
  };
  embedCode?: {
    badge: string;
    carousel: string | null;
  };
}

export default function PortalWidget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery<WidgetData>({
    queryKey: ["/api/portal/reputation/widget"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/widget", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await apiRequest("PATCH", "/api/portal/reputation/widget", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reputation/widget"] });
      toast({ title: "Widget settings saved" });
    },
  });

  function copyCode(code: string, label: string) {
    navigator.clipboard.writeText(code);
    setCopied(label);
    toast({ title: "Embed code copied" });
    setTimeout(() => setCopied(null), 3000);
  }

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </PortalLayout>
    );
  }

  if (!data?.active) {
    return (
      <PortalLayout>
        <div className="max-w-5xl mx-auto space-y-4">
          <BackToReviews />
        </div>
        <div className="max-w-5xl mx-auto py-12 text-center space-y-4">
          <Code className="w-12 h-12 text-gray-300 mx-auto" />
          <h2 className="text-lg font-semibold text-gray-900">Review Widget</h2>
          <p className="text-sm text-gray-500">Display your best reviews on your website. Available with ReputationShield.</p>
        </div>
      </PortalLayout>
    );
  }

  const settings = data.settings!;
  const embedCode = data.embedCode!;

  return (
    <PortalLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <BackToReviews />
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Review Widget</h2>
          <p className="text-sm text-gray-500">Show your best reviews on your website with a simple code snippet</p>
        </div>

        {/* How it works */}
        <Card className="p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">How it works</p>
          <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
            <li>Copy the embed code below</li>
            <li>Paste it into your website where you want reviews to appear</li>
            <li>Your best reviews show up automatically and stay up to date</li>
          </ol>
        </Card>

        {/* Widget toggle */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Widget Enabled</p>
              <p className="text-xs text-gray-400">When disabled, the widget won't show on your site</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.enabled}
              aria-label="Toggle widget enabled"
              className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2D6A4F]/30 ${settings.enabled ? "bg-[#2D6A4F]" : "bg-gray-300"}`}
              onClick={() => updateMutation.mutate({ enabled: !settings.enabled })}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.enabled ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
        </Card>

        {/* Badge Widget */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Badge Widget</p>
              <p className="text-xs text-gray-400">Compact rating summary — great for headers, sidebars, or footers</p>
            </div>
            <Badge variant="secondary" className="text-[10px] bg-green-50 text-green-700">Available</Badge>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-600 break-all select-all">
            {embedCode.badge}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => copyCode(embedCode.badge, "badge")}
          >
            {copied === "badge" ? (
              <><CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Copied</>
            ) : (
              <><Copy className="w-3.5 h-3.5 mr-1" /> Copy Badge Code</>
            )}
          </Button>
        </Card>

        {/* Carousel Widget */}
        <Card className={`p-4 space-y-3 ${!data.carouselAccess ? "opacity-70" : ""}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Carousel Widget</p>
              <p className="text-xs text-gray-400">Rotating reviews with star ratings and text — great for landing pages</p>
            </div>
            {data.carouselAccess ? (
              <Badge variant="secondary" className="text-[10px] bg-green-50 text-green-700">Available</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] bg-gray-100 text-gray-500">
                <Lock className="w-3 h-3 mr-1" /> Pro Plan
              </Badge>
            )}
          </div>
          {data.carouselAccess && embedCode.carousel ? (
            <>
              <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-600 break-all select-all">
                {embedCode.carousel}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => copyCode(embedCode.carousel!, "carousel")}
              >
                {copied === "carousel" ? (
                  <><CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Copied</>
                ) : (
                  <><Copy className="w-3.5 h-3.5 mr-1" /> Copy Carousel Code</>
                )}
              </Button>
            </>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-2 text-sm text-gray-500">
              <Lock className="w-4 h-4 shrink-0" />
              Carousel widget is available on the Pro plan. Upgrade to access rotating review displays.
            </div>
          )}
        </Card>

        {/* Settings */}
        <Card className="p-4 space-y-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Widget Settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Minimum Star Rating</label>
              <Select
                value={String(settings.min_rating)}
                onValueChange={(v) => updateMutation.mutate({ min_rating: parseInt(v) })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 stars only</SelectItem>
                  <SelectItem value="4">4+ stars</SelectItem>
                  <SelectItem value="3">3+ stars</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Max Reviews Shown</label>
              <Select
                value={String(settings.max_reviews)}
                onValueChange={(v) => updateMutation.mutate({ max_reviews: parseInt(v) })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 reviews</SelectItem>
                  <SelectItem value="10">10 reviews</SelectItem>
                  <SelectItem value="20">20 reviews</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between sm:col-span-2">
              <div>
                <p className="text-sm text-gray-700">Show Reviewer Names</p>
                <p className="text-xs text-gray-400">Display the name of each reviewer</p>
              </div>
              <button
                role="switch"
                aria-checked={settings.show_reviewer_name}
                aria-label="Toggle show reviewer names"
                className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2D6A4F]/30 ${settings.show_reviewer_name ? "bg-[#2D6A4F]" : "bg-gray-300"}`}
                onClick={() => updateMutation.mutate({ show_reviewer_name: !settings.show_reviewer_name })}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.show_reviewer_name ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between sm:col-span-2">
              <div>
                <p className="text-sm text-gray-700">Show Review Dates</p>
                <p className="text-xs text-gray-400">Display when each review was posted</p>
              </div>
              <button
                role="switch"
                aria-checked={settings.show_date}
                aria-label="Toggle show review dates"
                className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2D6A4F]/30 ${settings.show_date ? "bg-[#2D6A4F]" : "bg-gray-300"}`}
                onClick={() => updateMutation.mutate({ show_date: !settings.show_date })}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.show_date ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
          </div>
        </Card>
      </div>
    </PortalLayout>
  );
}
