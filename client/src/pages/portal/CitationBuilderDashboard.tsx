/**
 * CiteFlow — customer portal dashboard.
 *
 * This is the "status dashboard + completion report" the tiers are sold on.
 * Everything it renders comes from rows an operator wrote in the admin
 * fulfilment queue: `directories` is the per-listing record, and the only
 * state shown as a listing is `live`, which the server refuses to record
 * without its URL.
 *
 * What it deliberately does NOT do: infer, project, or estimate. An order
 * nobody has started shows "not started yet" and the tier's coverage — not a
 * 0-of-N progress bar against a checklist that does not exist. A directory
 * that rejected the business says so, with the operator's reason, rather
 * than being quietly dropped from the denominator.
 *
 * Wave 3.5 shipped this reading a counter that nothing ever incremented
 * (2026-05-25); rewired to real fulfilment records 2026-08-29.
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
import { CheckCircle2, Clock, AlertCircle, ArrowRight, FileText, ExternalLink, MinusCircle, XCircle } from "lucide-react";

interface BusinessInfo {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  categories?: string[];
}

type DirectoryStatus = "not_started" | "submitted" | "live" | "rejected" | "not_applicable";

interface DirectoryRow {
  id: string;
  directory_id: string;
  directory_name: string;
  status: DirectoryStatus;
  /** Only ever populated when status is "live". */
  listing_url: string | null;
  note: string | null;
  live_at: string | null;
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
  /** Operator-recorded rows. Empty until the order is started. */
  directories: DirectoryRow[];
  /** How many listings this tier covers, from the submission registry. */
  tier_directory_count: number;
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

/**
 * Progress is the count of listings VERIFIED LIVE over the count actually
 * assigned to an operator. Both numbers are recorded facts — neither is the
 * tier's marketing figure.
 */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(0,0,0,0.55)", marginBottom: 4 }}>
        <span>{done} / {total} listings live</span>
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

const DIRECTORY_STATUS_META: Record<DirectoryStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  live: { label: "Live", color: "#15803d", Icon: CheckCircle2 },
  submitted: { label: "Submitted — awaiting the directory", color: "#0d3cfc", Icon: Clock },
  rejected: { label: "Not accepted", color: "#be123c", Icon: XCircle },
  not_applicable: { label: "Doesn't apply to your business", color: "rgba(0,0,0,0.5)", Icon: MinusCircle },
  not_started: { label: "Not started", color: "rgba(0,0,0,0.45)", Icon: Clock },
};

/**
 * The per-listing record. Ordered so the useful half is at the top: live
 * listings first (they carry the link the customer wants), then work in
 * flight, then the outcomes that need the operator's explanation.
 */
const DIRECTORY_ORDER: DirectoryStatus[] = ["live", "submitted", "not_started", "rejected", "not_applicable"];

function DirectoryList({ rows }: { rows: DirectoryRow[] }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort(
    (a, b) =>
      DIRECTORY_ORDER.indexOf(a.status) - DIRECTORY_ORDER.indexOf(b.status) ||
      a.directory_name.localeCompare(b.directory_name),
  );
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.55)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Every listing, and where it got to
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map(d => {
          const meta = DIRECTORY_STATUS_META[d.status] ?? DIRECTORY_STATUS_META.not_started;
          const Icon = meta.Icon;
          return (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 13,
                lineHeight: 1.5,
                padding: "6px 8px",
                borderRadius: 8,
                background: "rgba(236,242,244,0.45)",
              }}
              data-testid={`portal-directory-${d.directory_id}`}
            >
              <Icon size={14} style={{ color: meta.color, marginTop: 3, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: "#111827" }}>{d.directory_name}</span>
                <span style={{ color: meta.color, marginLeft: 8, fontSize: 12 }}>{meta.label}</span>
                {d.status === "live" && d.listing_url && (
                  <a
                    href={d.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 8, fontSize: 12, color: "#0d3cfc", wordBreak: "break-all" }}
                  >
                    View listing <ExternalLink size={12} />
                  </a>
                )}
                {d.status !== "live" && d.note && (
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", marginTop: 2 }}>{d.note}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubmissionCard({ row }: { row: SubmissionRow }) {
  const started = row.directories.length > 0;
  const liveCount = row.directories.filter(d => d.status === "live").length;
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

      {started ? (
        <ProgressBar done={liveCount} total={row.directories.length} />
      ) : (
        // No checklist has been cut, so there is no progress to report. Say
        // that plainly rather than rendering "0 / 12" against work nobody has
        // been assigned.
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(0,0,0,0.62)", padding: "10px 12px", background: "rgba(236,242,244,0.5)", borderRadius: 10 }}>
          We haven't started your submissions yet. Your tier covers{" "}
          <strong style={{ color: "#111827" }}>{row.tier_directory_count} listings</strong> — you'll see each
          one here, with its own status and link, as we work through them.
        </div>
      )}

      <DirectoryList rows={row.directories} />

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
  usePageTitle("CiteFlow · Portal");

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
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111827" }}>CiteFlow</h2>
            <div style={{ fontSize: 14, color: "rgba(0,0,0,0.62)", marginTop: 4 }}>
              One-time submission orders. Every listing below is a real outcome we recorded.
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
              No CiteFlow orders yet
            </div>
            <div style={{ fontSize: 14, color: "rgba(0,0,0,0.62)", marginBottom: 18 }}>
              CiteFlow submits your business by hand to the listings that carry local ranking weight.
              One-time, no subscription.
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
