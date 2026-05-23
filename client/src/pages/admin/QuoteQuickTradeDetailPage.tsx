/**
 * Admin trade detail / editor — one trade.
 *
 * Wave W-AI-3a. Shows code default vs current override per field, lets admin
 * edit label / categoryId / defaultIcon, reset individual fields or all
 * overrides, archive / unarchive, and (for admin-only trades) hard-delete.
 *
 * Mounted at /admin/quotequick/trades/:id (admin-only).
 *
 * Sibling work:
 *   - AI-3b: QuoteQuick template editor (the "Templates using this trade"
 *     section here links into that).
 *   - AI-3c: Audit log reader (placeholder section here).
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronRight,
  Save,
  RotateCcw,
  Archive,
  ArchiveRestore,
  Trash2,
  ImageIcon,
  ChevronLeft,
  FileText,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CATEGORIES } from "@/data/trades";
import { getQuoteQuickIcon } from "@/data/quoteQuickIcons";
import LucideIconPicker from "@/components/admin/LucideIconPicker";

interface EffectiveTrade {
  id: string;
  categoryId: string;
  label: string;
  defaultIcon?: string;
}

interface CodeTrade {
  id: string;
  categoryId: string;
  label: string;
}

interface DetailResponse {
  tradeId: string;
  codeDefault: CodeTrade | null;
  overrides: Record<string, unknown> | null;
  effective: EffectiveTrade;
  is_archived: boolean;
  is_user_created: boolean;
  updatedAt: string | null;
  updatedBy: number | null;
}

interface TemplateListItem {
  templateId: string;
  effective: { id: string; name: string; trades: string[] };
  is_overridden: boolean;
  is_archived: boolean;
}

interface TemplateListResponse {
  templates: TemplateListItem[];
}

const ACCENT = "#4f46e5";
type FieldKey = "label" | "categoryId" | "defaultIcon";

export default function QuoteQuickTradeDetailPage({ tradeId }: { tradeId: string }) {
  usePageTitle("QuoteQuick Trade");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const detail = useQuery<DetailResponse>({
    queryKey: [`/api/admin/quotequick/trades/${tradeId}`],
    queryFn: () =>
      fetch(`/api/admin/quotequick/trades/${tradeId}`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
        return r.json();
      }),
  });

  // Wave W-AQ-1: filter server-side via ?trade=<id> instead of fetching every template + filtering client-side.
  const templates = useQuery<TemplateListResponse>({
    queryKey: ["/api/admin/quotequick/templates", { trade: tradeId }],
    queryFn: () =>
      fetch(`/api/admin/quotequick/templates?trade=${encodeURIComponent(tradeId)}`, {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const [dirty, setDirty] = useState<Partial<Record<FieldKey, string>>>({});
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset dirty whenever a fresh load changes the underlying trade
  useEffect(() => {
    setDirty({});
  }, [tradeId, detail.data?.updatedAt]);

  const overrides = detail.data?.overrides ?? null;
  const codeDefault = detail.data?.codeDefault ?? null;
  const effective = detail.data?.effective;

  function effectiveValue(key: FieldKey): string {
    if (key in dirty) return dirty[key] ?? "";
    return (effective?.[key as keyof EffectiveTrade] as string | undefined) ?? "";
  }

  function isOverridden(key: FieldKey): boolean {
    if (!overrides) return false;
    return key in overrides && overrides[key] != null;
  }

  function codeValue(key: FieldKey): string | undefined {
    if (key === "defaultIcon") return undefined; // no code default for icon
    return (codeDefault?.[key as keyof CodeTrade] as string | undefined) ?? undefined;
  }

  function setField(key: FieldKey, value: string) {
    setDirty((d) => ({ ...d, [key]: value }));
  }

  const isDirty = Object.keys(dirty).length > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Only PATCH fields that the admin actually touched this session.
      const patch: Record<string, unknown> = {};
      if ("label" in dirty) patch.label = dirty.label;
      if ("categoryId" in dirty) patch.categoryId = dirty.categoryId;
      if ("defaultIcon" in dirty) patch.defaultIcon = dirty.defaultIcon;
      const res = await apiRequest(
        "PATCH",
        `/api/admin/quotequick/trades/${tradeId}`,
        patch,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotequick/trades/${tradeId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/trades"] });
      setDirty({});
      toast({ title: "Saved", description: "Trade overrides updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const resetAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "DELETE",
        `/api/admin/quotequick/trades/${tradeId}/overrides`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotequick/trades/${tradeId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/trades"] });
      setDirty({});
      toast({ title: "Reset", description: "Trade reverted to code default." });
    },
    onError: (err: Error) => {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  /**
   * Reset a single field. Wave W-AQ-1: backend now exposes a per-field DELETE
   * (`DELETE /api/admin/quotequick/trades/:id/overrides/:field`) so we no
   * longer need the DELETE-all + PATCH-remainder workaround.
   */
  const resetFieldMutation = useMutation({
    mutationFn: async (field: FieldKey) => {
      const res = await apiRequest(
        "DELETE",
        `/api/admin/quotequick/trades/${tradeId}/overrides/${encodeURIComponent(field)}`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotequick/trades/${tradeId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/trades"] });
      setDirty({});
      toast({ title: "Field reset", description: "Field reverted to code default." });
    },
    onError: (err: Error) => {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  // Wave W-AQ-1: hard delete for user-created trades.
  const hardDeleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "DELETE",
        `/api/admin/quotequick/trades/${tradeId}/hard-delete`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/trades"] });
      toast({ title: "Deleted", description: "Trade permanently removed." });
      setLocation("/admin/quotequick/trades");
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setConfirmDelete(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (archived: boolean) => {
      const path = archived ? "archive" : "unarchive";
      const res = await apiRequest(
        "POST",
        `/api/admin/quotequick/trades/${tradeId}/${path}`,
      );
      return res.json();
    },
    onSuccess: (_d, archived) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotequick/trades/${tradeId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/trades"] });
      toast({
        title: archived ? "Archived" : "Unarchived",
        description: archived ? "Trade hidden from selectors." : "Trade restored.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Archive failed", description: err.message, variant: "destructive" });
    },
  });

  // Server pre-filters via ?trade=<id>, so this is just the response.
  const linkedTemplates = useMemo(
    () => templates.data?.templates ?? [],
    [templates.data],
  );

  const Icon = getQuoteQuickIcon(effectiveValue("defaultIcon"));

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-gray-500" data-testid="breadcrumb">
          <Link href="/admin/crm" className="hover:text-gray-700">
            Admin
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span>QuoteQuick</span>
          <ChevronRight className="w-3 h-3" />
          <Link href="/admin/quotequick/trades" className="hover:text-gray-700">
            Trades
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-700 font-medium truncate">
            {detail.data?.effective?.label ?? tradeId}
          </span>
        </nav>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/admin/quotequick/trades")}
          className="-ml-2"
        >
          <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to trades
        </Button>

        {detail.isLoading && <Skeleton className="h-32" />}
        {detail.isError && (
          <div className="text-sm text-red-600">
            Failed to load trade: {(detail.error as Error).message}
          </div>
        )}

        {detail.data && effective && (
          <>
            {/* Header */}
            <Card className="p-5 flex items-start gap-4">
              <div
                aria-hidden="true"
                className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${ACCENT}1a` }}
              >
                {Icon ? (
                  <Icon size={32} color={ACCENT} strokeWidth={2.25} />
                ) : (
                  <ImageIcon className="w-7 h-7 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {effectiveValue("label") || effective.label}
                  </h1>
                  {detail.data.overrides &&
                    Object.keys(detail.data.overrides).filter(
                      (k) => k !== "is_user_created" && k !== "id",
                    ).length > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 border-amber-200 text-amber-800 text-[10px]"
                      >
                        Edited
                      </Badge>
                    )}
                  {detail.data.is_archived && (
                    <Badge
                      variant="outline"
                      className="bg-gray-100 border-gray-300 text-gray-700 text-[10px]"
                    >
                      Archived
                    </Badge>
                  )}
                  {detail.data.is_user_created && (
                    <Badge
                      variant="outline"
                      className="bg-indigo-50 border-indigo-200 text-indigo-800 text-[10px]"
                    >
                      Admin-only
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1 font-mono">{tradeId}</div>
                {detail.data.updatedAt && (
                  <div className="text-xs text-gray-500 mt-1">
                    Last edited: {new Date(detail.data.updatedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </Card>

            {/* Editable fields */}
            <Card className="p-5 space-y-5">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Fields
              </h2>

              <FieldRow
                label="Label"
                overridden={isOverridden("label")}
                codeDefault={codeValue("label")}
                canReset={isOverridden("label") && !!codeDefault}
                onReset={() => resetFieldMutation.mutate("label")}
                resetPending={resetFieldMutation.isPending}
              >
                <Input
                  value={effectiveValue("label")}
                  onChange={(e) => setField("label", e.target.value)}
                  data-testid="field-label"
                />
              </FieldRow>

              <FieldRow
                label="Category"
                overridden={isOverridden("categoryId")}
                codeDefault={codeValue("categoryId")}
                canReset={isOverridden("categoryId") && !!codeDefault}
                onReset={() => resetFieldMutation.mutate("categoryId")}
                resetPending={resetFieldMutation.isPending}
              >
                <Select
                  value={effectiveValue("categoryId")}
                  onValueChange={(v) => setField("categoryId", v)}
                >
                  <SelectTrigger data-testid="field-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow
                label="Default icon"
                overridden={isOverridden("defaultIcon")}
                codeDefault={undefined}
                canReset={isOverridden("defaultIcon") && !!codeDefault}
                onReset={() => resetFieldMutation.mutate("defaultIcon")}
                resetPending={resetFieldMutation.isPending}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                    style={{ background: `${ACCENT}1a` }}
                  >
                    {Icon ? (
                      <Icon size={20} color={ACCENT} strokeWidth={2.25} />
                    ) : (
                      <ImageIcon size={18} className="text-gray-400" />
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIconPickerOpen(true)}
                    data-testid="field-icon-pick"
                  >
                    {effectiveValue("defaultIcon")
                      ? `Change (${effectiveValue("defaultIcon")})`
                      : "Pick icon…"}
                  </Button>
                </div>
              </FieldRow>
            </Card>

            {/* Action bar */}
            <Card className="p-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={!isDirty || saveMutation.isPending}
                  data-testid="save-trade"
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  {saveMutation.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resetAllMutation.mutate()}
                  disabled={
                    !codeDefault ||
                    !detail.data.overrides ||
                    Object.keys(detail.data.overrides).filter(
                      (k) => k !== "is_user_created" && k !== "id",
                    ).length === 0 ||
                    resetAllMutation.isPending
                  }
                  title={
                    codeDefault
                      ? "Delete all admin overrides — returns to code default"
                      : "Admin-only trade has no code default to reset to"
                  }
                  data-testid="reset-all"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  {resetAllMutation.isPending ? "Resetting…" : "Reset all"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {detail.data.is_archived ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => archiveMutation.mutate(false)}
                    disabled={archiveMutation.isPending}
                    data-testid="unarchive-trade"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5 mr-1" />
                    Unarchive
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => archiveMutation.mutate(true)}
                    disabled={archiveMutation.isPending}
                    data-testid="archive-trade"
                  >
                    <Archive className="w-3.5 h-3.5 mr-1" />
                    Archive
                  </Button>
                )}
                {detail.data.is_user_created && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setConfirmDelete(true)}
                    disabled={hardDeleteMutation.isPending}
                    data-testid="delete-trade"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </Card>

            {/* Templates using this trade */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Templates using this trade
              </h2>
              {templates.isLoading ? (
                <Skeleton className="h-16" />
              ) : linkedTemplates.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No templates currently reference this trade.
                </div>
              ) : (
                <ul className="space-y-2">
                  {linkedTemplates.map((t) => (
                    <li key={t.templateId}>
                      <Link
                        href={`/admin/quotequick/templates/${t.templateId}`}
                        className="flex items-center gap-2 text-sm text-indigo-700 hover:text-indigo-900 hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {t.effective.name}
                        <span className="text-[11px] text-gray-500 font-mono">
                          {t.templateId}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Audit history placeholder */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Audit history
              </h2>
              <div className="text-sm text-gray-500">
                Audit log coming soon — see AI-3c.
              </div>
            </Card>
          </>
        )}
      </div>

      <LucideIconPicker
        open={iconPickerOpen}
        value={effectiveValue("defaultIcon")}
        onClose={() => setIconPickerOpen(false)}
        onSelect={(name) => {
          setField("defaultIcon", name);
          setIconPickerOpen(false);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hard-delete the admin-created trade <span className="font-mono">{tradeId}</span>.
              The action cannot be undone. Templates that reference this trade will still hold the id in
              their <span className="font-mono">trades[]</span> array — you may want to update them first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hardDeleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => hardDeleteMutation.mutate()}
              disabled={hardDeleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-trade"
            >
              {hardDeleteMutation.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function FieldRow({
  label,
  overridden,
  codeDefault,
  canReset,
  onReset,
  resetPending,
  children,
}: {
  label: string;
  overridden: boolean;
  codeDefault?: string;
  canReset: boolean;
  onReset: () => void;
  resetPending: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {label}
          {overridden && (
            <Badge
              variant="outline"
              className="bg-amber-50 border-amber-200 text-amber-800 text-[9px] ml-2 uppercase"
            >
              Overridden
            </Badge>
          )}
        </label>
        {canReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={resetPending}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            data-testid={`reset-${label.toLowerCase()}`}
          >
            {resetPending ? "Resetting…" : "Reset this field"}
          </button>
        )}
      </div>
      {children}
      {codeDefault && overridden && (
        <div className="text-[11px] text-gray-500 mt-1">
          Code default: <span className="font-mono">{codeDefault}</span>
        </div>
      )}
    </div>
  );
}
