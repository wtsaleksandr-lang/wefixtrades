/**
 * Portal Lead Analytics — contractor-facing QuoteQuick ROI dashboard.
 *
 * Answers "what is my widget actually doing for me?": total leads, this
 * month, average + total estimated quote value, a real conversion rate
 * (leads / widget views, only when view tracking has data), a leads-over-time
 * chart, by-calculator and by-source breakdowns, and a paginated lead list.
 *
 * Data: GET /api/portal/leads/analytics + GET /api/portal/leads/list — both
 * auth-scoped server-side to the logged-in client's owned calculators.
 *
 * Styling mirrors PortalCalculatorAnalytics: a single data-theme="light"
 * wrapper (keeps the surface bright + satisfies the contrast guard), inline
 * StatCards, and a dependency-free inline SVG bar chart.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import PortalLayout from '@/components/portal/PortalLayout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw, TrendingUp, Code2, ArrowRight } from 'lucide-react';

interface DailyPoint {
  date: string;
  leads: number;
}

interface BreakdownRow {
  key: string;
  label: string;
  count: number;
}

interface AnalyticsResponse {
  previewMode?: boolean;
  days: number;
  totals: {
    total_leads: number;
    leads_in_range: number;
    this_month: number;
    total_quote_value: number;
    avg_quote_value: number;
    views_in_range: number | null;
    conversion_rate: number | null;
  };
  series: DailyPoint[];
  by_calculator: BreakdownRow[];
  by_source: BreakdownRow[];
}

interface LeadRow {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  quote_amount: number | null;
  status: string;
  calculator: string;
  source: string;
  created_date: string | null;
}

interface LeadListResponse {
  previewMode?: boolean;
  leads: LeadRow[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatCurrency(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function formatPct(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return '—';
  return `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  replied: 'Replied',
  deposit_paid: 'Deposit paid',
  won: 'Won',
  lost: 'Lost',
};

function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const tone =
    status === 'won' || status === 'deposit_paid'
      ? { bg: '#ecfdf5', fg: '#047857', bd: '#a7f3d0' }
      : status === 'lost'
        ? { bg: '#fef2f2', fg: '#b91c1c', bd: '#fecaca' }
        : status === 'replied'
          ? { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' }
          : { bg: '#f3f4f6', fg: '#374151', bd: '#e5e7eb' };
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 12,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.bd}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '18px 20px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginTop: 6 }}>
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** Dependency-free inline SVG bar chart of leads per day. */
function LeadsChart({ series }: { series: DailyPoint[] }) {
  const data = series.map((p) => p.leads);
  const max = Math.max(1, ...data);
  const W = 800;
  const H = 200;
  const padL = 28;
  const padB = 26;
  const padT = 12;
  const padR = 12;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  if (n === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        No leads in this window yet.
      </div>
    );
  }
  const slot = plotW / n;
  const barW = Math.max(2, Math.min(slot * 0.7, 28));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" role="img" aria-label="Leads over time">
      <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#e5e7eb" strokeWidth={1} />
      {data.map((v, i) => {
        const h = (v / max) * plotH;
        const x = padL + i * slot + (slot - barW) / 2;
        const y = padT + plotH - h;
        return <rect key={i} x={x.toFixed(1)} y={y.toFixed(1)} width={barW.toFixed(1)} height={Math.max(0, h).toFixed(1)} rx={2} fill="#0d3cfc" />;
      })}
      <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize={10} fill="#6b7280">
        {max}
      </text>
      <text x={padL} y={H - 8} fontSize={10} fill="#6b7280">
        {series[0]?.date}
      </text>
      <text x={W - padR} y={H - 8} textAnchor="end" fontSize={10} fill="#6b7280">
        {series[series.length - 1]?.date}
      </text>
    </svg>
  );
}

function BreakdownList({ title, rows, emptyLabel }: { title: string; rows: BreakdownRow[]; emptyLabel: string }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => {
            const pct = total > 0 ? (r.count / total) * 100 : 0;
            return (
              <div key={r.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', marginBottom: 4 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{r.label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: '#111827', fontWeight: 600 }}>{formatNumber(r.count)}</span>
                </div>
                <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#0d3cfc', borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: '#eef2ff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <TrendingUp className="w-6 h-6" style={{ color: '#0d3cfc' }} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        No leads yet
      </div>
      <div style={{ fontSize: 14, color: '#6b7280', maxWidth: 420, margin: '0 auto 20px' }}>
        Your leads will appear here as homeowners use your QuoteQuick widget. Add the
        widget to your website to start capturing leads — every quote a homeowner
        requests shows up here with their contact details and estimated value.
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/portal/quotequick/setup">
          <Button>
            <Code2 className="w-4 h-4 mr-2" />
            Get your embed link
          </Button>
        </Link>
        <Link href="/portal/quotequick/dashboard">
          <Button variant="outline">
            Open QuoteQuick
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function PortalLeadAnalytics() {
  usePageTitle('Lead Analytics');
  const [page, setPage] = useState(1);

  const analytics = useQuery<AnalyticsResponse>({
    queryKey: ['portal-lead-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/portal/leads/analytics?days=30', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as AnalyticsResponse;
    },
  });

  const list = useQuery<LeadListResponse>({
    queryKey: ['portal-lead-list', page],
    queryFn: async () => {
      const res = await fetch(`/api/portal/leads/list?page=${page}&page_size=25`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as LeadListResponse;
    },
  });

  const data = analytics.data;
  const hasLeads = (data?.totals.total_leads ?? 0) > 0;

  const conversionHint = useMemo(() => {
    if (!data) return undefined;
    if (data.totals.views_in_range == null) return 'Add view tracking to measure';
    return `${formatNumber(data.totals.leads_in_range)} of ${formatNumber(data.totals.views_in_range)} views (30d)`;
  }, [data]);

  return (
    <PortalLayout breadcrumb="Lead Analytics">
      <div data-theme="light">
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
          Lead Analytics
        </h2>
        <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
          Leads captured by your QuoteQuick widget. Last 30 days for time-based metrics.
        </div>

        {analytics.isLoading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px' }}
              >
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-7 w-24 mb-2" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        )}

        {analytics.isError && (
          <div
            style={{
              padding: 16,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Couldn't load lead analytics</p>
              <p className="text-xs text-red-700 mt-1">
                {(analytics.error as Error)?.message ?? 'Check your connection and try again.'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => analytics.refetch()}>
              <RotateCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {data && !hasLeads && <EmptyState />}

        {data && hasLeads && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              <StatCard label="Total leads" value={formatNumber(data.totals.total_leads)} hint={`${formatNumber(data.totals.leads_in_range)} in last 30 days`} />
              <StatCard label="This month" value={formatNumber(data.totals.this_month)} />
              <StatCard label="Avg quote value" value={formatCurrency(data.totals.avg_quote_value)} hint="Per lead with an estimate" />
              <StatCard label="Total pipeline" value={formatCurrency(data.totals.total_quote_value)} hint="Sum of estimated quotes" />
              {data.totals.conversion_rate != null && (
                <StatCard label="Conversion rate" value={formatPct(data.totals.conversion_rate)} hint={conversionHint} />
              )}
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                Leads over time
              </div>
              <LeadsChart series={data.series} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              <BreakdownList title="By calculator" rows={data.by_calculator} emptyLabel="No calculator data yet." />
              <BreakdownList title="By source" rows={data.by_source} emptyLabel="No source data yet." />
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                Recent leads
              </div>
              {list.isError && (
                <div style={{ color: '#b91c1c', fontSize: 13 }}>Couldn't load the lead list.</div>
              )}
              {list.data && list.data.leads.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Lead', 'Contact', 'Calculator', 'Source', 'Quote', 'Status', 'Date'].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: h === 'Quote' ? 'right' : 'left',
                              padding: '6px 10px',
                              color: '#6b7280',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {list.data.leads.map((row) => (
                        <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px', color: '#111827', fontWeight: 600 }}>{row.name || '—'}</td>
                          <td style={{ padding: '10px', color: '#374151' }}>
                            <div>{row.email || '—'}</div>
                            {row.phone ? <div style={{ color: '#6b7280', fontSize: 12 }}>{row.phone}</div> : null}
                          </td>
                          <td style={{ padding: '10px', color: '#374151', whiteSpace: 'nowrap' }}>{row.calculator}</td>
                          <td style={{ padding: '10px', color: '#374151', whiteSpace: 'nowrap' }}>{row.source}</td>
                          <td style={{ padding: '10px', textAlign: 'right', color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {formatCurrency(row.quote_amount)}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <StatusPill status={row.status} />
                          </td>
                          <td style={{ padding: '10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{formatDate(row.created_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : list.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>No leads to show.</div>
              )}

              {list.data && list.data.total_pages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    Page {list.data.page} of {list.data.total_pages} · {formatNumber(list.data.total)} leads
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= list.data.total_pages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
