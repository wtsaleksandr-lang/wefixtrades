/**
 * Admin Learning Pipeline page (Phase D v1).
 *
 * Three sections:
 *   1. Researcher AI manual trigger — click per niche to queue research
 *   2. Training-budget slider — UI-only for v1 (informational tier list)
 *   3. Learning candidates queue — list of pending suggestions, approve/reject
 *
 * Mounted at /admin/tradeline/learning.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Search, Sparkles, ThumbsUp, ThumbsDown, ExternalLink, AlertCircle } from "lucide-react";
import { NICHE_CARDS } from "@/data/tradelineNicheCards";

const NICHES = Object.keys(NICHE_CARDS).sort();

interface Candidate {
  id: number;
  niche: string;
  template_kind: "tradeline" | "concierge";
  kind: "research" | "conversation" | "manual";
  source_url: string | null;
  title: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface BudgetTier {
  id: string;
  label: string;
  monthlyEstimate: string;
  description: string;
}

interface BudgetResponse {
  activeTier: string;
  tiers: BudgetTier[];
}

export default function TradelineLearningPage() {
  usePageTitle("Learning pipeline");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const candidates = useQuery<{ rows: Candidate[] }>({
    queryKey: ["/api/admin/tradeline/learning-candidates", statusFilter],
    queryFn: () => {
      const url = statusFilter === "all"
        ? "/api/admin/tradeline/learning-candidates"
        : `/api/admin/tradeline/learning-candidates?status=${statusFilter}`;
      return fetch(url, { credentials: "include" }).then((r) => r.json());
    },
  });

  const budget = useQuery<BudgetResponse>({
    queryKey: ["/api/admin/tradeline/training-budget"],
    queryFn: () => fetch("/api/admin/tradeline/training-budget", { credentials: "include" }).then((r) => r.json()),
  });

  const filteredNiches = search.trim()
    ? NICHES.filter((n) => n.includes(search.toLowerCase().trim()))
    : NICHES;

  const trigger = useMutation({
    mutationFn: async ({ niche, kind }: { niche: string; kind: "tradeline" | "concierge" }) => {
      const res = await fetch(`/api/admin/tradeline/research/${niche}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ template_kind: kind }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Trigger failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline/learning-candidates"] });
    },
  });

  return (
    <AdminLayout>
      <div data-theme="light" className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learning pipeline</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Improve niche AI templates over time. Trigger Researcher AI scans manually,
            or wait for the background learning loop (v1.5) to surface candidates
            extracted from real conversations.
          </p>
        </div>

        {/* Training budget */}
        <Card className="p-5">
          <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" /> Training budget
          </h2>
          <p className="text-xs text-gray-600 mb-3 max-w-2xl">
            Picks the AI tier used for summarization + trainer steps. V1: informational only —
            settings are not yet wired to a live pipeline. The pipeline activates in v1.5.
          </p>
          {budget.isLoading && <Skeleton className="h-24" />}
          {budget.data && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {budget.data.tiers.map((t) => {
                const active = t.id === budget.data.activeTier;
                return (
                  <div
                    key={t.id}
                    className={`rounded-lg p-3 border ${active ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white"}`}
                  >
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-900">{t.label}</span>
                      <span className="text-[10px] text-gray-500">{t.monthlyEstimate}/mo</span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-snug">{t.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Researcher trigger */}
        <Card className="p-5">
          <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-600" /> Manual Researcher trigger
          </h2>
          <p className="text-xs text-gray-600 mb-3 max-w-2xl">
            Queue an AI research pass against the niche source whitelist (NFPA, EPA, OSHA, state
            licensing boards). V1 creates a placeholder candidate; v1.5 replaces with the real
            Anthropic web-search call.
          </p>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter niches…"
            className="w-full sm:max-w-sm mb-3 px-3 py-2 rounded-md border border-gray-300 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredNiches.map((niche) => (
              <div key={niche} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                <span className="text-sm font-medium text-gray-900 capitalize">{niche.replace(/_/g, " ")}</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-7 px-2"
                    onClick={() => trigger.mutate({ niche, kind: "tradeline" })}
                    disabled={trigger.isPending}
                    title="Research for the customer-facing TradeLine receptionist"
                  >
                    Receptionist
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-7 px-2"
                    onClick={() => trigger.mutate({ niche, kind: "concierge" })}
                    disabled={trigger.isPending}
                    title="Research for the trade-facing Portal Concierge"
                  >
                    Concierge
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Candidates queue */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-indigo-600" /> Candidate queue
              </h2>
              <p className="text-xs text-gray-600">
                Suggested improvements awaiting your review. Approving doesn't auto-write to templates
                — you still apply the change manually via /admin/tradeline/templates.
              </p>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${statusFilter === s ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-200 text-gray-700"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {candidates.isLoading && <Skeleton className="h-32" />}
          {candidates.data && candidates.data.rows.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No candidates match this filter.</p>
          )}
          <div className="space-y-2">
            {(candidates.data?.rows ?? []).map((c) => (
              <CandidateRow key={c.id} candidate={c} />
            ))}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const queryClient = useQueryClient();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const patch = useMutation({
    mutationFn: async (body: { status: "approved" | "rejected"; rejection_reason?: string }) => {
      const res = await fetch(`/api/admin/tradeline/learning-candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Patch failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline/learning-candidates"] });
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className="text-[10px] bg-indigo-50 border-indigo-200 text-indigo-800">
              {candidate.niche.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {candidate.template_kind}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">
              {candidate.kind}
            </Badge>
            <StatusBadge status={candidate.status} />
          </div>
          <div className="text-sm font-medium text-gray-900">{candidate.title}</div>
        </div>
        {candidate.status === "pending" && (
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => patch.mutate({ status: "approved" })} disabled={patch.isPending}>
              <ThumbsUp className="w-3.5 h-3.5 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(!showReject)} disabled={patch.isPending}>
              <ThumbsDown className="w-3.5 h-3.5 mr-1" /> Reject
            </Button>
          </div>
        )}
      </div>
      <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 border border-gray-100 rounded px-3 py-2">{candidate.body}</pre>
      {candidate.source_url && (
        <a href={candidate.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 inline-flex items-center gap-0.5 mt-2">
          source <ExternalLink className="w-2.5 h-2.5" />
        </a>
      )}
      {candidate.rejection_reason && (
        <p className="text-xs text-rose-700 mt-2">Rejected: {candidate.rejection_reason}</p>
      )}
      {showReject && (
        <div className="mt-2 space-y-2">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why rejected? (visible in audit log)" rows={2} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              patch.mutate({ status: "rejected", rejection_reason: reason });
              setShowReject(false);
              setReason("");
            }}
            disabled={patch.isPending}
          >
            Confirm reject
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-50 border-amber-200 text-amber-800",
    approved: "bg-emerald-50 border-emerald-200 text-emerald-800",
    rejected: "bg-rose-50 border-rose-200 text-rose-800",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[status] || ""}`}>
      {status}
    </Badge>
  );
}
