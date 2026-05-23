/**
 * Quote Snapshot public viewer — Wave R3.
 *
 * Route: /q/:slug
 *
 * Renders a saved quote (the customer's previously-completed widget run)
 * read-only by default. If the device's localStorage contains a matching
 * `owner_edit_token_<slug>`, the contractor sees an editable panel that
 * lets them tweak the line items and PATCH the snapshot.
 *
 * Branding (logo, accent, business name) is pulled from the calculator
 * that produced the snapshot, so it looks like the contractor's own site.
 *
 * The contractor's owner_edit_token NEVER reaches this page from the API
 * — it lives only in the creating-device's localStorage. That keeps the
 * URL itself safe to share verbatim.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { Loader2, SearchX, Pencil, Check, X } from 'lucide-react';
import WeFixTradesBadge from '@/components/hosted-page/WeFixTradesBadge';
import { eff, primaryButtonStyle } from '@/components/quote-widget/designTokens';
import { OWNER_EDIT_TOKEN_KEY_PREFIX } from '@shared/quoteSnapshot';
import type { EstimateResult } from '@shared/calculateEstimate';

/* ─── Types ─── */

interface PublicSnapshot {
  snapshot_slug: string;
  calculator_id: number;
  lead_id: number | null;
  inputs: Record<string, unknown>;
  computed: EstimateResult & { headline?: string };
  customer_name: string | null;
  customer_email: string | null;
  view_count: number;
  created_at: string | null;
  last_viewed_at: string | null;
  last_edited_at: string | null;
  expires_at: string | null;
}

interface PublicCalculator {
  id: number;
  slug: string | null;
  business_name: string;
  trade_type: string;
  tagline: string | null;
  logo_url: string | null;
  primary_color: string | null;
  appearance: { accent_color?: string; show_powered_by?: boolean } | null;
}

interface SnapshotResponse {
  snapshot: PublicSnapshot;
  calculator: PublicCalculator;
}

/* ─── Helpers ─── */

function getOwnerEditToken(slug: string): string | null {
  try {
    return localStorage.getItem(OWNER_EDIT_TOKEN_KEY_PREFIX + slug);
  } catch {
    return null;
  }
}

function clearOwnerEditToken(slug: string): void {
  try {
    localStorage.removeItem(OWNER_EDIT_TOKEN_KEY_PREFIX + slug);
  } catch { /* ignore */ }
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

/* ─── Component ─── */

export default function QuoteSnapshotPage() {
  const [, params] = useRoute('/q/:slug');
  const slug = params?.slug || '';

  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftBreakdown, setDraftBreakdown] = useState<Array<{ label: string; amount: number }>>([]);

  // Look for the owner token once on mount. We re-read on each "edit"
  // click too, in case a contractor opens the link from a different tab
  // and pastes a token in.
  const ownerToken = useMemo(() => getOwnerEditToken(slug), [slug]);
  const canEdit = !!ownerToken && !!data?.snapshot;

  // Fetch the snapshot
  useEffect(() => {
    if (!slug) {
      setError('No quote ID');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/q/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('expired');
        }
        return res.json();
      })
      .then((json: SnapshotResponse) => {
        if (cancelled) return;
        setData(json);
        const initial = (json.snapshot.computed?.breakdown ?? []).map((b) => ({ ...b }));
        setDraftBreakdown(initial);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('This quote link has expired or was revoked');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  const computed = data?.snapshot.computed;
  const calculator = data?.calculator;
  const accent = calculator?.appearance?.accent_color || calculator?.primary_color || eff.accent;
  // Wave P-H — the snapshot footer brand badge follows the calculator's
  // own show_powered_by setting. Free tier shows the badge; Pro hides.
  const showBrandFooter = calculator?.appearance?.show_powered_by !== false;

  const totalDraft = draftBreakdown.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  /* ─── Edit save handler ─── */
  async function handleSave() {
    if (!data || !ownerToken) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextBreakdown = draftBreakdown.map((b) => ({
        label: b.label,
        amount: Number(b.amount) || 0,
      }));
      const nextComputed = {
        ...data.snapshot.computed,
        breakdown: nextBreakdown,
        total: nextBreakdown.reduce((s, b) => s + b.amount, 0),
      };
      const res = await fetch(`/api/q/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_edit_token: ownerToken, computed: nextComputed }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          // Token mismatch — strip it from localStorage so we don't
          // dangle an editor UI for a contractor on the wrong device.
          clearOwnerEditToken(slug);
        }
        const json = await res.json().catch(() => ({ error: 'Failed to save' }));
        throw new Error(json.error || 'Failed to save');
      }
      const json = await res.json();
      setData({ ...data, snapshot: { ...data.snapshot, ...json.snapshot } });
      setEditing(false);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  /* ─── Loading / Error states ─── */
  if (loading) {
    return (
      <div style={pageBgStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: eff.textMuted }} />
        </div>
      </div>
    );
  }

  if (error || !data || !computed || !calculator) {
    return (
      <div style={pageBgStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <SearchX style={{ width: 40, height: 40, color: eff.textMuted, margin: '0 auto 12px' }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: eff.text, margin: '0 0 6px' }}>
              Quote not found
            </p>
            <p style={{ fontSize: 14, color: eff.textBody, margin: 0, lineHeight: 1.5 }}>
              {error || 'This quote link has expired or was revoked.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-theme="light" style={pageBgStyle} data-testid="quote-snapshot-page">
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 20px', fontFamily: eff.font, color: eff.text }}>
        {/* Header — calculator branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          {calculator.logo_url && (
            <img
              src={calculator.logo_url}
              alt={calculator.business_name}
              style={{ height: 44, width: 44, borderRadius: eff.radiusMd, objectFit: 'contain', background: '#fff' }}
            />
          )}
          <div>
            <p style={{ fontSize: 17, fontWeight: 700, color: eff.text, lineHeight: 1.25, margin: 0 }}>
              {calculator.business_name}
            </p>
            {calculator.tagline && (
              <p style={{ fontSize: 13, color: eff.textBody, lineHeight: 1.4, margin: '2px 0 0' }}>
                {calculator.tagline}
              </p>
            )}
          </div>
        </div>

        {/* Quote card */}
        <div style={{
          background: '#fff',
          borderRadius: eff.radius2xl,
          border: `1px solid ${eff.buttonBorder}`,
          boxShadow: eff.shadowCard,
          padding: '28px 24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
            <div>
              <p style={{
                fontSize: 12, fontWeight: 600, color: eff.textBody,
                textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px',
              }}>
                Your Estimate
              </p>
              <p style={{
                fontSize: 'clamp(28px, 8vw, 38px)', fontWeight: 800, color: eff.text,
                margin: 0, fontFamily: eff.fontMono, lineHeight: 1, letterSpacing: '-0.02em',
              }}>
                {computed.type === 'range' && computed.rangeMin != null && computed.rangeMax != null
                  ? `${formatMoney(computed.rangeMin)} – ${formatMoney(computed.rangeMax)}`
                  : formatMoney(editing ? totalDraft : computed.total)}
              </p>
              {data.snapshot.created_at && (
                <p style={{ fontSize: 12, color: eff.textMuted, margin: '8px 0 0' }}>
                  Saved {formatDate(data.snapshot.created_at)}
                  {data.snapshot.last_edited_at && (
                    <> · Updated {formatDate(data.snapshot.last_edited_at)}</>
                  )}
                </p>
              )}
            </div>
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                data-testid="snapshot-edit-button"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 13, fontWeight: 600, color: accent,
                  background: `${accent}14`,
                  border: `1px solid ${accent}33`,
                  borderRadius: eff.radiusMd,
                  padding: '8px 12px',
                  cursor: 'pointer', fontFamily: eff.font,
                }}
              >
                <Pencil style={{ width: 14, height: 14 }} />
                Edit values
              </button>
            )}
          </div>

          {/* Breakdown — view or edit mode */}
          {(computed.breakdown?.length ?? 0) > 0 && (
            <div style={{
              borderTop: `1px solid ${eff.buttonBorder}`,
              paddingTop: 14,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {(editing ? draftBreakdown : computed.breakdown).map((line, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, color: eff.textBody, flex: '1 1 auto' }}>{line.label}</span>
                  {editing ? (
                    <div className="float-field" style={{ width: 140 }}>
                      <input
                        id={`snapshot-line-${i}`}
                        type="number"
                        step="0.01"
                        className="premium-input"
                        placeholder=" "
                        value={line.amount}
                        onChange={(e) => {
                          const next = draftBreakdown.slice();
                          next[i] = { ...next[i], amount: parseFloat(e.target.value) || 0 };
                          setDraftBreakdown(next);
                        }}
                        data-testid={`snapshot-line-input-${i}`}
                      />
                      <label htmlFor={`snapshot-line-${i}`}>Amount ($)</label>
                    </div>
                  ) : (
                    <span style={{ fontWeight: 600, color: eff.text, fontFamily: eff.fontMono, fontSize: 14 }}>
                      {formatMoney(line.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {editing && (
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                data-testid="snapshot-save-button"
                style={{
                  ...primaryButtonStyle,
                  background: accent,
                  opacity: saving ? 0.6 : 1,
                  gap: 8,
                }}
              >
                <Check style={{ width: 14, height: 14 }} />
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                  setDraftBreakdown(computed.breakdown?.map((b) => ({ ...b })) ?? []);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 14, fontWeight: 600, color: eff.textBody,
                  background: 'transparent', border: `1px solid ${eff.buttonBorder}`,
                  borderRadius: eff.radiusMd, padding: '10px 16px', cursor: 'pointer',
                  fontFamily: eff.font,
                }}
              >
                <X style={{ width: 14, height: 14 }} />
                Cancel
              </button>
              {saveError && (
                <p style={{ width: '100%', fontSize: 13, color: eff.error, margin: '6px 0 0' }}>
                  {saveError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Read-only notice for the customer */}
        {!canEdit && (
          <p style={{ fontSize: 13, color: eff.textBody, textAlign: 'center', margin: '18px 0 0', lineHeight: 1.5 }}>
            This is your saved quote. The contractor can update values; refresh to see changes.
          </p>
        )}

        {/* Brand footer */}
        {showBrandFooter && (
          <div style={{
            display: 'flex', justifyContent: 'center',
            marginTop: 32, paddingTop: 20,
            borderTop: `1px solid ${eff.buttonBorder}`,
          }}>
            <WeFixTradesBadge
              variant="footer"
              context="hosted"
              slug={calculator.slug ?? null}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const pageBgStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: eff.bg,
  fontFamily: eff.font,
};
