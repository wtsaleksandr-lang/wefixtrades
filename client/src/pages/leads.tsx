import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Download, Users, ExternalLink, TrendingUp, Eye, BarChart3, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';

function SkeletonTable() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
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
                  </tr>
                </thead>
                <tbody>
                  {leadsList.map((lead: any, idx: number) => (
                    <tr
                      key={lead.id}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
