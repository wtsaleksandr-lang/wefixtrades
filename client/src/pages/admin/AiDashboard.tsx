import { usePageTitle } from "@/hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  LayoutDashboard, MessageSquare, Activity, DollarSign, Search,
  Tag, ChevronLeft, ChevronRight, AlertTriangle, RotateCw,
  ArrowLeft, CheckCircle2, XCircle, Sparkles, Inbox,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ─── Types ─── */
type Tab = "overview" | "conversations" | "usage" | "cost" | "topics" | "repository";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "conversations", label: "Conversations", icon: MessageSquare },
  { id: "usage", label: "Usage Logs", icon: Activity },
  { id: "cost", label: "Cost / Day", icon: DollarSign },
  { id: "topics", label: "Top Topics", icon: Tag },
  { id: "repository", label: "Repository", icon: Search },
];

/* ─── Helpers ─── */
function microCentsToDollars(mc: number): string {
  return "$" + (mc / 1_000_000).toFixed(4);
}

/* Color-coded inline pill. We keep a small helper rather than the shared
 * <Badge> because intent/decision/surface need a varying tint per-value;
 * shadcn's Badge only ships fixed variants. The classes below are the only
 * "soft tint" approximations needed across this page. */
type PillTone = "blue" | "green" | "amber" | "red" | "gray" | "cyan";
const PILL_TONES: Record<PillTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-muted text-muted-foreground",
  cyan: "bg-cyan-50 text-cyan-700",
};
function Pill({ children, tone = "blue" }: { children: React.ReactNode; tone?: PillTone }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${PILL_TONES[tone]}`}>
      {children}
    </span>
  );
}

function intentTone(intent: string): PillTone {
  if (!intent) return "gray";
  if (intent.includes("sales") || intent.includes("pricing")) return "green";
  if (intent.includes("support")) return "blue";
  if (intent.includes("report")) return "cyan";
  if (intent.includes("booking")) return "amber";
  return "gray";
}
function decisionTone(d: string): PillTone {
  if (d === "high_value" || d === "sales_intent") return "green";
  if (d === "support" || d === "report_followup") return "blue";
  if (d === "low_signal") return "amber";
  return "red";
}

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

/* Shared async hook. Replaces the scattered `useEffect + .catch(() => {})`
 * pattern so every fetch surfaces a real error message + a Retry handler. */
function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setLoading] = useState<boolean>(url !== null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson(url)
      .then((json) => { if (!cancelled) setData(json); })
      .catch((err: Error) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, isLoading, refetch };
}

/* ─── Retry banner — adopted from SupportInboxPage.tsx:240-247 ─── */
function ErrorBanner({ error, onRetry, label }: { error: Error; onRetry: () => void; label: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800">{label}</p>
        <p className="text-xs text-red-700 mt-1 break-words">{error.message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="w-3.5 h-3.5 mr-1.5" />
        Retry
      </Button>
    </div>
  );
}

/* ─── Skeletons ─── */
function StatCardSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-7 w-20" />
    </Card>
  );
}
function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-gray-50 last:border-b-0">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-3"><Skeleton className="h-4 w-full max-w-[140px]" /></td>
      ))}
    </tr>
  );
}
function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center py-12 px-4">
      <Inbox className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body && <p className="text-xs text-muted-foreground mt-1">{body}</p>}
    </div>
  );
}

/* ═══════════════ MAIN ═══════════════ */
export default function AiDashboard() {
  usePageTitle("AI Dashboard");
  const [tab, setTab] = useState<Tab>("overview");
  const [detailId, setDetailId] = useState<number | null>(null);

  return (
    <AdminLayout pageContext={{ page: "ai-dashboard" }}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">AI Operations</h2>
            <p className="text-sm text-muted-foreground">
              Conversations, usage, cost & topic insight across every AI surface.
            </p>
          </div>
        </div>

        {detailId !== null ? (
          <ConversationDetail id={detailId} onBack={() => setDetailId(null)} />
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="w-full"
          >
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{t.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
            <TabsContent value="conversations" className="mt-4"><ConversationsTab onSelect={setDetailId} /></TabsContent>
            <TabsContent value="usage" className="mt-4"><UsageTab /></TabsContent>
            <TabsContent value="cost" className="mt-4"><CostTab /></TabsContent>
            <TabsContent value="topics" className="mt-4"><TopicsTab /></TabsContent>
            <TabsContent value="repository" className="mt-4"><RepositoryTab onSelect={setDetailId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}

/* ═══════════════ OVERVIEW TAB ═══════════════ */
interface OverviewData {
  today: { conversations: number; successful: number; failed: number; estimatedCostMicroCents: number };
  week: { conversations: number; estimatedCostMicroCents: number };
  mostActiveSurface: string;
  activeMemorySessions: number;
  archive: { total: number; saved: number; discarded: number };
}

function OverviewTab() {
  const { data, error, isLoading, refetch } = useFetch<OverviewData>("/api/admin/ai/overview");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (error) return <ErrorBanner error={error} onRetry={refetch} label="Couldn't load the AI overview" />;
  if (!data) return <EmptyState title="No overview data yet" body="Stats appear once the AI archiver has run at least once." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Requests Today" value={data.today.conversations} />
        <StatCard label="Successful" value={data.today.successful} tone="green" />
        <StatCard label="Failed" value={data.today.failed} tone={data.today.failed > 0 ? "red" : "gray"} />
        <StatCard label="Cost Today" value={microCentsToDollars(data.today.estimatedCostMicroCents)} />
        <StatCard label="Requests This Week" value={data.week.conversations} />
        <StatCard label="Cost This Week" value={microCentsToDollars(data.week.estimatedCostMicroCents)} />
        <StatCard label="Top Surface" value={data.mostActiveSurface || "—"} />
        <StatCard label="Active Sessions" value={data.activeMemorySessions} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Archived Conversations" value={data.archive.total} />
        <StatCard label="Save-worthy" value={data.archive.saved} tone="green" />
        <StatCard label="Low Signal / Discarded" value={data.archive.discarded} tone="amber" />
      </div>
      <VapiStatusPanel />
    </div>
  );
}

/* ─── Vapi Status Panel ─── */
interface VapiStatus {
  ready: boolean;
  configured: boolean;
  webDemoReady?: boolean;
  details?: Record<string, boolean>;
  missing?: string[];
  setupSteps?: string[];
}

function VapiStatusPanel() {
  const { data, error, isLoading, refetch } = useFetch<VapiStatus>("/api/admin/vapi/status");

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-56 mb-2" />
        <Skeleton className="h-3 w-64 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </Card>
    );
  }
  if (error) return <ErrorBanner error={error} onRetry={refetch} label="Couldn't load Vapi status" />;
  if (!data) return null;

  const isReady = data.ready;
  const isConfigured = data.configured;
  const statusTone: PillTone = isReady ? "green" : isConfigured ? "amber" : "gray";
  const statusLabel = isReady ? "Ready" : isConfigured ? "Partial" : "Not Configured";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">Vapi Voice Integration</h3>
          <p className="text-xs text-muted-foreground mt-0.5">AI phone assistant powered by the shared assistant core</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data.webDemoReady && <Pill tone="cyan">Web Demo Live</Pill>}
          <Pill tone={statusTone}>{statusLabel}</Pill>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
        {Object.entries(data.details || {}).map(([key, val]) => {
          const label = key
            .replace(/^has/, "")
            .replace(/([A-Z])/g, " $1")
            .replace(/^\s/, "")
            .trim();
          return (
            <div
              key={key}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                val
                  ? "bg-emerald-50/60 border-emerald-200 text-foreground"
                  : "bg-muted/50 border-border text-muted-foreground"
              }`}
            >
              {val ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      {data.missing && data.missing.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 mb-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Still needed</div>
          <ul className="space-y-0.5">
            {data.missing.map((item) => (
              <li key={item} className="text-xs text-foreground">&bull; {item}</li>
            ))}
          </ul>
        </div>
      )}

      {data.setupSteps && data.setupSteps.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Setup steps</div>
          <ol className="space-y-0.5">
            {data.setupSteps.map((step, i) => (
              <li key={i} className="text-xs text-foreground">{i + 1}. {step}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-3 text-[11px] text-muted-foreground flex flex-wrap gap-2 items-center">
        <span>Endpoints:</span>
        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">/api/vapi/webhook</code>
        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">/api/vapi/conversation</code>
      </div>
    </Card>
  );
}

/* ═══════════════ CONVERSATIONS TAB ═══════════════ */
interface ConversationRow {
  id: number;
  createdAt: string;
  surface: string;
  primaryIntent: string;
  saveDecision: string;
  summary: string;
  messageCount: number;
  contextNote?: string;
  tags?: string[];
}
interface ConversationsResponse {
  rows: ConversationRow[];
  total: number;
}

function ConversationsTab({ onSelect }: { onSelect: (id: number) => void }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ surface: "", intent: "", decision: "", search: "" });
  const url = (() => {
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (filters.surface) params.set("surface", filters.surface);
    if (filters.intent) params.set("intent", filters.intent);
    if (filters.decision) params.set("decision", filters.decision);
    if (filters.search) params.set("search", filters.search);
    return `/api/admin/ai/conversations?${params}`;
  })();
  const { data, error, isLoading, refetch } = useFetch<ConversationsResponse>(url);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Conversations</h3>
      <FilterBar filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} />
      {error && <ErrorBanner error={error} onRetry={refetch} label="Couldn't load conversations" />}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <Th>Time</Th>
                <Th>Surface</Th>
                <Th className="hidden md:table-cell">Intent</Th>
                <Th className="hidden lg:table-cell">Decision</Th>
                <Th>Summary</Th>
                <Th className="hidden sm:table-cell">Msgs</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
              ) : !data?.rows?.length ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title={filters.search || filters.surface || filters.intent || filters.decision
                        ? "No conversations match your filters"
                        : "No conversations yet"}
                      body="Conversations appear here once the AI archiver runs."
                    />
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open conversation ${r.id}`}
                    onClick={() => onSelect(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(r.id);
                      }
                    }}
                    className="border-t border-border cursor-pointer hover:bg-blue-50/40 focus-visible:outline-none focus-visible:bg-blue-50/60 focus-visible:ring-2 focus-visible:ring-brand-blue/40 transition-colors"
                  >
                    <Td className="whitespace-nowrap text-muted-foreground text-xs">{new Date(r.createdAt).toLocaleString()}</Td>
                    <Td><Pill tone="blue">{r.surface}</Pill></Td>
                    <Td className="hidden md:table-cell"><Pill tone={intentTone(r.primaryIntent)}>{r.primaryIntent}</Pill></Td>
                    <Td className="hidden lg:table-cell"><Pill tone={decisionTone(r.saveDecision)}>{r.saveDecision}</Pill></Td>
                    <Td className="max-w-[280px] sm:max-w-[360px] truncate text-foreground">{r.summary}</Td>
                    <Td className="hidden sm:table-cell text-muted-foreground">{r.messageCount}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {data && <Pagination page={page} total={data.total} limit={25} onChange={setPage} />}
    </div>
  );
}

/* ═══════════════ CONVERSATION DETAIL ═══════════════ */
interface ConversationDetailData {
  surface: string;
  primary_intent: string;
  save_decision: string;
  session_id?: string;
  report_id?: string;
  user_id?: number;
  message_count: number;
  estimated_cost_usd?: number;
  created_at: string;
  summary: string;
  context_note?: string;
  tags?: string[];
  messages_json?: { role: string; content: string }[];
}

function ConversationDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data, error, isLoading, refetch } = useFetch<ConversationDetailData>(`/api/admin/ai/conversations/${id}`);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 rounded"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to list
      </button>
      <h3 className="text-base font-semibold text-foreground">Conversation Detail</h3>

      {error && <ErrorBanner error={error} onRetry={refetch} label="Couldn't load this conversation" />}

      {isLoading ? (
        <div className="space-y-3">
          <Card className="p-4"><Skeleton className="h-24 w-full" /></Card>
          <Card className="p-4"><Skeleton className="h-16 w-full" /></Card>
          <Card className="p-4"><Skeleton className="h-64 w-full" /></Card>
        </div>
      ) : data ? (
        <DetailBody data={data} />
      ) : null}
    </div>
  );
}

function DetailBody({ data }: { data: ConversationDetailData }) {
  const messages = Array.isArray(data.messages_json) ? data.messages_json : [];
  const tags = Array.isArray(data.tags) ? data.tags : [];

  return (
    <>
      {/* Metadata grid */}
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Meta label="Surface"><Pill tone="blue">{data.surface}</Pill></Meta>
          <Meta label="Intent"><Pill tone={intentTone(data.primary_intent)}>{data.primary_intent}</Pill></Meta>
          <Meta label="Decision"><Pill tone={decisionTone(data.save_decision)}>{data.save_decision}</Pill></Meta>
          <Meta label="Session"><span className="text-xs text-muted-foreground font-mono">{data.session_id?.slice(0, 20)}</span></Meta>
          {data.report_id && <Meta label="Report"><span className="text-xs text-muted-foreground font-mono">{data.report_id.slice(0, 12)}…</span></Meta>}
          {data.user_id !== undefined && <Meta label="User ID"><span className="text-xs text-foreground">{data.user_id}</span></Meta>}
          <Meta label="Messages"><span className="text-sm text-foreground">{data.message_count}</span></Meta>
          <Meta label="Cost"><span className="text-sm text-foreground">{microCentsToDollars(data.estimated_cost_usd || 0)}</span></Meta>
          <Meta label="Created"><span className="text-xs text-muted-foreground">{new Date(data.created_at).toLocaleString()}</span></Meta>
        </div>
      </Card>

      {/* Summary */}
      <Card className="p-4">
        <Meta label="Summary">
          <p className="text-sm text-foreground leading-relaxed mt-1">{data.summary}</p>
        </Meta>
      </Card>

      {data.context_note && (
        <Card className="p-4">
          <Meta label="Context Note">
            <p className="text-sm text-muted-foreground mt-1">{data.context_note}</p>
          </Meta>
        </Card>
      )}

      {tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {tags.map((t, i) => <Pill key={i} tone="blue">{t}</Pill>)}
        </div>
      )}

      {messages.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-brand-blue" />
            Transcript ({messages.length} messages)
          </div>
          <div className="max-h-[400px] overflow-auto p-4 space-y-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded-lg text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-50 text-foreground"
                    : "bg-muted/50 text-foreground"
                }`}
              >
                <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${
                  m.role === "user" ? "text-blue-700" : "text-muted-foreground"
                }`}>
                  {m.role === "user" ? "User" : "Assistant"}
                </div>
                {m.content}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

/* ═══════════════ USAGE TAB ═══════════════ */
interface UsageRow {
  id: number;
  created_at: string;
  model: string;
  surface: string;
  success: boolean;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  estimated_cost_usd?: number;
}
interface UsageResponse {
  rows: UsageRow[];
  total: number;
}

function UsageTab() {
  const [page, setPage] = useState(1);
  const [surface, setSurface] = useState("all");
  const [success, setSuccess] = useState("all");
  const url = (() => {
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (surface !== "all") params.set("surface", surface);
    if (success !== "all") params.set("success", success);
    return `/api/admin/ai/usage?${params}`;
  })();
  const { data, error, isLoading, refetch } = useFetch<UsageResponse>(url);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Usage Logs</h3>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[160px]">
          <label htmlFor="usage-surface" className="sr-only">Filter by surface</label>
          <Select value={surface} onValueChange={(v) => { setSurface(v); setPage(1); }}>
            <SelectTrigger id="usage-surface" aria-label="Filter by surface" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All surfaces</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="audit">Audit</SelectItem>
              <SelectItem value="vapi">Vapi</SelectItem>
              <SelectItem value="dashboard">Dashboard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label htmlFor="usage-status" className="sr-only">Filter by status</label>
          <Select value={success} onValueChange={(v) => { setSuccess(v); setPage(1); }}>
            <SelectTrigger id="usage-status" aria-label="Filter by status" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="true">Successful</SelectItem>
              <SelectItem value="false">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} label="Couldn't load usage logs" />}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <Th>Time</Th>
                <Th className="hidden md:table-cell">Model</Th>
                <Th>Surface</Th>
                <Th>Status</Th>
                <Th className="hidden lg:table-cell">In</Th>
                <Th className="hidden lg:table-cell">Out</Th>
                <Th className="hidden md:table-cell">Latency</Th>
                <Th>Cost</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={8} />)
              ) : !data?.rows?.length ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title={surface !== "all" || success !== "all" ? "No logs match your filters" : "No usage logs yet"}
                      body="Usage entries appear here as soon as the next AI request completes."
                    />
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</Td>
                    <Td className="hidden md:table-cell text-[11px] font-mono text-foreground">{r.model?.split("-").slice(-1)[0]}</Td>
                    <Td><Pill tone="blue">{r.surface}</Pill></Td>
                    <Td>
                      {r.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Successful" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" aria-label="Failed" />
                      )}
                    </Td>
                    <Td className="hidden lg:table-cell text-foreground">{r.input_tokens ?? "—"}</Td>
                    <Td className="hidden lg:table-cell text-foreground">{r.output_tokens ?? "—"}</Td>
                    <Td className="hidden md:table-cell text-foreground">{r.latency_ms ? `${r.latency_ms}ms` : "—"}</Td>
                    <Td className="text-foreground">{r.estimated_cost_usd ? microCentsToDollars(r.estimated_cost_usd) : "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {data && <Pagination page={page} total={data.total} limit={50} onChange={setPage} />}
    </div>
  );
}

/* ═══════════════ COST TAB ═══════════════ */
interface CostDaily {
  date: string;
  totalCost: number;
  requests: number;
  successful: number;
  failed: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
}
interface CostResponse {
  daily: CostDaily[];
  bySurface?: { surface: string; requests: number; totalCost: number }[];
}

function CostTab() {
  const { data, error, isLoading, refetch } = useFetch<CostResponse>("/api/admin/ai/cost?days=30");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card className="p-5"><Skeleton className="h-[220px] w-full" /></Card>
        <Card className="p-4"><Skeleton className="h-32 w-full" /></Card>
        <Card className="p-4"><Skeleton className="h-40 w-full" /></Card>
      </div>
    );
  }
  if (error) return <ErrorBanner error={error} onRetry={refetch} label="Couldn't load cost data" />;
  if (!data) return <EmptyState title="No cost data yet" />;

  const chartData = (data.daily || []).slice().reverse().map((d) => ({
    date: d.date?.slice(5),
    cost: d.totalCost / 1_000_000,
    requests: d.requests,
  }));

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Cost Per Day</h3>

      {chartData.length > 1 && (
        <Card className="p-4 sm:p-5">
          <div className="text-sm font-semibold text-foreground mb-3">Daily Cost (USD)</div>
          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7280" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={(v) => `$${(v as number).toFixed(2)}`} />
                <Tooltip formatter={(v: number) => `$${v.toFixed(4)}`} />
                <Bar dataKey="cost" fill="#0d3cfc" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {data.bySurface && data.bySurface.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-foreground mb-3">Cost by Surface (last 30 days)</div>
          <ul className="divide-y divide-border">
            {data.bySurface.map((s) => (
              <li key={s.surface} className="flex items-center justify-between py-2 gap-3 flex-wrap">
                <Pill tone="blue">{s.surface}</Pill>
                <span className="text-sm text-foreground">{s.requests} requests — {microCentsToDollars(s.totalCost)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <Th>Date</Th>
                <Th>Requests</Th>
                <Th className="hidden sm:table-cell">Success</Th>
                <Th className="hidden sm:table-cell">Failed</Th>
                <Th className="hidden lg:table-cell">In Tokens</Th>
                <Th className="hidden lg:table-cell">Out Tokens</Th>
                <Th>Cost</Th>
              </tr>
            </thead>
            <tbody>
              {(data.daily || []).length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="No daily totals yet" /></td></tr>
              ) : (
                (data.daily || []).map((d) => (
                  <tr key={d.date} className="border-t border-border">
                    <Td className="text-foreground whitespace-nowrap">{d.date}</Td>
                    <Td className="text-foreground">{d.requests}</Td>
                    <Td className="hidden sm:table-cell text-foreground">{d.successful}</Td>
                    <Td className="hidden sm:table-cell text-foreground">{d.failed}</Td>
                    <Td className="hidden lg:table-cell text-foreground">{d.totalInputTokens?.toLocaleString()}</Td>
                    <Td className="hidden lg:table-cell text-foreground">{d.totalOutputTokens?.toLocaleString()}</Td>
                    <Td className="text-foreground">{microCentsToDollars(d.totalCost)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════ TOPICS TAB ═══════════════ */
interface TopicsResponse {
  topIntents?: { intent: string; count: number }[];
  topTags?: { tag: string; count: number }[];
  surfaceDistribution?: { surface: string; count: number }[];
}

function TopicsTab() {
  const { data, error, isLoading, refetch } = useFetch<TopicsResponse>("/api/admin/ai/topics?days=30");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4"><Skeleton className="h-48 w-full" /></Card>
          <Card className="p-4"><Skeleton className="h-48 w-full" /></Card>
        </div>
        <Card className="p-4"><Skeleton className="h-32 w-full" /></Card>
      </div>
    );
  }
  if (error) return <ErrorBanner error={error} onRetry={refetch} label="Couldn't load topic data" />;
  if (!data) return <EmptyState title="No topic data yet" />;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Top Topics & Intents</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-semibold text-foreground mb-3">Top Intents</div>
          {!data.topIntents?.length ? (
            <EmptyState title="No intent data yet" />
          ) : (
            <ul className="divide-y divide-border">
              {data.topIntents.map((r) => (
                <li key={r.intent} className="flex items-center justify-between py-2 gap-3 flex-wrap">
                  <Pill tone={intentTone(r.intent)}>{r.intent}</Pill>
                  <span className="text-sm font-semibold text-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-sm font-semibold text-foreground mb-3">Top Tags</div>
          {!data.topTags?.length ? (
            <EmptyState title="No tag data yet" />
          ) : (
            <ul className="divide-y divide-border">
              {data.topTags.map((r) => (
                <li key={r.tag} className="flex items-center justify-between py-2 gap-3 flex-wrap">
                  <Pill tone="cyan">{r.tag}</Pill>
                  <span className="text-sm font-semibold text-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {data.surfaceDistribution && data.surfaceDistribution.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-foreground mb-3">Surface Distribution</div>
          <ul className="divide-y divide-border">
            {data.surfaceDistribution.map((r) => (
              <li key={r.surface} className="flex items-center justify-between py-2 gap-3 flex-wrap">
                <Pill tone="blue">{r.surface}</Pill>
                <span className="text-sm font-semibold text-foreground">{r.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════ REPOSITORY TAB ═══════════════ */
function RepositoryTab({ onSelect }: { onSelect: (id: number) => void }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ surface: "", intent: "", decision: "", search: "" });
  const url = (() => {
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (filters.surface) params.set("surface", filters.surface);
    if (filters.intent) params.set("intent", filters.intent);
    if (filters.decision) params.set("decision", filters.decision);
    if (filters.search) params.set("search", filters.search);
    return `/api/admin/ai/conversations?${params}`;
  })();
  const { data, error, isLoading, refetch } = useFetch<ConversationsResponse>(url);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Conversation Repository</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Searchable archive of save-worthy conversations</p>
      </div>
      <FilterBar filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} showSaveFilter />

      {error && <ErrorBanner error={error} onRetry={refetch} label="Couldn't load the repository" />}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : !data?.rows?.length ? (
        <Card className="p-0">
          <EmptyState
            title={filters.search || filters.surface || filters.intent || filters.decision
              ? "No matching conversations"
              : "Nothing in the repository yet"}
            body="Save-worthy conversations appear here once the AI archiver flags them."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.rows.map((r) => (
            <Card
              key={r.id}
              role="button"
              tabIndex={0}
              aria-label={`Open conversation ${r.id}`}
              onClick={() => onSelect(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r.id);
                }
              }}
              className="p-4 cursor-pointer transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                <div className="flex gap-1.5 flex-wrap">
                  <Pill tone="blue">{r.surface}</Pill>
                  <Pill tone={intentTone(r.primaryIntent)}>{r.primaryIntent}</Pill>
                  <Pill tone={decisionTone(r.saveDecision)}>{r.saveDecision}</Pill>
                </div>
                <span className="text-[11px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{r.summary}</p>
              {r.contextNote && <p className="text-xs text-muted-foreground mt-1.5">{r.contextNote}</p>}
              {(r.tags?.length ?? 0) > 0 && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {r.tags!.map((t, i) => <Pill key={i} tone="cyan">{t}</Pill>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {data && <Pagination page={page} total={data.total} limit={25} onChange={setPage} />}
    </div>
  );
}

/* ═══════════════ SHARED PRIMITIVES ═══════════════ */

function StatCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: PillTone }) {
  const valueColor =
    tone === "green" ? "text-emerald-600" :
    tone === "red" ? "text-red-600" :
    tone === "amber" ? "text-amber-600" :
    tone === "gray" ? "text-muted-foreground/70" :
    "text-foreground";
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-[11px] font-medium text-muted-foreground mb-1.5 truncate">{label}</div>
      <div className={`text-xl sm:text-2xl font-bold ${valueColor}`}>{value}</div>
    </Card>
  );
}

function FilterBar({
  filters, onChange, showSaveFilter,
}: {
  filters: { surface: string; intent: string; decision: string; search: string };
  onChange: (f: typeof filters) => void;
  showSaveFilter?: boolean;
}) {
  /* Map "" sentinel to "all" on the way into the Select (Radix requires a
   * non-empty value) and back to "" on the way out so the existing
   * URLSearchParams omit-on-empty logic still works. */
  const toAll = (v: string) => (v === "" ? "all" : v);
  const fromAll = (v: string) => (v === "all" ? "" : v);

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
      <div className="flex-1 min-w-0">
        <label htmlFor="ai-search" className="sr-only">Search summaries and tags</label>
        <Input
          id="ai-search"
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search summaries, tags…"
          aria-label="Search summaries and tags"
          className="h-9"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[140px]">
          <label htmlFor="ai-surface" className="sr-only">Surface filter</label>
          <Select value={toAll(filters.surface)} onValueChange={(v) => onChange({ ...filters, surface: fromAll(v) })}>
            <SelectTrigger id="ai-surface" aria-label="Filter by surface" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All surfaces</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="audit">Audit</SelectItem>
              <SelectItem value="vapi">Vapi</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <label htmlFor="ai-intent" className="sr-only">Intent filter</label>
          <Select value={toAll(filters.intent)} onValueChange={(v) => onChange({ ...filters, intent: fromAll(v) })}>
            <SelectTrigger id="ai-intent" aria-label="Filter by intent" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All intents</SelectItem>
              <SelectItem value="pricing_inquiry">Pricing</SelectItem>
              <SelectItem value="service_interest">Service</SelectItem>
              <SelectItem value="report_followup">Report</SelectItem>
              <SelectItem value="booking_intent">Booking</SelectItem>
              <SelectItem value="support_request">Support</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showSaveFilter && (
          <div className="min-w-[160px]">
            <label htmlFor="ai-decision" className="sr-only">Decision filter</label>
            <Select value={toAll(filters.decision)} onValueChange={(v) => onChange({ ...filters, decision: fromAll(v) })}>
              <SelectTrigger id="ai-decision" aria-label="Filter by save decision" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All saved</SelectItem>
                <SelectItem value="high_value">High Value</SelectItem>
                <SelectItem value="sales_intent">Sales Intent</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="report_followup">Report Follow-up</SelectItem>
                <SelectItem value="low_signal">Low Signal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-2.5 align-middle ${className}`}>{children}</td>
  );
}

function Pagination({ page, total, limit, onChange }: {
  page: number; total: number; limit: number; onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">
        Page {page} of {totalPages} <span className="text-muted-foreground/70">({total} total)</span>
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
