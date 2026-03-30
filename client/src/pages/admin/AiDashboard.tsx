import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import {
  LayoutDashboard, MessageSquare, Activity, DollarSign, Search,
  Tag, ChevronLeft, ChevronRight, Loader2, AlertCircle, X,
  ArrowLeft, Filter, CheckCircle2, XCircle, Clock, Sparkles, Phone,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ─── Theme (mirrors platformTheme) ─── */
const c = {
  bg: "#FAFAFA", surface: "#fff", border: "#E5E7EB", borderLight: "#F3F4F6",
  text: "#111827", muted: "#6B7280", accent: "#6366F1", accentBg: "rgba(99,102,241,0.08)",
  green: "#22C55E", red: "#EF4444", amber: "#F59E0B", cyan: "#00D4C8",
};

type Tab = "overview" | "conversations" | "usage" | "cost" | "topics" | "repository";

const TABS: { id: Tab; label: string; icon: any }[] = [
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
function Badge({ children, color }: { children: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11,
      fontWeight: 600, background: color + "18", color, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}
function intentColor(intent: string): string {
  if (intent.includes("sales") || intent.includes("pricing")) return c.green;
  if (intent.includes("support")) return c.accent;
  if (intent.includes("report")) return c.cyan;
  if (intent.includes("booking")) return c.amber;
  return c.muted;
}
function decisionColor(d: string): string {
  if (d === "high_value" || d === "sales_intent") return c.green;
  if (d === "support" || d === "report_followup") return c.accent;
  if (d === "low_signal") return c.amber;
  return c.red;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* ─── Main Component ─── */
export default function AiDashboard() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [detailId, setDetailId] = useState<number | null>(null);

  if (isLoading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><Loader2 size={32} className="animate-spin" style={{ color: c.accent }} /></div>;

  if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "portal")) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: c.bg }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <AlertCircle size={48} style={{ color: c.muted, marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: c.text, marginBottom: 8 }}>Admin access required</h2>
          <p style={{ fontSize: 14, color: c.muted, marginBottom: 16 }}>Sign in with an admin account to access this dashboard.</p>
          <a href="/login" style={{ color: c.accent, fontSize: 14 }}>Go to login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: c.surface, borderRight: `1px solid ${c.border}`, padding: "20px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflow: "auto" }}>
        <div style={{ padding: "0 16px 20px", borderBottom: `1px solid ${c.borderLight}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: c.text }}>AI Operations</div>
          <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>WeFixTrades Admin</div>
        </div>
        <div style={{ padding: "12px 8px" }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id && !detailId;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setDetailId(null); }} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400,
                background: active ? c.accentBg : "transparent", color: active ? c.accent : c.muted,
                transition: "all 0.15s", textAlign: "left",
              }}>
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={{ padding: "16px", borderTop: `1px solid ${c.borderLight}`, marginTop: "auto" }}>
          <a href="/" style={{ fontSize: 12, color: c.muted, textDecoration: "none" }}>&larr; Back to site</a>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "24px 32px", maxWidth: 1100, overflow: "auto" }}>
        {detailId ? <ConversationDetail id={detailId} onBack={() => setDetailId(null)} /> :
         tab === "overview" ? <OverviewTab /> :
         tab === "conversations" ? <ConversationsTab onSelect={setDetailId} /> :
         tab === "usage" ? <UsageTab /> :
         tab === "cost" ? <CostTab /> :
         tab === "topics" ? <TopicsTab /> :
         tab === "repository" ? <RepositoryTab onSelect={setDetailId} /> :
         null}
      </div>
    </div>
  );
}

/* ═══════════════ OVERVIEW TAB ═══════════════ */
function OverviewTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson("/api/admin/ai/overview").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data) return <ErrorState />;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text, marginBottom: 24 }}>AI Overview</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard label="Requests Today" value={data.today.conversations} />
        <StatCard label="Successful" value={data.today.successful} color={c.green} />
        <StatCard label="Failed" value={data.today.failed} color={data.today.failed > 0 ? c.red : c.muted} />
        <StatCard label="Cost Today" value={microCentsToDollars(data.today.estimatedCostMicroCents)} />
        <StatCard label="Requests This Week" value={data.week.conversations} />
        <StatCard label="Cost This Week" value={microCentsToDollars(data.week.estimatedCostMicroCents)} />
        <StatCard label="Top Surface" value={data.mostActiveSurface} />
        <StatCard label="Active Sessions" value={data.activeMemorySessions} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <StatCard label="Archived Conversations" value={data.archive.total} />
        <StatCard label="Save-worthy" value={data.archive.saved} color={c.green} />
        <StatCard label="Low Signal / Discarded" value={data.archive.discarded} color={c.amber} />
      </div>

      {/* Vapi Integration Status */}
      <VapiStatusPanel />
    </div>
  );
}

/* ─── Vapi Status Panel (admin overview) ─── */
function VapiStatusPanel() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson("/api/admin/vapi/status")
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!status) return null;

  const isReady = status.ready;
  const isConfigured = status.configured;

  return (
    <div style={{
      marginTop: 32, background: c.surface, border: `1px solid ${c.border}`,
      borderRadius: 12, padding: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 4 }}>Vapi Voice Integration</h3>
          <p style={{ fontSize: 12, color: c.muted }}>AI phone assistant powered by the shared assistant core</p>
        </div>
        <span style={{
          padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: isReady ? c.green + "18" : isConfigured ? c.amber + "18" : c.muted + "18",
          color: isReady ? c.green : isConfigured ? c.amber : c.muted,
        }}>
          {isReady ? "Ready" : isConfigured ? "Partial" : "Not Configured"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        {Object.entries(status.details || {}).map(([key, val]) => {
          const label = key
            .replace(/^has/, "")
            .replace(/([A-Z])/g, " $1")
            .replace(/^\s/, "")
            .trim();
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", borderRadius: 8,
              background: val ? c.green + "08" : c.borderLight,
              border: `1px solid ${val ? c.green + "30" : c.border}`,
            }}>
              {val ? (
                <CheckCircle2 size={14} style={{ color: c.green, flexShrink: 0 }} />
              ) : (
                <XCircle size={14} style={{ color: c.muted, flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 12, color: val ? c.text : c.muted }}>{label}</span>
            </div>
          );
        })}
      </div>

      {status.missing?.length > 0 && (
        <div style={{
          background: c.borderLight, borderRadius: 8, padding: "12px 16px",
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Still needed
          </div>
          {status.missing.map((item: string) => (
            <div key={item} style={{ fontSize: 12, color: c.text, marginBottom: 4 }}>
              &bull; {item}
            </div>
          ))}
        </div>
      )}

      {status.setupSteps?.length > 0 && (
        <div style={{ background: c.borderLight, borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Setup steps
          </div>
          {status.setupSteps.map((step: string, i: number) => (
            <div key={i} style={{ fontSize: 12, color: c.text, marginBottom: 4 }}>
              {i + 1}. {step}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: c.muted }}>
        Endpoints: <code style={{ background: c.borderLight, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>/api/vapi/webhook</code>{" "}
        <code style={{ background: c.borderLight, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>/api/vapi/conversation</code>
      </div>
    </div>
  );
}

/* ═══════════════ CONVERSATIONS TAB ═══════════════ */
function ConversationsTab({ onSelect }: { onSelect: (id: number) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ surface: "", intent: "", decision: "", search: "" });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (filters.surface) params.set("surface", filters.surface);
    if (filters.intent) params.set("intent", filters.intent);
    if (filters.decision) params.set("decision", filters.decision);
    if (filters.search) params.set("search", filters.search);
    fetchJson(`/api/admin/ai/conversations?${params}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [page, filters]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text, marginBottom: 16 }}>Conversations</h1>
      <FilterBar filters={filters} onChange={f => { setFilters(f); setPage(1); }} />
      {loading ? <LoadingState /> : !data?.rows?.length ? <EmptyState text="No conversations found" /> : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Time</Th><Th>Surface</Th><Th>Intent</Th><Th>Decision</Th><Th>Summary</Th><Th>Msgs</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} onClick={() => onSelect(r.id)} style={{ cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.accentBg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                  <Td><Badge color={c.accent}>{r.surface}</Badge></Td>
                  <Td><Badge color={intentColor(r.primaryIntent)}>{r.primaryIntent}</Badge></Td>
                  <Td><Badge color={decisionColor(r.saveDecision)}>{r.saveDecision}</Badge></Td>
                  <Td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.summary}</Td>
                  <Td>{r.messageCount}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} total={data.total} limit={25} onChange={setPage} />
        </>
      )}
    </div>
  );
}

/* ═══════════════ CONVERSATION DETAIL ═══════════════ */
function ConversationDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson(`/api/admin/ai/conversations/${id}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState />;
  if (!data) return <ErrorState />;

  const messages = Array.isArray(data.messages_json) ? data.messages_json : [];
  const tags = Array.isArray(data.tags) ? data.tags : [];

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: c.accent, fontSize: 13, marginBottom: 20 }}>
        <ArrowLeft size={14} /> Back to list
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: c.text, marginBottom: 8 }}>Conversation Detail</h1>

      {/* Metadata */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24, padding: 16, background: c.surface, borderRadius: 10, border: `1px solid ${c.border}` }}>
        <div><Label>Surface</Label><Badge color={c.accent}>{data.surface}</Badge></div>
        <div><Label>Intent</Label><Badge color={intentColor(data.primary_intent)}>{data.primary_intent}</Badge></div>
        <div><Label>Decision</Label><Badge color={decisionColor(data.save_decision)}>{data.save_decision}</Badge></div>
        <div><Label>Session</Label><span style={{ fontSize: 12, color: c.muted, fontFamily: "monospace" }}>{data.session_id?.slice(0, 20)}</span></div>
        {data.report_id && <div><Label>Report</Label><span style={{ fontSize: 12, color: c.muted, fontFamily: "monospace" }}>{data.report_id.slice(0, 12)}...</span></div>}
        {data.user_id && <div><Label>User ID</Label><span style={{ fontSize: 12, color: c.muted }}>{data.user_id}</span></div>}
        <div><Label>Messages</Label><span style={{ fontSize: 13, color: c.text }}>{data.message_count}</span></div>
        <div><Label>Cost</Label><span style={{ fontSize: 13, color: c.text }}>{microCentsToDollars(data.estimated_cost_usd || 0)}</span></div>
        <div><Label>Created</Label><span style={{ fontSize: 12, color: c.muted }}>{new Date(data.created_at).toLocaleString()}</span></div>
      </div>

      {/* Summary */}
      <div style={{ padding: 16, background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, marginBottom: 16 }}>
        <Label>Summary</Label>
        <p style={{ fontSize: 14, color: c.text, lineHeight: 1.6, margin: "8px 0 0" }}>{data.summary}</p>
      </div>
      {data.context_note && (
        <div style={{ padding: 16, background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, marginBottom: 16 }}>
          <Label>Context Note</Label>
          <p style={{ fontSize: 13, color: c.muted, margin: "8px 0 0" }}>{data.context_note}</p>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {tags.map((t: string, i: number) => <Badge key={i} color={c.accent}>{t}</Badge>)}
        </div>
      )}

      {/* Transcript */}
      {messages.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${c.borderLight}`, fontSize: 13, fontWeight: 600, color: c.text }}>
            Transcript ({messages.length} messages)
          </div>
          <div style={{ maxHeight: 400, overflow: "auto", padding: 16 }}>
            {messages.map((m: any, i: number) => (
              <div key={i} style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: m.role === "user" ? c.accentBg : c.borderLight, fontSize: 13, lineHeight: 1.5, color: c.text }}>
                <span style={{ fontWeight: 600, fontSize: 11, color: m.role === "user" ? c.accent : c.muted, display: "block", marginBottom: 4 }}>
                  {m.role === "user" ? "User" : "Assistant"}
                </span>
                {m.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════ USAGE TAB ═══════════════ */
function UsageTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [surface, setSurface] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (surface) params.set("surface", surface);
    if (success) params.set("success", success);
    fetchJson(`/api/admin/ai/usage?${params}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [page, surface, success]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text, marginBottom: 16 }}>Usage Logs</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <SelectFilter value={surface} onChange={v => { setSurface(v); setPage(1); }} options={[
          { value: "", label: "All surfaces" }, { value: "website", label: "Website" },
          { value: "audit", label: "Audit" }, { value: "vapi", label: "Vapi" },
          { value: "dashboard", label: "Dashboard" },
        ]} />
        <SelectFilter value={success} onChange={v => { setSuccess(v); setPage(1); }} options={[
          { value: "", label: "All status" }, { value: "true", label: "Successful" }, { value: "false", label: "Failed" },
        ]} />
      </div>
      {loading ? <LoadingState /> : !data?.rows?.length ? <EmptyState text="No usage logs" /> : (
        <>
          <Table>
            <thead>
              <tr><Th>Time</Th><Th>Model</Th><Th>Surface</Th><Th>Status</Th><Th>In Tokens</Th><Th>Out Tokens</Th><Th>Latency</Th><Th>Cost</Th></tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id}>
                  <Td>{new Date(r.created_at).toLocaleString()}</Td>
                  <Td style={{ fontSize: 11, fontFamily: "monospace" }}>{r.model?.split("-").slice(-1)[0]}</Td>
                  <Td><Badge color={c.accent}>{r.surface}</Badge></Td>
                  <Td>{r.success ? <CheckCircle2 size={14} color={c.green} /> : <XCircle size={14} color={c.red} />}</Td>
                  <Td>{r.input_tokens ?? "—"}</Td>
                  <Td>{r.output_tokens ?? "—"}</Td>
                  <Td>{r.latency_ms ? `${r.latency_ms}ms` : "—"}</Td>
                  <Td>{r.estimated_cost_usd ? microCentsToDollars(r.estimated_cost_usd) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} total={data.total} limit={50} onChange={setPage} />
        </>
      )}
    </div>
  );
}

/* ═══════════════ COST TAB ═══════════════ */
function CostTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson("/api/admin/ai/cost?days=30").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data) return <ErrorState />;

  const chartData = (data.daily || []).slice().reverse().map((d: any) => ({
    date: d.date?.slice(5),
    cost: d.totalCost / 1_000_000,
    requests: d.requests,
  }));

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text, marginBottom: 24 }}>Cost Per Day</h1>

      {chartData.length > 1 && (
        <div style={{ background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 12 }}>Daily Cost (USD)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.borderLight} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: c.muted }} />
              <YAxis tick={{ fontSize: 11, fill: c.muted }} tickFormatter={v => `$${v.toFixed(2)}`} />
              <Tooltip formatter={(v: number) => `$${v.toFixed(4)}`} />
              <Bar dataKey="cost" fill={c.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Surface breakdown */}
      {data.bySurface?.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 12 }}>Cost by Surface (last 30 days)</div>
          {data.bySurface.map((s: any) => (
            <div key={s.surface} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${c.borderLight}` }}>
              <Badge color={c.accent}>{s.surface}</Badge>
              <span style={{ fontSize: 13, color: c.text }}>{s.requests} requests — {microCentsToDollars(s.totalCost)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Daily table */}
      <Table>
        <thead>
          <tr><Th>Date</Th><Th>Requests</Th><Th>Success</Th><Th>Failed</Th><Th>In Tokens</Th><Th>Out Tokens</Th><Th>Cost</Th></tr>
        </thead>
        <tbody>
          {(data.daily || []).map((d: any) => (
            <tr key={d.date}>
              <Td>{d.date}</Td><Td>{d.requests}</Td><Td>{d.successful}</Td><Td>{d.failed}</Td>
              <Td>{d.totalInputTokens?.toLocaleString()}</Td><Td>{d.totalOutputTokens?.toLocaleString()}</Td>
              <Td>{microCentsToDollars(d.totalCost)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/* ═══════════════ TOPICS TAB ═══════════════ */
function TopicsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson("/api/admin/ai/topics?days=30").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data) return <ErrorState />;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text, marginBottom: 24 }}>Top Topics & Intents</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 12 }}>Top Intents</div>
          {(data.topIntents || []).map((r: any) => (
            <div key={r.intent} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${c.borderLight}` }}>
              <Badge color={intentColor(r.intent)}>{r.intent}</Badge>
              <span style={{ fontSize: 13, color: c.text, fontWeight: 600 }}>{r.count}</span>
            </div>
          ))}
          {!data.topIntents?.length && <EmptyState text="No intent data yet" />}
        </div>
        <div style={{ background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 12 }}>Top Tags</div>
          {(data.topTags || []).map((r: any) => (
            <div key={r.tag} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${c.borderLight}` }}>
              <Badge color={c.cyan}>{r.tag}</Badge>
              <span style={{ fontSize: 13, color: c.text, fontWeight: 600 }}>{r.count}</span>
            </div>
          ))}
          {!data.topTags?.length && <EmptyState text="No tag data yet" />}
        </div>
      </div>
      {data.surfaceDistribution?.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, padding: 16, marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 12 }}>Surface Distribution</div>
          {data.surfaceDistribution.map((r: any) => (
            <div key={r.surface} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${c.borderLight}` }}>
              <Badge color={c.accent}>{r.surface}</Badge>
              <span style={{ fontSize: 13, color: c.text, fontWeight: 600 }}>{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════ REPOSITORY (SEARCHABLE) TAB ═══════════════ */
function RepositoryTab({ onSelect }: { onSelect: (id: number) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ surface: "", intent: "", decision: "", search: "" });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (filters.surface) params.set("surface", filters.surface);
    if (filters.intent) params.set("intent", filters.intent);
    // Repository only contains save-worthy conversations (archiver filters upstream)
    if (filters.decision) params.set("decision", filters.decision);
    if (filters.search) params.set("search", filters.search);
    fetchJson(`/api/admin/ai/conversations?${params}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [page, filters]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: c.text, marginBottom: 8 }}>Conversation Repository</h1>
      <p style={{ fontSize: 13, color: c.muted, marginBottom: 16 }}>Searchable archive of save-worthy conversations</p>
      <FilterBar filters={filters} onChange={f => { setFilters(f); setPage(1); }} showSaveFilter />
      {loading ? <LoadingState /> : !data?.rows?.length ? <EmptyState text="No matching conversations" /> : (
        <>
          {data.rows.map((r: any) => (
            <div key={r.id} onClick={() => onSelect(r.id)} style={{
              background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, padding: 16,
              marginBottom: 12, cursor: "pointer", transition: "border-color 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = c.accent)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = c.border)}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge color={c.accent}>{r.surface}</Badge>
                  <Badge color={intentColor(r.primaryIntent)}>{r.primaryIntent}</Badge>
                  <Badge color={decisionColor(r.saveDecision)}>{r.saveDecision}</Badge>
                </div>
                <span style={{ fontSize: 11, color: c.muted }}>{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p style={{ fontSize: 13, color: c.text, lineHeight: 1.5, margin: 0 }}>{r.summary}</p>
              {r.contextNote && <p style={{ fontSize: 12, color: c.muted, margin: "6px 0 0" }}>{r.contextNote}</p>}
              {(r.tags as string[] || []).length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                  {(r.tags as string[]).map((t, i) => <Badge key={i} color={c.cyan}>{t}</Badge>)}
                </div>
              )}
            </div>
          ))}
          <Pagination page={page} total={data.total} limit={25} onChange={setPage} />
        </>
      )}
    </div>
  );
}

/* ═══════════════ SHARED PRIMITIVES ═══════════════ */

function StatCard({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div style={{ background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: c.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || c.text }}>{value}</div>
    </div>
  );
}

function FilterBar({ filters, onChange, showSaveFilter }: {
  filters: { surface: string; intent: string; decision: string; search: string };
  onChange: (f: typeof filters) => void;
  showSaveFilter?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <input
        value={filters.search}
        onChange={e => onChange({ ...filters, search: e.target.value })}
        placeholder="Search summaries, tags..."
        style={{ flex: 1, minWidth: 180, padding: "8px 12px", border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit" }}
      />
      <SelectFilter value={filters.surface} onChange={v => onChange({ ...filters, surface: v })} options={[
        { value: "", label: "All surfaces" }, { value: "website", label: "Website" },
        { value: "audit", label: "Audit" }, { value: "vapi", label: "Vapi" },
      ]} />
      <SelectFilter value={filters.intent} onChange={v => onChange({ ...filters, intent: v })} options={[
        { value: "", label: "All intents" }, { value: "pricing_inquiry", label: "Pricing" },
        { value: "service_interest", label: "Service" }, { value: "report_followup", label: "Report" },
        { value: "booking_intent", label: "Booking" }, { value: "support_request", label: "Support" },
      ]} />
      {showSaveFilter && (
        <SelectFilter value={filters.decision} onChange={v => onChange({ ...filters, decision: v })} options={[
          { value: "", label: "All saved" }, { value: "high_value", label: "High Value" },
          { value: "sales_intent", label: "Sales Intent" }, { value: "support", label: "Support" },
          { value: "report_followup", label: "Report Follow-up" }, { value: "low_signal", label: "Low Signal" },
        ]} />
      )}
    </div>
  );
}

function SelectFilter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      padding: "8px 12px", border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13,
      background: c.surface, color: c.text, outline: "none", fontFamily: "inherit", cursor: "pointer",
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 600, color: c.muted, background: c.borderLight }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "10px 12px", borderBottom: `1px solid ${c.borderLight}`, color: c.text, ...style }}>{children}</td>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{children}</div>;
}

function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
      <button onClick={() => onChange(page - 1)} disabled={page <= 1} style={{ background: "none", border: "none", cursor: page <= 1 ? "default" : "pointer", color: page <= 1 ? c.borderLight : c.accent }}><ChevronLeft size={18} /></button>
      <span style={{ fontSize: 13, color: c.muted }}>Page {page} of {totalPages} ({total} total)</span>
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} style={{ background: "none", border: "none", cursor: page >= totalPages ? "default" : "pointer", color: page >= totalPages ? c.borderLight : c.accent }}><ChevronRight size={18} /></button>
    </div>
  );
}

function LoadingState() { return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={24} style={{ color: c.accent, animation: "spin 1s linear infinite" }} /><style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style></div>; }
function ErrorState() { return <div style={{ padding: 40, textAlign: "center", color: c.muted }}>Failed to load data</div>; }
function EmptyState({ text }: { text: string }) { return <div style={{ padding: 40, textAlign: "center", color: c.muted, fontSize: 14 }}>{text}</div>; }
