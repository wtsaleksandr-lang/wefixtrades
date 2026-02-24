import { useState, useEffect, useCallback, useRef } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import {
  Check, Copy, ExternalLink, Code2, ChevronDown, Eye, RotateCcw,
  AlertCircle, Shield, Mail, Phone, Bot, Sparkles, Globe,
  CheckCircle2, XCircle, Clock, Zap, RefreshCw, Link2,
} from 'lucide-react';

const p = platformTheme;

interface PublishData {
  version: number;
  status: 'draft' | 'published';
  slug: string;
  published_at: number | null;
  embed_id: string;
  last_modified: number | null;
}

interface PublishStepProps {
  result: any;
  publishData: PublishData;
  testPassed: boolean;
  leadFormValid: boolean;
  pricingExists: boolean;
  businessName: string;
  onPublishDataChange: (pd: PublishData) => void;
  onStartOver: () => void;
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'my-calculator';
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

export default function PublishStep({ result, publishData, testPassed, leadFormValid, pricingExists, businessName, onPublishDataChange, onStartOver }: PublishStepProps) {
  const origin = window.location.origin;
  const calcUrl = result ? `${origin}${result.calculator_url}` : '';
  const slug = result?.slug || publishData.slug || slugify(businessName);

  const [embedTab, setEmbedTab] = useState<'script' | 'iframe' | 'button'>('script');
  const [showInstall, setShowInstall] = useState<string | null>(null);

  const canPublish = testPassed && leadFormValid && pricingExists;
  const isPublished = publishData.status === 'published';
  const hasChanges = !!(publishData.last_modified && publishData.published_at && publishData.last_modified > publishData.published_at);

  const statusLabel = isPublished ? (hasChanges ? 'Changes Not Published' : 'Published') : (canPublish ? 'Ready' : 'Draft');
  const statusColor = isPublished ? (hasChanges ? p.colors.warning : p.colors.success) : (canPublish ? p.colors.success : p.colors.muted);
  const statusBg = isPublished ? (hasChanges ? p.colors.warningLight : p.colors.successLight) : (canPublish ? p.colors.successLight : '#F3F4F6');

  const handlePublish = useCallback(() => {
    if (!canPublish || !result) return;
    onPublishDataChange({
      ...publishData,
      status: 'published',
      slug: result.slug || slug,
      published_at: Date.now(),
      embed_id: result.slug || slug,
      last_modified: null,
    });
  }, [canPublish, result, publishData, slug, onPublishDataChange]);

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
          {/* B) Hosted Page Section */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ ...p.typography.captionSm, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Globe style={{ width: '12px', height: '12px' }} /> Your Hosted Quote Page
            </label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: p.colors.surfaceRaised, borderRadius: '10px',
              padding: '10px 12px', border: `1px solid ${p.colors.border}`,
            }}>
              <Link2 style={{ width: '14px', height: '14px', color: p.colors.accent, flexShrink: 0 }} />
              <span data-testid="text-hosted-url" style={{
                fontSize: '12px', color: p.colors.body, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace',
              }}>{calcUrl}</span>
              <CopyBtn text={calcUrl} size="normal" label="Copy Link" />
              <button data-testid="action-open-tab" onClick={() => window.open(calcUrl, '_blank')} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '8px 12px', borderRadius: '8px', border: 'none',
                background: p.colors.accent, color: 'white',
                cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                minHeight: '36px', flexShrink: 0,
                WebkitTapHighlightColor: 'transparent',
              }}>
                <ExternalLink style={{ width: '12px', height: '12px' }} /> Open
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            <LinkRowCompact label="Edit Link (7 days)" url={`${origin}${result.edit_url}`}
              icon={<Sparkles style={{ width: '13px', height: '13px' }} />} />
            <LinkRowCompact label="Leads Dashboard" url={`${origin}${result.leads_url}`}
              icon={<Zap style={{ width: '13px', height: '13px' }} />} />
          </div>

          {/* C) Embed Options */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ ...p.typography.captionSm, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Code2 style={{ width: '12px', height: '12px' }} /> Embed on Your Website
            </label>

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
              background: '#111827', border: 'none',
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
          </div>

          {/* D) Installation Guide */}
          <div style={{ marginBottom: '20px' }}>
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

          {/* E) Status + Health Indicators */}
          <div data-testid="health-indicators" style={{
            padding: '14px 16px', borderRadius: p.radius.md,
            background: p.colors.surfaceRaised, border: `1px solid ${p.colors.borderLight}`,
            marginBottom: '20px',
          }}>
            <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Status & Health
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <HealthRow icon={<Sparkles style={{ width: '13px', height: '13px' }} />} label="Pricing Status" value="Validated" color={p.colors.success} />
              <HealthRow icon={<Mail style={{ width: '13px', height: '13px' }} />} label="Lead Capture" value={leadFormValid ? 'Active' : 'Inactive'} color={leadFormValid ? p.colors.success : p.colors.danger} />
              <HealthRow icon={<Bot style={{ width: '13px', height: '13px' }} />} label="Anti-Spam" value="Enabled" color={p.colors.success} />
              <HealthRow icon={<Shield style={{ width: '13px', height: '13px' }} />} label="Version" value="v1" color={p.colors.muted} />
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
              <button data-testid="button-republish" style={{
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
