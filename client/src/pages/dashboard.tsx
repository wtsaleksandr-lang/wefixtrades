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
  Loader2, ArrowLeft, Zap, Send, Clock, ChevronDown, ChevronUp,
  Mail, MessageSquare, Play, Pause, Eye,
} from 'lucide-react';

const p = platformTheme;

type Section = 'overview' | 'pricing' | 'leads' | 'analytics' | 'followup' | 'settings';

const NAV_ITEMS: { id: Section; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'followup', label: 'Follow-Up', icon: Zap },
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
        {section === 'followup' && <FollowUpSection token={token} />}
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

const LEAD_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: '#dbeafe', text: '#1e40af', label: 'New' },
  contacted: { bg: '#fef3c7', text: '#92400e', label: 'Contacted' },
  won: { bg: '#d1fae5', text: '#065f46', label: 'Won' },
  lost: { bg: '#fee2e2', text: '#991b1b', label: 'Lost' },
};

function LeadStatusBadge({ status, leadId, token }: { status: string; leadId: number; token: string }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const colors = LEAD_STATUS_COLORS[status] || LEAD_STATUS_COLORS.new;

  const mutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest('PATCH', `/api/dashboard/leads/${leadId}/status?token=${token}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/leads'] });
      setOpen(false);
      toast({ title: 'Status updated' });
    },
  });

  return (
    <div style={{ position: 'relative' }}>
      <button
        data-testid={`button-lead-status-${leadId}`}
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
          background: colors.bg, color: colors.text, fontSize: 11, fontWeight: 600,
        }}
      >
        {colors.label}
        <ChevronDown style={{ width: 10, height: 10 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 10,
          background: '#fff', border: `1px solid ${p.colors.border}`, borderRadius: p.radius.sm,
          boxShadow: p.shadows.md, minWidth: 100, overflow: 'hidden',
        }}>
          {Object.entries(LEAD_STATUS_COLORS).map(([key, val]) => (
            <button
              key={key}
              data-testid={`lead-status-option-${key}`}
              onClick={() => mutation.mutate(key)}
              disabled={mutation.isPending}
              style={{
                display: 'block', width: '100%', padding: '6px 12px', border: 'none',
                background: key === status ? p.colors.accentLighter : 'transparent',
                cursor: 'pointer', fontSize: 12, textAlign: 'left', color: val.text,
                fontWeight: key === status ? 600 : 400,
              }}
            >
              {val.label}
            </button>
          ))}
        </div>
      )}
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
                {['Name', 'Phone', 'Email', 'Quote', 'Status', 'Date', ''].map(h => (
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
                  <td style={{ padding: '10px 14px' }}>
                    <LeadStatusBadge status={lead.status || 'new'} leadId={lead.id} token={token} />
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

const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string; sms?: string }> = {
  thank_you: {
    subject: 'Thanks for your quote, {{name}}!',
    body: 'Hi {{name}},\n\nThanks for requesting a quote from {{business_name}}! Your estimated price was {{quote_amount}}.\n\nWe\'d love to help you get started. Reply to this email or call us at {{phone}} to book.\n\nBest,\n{{business_name}}',
    sms: 'Hi {{name}}, thanks for your {{quote_amount}} quote from {{business_name}}! Call {{phone}} to book.',
  },
  reminder: {
    subject: 'Still thinking about your project, {{name}}?',
    body: 'Hi {{name}},\n\nJust checking in about your recent quote of {{quote_amount}} from {{business_name}}.\n\nWe have availability coming up and would love to get you scheduled. Book online: {{booking_link}}\n\nBest,\n{{business_name}}',
    sms: 'Hi {{name}}, still thinking about your project? Book with {{business_name}}: {{booking_link}}',
  },
  last_call: {
    subject: 'Your quote is expiring soon, {{name}}',
    body: 'Hi {{name}},\n\nYour quote of {{quote_amount}} from {{business_name}} will expire soon.\n\nDon\'t miss out — reply to lock in your price or call {{phone}}.\n\nBest,\n{{business_name}}',
    sms: 'Hi {{name}}, your {{quote_amount}} quote from {{business_name}} expires soon. Call {{phone}} to lock it in!',
  },
};

const SCHEDULE_DEFAULTS = [
  { type: 'thank_you', offset_minutes: 2, label: 'Thank You', timing: '2 minutes after' },
  { type: 'reminder', offset_hours: 24, label: 'Reminder', timing: '24 hours after' },
  { type: 'last_call', offset_days: 3, label: 'Last Call', timing: '3 days after' },
];

function FollowUpSection({ token }: { token: string }) {
  const { toast } = useToast();
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/followup', token],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/followup?token=${token}`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  const { data: logsData } = useQuery<any>({
    queryKey: ['/api/dashboard/notification-logs', token],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/notification-logs?token=${token}`);
      if (!res.ok) throw new Error('Failed to load logs');
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (followup: any) => {
      await apiRequest('PUT', '/api/dashboard/followup', { token, followup });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/followup'] });
      toast({ title: 'Settings saved' });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (templateType: string) => {
      const res = await apiRequest('POST', '/api/dashboard/followup/test', { token, template_type: templateType });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.message || 'Test email sent' });
    },
  });

  const followup = data?.followup || {};
  const enabled = followup.enabled || false;
  const templates = { ...DEFAULT_TEMPLATES, ...(followup.templates || {}) };
  const personalization = followup.personalization || {};
  const channels = followup.channels || { email: true, sms: false };
  const schedule = followup.schedule || SCHEDULE_DEFAULTS;
  const followupLogs = logsData?.followups || [];
  const notifLogs = logsData?.notifications || [];

  const updateFollowup = (patch: any) => {
    saveMutation.mutate({ ...followup, ...patch });
  };

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div>
      <SectionHeader title="Follow-Up Autopilot" sub="Automated lead nurturing sequences" />

      <div style={{
        background: p.colors.surface, borderRadius: p.radius.md, padding: '24px',
        border: `1px solid ${p.colors.borderLight}`, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ ...p.typography.h3, fontSize: 15, marginBottom: 4 }}>Autopilot Status</div>
            <div style={{ ...p.typography.captionSm }}>
              {enabled ? 'New leads will receive automated follow-up emails' : 'Follow-up sequences are paused'}
            </div>
          </div>
          <button
            data-testid="button-toggle-followup"
            onClick={() => updateFollowup({ enabled: !enabled })}
            disabled={saveMutation.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px',
              borderRadius: p.radius.sm, border: 'none', cursor: 'pointer',
              background: enabled ? p.colors.accent : p.colors.border,
              color: enabled ? '#fff' : p.colors.body, fontWeight: 600, fontSize: 13,
              transition: p.transitions.fast,
            }}
          >
            {enabled ? <><Pause style={{ width: 14, height: 14 }} /> Enabled</> : <><Play style={{ width: 14, height: 14 }} /> Disabled</>}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 999, fontSize: 11, fontWeight: 500,
            background: channels.email ? '#dbeafe' : '#f3f4f6', color: channels.email ? '#1e40af' : '#6b7280',
          }}>
            <Mail style={{ width: 12, height: 12 }} /> Email {channels.email ? 'On' : 'Off'}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 999, fontSize: 11, fontWeight: 500,
            background: '#f3f4f6', color: '#6b7280',
          }}>
            <MessageSquare style={{ width: 12, height: 12 }} /> SMS (Pro)
          </span>
        </div>
      </div>

      <div style={{
        background: p.colors.surface, borderRadius: p.radius.md, padding: '24px',
        border: `1px solid ${p.colors.borderLight}`, marginBottom: 20,
      }}>
        <div style={{ ...p.typography.h3, fontSize: 15, marginBottom: 4 }}>Personalization</div>
        <div style={{ ...p.typography.captionSm, marginBottom: 16 }}>
          These values fill in {'{{variables}}'} in your templates
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'business_name', label: 'Business Name', placeholder: 'Your Business' },
            { key: 'phone', label: 'Phone', placeholder: '(555) 123-4567' },
            { key: 'booking_link', label: 'Booking Link', placeholder: 'https://...' },
            { key: 'service_area', label: 'Service Area', placeholder: 'Greater Austin area' },
          ].map(field => (
            <div key={field.key}>
              <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: 4, fontWeight: 600 }}>{field.label}</label>
              <input
                data-testid={`input-personalization-${field.key}`}
                value={personalization[field.key] || ''}
                onChange={e => {
                  const updated = { ...personalization, [field.key]: e.target.value };
                  updateFollowup({ personalization: updated });
                }}
                placeholder={field.placeholder}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: p.radius.sm,
                  border: `1px solid ${p.colors.border}`, fontSize: 13, color: p.colors.body,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: p.colors.surface, borderRadius: p.radius.md,
        border: `1px solid ${p.colors.borderLight}`, marginBottom: 20, overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${p.colors.borderLight}` }}>
          <div style={{ ...p.typography.h3, fontSize: 15, marginBottom: 4 }}>Email Sequence</div>
          <div style={{ ...p.typography.captionSm }}>3-message drip sequence sent to new leads</div>
        </div>

        {SCHEDULE_DEFAULTS.map((step, idx) => {
          const template = templates[step.type] || {};
          const isExpanded = expandedTemplate === step.type;

          return (
            <div key={step.type} style={{ borderBottom: idx < 2 ? `1px solid ${p.colors.borderLight}` : 'none' }}>
              <button
                data-testid={`button-expand-template-${step.type}`}
                onClick={() => setExpandedTemplate(isExpanded ? null : step.type)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '14px 24px', border: 'none', cursor: 'pointer',
                  background: isExpanded ? p.colors.accentLighter : 'transparent',
                  textAlign: 'left', transition: p.transitions.fast,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                    background: enabled ? p.colors.accent : p.colors.border,
                    color: enabled ? '#fff' : p.colors.muted,
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: p.colors.heading }}>{step.label}</div>
                    <div style={{ fontSize: 12, color: p.colors.muted }}>{step.timing}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    data-testid={`button-test-template-${step.type}`}
                    onClick={e => { e.stopPropagation(); testMutation.mutate(step.type); }}
                    disabled={testMutation.isPending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                      borderRadius: p.radius.sm, border: `1px solid ${p.colors.border}`,
                      background: p.colors.surface, color: p.colors.body, fontSize: 11,
                      fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    <Send style={{ width: 10, height: 10 }} /> Test
                  </button>
                  {isExpanded ? <ChevronUp style={{ width: 16, height: 16, color: p.colors.muted }} /> : <ChevronDown style={{ width: 16, height: 16, color: p.colors.muted }} />}
                </div>
              </button>

              {isExpanded && (
                <div style={{ padding: '16px 24px 20px', background: '#fafbfc' }}>
                  <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: 4, fontWeight: 600 }}>Subject</label>
                  <input
                    data-testid={`input-template-subject-${step.type}`}
                    value={template.subject || ''}
                    onChange={e => {
                      const updated = { ...templates, [step.type]: { ...template, subject: e.target.value } };
                      updateFollowup({ templates: updated });
                    }}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: p.radius.sm,
                      border: `1px solid ${p.colors.border}`, fontSize: 13, marginBottom: 12,
                      color: p.colors.body, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: 4, fontWeight: 600 }}>Body</label>
                  <textarea
                    data-testid={`input-template-body-${step.type}`}
                    value={template.body || ''}
                    onChange={e => {
                      const updated = { ...templates, [step.type]: { ...template, body: e.target.value } };
                      updateFollowup({ templates: updated });
                    }}
                    rows={6}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: p.radius.sm,
                      border: `1px solid ${p.colors.border}`, fontSize: 13, lineHeight: 1.6,
                      color: p.colors.body, outline: 'none', resize: 'vertical',
                      fontFamily: "'Inter', system-ui, sans-serif", boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ ...p.typography.captionSm, marginTop: 8, color: p.colors.subtle }}>
                    Variables: {'{{name}}'} {'{{quote_amount}}'} {'{{business_name}}'} {'{{phone}}'} {'{{booking_link}}'} {'{{service_area}}'}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(followupLogs.length > 0 || notifLogs.length > 0) && (
        <div style={{
          background: p.colors.surface, borderRadius: p.radius.md,
          border: `1px solid ${p.colors.borderLight}`, overflow: 'hidden',
        }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${p.colors.borderLight}` }}>
            <div style={{ ...p.typography.h3, fontSize: 15, marginBottom: 4 }}>Recent Activity</div>
            <div style={{ ...p.typography.captionSm }}>Last 10 notifications and follow-ups</div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {[...notifLogs.slice(0, 5), ...followupLogs.slice(0, 5)]
              .sort((a: any, b: any) => new Date(b.created_at || b.run_at).getTime() - new Date(a.created_at || a.run_at).getTime())
              .slice(0, 10)
              .map((log: any, idx: number) => {
                const isNotif = 'type' in log && !('channel' in log);
                const status = log.status || 'pending';
                const statusColor = status === 'sent' ? '#059669' : status === 'failed' ? '#dc2626' : status === 'pending' ? '#d97706' : '#6b7280';
                return (
                  <div key={`${isNotif ? 'n' : 'f'}-${log.id || idx}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 24px', borderBottom: `1px solid ${p.colors.borderLight}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {isNotif ? <Mail style={{ width: 14, height: 14, color: p.colors.muted }} /> : <Clock style={{ width: 14, height: 14, color: p.colors.muted }} />}
                      <div>
                        <div style={{ fontSize: 13, color: p.colors.body }}>
                          {isNotif ? `Notification (${log.type})` : `Follow-up: ${log.type} via ${log.channel}`}
                        </div>
                        <div style={{ fontSize: 11, color: p.colors.muted }}>
                          Lead #{log.lead_id} — {new Date(log.created_at || log.run_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: statusColor,
                      textTransform: 'capitalize',
                    }}>
                      {status}
                    </span>
                  </div>
                );
              })}
          </div>
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
