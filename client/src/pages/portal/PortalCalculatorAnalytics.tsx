/**
 * Wave W-BB-4 — per-calculator conversion analytics dashboard.
 *
 * Renders the 30-day rollup served by GET
 * /api/portal/calculators/:id/analytics. Designed to match the Outgrow /
 * Calconic dashboards customers expect: four headline stat cards
 * (views / starts / completions / avg time), a daily line chart of
 * completions, and a table of the most-changed fields.
 *
 * The route param is the numeric calculator id (matches the existing
 * /portal route conventions). Range can be overridden via ?days=N.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import PortalLayout from '@/components/portal/PortalLayout';
import { usePageTitle } from '@/hooks/usePageTitle';

interface DailyPoint {
  date: string;
  views: number;
  starts: number;
  completions: number;
  abandonments: number;
}

interface AnalyticsResponse {
  calculator_id: number;
  days: number;
  totals: {
    views: number;
    starts: number;
    completions: number;
    abandonments: number;
    start_rate: number;
    conversion_rate: number;
    avg_completion_seconds: number | null;
  };
  series: DailyPoint[];
  top_fields: Array<{ field_id: string; changes: number }>;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatPct(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0%';
  return `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`;
}

function formatSeconds(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div data-theme="light"
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

interface SparklineProps {
  series: DailyPoint[];
}

/** Lightweight inline SVG line chart — no recharts dependency since the
 *  WeFixTrades portal already prefers minimal SVG sparklines elsewhere. */
function CompletionsChart({ series }: SparklineProps) {
  const data = series.map((p) => p.completions);
  const max = Math.max(1, ...data);
  const W = 800;
  const H = 200;
  const padL = 32;
  const padB = 28;
  const padT = 12;
  const padR = 12;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  if (n === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
        No completion data yet.
      </div>
    );
  }
  const stepX = n > 1 ? plotW / (n - 1) : plotW;
  const points = data
    .map((v, i) => {
      const x = padL + i * stepX;
      const y = padT + plotH - (v / max) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" role="img" aria-label="Completions over time">
      {/* y-axis baseline */}
      <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#e5e7eb" strokeWidth={1} />
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#e5e7eb" strokeWidth={1} />
      {/* line */}
      <polyline fill="none" stroke="#6366f1" strokeWidth={2} points={points} />
      {/* dots */}
      {data.map((v, i) => {
        const x = padL + i * stepX;
        const y = padT + plotH - (v / max) * plotH;
        return <circle key={i} cx={x} cy={y} r={2.5} fill="#6366f1" />;
      })}
      {/* y-max label */}
      <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize={10} fill="#6b7280">
        {max}
      </text>
      {/* first/last date labels */}
      <text x={padL} y={H - 8} fontSize={10} fill="#6b7280">
        {series[0]?.date}
      </text>
      <text x={W - padR} y={H - 8} textAnchor="end" fontSize={10} fill="#6b7280">
        {series[series.length - 1]?.date}
      </text>
    </svg>
  );
}

export default function PortalCalculatorAnalytics() {
  const [, params] = useRoute<{ id: string }>('/portal/calculators/:id/analytics');
  const calculatorId = params?.id;
  usePageTitle('Calculator Analytics');

  const { data, isLoading, isError, error } = useQuery<AnalyticsResponse>({
    queryKey: ['portal-calc-analytics', calculatorId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/calculators/${calculatorId}/analytics?days=30`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as AnalyticsResponse;
    },
    enabled: !!calculatorId,
  });

  const startRateLabel = useMemo(() => {
    if (!data) return '';
    return `${formatPct(data.totals.start_rate)} start rate`;
  }, [data]);

  const conversionLabel = useMemo(() => {
    if (!data) return '';
    return `${formatPct(data.totals.conversion_rate)} conversion`;
  }, [data]);

  return (
    <PortalLayout>
      <div data-theme="light">
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
          Calculator Analytics
        </h1>
        <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
          Last 30 days of widget activity.
        </div>

        {isLoading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Loading analytics…
          </div>
        )}

        {isError && (
          <div
            style={{
              padding: 16,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#7f1d1d',
              fontSize: 14,
            }}
          >
            Could not load analytics: {(error as Error)?.message ?? 'unknown error'}
          </div>
        )}

        {data && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              <StatCard label="Views" value={formatNumber(data.totals.views)} />
              <StatCard
                label="Starts"
                value={formatNumber(data.totals.starts)}
                hint={startRateLabel}
              />
              <StatCard
                label="Completions"
                value={formatNumber(data.totals.completions)}
                hint={conversionLabel}
              />
              <StatCard
                label="Avg time"
                value={formatSeconds(data.totals.avg_completion_seconds)}
              />
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
                Completions over time
              </div>
              <CompletionsChart series={data.series} />
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
                Most-changed fields
              </div>
              {data.top_fields.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>
                  No field interactions in the last 30 days.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>
                        Field
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>
                        Changes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_fields.map((row) => (
                      <tr key={row.field_id} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 0', color: '#111827' }}>{row.field_id}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumber(row.changes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
