// QuoteQuick calculator owner dashboard — overview, leads, analytics, settings, bookings.
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { trackEvent } from '@/lib/trackEvent';
import { platformTheme } from '@/theme/platformTheme';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard, DollarSign, Users, BarChart3, Settings,
  ExternalLink, Copy, Search, Download, Trash2, RefreshCw,
  Check, Circle, AlertCircle, Shield, ChevronRight, Globe,
  Loader2, ArrowLeft, Zap, Send, Clock, ChevronDown, ChevronUp,
  Mail, MessageSquare, Play, Pause, Eye, CalendarDays, Phone,
  HelpCircle, X, TicketCheck, Sparkles,
} from 'lucide-react';
import UpgradeGate, { PlanBadge } from '@/components/dashboard/UpgradeGate';

const p = platformTheme;

type Section = 'overview' | 'pricing' | 'leads' | 'analytics' | 'followup' | 'settings' | 'bookings' | 'messages';

const NAV_ITEMS: { id: Section; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'followup', label: 'Follow-Up', icon: Zap },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays },
];

function getToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

export default function Dashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [supportOpen, setSupportOpen] = useState(false);
  const token = getToken();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Allow access via token OR session auth
  if (!token && !authLoading && !isAuthenticated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: p.colors.pageBg }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <AlertCircle style={{ width: 48, height: 48, color: p.colors.muted, margin: '0 auto 16px' }} />
          <h2 style={{ ...p.typography.h2, marginBottom: 8 }}>Access required</h2>
          <p style={{ ...p.typography.body, color: p.colors.muted, marginBottom: 16 }}>Sign in or use the link from your calculator creation to access the dashboard.</p>
          <a href="/login" style={{ color: p.colors.accent, fontSize: 14, textDecoration: "none" }}>Go to login</a>
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
          <div style={{ ...p.typography.h3, fontSize: 15, color: p.colors.accent }}>QuoteQuick</div>
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
            onClick={() => setLocation('/wizard')}
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
        {section === 'bookings' && <BookingsSection token={token} />}
        {section === 'messages' && <MessagesSection token={token} />}
      </main>

      {supportOpen && (
        <SupportChatPanel token={token} onClose={() => setSupportOpen(false)} />
      )}

      <button
        data-testid="button-help-support"
        onClick={() => setSupportOpen(prev => !prev)}
        title="Help & Support"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: p.colors.accent, color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        {supportOpen
          ? <X style={{ width: 22, height: 22 }} />
          : <HelpCircle style={{ width: 22, height: 22 }} />
        }
      </button>
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

  const { calculator, status, hosted_url, subdomain, custom_domain, custom_domain_status, stats, plan_tier } = data;
  const currentPlan = plan_tier || calculator?.plan_tier || "free";

  // Trial expiry detection
  const createdAt = calculator?.created_at ? new Date(calculator.created_at) : null;
  const daysSinceCreation = createdAt ? Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isTrialExpired = currentPlan === 'free' && daysSinceCreation >= 14 && status !== 'live';
  const isTrialActive = currentPlan === 'free' && daysSinceCreation < 14;
  const trialDaysLeft = isTrialActive ? Math.max(0, 14 - daysSinceCreation) : 0;

  // Upgrade success detection
  const params = new URLSearchParams(window.location.search);
  const justUpgraded = params.get('upgraded') === '1';

  // Checkout handler
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [billingAnnual, setBillingAnnual] = useState(false);
  const startCheckout = async (plan: 'solo' | 'business') => {
    setCheckoutLoading(plan);
    try {
      const res = await fetch('/api/calculators/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculator_id: calculator.id,
          token,
          plan,
          billing: billingAnnual ? 'annual' : 'monthly',
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setCheckoutLoading(null);
      }
    } catch {
      setCheckoutLoading(null);
    }
  };

  return (
    <div>
      {/* Upgrade success banner */}
      {justUpgraded && (
        <div data-testid="banner-upgraded" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: p.radius.sm,
          marginBottom: 20,
        }}>
          <Check style={{ width: 16, height: 16, color: '#059669' }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#065F46', margin: 0 }}>
              Your calculator is live!
            </p>
            <p style={{ fontSize: 12, color: '#047857', margin: '2px 0 0' }}>
              Your quote page is active and ready to receive leads.
            </p>
          </div>
        </div>
      )}

      {/* Trial expired banner */}
      {isTrialExpired && (
        <div data-testid="banner-trial-expired" style={{
          padding: '20px', borderRadius: p.radius.sm,
          background: '#FEF2F2', border: '1px solid #FECACA',
          marginBottom: 20,
        }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#991B1B', margin: '0 0 4px' }}>
            Your trial has ended and your calculator is paused.
          </p>
          <p style={{ fontSize: 13, color: '#B91C1C', margin: '0 0 14px', lineHeight: 1.5 }}>
            Choose a plan to turn it back on instantly. Your leads and settings are still saved.
          </p>
          {/* Billing toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setBillingAnnual(false)} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: !billingAnnual ? '#fff' : 'transparent',
              color: !billingAnnual ? p.colors.heading : '#9B2C2C',
              boxShadow: !billingAnnual ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>Monthly</button>
            <button onClick={() => setBillingAnnual(true)} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: billingAnnual ? '#fff' : 'transparent',
              color: billingAnnual ? p.colors.heading : '#9B2C2C',
              boxShadow: billingAnnual ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>Annual <span style={{ fontSize: 10, color: '#059669' }}>Save 20%</span></button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => startCheckout('solo')}
              disabled={!!checkoutLoading}
              style={{
                padding: '10px 20px', borderRadius: 8, border: `1px solid ${p.colors.border}`,
                background: '#fff', color: p.colors.heading, cursor: 'pointer',
                fontSize: 13, fontWeight: 700, opacity: checkoutLoading ? 0.6 : 1,
              }}
            >
              {checkoutLoading === 'solo' ? 'Redirecting...' : `Solo — $${billingAnnual ? 39 : 49}/mo`}
            </button>
            <button
              onClick={() => startCheckout('business')}
              disabled={!!checkoutLoading}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: p.colors.accent, color: '#fff', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, opacity: checkoutLoading ? 0.6 : 1,
              }}
            >
              {checkoutLoading === 'business' ? 'Redirecting...' : `Business — $${billingAnnual ? 79 : 99}/mo`}
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#9B2C2C', margin: '10px 0 0' }}>
            No data was deleted. Reactivation is instant.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ ...p.typography.h1, margin: 0 }}>{calculator.business_name}</h1>
            <PlanBadge plan={currentPlan} />
          </div>
          <p style={{ ...p.typography.body, color: p.colors.muted }}>{calculator.trade_type}</p>
          {isTrialActive && trialDaysLeft <= 7 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
              fontSize: 11, fontWeight: 700, color: '#D97706', textDecoration: 'none',
              background: '#FFFBEB', border: '1px solid #FDE68A', padding: '3px 10px', borderRadius: 20,
            }}>
              <Clock size={9} /> {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in trial
            </span>
          )}
          {currentPlan === 'free' && !isTrialExpired && trialDaysLeft > 7 && (
            <button onClick={() => startCheckout('solo')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
              fontSize: 11, fontWeight: 700, color: '#0d3cfc', textDecoration: 'none',
              background: '#EEF3FF', border: '1px solid #A7F3D0', padding: '3px 10px', borderRadius: 20,
              cursor: 'pointer',
            }}>
              <Sparkles size={9} /> Upgrade — from $49/mo
            </button>
          )}
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

      {/* Zero-view nudge: calculator is live but no one has seen it */}
      {status === 'live' && stats.total_views === 0 && (
        <div data-testid="nudge-zero-views" style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: p.radius.sm,
          marginBottom: 24,
        }}>
          <Eye style={{ width: 16, height: 16, color: '#D97706', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#92400E', margin: '0 0 4px' }}>
              Your calculator is live, but no one has seen it yet.
            </p>
            <p style={{ fontSize: 12, color: '#A16207', margin: '0 0 8px', lineHeight: 1.5 }}>
              Copy your link or add it to your website to start getting quote requests.
            </p>
            {hosted_url && <CopyButton text={hosted_url} />}
          </div>
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
          boxShadow: p.shadows.card, minWidth: 100, overflow: 'hidden',
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

  const funnelSteps = [
    { label: 'Views', value: data.views, pct: null },
    { label: 'Leads', value: data.leads, pct: data.conversion_rate },
    { label: 'Bookings', value: data.bookings_confirmed ?? 0, pct: data.estimate_to_booking_pct },
    { label: 'Payments', value: data.payments_completed ?? 0, pct: data.booking_to_payment_pct },
  ];
  const maxFunnelValue = Math.max(...funnelSteps.map(s => s.value), 1);

  return (
    <div>
      <SectionHeader title="Analytics" sub="Last 30 days performance" />

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total views" value={data.views} />
        <StatCard label="Total leads" value={data.leads} />
        <StatCard label="Conversion rate" value={`${data.conversion_rate}%`} />
        <StatCard label="Avg quote" value={data.avg_quote > 0 ? `$${data.avg_quote}` : '—'} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Bookings" value={data.bookings_confirmed ?? 0} sub="Confirmed bookings" />
        <StatCard label="Payments" value={data.payments_completed ?? 0} sub="Deposits paid" />
        <StatCard label="Coupon Uses" value={data.coupon_uses ?? 0} sub="Promo codes redeemed" />
      </div>

      <div data-testid="conversion-funnel" style={{
        background: p.colors.surface, borderRadius: p.radius.md, padding: 24,
        border: `1px solid ${p.colors.borderLight}`, marginBottom: 24,
      }}>
        <div style={{ ...p.typography.label, marginBottom: 20 }}>Conversion Funnel</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {funnelSteps.map((step, i) => {
            const barWidth = maxFunnelValue > 0 ? Math.max((step.value / maxFunnelValue) * 100, step.value > 0 ? 2 : 0) : 0;
            return (
              <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ ...p.typography.captionSm, width: 64, textAlign: 'right', flexShrink: 0 }}>{step.label}</div>
                <div style={{ flex: 1, background: p.colors.borderLight, borderRadius: 4, height: 20, position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    width: `${barWidth}%`, height: '100%',
                    background: i === 0 ? p.colors.accent : i === 1 ? p.colors.accent + 'cc' : i === 2 ? p.colors.accent + '99' : p.colors.accent + '66',
                    borderRadius: 4, transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ ...p.typography.captionSm, width: 32, textAlign: 'right', fontWeight: 600, flexShrink: 0 }}>{step.value}</div>
                {step.pct !== null && step.pct !== undefined && (
                  <div style={{
                    ...p.typography.captionSm, width: 48, textAlign: 'right', flexShrink: 0,
                    color: p.colors.muted,
                  }}>
                    {step.pct}%
                  </div>
                )}
                {(step.pct === null || step.pct === undefined) && (
                  <div style={{ width: 48, flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
        <div style={{ ...p.typography.captionSm, marginTop: 12, color: p.colors.subtle }}>
          Views → Leads ({data.conversion_rate}%) → Bookings ({data.estimate_to_booking_pct}%) → Payments ({data.booking_to_payment_pct}%)
        </div>
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
  const { data: smsStatus } = useQuery<any>({
    queryKey: ['/api/dashboard/sms-status', `?token=${token}`],
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
          <UpgradeGate
            currentPlan={data?.plan_tier || data?.calculator?.plan_tier || 'free'}
            feature="sms_whatsapp"
            featureLabel="SMS lead notifications"
            compact
          >
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
          </UpgradeGate>
        </SettingsCard>

        <SettingsCard title="Custom domain" badge="Pro">
          <UpgradeGate
            currentPlan={data?.plan_tier || data?.calculator?.plan_tier || 'free'}
            feature="custom_domain"
            featureLabel="Custom domain (e.g. quotes.yoursite.com)"
            compact
          >
            <p style={{ ...p.typography.bodySm, color: p.colors.muted }}>
              {data?.custom_domain && data.custom_domain_status !== 'none'
                ? `${data.custom_domain} — ${data.custom_domain_status}`
                : 'No custom domain configured. Set up via the Publish step.'}
            </p>
          </UpgradeGate>
        </SettingsCard>

        <SettingsCard title="Remove branding" badge="Starter">
          <UpgradeGate
            currentPlan={data?.plan_tier || data?.calculator?.plan_tier || 'free'}
            feature="remove_branding"
            featureLabel="Remove QuoteQuick Pro badge from your calculator"
            compact
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...p.typography.bodySm, color: p.colors.muted }}>
                Hide the QuoteQuick Pro powered-by badge
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: p.colors.success }}>Enabled on your plan</span>
            </div>
          </UpgradeGate>
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

        <AiEmployeeSettingsCard token={token} data={data} smsStatus={smsStatus} />

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

const BOOKING_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#FFFBEB', text: '#92400E', label: 'Pending' },
  confirmed: { bg: '#ECFDF5', text: '#065F46', label: 'Confirmed' },
  cancelled: { bg: '#FEF2F2', text: '#991B1B', label: 'Cancelled' },
};

function BookingStatusBadge({ status, bookingId, token }: { status: string; bookingId: number; token: string }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const colors = BOOKING_STATUS_COLORS[status] || BOOKING_STATUS_COLORS.pending;

  const mutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest('PATCH', `/api/dashboard/bookings/${bookingId}/status?token=${token}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/bookings'] });
      setOpen(false);
      toast({ title: 'Booking status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  return (
    <div style={{ position: 'relative' }}>
      <button
        data-testid={`button-booking-status-${bookingId}`}
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
          boxShadow: p.shadows.sm, minWidth: 110, overflow: 'hidden',
        }}>
          {Object.entries(BOOKING_STATUS_COLORS).map(([key, val]) => (
            <button
              key={key}
              data-testid={`booking-status-option-${key}`}
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

function BookingsSection({ token }: { token: string }) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/bookings', `?token=${token}`],
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest('PATCH', `/api/dashboard/bookings/${id}/status?token=${token}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/bookings'] });
      toast({ title: 'Booking status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  const bookings = data?.bookings || [];

  return (
    <div>
      <SectionHeader title="Bookings" sub={`${bookings.length} total bookings`} />

      {isLoading ? <LoadingSkeleton /> : bookings.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 0', color: p.colors.muted,
          background: p.colors.surface, borderRadius: p.radius.md,
          border: `1px solid ${p.colors.borderLight}`,
        }}>
          <CalendarDays style={{ width: 32, height: 32, margin: '0 auto 12px', color: p.colors.subtle }} />
          <p data-testid="text-no-bookings" style={{ ...p.typography.body }}>No bookings yet</p>
          <p style={{ ...p.typography.captionSm, marginTop: 4 }}>Bookings will appear here when customers schedule appointments.</p>
        </div>
      ) : (
        <div style={{
          background: p.colors.surface, borderRadius: p.radius.md,
          border: `1px solid ${p.colors.borderLight}`, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${p.colors.borderLight}` }}>
                {['Name', 'Date', 'Time', 'Status', 'Deposit Paid', 'Contact', 'Quote Value', ''].map(h => (
                  <th key={h} style={{
                    ...p.typography.captionSm, padding: '10px 14px', textAlign: 'left',
                    fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking: any) => (
                <tr key={booking.id} data-testid={`booking-row-${booking.id}`} style={{
                  borderBottom: `1px solid ${p.colors.borderLight}`,
                }}>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm }}>{booking.customer_name || '—'}</td>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm }}>{booking.date || '—'}</td>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm }}>{booking.time || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <BookingStatusBadge status={booking.status || 'pending'} bookingId={booking.id} token={token} />
                  </td>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm }}>
                    {booking.deposit_paid ? (
                      <span data-testid={`text-deposit-paid-${booking.id}`} style={{ color: p.colors.success, fontWeight: 600, fontSize: 12 }}>
                        <Check style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        Paid
                      </span>
                    ) : booking.deposit_amount > 0 ? (
                      <span data-testid={`text-deposit-unpaid-${booking.id}`} style={{ color: p.colors.warning, fontSize: 12 }}>
                        ${(booking.deposit_amount / 100).toFixed(2)} due
                      </span>
                    ) : (
                      <span style={{ color: p.colors.subtle, fontSize: 12 }}>N/A</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {booking.customer_email && (
                        <a data-testid={`link-email-${booking.id}`} href={`mailto:${booking.customer_email}`} title={booking.customer_email} style={{ color: p.colors.muted }}>
                          <Mail style={{ width: 14, height: 14 }} />
                        </a>
                      )}
                      {booking.customer_phone && (
                        <a data-testid={`link-phone-${booking.id}`} href={`tel:${booking.customer_phone}`} title={booking.customer_phone} style={{ color: p.colors.muted }}>
                          <Phone style={{ width: 14, height: 14 }} />
                        </a>
                      )}
                      {!booking.customer_email && !booking.customer_phone && (
                        <span style={{ ...p.typography.captionSm }}>—</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', ...p.typography.bodySm, fontWeight: 600 }}>
                    {booking.quote_amount ? `$${booking.quote_amount}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      {booking.status !== 'confirmed' && (
                        <button
                          data-testid={`button-confirm-booking-${booking.id}`}
                          onClick={() => statusMutation.mutate({ id: booking.id, status: 'confirmed' })}
                          disabled={statusMutation.isPending}
                          title="Confirm"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                            borderRadius: p.radius.sm, border: 'none', cursor: 'pointer',
                            background: p.colors.successLight, color: p.colors.success,
                            fontSize: 11, fontWeight: 600,
                          }}
                        >
                          <Check style={{ width: 12, height: 12 }} /> Confirm
                        </button>
                      )}
                      {booking.status !== 'cancelled' && (
                        <button
                          data-testid={`button-cancel-booking-${booking.id}`}
                          onClick={() => {
                            if (confirm('Cancel this booking?')) {
                              statusMutation.mutate({ id: booking.id, status: 'cancelled' });
                            }
                          }}
                          disabled={statusMutation.isPending}
                          title="Cancel"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                            borderRadius: p.radius.sm, border: 'none', cursor: 'pointer',
                            background: p.colors.dangerLight, color: p.colors.danger,
                            fontSize: 11, fontWeight: 600,
                          }}
                        >
                          <Trash2 style={{ width: 12, height: 12 }} /> Cancel
                        </button>
                      )}
                    </div>
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

function MessagesSection({ token }: { token: string }) {
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/messages', `?token=${token}`],
  });

  const aiPauseMutation = useMutation({
    mutationFn: async ({ leadId, paused }: { leadId: number; paused: boolean }) => {
      await apiRequest('PATCH', `/api/dashboard/leads/${leadId}/ai-pause?token=${token}`, { paused });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/messages'] });
      toast({ title: 'AI status updated' });
    },
  });

  const threads: any[] = data?.threads || [];
  const selectedThread = threads.find((t: any) => t.lead.id === selectedLeadId);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div>
      <SectionHeader title="Messages" sub="SMS and WhatsApp conversations with leads" />

      {threads.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 0', color: p.colors.muted,
          background: p.colors.surface, borderRadius: p.radius.md,
          border: `1px solid ${p.colors.borderLight}`,
        }}>
          <MessageSquare style={{ width: 32, height: 32, margin: '0 auto 12px', color: p.colors.subtle }} />
          <p data-testid="text-no-messages" style={{ ...p.typography.body }}>No SMS conversations yet.</p>
          <p style={{ ...p.typography.captionSm, marginTop: 4 }}>Enable SMS in Settings &rsaquo; AI Employee to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 0, border: `1px solid ${p.colors.borderLight}`, borderRadius: p.radius.md, overflow: 'hidden', background: p.colors.surface }}>
          <div style={{ width: 260, borderRight: `1px solid ${p.colors.borderLight}`, flexShrink: 0 }}>
            {threads.map((thread: any) => {
              const lead = thread.lead;
              const messages: any[] = thread.messages || [];
              const lastMsg = messages[messages.length - 1];
              const isSelected = lead.id === selectedLeadId;
              return (
                <button
                  key={lead.id}
                  data-testid={`thread-${lead.id}`}
                  onClick={() => setSelectedLeadId(lead.id)}
                  style={{
                    display: 'block', width: '100%', padding: '12px 14px',
                    textAlign: 'left', border: 'none', cursor: 'pointer',
                    background: isSelected ? p.colors.accentLighter : 'transparent',
                    borderBottom: `1px solid ${p.colors.borderLight}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ ...p.typography.bodySm, fontWeight: 600, color: isSelected ? p.colors.accent : p.colors.heading }}>
                      {lead.name || lead.phone || 'Unknown'}
                    </span>
                    {lead.ai_paused && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: p.radius.pill, background: p.colors.warningLight, color: p.colors.warning }}>
                        Paused
                      </span>
                    )}
                  </div>
                  <div style={{ ...p.typography.captionSm, color: p.colors.muted }}>{lead.phone || '—'}</div>
                  {lastMsg && (
                    <div style={{ ...p.typography.captionSm, color: p.colors.subtle, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 210 }}>
                      {lastMsg.direction === 'outbound' ? 'You: ' : ''}{lastMsg.body}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
            {!selectedThread ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.colors.subtle }}>
                <div style={{ textAlign: 'center' }}>
                  <MessageSquare style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
                  <p style={{ ...p.typography.captionSm }}>Select a conversation</p>
                </div>
              </div>
            ) : (
              <>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${p.colors.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ ...p.typography.bodySm, fontWeight: 600 }}>{selectedThread.lead.name || selectedThread.lead.phone || 'Unknown'}</div>
                    <div style={{ ...p.typography.captionSm, color: p.colors.muted }}>{selectedThread.lead.phone}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selectedThread.lead.ai_paused ? (
                      <button
                        data-testid={`button-resume-ai-${selectedThread.lead.id}`}
                        onClick={() => aiPauseMutation.mutate({ leadId: selectedThread.lead.id, paused: false })}
                        disabled={aiPauseMutation.isPending}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                          borderRadius: p.radius.sm, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                          background: p.colors.successLight, color: p.colors.success,
                        }}
                      >
                        <Play style={{ width: 12, height: 12 }} /> Resume AI
                      </button>
                    ) : (
                      <button
                        data-testid={`button-takeover-${selectedThread.lead.id}`}
                        onClick={() => aiPauseMutation.mutate({ leadId: selectedThread.lead.id, paused: true })}
                        disabled={aiPauseMutation.isPending}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                          borderRadius: p.radius.sm, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                          background: p.colors.warningLight, color: p.colors.warning,
                        }}
                      >
                        <Pause style={{ width: 12, height: 12 }} /> Take Over
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(selectedThread.messages || []).map((msg: any) => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div
                        key={msg.id}
                        data-testid={`msg-${msg.id}`}
                        style={{ display: 'flex', justifyContent: isOutbound ? 'flex-end' : 'flex-start' }}
                      >
                        <div style={{
                          maxWidth: '70%', padding: '8px 12px', borderRadius: p.radius.sm,
                          background: isOutbound ? p.colors.accent : p.colors.surfaceRaised,
                          color: isOutbound ? '#fff' : p.colors.body, fontSize: 13, lineHeight: 1.5,
                        }}>
                          <div>{msg.body}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: isOutbound ? 'flex-end' : 'flex-start' }}>
                            {msg.is_ai && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: p.radius.pill, background: isOutbound ? 'rgba(255,255,255,0.2)' : p.colors.accentLighter, color: isOutbound ? '#fff' : p.colors.accent }}>
                                AI
                              </span>
                            )}
                            <span style={{ fontSize: 10, color: isOutbound ? 'rgba(255,255,255,0.7)' : p.colors.subtle }}>
                              {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '10px 16px', borderTop: `1px solid ${p.colors.borderLight}` }}>
                  <p style={{ ...p.typography.captionSm, color: p.colors.subtle }}>
                    Manual reply via phone for now. Use the Take Over button to pause AI responses.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AiEmployeeSettingsCard({ token, data, smsStatus }: { token: string; data: any; smsStatus: any }) {
  const settings = data?.calculator?.calculator_settings || {};
  const aiEmployee = settings.ai_employee || {};
  const channels = aiEmployee.channels || { web_chat: true, sms: false, whatsapp: false };
  const consent = aiEmployee.consent || {};

  const [webChat, setWebChat] = useState<boolean>(channels.web_chat ?? true);
  const [sms, setSms] = useState<boolean>(channels.sms ?? false);
  const [whatsapp, setWhatsapp] = useState<boolean>(channels.whatsapp ?? false);
  const [consentText, setConsentText] = useState<string>(consent.consent_text || 'I agree to receive text messages about my quote and booking from this business.');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest('PATCH', '/api/calculators', {
        token,
        updates: {
          calculator_settings: {
            ...settings,
            ai_employee: {
              ...aiEmployee,
              channels: { web_chat: webChat, sms, whatsapp },
              consent: { ...consent, consent_text: consentText },
            },
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/overview'] });
    } finally {
      setSaving(false);
    }
  };

  const ToggleSwitch = ({ checked, onChange, testId }: { checked: boolean; onChange: (v: boolean) => void; testId: string }) => (
    <button
      data-testid={testId}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0,
        background: checked ? p.colors.accent : p.colors.borderLight,
        position: 'relative', transition: p.transitions.fast,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2, left: checked ? 20 : 2,
        transition: p.transitions.fast, boxShadow: p.shadows.xs,
      }} />
    </button>
  );

  const planTier = data?.plan_tier || data?.calculator?.plan_tier || 'free';

  return (
    <SettingsCard title="AI Employee" badge="Beta">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...p.typography.captionSm, color: p.colors.muted }}>Control which channels your AI Employee responds on.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...p.typography.bodySm }}>Web Chat</span>
            <ToggleSwitch checked={webChat} onChange={setWebChat} testId="toggle-channel-web-chat" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...p.typography.bodySm }}>SMS</span>
              {smsStatus && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: p.radius.pill,
                  background: smsStatus.configured ? p.colors.successLight : p.colors.warningLight,
                  color: smsStatus.configured ? p.colors.success : p.colors.warning,
                }}>
                  {smsStatus.configured ? 'Connected' : 'Setup Required'}
                </span>
              )}
            </div>
            <ToggleSwitch checked={sms} onChange={setSms} testId="toggle-channel-sms" />
          </div>
          {smsStatus?.from_number && (
            <div style={{ ...p.typography.captionSm, color: p.colors.muted, paddingLeft: 0 }}>
              From: {smsStatus.from_number}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...p.typography.bodySm }}>WhatsApp</span>
              {smsStatus?.whatsapp_number ? (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: p.radius.pill, background: p.colors.successLight, color: p.colors.success }}>Connected</span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: p.radius.pill, background: p.colors.borderLight, color: p.colors.muted }}>Not Configured</span>
              )}
            </div>
            <ToggleSwitch checked={whatsapp} onChange={setWhatsapp} testId="toggle-channel-whatsapp" />
          </div>
        </div>

        {(sms || whatsapp) && (
          <div>
            <div style={{ ...p.typography.captionSm, color: p.colors.muted, marginBottom: 6 }}>SMS consent text</div>
            <textarea
              data-testid="input-consent-text"
              value={consentText}
              onChange={e => setConsentText(e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: p.radius.sm,
                border: `1px solid ${p.colors.border}`, fontSize: 13, color: p.colors.body,
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        <button
          data-testid="button-save-ai-employee"
          onClick={handleSave}
          disabled={saving}
          style={{
            alignSelf: 'flex-start', padding: '7px 16px', borderRadius: p.radius.sm, border: 'none',
            background: p.colors.accent, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </SettingsCard>
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

type SupportMessage = { role: 'user' | 'assistant'; content: string };

function SupportChatPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ticketCreated, setTicketCreated] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const newMessages: SupportMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await apiRequest('POST', '/api/ai/support-chat', {
        messages: newMessages,
        token,
        session_id: sessionId || undefined,
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.session_id && !sessionId) setSessionId(data.session_id);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  }

  async function createTicket() {
    setCreatingTicket(true);
    try {
      const description = messages.length > 0
        ? messages.filter(m => m.role === 'user').map(m => m.content).join(' | ')
        : 'Manual support request from dashboard';
      const res = await apiRequest('POST', '/api/ai/create-ticket', {
        token,
        description,
        transcript: messages,
      });
      const data = await res.json();
      setTicketId(data.ticket_id);
      setTicketCreated(true);
      toast({ title: 'Support ticket created', description: `Ticket #${data.ticket_id} submitted successfully.` });
    } catch {
      toast({ title: 'Failed to create ticket', variant: 'destructive' });
    } finally {
      setCreatingTicket(false);
    }
  }

  return (
    <div
      data-testid="support-chat-panel"
      style={{
        position: 'fixed', bottom: 96, right: 24, zIndex: 9999,
        width: 340, maxHeight: 520, display: 'flex', flexDirection: 'column',
        background: p.colors.surface, borderRadius: p.radius.md,
        border: `1px solid ${p.colors.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${p.colors.borderLight}`,
        background: p.colors.accent,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HelpCircle style={{ width: 16, height: 16, color: '#fff' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Help & Support</span>
        </div>
        <button
          data-testid="button-close-support-chat"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 2 }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 320 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: p.colors.muted }}>
            <HelpCircle style={{ width: 28, height: 28, margin: '0 auto 8px', color: p.colors.subtle }} />
            <p style={{ ...p.typography.bodySm }}>How can we help?</p>
            <p style={{ ...p.typography.captionSm, marginTop: 4 }}>Ask anything about your calculator or account.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            data-testid={`support-message-${i}`}
            style={{
              display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '80%', padding: '8px 12px', borderRadius: p.radius.sm, fontSize: 13, lineHeight: 1.5,
              background: msg.role === 'user' ? p.colors.accent : p.colors.surfaceRaised,
              color: msg.role === 'user' ? '#fff' : p.colors.body,
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '8px 12px', borderRadius: p.radius.sm, background: p.colors.surfaceRaised,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Loader2 style={{ width: 12, height: 12, color: p.colors.muted, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, color: p.colors.muted }}>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '8px 12px', borderTop: `1px solid ${p.colors.borderLight}` }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            data-testid="input-support-message"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type your question..."
            style={{
              flex: 1, padding: '7px 10px', borderRadius: p.radius.sm,
              border: `1px solid ${p.colors.border}`, fontSize: 13, color: p.colors.body,
              background: p.colors.pageBg, outline: 'none',
            }}
          />
          <button
            data-testid="button-send-support-message"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: p.radius.sm, border: 'none',
              background: input.trim() && !isLoading ? p.colors.accent : p.colors.borderLight,
              color: input.trim() && !isLoading ? '#fff' : p.colors.muted,
              cursor: input.trim() && !isLoading ? 'pointer' : 'default',
              flexShrink: 0,
            }}
          >
            <Send style={{ width: 14, height: 14 }} />
          </button>
        </div>
        {ticketCreated ? (
          <div data-testid="text-ticket-created" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
            background: p.colors.successLight, borderRadius: p.radius.sm, fontSize: 12,
            color: p.colors.success,
          }}>
            <TicketCheck style={{ width: 14, height: 14 }} />
            Ticket #{ticketId} created — we'll be in touch!
          </div>
        ) : (
          <button
            data-testid="button-talk-to-person"
            onClick={createTicket}
            disabled={creatingTicket}
            style={{
              width: '100%', padding: '6px 12px', borderRadius: p.radius.sm,
              border: `1px solid ${p.colors.border}`, background: p.colors.surface,
              color: p.colors.body, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {creatingTicket
              ? <><Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> Creating ticket...</>
              : <><MessageSquare style={{ width: 12, height: 12 }} /> Talk to a person</>
            }
          </button>
        )}
      </div>
    </div>
  );
}
