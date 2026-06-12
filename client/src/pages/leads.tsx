import { Fragment, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Download, Users, ExternalLink, TrendingUp, Eye, BarChart3, Check, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';

function SkeletonTable() {
  return (
    <div data-theme="light" className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="skeleton-shimmer h-7 w-56 rounded-lg mb-2" />
            <div className="skeleton-shimmer h-4 w-36 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="skeleton-shimmer h-9 w-28 rounded-md" />
            <div className="skeleton-shimmer h-9 w-28 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="skeleton-shimmer h-4 w-20 rounded mb-2" />
              <div className="skeleton-shimmer h-8 w-16 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-1">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-4 p-4 border-b border-slate-100">
              <div className="skeleton-shimmer h-4 w-24 rounded" />
              <div className="skeleton-shimmer h-4 w-28 rounded" />
              <div className="skeleton-shimmer h-4 w-40 rounded" />
              <div className="skeleton-shimmer h-4 w-24 rounded" />
              <div className="skeleton-shimmer h-4 w-20 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ Lead-answer rendering ============
// Lead `answers` is a jsonb record keyed by field id. Most values are
// primitives; the structured field types (address_distance, rate_matrix,
// photo_upload) store small objects. Every shape check below is defensive —
// answers come from historical widget submissions and may be partial or
// malformed, so each renderer falls back to a safe "--" instead of throwing.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** "port-newark" / "zone_2-far" → "Port Newark" / "Zone 2 Far" */
function deslugify(id: string): string {
  const cleaned = id.replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return id;
  return cleaned.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// address_distance answer: { address, distanceMiles, durationMin, manual?, status }
function isDistanceAnswer(v: Record<string, unknown>): boolean {
  return ('distanceMiles' in v || 'durationMin' in v) && ('address' in v || 'status' in v);
}

// rate_matrix answer: { rowId, colId }
function isMatrixAnswer(v: Record<string, unknown>): boolean {
  return typeof v.rowId === 'string' && typeof v.colId === 'string';
}

// photo_upload answer: { photos: [{url, name}], failed? }
function isPhotoAnswer(v: Record<string, unknown>): boolean {
  return Array.isArray(v.photos);
}

function DistanceAnswerView({ value }: { value: Record<string, unknown> }) {
  const address = typeof value.address === 'string' && value.address.trim() ? value.address.trim() : null;
  const miles = typeof value.distanceMiles === 'number' && Number.isFinite(value.distanceMiles) ? value.distanceMiles : null;
  const manual = value.manual === true;
  if (!address && miles === null) return <span className="text-slate-400">--</span>;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {address && <span className="text-slate-700">{address}</span>}
      {miles !== null && (
        <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
          {miles.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi
        </span>
      )}
      {manual && <span className="text-xs text-slate-400 whitespace-nowrap">(entered manually)</span>}
    </span>
  );
}

function MatrixAnswerView({ value }: { value: Record<string, unknown> }) {
  // Row/col labels live in the calculator config, which this endpoint does
  // not return — render de-slugified ids instead (human-enough: ids derive
  // from the labels the owner typed in the editor).
  return (
    <span className="text-slate-700">
      {deslugify(value.rowId as string)} <span className="text-slate-400" aria-hidden="true">&rarr;</span> {deslugify(value.colId as string)}
    </span>
  );
}

function PhotoAnswerView({ value }: { value: Record<string, unknown> }) {
  const photos = (value.photos as unknown[]).filter(
    (p): p is { url: string; name?: unknown } => isRecord(p) && typeof p.url === 'string' && p.url.length > 0,
  );
  const failed = typeof value.failed === 'number' && value.failed > 0 ? value.failed : 0;
  if (photos.length === 0 && failed === 0) return <span className="text-slate-400">--</span>;
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      {photos.map((p, i) => (
        <a
          key={i}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          title={typeof p.name === 'string' && p.name ? p.name : undefined}
          className="block rounded-lg overflow-hidden border border-slate-200 hover:border-slate-400 transition-colors flex-shrink-0"
          style={{ width: 48, height: 48 }}
          data-testid={`link-lead-photo-${i}`}
        >
          <img
            src={p.url}
            alt={typeof p.name === 'string' && p.name ? p.name : `Photo ${i + 1}`}
            width={48}
            height={48}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </a>
      ))}
      {photos.length > 0 && (
        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
        </span>
      )}
      {failed > 0 && <span className="text-xs text-slate-400 whitespace-nowrap">+{failed} failed</span>}
    </span>
  );
}

function AnswerValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">--</span>;
  if (typeof value === 'string' || typeof value === 'number') return <span className="text-slate-700">{String(value)}</span>;
  if (typeof value === 'boolean') return <span className="text-slate-700">{value ? 'Yes' : 'No'}</span>;
  if (Array.isArray(value)) {
    const parts = value.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number');
    if (parts.length === 0) return <span className="text-slate-400">--</span>;
    return <span className="text-slate-700">{parts.join(', ')}</span>;
  }
  if (isRecord(value)) {
    if (isPhotoAnswer(value)) return <PhotoAnswerView value={value} />;
    if (isDistanceAnswer(value)) return <DistanceAnswerView value={value} />;
    if (isMatrixAnswer(value)) return <MatrixAnswerView value={value} />;
    // Unknown structured answer — render compact JSON rather than crashing.
    // Values arrive via res.json() so they are plain JSON (stringify-safe).
    const json = JSON.stringify(value);
    return (
      <span className="text-slate-500 font-mono text-xs break-all">
        {json.length > 120 ? `${json.slice(0, 117)}...` : json}
      </span>
    );
  }
  return <span className="text-slate-400">--</span>;
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 animate-fade-in-up" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center`} style={{ background: `${color}10` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 tracking-tight">{value}</p>
    </div>
  );
}

export default function Leads() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const [csvExported, setCsvExported] = useState(false);
  const [expandedLeads, setExpandedLeads] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['/api/leads', { token }],
    queryFn: async () => {
      if (!token) throw new Error('No token provided.');
      const res = await fetch(`/api/leads?token=${token}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load leads.');
      return json;
    },
    enabled: !!token,
  });

  const exportCSV = () => {
    const leadsList = data?.leads || [];
    if (!leadsList.length) return;
    const esc = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['Date', 'Name', 'Email', 'Phone', 'Company', 'Quote ($)'];
    const rows = leadsList.map((l: any) => [
      format(new Date(l.created_date), 'yyyy-MM-dd HH:mm'),
      l.name, l.email, l.phone, l.company, l.quote_amount || 0
    ].map(esc));
    const csv = [headers, ...rows].map((r: string[]) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${data?.calculator?.slug || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCsvExported(true);
    setTimeout(() => setCsvExported(false), 2000);
  };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center px-4 gradient-mesh">
      <div className="text-center animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5 border border-amber-100">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2" data-testid="text-leads-error">Access Error</h2>
        <p className="text-slate-500 text-sm">No token provided in the URL.</p>
      </div>
    </div>
  );

  if (isLoading) return <SkeletonTable />;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4 gradient-mesh">
      <div className="text-center animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5 border border-amber-100">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2" data-testid="text-leads-error">Access Error</h2>
        <p className="text-slate-500 text-sm">{(error as Error).message}</p>
      </div>
    </div>
  );

  const { calculator, leads: leadsList = [] } = data;
  const origin = window.location.origin;
  const calcUrl = `${origin}/Calculator?slug=${calculator?.slug}`;
  const totalViews = calculator?.total_views || 0;
  const conversionRate = totalViews > 0 ? ((leadsList.length / totalViews) * 100).toFixed(1) : '0';
  const totalRevenue = leadsList.reduce((sum: number, l: any) => sum + (l.quote_amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-7 gap-4 animate-fade-in-up">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight" data-testid="text-leads-title">
              {calculator?.business_name}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Leads Dashboard
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <a href={calcUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" data-testid="link-calculator"><ExternalLink className="mr-1.5 w-3.5 h-3.5" /> Calculator</Button>
            </a>
            {leadsList.length > 0 && (
              <Button onClick={exportCSV} size="sm" variant="outline" data-testid="button-export-csv">
                {csvExported ? <><Check className="mr-1.5 w-3.5 h-3.5 text-emerald-600" /> Exported</> : <><Download className="mr-1.5 w-3.5 h-3.5" /> Export CSV</>}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
          <StatCard icon={Users} label="Total Leads" value={leadsList.length} color="#2563EB" />
          <StatCard icon={Eye} label="Calculator Views" value={totalViews} color="#0ea5e9" />
          <StatCard icon={TrendingUp} label="Conversion Rate" value={`${conversionRate}%`} color="#10b981" />
        </div>

        {leadsList.length === 0 ? (
          <Card className="animate-fade-in-up">
            <CardContent className="p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                <BarChart3 className="w-7 h-7 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2" data-testid="text-no-leads">No leads yet</h3>
              <p className="text-slate-500 text-sm mb-5 max-w-xs mx-auto">Share your calculator link to start collecting leads and quote requests.</p>
              <a href={calcUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline"><ExternalLink className="mr-1.5 w-3.5 h-3.5" /> Open Calculator</Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          <Card className="animate-fade-in-up animation-delay-100 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    {['Date', 'Name', 'Email', 'Phone', 'Company', 'Quote'].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50">{h}</th>
                    ))}
                    <th className="w-10 bg-slate-50/50"><span className="sr-only">Answers</span></th>
                  </tr>
                </thead>
                <tbody>
                  {leadsList.map((lead: any, idx: number) => {
                    const answerEntries: [string, unknown][] = isRecord(lead.answers) ? Object.entries(lead.answers) : [];
                    const isExpanded = !!expandedLeads[lead.id];
                    return (
                      <Fragment key={lead.id}>
                        <tr
                          className={`transition-colors hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                          data-testid={`row-lead-${lead.id}`}
                        >
                          <td className="px-5 py-3.5 text-sm text-slate-400 whitespace-nowrap font-mono text-xs">
                            {format(new Date(lead.created_date), 'MMM d, yyyy')}
                          </td>
                          <td className="px-5 py-3.5 text-sm font-semibold text-slate-800">{lead.name || '--'}</td>
                          <td className="px-5 py-3.5 text-sm text-slate-600">{lead.email || '--'}</td>
                          <td className="px-5 py-3.5 text-sm text-slate-500">{lead.phone || '--'}</td>
                          <td className="px-5 py-3.5 text-sm text-slate-500">{lead.company || '--'}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-bold text-slate-800">${(lead.quote_amount || 0).toLocaleString()}</span>
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            {answerEntries.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedLeads(prev => ({ ...prev, [lead.id]: !prev[lead.id] }))}
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Hide answers' : 'Show answers'}
                                title={isExpanded ? 'Hide answers' : 'Show answers'}
                                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                data-testid={`button-toggle-answers-${lead.id}`}
                              >
                                <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && answerEntries.length > 0 && (
                          <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                            <td colSpan={7} className="px-5 pb-4 pt-0">
                              <div
                                className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 rounded-lg bg-slate-50 border border-slate-100 px-4 py-3"
                                data-testid={`answers-lead-${lead.id}`}
                              >
                                {answerEntries.map(([key, val]) => (
                                  <div key={key} className="min-w-0">
                                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{deslugify(key)}</div>
                                    <div className="text-sm break-words"><AnswerValue value={val} /></div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
