import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Download, Users, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';

export default function Leads() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

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
  };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center"><AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2" data-testid="text-leads-error">Access Error</h2>
        <p className="text-slate-500">No token provided.</p>
      </div>
    </div>
  );

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center"><AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2" data-testid="text-leads-error">Access Error</h2>
        <p className="text-slate-500">{(error as Error).message}</p>
      </div>
    </div>
  );

  const { calculator, leads: leadsList = [] } = data;
  const origin = window.location.origin;
  const calcUrl = `${origin}/Calculator?slug=${calculator?.slug}`;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-leads-title">{calculator?.business_name} — Leads</h1>
            <p className="text-slate-500 text-sm mt-1">
              {leadsList.length} lead{leadsList.length !== 1 ? 's' : ''} · {calculator?.total_views || 0} views
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <a href={calcUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" data-testid="link-calculator"><ExternalLink className="mr-1.5 w-3.5 h-3.5" /> Calculator</Button>
            </a>
            {leadsList.length > 0 && (
              <Button onClick={exportCSV} size="sm" variant="outline" data-testid="button-export-csv">
                <Download className="mr-1.5 w-3.5 h-3.5" /> Export CSV
              </Button>
            )}
          </div>
        </div>

        {leadsList.length === 0 ? (
          <Card>
            <CardContent className="p-16 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-2" data-testid="text-no-leads">No leads yet</h3>
              <p className="text-slate-500 text-sm">Share your calculator to start collecting leads.</p>
              <a href={calcUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block">
                <Button size="sm" variant="outline"><ExternalLink className="mr-1.5 w-3.5 h-3.5" /> Open Calculator</Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Date', 'Name', 'Email', 'Phone', 'Company', 'Quote'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leadsList.map((lead: any) => (
                    <tr key={lead.id} className="hover:bg-slate-50 transition-colors" data-testid={`row-lead-${lead.id}`}>
                      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {format(new Date(lead.created_date), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{lead.name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{lead.email || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{lead.phone || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{lead.company || '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                        ${(lead.quote_amount || 0).toLocaleString()}
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
