/**
 * Admin view of QuoteQuick trades.
 *
 * Wave W-AI-3a. Lists every code-default + admin-created trade, grouped by
 * the 8 categories from `client/src/data/trades.ts`. Surfaces which trades
 * have admin overrides applied / are archived, lets admin click into a trade
 * to edit fields, and provides a "New trade" modal to create an admin-only
 * trade.
 *
 * Mounted at /admin/quotequick/trades (admin-only).
 *
 * Sibling work:
 *   - AI-3b: QuoteQuick template editor
 *   - AI-3c: Tier 2 extras (audit log reader, etc.)
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { ProductSettingsMenu } from "@/components/admin/AdminProductPageShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, ImageIcon } from "lucide-react";
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

interface TradeListItem {
  tradeId: string;
  effective: EffectiveTrade;
  is_overridden: boolean;
  is_archived: boolean;
  is_user_created: boolean;
  updatedAt: string | null;
  updatedBy: number | null;
}

interface ListResponse {
  trades: TradeListItem[];
}

type FilterChip = "all" | "edited" | "archived";

const ACCENT = "#4f46e5";

export default function QuoteQuickTradesPage() {
  usePageTitle("QuoteQuick Trades");
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const list = useQuery<ListResponse>({
    queryKey: ["/api/admin/quotequick/trades"],
    queryFn: () =>
      fetch("/api/admin/quotequick/trades", { credentials: "include" }).then((r) => r.json()),
  });

  const filtered = useMemo(() => {
    const items = list.data?.trades ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((t) => {
      if (filter === "edited" && !t.is_overridden) return false;
      if (filter === "archived" && !t.is_archived) return false;
      if (filter === "all" && t.is_archived) return false; // hide archived by default
      if (!q) return true;
      return (
        t.tradeId.toLowerCase().includes(q) ||
        (t.effective.label ?? "").toLowerCase().includes(q)
      );
    });
  }, [list.data, search, filter]);

  // Group by category, preserving CATEGORIES order
  const grouped = useMemo(() => {
    const byCat = new Map<string, TradeListItem[]>();
    for (const c of CATEGORIES) byCat.set(c.id, []);
    for (const t of filtered) {
      const cat = t.effective.categoryId ?? "custom";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(t);
    }
    return byCat;
  }, [filtered]);

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">QuoteQuick Trades</h1>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              Every trade powering the QuoteQuick widget. Edit any label, category, or default
              icon — overrides persist to the database and merge over the code defaults at runtime.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Search className="w-4 h-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search trades…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
              data-testid="trade-search"
            />
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="new-trade-button"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> New trade
            </Button>
            <ProductSettingsMenu productId="quotequick" productName="QuoteQuick" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(["all", "edited", "archived"] as FilterChip[]).map((c) => (
            <Button
              key={c}
              variant={filter === c ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(c)}
              data-testid={`filter-${c}`}
            >
              {c === "all" ? "All" : c === "edited" ? "Edited only" : "Archived only"}
            </Button>
          ))}
        </div>

        {list.isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}

        {!list.isLoading &&
          CATEGORIES.map((cat) => {
            const items = grouped.get(cat.id) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={cat.id} className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  {cat.label}{" "}
                  <span className="text-gray-400 font-normal">({items.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
                  {items.map((t) => (
                    <TradeCard
                      key={t.tradeId}
                      trade={t}
                      onClick={() => setLocation(`/admin/quotequick/trades/${t.tradeId}`)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

        {!list.isLoading && filtered.length === 0 && (
          <div className="text-sm text-gray-500 py-10 text-center">
            No trades match your filters.
          </div>
        )}
      </div>

      {createOpen && (
        <NewTradeDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(tradeId) => {
            setCreateOpen(false);
            setLocation(`/admin/quotequick/trades/${tradeId}`);
          }}
        />
      )}
    </AdminLayout>
  );
}

function TradeCard({
  trade,
  onClick,
}: {
  trade: TradeListItem;
  onClick: () => void;
}) {
  const Icon = getQuoteQuickIcon(trade.effective.defaultIcon);
  return (
    <Card
      className="p-4 cursor-pointer hover:border-indigo-300 transition-colors flex items-start gap-3"
      onClick={onClick}
      data-testid={`trade-card-${trade.tradeId}`}
    >
      <div
        aria-hidden="true"
        className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
        style={{ background: `${ACCENT}1a` }}
      >
        {Icon ? (
          <Icon size={20} color={ACCENT} strokeWidth={2.25} />
        ) : (
          <ImageIcon size={18} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-gray-900 truncate">{trade.effective.label}</div>
          <div className="flex flex-col items-end gap-1">
            {trade.is_overridden && (
              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800 text-[10px]">
                Edited
              </Badge>
            )}
            {trade.is_archived && (
              <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-700 text-[10px]">
                Archived
              </Badge>
            )}
            {trade.is_user_created && (
              <Badge variant="outline" className="bg-indigo-50 border-indigo-200 text-indigo-800 text-[10px]">
                Admin-only
              </Badge>
            )}
          </div>
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5 font-mono truncate">
          {trade.tradeId}
        </div>
      </div>
    </Card>
  );
}

function NewTradeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (tradeId: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState(CATEGORIES[0]?.id ?? "cleaning");
  const [defaultIcon, setDefaultIcon] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { label: label.trim(), categoryId };
      if (defaultIcon) body.defaultIcon = defaultIcon;
      const res = await apiRequest("POST", "/api/admin/quotequick/trades", body);
      return res.json() as Promise<{ tradeId: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotequick/trades"] });
      toast({ title: "Trade created", description: `Created ${data.tradeId}` });
      onCreated(data.tradeId);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to create trade",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const Icon = getQuoteQuickIcon(defaultIcon);

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New admin trade</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                Label
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Custom Roof Inspection"
                data-testid="new-trade-label"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                Category
              </label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger data-testid="new-trade-category">
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
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1">
                Default icon
              </label>
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
                  data-testid="new-trade-pick-icon"
                >
                  {defaultIcon ? `Change (${defaultIcon})` : "Pick icon…"}
                </Button>
                {defaultIcon && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefaultIcon(null)}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!label.trim() || !categoryId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="new-trade-submit"
            >
              {createMutation.isPending ? "Creating…" : "Create trade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LucideIconPicker
        open={iconPickerOpen}
        value={defaultIcon}
        onClose={() => setIconPickerOpen(false)}
        onSelect={(name) => {
          setDefaultIcon(name);
          setIconPickerOpen(false);
        }}
      />
    </>
  );
}
