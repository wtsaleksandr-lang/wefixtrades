import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Supplier {
  id: number;
  name: string;
  type: string;
  contact_name: string | null;
  contact_email: string | null;
  platform_url: string | null;
  supported_services: string[] | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

const TYPE_COLORS: Record<string, string> = {
  fiverr: "bg-green-50 text-green-700",
  freelancer: "bg-blue-50 text-blue-700",
  white_label: "bg-purple-50 text-purple-700",
  automation: "bg-cyan-50 text-cyan-700",
  internal: "bg-gray-100 text-gray-700",
};

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "freelancer",
    contact_name: "",
    contact_email: "",
    platform_url: "",
    notes: "",
  });

  const { data: suppliers, isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/crm/suppliers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/admin/crm/suppliers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/suppliers"] });
      setShowAdd(false);
      setForm({ name: "", type: "freelancer", contact_name: "", contact_email: "", platform_url: "", notes: "" });
    },
  });

  const activeSuppliers = (suppliers ?? []).filter((s) => s.is_active);
  const supplierTypeMap = (suppliers ?? []).reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <AdminLayout pageContext={{
      page: "suppliers",
      supplierCount: suppliers?.length,
      activeSupplierCount: activeSuppliers.length,
      supplierNames: activeSuppliers.map((s) => s.name),
      supplierTypes: Object.keys(supplierTypeMap).length > 0 ? supplierTypeMap : undefined,
    }}>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Suppliers</h2>
            <p className="text-sm text-gray-500">
              {suppliers?.length ?? 0} suppliers — Fiverr, freelancers, white-label, automation, internal
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} className="bg-[#2D6A4F] hover:bg-[#1B4332] min-h-[36px]">
            <Plus className="w-4 h-4 mr-1" /> Add Supplier
          </Button>
        </div>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">Platform</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">Loading...</TableCell></TableRow>
              ) : suppliers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No suppliers yet. Click "Add Supplier" to register your first one.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers?.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium text-sm text-gray-900">{s.name}</div>
                      {s.notes && <div className="text-xs text-gray-500 truncate max-w-[200px]">{s.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_COLORS[s.type] || "bg-gray-100 text-gray-600"}`}>
                        {s.type.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-sm text-gray-700">{s.contact_name || "-"}</div>
                      <div className="text-xs text-gray-500">{s.contact_email || ""}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {s.platform_url ? (
                        <a href={s.platform_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2D6A4F] hover:underline truncate max-w-[200px] block">
                          {s.platform_url}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Add dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Supplier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Type *</label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fiverr">Fiverr</SelectItem>
                    <SelectItem value="freelancer">Freelancer</SelectItem>
                    <SelectItem value="white_label">White Label</SelectItem>
                    <SelectItem value="automation">Automation</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Contact Name</label>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Contact Email</label>
                  <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Platform URL</label>
                <Input value={form.platform_url} onChange={(e) => setForm({ ...form, platform_url: e.target.value })} placeholder="e.g. https://fiverr.com/seller" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Notes</label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || createMutation.isPending}
                className="bg-[#2D6A4F] hover:bg-[#1B4332]"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
