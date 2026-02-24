import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { platformTheme } from '@/theme/platformTheme';
import { useToast } from '@/hooks/use-toast';
import {
  LayoutDashboard, DollarSign, Users, BarChart3, Settings,
  ExternalLink, Copy, Search, Download, Trash2, RefreshCw,
  Check, Circle, AlertCircle, Shield, ChevronRight, Globe,
  Loader2, ArrowLeft,
} from 'lucide-react';

const p = platformTheme;

type Section = 'overview' | 'pricing' | 'leads' | 'analytics' | 'settings';

const NAV_ITEMS: { id: Section; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function getToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

export default function Dashboard() {
  const [section, setSection] = useState<Section>('overview');
  const token = getToken();
  const [, setLocation] = useLocation();

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: p.colors.pageBg }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <AlertCircle style={{ width: 48, height: 48, color: p.colors.muted, margin: '0 auto 16px' }} />
          <h2 style={{ ...p.typography.h2, marginBottom: 8 }}>No access token</h2>
          <p style={{ ...p.typography.body, color: p.colors.muted }}>Use the link from your calculator creation to access the dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: p.colors.pageBg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <aside style={{
        width: 220, background: p.colors.surface, borderRight: `1px solid ${p.colors.border}`,
        display: 'flex', flexDirection: 'column', padding: '20px 0', flexShrink: 0,
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ padding: '0 20px 20px', borderBottom: `1px solid ${p.colors.borderLight}` }}>
          <div style={{ ...p.typography.h3, fontSize: 15, color: p.colors.accent }}>QuickQuote</div>
          <div style={{ ...p.typography.captionSm, marginTop: 2 }}>Dashboard</div>
        </div>
        <nav style={{ padding: '12px 8px', flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => setSection(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px',
                  borderRadius: p.radius.sm, border: 'none', cursor: 'pointer', marginBottom: 2,
                  background: active ? p.colors.accentLighter : 'transparent',
                  color: active ? p.colors.accent : p.colors.body,
                  fontWeight: active ? 600 : 400, fontSize: 14, textAlign: 'left',
                  transition: p.transitions.fast,
                }}
              >
                <Icon style={{ width: 18, height: 18 }} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${p.colors.borderLight}` }}>
          <button
            data-testid="nav-back-wizard"
            onClick={() => setLocation('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: p.colors.muted,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Wizard
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '32px 40px', maxWidth: 960, overflow: 'auto' }}>
        {section === 'overview' && <OverviewSection token={token} onNavigate={setSection} />}
        {section === 'pricing' && <PricingSection token={token} />}
        {section === 'leads' && <LeadsSection token={token} />}
        {section === 'analytics' && <AnalyticsSection token={token} />}
        {section === 'settings' && <SettingsSection token={token} />}
      </main>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: p.colors.surface, borderRadius: p.radius.md, padding: '20px 24px',
      border: `1px solid ${p.colors.borderLight}`, flex: 1, minWidth: 140,
    }}>
      <div style={{ ...p.typography.captionSm, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: p.colors.heading, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ ...p.typography.captionSm, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isLive = status === 'published' || status === 'live';
  return (
    <span data-testid="status-badge" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
      borderRadius: p.radius.pill, fontSize: 13, fontWeight: 600,
      background: isLive ? p.colors.successLight : p.colors.warningLight,
      color: isLive ? p.colors.success : p.colors.warning,
    }}>
      <Circle style={{ width: 8, height: 8, fill: 'currentColor' }} />
      {isLive ? 'Live' : 'Draft'}
    </span>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ ...p.typography.h1 }} data-testid={`section-title-${title.toLowerCase()}`}>{title}</h1>
      {sub && <p style={{ ...p.typography.body, color: p.colors.muted, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function OverviewSection({ token, onNavigate }: { token: string; onNavigate: (s: Section) => void }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/overview', `?token=${token}`],
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data) return <ErrorState message="Failed to load overview" />;

  const { calculator, status, hosted_url, subdomain, custom_domain, custom_domain_status, stats } = data;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ ...p.typography.h1 }}>{calculator.business_name}</h1>
          <p style={{ ...p.typography.body, color: p.colors.muted, marginTop: 4 }}>{calculator.trade_type}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StatusBadge status={status} />
          <button
            data-testid="button-edit-calculator"
            onClick={() => window.open(`/EditCalculator?token=${token}`, '_blank')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              borderRadius: p.radius.sm, border: `1px solid ${p.colors.border}`,
              background: p.colors.surface, color: p.colors.body, fontSize: 13,
              fontWeight: 500, cursor: 'pointer',
            }}
          >
            Edit <ExternalLink style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>

      {hosted_url && (
        <div data-testid="hosted-link" style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: p.colors.accentLighter, borderRadius: p.radius.sm, marginBottom: 24,
          border: `1px solid ${p.colors.accent}20`,
        }}>
          <Globe style={{ width: 16, height: 16, color: p.colors.accent }} />
          <span style={{ ...p.typography.bodySm, color: p.colors.accent, fontWeight: 500, flex: 1 }}>
            {subdomain}
          </span>
          <CopyButton text={hosted_url} />
          <a href={hosted_url} target="_blank" rel="noopener noreferrer" style={{ color: p.colors.accent }}>
            <ExternalLink style={{ width: 14, height: 14 }} />
          </a>
        </div>
      )}

      {custom_domain && custom_domain_status !== 'none' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
          background: p.colors.surfaceRaised, borderRadius: p.radius.sm, marginBottom: 24,
          border: `1px solid ${p.colors.borderLight}`,
        }}>
          <Shield style={{ width: 14, height: 14, color: custom_domain_status === 'active' ? p.colors.success : p.colors.warning }} />
          <span style={{ ...p.typography.captionSm }}>{custom_domain}</span>
          <span style={{
            ...p.typography.captionSm, marginLeft: 'auto',
            color: custom_domain_status === 'active' ? p.colors.success : p.colors.warning,
          }}>
            {custom_domain_status === 'active' ? 'Active' : custom_domain_status === 'pending_dns' ? 'Pending DNS' : custom_domain_status}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <StatCard label="Leads this week" value={stats.leads_this_week} />
        <StatCard label="Conversion rate" value={`${stats.conversion_rate}%`} />
        <StatCard label="Total views" value={stats.total_views} />
        <StatCard label="Avg quote" value={stats.avg_quote > 0 ? `$${stats.avg_quote}` : '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'View Leads', icon: Users, section: 'leads' as Section, count: stats.total_leads },
          { label: 'View Analytics', icon: BarChart3, section: 'analytics' as Section },
          { label: 'Edit Pricing', icon: DollarSign, section: 'pricing' as Section },
          { label: 'Settings', icon: Settings, section: 'settings' as Section },
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              data-testid={`quick-${item.section}`}
              onClick={() => onNavigate(item.section)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                background: p.colors.surface, border: `1px solid ${p.colors.borderLight}`,
                borderRadius: p.radius.sm, cursor: 'pointer', textAlign: 'left',
                transition: p.transitions.fast,
              }}
            >
              <Icon style={{ width: 18, height: 18, color: p.colors.muted }} />
              <span style={{ ...p.typography.bodySm, fontWeight: 500, flex: 1 }}>{item.label}</span>
              {'count' in item && item.count !== undefined && (
                <span style={{ ...p.typography.captionSm, color: p.colors.accent }}>{item.count}</span>
              )}
              <ChevronRight style={{ width: 14, height: 14, color: p.colors.subtle }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PricingSection({ token }: { token: string }) {
  const { data } = useQuery<any>({
    queryKey: ['/api/dashboard/overview', `?token=${token}`],
  });

  const settings = (data as any)?.calculator?.calculator_settings || {};
  const publish = settings.publish || {};
  const testHistory = settings.test_history;

  let confidence: 'strong' | 'close' | 'needs_adjustment' | 'unknown' = 'unknown';
  if (testHistory?.refinement?.last_tier) {
    confidence = testHistory.refinement.last_tier;
  } else if (testHistory?.accuracy_score !== undefined) {
    const score = testHistory.accuracy_score;
    confidence = score >= 80 ? 'strong' : score >= 60 ? 'close' : 'needs_adjustment';
  }

  const confidenceColor = confidence === 'strong' ? p.colors.success
    : confidence === 'close' ? p.colors.warning
    : confidence === 'needs_adjustment' ? p.colors.danger
    : p.colors.muted;

  const confidenceLabel = confidence === 'strong' ? 'Strong'
    : confidence === 'close' ? 'Close'
    : confidence === 'needs_adjustment' ? 'Needs Adjustment'
    : 'Not tested';

  return (
    <div>
      <SectionHeader title="Pricing" sub="Manage your calculator's pricing configuration" />

      <div style={{
        background: p.colors.surface, borderRadius: p.radius.md, padding: 24,
        border: `1px solid ${p.colors.borderLight}`, marginBottom: 16,
      }}>
        <div style={{ ...p.typography.label, marginBottom: 16 }}>Quote Confidence</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%', background: confidenceColor,
          }} />
          <span data-testid="text-confidence" style={{ ...p.typography.body, fontWeight: 600, color: confidenceColor }}>
            {confidenceLabel}
          </span>
          {testHistory?.accuracy_score !== undefined && (
            <span style={{ ...p.typography.captionSm }}>({testHistory.accuracy_score}% accuracy)</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          data-testid="button-edit-pricing"
          onClick={() => window.open(`/EditCalculator?token=${token}`, '_blank')}
          style={{
            padding: '10px 20px', borderRadius: p.radius.sm, border: 'none',
            background: p.colors.accent, color: '#fff', fontSize: 14, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Edit Pricing
        </button>
        <button
          data-testid="button-revalidate"
          onClick={() => window.open(`/EditCalculator?token=${token}`, '_blank')}
          style={{
            padding: '10px 20px', borderRadius: p.radius.sm,
            border: `1px solid ${p.colors.border}`,
            background: p.colors.surface, color: p.colors.body, fontSize: 14, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Re-run Validation
        </button>
      </div>
    </div>
  );
}

function LeadsSection({ token }: { token: string }) {
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/dashboard/leads', `?token=${token}${search ? `&search=${encodeURIComponent(search)}` : ''}`],
  });

  const deleteMutation = useMutation({
    mutationFn: async (leadId: number) => {
      await apiRequest('DELETE', `/api/dashboard/leads/${leadId}?token=${token}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/leads'] });
      toast({ title: 'Lead deleted' });
    },
  });

  const leads = data?.leads || [];

  return (
    <div>
      <SectionHeader title="Leads" sub={`${leads.length} total leads`} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flex: 1,
          padding: '8px 12px', background: p.colors.surface,
          border: `1px solid ${p.colors.border}`, borderRadius: p.radius.sm,
        }}>
          <Search style={{ width: 16, height: 16, color: p.colors.muted }} />
          <input
            data-testid="input-search-leads"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search leads..."
            style={{
              border: 'none', outline: 'none', flex: 1, fontSize: 14,
              color: p.colors.body, background: 'transparent',
            }}
          />
        </div>
        <a
          data-testid="button-export-csv"
          href={`/api/dashboard/leads/export?token=${token}`}
          download
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            borderRadius: p.radius.sm, border: `1px solid ${p.colors.border}`,
            background: p.colors.surface, color: p.colors.body, fontSize: 13,
            fontWeight: 500, textDecoration: 'none',
          }}
        >
          <Download style={{ width: 14, height: 14 }} /> Export CSV
        </a>
      </div>

      {isLoading ? <LoadingSkeleton /> : leads.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 0', color: p.colors.muted,
          background: p.colors.surface, borderRadius: p.radius.md,
          border: `1px solid ${p.colors.borderLight}`,
        }}>
          <Users style={{ width: 32, height: 32, margin: '0 auto 12px', color: p.colors.subtle }} />
          <p style={{ ...p.typography.body }}>No leads yet</p>
        </div>
      ) : (
        <div style={{
          background: p.colors.surface, borderRadius: p.radius.md,
          border: `1px solid ${p.colors.borderLight}`, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${p.colors.borderLight}` }}>
                {['Name', 'Phone', 'Email', 'Quote', 'Date', ''].map(h => (
                  <th key={h} style={{
                    ...p.typography.captionSm, padding: '10px 14px', textAlign: 'left',
                    fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead: any) => (
                <tr key={lead.id} data-testid={`lead-row-${lead.id}`} style={{
                  borderBottom: `1px solid ${p.colors.borderLight}`,
                }}>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm }}>{lead.name || '—'}</td>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm }}>{lead.phone || '—'}</td>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm }}>{lead.email || '—'}</td>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm, fontWeight: 600 }}>
                    {lead.quote_amount ? `$${lead.quote_amount}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', ...p.typography.captionSm }}>
                    {lead.created_date ? new Date(lead.created_date).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button
                      data-testid={`button-delete-lead-${lead.id}`}
                      onClick={() => {
                        if (confirm('Delete this lead?')) deleteMutation.mutate(lead.id);
                      }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: p.colors.subtle, padding: 4,
                      }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnalyticsSection({ token }: { token: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/analytics', `?token=${token}`],
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data) return <ErrorState message="Failed to load analytics" />;

  const trend = data.weekly_trend || [];
  const maxViews = Math.max(...trend.map((w: any) => w.views), 1);

  return (
    <div>
      <SectionHeader title="Analytics" sub="Last 30 days performance" />

      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <StatCard label="Total views" value={data.views} />
        <StatCard label="Total leads" value={data.leads} />
        <StatCard label="Conversion rate" value={`${data.conversion_rate}%`} />
        <StatCard label="Avg quote" value={data.avg_quote > 0 ? `$${data.avg_quote}` : '—'} />
      </div>

      <div style={{
        background: p.colors.surface, borderRadius: p.radius.md, padding: 24,
        border: `1px solid ${p.colors.borderLight}`,
      }}>
        <div style={{ ...p.typography.label, marginBottom: 20 }}>Weekly Trend</div>
        {trend.length === 0 ? (
          <p style={{ ...p.typography.body, color: p.colors.muted, textAlign: 'center', padding: '24px 0' }}>
            No data yet. Views and leads will appear here as your calculator gets traffic.
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {trend.map((week: any, i: number) => {
              const barHeight = Math.max((week.views / maxViews) * 100, 4);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ ...p.typography.captionSm, fontSize: 11 }}>{week.views}</span>
                  <div style={{
                    width: '100%', maxWidth: 40, height: barHeight,
                    background: p.colors.accent, borderRadius: '4px 4px 0 0', opacity: 0.8,
                  }} />
                  <span style={{ ...p.typography.captionSm, fontSize: 10 }}>
                    {new Date(week.week).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: p.colors.accent, opacity: 0.8 }} />
            <span style={{ ...p.typography.captionSm }}>Views</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ token }: { token: string }) {
  const { toast } = useToast();
  const { data } = useQuery<any>({
    queryKey: ['/api/dashboard/overview', `?token=${token}`],
  });
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState('');
  const [emailDirty, setEmailDirty] = useState(false);

  if (data && !emailDirty) {
    if (email !== (data.calculator?.owner_email || '')) {
      setEmail(data.calculator?.owner_email || '');
    }
  }

  const settingsMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('PATCH', '/api/dashboard/settings', { token, ...updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/overview'] });
      toast({ title: 'Settings saved' });
    },
  });

  const republishMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/dashboard/republish', { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/overview'] });
      toast({ title: 'Calculator republished' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/dashboard/calculator?token=${token}`);
    },
    onSuccess: () => {
      toast({ title: 'Calculator deleted' });
      setLocation('/');
    },
  });

  return (
    <div>
      <SectionHeader title="Settings" sub="Manage notifications and deployment" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SettingsCard title="Notification email">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              data-testid="input-notification-email"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailDirty(true); }}
              placeholder="your@email.com"
              style={{
                flex: 1, padding: '8px 12px', borderRadius: p.radius.sm,
                border: `1px solid ${p.colors.border}`, fontSize: 14, color: p.colors.body,
                outline: 'none',
              }}
            />
            <button
              data-testid="button-save-email"
              onClick={() => { settingsMutation.mutate({ notification_email: email }); setEmailDirty(false); }}
              disabled={!emailDirty}
              style={{
                padding: '8px 16px', borderRadius: p.radius.sm, border: 'none',
                background: emailDirty ? p.colors.accent : p.colors.borderLight,
                color: emailDirty ? '#fff' : p.colors.muted, fontSize: 13, fontWeight: 500,
                cursor: emailDirty ? 'pointer' : 'default',
              }}
            >
              Save
            </button>
          </div>
        </SettingsCard>

        <SettingsCard title="SMS notifications" badge="Pro">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...p.typography.bodySm, color: p.colors.muted }}>Get SMS alerts for new leads</span>
            <div style={{
              width: 40, height: 22, borderRadius: 11, background: p.colors.borderLight,
              position: 'relative', opacity: 0.5, cursor: 'not-allowed',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2, left: 2, boxShadow: p.shadows.xs,
              }} />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title="Custom domain">
          <p style={{ ...p.typography.bodySm, color: p.colors.muted }}>
            {data?.custom_domain && data.custom_domain_status !== 'none'
              ? `${data.custom_domain} — ${data.custom_domain_status}`
              : 'No custom domain configured. Set up via the Publish step.'}
          </p>
        </SettingsCard>

        <SettingsCard title="Republish">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...p.typography.bodySm, color: p.colors.muted }}>Push latest changes live</span>
            <button
              data-testid="button-republish"
              onClick={() => republishMutation.mutate()}
              disabled={republishMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderRadius: p.radius.sm, border: 'none',
                background: p.colors.accent, color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {republishMutation.isPending ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <RefreshCw style={{ width: 14, height: 14 }} />}
              Republish
            </button>
          </div>
        </SettingsCard>

        <SettingsCard title="Danger zone" danger>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...p.typography.bodySm, color: p.colors.danger }}>Permanently delete this calculator and all its data</span>
            <button
              data-testid="button-delete-calculator"
              onClick={() => {
                if (confirm('Are you sure? This will permanently delete your calculator, all leads, and analytics data. This cannot be undone.')) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              style={{
                padding: '8px 16px', borderRadius: p.radius.sm, border: 'none',
                background: p.colors.danger, color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Delete Calculator
            </button>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({ title, children, badge, danger }: { title: string; children: any; badge?: string; danger?: boolean }) {
  return (
    <div style={{
      background: p.colors.surface, borderRadius: p.radius.md, padding: '20px 24px',
      border: `1px solid ${danger ? p.colors.danger + '30' : p.colors.borderLight}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ ...p.typography.label }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: p.radius.pill,
            background: p.colors.accentLighter, color: p.colors.accent,
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      data-testid="button-copy-link"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.colors.accent, padding: 2 }}
    >
      {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '40px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: p.colors.muted }}>
        <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
        <span style={{ ...p.typography.body }}>Loading...</span>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <AlertCircle style={{ width: 32, height: 32, color: p.colors.danger, margin: '0 auto 12px' }} />
      <p style={{ ...p.typography.body, color: p.colors.muted }}>{message}</p>
    </div>
  );
}
