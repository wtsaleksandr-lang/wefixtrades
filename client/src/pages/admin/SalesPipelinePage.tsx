import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Phone, Mail, Globe, MapPin, ExternalLink, MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Lead {
  id: number;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;
  source: string;
  status: string;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
}

const STAGES = [
  { key: "new", label: "New", color: "bg-gray-100 text-gray-700" },
  { key: "contacted", label: "Contacted", color: "bg-blue-50 text-blue-700" },
  { key: "replied", label: "Replied", color: "bg-indigo-50 text-indigo-700" },
  { key: "demo_booked", label: "Demo", color: "bg-amber-50 text-amber-700" },
  { key: "closed_won", label: "Won", color: "bg-emerald-50 text-emerald-700" },
  { key: "closed_lost", label: "Lost", color: "bg-gray-100 text-gray-500" },
];

const SOURCES = ["manual", "google_maps", "referral", "inbound", "audit"];

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SalesPipelinePage() {
  usePageTitle("Sales Pipeline");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [noteLeadId, setNoteLeadId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [addForm, setAddForm] = useState({ business_name: "", contact_name: "", email: "", phone: "", website: "", google_maps_url: "", source: "manual" });

  const { data, isLoading } = useQuery<{ leads: Lead[]; counts: Record<string, number>; total: number }>({
    queryKey: ["/api/sales/leads"],
  });

  const createLead = useMutation({
    mutationFn: async (form: any) => { const r = await apiRequest("POST", "/api/sales/leads", form); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/sales/leads"] }); setShowAdd(false); setAddForm({ business_name: "", contact_name: "", email: "", phone: "", website: "", google_maps_url: "", source: "manual" }); toast({ title: "Lead added" }); },
    onError: (err: any) => toast({ title: "Couldn't add lead", description: err?.message ?? "Try again", variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => { const r = await apiRequest("PATCH", `/api/sales/leads/${id}`, { status }); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/sales/leads"] }); toast({ title: "Status updated" }); },
    onError: (err: any) => toast({ title: "Couldn't update status", description: err?.message ?? "Try again", variant: "destructive" }),
  });

  const markContacted = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes?: string }) => { const r = await apiRequest("POST", `/api/sales/leads/${id}/contacted`, { notes }); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/sales/leads"] }); setNoteLeadId(null); setNoteText(""); toast({ title: "Marked contacted" }); },
  });

  const leads = data?.leads || [];
  const counts = data?.counts || {};
  const filtered = filter === "all" ? leads : leads.filter(l => l.status === filter);

  return (
    <AdminLayout pageContext={{ page: "sales_pipeline" }}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Sales Pipeline</h1>
            <p className="text-xs text-gray-500">{data?.total || 0} leads total</p>
          </div>
          <Button size="sm" className="bg-brand-blue hover:bg-brand-blue-600" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Lead
          </Button>
        </div>

        {/* Stage counts */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filter === "all" ? "bg-brand-blue text-white border-brand-blue" : "bg-white text-gray-600 border-gray-200"}`}>
            All ({data?.total || 0})
          </button>
          {STAGES.map(s => (
            <button key={s.key} onClick={() => setFilter(s.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filter === s.key ? "bg-brand-blue text-white border-brand-blue" : "bg-white text-gray-600 border-gray-200"}`}>
              {s.label} ({counts[s.key] || 0})
            </button>
          ))}
        </div>

        {/* Lead cards */}
        <div className="space-y-2">
          {isLoading && Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 mb-2" />
          ))}
          {!isLoading && filtered.map(lead => {
            const stage = STAGES.find(s => s.key === lead.status);
            return (
              <Card key={lead.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">{lead.business_name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${stage?.color || "bg-gray-100 text-gray-600"}`}>{stage?.label || lead.status}</span>
                      <span className="text-[10px] text-gray-400 capitalize">{lead.source}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      {lead.contact_name && <span>{lead.contact_name}</span>}
                      {lead.phone && <span className="inline-flex items-center gap-0.5"><Phone className="w-3 h-3" />{lead.phone}</span>}
                      {lead.email && <span className="inline-flex items-center gap-0.5"><Mail className="w-3 h-3" />{lead.email}</span>}
                      {lead.website && <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"><Globe className="w-3 h-3" />Website</a>}
                      {lead.google_maps_url && <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"><MapPin className="w-3 h-3" />Maps</a>}
                      {lead.last_contacted_at && <span className="text-gray-400">Contacted {fmtDate(lead.last_contacted_at)}</span>}
                    </div>
                    {lead.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-2 whitespace-pre-wrap">{lead.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {lead.status === "new" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setNoteLeadId(lead.id); setNoteText(""); }}>
                        <MessageSquare className="w-3 h-3 mr-1" /> Contact
                      </Button>
                    )}
                    {lead.status === "contacted" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: lead.id, status: "replied" })}>Replied</Button>
                    )}
                    {lead.status === "replied" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: lead.id, status: "demo_booked" })}>Book Demo</Button>
                    )}
                    {lead.status === "demo_booked" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700" onClick={() => updateStatus.mutate({ id: lead.id, status: "closed_won" })}>Won</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => updateStatus.mutate({ id: lead.id, status: "closed_lost" })}>Lost</Button>
                      </>
                    )}
                    <Select value={lead.status} onValueChange={(v) => updateStatus.mutate({ id: lead.id, status: v })}>
                      <SelectTrigger className="h-7 w-auto min-w-[80px] text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map(s => <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && !isLoading && (
            <Card className="p-8 text-center">
              <p className="text-sm text-gray-500">No leads {filter !== "all" ? `with status "${filter}"` : "yet"}.</p>
              <Button onClick={() => setShowAdd(true)} className="mt-3"><Plus className="w-3.5 h-3.5 mr-1" /> Add your first lead</Button>
            </Card>
          )}
        </div>
      </div>

      {/* Add Lead Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Lead</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (addForm.business_name && !createLead.isPending) createLead.mutate(addForm); }}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Business Name *</label>
                <Input value={addForm.business_name} onChange={e => setAddForm({ ...addForm, business_name: e.target.value })} placeholder="e.g. Denver Pro Plumbing" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Contact Name</label>
                  <Input value={addForm.contact_name} onChange={e => setAddForm({ ...addForm, contact_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Source</label>
                  <Select value={addForm.source} onValueChange={v => setAddForm({ ...addForm, source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Phone</label>
                  <Input value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Email</label>
                  <Input value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Website</label>
                <Input value={addForm.website} onChange={e => setAddForm({ ...addForm, website: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Google Maps Link</label>
                <Input value={addForm.google_maps_url} onChange={e => setAddForm({ ...addForm, google_maps_url: e.target.value })} placeholder="https://maps.google.com/..." />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" className="bg-brand-blue hover:bg-brand-blue-600" disabled={!addForm.business_name || createLead.isPending}>
                {createLead.isPending ? "Adding..." : "Add Lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Contact Note Dialog */}
      <Dialog open={noteLeadId !== null} onOpenChange={() => setNoteLeadId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Log Contact</DialogTitle></DialogHeader>
          <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="What happened? e.g. Sent intro email, Called and left voicemail" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteLeadId(null)}>Cancel</Button>
            <Button className="bg-brand-blue hover:bg-brand-blue-600" onClick={() => noteLeadId && markContacted.mutate({ id: noteLeadId, notes: noteText })} disabled={markContacted.isPending}>
              {markContacted.isPending ? "Saving..." : "Mark Contacted"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
