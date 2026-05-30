import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Globe, Phone, Mail, Star, ChevronRight, HelpCircle } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

/* ─── Types ─── */
interface Opportunity {
  id: number;
  prospect_id: number;
  stage: string;
  notes: string | null;
  lost_reason: string | null;
  positive_reply_at: string | null;
  booked_call_at: string | null;
  trial_started_at: string | null;
  paid_at: string | null;
  created_at: string;
}

interface PipelineRow {
  opportunity: Opportunity;
  prospect: {
    id: number;
    business_name: string;
    primary_email: string | null;
    primary_phone: string | null;
    website_domain: string | null;
    trade_category: string | null;
    city: string | null;
    state: string | null;
    google_rating: string | null;
    google_review_count: number | null;
  } | null;
  enrichment: {
    quality_score: number | null;
    ai_personalization_line: string | null;
    ai_notes: string | null;
  } | null;
}

interface PipelineData {
  stages: Record<string, PipelineRow[]>;
  total: number;
}

/* ─── Stage configuration ─── */
const STAGES = [
  { key: "positive_reply", label: "Positive Reply", color: "border-amber-400 bg-amber-50", badge: "bg-amber-100 text-amber-700" },
  { key: "booked_call", label: "Booked Call", color: "border-blue-400 bg-blue-50", badge: "bg-blue-100 text-blue-700" },
  { key: "trial_started", label: "Trial Started", color: "border-brand-blue-400 bg-brand-blue-50", badge: "bg-brand-blue-100 text-brand-blue-700" },
  { key: "paid", label: "Paid", color: "border-green-500 bg-green-50", badge: "bg-green-100 text-green-700" },
  { key: "lost", label: "Lost", color: "border-gray-300 bg-gray-50", badge: "bg-gray-100 text-gray-600" },
] as const;

/* ─── Stage Move Dialog ─── */
function MoveStageDlg({
  opportunity,
  open,
  onClose,
}: {
  opportunity: Opportunity | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState("");
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/outbound/pipeline/${opportunity?.id}`, {
        stage,
        notes: notes || undefined,
        lost_reason: stage === "lost" ? lostReason || undefined : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/pipeline"] });
      toast({ title: `Moved to ${stage.replace("_", " ")}` });
      setStage("");
      setNotes("");
      setLostReason("");
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-theme="light" className="sm:max-w-md">
        <DialogHeader><DialogTitle>Move Pipeline Stage</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">New Stage</label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue placeholder="Select stage..." /></SelectTrigger>
              <SelectContent>
                {STAGES.filter((s) => s.key !== opportunity?.stage).map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {stage === "lost" && (
            <div>
              <label className="text-xs font-medium text-gray-600">Lost Reason</label>
              <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Price, timing, not a fit..." />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!stage || mutation.isPending} className="bg-[#0d3cfc] hover:bg-[#0b34d6]">
            {mutation.isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Opportunity Card ─── */
function OpportunityCard({
  row,
  onMove,
}: {
  row: PipelineRow;
  onMove: (opp: Opportunity) => void;
}) {
  const { opportunity: opp, prospect: p, enrichment: e } = row;
  const score = e?.quality_score;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900 leading-snug line-clamp-1">{p?.business_name || "Unknown"}</p>
        {score !== null && score !== undefined && (
          <span className={`text-xs font-bold shrink-0 ${score >= 70 ? "text-green-600" : score >= 45 ? "text-amber-600" : "text-red-500"}`}>
            {score}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 capitalize">{p?.trade_category} · {[p?.city, p?.state].filter(Boolean).join(", ")}</p>

      {(p?.primary_email || p?.primary_phone || p?.website_domain) && (
        <div className="mt-1.5 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500">
          {p?.primary_email && (
            <span className="flex items-center gap-0.5 truncate max-w-[140px]">
              <Mail className="w-3 h-3 shrink-0" />{p.primary_email}
            </span>
          )}
          {p?.primary_phone && (
            <span className="flex items-center gap-0.5">
              <Phone className="w-3 h-3 shrink-0" />{p.primary_phone}
            </span>
          )}
          {p?.website_domain && (
            <a
              href={`https://${p.website_domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-blue-500 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Globe className="w-3 h-3 shrink-0" />{p.website_domain}
            </a>
          )}
        </div>
      )}

      {e?.ai_notes && (
        <p className="mt-2 text-xs text-gray-400 italic line-clamp-2">{e.ai_notes}</p>
      )}

      {opp.notes && (
        <p className="mt-1.5 text-xs text-gray-600 bg-gray-50 rounded p-1.5 line-clamp-2">{opp.notes}</p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {opp.positive_reply_at ? new Date(opp.positive_reply_at).toLocaleDateString() : new Date(opp.created_at).toLocaleDateString()}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2 text-[#0d3cfc] hover:bg-[#EEF3FF]"
          onClick={() => onMove(opp)}
        >
          Move <ChevronRight className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function PipelinePage() {
  const [moveOpp, setMoveOpp] = useState<Opportunity | null>(null);

  const { data, isLoading } = useQuery<PipelineData>({
    queryKey: ["/api/admin/outbound/pipeline"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/pipeline", { credentials: "include" });
      return res.json();
    },
  });

  const stages = data?.stages ?? {};
  const total = data?.total ?? 0;

  // Revenue estimate: paid count × avg deal value ($297/mo)
  const paidCount = (stages["paid"] ?? []).length;
  const revenueEstimate = paidCount * 297;

  return (
    <AdminLayout pageContext={{ page: "outbound-pipeline", section: "Outbound" }}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Sales Pipeline</h2>
            <p className="text-sm text-gray-500">{total} opportunities · Est. MRR from paid: ${revenueEstimate.toLocaleString()}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-sm text-gray-400">
            Loading pipeline...
          </div>
        ) : total === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-500">No opportunities yet.</p>
            <p className="text-xs text-gray-400 mt-1">Opportunities are created automatically when a prospect replies to an outreach email.</p>
          </div>
        ) : (
          /* Kanban board */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 min-h-[500px]">
            {STAGES.map((stage) => {
              const rows = stages[stage.key] ?? [];
              return (
                <div key={stage.key} className={`rounded-lg border-t-4 ${stage.color} p-3 flex flex-col gap-2`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-0.5">
                      {stage.label}
                      {stage.key === "positive_reply" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-gray-400 cursor-default shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[240px] text-xs">
                            Created automatically when a prospect replies to an outreach email and the reply is classified as positive or neutral.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </h3>
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${stage.badge}`}>{rows.length}</span>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto max-h-[600px]">
                    {rows.map((row) => (
                      <OpportunityCard key={row.opportunity.id} row={row} onMove={setMoveOpp} />
                    ))}
                    {rows.length === 0 && (
                      <p className="text-xs text-gray-400 text-center pt-4">Empty</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MoveStageDlg opportunity={moveOpp} open={!!moveOpp} onClose={() => setMoveOpp(null)} />
    </AdminLayout>
  );
}
