import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, Circle, Loader2, ChevronLeft, ArrowRight, Star,
  Link2, MessageSquare, QrCode,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";

/**
 * ReputationShield onboarding wizard.
 *
 * A guided setup checklist for a new ReputationShield subscriber.
 * Every step here is reachable individually elsewhere in the portal,
 * but a fresh customer needs one place that walks them through it in
 * order — connect Google, set how requests go out, grab a QR code.
 *
 * This is a checklist (not a hard-gated linear wizard): each step
 * shows done / to-do and is independently actionable. Connecting
 * Google is the one step that genuinely gates the product, so it's
 * surfaced first and most prominently.
 */

interface RepConfig {
  active: boolean;
  tier: string | null;
  settings: {
    channel_preference: "email" | "sms" | "auto";
    review_request_delay_hours: number;
  } | null;
}
interface GoogleStatus {
  oauthConfigured: boolean;
  connected: boolean;
  needsReconnect: boolean;
}
interface QrData {
  qrUrl: string;
  widgetToken: string;
}

export default function PortalReviewsSetup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading: configLoading } = useQuery<RepConfig>({
    queryKey: ["/api/portal/reputation/config"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/config", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
  const { data: google } = useQuery<GoogleStatus>({
    queryKey: ["/api/portal/reputation/google-status"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/google-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
  const { data: qr } = useQuery<QrData>({
    queryKey: ["/api/portal/reputation/qr"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/qr", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  /* ─ Step 2: request settings ─ */
  const [channel, setChannel] = useState<string>("auto");
  const [delay, setDelay] = useState<string>("2");

  useEffect(() => {
    if (config?.settings) {
      setChannel(config.settings.channel_preference || "auto");
      setDelay(String(config.settings.review_request_delay_hours ?? 2));
    }
  }, [config]);

  const saveSettings = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await apiRequest("PATCH", "/api/portal/reputation/settings", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reputation/config"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const [connecting, setConnecting] = useState(false);
  const connectGoogle = async () => {
    try {
      setConnecting(true);
      const res = await fetch("/api/portal/reputation/google-connect", { credentials: "include" });
      if (!res.ok) throw new Error("connect failed");
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch {
      setConnecting(false);
      toast({ title: "Couldn't start Google connection", variant: "destructive" });
    }
  };

  /* Register the wizard's fillable fields with the AI copilot. Applied
     fills land in local state; the customer still clicks Save. */
  useCopilotForm({
    formLabel: "ReputationShield setup wizard",
    fields: [
      { key: "channel", label: "Review-request channel (one of: auto, sms, email)" },
      { key: "delay", label: "Send delay after job (hours — one of: 0, 2, 24, 48)" },
    ],
    values: { channel, delay },
    onApply: (fills) => {
      for (const f of fills) {
        switch (f.field_key) {
          case "channel":
            if (["auto", "sms", "email"].includes(f.value)) setChannel(f.value);
            break;
          case "delay":
            if (["0", "2", "24", "48"].includes(String(f.value))) setDelay(String(f.value));
            break;
        }
      }
    },
    enabled: !!config?.active,
  });

  if (configLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </PortalLayout>
    );
  }

  if (!config?.active) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto py-12 text-center space-y-3">
          <Star className="w-12 h-12 text-gray-300 mx-auto" />
          <h2 className="text-lg font-semibold text-gray-900">ReputationShield setup</h2>
          <p className="text-sm text-gray-500">ReputationShield isn't active on your account yet.</p>
        </div>
      </PortalLayout>
    );
  }

  const googleConnected = !!google?.connected && !google?.needsReconnect;

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        <Link
          href="/portal/reviews"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Reviews
        </Link>

        <div>
          <h1 className="text-lg font-semibold text-gray-900">Set up ReputationShield</h1>
          <p className="text-sm text-gray-500">
            Three quick steps and your reviews start growing on autopilot.
          </p>
        </div>

        {/* ─ Step 1: Connect Google ─ */}
        <StepCard
          n={1}
          done={googleConnected}
          icon={Link2}
          title="Connect your Google Business Profile"
          desc="This is what lets us read your reviews and post replies. Takes about 30 seconds."
        >
          {google && !google.oauthConfigured ? (
            <p className="text-xs text-amber-600">Google connection is temporarily unavailable. Check back shortly.</p>
          ) : googleConnected ? (
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Google Business Profile connected
            </p>
          ) : (
            <Button size="sm" onClick={connectGoogle} disabled={connecting}>
              {connecting ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Connecting…</>
              ) : (
                <>{google?.needsReconnect ? "Reconnect Google" : "Connect Google"}</>
              )}
            </Button>
          )}
        </StepCard>

        {/* ─ Step 2: Request settings ─ */}
        <StepCard
          n={2}
          done={saveSettings.isSuccess}
          icon={MessageSquare}
          title="Choose how review requests go out"
          desc="After each completed job we ask the customer for a review. SMS gets 3–5× more responses than email."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Channel</label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (SMS, fall back to email)</SelectItem>
                  <SelectItem value="sms">SMS only</SelectItem>
                  <SelectItem value="email">Email only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Send delay after job</label>
              <Select value={delay} onValueChange={setDelay}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Immediately</SelectItem>
                  <SelectItem value="2">2 hours later</SelectItem>
                  <SelectItem value="24">Next day</SelectItem>
                  <SelectItem value="48">After 2 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 h-8"
            disabled={saveSettings.isPending}
            onClick={() => saveSettings.mutate({
              channel_preference: channel,
              review_request_delay_hours: parseInt(delay, 10),
            })}
          >
            {saveSettings.isPending ? "Saving…" : "Save request settings"}
          </Button>
        </StepCard>

        {/* ─ Step 3: QR code ─ */}
        <StepCard
          n={3}
          done={!!qr?.qrUrl}
          optional
          icon={QrCode}
          title="Get your QR code"
          desc="Print it on invoices or hand it to customers — they scan it to leave a review on the spot."
        >
          {qr?.qrUrl ? (
            <div className="flex items-center gap-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qr.qrUrl)}&margin=6`}
                alt="Your review QR code"
                className="rounded-lg border border-gray-200"
                width={120}
                height={120}
              />
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qr.qrUrl)}&margin=20&format=png`}
                download="review-qr-code.png"
                className="text-xs font-medium text-[#2D6A4F] hover:underline"
              >
                Download print version
              </a>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Your QR code will appear here once setup is ready.</p>
          )}
        </StepCard>

        {/* ─ Done ─ */}
        <Card className="p-5 bg-emerald-50/50 border-emerald-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">That's the setup.</p>
            <p className="text-xs text-gray-600 mt-0.5">
              {googleConnected
                ? "You're live — reviews and replies are running. Head to your dashboard."
                : "Connect Google above to go live. You can do the rest any time."}
            </p>
          </div>
          <Link href="/portal/reviews">
            <Button size="sm" className="bg-[#2D6A4F] hover:bg-[#1B4332]">
              Go to dashboard <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </Link>
        </Card>
      </div>
    </PortalLayout>
  );
}

/* ─── Step card ─── */
function StepCard({
  n, done, optional, icon: Icon, title, desc, children,
}: {
  n: number;
  done: boolean;
  optional?: boolean;
  icon: React.ElementType;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {done ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          ) : (
            <Circle className="w-6 h-6 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">
              Step {n}: {title}
            </h2>
            {optional && (
              <span className="text-[10px] uppercase tracking-wide text-gray-400">Optional</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">{desc}</p>
          {children}
        </div>
      </div>
    </Card>
  );
}
