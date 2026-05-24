/**
 * <AdminProductPageShell> — unified shell for per-product admin ops pages.
 *
 * Wraps any of the 9 per-product ops dashboards (QuoteQuick, MapGuard,
 * TradeLine, RankFlow, WebCare, AdFlow, SocialSync, ContentFlow, Reviews)
 * with the same header / KPI strip / filters / tabs layout. The body of
 * each page lives in the `tabs` prop's render() callbacks — the shell
 * itself is content-agnostic.
 *
 * Visual standard (DESIGN-SYSTEM.md):
 *   • Rule 4 — status pills + selected-tab state = subtle outline +
 *     tinted bg, NEVER bright fill.
 *   • Rule 5 — help cues anchored top-left of each section, single cue
 *     pattern per surface (uses <HelpCueRow> from primitives).
 *
 * Two-axis visibility:
 *   isActive   — blocks new checkout when false (legacy SKU)
 *   hidden     — removed from public catalog when true; existing subs +
 *                deep links still work
 * The shell renders both toggles + status pills. Optimistic UI is the
 * caller's responsibility (pass an onToggleActive / onToggleHidden that
 * does the optimistic update via react-query).
 */
import React, { useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { Link } from 'wouter';
import { ExternalLink, Eye, EyeOff, Home, Info, Pencil, Settings, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Stack, Cluster, HelpCueRow } from '@/components/primitives';
import AnimatedNumber from '@/components/AnimatedNumber';

/**
 * Map of productId → { home (admin homepage), pricing (public marketing) }.
 * Centralised here so every sub-page resolves links from the same source.
 * Add new products as their admin shells come online.
 */
const PRODUCT_LINKS: Record<string, { home: string; pricing: string | null }> = {
  tradeline: { home: '/admin/crm/tradeline-ops', pricing: '/products/tradeline' },
  quotequick: { home: '/admin/crm/quotequick', pricing: '/products/quickquotepro' },
};

export interface ProductSettingsMenuProps {
  /** Canonical product id, e.g. "tradeline" or "quotequick". */
  productId: string;
  /** Human label shown in the menu header, e.g. "TradeLine". */
  productName: string;
  /** Optional override for the catalog editor link. Defaults to `/admin/products/:id`. */
  editHref?: string;
  /** Optional override for the product admin homepage link. */
  homeHref?: string;
  /** Optional override for the public pricing page link. Pass `null` to hide that item. */
  pricingHref?: string | null;
  /** Compact label-less trigger (icon only). Defaults to false. */
  iconOnly?: boolean;
}

/**
 * <ProductSettingsMenu> — top-right Settings dropdown shared by the product
 * homepage shell AND every product sub-page (voices, templates, setups,
 * learning, trades, etc.). One affordance, one menu, every surface.
 *
 * Brand tokens only — no hex, no bright fills (Rule 4).
 */
export function ProductSettingsMenu({
  productId,
  productName,
  editHref,
  homeHref,
  pricingHref,
  iconOnly = false,
}: ProductSettingsMenuProps) {
  const defaults = PRODUCT_LINKS[productId] ?? { home: undefined, pricing: null };
  const resolvedEdit = editHref ?? `/admin/products/${productId}`;
  const resolvedHome = homeHref ?? defaults.home;
  const resolvedPricing = pricingHref === undefined ? defaults.pricing : pricingHref;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          iconOnly
            ? 'inline-flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
            : 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
        }
        aria-label={`${productName} settings`}
        title={`${productName} settings`}
        data-testid="product-settings-trigger"
        data-product-id={productId}
      >
        <Settings size={iconOnly ? 16 : 14} />
        {!iconOnly && <span>Settings</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" data-testid="product-settings-menu">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {productName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href={resolvedEdit}
            className="flex items-center gap-2 cursor-pointer"
            data-testid="product-settings-edit"
          >
            <Pencil size={14} className="text-muted-foreground" />
            <span>Edit product</span>
          </Link>
        </DropdownMenuItem>
        {resolvedHome && (
          <DropdownMenuItem asChild>
            <Link
              href={resolvedHome}
              className="flex items-center gap-2 cursor-pointer"
              data-testid="product-settings-home"
            >
              <Home size={14} className="text-muted-foreground" />
              <span>Open product home</span>
            </Link>
          </DropdownMenuItem>
        )}
        {resolvedPricing && (
          <DropdownMenuItem asChild>
            <a
              href={resolvedPricing}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 cursor-pointer"
              data-testid="product-settings-pricing"
            >
              <ExternalLink size={14} className="text-muted-foreground" />
              <span>View on /pricing</span>
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ProductStats {
  mrr_cents: number;
  active_subs: number;
  paused_subs: number;
  cancelled_30d: number;
  new_subs_30d: number;
  churn_rate_30d: number;
}

export interface ProductShellTab {
  id: string;
  label: string;
  render: () => React.ReactNode;
}

export interface AdminProductPageShellProps {
  productId: string;
  productName: string;
  isActive: boolean;
  hidden: boolean;
  stats: ProductStats | null;
  /** If the stats query failed, show an error tile instead of a perpetual
   *  skeleton (the pre-fix failure mode where a 404/500 left the KPI
   *  strip blank-looking forever). Pass `query.error` straight from
   *  react-query — anything truthy triggers the error state. */
  statsError?: unknown;
  tabs: ProductShellTab[];
  filtersBar?: React.ReactNode;
  /** Optional override for the catalog editor link. Defaults to `/admin/products/:id`. */
  editCopyHref?: string;
  /** Caller handles optimistic UI + revert-on-error. */
  onToggleActive: (next: boolean) => void | Promise<void>;
  onToggleHidden: (next: boolean) => void | Promise<void>;
  /** Optional id of the tab to render initially. Defaults to tabs[0].id. */
  defaultTabId?: string;
}

function StatusPill({ active }: { active: boolean }) {
  // Rule 4 — outline + tinted bg, never bright fill.
  return (
    <span
      data-product-shell-pill={active ? 'active' : 'inactive'}
      className={
        active
          ? 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-emerald-300/60 bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/50'
          : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-slate-300/60 bg-slate-50/60 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700/50'
      }
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function HiddenChip() {
  return (
    <span
      data-product-shell-pill="hidden"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-amber-300/60 bg-amber-50/60 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50"
    >
      <EyeOff size={12} />
      Hidden
    </span>
  );
}

function formatUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

interface KpiCardProps {
  label: string;
  hint: string;
  value: React.ReactNode;
  testid?: string;
}

function KpiCard({ label, hint, value, testid }: KpiCardProps) {
  // Rule 5 — help cue anchored top-left via <HelpCueRow>.
  return (
    <Card className="p-4" data-testid={testid}>
      <HelpCueRow
        variant="label"
        cue={<Info size={12} className="text-muted-foreground" aria-label={hint} />}
        title={label}
      />
      <p className="text-2xl font-bold font-mono tabular-nums text-foreground" data-product-shell-kpi-value>
        {value}
      </p>
    </Card>
  );
}

function KpiSkeleton({ label }: { label: string }) {
  // Inline skeleton (avoids importing the shadcn <Skeleton>, which doesn't
  // declare React in scope and breaks tsx SSR tests).
  return (
    <Card className="p-4">
      <HelpCueRow
        variant="label"
        cue={<Info size={12} className="text-muted-foreground" />}
        title={label}
      />
      <div
        className="h-8 w-20 animate-pulse rounded-md bg-muted"
        data-product-shell-kpi-skeleton
        aria-hidden="true"
      />
    </Card>
  );
}

/* Error tile used when the /stats query failed. Replaces the perpetual
   skeleton (the regression Alex reported as "blank cards"). Shows an em-dash
   so the layout doesn't collapse, plus a hint icon explaining the state. */
function KpiErrorTile({ label }: { label: string }) {
  return (
    <Card className="p-4" data-product-shell-kpi-error>
      <HelpCueRow
        variant="label"
        cue={<AlertTriangle size={12} className="text-amber-500" aria-label="Stats failed to load" />}
        title={label}
      />
      <p
        className="text-2xl font-bold font-mono tabular-nums text-muted-foreground"
        title="Failed to load — reload the page to retry."
      >
        —
      </p>
    </Card>
  );
}

export function AdminProductPageShell({
  productId,
  productName,
  isActive,
  hidden,
  stats,
  statsError,
  tabs,
  filtersBar,
  editCopyHref,
  onToggleActive,
  onToggleHidden,
  defaultTabId,
}: AdminProductPageShellProps) {
  const initialTab = defaultTabId && tabs.find((t) => t.id === defaultTabId)
    ? defaultTabId
    : tabs[0]?.id;
  const [activeTabId, setActiveTabId] = useState<string | undefined>(initialTab);

  /* Sentry capture for the KPI-strip failure mode that produced this PR.
     Fired once per (productId, error) pair so a stuck error doesn't flood
     events on every re-render. */
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!statsError) return;
    const key = `${productId}:${(statsError as any)?.message ?? String(statsError)}`;
    if (reportedRef.current === key) return;
    reportedRef.current = key;
    try {
      Sentry.captureException(statsError, {
        tags: { surface: 'admin-product-shell', product_id: productId, kind: 'stats-load-failure' },
      });
    } catch { /* Sentry optional in dev */ }
  }, [statsError, productId]);
  const currentTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const editHref = editCopyHref ?? `/admin/products/${productId}`;

  return (
    <Stack
      gap="card"
      as="section"
      data-admin-product-shell
      data-product-id={productId}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div data-product-shell-section="header">
        <Cluster gap="loose" align="center" className="justify-between">
          <div className="min-w-0">
            <Cluster gap="normal" align="center">
              <h1 className="text-2xl font-bold text-foreground truncate">{productName}</h1>
              {/* Edit-copy access lives right next to the title — pencil icon makes
                  the affordance obvious. The full button (with label) still ships
                  in the right cluster for users who haven't internalised the icon. */}
              <Link
                href={editHref}
                className="inline-flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                aria-label="Edit product"
                title="Edit product"
                data-testid="product-shell-edit-icon"
              >
                <Pencil size={16} />
              </Link>
              <StatusPill active={isActive} />
              {hidden && <HiddenChip />}
            </Cluster>
            <p className="text-sm text-muted-foreground mt-1">Per-product controls + live KPIs.</p>
          </div>
          <Cluster gap="loose" align="center">
            <ProductSettingsMenu
              productId={productId}
              productName={productName}
              editHref={editHref}
            />
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer" data-testid="product-shell-active-toggle-label">
              <span className="text-muted-foreground">Active</span>
              <Switch
                checked={isActive}
                onCheckedChange={(next) => onToggleActive(next)}
                aria-label="Toggle product active"
                data-testid="product-shell-active-toggle"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer" data-testid="product-shell-hidden-toggle-label">
              <span className="text-muted-foreground inline-flex items-center gap-1">
                {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                Hidden
              </span>
              <Switch
                checked={hidden}
                onCheckedChange={(next) => onToggleHidden(next)}
                aria-label="Toggle product hidden"
                data-testid="product-shell-hidden-toggle"
              />
            </label>
          </Cluster>
        </Cluster>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-fr"
        data-product-shell-section="kpis"
        data-testid="product-shell-kpis"
      >
        {statsError ? (
          <>
            <KpiErrorTile label="MRR" />
            <KpiErrorTile label="Active subs" />
            <KpiErrorTile label="Δ 30d" />
            <KpiErrorTile label="Churn 30d" />
          </>
        ) : stats === null ? (
          <>
            <KpiSkeleton label="MRR" />
            <KpiSkeleton label="Active subs" />
            <KpiSkeleton label="Δ 30d" />
            <KpiSkeleton label="Churn 30d" />
          </>
        ) : (
          <>
            <KpiCard
              label="MRR"
              hint="Monthly recurring revenue across non-cancelled, enabled subscriptions for this product."
              value={
                <AnimatedNumber value={stats.mrr_cents} format={formatUsd} />
              }
              testid="product-shell-kpi-mrr"
            />
            <KpiCard
              label="Active subs"
              hint="Count of client_services rows with status=active and enabled=true for this product."
              value={<AnimatedNumber value={stats.active_subs} />}
              testid="product-shell-kpi-active"
            />
            <KpiCard
              label="Δ 30d"
              hint="New subscriptions minus cancellations in the last 30 days."
              value={
                <span>
                  <span className="text-emerald-600 dark:text-emerald-400">+{stats.new_subs_30d}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-rose-600 dark:text-rose-400">-{stats.cancelled_30d}</span>
                </span>
              }
              testid="product-shell-kpi-delta"
            />
            <KpiCard
              label="Churn 30d"
              hint="Cancellations / (active + cancellations) over the last 30 days."
              value={`${(stats.churn_rate_30d * 100).toFixed(1)}%`}
              testid="product-shell-kpi-churn"
            />
          </>
        )}
      </div>

      {/* ── Filters bar (optional) ─────────────────────────────────── */}
      {filtersBar && (
        <div data-product-shell-section="filters" data-testid="product-shell-filters">
          {filtersBar}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label={`${productName} sections`}
          data-product-shell-section="tabs"
          data-testid="product-shell-tabs"
          className="border-b border-border"
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
                  data-product-shell-tab={selected ? 'selected' : 'default'}
                  data-testid={`product-shell-tab-${tab.id}`}
                  onClick={() => setActiveTabId(tab.id)}
                  className={
                    selected
                      // Rule 4 — outline + tinted bg, not bright fill.
                      ? 'inline-flex items-center px-3 py-1.5 -mb-px rounded-t border border-b-transparent border-primary/40 bg-primary/5 text-foreground text-sm font-medium'
                      : 'inline-flex items-center px-3 py-1.5 -mb-px rounded-t border border-transparent text-sm font-medium text-muted-foreground hover:text-foreground transition-colors'
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
      <div data-product-shell-section="body" data-testid="product-shell-body">
        {currentTab?.render()}
      </div>
    </Stack>
  );
}

export default AdminProductPageShell;
