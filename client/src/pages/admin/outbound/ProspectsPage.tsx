import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, XCircle, AlertTriangle, Globe, Phone, Mail,
  Star, Upload, Brain, RefreshCw, ChevronDown, FileText, Zap, HelpCircle, Search,
  Sparkles, ExternalLink, Megaphone,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { TemplatePreview } from "@/components/outbound/TemplatePreview";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { humanizeBlockCode } from "./outboundUiHelpers";

/* ─── Types ─── */
interface ProspectEnrichment {
  quality_score: number | null;
  has_website: boolean | null;
  likely_owner_operator: boolean | null;
  ai_personalization_line: string | null;
  ai_notes: string | null;
  enrichment_source: string | null;
  // V2 fields
  ai_reason_to_target: string | null;
  ai_first_line: string | null;
  ai_offer_angle: string | null;
  ai_cta_variant: string | null;
  // Artifact-first outreach (Lane OC) — served by the existing prospects
  // endpoint (it returns the full enrichment row).
  artifact_url: string | null;
  artifact_score: number | null;
  artifact_viewed_at: string | null;
}

interface Prospect {
  id: number;
  business_name: string;
  owner_name: string | null;
  contact_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  website_url: string | null;
  website_domain: string | null;
  trade_category: string | null;
  city: string | null;
  state: string | null;
  google_rating: string | null;
  google_review_count: number | null;
  status: string;
  do_not_contact: boolean;
  created_at: string;
  // V2 fields
  target_offer: string | null;
  priority_score: number | null;
}

interface ProspectRow {
  prospect: Prospect;
  enrichment: ProspectEnrichment | null;
}

/* ─── Artifact-first outreach stats ─── */
interface ArtifactRecent {
  prospect_id: number;
  business: string;
  score: number | null;
  grade: string | null;
  headline: string | null;
  url: string | null;
  viewed_at: string | null;
  view_count: number | null;
  generated_at: string | null;
}

interface ArtifactStats {
  enabled: boolean;
  generated: number;
  pending: number;
  failed: number;
  skipped: number;
  viewed: number;
  recent: ArtifactRecent[];
}

/* ─── Status badge ─── */
const STATUS_COLORS: Record<string, string> = {
  new: "bg-muted text-foreground",
  enriched: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
  blacklisted: "bg-red-200 text-red-800",
  campaign_queued: "bg-brand-blue-100 text-brand-blue-700",
  in_outreach: "bg-brand-blue-100 text-brand-blue-700",
  replied: "bg-amber-100 text-amber-700",
  converted: "bg-green-200 text-green-800",
  bounced: "bg-orange-100 text-orange-700",
  unsubscribed: "bg-red-100 text-red-600",
  opted_out: "bg-red-100 text-red-600",
  lost: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span data-theme="light" className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground/70">—</span>;
  const color = score >= 70 ? "text-green-600" : score >= 45 ? "text-amber-600" : "text-red-500";
  return <span className={`text-sm font-bold ${color}`}>{score}</span>;
}

/* ─── Scrape Leads Dialog (Outscraper Google-Maps search) ─── */
function ScrapeLeadsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    trade: "",
    city: "",
    state: "",
    country: "US",
    limit: 100,
  });

  useCopilotForm({
    formLabel: "Scrape leads (Outscraper)",
    fields: [
      { key: "trade", label: "Trade (e.g. plumber, electrician)" },
      { key: "city", label: "City" },
      { key: "state", label: "State or province (optional)" },
      { key: "country", label: "Country code (US, CA, GB, ...)" },
      { key: "limit", label: "Lead limit (1-500)" },
    ],
    values: form as unknown as Record<string, unknown>,
    onApply: (fills) => {
      setForm((prev) => {
        const next = { ...prev };
        for (const f of fills) {
          if (f.field_key === "limit") {
            const n = parseInt(f.value, 10);
            if (Number.isFinite(n)) next.limit = Math.max(1, Math.min(500, n));
            continue;
          }
          if (f.field_key in next) (next as any)[f.field_key] = f.value;
        }
        return next;
      });
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/outbound/scrape", {
        trade: form.trade.trim(),
        city: form.city.trim(),
        state: form.state.trim() || null,
        country: form.country.trim() || "US",
        limit: form.limit,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/overview"] });
      toast({
        title: "Scrape complete",
        description: `${data.importedCount ?? 0} imported, ${data.dedupedCount ?? 0} deduped, ${data.failed ?? 0} failed`,
      });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Scrape failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-theme="light">
        <DialogHeader><DialogTitle>Scrape leads via Outscraper</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/70" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs">
                  The trade keyword used in the Google Maps search (e.g. "plumber in Toronto, ON, CA").
                </TooltipContent>
              </Tooltip>
              <label className="text-xs font-medium text-foreground">Trade</label>
            </div>
            <Input value={form.trade} onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))} placeholder="plumber" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">City</label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Toronto" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">State / Province</label>
              <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="ON" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Country</label>
              <Select value={form.country} onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground/70" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] text-xs">
                    Max leads to fetch. Outscraper credits are consumed per lead — keep small for testing.
                  </TooltipContent>
                </Tooltip>
                <label className="text-xs font-medium text-foreground">Limit</label>
              </div>
              <Input
                type="number"
                min={1}
                max={500}
                value={form.limit}
                onChange={(e) => setForm((f) => ({ ...f, limit: Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 100)) }))}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Rate limited to 5 scrapes per hour per admin. Results are deduped, blacklisted prospects skipped, and heuristics run automatically.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.trade.trim() || !form.city.trim() || mutation.isPending}
            className="bg-[#0d3cfc] hover:bg-[#0b34d6]"
          >
            {mutation.isPending ? "Scraping..." : "Scrape"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── CSV Upload Dialog ─── */
function CsvUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const lines = text.trim().split("\n");
      if (lines.length < 2) throw new Error("CSV must have at least a header row and one data row");

      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
      });

      const res = await apiRequest("POST", "/api/admin/outbound/import/csv", { rows, filename: filename || undefined });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/overview"] });
      toast({ title: "Import complete", description: `${data.imported} imported, ${data.skipped_dupes} dupes skipped` });
      setText("");
      setFilename("");
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Import Outscraper CSV</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Filename (optional)</label>
            <Input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="outscraper-plumbers-miami.csv" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">CSV Data (paste content)</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="font-mono text-xs"
              placeholder={"name,email,phone,site,city,state,rating,reviews,category\nABC Plumbing,owner@abcplumbing.com,555-1234,abcplumbing.com,Miami,FL,4.8,47,plumber"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Outscraper columns auto-mapped: name, email, phone, site/website, city, state, rating, reviews, category, place_id, full_address, owner, country.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!text.trim() || mutation.isPending}
            className="bg-[#0d3cfc] hover:bg-[#0b34d6]"
          >
            {mutation.isPending ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Assign to Campaign Dialog ───
   First-campaign UX fix: the #1 blocker was that POST
   /api/admin/outbound/campaigns/:id/assign existed on the server but had no
   UI. This dialog wires the existing endpoint to the table's row selection:
   pick a campaign → confirm → server assigns approved+emailable prospects
   and skips the rest (consent gate / blacklist / no email). */
interface AssignCampaign {
  id: number;
  name: string;
  platform: string;
  status: string;
  metadata: { dry_run?: boolean } | null;
}

function AssignToCampaignDialog({
  open,
  onClose,
  prospectIds,
  onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  prospectIds: number[];
  onAssigned: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState<string>("");

  // Same campaigns query the Campaigns page uses (shared cache key).
  const { data: campaigns = [], isLoading } = useQuery<AssignCampaign[]>({
    queryKey: ["/api/admin/outbound/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/outbound/campaigns/${campaignId}/assign`, {
        prospect_ids: prospectIds,
      });
      return res.json();
    },
    onSuccess: (data: { assigned: number; skipped: number; blocked?: { id: number; reason: string }[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/prospects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/campaigns"] });
      const blockedCount = data.blocked?.length ?? 0;
      toast({
        title: "Leads assigned",
        description: `${data.assigned} assigned, ${data.skipped} skipped${blockedCount > 0 ? `, ${blockedCount} blocked` : ""}`,
      });
      setCampaignId("");
      onAssigned();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-theme="light">
        <DialogHeader><DialogTitle>Assign {prospectIds.length} lead{prospectIds.length !== 1 ? "s" : ""} to a campaign</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {/* Help cue — top-left of the input per DESIGN-SYSTEM hard rule */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/70" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-xs">
                  Only approved prospects with an email address are assigned. New / enriched / rejected prospects and anything held by the consent gate or blacklist are skipped automatically — the result toast shows the counts.
                </TooltipContent>
              </Tooltip>
              <label className="text-xs font-medium text-foreground">Campaign</label>
            </div>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger data-testid="assign-campaign-select">
                <SelectValue placeholder={isLoading ? "Loading campaigns..." : "Choose a campaign"} />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.metadata?.dry_run ? " · DRY RUN" : ""} · {c.platform} ({c.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isLoading && campaigns.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No campaigns yet — create one in the Campaigns tab first, then come back and assign these leads.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!campaignId || mutation.isPending}
            className="bg-[#0d3cfc] hover:bg-[#0b34d6]"
            data-testid="assign-campaign-confirm"
          >
            {mutation.isPending ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Per-prospect consent-block history (Lane OC) ───
   Lane OB logs every consent-gate block to prospect_events
   (event_type='blocked_consent', metadata.code). The existing
   GET /prospects/:id already returns those events — surfaced here, in the
   review dialog, because this is where the operator decides what to do
   with a held-back prospect. */
interface ProspectEventRow {
  id: number;
  event_type: string;
  summary: string | null;
  metadata: { code?: string; campaign_id?: number } | null;
  created_at: string;
}

function BlockedHistory({ prospectId, enabled }: { prospectId: number; enabled: boolean }) {
  const { data: blocks = [] } = useQuery<ProspectEventRow[]>({
    queryKey: ["/api/admin/outbound/prospects", prospectId, "blocked-events"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/outbound/prospects/${prospectId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`prospect detail failed (${res.status})`);
      const json = await res.json();
      return ((json.events ?? []) as ProspectEventRow[])
        .filter((e) => e.event_type === "blocked_consent")
        .slice(0, 5);
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  if (blocks.length === 0) return null;
  return (
    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg" data-testid="prospect-blocked-history">
      <div className="flex items-center gap-1.5">
        {/* Help cue — top-left of the component per DESIGN-SYSTEM hard rule */}
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="w-3 h-3 text-amber-700/70 cursor-default shrink-0" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px] text-xs">
            The consent gate blocked this prospect from outreach — most recent reasons below. Approving here records a human review, which lets medium/low-confidence contacts pass the gate (expired or missing CASL consent still blocks).
          </TooltipContent>
        </Tooltip>
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <p className="text-xs font-medium text-amber-700">Held back by the consent gate</p>
      </div>
      <ul className="mt-1.5 space-y-1">
        {blocks.map((b) => (
          <li key={b.id} className="text-[11px] text-amber-700 flex items-baseline gap-1.5">
            <span className="font-semibold shrink-0">{humanizeBlockCode(b.metadata?.code)}</span>
            <span className="text-amber-700/70">{new Date(b.created_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Review Dialog ─── */
function ReviewDialog({
  prospect,
  open,
  onClose,
}: {
  prospect: Prospect | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState<"approve" | "reject" | "blacklist" | "dnc" | "requeue">("approve");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/outbound/prospects/${prospect?.id}/review`, { action, notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/prospects"] });
      toast({ title: `Prospect ${action}d` });
      setNotes("");
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  if (!prospect) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Review: {prospect.business_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Why the consent gate held this prospect back (renders only when blocked) */}
          <BlockedHistory prospectId={prospect.id} enabled={open} />
          <div>
            <label className="text-xs font-medium text-muted-foreground">Action</label>
            <Select value={action} onValueChange={(v) => setAction(v as typeof action)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="requeue">Re-queue (email again later)</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
                <SelectItem value="blacklist">Blacklist</SelectItem>
                <SelectItem value="dnc">Do Not Contact</SelectItem>
              </SelectContent>
            </Select>
            {action === "requeue" && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Clears do-not-contact and returns this prospect to the sendable pool. Avoid for hard bounces (the address is invalid and will bounce again).
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Reason or notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={action === "approve" || action === "requeue" ? "bg-[#0d3cfc] hover:bg-[#0b34d6]" : "bg-red-600 hover:bg-red-700"}
          >
            {mutation.isPending ? "Saving..." : action.charAt(0).toUpperCase() + action.slice(1)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Artifact-first outreach card ─── */
function ArtifactStatsCard() {
  const { data, isLoading, isError } = useQuery<ArtifactStats>({
    queryKey: ["/api/admin/outbound/artifact-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/artifact-stats", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load artifact stats (${res.status})`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      {/* Title row + status pill */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-blue-600" />
          <h3 className="text-sm font-semibold text-foreground">Artifact-first outreach</h3>
        </div>
        {!isLoading && !isError && (
          data?.enabled ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
              <CheckCircle className="w-3 h-3" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
              <XCircle className="w-3 h-3" />
              Off
            </span>
          )
        )}
      </div>

      {!isLoading && !isError && !data?.enabled && (
        <p className="mt-1 text-xs text-muted-foreground">
          Set <code className="font-mono text-[11px]">ARTIFACT_OUTREACH_ENABLED</code> to start.
        </p>
      )}

      {isLoading ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/60 animate-pulse" />
            ))}
          </div>
          <div className="h-24 rounded-lg bg-muted/60 animate-pulse" />
        </div>
      ) : isError ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          Couldn't load artifact stats. Retrying…
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/40 rounded-lg border border-border p-3">
              <p className="text-xl font-bold text-foreground whitespace-nowrap">{data?.generated ?? 0}</p>
              <p className="text-xs text-muted-foreground">Generated</p>
            </div>
            <div className="bg-green-50 rounded-lg border border-green-200 p-3">
              <p className="text-xl font-bold text-green-600 whitespace-nowrap">{data?.viewed ?? 0}</p>
              <p className="text-xs text-green-700">Opened — hot leads</p>
            </div>
            <div className="bg-muted/40 rounded-lg border border-border p-3">
              <p className="text-xl font-bold text-amber-600 whitespace-nowrap">{data?.pending ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="bg-muted/40 rounded-lg border border-border p-3">
              <p className="text-xl font-bold text-red-500 whitespace-nowrap">{data?.failed ?? 0}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>

          {/* Recent reports */}
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent reports</p>
            {(data?.recent?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  No audit artifacts generated yet — approve prospects with a Google place_id and enable the flag.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {(data?.recent ?? []).slice(0, 8).map((r) => (
                  <li key={r.prospect_id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground truncate">{r.business || "—"}</span>
                        {r.viewed_at && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 shrink-0">
                            Opened <CheckCircle className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      {r.headline && (
                        <p className="text-xs text-muted-foreground truncate">{r.headline}</p>
                      )}
                    </div>
                    {r.score != null && (
                      <span className="text-xs font-semibold text-foreground whitespace-nowrap shrink-0">
                        {r.score}/100{r.grade ? ` ${r.grade}` : ""}
                      </span>
                    )}
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-brand-blue-600 shrink-0"
                        title="Open audit report"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function ProspectsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [csvOpen, setCsvOpen] = useState(false);
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewProspect, setReviewProspect] = useState<Prospect | null>(null);
  const [templateRow, setTemplateRow] = useState<{ prospect: Prospect; enrichment: ProspectEnrichment | null } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
  params.set("limit", "100");

  const { data, isLoading, isError, refetch } = useQuery<{ data: ProspectRow[]; total: number }>({
    queryKey: ["/api/admin/outbound/prospects", search, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/outbound/prospects?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load prospects");
      return res.json();
    },
  });

  const { data: overview } = useQuery({
    queryKey: ["/api/admin/outbound/overview"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/overview", { credentials: "include" });
      return res.json();
    },
  });

  const enrichBatch = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/outbound/enrich/batch", {
        prospect_ids: selected.length > 0 ? selected : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/prospects"] });
      toast({ title: "Enrichment complete", description: `${data.enriched} enriched, ${data.failed} failed` });
      setSelected([]);
    },
  });

  const toggleSelect = (id: number) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const rows = data?.data ?? [];

  return (
    <AdminLayout pageContext={{ page: "outbound-prospects", section: "Outbound" }}>
      <div className="space-y-4">
        {/* Artifact-first outreach */}
        <ArtifactStatsCard />

        {/* Header — stacks on mobile so the title doesn't collide with the
            action buttons at 375px; row layout from sm up. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Lead Review Queue</h2>
            <p className="text-sm text-muted-foreground">{overview?.total_prospects ?? 0} total prospects</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => enrichBatch.mutate()}
                  disabled={enrichBatch.isPending}
                  className="gap-1.5"
                >
                  <Brain className="w-3.5 h-3.5" />
                  {enrichBatch.isPending ? "Enriching..." : `AI Enrich (${selected.length})`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAssignOpen(true)}
                  className="gap-1.5"
                  data-testid="assign-to-campaign-button"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  {`Assign to Campaign (${selected.length})`}
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setScrapeOpen(true)}>
              <Search className="w-3.5 h-3.5" />
              Scrape Leads
            </Button>
            <Button size="sm" className="bg-[#0d3cfc] hover:bg-[#0b34d6] gap-1.5" onClick={() => setCsvOpen(true)}>
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "New", value: overview?.new, color: "text-foreground" },
            { label: "Enriched", value: overview?.enriched, color: "text-blue-600" },
            { label: "Approved", value: overview?.approved, color: "text-green-600" },
            { label: "In Outreach", value: overview?.in_outreach, color: "text-brand-blue-600" },
            { label: "Replied", value: overview?.replied, color: "text-amber-600" },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-lg border border-border p-3">
              <p className={`text-xl font-bold ${s.color}`}>{s.value ?? 0}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 bg-card p-3 rounded-lg border border-border">
          <Input
            placeholder="Search name, email, domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8 text-sm"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="enriched">Enriched</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="campaign_queued">Campaign Queued</SelectItem>
              <SelectItem value="in_outreach">In Outreach</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
              <SelectItem value="opted_out">Opted Out</SelectItem>
              <SelectItem value="blacklisted">Blacklisted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading prospects...</div>
          ) : isError ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">Couldn't load prospects</p>
              <p className="text-xs text-muted-foreground mb-3">The server returned an error. This is a backend failure, not an empty list.</p>
              <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            search || statusFilter !== "all" ? (
              /* Filters active — an empty result is a filter miss, not a
                 first-run state; don't show onboarding here. */
              <div className="p-8 text-center text-sm text-muted-foreground">
                No prospects match the current filters.
              </div>
            ) : (
              /* First-run quick-start: the bare "No prospects found" left new
                 operators with no path to a first campaign. */
              <div className="p-8 flex justify-center">
                <div className="max-w-md w-full bg-muted/40 border border-border rounded-lg p-4 text-left" data-testid="prospects-quick-start">
                  <p className="text-sm font-semibold text-foreground">No prospects yet — launch your first campaign</p>
                  <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground list-none">
                    {[
                      <>Import leads (<button onClick={() => setCsvOpen(true)} className="text-brand-blue-600 underline">CSV</button> or <button onClick={() => setScrapeOpen(true)} className="text-brand-blue-600 underline">Scrape</button>)</>,
                      <>AI Enrich to score them</>,
                      <>Review &amp; approve the good ones</>,
                      <>Create a campaign (Campaigns tab)</>,
                      <>Assign approved leads to the campaign</>,
                      <>Push to your sending platform</>,
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-blue-100 text-brand-blue-700 text-[10px] font-bold shrink-0 mt-px">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="w-8 px-3 py-2.5 text-left">
                    <input type="checkbox" className="rounded" onChange={(e) => {
                      setSelected(e.target.checked ? rows.map((r) => r.prospect.id) : []);
                    }} checked={selected.length === rows.length && rows.length > 0} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Business</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Trade / City</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-0.5 cursor-default">
                          Score <HelpCircle className="w-3 h-3 text-muted-foreground/70" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        AI quality score (0–100). Run AI Enrich to populate. Higher = better fit for outreach.
                      </TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-0.5 cursor-default">
                          Priority <HelpCircle className="w-3 h-3 text-muted-foreground/70" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs">
                        Priority score (0–100). Computed from website presence, reviews, phone availability, and contact confidence. Higher = push to campaign sooner.
                      </TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-0.5 cursor-default">
                          Artifact <HelpCircle className="w-3 h-3 text-muted-foreground/70" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[260px] text-xs">
                        The personalized audit report generated for this prospect's business. "Viewed" means the prospect opened their report — a strong buy signal worth a fast follow-up.
                      </TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">AI Notes</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ prospect: p, enrichment: e }) => (
                  <tr key={p.id} className={`hover:bg-muted/50 transition-colors ${selected.includes(p.id) ? "bg-brand-blue-50/60 ring-1 ring-inset ring-brand-blue-300" : ""}`}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-foreground max-w-[180px] truncate">{p.business_name}</p>
                      {p.website_domain && (
                        <a
                          href={`https://${p.website_domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                        >
                          <Globe className="w-3 h-3" />{p.website_domain}
                        </a>
                      )}
                      {p.google_rating && (
                        <span className="text-xs text-muted-foreground/70 flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-amber-400" />
                          {p.google_rating} ({p.google_review_count ?? 0})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {p.primary_email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /><span className="truncate max-w-[160px]">{p.primary_email}</span></div>}
                      {p.primary_phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.primary_phone}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      <p className="capitalize">{p.trade_category || "—"}</p>
                      <p className="text-muted-foreground/70">{[p.city, p.state].filter(Boolean).join(", ")}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ScoreBadge score={e?.quality_score ?? null} />
                    </td>
                    <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                      {p.priority_score != null ? (
                        <span className="flex items-center justify-center gap-0.5">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span className="text-xs font-semibold text-amber-600">{p.priority_score}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                      {e?.artifact_url ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <a
                            href={e.artifact_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-blue-600 hover:underline"
                            title="Open audit report"
                            data-testid={`prospect-artifact-link-${p.id}`}
                          >
                            <ExternalLink className="w-3 h-3" />
                            {e.artifact_score != null ? `${e.artifact_score}/100` : "Report"}
                          </a>
                          {e.artifact_viewed_at && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 cursor-default">
                                  Viewed <CheckCircle className="w-3 h-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[220px] text-xs">
                                Prospect opened their report {new Date(e.artifact_viewed_at).toLocaleString()} — buy signal, follow up fast.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      {e?.ai_notes ? (
                        <p className="text-xs text-muted-foreground line-clamp-2">{e.ai_notes}</p>
                      ) : e?.enrichment_source === "heuristic" ? (
                        <span className="text-xs text-muted-foreground/70">No AI yet · run AI Enrich ↑</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* "Preview", not "Copy" — the old label read as a
                            clipboard action; this opens the outreach-copy
                            preview dialog (which has its own Copy button). */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          title="Preview outreach copy and copy to clipboard"
                          onClick={() => setTemplateRow({ prospect: p, enrichment: e ?? null })}
                        >
                          <FileText className="w-3 h-3" />
                          Preview
                        </Button>
                        {["new", "enriched"].includes(p.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setReviewProspect(p)}
                          >
                            Review
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ScrapeLeadsDialog open={scrapeOpen} onClose={() => setScrapeOpen(false)} />
      <CsvUploadDialog open={csvOpen} onClose={() => setCsvOpen(false)} />
      <AssignToCampaignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        prospectIds={selected}
        onAssigned={() => setSelected([])}
      />
      <ReviewDialog prospect={reviewProspect} open={!!reviewProspect} onClose={() => setReviewProspect(null)} />
      <TemplatePreview
        prospect={templateRow?.prospect ?? null}
        enrichment={templateRow?.enrichment ?? null}
        open={!!templateRow}
        onClose={() => setTemplateRow(null)}
      />
    </AdminLayout>
  );
}
