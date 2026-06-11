import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, RefreshCw, Users, Send, CheckCircle, AlertCircle, HelpCircle, ChevronRight, ShieldCheck } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { humanizeBlockCode, type BlockedReasonRow } from "./outboundUiHelpers";

/* ─── Types ─── */
interface Campaign {
  id: number;
  name: string;
  description: string | null;
  platform: string;
  external_campaign_id: string | null;
  platform_status: string | null;
  status: string;
  target_trade: string | null;
  target_region: string | null;
  sender_email: string | null;
  metadata: { dry_run?: boolean } | null;
  created_at: string;
}

interface CampaignLead {
  cp: {
    id: number;
    sync_status: string;
    outreach_status: string;
    emails_sent: number;
    last_replied_at: string | null;
  };
  prospect: {
    id: number;
    business_name: string;
    primary_email: string | null;
    trade_category: string | null;
    city: string | null;
    state: string | null;
    status: string;
  } | null;
  enrichment: { quality_score: number | null } | null;
}

interface CampaignDetail {
  campaign: Campaign;
  leads: CampaignLead[];
}

/* ─── Verify-link (frozen Lane OA contract) ───
   GET /api/admin/outbound/campaigns/:id/verify-link →
   { linked, verified, platform_status, email_accounts: [{email, domain}] } */
interface VerifyLinkResult {
  linked: boolean;
  verified: boolean;
  platform_status: string;
  email_accounts: { email: string; domain: string }[];
}

/**
 * Verify a campaign's platform link on demand, cached for 5 minutes.
 * 503 {error:"not_configured"} = the platform key isn't present in this
 * environment (the Smartlead rail ships DORMANT — no SMARTLEAD_API_KEY in
 * prod until the revenue trigger). That's a distinct honest state, not an
 * error and not "Unverified".
 */
type VerifyLinkState =
  | { kind: "ok"; result: VerifyLinkResult }
  | { kind: "not_configured" };

function useVerifyLink(campaignId: number, enabled: boolean) {
  return useQuery<VerifyLinkState>({
    queryKey: ["/api/admin/outbound/campaigns", campaignId, "verify-link"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/outbound/campaigns/${campaignId}/verify-link`, { credentials: "include" });
      if (res.status === 503) return { kind: "not_configured" as const };
      if (!res.ok) throw new Error(`verify-link failed (${res.status})`);
      return { kind: "ok" as const, result: await res.json() };
    },
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * P0 audit fix: the old badge showed green "Linked" whenever
 * external_campaign_id was non-empty — zero platform verification.
 * Now: green "Linked ✓" ONLY when verify-link returns verified:true;
 * a non-empty but unverified ID renders amber "Unverified" (click to
 * re-verify on demand).
 */
function LinkStatusBadge({ campaign }: { campaign: Campaign }) {
  const hasId = !!campaign.external_campaign_id;
  const { data, isFetching, refetch } = useVerifyLink(campaign.id, hasId);

  if (!hasId) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-500" data-testid="campaign-link-no-id">
        <AlertCircle className="w-3.5 h-3.5" />
        No ID
      </span>
    );
  }
  if (isFetching && !data) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="campaign-link-verifying">
        <RefreshCw className="w-3 h-3 animate-spin" />
        Verifying…
      </span>
    );
  }
  if (data?.kind === "not_configured") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 text-xs text-muted-foreground cursor-default" data-testid="campaign-link-not-configured">
            <AlertCircle className="w-3.5 h-3.5" />
            Platform not connected
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs">
          The sending platform's API key isn't configured in this environment, so the link can't be verified. The campaign record is intact — verification resumes automatically once the platform is connected.
        </TooltipContent>
      </Tooltip>
    );
  }
  if (data?.kind === "ok" && data.result.verified) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 text-xs text-green-600 cursor-default" data-testid="campaign-link-verified">
            <CheckCircle className="w-3.5 h-3.5" />
            Linked ✓
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs">
          Verified against the platform — status "{data.result.platform_status}",{" "}
          {data.result.email_accounts.length} sending account{data.result.email_accounts.length !== 1 ? "s" : ""} attached.
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); refetch(); }}
          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
          data-testid="campaign-link-unverified"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Unverified
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-xs">
        An external campaign ID is set, but the platform hasn't confirmed it exists. Click to re-verify against Instantly/Smartlead.
      </TooltipContent>
    </Tooltip>
  );
}

/* ─── Attribution funnel (Lane OC) ─── */
interface CampaignFunnel {
  campaign_id: number;
  sent: number;
  opened: number;
  replied: number;
  positive: number;
  converted: number;
}

/** One fetch for all campaigns; mapped by campaign_id for the card strips. */
function useFunnelMap() {
  return useQuery<Record<number, CampaignFunnel>>({
    queryKey: ["/api/admin/outbound/attribution/funnel"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/attribution/funnel", { credentials: "include" });
      if (!res.ok) throw new Error(`funnel failed (${res.status})`);
      const json = await res.json();
      const map: Record<number, CampaignFunnel> = {};
      for (const row of (json.funnel ?? []) as CampaignFunnel[]) map[row.campaign_id] = row;
      return map;
    },
    staleTime: 60_000,
    retry: false,
  });
}

/* When the funnel endpoint fails we render "—" per stage rather than zeros —
 * a fake "Sent 0 → Converted 0" reads as measured data (P-D audit P2-2). */
function FunnelStrip({ funnel, isError }: { funnel: CampaignFunnel | undefined; isError?: boolean }) {
  const stages = [
    { label: "Sent", value: funnel?.sent ?? 0, cls: "text-blue-600" },
    { label: "Opened", value: funnel?.opened ?? 0, cls: "text-sky-600" },
    { label: "Replied", value: funnel?.replied ?? 0, cls: "text-green-600" },
    { label: "Positive", value: funnel?.positive ?? 0, cls: "text-amber-600" },
    { label: "Converted", value: funnel?.converted ?? 0, cls: "text-brand-blue-600" },
  ];
  return (
    <div className="mt-2 flex items-center gap-1 flex-wrap" data-testid="campaign-funnel-strip">
      {/* Help cue — top-left of the component per DESIGN-SYSTEM hard rule */}
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="w-3 h-3 text-muted-foreground/70 cursor-default shrink-0" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-xs">
          Attribution funnel: emails sent → opened → replied → positive replies → converted (signed up or paid). Conversions are linked back to this campaign automatically when a prospect's email converts.
        </TooltipContent>
      </Tooltip>
      {stages.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1 text-[11px]">
          {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
          <span className="text-muted-foreground">{s.label}</span>
          <span className={isError ? "font-semibold text-muted-foreground" : `font-semibold ${s.cls}`}>
            {isError ? "—" : s.value}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ─── Compliance protection counts (Lane OB consent gate) ─── */

/**
 * Per-campaign consent-gate breakdown — GET .../campaigns/:id/blocked-reasons
 * (Lane OC read API over OB's prospect_events bookkeeping). Codes are OB's
 * canonical block codes (blocked_confidence / blocked_consent_expired /
 * blocked_casl_no_basis, plus push-time blocked_dnc etc.).
 */
function useBlockedReasons(campaignId: number) {
  return useQuery<{ total: number; reasons: BlockedReasonRow[] }>({
    queryKey: ["/api/admin/outbound/campaigns", campaignId, "blocked-reasons"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/outbound/campaigns/${campaignId}/blocked-reasons`, { credentials: "include" });
      if (!res.ok) throw new Error(`blocked-reasons failed (${res.status})`);
      const json = await res.json();
      return { total: Number(json.total ?? 0), reasons: (json.reasons ?? []) as BlockedReasonRow[] };
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** Frames consent blocks as protection (deliverability + legal), not breakage. */
function ComplianceStrip({ campaignId }: { campaignId: number }) {
  const { data, isError } = useBlockedReasons(campaignId);
  if (isError) return null; // detail panel stays usable; the global panel still shows pool-level stats
  const total = data?.total ?? 0;
  const reasons = data?.reasons ?? [];
  return (
    <div className="mx-4 mt-3 p-3 bg-green-50 border border-green-200 rounded-lg" data-testid="campaign-compliance-strip">
      <div className="flex items-center gap-1.5">
        {/* Help cue — top-left of the component per DESIGN-SYSTEM hard rule */}
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="w-3 h-3 text-green-700/70 cursor-default shrink-0" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px] text-xs">
            The consent gate holds back contacts that would hurt deliverability or compliance — low-confidence emails, expired implied consent, missing CASL basis, do-not-contact flags. Held contacts are protection, not failures: they keep the sending domains healthy and the campaign legal.
          </TooltipContent>
        </Tooltip>
        <ShieldCheck className="w-3.5 h-3.5 text-green-600 shrink-0" />
        <p className="text-xs font-medium text-green-700">
          Compliance protection — {total} contact{total !== 1 ? "s" : ""} held back
        </p>
      </div>
      {reasons.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <span key={r.code} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-card border border-green-200 text-green-700">
              <span className="font-semibold">{r.count}</span> {humanizeBlockCode(r.code)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Consent-gate pool stats (Lane OB, GET /api/admin/outbound/consent/stats) ─── */
interface ConsentStats {
  min_contact_confidence: string;
  casl_strict: boolean;
  pool: {
    total: number;
    eligible: number;
    blocked: number;
    by_reason: {
      blocked_confidence: number;
      blocked_consent_expired: number;
      blocked_casl_no_basis: number;
    };
  };
  blocked_events_30d: number;
}

/** Page-level panel: how much of the assignable pool the consent gate passes. */
function ConsentGatePanel() {
  const { data: stats, isError } = useQuery<ConsentStats>({
    queryKey: ["/api/admin/outbound/consent/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/consent/stats", { credentials: "include" });
      if (!res.ok) throw new Error(`consent stats failed (${res.status})`);
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });

  if (isError) {
    return (
      <div className="bg-card rounded-lg border border-border p-3" data-testid="consent-gate-error">
        <p className="text-xs text-muted-foreground">Consent-gate stats unavailable — the stats endpoint returned an error.</p>
      </div>
    );
  }

  const byReason = stats?.pool.by_reason;
  const reasonChips = [
    { code: "blocked_confidence", value: byReason?.blocked_confidence ?? 0 },
    { code: "blocked_consent_expired", value: byReason?.blocked_consent_expired ?? 0 },
    { code: "blocked_casl_no_basis", value: byReason?.blocked_casl_no_basis ?? 0 },
  ];
  return (
    <div className="bg-card rounded-lg border border-border p-4" data-testid="consent-gate-panel">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Help cue — top-left of the component per DESIGN-SYSTEM hard rule */}
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="w-3 h-3 text-muted-foreground/70 cursor-default shrink-0" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px] text-xs">
            The CASL consent gate, evaluated over the whole assignable pool (new / enriched / approved prospects). Eligible prospects can be assigned to campaigns; blocked ones are held back with the reason shown. The gate re-runs at push time, so these numbers always reflect the live rules.
          </TooltipContent>
        </Tooltip>
        <ShieldCheck className="w-3.5 h-3.5 text-green-600 shrink-0" />
        <p className="text-sm font-semibold text-foreground">Consent gate</p>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
          min confidence: {stats?.min_contact_confidence ?? "—"}
        </span>
        {stats?.casl_strict && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground cursor-default">
                CASL strict
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-xs">
              Every prospect needs a valid consent basis (or conspicuous publication on their own domain). Canadian prospects are strict regardless of this flag.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-xl font-bold text-foreground">{stats ? stats.pool.total : "—"}</p>
          <p className="text-xs text-muted-foreground">Assignable pool</p>
        </div>
        <div>
          <p className="text-xl font-bold text-green-600">{stats ? stats.pool.eligible : "—"}</p>
          <p className="text-xs text-muted-foreground">Eligible</p>
        </div>
        <div>
          <p className="text-xl font-bold text-amber-600">{stats ? stats.pool.blocked : "—"}</p>
          <p className="text-xs text-muted-foreground">Held back</p>
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{stats ? stats.blocked_events_30d : "—"}</p>
          <p className="text-xs text-muted-foreground">Blocks logged (30d)</p>
        </div>
      </div>

      {stats && stats.pool.blocked > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {reasonChips.filter((c) => c.value > 0).map((c) => (
            <span key={c.code} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-muted text-muted-foreground">
              <span className="font-semibold text-foreground">{c.value}</span> {humanizeBlockCode(c.code)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── New Campaign Dialog ─── */
function NewCampaignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* Smartlead capability gate (documented choice): a capability read DOES
     exist — GET /api/admin/env-presence reports boolean-only env presence,
     extended with an `outreach_platforms` category (SMARTLEAD_API_KEY /
     INSTANTLY_API_KEY). The selector stays disabled until the server
     reports the Smartlead key present, so the stub adapter can never be
     selected and silently fail on Push. (The verify-link not_configured
     derivation was rejected: it needs an existing campaign, and this
     selector lives in the create dialog where none exists yet.) */
  const { data: envPresence } = useQuery<{ categories?: Record<string, Record<string, boolean>> }>({
    queryKey: ["/api/admin/env-presence"],
    queryFn: async () => {
      const res = await fetch("/api/admin/env-presence", { credentials: "include" });
      if (!res.ok) throw new Error(`env-presence failed (${res.status})`);
      return res.json();
    },
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const smartleadReady = envPresence?.categories?.outreach_platforms?.SMARTLEAD_API_KEY === true;

  const [form, setForm] = useState({
    name: "",
    description: "",
    platform: "instantly",
    external_campaign_id: "",
    target_trade: "",
    target_region: "",
    sender_email: "",
    dry_run: true,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { dry_run, ...rest } = form;
      const res = await apiRequest("POST", "/api/admin/outbound/campaigns", {
        ...rest,
        external_campaign_id: form.external_campaign_id || null,
        description: form.description || null,
        target_trade: form.target_trade || null,
        target_region: form.target_region || null,
        sender_email: form.sender_email || null,
        // Dry-run lives on campaign.metadata — the sync path reads metadata.dry_run
        // to select the NoopAdapter (no external push, no real leads registered).
        metadata: { dry_run },
        status: "active",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/campaigns"] });
      toast({ title: "Campaign created" });
      setForm({ name: "", description: "", platform: "instantly", external_campaign_id: "", target_trade: "", target_region: "", sender_email: "", dry_run: true });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-theme="light" className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Campaign Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q2 Plumbers — Miami" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Platform</label>
              <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instantly">Instantly</SelectItem>
                  {/* P0-2: Smartlead stays disabled until the server capability
                      flag (env-presence → outreach_platforms.SMARTLEAD_API_KEY)
                      reports the key present, so it can't be selected and
                      silently fail on Push. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block">
                        <SelectItem value="smartlead" disabled={!smartleadReady}>
                          {smartleadReady ? "Smartlead" : "Smartlead (key missing)"}
                        </SelectItem>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px] text-xs">
                      {smartleadReady
                        ? "Smartlead key detected on the server — campaigns can be linked and pushed."
                        : "SMARTLEAD_API_KEY isn't configured on the server, so the integration can't push leads. Add the key to enable this option."}
                    </TooltipContent>
                  </Tooltip>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-0.5 cursor-default">
                    External Campaign ID <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </label>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs">
                  Copy the campaign ID from your Instantly or Smartlead dashboard and paste it here to link the platforms.
                </TooltipContent>
              </Tooltip>
              <Input value={form.external_campaign_id} onChange={(e) => setForm({ ...form, external_campaign_id: e.target.value })} placeholder="From Instantly/Smartlead" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Trade</label>
              <Input value={form.target_trade} onChange={(e) => setForm({ ...form, target_trade: e.target.value })} placeholder="plumber, electrician..." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Region</label>
              <Input value={form.target_region} onChange={(e) => setForm({ ...form, target_region: e.target.value })} placeholder="Miami, FL" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Sender Email</label>
            <Input value={form.sender_email} onChange={(e) => setForm({ ...form, sender_email: e.target.value })} placeholder="support@wefixtrades.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional notes" />
          </div>
          {/* P0-1 + first-campaign UX: send mode is the highest-stakes choice
              in this dialog, so it's a labeled segmented control instead of a
              buried checkbox. metadata.dry_run drives the NoopAdapter on sync.
              Selected state = outline, not bright fill (hard UI rule). */}
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {/* Help cue — top-left of the input per DESIGN-SYSTEM hard rule */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/70" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-xs">
                  Dry run uses the no-op adapter: pushes are logged but nothing reaches Instantly/Smartlead and no email goes out — verify the whole flow safely. Live pushes leads into the real platform campaign and starts contacting them.
                </TooltipContent>
              </Tooltip>
              <label className="text-xs font-medium text-muted-foreground">Send mode</label>
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Send mode">
              <button
                type="button"
                role="radio"
                aria-checked={form.dry_run}
                onClick={() => setForm({ ...form, dry_run: true })}
                data-testid="campaign-dry-run-toggle"
                className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  form.dry_run
                    ? "border-amber-500 ring-1 ring-amber-500 text-foreground"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40"
                }`}
              >
                <span className="font-semibold block">Dry run</span>
                <span className="block mt-0.5 text-muted-foreground">Test — nothing sends</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!form.dry_run}
                onClick={() => setForm({ ...form, dry_run: false })}
                data-testid="campaign-live-toggle"
                className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  !form.dry_run
                    ? "border-brand-blue-600 ring-1 ring-brand-blue-600 text-foreground"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40"
                }`}
              >
                <span className="font-semibold block">Live</span>
                <span className="block mt-0.5 text-muted-foreground">Real emails are sent</span>
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending} className="bg-[#0d3cfc] hover:bg-[#0b34d6]">
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Campaign Detail Panel ─── */
function CampaignDetail({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmSync, setConfirmSync] = useState(false);

  const { data, isLoading } = useQuery<CampaignDetail>({
    queryKey: ["/api/admin/outbound/campaigns", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/outbound/campaigns/${campaignId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaign");
      return res.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/outbound/campaigns/${campaignId}/sync`, {});
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/prospects"] });
      toast({
        title: result.dry_run ? "Dry-run complete" : "Sync complete",
        description: `${result.synced} ${result.dry_run ? "dry-run" : "synced"}, ${result.failed} failed`,
      });
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const OUTREACH_COLORS: Record<string, string> = {
    queued: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    opened: "bg-sky-100 text-sky-700",
    clicked: "bg-brand-blue-100 text-brand-blue-700",
    replied: "bg-green-100 text-green-700",
    bounced: "bg-red-100 text-red-600",
    unsubscribed: "bg-orange-100 text-orange-700",
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (!data) return null;

  const { campaign, leads } = data;
  const pendingCount = leads.filter((l) => l.cp.sync_status === "pending").length;

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{campaign.name}</h3>
            {campaign.metadata?.dry_run && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700" data-testid="campaign-detail-dry-run-badge">
                DRY RUN
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground capitalize">{campaign.platform} · {campaign.external_campaign_id || "no external ID"}</p>
        </div>
        <div className="flex gap-2">
          {campaign.external_campaign_id && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => setConfirmSync(true)}
                    disabled={syncMutation.isPending || pendingCount === 0}
                  >
                    <Send className="w-3 h-3" />
                    {syncMutation.isPending ? "Syncing..." : `Push ${pendingCount} pending`}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                Sends queued leads to your Instantly/Smartlead campaign. Only leads with "pending" sync status are pushed.
              </TooltipContent>
            </Tooltip>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>Close</Button>
        </div>
      </div>

      {!campaign.external_campaign_id && (
        <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            No external campaign ID set — leads cannot be synced until you add an Instantly or Smartlead campaign ID.
          </p>
        </div>
      )}

      {/* Consent-gate counts framed as protection (Lane OB merge wiring inside the hook) */}
      <ComplianceStrip campaignId={campaign.id} />

      <div className="flex-1 overflow-y-auto">
        {leads.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No leads assigned yet. Go to Prospects and assign approved leads to this campaign.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border sticky top-0">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Business</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">Sent</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 cursor-default">
                        Sync <HelpCircle className="w-3 h-3 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">
                      Whether this lead has been sent to the outreach platform (pending → synced → failed).
                    </TooltipContent>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map(({ cp, prospect }) => (
                <tr key={cp.id} className="hover:bg-muted/50">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground truncate max-w-[160px]">{prospect?.business_name || "—"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{prospect?.trade_category} · {[prospect?.city, prospect?.state].filter(Boolean).join(", ")}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">
                    {prospect?.primary_email || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{cp.emails_sent}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${OUTREACH_COLORS[cp.outreach_status] ?? "bg-muted/50 text-muted-foreground"}`}>
                      {cp.outreach_status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs ${cp.sync_status === "synced" ? "text-green-600" : cp.sync_status === "failed" ? "text-red-500" : "text-gray-400"}`}>
                      {cp.sync_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmDialog
        open={confirmSync}
        onOpenChange={setConfirmSync}
        title={campaign.metadata?.dry_run
          ? `Dry-run push ${pendingCount} lead${pendingCount !== 1 ? "s" : ""}?`
          : `Push ${pendingCount} lead${pendingCount !== 1 ? "s" : ""} into the live campaign?`}
        description={campaign.metadata?.dry_run
          ? "Dry-run mode: nothing is sent to the outreach platform. This only logs dry-run push events so you can verify the flow."
          : `You are about to push ${pendingCount} lead${pendingCount !== 1 ? "s" : ""} into a LIVE campaign — real emails will be sent. This starts contacting them and can't be undone from here.`}
        confirmLabel={campaign.metadata?.dry_run ? "Run dry-run" : "Push to campaign"}
        pending={syncMutation.isPending}
        onConfirm={() => { syncMutation.mutate(); setConfirmSync(false); }}
      />
    </div>
  );
}

/* ─── Main Page ─── */
export default function CampaignsPage() {
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/outbound/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
  });

  // Attribution funnel — one fetch for all cards.
  const { data: funnelMap, isError: funnelMapError } = useFunnelMap();

  const PLATFORM_COLORS: Record<string, string> = {
    instantly: "bg-blue-100 text-blue-700",
    smartlead: "bg-brand-blue-100 text-brand-blue-700",
  };

  const STATUS_COLORS: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    paused: "bg-amber-100 text-amber-700",
    archived: "bg-gray-100 text-gray-500",
  };

  return (
    <AdminLayout pageContext={{ page: "outbound-campaigns", section: "Outbound" }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Outreach Campaigns</h2>
            <p className="text-sm text-muted-foreground">Link to existing Instantly or Smartlead campaigns</p>
          </div>
          <Button size="sm" className="bg-[#0d3cfc] hover:bg-[#0b34d6] gap-1.5" onClick={() => setNewCampaignOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            New Campaign
          </Button>
        </div>

        {/* Pool-level consent-gate stats (Lane OB data, Lane OC surface) */}
        <ConsentGatePanel />

        <div className={`grid gap-4 ${selectedCampaignId ? "grid-cols-2" : "grid-cols-1"}`}>
          {/* Campaign list */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : campaigns.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                <Button size="sm" className="mt-3 bg-[#0d3cfc] hover:bg-[#0b34d6]" onClick={() => setNewCampaignOpen(true)}>Create your first campaign</Button>
              </div>
            ) : (
              campaigns.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCampaignId(c.id === selectedCampaignId ? null : c.id)}
                  className={`bg-card rounded-lg border cursor-pointer hover:border-[#0d3cfc] transition-colors p-4 ${c.id === selectedCampaignId ? "border-[#0d3cfc] shadow-sm" : "border-border"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-foreground">{c.name}</h3>
                      {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${PLATFORM_COLORS[c.platform]}`}>
                          {c.platform}
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[c.status]}`}>
                          {c.status}
                        </span>
                        {c.metadata?.dry_run && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700" data-testid="campaign-dry-run-badge">
                            DRY RUN
                          </span>
                        )}
                        {c.target_trade && (
                          <span className="text-xs text-muted-foreground">{c.target_trade}</span>
                        )}
                        {c.target_region && (
                          <span className="text-xs text-muted-foreground">· {c.target_region}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <LinkStatusBadge campaign={c} />
                      <p className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <FunnelStrip funnel={funnelMap?.[c.id]} isError={funnelMapError} />
                </div>
              ))
            )}
          </div>

          {/* Detail panel */}
          {selectedCampaignId && (
            <CampaignDetail
              campaignId={selectedCampaignId}
              onClose={() => setSelectedCampaignId(null)}
            />
          )}
        </div>
      </div>

      <NewCampaignDialog open={newCampaignOpen} onClose={() => setNewCampaignOpen(false)} />
    </AdminLayout>
  );
}
