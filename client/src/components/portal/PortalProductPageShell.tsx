/**
 * <PortalProductPageShell> — unified shell for customer-facing per-product
 * portal pages (PortalRankFlow, PortalSocialSync, PortalMapguard, etc.).
 *
 * Mirrors <AdminProductPageShell> from the ops side but adapted for the
 * customer context:
 *   • NO active/hidden toggles (customer can't disable their own product).
 *   • Plan-tier pill (Free / Pro / Business / Enterprise) in header.
 *   • Optional "Upgrade plan" CTA for Free-tier customers.
 *   • KPI strip — 1-4 metrics relevant to the product (caller-defined).
 *   • Optional filtersBar + setupBanner slots.
 *   • Tabs (sticky horizontal scroll on mobile).
 *   • Optional "Open in admin" deep-link gated by an admin role check
 *     handled at the caller level (the prop is just rendered if present).
 *
 * Visual standard (DESIGN-SYSTEM.md):
 *   • Rule 4 — plan-tier pills + selected-tab state = outline + tinted bg,
 *     NEVER bright fill.
 *   • Rule 5 — KPI help cues anchored top-left via <HelpCueRow>.
 *
 * Caller is responsible for fetching stats + plan tier and passing them
 * in. The shell is content-agnostic; per-tab body lives in tabs[i].render().
 */
import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight, ExternalLink, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Stack, Cluster, HelpCueRow } from '@/components/primitives';
import AnimatedNumber from '@/components/AnimatedNumber';

export type PortalPlanTier = 'free' | 'pro' | 'business' | 'enterprise' | null;

export interface ProductPortalStatSlot {
  label: string;
  value: number | string;
  /** Optional non-animated suffix appended after the value (e.g. " min", "%"). */
  suffix?: string;
  /** Optional tooltip / aria-label for the help cue. */
  hint?: string;
}

export interface ProductPortalStats {
  primary: ProductPortalStatSlot;
  secondary?: ProductPortalStatSlot;
  tertiary?: ProductPortalStatSlot;
  quaternary?: ProductPortalStatSlot;
}

export interface PortalShellTab {
  id: string;
  label: string;
  render: () => React.ReactNode;
}

export interface PortalProductPageShellProps {
  productId: string;
  productName: string;
  planTier: PortalPlanTier;
  /** If set, renders the "Upgrade" CTA next to the plan pill. */
  upgradeCtaHref?: string;
  /** Pass `null` to render skeleton KPI cards while loading. */
  stats: ProductPortalStats | null;
  filtersBar?: React.ReactNode;
  /** Optional banner above the KPI strip (e.g. "Setup incomplete — finish in 2 mins"). */
  setupBanner?: React.ReactNode;
  tabs: PortalShellTab[];
  defaultTabId?: string;
  /** Optional "Open in admin" deep-link. Caller gates this on admin role. */
  adminLinkHref?: string;
}

function PlanTierPill({ tier }: { tier: PortalPlanTier }) {
  if (!tier) return null;
  // Rule 4 — outline + tinted bg, not bright fill.
  const map: Record<Exclude<PortalPlanTier, null>, string> = {
    free: 'border-slate-300/60 bg-slate-50/60 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700/50',
    pro: 'border-indigo-300/60 bg-indigo-50/60 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-700/50',
    business: 'border-emerald-300/60 bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/50',
    enterprise: 'border-amber-300/60 bg-amber-50/60 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50',
  };
  return (
    <span
      data-portal-shell-pill={tier}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${map[tier]}`}
    >
      {tier} plan
    </span>
  );
}

interface KpiCardProps {
  label: string;
  hint?: string;
  value: number | string;
  suffix?: string;
  testid?: string;
}

function KpiCard({ label, hint, value, suffix, testid }: KpiCardProps) {
  // Rule 5 — help cue anchored top-left via <HelpCueRow>.
  const isNumeric = typeof value === 'number';
  return (
    <Card className="p-4" data-testid={testid}>
      <HelpCueRow
        variant="label"
        cue={<Info size={12} className="text-muted-foreground" aria-label={hint ?? label} />}
        title={label}
      />
      <p
        className="text-2xl font-bold font-mono tabular-nums text-foreground"
        data-portal-shell-kpi-value
      >
        {isNumeric ? <AnimatedNumber value={value as number} duration={800} /> : value}
        {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
    </Card>
  );
}

function KpiSkeleton({ label }: { label: string }) {
  return (
    <Card className="p-4">
      <HelpCueRow
        variant="label"
        cue={<Info size={12} className="text-muted-foreground" />}
        title={label}
      />
      <div
        className="h-8 w-20 animate-pulse rounded-md bg-muted"
        data-portal-shell-kpi-skeleton
        aria-hidden="true"
      />
    </Card>
  );
}

export function PortalProductPageShell({
  productId,
  productName,
  planTier,
  upgradeCtaHref,
  stats,
  filtersBar,
  setupBanner,
  tabs,
  defaultTabId,
  adminLinkHref,
}: PortalProductPageShellProps) {
  const initialTab = defaultTabId && tabs.find((t) => t.id === defaultTabId)
    ? defaultTabId
    : tabs[0]?.id;
  const [activeTabId, setActiveTabId] = useState<string | undefined>(initialTab);
  const currentTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const slots = stats
    ? [stats.primary, stats.secondary, stats.tertiary, stats.quaternary].filter(
        (s): s is ProductPortalStatSlot => s != null,
      )
    : [];

  return (
    <Stack
      gap="card"
      as="section"
      data-portal-product-shell
      data-product-id={productId}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div data-portal-shell-section="header">
        <Cluster gap="loose" align="center" className="justify-between">
          <div className="min-w-0">
            <Cluster gap="normal" align="center">
              <h1 className="text-2xl font-bold text-foreground truncate">{productName}</h1>
              <PlanTierPill tier={planTier} />
            </Cluster>
            <p className="text-sm text-muted-foreground mt-1">Your live data + controls for this service.</p>
          </div>
          <Cluster gap="normal" align="center">
            {planTier === 'free' && upgradeCtaHref && (
              <Link
                href={upgradeCtaHref}
                className="btn-primary-premium inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg"
                data-testid="portal-shell-upgrade-cta"
              >
                <ArrowUpRight size={14} />
                Upgrade plan
              </Link>
            )}
            {adminLinkHref && (
              <Link
                href={adminLinkHref}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                data-testid="portal-shell-admin-link"
              >
                <ExternalLink size={14} />
                Open in admin
              </Link>
            )}
          </Cluster>
        </Cluster>
      </div>

      {/* ── Optional setup banner ──────────────────────────────────── */}
      {setupBanner && (
        <div data-portal-shell-section="setup-banner" data-testid="portal-shell-setup-banner">
          {setupBanner}
        </div>
      )}

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      {(stats === null || slots.length > 0) && (
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-fr"
          data-portal-shell-section="kpis"
          data-testid="portal-shell-kpis"
        >
          {stats === null ? (
            <>
              <KpiSkeleton label="Loading" />
              <KpiSkeleton label="Loading" />
              <KpiSkeleton label="Loading" />
              <KpiSkeleton label="Loading" />
            </>
          ) : (
            slots.map((slot, idx) => (
              <KpiCard
                key={`${slot.label}-${idx}`}
                label={slot.label}
                hint={slot.hint}
                value={slot.value}
                suffix={slot.suffix}
                testid={`portal-shell-kpi-${idx}`}
              />
            ))
          )}
        </div>
      )}

      {/* ── Filters bar (optional) ─────────────────────────────────── */}
      {filtersBar && (
        <div data-portal-shell-section="filters" data-testid="portal-shell-filters">
          {filtersBar}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label={`${productName} sections`}
          data-portal-shell-section="tabs"
          data-testid="portal-shell-tabs"
          className="border-b border-border sticky top-0 z-10 bg-background overflow-x-auto"
        >
          <Cluster gap="normal" align="center">
            {tabs.map((tab) => {
              const selected = tab.id === currentTab?.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  data-portal-shell-tab={selected ? 'selected' : 'default'}
                  data-testid={`portal-shell-tab-${tab.id}`}
                  onClick={() => setActiveTabId(tab.id)}
                  className={
                    selected
                      // Rule 4 — outline + tinted bg, not bright fill.
                      ? 'inline-flex items-center px-3 py-1.5 -mb-px rounded-t border border-b-transparent border-primary/40 bg-primary/5 text-foreground text-sm font-medium whitespace-nowrap'
                      : 'inline-flex items-center px-3 py-1.5 -mb-px rounded-t border border-transparent text-sm font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap'
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </Cluster>
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div data-portal-shell-section="body" data-testid="portal-shell-body">
        {currentTab?.render()}
      </div>
    </Stack>
  );
}

export default PortalProductPageShell;
