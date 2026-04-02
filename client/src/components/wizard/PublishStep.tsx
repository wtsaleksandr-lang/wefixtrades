// FROZEN — scheduled for rebuild in Phase 3 (Builder Wizard). Do not add features.
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'wouter';
import { platformTheme } from '@/theme/platformTheme';
import {
  Check, Copy, ExternalLink, Code2, ChevronDown, RotateCcw,
  AlertCircle, Shield, Mail, Bot, Sparkles, Globe,
  CheckCircle2, XCircle, Clock, Zap, RefreshCw, Link2,
  Lock, Loader2, ArrowRight, Wrench, Server, MessageCircle,
  X, Send, Phone, User as UserIcon, Mic, Star,
} from 'lucide-react';

import { slugify, buildSubdomain, HOSTING_DOMAIN } from '@shared/slugUtils';
import type { CalculatorSettings } from '@shared/schema';

const p = platformTheme;

export interface PublishData {
  version: number;
  status: 'draft' | 'published';
  slug: string;
  subdomain: string;
  published_at: number | null;
  embed_id: string;
  last_modified: number | null;
  custom_domain: string;
  custom_domain_status: 'none' | 'pending_dns' | 'dns_verified' | 'ssl_provisioning' | 'active' | 'failed';
  ssl_status: 'none' | 'pending' | 'provisioning' | 'active' | 'failed';
  last_dns_check: number | null;
  hosting_domain: string;
}

type AIEmployee = CalculatorSettings['ai_employee'];

interface PublishStepProps {
  result: any;
  publishData: PublishData;
  testPassed: boolean;
  leadFormValid: boolean;
  pricingExists: boolean;
  businessName: string;
  aiEmployee: AIEmployee;
  tradeCategory?: string;
  onPublishDataChange: (pd: PublishData) => void;
  onAiEmployeeChange: (ae: AIEmployee) => void;
  onStartOver: () => void;
}

function CopyBtn({ text, size, label }: { text: string; size?: 'small' | 'normal'; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button data-testid={`copy-${(label || 'code').toLowerCase().replace(/[^a-z0-9]/g, '-')}`} onClick={copy} style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      padding: size === 'small' ? '4px 8px' : '8px 14px',
      borderRadius: '8px', border: size === 'small' ? 'none' : `1px solid ${p.colors.border}`,
      background: size === 'small' ? 'rgba(255,255,255,0.1)' : 'white',
      cursor: 'pointer', fontSize: '12px', fontWeight: 500,
      color: size === 'small' ? '#E5E7EB' : p.colors.muted,
      transition: p.transitions.fast, minHeight: size === 'small' ? '28px' : '36px',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {copied ? <Check style={{ width: '12px', height: '12px' }} /> : <Copy style={{ width: '12px', height: '12px' }} />}
      {copied ? 'Copied!' : (label || 'Copy')}
    </button>
  );
}

type DeployTab = 'hosted' | 'embed' | 'custom' | 'install';

export default function PublishStep({ result, publishData, testPassed, leadFormValid, pricingExists, businessName, aiEmployee, tradeCategory, onPublishDataChange, onAiEmployeeChange, onStartOver }: PublishStepProps) {
  const origin = window.location.origin;
  const calcUrl = result ? `${origin}${result.calculator_url}` : '';
  const slug = result?.slug || publishData.slug || slugify(businessName);
  const subdomain = buildSubdomain(slug, HOSTING_DOMAIN);
  const hostedUrl = `https://${subdomain}`;

  const [activeTab, setActiveTab] = useState<DeployTab>('hosted');
  const [embedTab, setEmbedTab] = useState<'script' | 'iframe' | 'button'>('script');
  const [showInstall, setShowInstall] = useState<string | null>(null);
  const [customDomain, setCustomDomain] = useState(publishData.custom_domain || '');
  const [dnsChecking, setDnsChecking] = useState(false);

  const canPublish = testPassed && leadFormValid && pricingExists;
  const isPublished = publishData.status === 'published';
  const hasChanges = !!(publishData.last_modified && publishData.published_at && publishData.last_modified > publishData.published_at);

  const statusLabel = isPublished ? (hasChanges ? 'Changes Not Published' : 'Live') : (canPublish ? 'Ready' : 'Draft');
  const statusColor = isPublished ? (hasChanges ? p.colors.warning : '#059669') : (canPublish ? p.colors.success : p.colors.muted);
  const statusBg = isPublished ? (hasChanges ? p.colors.warningLight : '#ECFDF5') : (canPublish ? p.colors.successLight : '#F3F4F6');

  const handlePublish = useCallback(() => {
    if (!canPublish || !result) return;
    onPublishDataChange({
      ...publishData,
      status: 'published',
      slug: result.slug || slug,
      subdomain,
      published_at: Date.now(),
      embed_id: result.slug || slug,
      last_modified: null,
      hosting_domain: HOSTING_DOMAIN,
    });
  }, [canPublish, result, publishData, slug, subdomain, onPublishDataChange]);

  useEffect(() => {
    if (result && publishData.status === 'draft' && canPublish) {
      handlePublish();
    }
  }, [result, canPublish]);

  const embedId = result?.slug || publishData.embed_id || slug;
  const scriptEmbed = `<script src="${origin}/embed.js" data-calculator="${embedId}"></script>\n<div id="quote-tool-${embedId}"></div>`;
  const iframeEmbed = `<iframe src="${calcUrl}?embed=true" width="100%" height="650" frameborder="0" style="border:none;border-radius:16px;max-width:480px;"></iframe>`;
  const buttonEmbed = `<script src="${origin}/embed.js" data-calculator="${embedId}" data-mode="modal"></script>\n<button onclick="QuickQuote.open('${embedId}')">Get a Free Quote</button>`;
  const embedCode = embedTab === 'script' ? scriptEmbed : embedTab === 'iframe' ? iframeEmbed : buttonEmbed;

  const readinessChecks = [
    { label: 'Pricing validated', passed: pricingExists, key: 'pricing' },
    { label: 'Lead form configured', passed: leadFormValid, key: 'leads' },
    { label: 'Test scenarios passed', passed: testPassed, key: 'tests' },
  ];

  const TABS: { id: DeployTab; label: string; icon: any; pro?: boolean }[] = [
    { id: 'hosted', label: 'Hosted Page', icon: <Globe style={{ width: '14px', height: '14px' }} /> },
    { id: 'embed', label: 'Embed', icon: <Code2 style={{ width: '14px', height: '14px' }} /> },
    { id: 'custom', label: 'Custom Domain', icon: <Server style={{ width: '14px', height: '14px' }} />, pro: true },
    { id: 'install', label: 'Done-For-You', icon: <Wrench style={{ width: '14px', height: '14px' }} />, pro: true },
  ];

  const domainStatus = publishData.custom_domain_status;
  const sslStatus = publishData.ssl_status;

  const handleCheckDns = useCallback(async () => {
    if (!customDomain || !result?.edit_token || !result?.calculator?.id) return;
    setDnsChecking(true);
    try {
      const res = await fetch('/api/domains/check-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculator_id: result.calculator.id,
          custom_domain: customDomain,
          token: result.edit_token,
        }),
      });
      const data = await res.json();
      if (data.dns_verified) {
        onPublishDataChange({
          ...publishData,
          custom_domain: customDomain,
          custom_domain_status: 'dns_verified',
          ssl_status: 'pending',
          last_dns_check: Date.now(),
        });
        try {
          await fetch('/api/domains/issue-ssl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              calculator_id: result.calculator.id,
              token: result.edit_token,
            }),
          });
          onPublishDataChange({
            ...publishData,
            custom_domain: customDomain,
            custom_domain_status: 'ssl_provisioning',
            ssl_status: 'provisioning',
            last_dns_check: Date.now(),
          });
        } catch {
          // SSL issue will be retried on next check
        }
      } else {
        onPublishDataChange({
          ...publishData,
          custom_domain: customDomain,
          custom_domain_status: 'pending_dns',
          last_dns_check: Date.now(),
        });
      }
    } catch {
      // ignore
    } finally {
      setDnsChecking(false);
    }
  }, [customDomain, result, publishData, onPublishDataChange]);

  useEffect(() => {
    if (domainStatus !== 'pending_dns' || !customDomain || !result?.edit_token) return;
    const interval = setInterval(handleCheckDns, 30000);
    return () => clearInterval(interval);
  }, [domainStatus, customDomain, result, handleCheckDns]);

  useEffect(() => {
    if (domainStatus !== 'ssl_provisioning' || !result?.edit_token) return;
    const pollSsl = async () => {
      try {
        const res = await fetch(`/api/domains/status?token=${result.edit_token}`);
        const data = await res.json();
        if (data.custom_domain_status === 'active') {
          onPublishDataChange({
            ...publishData,
            custom_domain_status: 'active',
            ssl_status: 'active',
          });
        }
      } catch { /* ignore */ }
    };
    const interval = setInterval(pollSsl, 5000);
    return () => clearInterval(interval);
  }, [domainStatus, result, publishData, onPublishDataChange]);

  return (
    <div className="animate-fade-in-up">
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        {isPublished && (
          <div className="animate-checkmark" style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.2)',
          }}>
            <Check style={{ width: '28px', height: '28px', color: 'white' }} />
          </div>
        )}

        <h2 data-testid="publish-heading" style={{ ...p.typography.h2, marginBottom: '6px' }}>
          {isPublished ? 'Calculator Published!' : 'Publish Your Calculator'}
        </h2>

        <div data-testid="status-badge" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '4px 12px', borderRadius: p.radius.pill,
          background: statusBg, fontSize: '12px', fontWeight: 600, color: statusColor,
        }}>
          {isPublished && !hasChanges && <CheckCircle2 style={{ width: '12px', height: '12px' }} />}
          {isPublished && hasChanges && <AlertCircle style={{ width: '12px', height: '12px' }} />}
          {!isPublished && canPublish && <CheckCircle2 style={{ width: '12px', height: '12px' }} />}
          {!isPublished && !canPublish && <Clock style={{ width: '12px', height: '12px' }} />}
          {statusLabel}
        </div>
      </div>

      {!isPublished && !canPublish && (
        <div data-testid="readiness-checklist" style={{
          padding: '16px', borderRadius: p.radius.md,
          background: p.colors.warningLight, border: `1px solid ${p.colors.warning}20`,
          marginBottom: '20px',
        }}>
          <p style={{ ...p.typography.label, marginBottom: '10px', color: p.colors.heading }}>
            Fix before publishing:
          </p>
          {readinessChecks.map(c => (
            <div key={c.key} data-testid={`check-${c.key}`} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 0', fontSize: '13px', color: c.passed ? p.colors.success : p.colors.danger,
            }}>
              {c.passed
                ? <CheckCircle2 style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                : <XCircle style={{ width: '14px', height: '14px', flexShrink: 0 }} />}
              {c.label}
            </div>
          ))}
        </div>
      )}

      {!isPublished && canPublish && (
        <button data-testid="button-publish" onClick={handlePublish} style={{
          width: '100%', padding: '14px', borderRadius: p.radius.md, border: 'none',
          background: `linear-gradient(135deg, ${p.colors.accent} 0%, ${p.colors.accentLight} 100%)`,
          color: 'white', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          boxShadow: p.shadows.button, transition: p.transitions.normal,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          marginBottom: '20px', WebkitTapHighlightColor: 'transparent',
        }}>
          <CheckCircle2 style={{ width: '18px', height: '18px' }} />
          Publish Now
        </button>
      )}

      {isPublished && (
        <>
          {/* Subdomain Banner */}
          <div data-testid="subdomain-banner" style={{
            padding: '14px 16px', borderRadius: p.radius.md,
            background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)',
            border: '1px solid #A7F3D020',
            marginBottom: '20px', textAlign: 'center',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
              Your instant quote page
            </p>
            <p data-testid="text-subdomain" style={{
              fontSize: '16px', fontWeight: 700, color: '#059669',
              margin: '0 0 8px', fontFamily: 'monospace', wordBreak: 'break-all',
            }}>
              {subdomain}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
              <CopyBtn text={hostedUrl} label="Copy Link" />
              <button data-testid="action-open-tab" onClick={() => window.open(calcUrl, '_blank')} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '8px 12px', borderRadius: '8px', border: 'none',
                background: p.colors.accent, color: 'white',
                cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                minHeight: '36px', WebkitTapHighlightColor: 'transparent',
              }}>
                <ExternalLink style={{ width: '12px', height: '12px' }} /> Preview
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            <LinkRowCompact label="Edit Link (7 days)" url={`${origin}${result.edit_url}`}
              icon={<Sparkles style={{ width: '13px', height: '13px' }} />} />
            <LinkRowCompact label="Leads Dashboard" url={`${origin}${result.leads_url}`}
              icon={<Zap style={{ width: '13px', height: '13px' }} />} />
          </div>

          {/* Deployment Options Tabs */}
          <div data-testid="deploy-tabs" style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            borderRadius: p.radius.md, overflow: 'hidden',
            border: `1px solid ${p.colors.border}`, marginBottom: '16px',
          }}>
            {TABS.map(tab => (
              <button key={tab.id} data-testid={`deploy-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 4px', border: 'none',
                  background: activeTab === tab.id ? p.colors.accent : 'white',
                  color: activeTab === tab.id ? 'white' : p.colors.muted,
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  transition: p.transitions.fast,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                }}>
                {tab.icon}
                <span>{tab.label}</span>
                {tab.pro && (
                  <span style={{
                    position: 'absolute', top: '3px', right: '3px',
                    fontSize: '8px', fontWeight: 700, color: '#D97706',
                    background: '#FEF3C7', padding: '1px 4px', borderRadius: '4px',
                  }}>PRO</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{
            padding: '16px', borderRadius: p.radius.md,
            border: `1px solid ${p.colors.border}`, background: 'white',
            marginBottom: '20px',
          }}>
            {activeTab === 'hosted' && (
              <HostedPageTab
                subdomain={subdomain}
                hostedUrl={hostedUrl}
                calcUrl={calcUrl}
                slug={slug}
                isPublished={isPublished}
              />
            )}

            {activeTab === 'embed' && (
              <EmbedTab
                embedTab={embedTab}
                setEmbedTab={setEmbedTab}
                embedCode={embedCode}
                showInstall={showInstall}
                setShowInstall={setShowInstall}
              />
            )}

            {activeTab === 'custom' && (
              <CustomDomainTab
                customDomain={customDomain}
                setCustomDomain={setCustomDomain}
                domainStatus={domainStatus}
                sslStatus={sslStatus}
                dnsChecking={dnsChecking}
                onCheckDns={handleCheckDns}
                lastDnsCheck={publishData.last_dns_check}
              />
            )}

            {activeTab === 'install' && (
              <DoneForYouTab />
            )}
          </div>

          {/* Status & Health */}
          <div data-testid="health-indicators" style={{
            padding: '14px 16px', borderRadius: p.radius.md,
            background: p.colors.surfaceRaised, border: `1px solid ${p.colors.borderLight}`,
            marginBottom: '20px',
          }}>
            <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Status & Health
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <HealthRow icon={<Globe style={{ width: '13px', height: '13px' }} />}
                label="Hosted Page" value="Live" color="#059669" />
              <HealthRow icon={<Sparkles style={{ width: '13px', height: '13px' }} />}
                label="Pricing Status" value="Validated" color={p.colors.success} />
              <HealthRow icon={<Mail style={{ width: '13px', height: '13px' }} />}
                label="Lead Capture" value={leadFormValid ? 'Active' : 'Inactive'} color={leadFormValid ? p.colors.success : p.colors.danger} />
              <HealthRow icon={<Bot style={{ width: '13px', height: '13px' }} />}
                label="Anti-Spam" value="Enabled" color={p.colors.success} />
              <HealthRow icon={<Shield style={{ width: '13px', height: '13px' }} />}
                label="SSL" value={sslStatus === 'active' ? 'Active' : 'Auto-provisioned'} color={p.colors.success} />
              {publishData.custom_domain && (
                <HealthRow icon={<Server style={{ width: '13px', height: '13px' }} />}
                  label="Custom Domain"
                  value={domainStatus === 'active' ? 'Active' : domainStatus === 'pending_dns' ? 'Pending DNS' : domainStatus === 'ssl_provisioning' ? 'SSL Pending' : 'Not configured'}
                  color={domainStatus === 'active' ? '#059669' : '#D97706'} />
              )}
            </div>
          </div>

          {hasChanges && (
            <div data-testid="republish-banner" style={{
              padding: '12px 16px', borderRadius: p.radius.md,
              background: p.colors.warningLight, border: `1px solid ${p.colors.warning}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '16px',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.warning }}>Changes not published</span>
              <button data-testid="button-republish" onClick={handlePublish} style={{
                padding: '6px 14px', borderRadius: p.radius.sm, border: 'none',
                background: p.colors.warning, color: 'white', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600,
              }}>
                <RefreshCw style={{ width: '12px', height: '12px', display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Republish
              </button>
            </div>
          )}

          <div style={{
            padding: '14px 16px', background: p.colors.accentLighter,
            borderRadius: p.radius.md, fontSize: '13px', color: p.colors.accentDark,
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            border: `1px solid ${p.colors.accentLighter}`, marginBottom: '16px',
          }}>
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '1px' }} />
            <span><strong>Bookmark your links.</strong> The edit link expires in 7 days.</span>
          </div>
        </>
      )}

      {/* AI Employee Section */}
      <AIEmployeeSection
        aiEmployee={aiEmployee}
        tradeCategory={tradeCategory}
        onAiEmployeeChange={onAiEmployeeChange}
      />

      {isPublished && result?.edit_token && (
        <Link
          data-testid="link-dashboard"
          href={`/Dashboard?token=${result.edit_token}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', padding: '12px', borderRadius: p.radius.md,
            background: p.colors.accent, color: '#fff',
            fontSize: '14px', fontWeight: 600, textDecoration: 'none',
            marginBottom: '8px', transition: p.transitions.fast,
          }}
        >
          <Globe style={{ width: '15px', height: '15px' }} />
          Go to Dashboard
        </Link>
      )}

      <button data-testid="button-start-over" onClick={onStartOver} style={{
        width: '100%', padding: '12px', borderRadius: p.radius.md,
        border: `1px solid ${p.colors.border}`, background: '#FFFFFF',
        cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: p.colors.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        transition: p.transitions.fast, WebkitTapHighlightColor: 'transparent',
      }}>
        <RotateCcw style={{ width: '15px', height: '15px' }} />
        Create Another Calculator
      </button>
    </div>
  );
}

function HostedPageTab({ subdomain, hostedUrl, calcUrl, slug, isPublished }: {
  subdomain: string; hostedUrl: string; calcUrl: string; slug: string; isPublished: boolean;
}) {
  return (
    <div data-testid="tab-hosted">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px',
          background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Globe style={{ width: '14px', height: '14px', color: '#059669' }} />
        </div>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, margin: 0 }}>Instant Hosted Page</p>
          <p style={{ fontSize: '11px', color: p.colors.muted, margin: 0 }}>Live immediately with SSL</p>
        </div>
      </div>

      <div style={{
        padding: '14px', borderRadius: p.radius.md,
        background: '#F0FDF4', border: '1px solid #A7F3D030',
        marginBottom: '12px',
      }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
          Your subdomain
        </p>
        <p data-testid="text-hosted-url" style={{
          fontSize: '15px', fontWeight: 700, color: '#059669',
          margin: '0 0 2px', fontFamily: 'monospace', wordBreak: 'break-all',
        }}>
          {subdomain}
        </p>
        <p style={{ fontSize: '11px', color: p.colors.muted, margin: 0 }}>
          Auto-generated from your business name. No setup needed.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#F9FAFB', textAlign: 'center' }}>
          <CheckCircle2 style={{ width: '16px', height: '16px', color: '#059669', margin: '0 auto 4px', display: 'block' }} />
          <p style={{ fontSize: '11px', fontWeight: 600, color: p.colors.heading, margin: '0 0 2px' }}>SSL Active</p>
          <p style={{ fontSize: '10px', color: p.colors.muted, margin: 0 }}>Auto-provisioned</p>
        </div>
        <div style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#F9FAFB', textAlign: 'center' }}>
          <Zap style={{ width: '16px', height: '16px', color: '#059669', margin: '0 auto 4px', display: 'block' }} />
          <p style={{ fontSize: '11px', fontWeight: 600, color: p.colors.heading, margin: '0 0 2px' }}>Instant</p>
          <p style={{ fontSize: '10px', color: p.colors.muted, margin: 0 }}>No provisioning wait</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <CopyBtn text={hostedUrl} label="Copy Link" />
        <button data-testid="action-open-hosted" onClick={() => window.open(calcUrl, '_blank')} style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '8px 14px', borderRadius: '8px', border: `1px solid ${p.colors.border}`,
          background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: p.colors.body,
          WebkitTapHighlightColor: 'transparent',
        }}>
          <ExternalLink style={{ width: '12px', height: '12px' }} /> Open Page
        </button>
      </div>
    </div>
  );
}

function EmbedTab({ embedTab, setEmbedTab, embedCode, showInstall, setShowInstall }: {
  embedTab: 'script' | 'iframe' | 'button';
  setEmbedTab: (t: 'script' | 'iframe' | 'button') => void;
  embedCode: string;
  showInstall: string | null;
  setShowInstall: (id: string | null) => void;
}) {
  return (
    <div data-testid="tab-embed">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px',
          background: p.colors.accentLighter, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Code2 style={{ width: '14px', height: '14px', color: p.colors.accent }} />
        </div>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, margin: 0 }}>Embed on Your Website</p>
          <p style={{ fontSize: '11px', color: p.colors.muted, margin: 0 }}>Add your calculator to any site</p>
        </div>
      </div>

      <div data-testid="embed-tabs" style={{
        display: 'flex', borderRadius: p.radius.md, overflow: 'hidden',
        border: `1px solid ${p.colors.border}`, marginBottom: '10px',
      }}>
        {([
          { id: 'script' as const, label: 'Script', rec: true },
          { id: 'iframe' as const, label: 'Iframe' },
          { id: 'button' as const, label: 'Button' },
        ]).map(tab => (
          <button key={tab.id} data-testid={`embed-tab-${tab.id}`}
            onClick={() => setEmbedTab(tab.id)}
            style={{
              flex: 1, padding: '10px 8px', border: 'none',
              background: embedTab === tab.id ? p.colors.accent : 'white',
              color: embedTab === tab.id ? 'white' : p.colors.muted,
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              transition: p.transitions.fast,
              WebkitTapHighlightColor: 'transparent',
            }}>
            {tab.label} {tab.rec && <span style={{ fontSize: '9px', opacity: 0.7 }}></span>}
          </button>
        ))}
      </div>

      <div data-testid="embed-code-block" style={{
        padding: '14px', borderRadius: p.radius.md,
        background: '#111827', border: 'none', marginBottom: '14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {embedTab === 'script' ? 'HTML — Script Embed' : embedTab === 'iframe' ? 'HTML — Iframe Embed' : 'HTML — Button Trigger'}
          </span>
          <CopyBtn text={embedCode} size="small" label="Copy Code" />
        </div>
        <pre data-testid="embed-code-text" style={{
          fontSize: '11px', color: '#E5E7EB', lineHeight: 1.6,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          fontFamily: 'monospace', margin: 0,
        }}>
          {embedCode}
        </pre>
      </div>

      <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Installation Guides
      </label>
      {INSTALL_GUIDES.map(g => (
        <button key={g.id} data-testid={`guide-${g.id}`}
          onClick={() => setShowInstall(showInstall === g.id ? null : g.id)}
          style={{
            width: '100%', textAlign: 'left',
            padding: '12px 14px', marginBottom: '6px',
            borderRadius: p.radius.sm, border: `1px solid ${p.colors.border}`,
            background: showInstall === g.id ? p.colors.surfaceRaised : 'white',
            cursor: 'pointer', transition: p.transitions.fast,
            WebkitTapHighlightColor: 'transparent',
          }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading }}>{g.title}</span>
            <ChevronDown style={{
              width: '14px', height: '14px', color: p.colors.muted,
              transform: showInstall === g.id ? 'rotate(180deg)' : 'rotate(0)',
              transition: p.transitions.fast,
            }} />
          </div>
          {showInstall === g.id && (
            <div onClick={e => e.stopPropagation()} style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${p.colors.borderLight}` }}>
              {g.steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                    background: p.colors.accentLighter, color: p.colors.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700,
                  }}>{i + 1}</span>
                  <p style={{ fontSize: '12px', color: p.colors.body, margin: 0, lineHeight: 1.5 }}>{s}</p>
                </div>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function CustomDomainTab({ customDomain, setCustomDomain, domainStatus, sslStatus, dnsChecking, onCheckDns, lastDnsCheck }: {
  customDomain: string;
  setCustomDomain: (d: string) => void;
  domainStatus: string;
  sslStatus: string;
  dnsChecking: boolean;
  onCheckDns: () => void;
  lastDnsCheck: number | null;
}) {
  const isActive = domainStatus === 'active';
  const isPending = domainStatus === 'pending_dns';
  const isDnsVerified = domainStatus === 'dns_verified' || domainStatus === 'ssl_provisioning';

  return (
    <div data-testid="tab-custom-domain">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px',
          background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Server style={{ width: '14px', height: '14px', color: '#D97706' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, margin: 0 }}>Custom Domain</p>
          <p style={{ fontSize: '11px', color: p.colors.muted, margin: 0 }}>Use your own domain name</p>
        </div>
        <span style={{
          fontSize: '10px', fontWeight: 700, color: '#D97706',
          background: '#FEF3C7', padding: '2px 8px', borderRadius: '6px',
        }}>PRO</span>
      </div>

      <div style={{
        padding: '16px', borderRadius: p.radius.md,
        background: '#FFFBEB', border: '1px solid #FDE68A30',
        marginTop: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <Lock style={{ width: '14px', height: '14px', color: '#D97706' }} />
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', margin: 0 }}>
            Available on Pro plan
          </p>
        </div>

        <p style={{ fontSize: '12px', color: '#78350F', margin: '0 0 12px', lineHeight: 1.5 }}>
          Connect your own domain like <strong>quote.yourbusiness.com</strong> for a fully branded experience. SSL is auto-provisioned.
        </p>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#78350F', display: 'block', marginBottom: '4px' }}>
            Your custom domain
          </label>
          <input
            data-testid="input-custom-domain"
            type="text"
            placeholder="quote.yourbusiness.com"
            value={customDomain}
            onChange={e => setCustomDomain(e.target.value)}
            disabled
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid #FDE68A', background: '#FEF3C740',
              fontSize: '13px', color: '#78350F', opacity: 0.6,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {!isActive && !isPending && !isDnsVerified && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px',
            background: 'white', border: '1px solid #FDE68A',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#78350F', margin: '0 0 6px' }}>How it works:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {['Enter your domain', 'Add a CNAME record pointing to estimate.ai', 'We auto-detect DNS and provision SSL', 'Your custom domain goes live'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{
                    width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                    background: '#FEF3C7', color: '#D97706',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 700,
                  }}>{i + 1}</span>
                  <p style={{ fontSize: '11px', color: '#78350F', margin: 0 }}>{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {isPending && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px',
            background: 'white', border: '1px solid #FDE68A',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#D97706', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2 style={{ width: '12px', height: '12px', animation: 'spin 1s linear infinite' }} />
              Waiting for DNS...
            </p>
            <div style={{
              padding: '8px 10px', borderRadius: '6px', background: '#F9FAFB',
              fontFamily: 'monospace', fontSize: '11px', marginBottom: '6px',
            }}>
              <p style={{ margin: '0 0 2px', color: p.colors.muted, fontSize: '10px' }}>Add this CNAME record:</p>
              <p style={{ margin: 0, color: p.colors.heading }}>
                {customDomain} → <strong>estimate.ai</strong>
              </p>
            </div>
            <p style={{ fontSize: '10px', color: p.colors.muted, margin: 0 }}>
              Auto-checking every 30 seconds{lastDnsCheck ? ` · Last checked ${Math.round((Date.now() - lastDnsCheck) / 1000)}s ago` : ''}
            </p>
          </div>
        )}

        {isDnsVerified && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px',
            background: '#ECFDF5', border: '1px solid #A7F3D030',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#059669', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 style={{ width: '12px', height: '12px' }} />
              DNS verified — SSL {sslStatus === 'provisioning' ? 'provisioning...' : 'pending'}
            </p>
          </div>
        )}

        {isActive && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px',
            background: '#ECFDF5', border: '1px solid #A7F3D030',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#059669', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 style={{ width: '12px', height: '12px' }} />
              Custom Domain Active
            </p>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#059669', fontFamily: 'monospace', margin: 0 }}>
              https://{customDomain}
            </p>
          </div>
        )}

        <button disabled style={{
          width: '100%', padding: '10px', borderRadius: p.radius.sm, border: 'none',
          background: '#E5E7EB', color: '#9CA3AF', cursor: 'not-allowed',
          fontSize: '13px', fontWeight: 600, marginTop: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        }}>
          <Lock style={{ width: '13px', height: '13px' }} />
          Upgrade to Pro
        </button>
      </div>
    </div>
  );
}

function DoneForYouTab() {
  return (
    <div data-testid="tab-done-for-you">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px',
          background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Wrench style={{ width: '14px', height: '14px', color: '#D97706' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, margin: 0 }}>Done-For-You Install</p>
          <p style={{ fontSize: '11px', color: p.colors.muted, margin: 0 }}>We install it on your website</p>
        </div>
        <span style={{
          fontSize: '10px', fontWeight: 700, color: '#D97706',
          background: '#FEF3C7', padding: '2px 8px', borderRadius: '6px',
        }}>PRO</span>
      </div>

      <div style={{
        padding: '16px', borderRadius: p.radius.md,
        background: '#FFFBEB', border: '1px solid #FDE68A30',
        marginTop: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <Lock style={{ width: '14px', height: '14px', color: '#D97706' }} />
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', margin: 0 }}>
            Available on Pro plan
          </p>
        </div>

        <p style={{ fontSize: '12px', color: '#78350F', margin: '0 0 14px', lineHeight: 1.5 }}>
          Our team will install your calculator directly on your website. Just grant temporary editor access and we handle the rest.
        </p>

        <div style={{
          padding: '12px', borderRadius: '8px',
          background: 'white', border: '1px solid #FDE68A',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#78350F', margin: '0 0 8px' }}>How it works:</p>
          {[
            'Submit your website URL and login details securely',
            'Our team installs the calculator on the page you choose',
            'We verify everything works and notify you',
            'Status updates: Installation Pending → Installed',
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                background: '#FEF3C7', color: '#D97706',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700,
              }}>{i + 1}</span>
              <p style={{ fontSize: '11px', color: '#78350F', margin: 0 }}>{s}</p>
            </div>
          ))}
        </div>

        <button disabled style={{
          width: '100%', padding: '10px', borderRadius: p.radius.sm, border: 'none',
          background: '#E5E7EB', color: '#9CA3AF', cursor: 'not-allowed',
          fontSize: '13px', fontWeight: 600, marginTop: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        }}>
          <Lock style={{ width: '13px', height: '13px' }} />
          Upgrade to Pro
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   AI Employee Section
──────────────────────────────────────────────────────────── */

const TONE_OPTIONS = [
  { id: 'professional', label: 'Professional' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'direct', label: 'Direct' },
  { id: 'premium', label: 'Premium' },
] as const;

const DAY_OPTIONS = [
  { id: 'Monday', label: 'M' },
  { id: 'Tuesday', label: 'T' },
  { id: 'Wednesday', label: 'W' },
  { id: 'Thursday', label: 'Th' },
  { id: 'Friday', label: 'F' },
  { id: 'Saturday', label: 'Sa' },
  { id: 'Sunday', label: 'Su' },
];

const SUGGESTED_SERVICES = [
  'Free estimates', 'Emergency service', 'Same-day availability',
  'Licensed & insured', 'Financing available', 'Senior discount',
];

function TradelineDemoModal({ tradeCategory, onClose }: { tradeCategory?: string; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: `Hi! I'm your AI assistant. I can help answer questions about services, pricing, and scheduling. What would you like to know?` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/demo-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, trade_category: tradeCategory }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: data.reply || 'I can help answer questions about this service.' }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, I had trouble connecting. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, tradeCategory]);

  return (
    <div data-testid="tradeline-demo-modal" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'white', borderRadius: '16px', width: '100%', maxWidth: '360px',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px', background: p.colors.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot style={{ width: '18px', height: '18px', color: 'white' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'white' }}>AI Employee Demo</p>
              <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.75)' }}>See it in action</p>
            </div>
          </div>
          <button data-testid="button-close-demo" onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'white', display: 'flex', padding: '4px',
          }}>
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: 'auto', padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          minHeight: '280px', maxHeight: '340px',
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '80%', padding: '10px 12px', borderRadius: '12px',
                background: msg.role === 'user' ? p.colors.accent : '#F3F4F6',
                color: msg.role === 'user' ? 'white' : p.colors.heading,
                fontSize: '13px', lineHeight: 1.5,
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '10px 14px', borderRadius: '12px', background: '#F3F4F6',
                display: 'flex', gap: '4px', alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: p.colors.muted,
                    animation: `bounce 1s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${p.colors.borderLight}`,
          display: 'flex', gap: '8px',
        }}>
          <input
            data-testid="input-demo-message"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask anything..."
            style={{
              flex: 1, padding: '8px 12px', borderRadius: '8px',
              border: `1px solid ${p.colors.border}`, fontSize: '13px',
              outline: 'none',
            }}
          />
          <button data-testid="button-send-demo" onClick={send} disabled={!input.trim() || loading} style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none',
            background: p.colors.accent, color: 'white',
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            opacity: input.trim() && !loading ? 1 : 0.5,
            display: 'flex', alignItems: 'center',
          }}>
            <Send style={{ width: '14px', height: '14px' }} />
          </button>
        </div>

        {/* Footer Note */}
        <div style={{
          padding: '10px 16px', background: '#F9FAFB',
          borderTop: `1px solid ${p.colors.borderLight}`,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '10px', color: p.colors.muted, margin: 0 }}>
            This is a demo using sample data. Enable AI Employee for your calculator to go live.
          </p>
        </div>
      </div>
    </div>
  );
}

function AIEmployeeSection({ aiEmployee, tradeCategory, onAiEmployeeChange }: {
  aiEmployee: AIEmployee;
  tradeCategory?: string;
  onAiEmployeeChange: (ae: AIEmployee) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [trainingExpanded, setTrainingExpanded] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [customService, setCustomService] = useState('');

  const enabled = aiEmployee.enabled;
  const subscriptionStatus = aiEmployee.subscription_status;
  const trialStartedAt = aiEmployee.trial_started_at;
  const profile = aiEmployee.training_profile;

  const daysRemaining = trialStartedAt
    ? Math.max(0, 14 - Math.floor((Date.now() - trialStartedAt) / 86400000))
    : 14;
  const trialExpired = subscriptionStatus === 'trial' && daysRemaining === 0;
  const isActive = subscriptionStatus === 'active';
  const isTrial = subscriptionStatus === 'trial';

  const handleToggle = useCallback(() => {
    if (!enabled) {
      onAiEmployeeChange({
        ...aiEmployee,
        enabled: true,
        subscription_status: 'trial',
        trial_started_at: aiEmployee.trial_started_at ?? Date.now(),
      });
      setTrainingExpanded(true);
    } else {
      onAiEmployeeChange({ ...aiEmployee, enabled: false });
    }
  }, [enabled, aiEmployee, onAiEmployeeChange]);

  const updateProfile = useCallback((patch: Partial<typeof profile>) => {
    onAiEmployeeChange({ ...aiEmployee, training_profile: { ...profile, ...patch } });
  }, [aiEmployee, profile, onAiEmployeeChange]);

  const toggleDay = (day: string) => {
    const days = profile.working_hours.days;
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    updateProfile({ working_hours: { ...profile.working_hours, days: next } });
  };

  const toggleService = (svc: string) => {
    const services = profile.services;
    const next = services.includes(svc) ? services.filter(s => s !== svc) : [...services, svc];
    updateProfile({ services: next });
  };

  const addCustomService = () => {
    const trimmed = customService.trim();
    if (!trimmed || profile.services.includes(trimmed)) return;
    updateProfile({ services: [...profile.services, trimmed] });
    setCustomService('');
  };

  return (
    <>
      {showDemo && <TradelineDemoModal tradeCategory={tradeCategory} onClose={() => setShowDemo(false)} />}

      <div data-testid="ai-employee-section" style={{
        borderRadius: p.radius.md, border: `1px solid ${p.colors.border}`,
        background: 'white', marginBottom: '16px', overflow: 'hidden',
      }}>
        {/* Section Header */}
        <button
          data-testid="button-toggle-ai-section"
          onClick={() => setCollapsed(c => !c)}
          style={{
            width: '100%', padding: '14px 16px', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bot style={{ width: '16px', height: '16px', color: 'white' }} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: p.colors.heading }}>AI Employee</p>
                <span style={{
                  fontSize: '9px', fontWeight: 700, color: '#7C3AED',
                  background: '#EDE9FE', padding: '2px 6px', borderRadius: '4px',
                }}>14-DAY FREE TRIAL</span>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: p.colors.muted }}>
                Chat assistant for your calculator
              </p>
            </div>
          </div>
          <ChevronDown style={{
            width: '16px', height: '16px', color: p.colors.muted,
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: p.transitions.fast, flexShrink: 0,
          }} />
        </button>

        {!collapsed && (
          <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${p.colors.borderLight}` }}>
            {/* Trial Status Badge */}
            {isTrial && !trialExpired && (
              <div data-testid="trial-status-badge" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px', borderRadius: p.radius.pill,
                background: '#EDE9FE', fontSize: '11px', fontWeight: 600,
                color: '#7C3AED', marginTop: '12px', marginBottom: '12px',
              }}>
                <Clock style={{ width: '11px', height: '11px' }} />
                Trial: {daysRemaining} days remaining
              </div>
            )}
            {trialExpired && (
              <div data-testid="trial-expired-banner" style={{
                padding: '10px 12px', borderRadius: p.radius.sm,
                background: '#FFFBEB', border: '1px solid #FDE68A',
                marginTop: '12px', marginBottom: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
              }}>
                <span style={{ fontSize: '12px', color: '#92400E', fontWeight: 500 }}>
                  Trial ended — upgrade to reactivate
                </span>
                <button disabled style={{
                  padding: '4px 10px', borderRadius: '6px', border: 'none',
                  background: '#D97706', color: 'white', fontSize: '11px',
                  fontWeight: 600, cursor: 'not-allowed', opacity: 0.7,
                }}>
                  Upgrade
                </button>
              </div>
            )}
            {isActive && (
              <div data-testid="active-status-badge" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px', borderRadius: p.radius.pill,
                background: '#ECFDF5', fontSize: '11px', fontWeight: 600,
                color: '#059669', marginTop: '12px', marginBottom: '12px',
              }}>
                <CheckCircle2 style={{ width: '11px', height: '11px' }} />
                Active
              </div>
            )}
            {!isTrial && !isActive && !trialExpired && (
              <div style={{ marginTop: '12px', marginBottom: '8px' }} />
            )}

            {/* Enable Toggle Row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: `1px solid ${p.colors.borderLight}`,
              marginBottom: '12px',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>
                  Enable AI Employee for this calculator
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: p.colors.muted }}>
                  Adds a chat bubble to your calculator page
                </p>
              </div>
              <button
                data-testid="toggle-ai-employee"
                onClick={handleToggle}
                style={{
                  width: '42px', height: '24px', borderRadius: '12px', border: 'none',
                  background: enabled ? '#6366F1' : '#D1D5DB',
                  cursor: 'pointer', position: 'relative', flexShrink: 0,
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute', top: '3px',
                  left: enabled ? '21px' : '3px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>

            {/* Try Demo Button */}
            <button data-testid="button-try-demo" onClick={() => setShowDemo(true)} style={{
              width: '100%', padding: '10px', borderRadius: p.radius.sm,
              border: `1px solid #C4B5FD`, background: '#F5F3FF',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#7C3AED',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              marginBottom: '12px', WebkitTapHighlightColor: 'transparent',
            }}>
              <MessageCircle style={{ width: '14px', height: '14px' }} />
              Try Demo — See AI in Action
            </button>

            {/* Training Form — visible when enabled */}
            {enabled && (
              <div data-testid="ai-training-section">
                <button
                  data-testid="button-toggle-training"
                  onClick={() => setTrainingExpanded(e => !e)}
                  style={{
                    width: '100%', padding: '10px 12px',
                    borderRadius: p.radius.sm, border: `1px solid ${p.colors.border}`,
                    background: p.colors.surfaceRaised, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: trainingExpanded ? '12px' : '0',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>
                    Configure Your AI Employee
                  </span>
                  <ChevronDown style={{
                    width: '14px', height: '14px', color: p.colors.muted,
                    transform: trainingExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: p.transitions.fast,
                  }} />
                </button>

                {trainingExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Business Summary */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, display: 'block', marginBottom: '4px' }}>
                        Business Summary
                      </label>
                      <textarea
                        data-testid="input-business-summary"
                        maxLength={200}
                        rows={3}
                        value={profile.business_summary}
                        onChange={e => updateProfile({ business_summary: e.target.value })}
                        placeholder="Briefly describe your business (e.g. Family-owned plumbing company serving Denver since 2008...)"
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: '8px',
                          border: `1px solid ${p.colors.border}`, fontSize: '12px',
                          resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
                          fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                      <p style={{ fontSize: '10px', color: p.colors.muted, margin: '2px 0 0', textAlign: 'right' }}>
                        {profile.business_summary.length}/200
                      </p>
                    </div>

                    {/* Services */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, display: 'block', marginBottom: '6px' }}>
                        Services / Features
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                        {SUGGESTED_SERVICES.map(svc => {
                          const active = profile.services.includes(svc);
                          return (
                            <button key={svc} data-testid={`chip-service-${svc.toLowerCase().replace(/\s+/g, '-')}`}
                              onClick={() => toggleService(svc)}
                              style={{
                                padding: '4px 10px', borderRadius: p.radius.pill,
                                border: `1px solid ${active ? '#6366F1' : p.colors.border}`,
                                background: active ? '#EDE9FE' : 'white',
                                color: active ? '#6366F1' : p.colors.body,
                                fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                                WebkitTapHighlightColor: 'transparent',
                              }}>
                              {svc}
                            </button>
                          );
                        })}
                        {profile.services.filter(s => !SUGGESTED_SERVICES.includes(s)).map(svc => (
                          <button key={svc} data-testid={`chip-service-custom-${svc.toLowerCase().replace(/\s+/g, '-')}`}
                            onClick={() => toggleService(svc)}
                            style={{
                              padding: '4px 10px', borderRadius: p.radius.pill,
                              border: '1px solid #6366F1', background: '#EDE9FE',
                              color: '#6366F1', fontSize: '11px', fontWeight: 500,
                              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                            }}>
                            {svc} ×
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          data-testid="input-custom-service"
                          type="text"
                          value={customService}
                          onChange={e => setCustomService(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addCustomService()}
                          placeholder="Add custom service..."
                          style={{
                            flex: 1, padding: '6px 10px', borderRadius: '8px',
                            border: `1px solid ${p.colors.border}`, fontSize: '12px', outline: 'none',
                          }}
                        />
                        <button data-testid="button-add-service" onClick={addCustomService} style={{
                          padding: '6px 12px', borderRadius: '8px', border: 'none',
                          background: p.colors.accent, color: 'white', fontSize: '12px',
                          fontWeight: 600, cursor: 'pointer',
                        }}>
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Service Area */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, display: 'block', marginBottom: '4px' }}>
                        Service Area
                      </label>
                      <input
                        data-testid="input-service-area"
                        type="text"
                        maxLength={60}
                        value={profile.service_area}
                        onChange={e => updateProfile({ service_area: e.target.value })}
                        placeholder="e.g. Denver metro, 30-mile radius..."
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: '8px',
                          border: `1px solid ${p.colors.border}`, fontSize: '12px',
                          boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                    </div>

                    {/* Working Days */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, display: 'block', marginBottom: '6px' }}>
                        Working Days
                      </label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {DAY_OPTIONS.map(day => {
                          const active = profile.working_hours.days.includes(day.id);
                          return (
                            <button key={day.id} data-testid={`checkbox-day-${day.id.toLowerCase()}`}
                              onClick={() => toggleDay(day.id)}
                              style={{
                                flex: 1, padding: '6px 2px', borderRadius: '6px',
                                border: `1px solid ${active ? '#6366F1' : p.colors.border}`,
                                background: active ? '#EDE9FE' : 'white',
                                color: active ? '#6366F1' : p.colors.muted,
                                fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                WebkitTapHighlightColor: 'transparent',
                              }}>
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Working Hours */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, display: 'block', marginBottom: '6px' }}>
                        Working Hours
                      </label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          data-testid="input-start-time"
                          type="time"
                          value={profile.working_hours.start_time}
                          onChange={e => updateProfile({ working_hours: { ...profile.working_hours, start_time: e.target.value } })}
                          style={{
                            flex: 1, padding: '7px 10px', borderRadius: '8px',
                            border: `1px solid ${p.colors.border}`, fontSize: '12px', outline: 'none',
                          }}
                        />
                        <span style={{ fontSize: '12px', color: p.colors.muted }}>to</span>
                        <input
                          data-testid="input-end-time"
                          type="time"
                          value={profile.working_hours.end_time}
                          onChange={e => updateProfile({ working_hours: { ...profile.working_hours, end_time: e.target.value } })}
                          style={{
                            flex: 1, padding: '7px 10px', borderRadius: '8px',
                            border: `1px solid ${p.colors.border}`, fontSize: '12px', outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* Emergency Service Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>Emergency Service</p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: p.colors.muted }}>Available 24/7 for emergencies</p>
                      </div>
                      <button
                        data-testid="toggle-emergency-service"
                        onClick={() => updateProfile({ emergency_service: !profile.emergency_service })}
                        style={{
                          width: '42px', height: '24px', borderRadius: '12px', border: 'none',
                          background: profile.emergency_service ? '#6366F1' : '#D1D5DB',
                          cursor: 'pointer', position: 'relative', flexShrink: 0,
                          transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: '3px',
                          left: profile.emergency_service ? '21px' : '3px',
                          width: '18px', height: '18px', borderRadius: '50%',
                          background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>

                    {/* Escalation Contacts */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, display: 'block', marginBottom: '4px' }}>
                          Escalation Phone (optional)
                        </label>
                        <input
                          data-testid="input-escalation-phone"
                          type="tel"
                          value={profile.escalation_phone ?? ''}
                          onChange={e => updateProfile({ escalation_phone: e.target.value || null })}
                          placeholder="(555) 123-4567"
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: '8px',
                            border: `1px solid ${p.colors.border}`, fontSize: '12px',
                            boxSizing: 'border-box', outline: 'none',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, display: 'block', marginBottom: '4px' }}>
                          Escalation Email (optional)
                        </label>
                        <input
                          data-testid="input-escalation-email"
                          type="email"
                          value={profile.escalation_email ?? ''}
                          onChange={e => updateProfile({ escalation_email: e.target.value || null })}
                          placeholder="support@yourbusiness.com"
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: '8px',
                            border: `1px solid ${p.colors.border}`, fontSize: '12px',
                            boxSizing: 'border-box', outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* Tone Selector */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: p.colors.heading, display: 'block', marginBottom: '6px' }}>
                        Assistant Tone
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {TONE_OPTIONS.map(tone => {
                          const active = profile.tone === tone.id;
                          return (
                            <button key={tone.id} data-testid={`tone-option-${tone.id}`}
                              onClick={() => updateProfile({ tone: tone.id })}
                              style={{
                                padding: '8px 10px', borderRadius: '8px',
                                border: `1px solid ${active ? '#6366F1' : p.colors.border}`,
                                background: active ? '#EDE9FE' : 'white',
                                color: active ? '#6366F1' : p.colors.body,
                                fontSize: '12px', fontWeight: active ? 600 : 500,
                                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                              }}>
                              {tone.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function LinkRowCompact({ label, url, icon }: { label: string; url: string; icon?: any }) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: p.colors.muted, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {icon} {label}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: p.colors.surfaceRaised, borderRadius: '10px',
        padding: '8px 10px', border: `1px solid ${p.colors.border}`,
      }}>
        <span data-testid={`text-url-${label.toLowerCase().replace(/[^a-z]/g, '-')}`} style={{
          fontSize: '11px', color: p.colors.body, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace',
        }}>{url}</span>
        <CopyBtn text={url} size="normal" label="Copy" />
      </div>
    </div>
  );
}

function HealthRow({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div data-testid={`health-${label.toLowerCase().replace(/\s+/g, '-')}`} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: p.colors.muted }}>{icon}</span>
        <span style={{ fontSize: '13px', color: p.colors.body }}>{label}</span>
      </div>
      <span style={{ fontSize: '12px', fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

const INSTALL_GUIDES = [
  {
    id: 'wordpress',
    title: 'How to install on WordPress',
    steps: [
      'Go to your WordPress page editor and add a "Custom HTML" block where you want the calculator.',
      'Paste the embed code (Script or Iframe) into the HTML block.',
      'Click "Update" or "Publish" to save your page. Your calculator is live!',
    ],
  },
  {
    id: 'shopify',
    title: 'How to install on Shopify',
    steps: [
      'In your Shopify admin, go to Online Store → Pages → select the page to edit.',
      'Click the HTML editor (<>) button and paste the embed code where you want the calculator.',
      'Click "Save" — your quote calculator will now appear on that page.',
    ],
  },
  {
    id: 'html',
    title: 'How to install on custom HTML',
    steps: [
      'Open your HTML file in a code editor.',
      'Paste the embed code inside the <body> tag wherever you want the calculator.',
      'Save and upload the file to your server. Done!',
    ],
  },
];
