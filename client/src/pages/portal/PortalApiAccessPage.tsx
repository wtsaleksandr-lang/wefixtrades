/**
 * Portal API Access — /portal/api-access (Wave AJ-5)
 *
 * Customer-facing page for the public API platform. Two layouts:
 *
 *   A) NO active subscription → pricing comparison (5 tiers, monthly/annual
 *      toggle, loyalty-rate callout). Clicking a paid tier posts to AJ-3's
 *      /checkout endpoint and redirects to Stripe Checkout. The free
 *      ("Developer") tier creates a key immediately and reveals plaintext
 *      ONCE in a modal.
 *
 *   B) HAS active subscription → subscription card (tier, status, usage
 *      progress bar, period dates, manage/cancel buttons), keys table
 *      (rotate / revoke / generate), 30-day daily-calls line chart,
 *      and a 4-tab quickstart snippet card (curl/Node/Python/PHP).
 *
 * Backend (AJ-2, live):
 *   GET    /api/portal/api-keys
 *   POST   /api/portal/api-keys                     → { plaintext } ONCE
 *   POST   /api/portal/api-keys/:keyId/rotate        → { plaintext } ONCE
 *   DELETE /api/portal/api-keys/:keyId
 *   GET    /api/portal/api-keys/subscription
 *   GET    /api/portal/api-keys/usage
 *
 * Backend (AJ-3, in flight — contracts assumed):
 *   POST /api/portal/api-keys/checkout  { tier_id, interval } → { checkout_url }
 *   POST /api/portal/api-keys/portal                          → { portal_url }
 *   POST /api/portal/api-keys/cancel                          → { ok, will_cancel_at }
 *   POST /api/portal/api-keys/resume
 *   GET  /api/quotequick/api-tiers                            → { tiers: [...] }
 *
 * If AJ-3 hasn't landed yet the /checkout etc. POSTs will 404. The page
 * gracefully degrades — buttons show an error toast. The locked pricing
 * defined in LOCKED_TIERS below is the display source while AJ-3's
 * /api-tiers endpoint is unavailable.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Key, Copy, Check, AlertTriangle, RotateCw, Trash2, Plus,
  ExternalLink, Sparkles, Info,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

/* ─── Locked tier catalog (display source until AJ-3 /api-tiers ships) ─── */

interface DisplayTier {
  id: string;
  name: string;
  monthlyUsd: number;       // sticker price for monthly billing
  loyaltyMonthlyUsd?: number; // discounted price for QQ-paid loyalty
  monthlyQuota: number;     // calls/month
  calcsIncluded: string;    // "1 calc" / "Unlimited"
  features: string[];
  recommended?: boolean;
}

const LOCKED_TIERS: DisplayTier[] = [
  {
    id: "dev",
    name: "Developer",
    monthlyUsd: 0,
    monthlyQuota: 1_000,
    calcsIncluded: "1 calc",
    features: ["1,000 calls / month", "1 calculator", "Community support"],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyUsd: 49,
    loyaltyMonthlyUsd: 29,
    monthlyQuota: 25_000,
    calcsIncluded: "3 calcs",
    features: ["25,000 calls / month", "3 calculators", "Webhooks", "Email support"],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyUsd: 149,
    monthlyQuota: 150_000,
    calcsIncluded: "10 calcs",
    features: ["150,000 calls / month", "10 calculators", "Priority email", "Sandbox + production keys"],
    recommended: true,
  },
  {
    id: "business",
    name: "Business",
    monthlyUsd: 399,
    monthlyQuota: 750_000,
    calcsIncluded: "50 calcs",
    features: ["750,000 calls / month", "50 calculators", "99.9% SLA", "Multi-team keys"],
  },
  {
    id: "agency",
    name: "Agency",
    monthlyUsd: 999,
    monthlyQuota: 3_000_000,
    calcsIncluded: "Unlimited",
    features: ["3M calls / month", "Unlimited calculators", "Dedicated Slack", "Custom contracts"],
  },
];

// 17% annual discount → annual price = monthly * 12 * 0.83 rounded.
function annualEquivalentMonthly(monthlyUsd: number): number {
  if (monthlyUsd === 0) return 0;
  return Math.round(monthlyUsd * 0.83);
}

/* ─── API response shapes ─── */

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  tier: string;
  status: "active" | "revoked" | string;
  total_calls: number;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
}

interface SubscriptionResp {
  subscription: {
    id: string;
    tier: string;
    status: "trial" | "active" | "past_due" | "cancelled" | string;
    monthly_call_quota: number;
    monthly_calls_used: number;
    current_period_start: string;
    current_period_end: string;
    reset_at: string;
    cancel_at_period_end?: boolean;
    will_cancel_at?: string | null;
  };
  tier: { id: string; name: string; priceMonthly: number; priceAnnual: number; monthlyCallQuota: number } | null;
  usage_this_period: {
    calls_used: number;
    calls_quota: number;
    remaining: number;
    reset_at: string;
  };
  /** AJ-3 may add this — server tells us if the user qualifies for $29 loyalty */
  loyalty_eligible?: boolean;
}

interface UsageLog {
  id: string;
  created_at: string;
  status_code?: number;
}

/* ─── Helpers ─── */

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatRelative(s: string | null | undefined): string {
  if (!s) return "Never";
  try {
    const d = new Date(s).getTime();
    const diff = Date.now() - d;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(s);
  } catch {
    return "—";
  }
}

function progressColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function buildSnippet(lang: "curl" | "node" | "python" | "php", keyPrefix: string): string {
  const example = `${keyPrefix || "wfx_live_xxx"}...`;
  switch (lang) {
    case "curl":
      return `curl https://api.wefixtrades.com/v1/calculators \\
  -H "Authorization: Bearer ${example}" \\
  -H "Content-Type: application/json"`;
    case "node":
      return `const res = await fetch('https://api.wefixtrades.com/v1/calculators', {
  headers: { Authorization: 'Bearer ${example}' }
});
const data = await res.json();`;
    case "python":
      return `import requests

res = requests.get(
    "https://api.wefixtrades.com/v1/calculators",
    headers={"Authorization": "Bearer ${example}"},
)
data = res.json()`;
    case "php":
      return `<?php
$ch = curl_init("https://api.wefixtrades.com/v1/calculators");
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer ${example}",
    "Content-Type: application/json",
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$data = json_decode(curl_exec($ch), true);
curl_close($ch);`;
  }
}

/* ─── Page ─── */

export default function PortalApiAccessPage() {
  usePageTitle("API Access");
  const { toast } = useToast();
  const qc = useQueryClient();

  /* Queries */
  const subQ = useQuery<SubscriptionResp>({
    queryKey: ["/api/portal/api-keys/subscription"],
  });
  const keysQ = useQuery<{ keys: ApiKey[] }>({
    queryKey: ["/api/portal/api-keys"],
  });
  const usageQ = useQuery<{ usage: UsageLog[]; total: number; window_days: number }>({
    queryKey: ["/api/portal/api-keys/usage"],
  });

  const sub = subQ.data?.subscription;
  const usage = subQ.data?.usage_this_period;
  const keys = keysQ.data?.keys ?? [];
  const activeKeys = keys.filter((k) => k.status === "active");
  const hasActiveSub = sub?.status === "active" || sub?.status === "trial";

  /* Mutations */
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/portal/api-keys"] });
    qc.invalidateQueries({ queryKey: ["/api/portal/api-keys/subscription"] });
    qc.invalidateQueries({ queryKey: ["/api/portal/api-keys/usage"] });
  };

  const checkoutMut = useMutation({
    mutationFn: async (req: { tier_id: string; interval: "monthly" | "annual" }) => {
      const res = await apiRequest("POST", "/api/portal/api-keys/checkout", req);
      return res.json() as Promise<{ checkout_url: string }>;
    },
    onSuccess: ({ checkout_url }) => {
      if (checkout_url) window.location.href = checkout_url;
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't start checkout", description: err.message, variant: "destructive" }),
  });

  const portalMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portal/api-keys/portal");
      return res.json() as Promise<{ portal_url: string }>;
    },
    onSuccess: ({ portal_url }) => {
      if (portal_url) window.location.href = portal_url;
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't open billing portal", description: err.message, variant: "destructive" }),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portal/api-keys/cancel");
      return res.json() as Promise<{ ok: boolean; will_cancel_at: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Subscription will cancel",
        description: `Access continues until ${formatDate(data.will_cancel_at)}.`,
      });
      invalidateAll();
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't cancel", description: err.message, variant: "destructive" }),
  });

  const createKeyMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/portal/api-keys", { name });
      return res.json() as Promise<{ key: ApiKey; plaintext: string }>;
    },
    onSuccess: (data) => {
      setPlaintextReveal({ plaintext: data.plaintext, label: data.key.name });
      setNewKeyOpen(false);
      setNewKeyLabel("");
      invalidateAll();
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't create key", description: err.message, variant: "destructive" }),
  });

  const rotateMut = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await apiRequest("POST", `/api/portal/api-keys/${keyId}/rotate`);
      return res.json() as Promise<{ key: ApiKey; plaintext: string }>;
    },
    onSuccess: (data) => {
      setPlaintextReveal({ plaintext: data.plaintext, label: `${data.key.name} (rotated)` });
      setRotateConfirm(null);
      invalidateAll();
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't rotate key", description: err.message, variant: "destructive" }),
  });

  const revokeMut = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await apiRequest("DELETE", `/api/portal/api-keys/${keyId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Key revoked", description: "That key can no longer be used." });
      setRevokeConfirm(null);
      invalidateAll();
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't revoke key", description: err.message, variant: "destructive" }),
  });

  /* Local UI state */
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [plaintextReveal, setPlaintextReveal] = useState<{ plaintext: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotateConfirm, setRotateConfirm] = useState<ApiKey | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<ApiKey | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [snippetLang, setSnippetLang] = useState<"curl" | "node" | "python" | "php">("curl");

  /* Usage chart: bucket logs into days */
  const chartData = useMemo(() => {
    const logs = usageQ.data?.usage ?? [];
    const days: Record<string, number> = {};
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      days[key] = 0;
    }
    for (const l of logs) {
      const key = String(l.created_at).slice(0, 10);
      if (key in days) days[key] += 1;
    }
    return Object.entries(days).map(([date, calls]) => ({
      date: date.slice(5), // MM-DD for axis
      calls,
    }));
  }, [usageQ.data]);

  /* ─── Loading state ─── */
  if (subQ.isLoading || keysQ.isLoading) {
    return (
      <PortalLayout>
        <div data-theme="light" className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </PortalLayout>
    );
  }

  const loyaltyEligible = subQ.data?.loyalty_eligible === true;

  /* ─── Render ─── */
  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">API Access</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Programmatic access to your WeFixTrades calculators and quoting engine.
          </p>
        </div>

        {hasActiveSub ? (
          <SubscribedView
            sub={sub!}
            tierMeta={subQ.data?.tier ?? null}
            usage={usage!}
            keys={keys}
            activeKeys={activeKeys}
            usageQ={usageQ}
            chartData={chartData}
            snippetLang={snippetLang}
            setSnippetLang={setSnippetLang}
            onManageBilling={() => portalMut.mutate()}
            onCancel={() => setCancelConfirm(true)}
            onGenerateKey={() => setNewKeyOpen(true)}
            onRotate={(k) => setRotateConfirm(k)}
            onRevoke={(k) => setRevokeConfirm(k)}
            portalPending={portalMut.isPending}
          />
        ) : (
          <PricingView
            interval={interval}
            setInterval={setInterval}
            loyaltyEligible={loyaltyEligible}
            onSelectPaid={(tierId) => checkoutMut.mutate({ tier_id: tierId, interval })}
            onSelectFree={() => {
              setNewKeyLabel("Default key");
              setNewKeyOpen(true);
            }}
            pending={checkoutMut.isPending}
          />
        )}
      </div>

      {/* Create-key modal */}
      <Dialog open={newKeyOpen} onOpenChange={setNewKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new API key</DialogTitle>
            <DialogDescription>
              Give this key a label so you remember where it's used (e.g. "Production server", "Local dev").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="key-label">Label</Label>
            <Input
              id="key-label"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder="Production server"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewKeyOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createKeyMut.mutate(newKeyLabel.trim() || "Untitled key")}
              disabled={createKeyMut.isPending || !newKeyLabel.trim()}
            >
              {createKeyMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plaintext reveal modal — SHOWN ONCE */}
      <Dialog
        open={plaintextReveal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPlaintextReveal(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-4 h-4 text-brand-blue" /> Your new API key
            </DialogTitle>
            <DialogDescription>
              {plaintextReveal?.label && <span className="font-medium">{plaintextReveal.label} — </span>}
              this key will not be shown again. Copy it now and store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>This is the only time the full key is visible. If you lose it you'll need to rotate.</p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono break-all">
              {plaintextReveal?.plaintext}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!plaintextReveal) return;
                try {
                  await navigator.clipboard.writeText(plaintextReveal.plaintext);
                  setCopied(true);
                  toast({ title: "Copied", description: "Key copied to clipboard." });
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  toast({ title: "Couldn't copy", description: "Select the key and copy manually.", variant: "destructive" });
                }
              }}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => { setPlaintextReveal(null); setCopied(false); }}>
              I've stored it safely
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate confirm */}
      <AlertDialog open={rotateConfirm !== null} onOpenChange={(open) => !open && setRotateConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate this key?</AlertDialogTitle>
            <AlertDialogDescription>
              A new key will be generated and the old one immediately revoked.
              Any service still using the old key will start receiving 401 errors.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rotateConfirm && rotateMut.mutate(rotateConfirm.id)}
              disabled={rotateMut.isPending}
            >
              {rotateMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Rotate key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke confirm */}
      <AlertDialog open={revokeConfirm !== null} onOpenChange={(open) => !open && setRevokeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
            <AlertDialogDescription>
              The key will be permanently disabled. Any service using it will immediately fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeConfirm && revokeMut.mutate(revokeConfirm.id)}
              disabled={revokeMut.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {revokeMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel sub confirm */}
      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your API subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will stay active until {formatDate(sub?.current_period_end)},
              then your keys will be deactivated. You can resume any time before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { cancelMut.mutate(); setCancelConfirm(false); }}
              disabled={cancelMut.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Cancel subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PortalLayout>
  );
}

/* ─── Pricing view (no active sub) ─── */

function PricingView({
  interval, setInterval, loyaltyEligible, onSelectPaid, onSelectFree, pending,
}: {
  interval: "monthly" | "annual";
  setInterval: (v: "monthly" | "annual") => void;
  loyaltyEligible: boolean;
  onSelectPaid: (tierId: string) => void;
  onSelectFree: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Annual/monthly toggle */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setInterval("monthly")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            interval === "monthly" ? "bg-brand-blue text-white" : "bg-white border border-gray-200 text-gray-700",
          )}
          data-testid="toggle-monthly"
        >
          Monthly
        </button>
        <button
          onClick={() => setInterval("annual")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
            interval === "annual" ? "bg-brand-blue text-white" : "bg-white border border-gray-200 text-gray-700",
          )}
          data-testid="toggle-annual"
        >
          Annual
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            Save 2 months
          </span>
        </button>
      </div>

      {/* Loyalty callout */}
      {loyaltyEligible && (
        <div className="bg-[#EEF3FF] border border-brand-blue/20 rounded-xl p-4 flex items-start gap-3" data-testid="loyalty-callout">
          <Sparkles className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-gray-900">Existing QuoteQuick subscriber?</p>
            <p className="text-gray-600 mt-0.5">
              Get Starter for <span className="font-semibold">$29/mo</span> instead of $49 — locked while your QuoteQuick subscription is active.
            </p>
          </div>
        </div>
      )}

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 auto-rows-fr" data-testid="tier-grid">
        {LOCKED_TIERS.map((t) => {
          const monthly = interval === "annual" ? annualEquivalentMonthly(t.monthlyUsd) : t.monthlyUsd;
          const isFree = t.monthlyUsd === 0;
          const isStarter = t.id === "starter";
          const showLoyaltyPrice = isStarter && loyaltyEligible && interval === "monthly";
          const displayMonthly = showLoyaltyPrice ? t.loyaltyMonthlyUsd! : monthly;
          return (
            <div
              key={t.id}
              className={cn(
                "bg-white rounded-xl border p-5 flex flex-col gap-3 relative",
                t.recommended ? "border-brand-blue ring-2 ring-brand-blue/20" : "border-gray-200",
              )}
              data-testid={`tier-card-${t.id}`}
            >
              {t.recommended && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-blue text-white">
                  Recommended
                </span>
              )}
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{t.calcsIncluded}</p>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-gray-900">${displayMonthly}</span>
                  <span className="text-xs text-gray-500">/mo</span>
                  {showLoyaltyPrice && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="ml-1" aria-label="Loyalty rate info">
                          <Info className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Loyalty rate — locked while QuoteQuick is active.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {interval === "annual" && !isFree && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    ${monthly * 12}/year billed annually
                  </p>
                )}
                {interval === "monthly" && showLoyaltyPrice && (
                  <p className="text-[11px] text-gray-500 mt-0.5 line-through">
                    Was ${t.monthlyUsd}/mo
                  </p>
                )}
              </div>
              <ul className="space-y-1.5 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={t.recommended ? "default" : "outline"}
                disabled={pending}
                onClick={() => isFree ? onSelectFree() : onSelectPaid(t.id)}
                data-testid={`tier-cta-${t.id}`}
              >
                {pending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                Get started
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Subscribed view ─── */

function SubscribedView({
  sub, tierMeta, usage, keys, activeKeys, usageQ, chartData,
  snippetLang, setSnippetLang,
  onManageBilling, onCancel, onGenerateKey, onRotate, onRevoke, portalPending,
}: {
  sub: NonNullable<SubscriptionResp["subscription"]>;
  tierMeta: SubscriptionResp["tier"];
  usage: SubscriptionResp["usage_this_period"];
  keys: ApiKey[];
  activeKeys: ApiKey[];
  usageQ: ReturnType<typeof useQuery<{ usage: UsageLog[]; total: number; window_days: number }>>;
  chartData: { date: string; calls: number }[];
  snippetLang: "curl" | "node" | "python" | "php";
  setSnippetLang: (l: "curl" | "node" | "python" | "php") => void;
  onManageBilling: () => void;
  onCancel: () => void;
  onGenerateKey: () => void;
  onRotate: (k: ApiKey) => void;
  onRevoke: (k: ApiKey) => void;
  portalPending: boolean;
}) {
  const pct = usage.calls_quota > 0
    ? Math.min(100, Math.round((usage.calls_used / usage.calls_quota) * 100))
    : 0;
  const tierName = tierMeta?.name ?? sub.tier;
  const firstKeyPrefix = activeKeys[0]?.prefix ?? "wfx_live_xxx";

  return (
    <div className="space-y-6">
      {/* Subscription card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="subscription-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#EEF3FF] text-brand-blue text-xs font-semibold uppercase tracking-wide">
              {tierName}
            </span>
            <span className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide",
              sub.status === "active" ? "bg-emerald-100 text-emerald-700"
              : sub.status === "trial" ? "bg-sky-100 text-sky-700"
              : sub.status === "past_due" ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-700",
            )}>
              {sub.status}
            </span>
            {sub.cancel_at_period_end && (
              <span className="text-xs text-amber-700">
                Will cancel {formatDate(sub.will_cancel_at ?? sub.current_period_end)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onManageBilling} disabled={portalPending}>
              {portalPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Manage subscription <ExternalLink className="w-3 h-3 ml-1.5" />
            </Button>
            {!sub.cancel_at_period_end && (
              <Button variant="ghost" size="sm" onClick={onCancel} className="text-red-600 hover:text-red-700">
                Cancel
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <div className="text-gray-600">
              <span className="font-semibold text-gray-900">{usage.calls_used.toLocaleString()}</span>
              {" / "}
              {usage.calls_quota.toLocaleString()} calls this period
            </div>
            <div className="text-xs text-gray-500">
              {formatDate(sub.current_period_start)} → {formatDate(sub.current_period_end)}
            </div>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn("h-full transition-all", progressColor(pct))}
              style={{ width: `${pct}%` }}
              data-testid="usage-progress"
            />
          </div>
        </div>
      </div>

      {/* Keys section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Your API keys</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Use these to authenticate requests to api.wefixtrades.com.
            </p>
          </div>
          <Button size="sm" onClick={onGenerateKey} data-testid="btn-generate-key">
            <Plus className="w-4 h-4 mr-1.5" /> Generate new key
          </Button>
        </div>
        {keys.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg py-10 text-center">
            <Key className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-3">Create your first API key to get started</p>
            <Button size="sm" onClick={onGenerateKey}>
              <Plus className="w-4 h-4 mr-1.5" /> Generate new key
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="keys-table">
              <thead className="text-xs text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="text-left font-medium py-2 px-2">Prefix</th>
                  <th className="text-left font-medium py-2 px-2">Label</th>
                  <th className="text-left font-medium py-2 px-2">Status</th>
                  <th className="text-left font-medium py-2 px-2">Last used</th>
                  <th className="text-right font-medium py-2 px-2">Total calls</th>
                  <th className="text-right font-medium py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 px-2 font-mono text-xs text-gray-900">{k.prefix}…</td>
                    <td className="py-2.5 px-2 text-gray-700">{k.name}</td>
                    <td className="py-2.5 px-2">
                      <span className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide",
                        k.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500",
                      )}>
                        {k.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-gray-500">{formatRelative(k.last_used_at)}</td>
                    <td className="py-2.5 px-2 text-right text-gray-700">{(k.total_calls ?? 0).toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm" variant="ghost"
                          disabled={k.status !== "active"}
                          onClick={() => onRotate(k)}
                          aria-label="Rotate key"
                          data-testid={`btn-rotate-${k.id}`}
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          disabled={k.status !== "active"}
                          onClick={() => onRevoke(k)}
                          aria-label="Revoke key"
                          className="text-red-600 hover:text-red-700"
                          data-testid={`btn-revoke-${k.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Usage — last 30 days</h2>
            <p className="text-xs text-gray-500 mt-0.5">Daily API calls across all your keys.</p>
          </div>
          {usageQ.isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} interval={3} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
              <RTooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Line type="monotone" dataKey="calls" stroke="#0d3cfc" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quickstart snippet card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Quickstart</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Replace <code className="font-mono">{firstKeyPrefix}…</code> with your full key (visible only when you generate it).
          </p>
        </div>
        <Tabs value={snippetLang} onValueChange={(v) => setSnippetLang(v as typeof snippetLang)}>
          <TabsList>
            <TabsTrigger value="curl">curl</TabsTrigger>
            <TabsTrigger value="node">Node</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
            <TabsTrigger value="php">PHP</TabsTrigger>
          </TabsList>
          {(["curl", "node", "python", "php"] as const).map((lang) => (
            <TabsContent key={lang} value={lang}>
              <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                <code>{buildSnippet(lang, firstKeyPrefix)}</code>
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
