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
  Star, Upload, Brain, RefreshCw, ChevronDown, FileText, Zap,
} from "lucide-react";
import { TemplatePreview } from "@/components/outbound/TemplatePreview";

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

/* ─── Status badge ─── */
const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-700",
  enriched: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
  blacklisted: "bg-red-200 text-red-800",
  campaign_queued: "bg-purple-100 text-purple-700",
  in_outreach: "bg-indigo-100 text-indigo-700",
  replied: "bg-amber-100 text-amber-700",
  lost: "bg-gray-200 text-gray-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>;
  const color = score >= 70 ? "text-green-600" : score >= 45 ? "text-amber-600" : "text-red-500";
  return <span className={`text-sm font-bold ${color}`}>{score}</span>;
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
            <label className="text-xs font-medium text-gray-600">Filename (optional)</label>
            <Input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="outscraper-plumbers-miami.csv" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">CSV Data (paste content)</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="font-mono text-xs"
              placeholder={"name,email,phone,site,city,state,rating,reviews,category\nABC Plumbing,owner@abcplumbing.com,555-1234,abcplumbing.com,Miami,FL,4.8,47,plumber"}
            />
          </div>
          <p className="text-xs text-gray-500">
            Outscraper columns auto-mapped: name, email, phone, site/website, city, state, rating, reviews, category, place_id, full_address, owner, country.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!text.trim() || mutation.isPending}
            className="bg-[#2D6A4F] hover:bg-[#1B4332]"
          >
            {mutation.isPending ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [action, setAction] = useState<"approve" | "reject" | "blacklist" | "dnc">("approve");

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
          <div>
            <label className="text-xs font-medium text-gray-600">Action</label>
            <Select value={action} onValueChange={(v) => setAction(v as typeof action)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
                <SelectItem value="blacklist">Blacklist</SelectItem>
                <SelectItem value="dnc">Do Not Contact</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Reason or notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={action === "approve" ? "bg-[#2D6A4F] hover:bg-[#1B4332]" : "bg-red-600 hover:bg-red-700"}
          >
            {mutation.isPending ? "Saving..." : action.charAt(0).toUpperCase() + action.slice(1)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ─── */
export default function ProspectsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [csvOpen, setCsvOpen] = useState(false);
  const [reviewProspect, setReviewProspect] = useState<Prospect | null>(null);
  const [templateRow, setTemplateRow] = useState<{ prospect: Prospect; enrichment: ProspectEnrichment | null } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
  params.set("limit", "100");

  const { data, isLoading } = useQuery<{ data: ProspectRow[]; total: number }>({
    queryKey: ["/api/admin/outbound/prospects", search, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/outbound/prospects?${params}`, { credentials: "include" });
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lead Review Queue</h2>
            <p className="text-sm text-gray-500">{overview?.total_prospects ?? 0} total prospects</p>
          </div>
          <div className="flex gap-2">
            {selected.length > 0 && (
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
            )}
            <Button size="sm" className="bg-[#2D6A4F] hover:bg-[#1B4332] gap-1.5" onClick={() => setCsvOpen(true)}>
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "New", value: overview?.new, color: "text-gray-700" },
            { label: "Enriched", value: overview?.enriched, color: "text-blue-600" },
            { label: "Approved", value: overview?.approved, color: "text-green-600" },
            { label: "In Outreach", value: overview?.in_outreach, color: "text-indigo-600" },
            { label: "Replied", value: overview?.replied, color: "text-amber-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-3">
              <p className={`text-xl font-bold ${s.color}`}>{s.value ?? 0}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 bg-white p-3 rounded-lg border border-gray-200">
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
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading prospects...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No prospects found.{" "}
              <button onClick={() => setCsvOpen(true)} className="text-[#2D6A4F] underline">Import a CSV</button> to get started.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-8 px-3 py-2.5 text-left">
                    <input type="checkbox" className="rounded" onChange={(e) => {
                      setSelected(e.target.checked ? rows.map((r) => r.prospect.id) : []);
                    }} checked={selected.length === rows.length && rows.length > 0} />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Business</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Contact</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Trade / City</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">Score</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 hidden lg:table-cell">Priority</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">AI Notes</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ prospect: p, enrichment: e }) => (
                  <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${selected.includes(p.id) ? "bg-green-50" : ""}`}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900 max-w-[180px] truncate">{p.business_name}</p>
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
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-amber-400" />
                          {p.google_rating} ({p.google_review_count ?? 0})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">
                      {p.primary_email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /><span className="truncate max-w-[160px]">{p.primary_email}</span></div>}
                      {p.primary_phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.primary_phone}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">
                      <p className="capitalize">{p.trade_category || "—"}</p>
                      <p className="text-gray-400">{[p.city, p.state].filter(Boolean).join(", ")}</p>
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
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      {e?.ai_notes ? (
                        <p className="text-xs text-gray-500 line-clamp-2">{e.ai_notes}</p>
                      ) : e?.enrichment_source === "heuristic" ? (
                        <span className="text-xs text-gray-400 italic">Heuristic only</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          title="Preview outreach copy"
                          onClick={() => setTemplateRow({ prospect: p, enrichment: e ?? null })}
                        >
                          <FileText className="w-3 h-3" />
                          Copy
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

      <CsvUploadDialog open={csvOpen} onClose={() => setCsvOpen(false)} />
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
