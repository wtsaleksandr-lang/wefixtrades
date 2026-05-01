import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DollarSign, Package, TrendingUp, Pencil, AlertTriangle, Plus, X,
} from "lucide-react";

/* ─── Types ─── */

interface ServiceRow {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  default_price: number | null;
  billing_period: string;
  delivery_pattern: string;
  is_active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_yearly_price_id: string | null;
  cost_amount: number | null;
  cost_type: string | null;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
  active_client_count: number;
}

/* ─── Helpers ─── */

const CATEGORY_COLORS: Record<string, string> = {
  visibility: "bg-blue-50 text-blue-700 border-blue-200",
  leads: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reputation: "bg-purple-50 text-purple-700 border-purple-200",
  automation: "bg-cyan-50 text-cyan-700 border-cyan-200",
  website: "bg-amber-50 text-amber-700 border-amber-200",
  content: "bg-rose-50 text-rose-700 border-rose-200",
};

function fmtDollars(cents: number | null | undefined): string {
  if (cents == null) return "--";
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtPrice(cents: number | null | undefined, period: string): string {
  if (cents == null) return "--";
  const formatted = `$${(cents / 100).toFixed(2)}`;
  return period === "monthly" ? `${formatted}/mo` : formatted;
}

function calcMargin(price: number | null | undefined, cost: number | null | undefined): string {
  if (price == null || price === 0 || cost == null) return "--";
  return `${(((price - cost) / price) * 100).toFixed(1)}%`;
}

function parseDollarsToCents(val: string): number | null {
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

/* ─── Edit Modal ─── */

interface EditFormState {
  name: string;
  description: string;
  tagline: string;
  default_price: string;
  cost_amount: string;
  billing_period: string;
  category: string;
  is_active: boolean;
  delivery_pattern: string;
}

function EditServiceModal({
  service,
  open,
  onClose,
  onSaved,
}: {
  service: ServiceRow;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<EditFormState>({
    name: service.name,
    description: service.description ?? "",
    tagline: service.tagline ?? "",
    default_price: service.default_price != null ? (service.default_price / 100).toFixed(2) : "",
    cost_amount: service.cost_amount != null ? (service.cost_amount / 100).toFixed(2) : "",
    billing_period: service.billing_period,
    category: service.category,
    is_active: service.is_active,
    delivery_pattern: service.delivery_pattern,
  });
  const [stripeWarning, setStripeWarning] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/admin/services/${service.id}`, updates);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.stripe_warning) {
        setStripeWarning(data.stripe_warning);
      }
      toast({ title: "Service updated", description: `"${form.name}" saved successfully.` });
      onSaved();
      if (!data.stripe_warning) onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    const updates: Record<string, any> = {};

    if (form.name !== service.name) updates.name = form.name;
    if (form.description !== (service.description ?? "")) updates.description = form.description || null;
    if (form.tagline !== (service.tagline ?? "")) updates.tagline = form.tagline || null;
    if (form.billing_period !== service.billing_period) updates.billing_period = form.billing_period;
    if (form.category !== service.category) updates.category = form.category;
    if (form.is_active !== service.is_active) updates.is_active = form.is_active;
    if (form.delivery_pattern !== service.delivery_pattern) updates.delivery_pattern = form.delivery_pattern;

    const newPrice = parseDollarsToCents(form.default_price);
    if (newPrice !== service.default_price) updates.default_price = newPrice;

    const newCost = parseDollarsToCents(form.cost_amount);
    if (newCost !== service.cost_amount) updates.cost_amount = newCost;

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setStripeWarning(null);
    mutation.mutate(updates);
  }

  const priceChanged = parseDollarsToCents(form.default_price) !== service.default_price;
  const hasStripePrice = !!service.stripe_price_id;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Service: {service.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-gray-700">Service Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1"
            />
          </div>

          {/* Tagline */}
          <div>
            <label className="text-sm font-medium text-gray-700">Tagline</label>
            <Input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="Short tagline"
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-gray-700">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Price + Cost row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Sale Price ($)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.default_price}
                onChange={(e) => setForm({ ...form, default_price: e.target.value })}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Internal Cost ($)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.cost_amount}
                onChange={(e) => setForm({ ...form, cost_amount: e.target.value })}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
          </div>

          {/* Stripe price warning */}
          {priceChanged && hasStripePrice && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Stripe price will need manual sync. Stripe prices are immutable -- you'll need to create a new price in Stripe.</span>
            </div>
          )}

          {stripeWarning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{stripeWarning}</span>
            </div>
          )}

          {/* Billing + Category row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Billing Period</label>
              <Select value={form.billing_period} onValueChange={(v) => setForm({ ...form, billing_period: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visibility">Visibility</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="reputation">Reputation</SelectItem>
                  <SelectItem value="automation">Automation</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="content">Content</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Delivery pattern */}
          <div>
            <label className="text-sm font-medium text-gray-700">Delivery Pattern</label>
            <Select value={form.delivery_pattern} onValueChange={(v) => setForm({ ...form, delivery_pattern: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="always_on">Always On</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between pt-2">
            <label className="text-sm font-medium text-gray-700">Active</label>
            <Switch
              checked={form.is_active}
              onCheckedChange={(c) => setForm({ ...form, is_active: c })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ─── */

export default function ServicePricingPage() {
  usePageTitle("Service & Pricing Management");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingService, setEditingService] = useState<ServiceRow | null>(null);

  const { data: services, isLoading } = useQuery<ServiceRow[]>({
    queryKey: ["/api/admin/services"],
  });

  // Quick toggle mutation for is_active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/services/${id}`, { is_active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to toggle status", description: err.message, variant: "destructive" });
    },
  });

  /* ─── Summary calculations ─── */
  const allServices = services ?? [];
  const activeServices = allServices.filter((s) => s.is_active);

  const monthlyRecurring = activeServices
    .filter((s) => s.billing_period === "monthly" && s.default_price != null)
    .reduce((sum, s) => sum + (s.default_price ?? 0) * s.active_client_count, 0);

  const servicesWithMargin = activeServices.filter(
    (s) => s.default_price != null && s.default_price > 0 && s.cost_amount != null
  );
  const avgMargin = servicesWithMargin.length > 0
    ? servicesWithMargin.reduce((sum, s) => {
        const margin = ((s.default_price! - s.cost_amount!) / s.default_price!) * 100;
        return sum + margin;
      }, 0) / servicesWithMargin.length
    : 0;

  return (
    <AdminLayout pageContext={{ page: "service-pricing" }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Service & Pricing Management</h2>
          <p className="text-sm text-gray-500">Manage service names, pricing, and availability across the platform.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Monthly Recurring Revenue</p>
                <p className="text-lg font-semibold text-gray-900">
                  {isLoading ? <Skeleton className="h-6 w-20 inline-block" /> : fmtDollars(monthlyRecurring)}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Active Services</p>
                <p className="text-lg font-semibold text-gray-900">
                  {isLoading ? <Skeleton className="h-6 w-12 inline-block" /> : activeServices.length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Average Margin</p>
                <p className="text-lg font-semibold text-gray-900">
                  {isLoading ? <Skeleton className="h-6 w-16 inline-block" /> : (
                    servicesWithMargin.length > 0 ? `${avgMargin.toFixed(1)}%` : "--"
                  )}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Services Table */}
        <Card>
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-center">Clients</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allServices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-gray-400 py-8">
                      No services in the catalog yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  allServices.map((svc) => (
                    <TableRow key={svc.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{svc.name}</div>
                          {svc.tagline && (
                            <div className="text-xs text-gray-400 truncate max-w-[200px]">{svc.tagline}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${CATEGORY_COLORS[svc.category] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {svc.category}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {svc.billing_period === "monthly" ? "Monthly" : "One-time"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtPrice(svc.default_price, svc.billing_period)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-gray-500">
                        {fmtDollars(svc.cost_amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {calcMargin(svc.default_price, svc.cost_amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                          {svc.active_client_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={svc.is_active}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: svc.id, is_active: checked })
                          }
                          disabled={toggleMutation.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingService(svc)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Edit Modal */}
      {editingService && (
        <EditServiceModal
          key={editingService.id}
          service={editingService}
          open={!!editingService}
          onClose={() => setEditingService(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
          }}
        />
      )}
    </AdminLayout>
  );
}
