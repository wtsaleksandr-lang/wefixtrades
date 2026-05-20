/**
 * Wave K — Admin AI-budget control surface.
 *
 * Read + edit the QuoteQuick editor's per-user AI budget caps. Global row is
 * always present; per-tier (free / starter / pro / agency) overrides may
 * optionally exist and take precedence for users on that plan tier.
 *
 * Surfaces a top-20 spenders table so the admin can spot abuse fast.
 *
 * Backed by GET / PUT /api/admin/crm/ai-budget (see
 * server/routes/adminAiBudgetRoutes.ts). All writes are audited.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrainCircuit, DollarSign, ImageIcon, Loader2, RotateCw, Save } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";

interface BudgetValues {
  cap_lifetime_usd: number;
  soft_warn_pct: number;
  per_call_max_usd: number;
  daily_ceiling_usd: number;
  image_lifetime_cap: number;
}

interface TopSpender {
  user_id: number;
  email: string;
  name: string | null;
  cumulative_usd: number;
  month_usd: number;
  today_usd: number;
  images_used: number;
}

interface AiBudgetResponse {
  global: BudgetValues;
  tiers: Record<string, BudgetValues | null>;
  top_spenders: TopSpender[];
  scopes: string[];
}

const TIER_LABELS: Record<string, string> = {
  tier_free: "Free",
  tier_starter: "Starter",
  tier_pro: "Pro",
  tier_agency: "Agency",
};

const FIELD_LABELS: Record<keyof BudgetValues, { label: string; suffix: string; step: number }> = {
  cap_lifetime_usd: { label: "Lifetime cap", suffix: "$", step: 0.01 },
  soft_warn_pct: { label: "Soft warn", suffix: "%", step: 1 },
  per_call_max_usd: { label: "Per-call max", suffix: "$", step: 0.01 },
  daily_ceiling_usd: { label: "Daily ceiling", suffix: "$", step: 0.01 },
  image_lifetime_cap: { label: "Image cap", suffix: "imgs", step: 1 },
};

function ScopeForm({
  scope,
  values,
  onSave,
  saving,
  externalDraft,
  onDraftChange,
}: {
  scope: string;
  values: BudgetValues;
  onSave: (next: BudgetValues) => void;
  saving: boolean;
  /** Optional controlled draft (used for the global row so the page can
   *  observe its values and register them with the AI copilot). */
  externalDraft?: BudgetValues;
  onDraftChange?: (next: BudgetValues) => void;
}) {
  const [localDraft, setLocalDraft] = useState<BudgetValues>(values);
  const draft = externalDraft ?? localDraft;
  const setDraft: (next: BudgetValues | ((prev: BudgetValues) => BudgetValues)) => void = (next) => {
    const resolved = typeof next === "function" ? (next as (p: BudgetValues) => BudgetValues)(draft) : next;
    if (onDraftChange) onDraftChange(resolved);
    else setLocalDraft(resolved);
  };
  useEffect(() => {
    if (externalDraft === undefined) setLocalDraft(values);
  }, [values, scope, externalDraft]);

  const dirty = useMemo(() => {
    return (Object.keys(draft) as Array<keyof BudgetValues>).some(k => Number(draft[k]) !== Number(values[k]));
  }, [draft, values]);

  const setNum = (key: keyof BudgetValues, v: string) => {
    const n = Number(v);
    setDraft(d => ({ ...d, [key]: Number.isFinite(n) ? n : 0 }));
  };

  const valid = useMemo(() => {
    return (
      draft.cap_lifetime_usd >= 0 &&
      draft.per_call_max_usd >= 0 &&
      draft.daily_ceiling_usd >= 0 &&
      draft.image_lifetime_cap >= 0 &&
      draft.soft_warn_pct >= 0 && draft.soft_warn_pct <= 100
    );
  }, [draft]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      {(Object.keys(FIELD_LABELS) as Array<keyof BudgetValues>).map(key => {
        const cfg = FIELD_LABELS[key];
        return (
          <div key={key} className="flex flex-col gap-1">
            <label
              className="text-xs font-medium text-gray-600"
              htmlFor={`aibudget-${scope}-${key}`}
            >
              {cfg.label} <span className="text-gray-400">({cfg.suffix})</span>
            </label>
            <Input
              id={`aibudget-${scope}-${key}`}
              type="number"
              step={cfg.step}
              min={0}
              max={cfg.suffix === "%" ? 100 : undefined}
              value={String(draft[key])}
              onChange={(e) => setNum(key, e.target.value)}
              data-testid={`aibudget-input-${scope}-${key}`}
            />
          </div>
        );
      })}
      <div className="sm:col-span-5 flex justify-end">
        <Button
          size="sm"
          onClick={() => onSave(draft)}
          disabled={!dirty || !valid || saving}
          data-testid={`aibudget-save-${scope}`}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          Save {scope === "global" ? "global" : TIER_LABELS[scope] ?? scope}
        </Button>
      </div>
    </div>
  );
}

export default function AiBudgetPage() {
  usePageTitle("AI Budget");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery<AiBudgetResponse>({
    queryKey: ["/api/admin/crm/ai-budget"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/ai-budget", { credentials: "include" });
      if (!res.ok) throw new Error(`ai-budget ${res.status}`);
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ scope, values }: { scope: string; values: BudgetValues }) => {
      const res = await apiRequest("PUT", `/api/admin/crm/ai-budget/${scope}`, values);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast({ title: "Saved", description: `${vars.scope} budget updated.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/ai-budget"] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const tierScopes = (data?.scopes ?? []).filter(s => s !== "global");

  /* Lift the global draft up so the AI copilot can fill it. Per-tier
   * overrides stay self-contained — admins typically tweak them by hand
   * and they're not always exposed. The page-level registration below
   * targets the global row, which is always present. */
  const [globalDraft, setGlobalDraft] = useState<BudgetValues | null>(null);
  useEffect(() => {
    if (data?.global) setGlobalDraft((prev) => prev ?? data.global);
  }, [data?.global]);

  /* Register the editable budget fields with the AI copilot. The apply
   * handler updates the local draft only — the admin still clicks Save. */
  useCopilotForm({
    formLabel: "AI budget (global default)",
    fields: [
      { key: "cap_lifetime_usd", label: "Lifetime cap in USD (per-user)" },
      { key: "soft_warn_pct", label: "Soft warning threshold as a percentage of the lifetime cap (0-100)" },
      { key: "per_call_max_usd", label: "Maximum cost of a single AI call in USD" },
      { key: "daily_ceiling_usd", label: "Daily spend ceiling in USD (per-user)" },
      { key: "image_lifetime_cap", label: "Maximum lifetime image uploads (per-user, integer)" },
    ],
    values: {
      cap_lifetime_usd: globalDraft?.cap_lifetime_usd ?? data?.global.cap_lifetime_usd ?? 0,
      soft_warn_pct: globalDraft?.soft_warn_pct ?? data?.global.soft_warn_pct ?? 0,
      per_call_max_usd: globalDraft?.per_call_max_usd ?? data?.global.per_call_max_usd ?? 0,
      daily_ceiling_usd: globalDraft?.daily_ceiling_usd ?? data?.global.daily_ceiling_usd ?? 0,
      image_lifetime_cap: globalDraft?.image_lifetime_cap ?? data?.global.image_lifetime_cap ?? 0,
    },
    onApply: (fills) => {
      setGlobalDraft((prev) => {
        const base: BudgetValues = prev ?? data?.global ?? {
          cap_lifetime_usd: 0,
          soft_warn_pct: 0,
          per_call_max_usd: 0,
          daily_ceiling_usd: 0,
          image_lifetime_cap: 0,
        };
        const next: BudgetValues = { ...base };
        for (const f of fills) {
          const n = Number(f.value);
          if (!Number.isFinite(n)) continue;
          switch (f.field_key) {
            case "cap_lifetime_usd": next.cap_lifetime_usd = n; break;
            case "per_call_max_usd": next.per_call_max_usd = n; break;
            case "daily_ceiling_usd": next.daily_ceiling_usd = n; break;
            case "soft_warn_pct": next.soft_warn_pct = Math.round(n); break;
            case "image_lifetime_cap": next.image_lifetime_cap = Math.round(n); break;
          }
        }
        return next;
      });
    },
    enabled: Boolean(data?.global),
  });

  return (
    <AdminLayout pageContext={{ page: "ai-budget" }}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-[#0d3cfc]" />
              AI Budget
            </h1>
            <p className="text-sm text-gray-500">
              Per-user QuoteQuick editor AI spend caps. Tier rows (if set) override the global default
              for users on that plan tier.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RotateCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
        </div>

        {isError && (
          <Card className="p-4 border-red-200 bg-red-50">
            <p className="text-sm text-red-800">
              Couldn't load AI budget config.{" "}
              <button onClick={() => refetch()} className="underline font-medium">Retry</button>
            </p>
          </Card>
        )}

        {/* Global row */}
        <Card className="p-4" data-testid="aibudget-card-global">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-[#0d3cfc]" />
            <h2 className="text-sm font-semibold text-gray-900">Global default</h2>
            <Badge variant="outline" className="text-[10px]">applies when no tier override is set</Badge>
          </div>
          {isLoading || !data ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <ScopeForm
              scope="global"
              values={data.global}
              externalDraft={globalDraft ?? data.global}
              onDraftChange={setGlobalDraft}
              saving={saveMutation.isPending && saveMutation.variables?.scope === "global"}
              onSave={(values) => saveMutation.mutate({ scope: "global", values })}
            />
          )}
        </Card>

        {/* Per-tier overrides */}
        <Card className="p-4" data-testid="aibudget-card-tiers">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="w-4 h-4 text-[#0d3cfc]" />
            <h2 className="text-sm font-semibold text-gray-900">Per-tier overrides</h2>
            <Badge variant="outline" className="text-[10px]">applied when a user's plan_tier matches</Badge>
          </div>
          {isLoading || !data ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="space-y-5">
              {tierScopes.map(scope => {
                const label = TIER_LABELS[scope] ?? scope;
                const values = data.tiers[scope] ?? data.global;
                const isOverride = data.tiers[scope] != null;
                return (
                  <div key={scope} className="border-t pt-4 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-medium text-gray-800">{label}</h3>
                      {isOverride ? (
                        <Badge className="bg-[#0d3cfc]/10 text-[#0d3cfc] hover:bg-[#0d3cfc]/10 text-[10px]">
                          custom override
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-gray-500">
                          inherits global
                        </Badge>
                      )}
                    </div>
                    <ScopeForm
                      scope={scope}
                      values={values}
                      saving={saveMutation.isPending && saveMutation.variables?.scope === scope}
                      onSave={(next) => saveMutation.mutate({ scope, values: next })}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Top spenders */}
        <Card data-testid="aibudget-card-spenders">
          <div className="p-4 border-b">
            <h2 className="text-sm font-semibold text-gray-900">Top spenders this month</h2>
            <p className="text-xs text-gray-500">Highest cumulative AI spend right now — investigate any outliers.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Cumulative ($)</TableHead>
                <TableHead className="hidden sm:table-cell">This month ($)</TableHead>
                <TableHead className="hidden sm:table-cell">Today ($)</TableHead>
                <TableHead>Images</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (data?.top_spenders ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No AI spend recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.top_spenders ?? []).map(row => (
                  <TableRow key={row.user_id} data-testid={`aibudget-spender-${row.user_id}`}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{row.name || row.email}</div>
                      {row.name && <div className="text-xs text-gray-500">{row.email}</div>}
                    </TableCell>
                    <TableCell className="font-semibold text-gray-900">
                      ${row.cumulative_usd.toFixed(4)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">${row.month_usd.toFixed(4)}</TableCell>
                    <TableCell className="hidden sm:table-cell">${row.today_usd.toFixed(4)}</TableCell>
                    <TableCell>{row.images_used}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AdminLayout>
  );
}
