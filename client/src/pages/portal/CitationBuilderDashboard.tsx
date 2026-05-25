/**
 * Citation Builder — customer portal dashboard.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25). Lists the customer's
 * one-time Citation Builder orders with progress bar, status badge,
 * business-info card, and link back to the marketing page to start
 * another submission.
 *
 * Hits the routes in server/routes/citationBuilderRoutes.ts.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import { CheckCircle2, Clock, AlertCircle, ArrowRight, FileText } from "lucide-react";

interface BusinessInfo {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  categories?: string[];
}

interface SubmissionRow {
  id: string;
  tier: "starter" | "pro" | "premium";
  business_info: BusinessInfo;
  status: "pending" | "in_progress" | "awaiting_info" | "completed";
  created_at: string;
  completed_at: string | null;
  directories_submitted_count: number;
  directories_total: number;
  notes: string | null;
}

interface SubmissionsResp {
  submissions: SubmissionRow[];
  total: number;
  page: number;
  limit: number;
}

const TIER_LABEL: Record<SubmissionRow["tier"], string> = {
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

const TIER_PRICE: Record<SubmissionRow["tier"], number> = {
  starter: 79,
  pro: 179,
  premium: 299,
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function StatusBadge({ status }: { status: SubmissionRow["status"] }) {
  const map: Record<SubmissionRow["status"], { label: string; bg: string; fg: string; Icon: typeof CheckCircle2 }> = {
    pending: { label: "Pending", bg: "rgba(245,158,11,0.12)", fg: "#b45309", Icon: Clock },
    in_progress: { label: "In progress", bg: "rgba(13,60,252,0.10)", fg: "#0d3cfc", Icon: Clock },
    awaiting_info: { label: "Awaiting info", bg: "rgba(244,63,94,0.10)", fg: "#be123c", Icon: AlertCircle },
    completed: { label: "Completed", bg: "rgba(22,163,74,0.12)", fg: "#15803d", Icon: CheckCircle2 },
  };
  const v = map[status];
  const Icon = v.Icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: v.bg,
        color: v.fg,
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 999,
      }}
    >
      <Icon size={12} />
      {v.label}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(0,0,0,0.55)", marginBottom: 4 }}>
        <span>{done} / {total} directories</span>
        <span>{pct}%</span>
      </div>
      <div
        style={{
          height: 6,
          width: "100%",
          background: "rgba(0,0,0,0.06)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: pct === 100 ? "#16a34a" : "#0d3cfc",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

function SubmissionCard({ row }: { row: SubmissionRow }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0d3cfc", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {TIER_LABEL[row.tier]} · ${TIER_PRICE[row.tier]}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginTop: 2 }}>
            {row.business_info?.name || "Untitled submission"}
          </div>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>
            Ordered {fmtDate(row.created_at)}
            {row.completed_at && <> · Completed {fmtDate(row.completed_at)}</>}
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <ProgressBar done={row.directories_submitted_count} total={row.directories_total} />

      <div style={{ marginTop: 14, padding: 12, background: "rgba(236,242,244,0.5)", borderRadius: 10, fontSize: 13, lineHeight: 1.6, color: "rgba(0,0,0,0.7)" }}>
        <div style={{ fontWeight: 600, color: "#111827", marginBottom: 6 }}>Business info</div>
        {row.business_info?.address && <div>{row.business_info.address}</div>}
        {row.business_info?.phone && <div>{row.business_info.phone}</div>}
        {row.business_info?.website && <div>{row.business_info.website}</div>}
        {row.business_info?.categories?.length ? (
          <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
            Categories: {row.business_info.categories.join(", ")}
          </div>
        ) : null}
      </div>

      {row.notes && (
        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.6)", lineHeight: 1.5 }}>
          <FileText size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
          {row.notes}
        </div>
      )}
    </Card>
  );
}

export default function CitationBuilderDashboard() {
  usePageTitle("Citation Builder · Portal");

  const submissionsQ = useQuery<SubmissionsResp>({
    queryKey: ["/api/citation-builder/submissions"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/citation-builder/submissions");
      return await r.json();
    },
  });

  return (
    <PortalLayout>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111827" }}>Citation Builder</h1>
            <div style={{ fontSize: 14, color: "rgba(0,0,0,0.62)", marginTop: 4 }}>
              One-time submission orders + completion progress.
            </div>
          </div>
          <Link href="/citation-builder">
            <Button>
              Start new submission <ArrowRight size={14} style={{ marginLeft: 6 }} />
            </Button>
          </Link>
        </div>

        {submissionsQ.isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton style={{ height: 160 }} />
            <Skeleton style={{ height: 160 }} />
          </div>
        )}

        {submissionsQ.isError && (
          <Card style={{ padding: 16, background: "rgba(244,63,94,0.06)", borderColor: "rgba(244,63,94,0.20)" }}>
            <div style={{ fontSize: 14, color: "#be123c" }}>
              Couldn't load submissions. Refresh to retry — or email support@wefixtrades.com.
            </div>
          </Card>
        )}

        {submissionsQ.data && submissionsQ.data.submissions.length === 0 && (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
              No Citation Builder orders yet
            </div>
            <div style={{ fontSize: 14, color: "rgba(0,0,0,0.62)", marginBottom: 18 }}>
              Citation Builder gets your business listed on 25–100+ directories. One-time, no subscription.
            </div>
            <Link href="/citation-builder">
              <Button>
                View tiers <ArrowRight size={14} style={{ marginLeft: 6 }} />
              </Button>
            </Link>
          </Card>
        )}

        {submissionsQ.data && submissionsQ.data.submissions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {submissionsQ.data.submissions.map(row => (
              <SubmissionCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
