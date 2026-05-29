/**
 * Wave 141 — <SystemHealthPanel>
 *
 * Pinned to the TOP of the admin Overview. Surfaces the read-only health
 * signals from `GET /api/admin/health` (Wave 140). NO resolution, NO SMS,
 * NO writes — Wave 142 wires copilot actions into the per-issue placeholder.
 *
 * States:
 *  - Loading  → skeleton line (never blocks the Overview).
 *  - Error    → neutral "health status unavailable" line (never crashes).
 *  - All-OK   → single compact green line + monitored counts + last-checked.
 *  - Problem  → expanded panel, amber/red accent, one row per non-OK
 *               product/tool with its failing check detail + a muted
 *               "resolution coming soon" placeholder caption per issue.
 *
 * Token-based styling so it reads clean + premium in both light and dark.
 * Status tint utilities (bg-emerald-50 / amber-50 / red-50 +
 * text-*-700) are explicitly allowed for status surfaces.
 */

import { ShieldCheck, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ALL_PRODUCTS } from "@shared/pricing";
import {
  useProductHealth,
  type ProductStatus,
  type ProductCheck,
  type ProductHealth,
  type ToolHealth,
} from "@/hooks/useProductHealth";

/* productId → display name (strips trademark glyphs for a clean inline read).
 * Falls back to the raw id when a probe reports an id not in the catalog. */
const PRODUCT_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  ALL_PRODUCTS.map((p) => [p.id, p.name.replace(/™/g, "").trim()]),
);

function productLabel(productId: string): string {
  return PRODUCT_NAME_BY_ID[productId] ?? productId;
}

/* Human label for a tool entry — Wave 140 emits a single "free_tools" id. */
function toolLabel(toolId: string): string {
  return toolId
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Compact relative-time formatter ("just now", "3m ago", "2h ago"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/* Status → tint classes. emerald/amber/red -50 bg + -700 text are the
 * approved status tints (allowed by the hardcoded-color guard). */
const STATUS_TINT: Record<ProductStatus, string> = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  degraded: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  down: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const STATUS_WORD: Record<ProductStatus, string> = {
  ok: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

/* One issue row: name + status pill + the failing check detail(s) + the
 * Wave-142 "resolution coming soon" placeholder caption. */
function IssueRow({
  name,
  status,
  failing,
}: {
  name: string;
  status: ProductStatus;
  failing: ProductCheck[];
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{name}</span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TINT[status]}`}
        >
          {STATUS_WORD[status]}
        </span>
      </div>
      <ul className="space-y-0.5">
        {failing.map((c, i) => (
          <li key={`${c.name}-${i}`} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{c.name}</span>
            {" — "}
            {c.detail}
          </li>
        ))}
      </ul>
      {/* Wave 142 wires copilot resolution actions here. Muted caption, not a button. */}
      <p className="text-[11px] italic text-muted-foreground/70">
        Guided resolution coming soon
      </p>
    </div>
  );
}

export default function SystemHealthPanel() {
  const { data, isLoading, isError } = useProductHealth();

  // Loading — skeleton line; never block the Overview.
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      </Card>
    );
  }

  // Error — neutral line; never crash.
  if (isError || !data) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          System health status unavailable
        </p>
      </Card>
    );
  }

  const { overall, products, tools, generatedAt } = data;
  const checkedRelative = relativeTime(generatedAt);

  // All-OK — single compact green line.
  if (overall === "ok") {
    return (
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          All systems healthy
        </span>
        <span className="text-xs text-muted-foreground">
          {products.length} product{products.length === 1 ? "" : "s"}
          {" · "}
          {tools.length} tool{tools.length === 1 ? "" : "s"} monitored
        </span>
        {checkedRelative && (
          <span className="ml-auto text-xs text-muted-foreground/70">
            checked {checkedRelative}
          </span>
        )}
      </Card>
    );
  }

  // Problem — expanded, accent by severity, one row per non-OK product/tool.
  const failingProducts = products.filter((p) => p.status !== "ok");
  const failingTools = tools.filter((t) => t.status !== "ok");
  const accent =
    overall === "down"
      ? "border-red-200 dark:border-red-500/30"
      : "border-amber-200 dark:border-amber-500/30";
  const headerTint = overall === "down" ? STATUS_TINT.down : STATUS_TINT.degraded;

  return (
    <Card className={`overflow-hidden border ${accent}`}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 ${headerTint}`}>
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {overall === "down" ? "System issues detected" : "Degraded systems"}
        </span>
        <span className="text-xs opacity-80">
          {failingProducts.length + failingTools.length} of{" "}
          {products.length + tools.length} monitored need attention
        </span>
        {checkedRelative && (
          <span className="ml-auto text-xs opacity-70">checked {checkedRelative}</span>
        )}
      </div>
      <div className="space-y-2 p-3">
        {failingProducts.map((p: ProductHealth) => (
          <IssueRow
            key={p.productId}
            name={productLabel(p.productId)}
            status={p.status}
            failing={p.checks.filter((c) => !c.ok)}
          />
        ))}
        {failingTools.map((t: ToolHealth) => (
          <IssueRow
            key={t.toolId}
            name={toolLabel(t.toolId)}
            status={t.status}
            failing={t.checks.filter((c) => !c.ok)}
          />
        ))}
      </div>
    </Card>
  );
}
