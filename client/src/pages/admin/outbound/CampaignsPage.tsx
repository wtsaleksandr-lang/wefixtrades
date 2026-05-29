import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, RefreshCw, Users, Send, CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

/* ─── Types ─── */
interface Campaign {
  id: number;
  name: string;
  description: string | null;
  platform: string;
  external_campaign_id: string | null;
  platform_status: string | null;
  status: string;
  target_trade: string | null;
  target_region: string | null;
  sender_email: string | null;
  created_at: string;
}

interface CampaignLead {
  cp: {
    id: number;
    sync_status: string;
    outreach_status: string;
    emails_sent: number;
    last_replied_at: string | null;
  };
  prospect: {
    id: number;
    business_name: string;
    primary_email: string | null;
    trade_category: string | null;
    city: string | null;
    state: string | null;
    status: string;
  } | null;
  enrichment: { quality_score: number | null } | null;
}

interface CampaignDetail {
  campaign: Campaign;
  leads: CampaignLead[];
}

/* ─── New Campaign Dialog ─── */
function NewCampaignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    description: "",
    platform: "instantly",
    external_campaign_id: "",
    target_trade: "",
    target_region: "",
    sender_email: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/outbound/campaigns", {
        ...form,
        external_campaign_id: form.external_campaign_id || null,
        description: form.description || null,
        target_trade: form.target_trade || null,
        target_region: form.target_region || null,
        sender_email: form.sender_email || null,
        status: "active",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/campaigns"] });
      toast({ title: "Campaign created" });
      setForm({ name: "", description: "", platform: "instantly", external_campaign_id: "", target_trade: "", target_region: "", sender_email: "" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-theme="light" className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Campaign Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q2 Plumbers — Miami" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Platform</label>
              <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instantly">Instantly</SelectItem>
                  <SelectItem value="smartlead">Smartlead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-0.5 cursor-default">
                    External Campaign ID <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </label>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs">
                  Copy the campaign ID from your Instantly or Smartlead dashboard and paste it here to link the platforms.
                </TooltipContent>
              </Tooltip>
              <Input value={form.external_campaign_id} onChange={(e) => setForm({ ...form, external_campaign_id: e.target.value })} placeholder="From Instantly/Smartlead" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Trade</label>
              <Input value={form.target_trade} onChange={(e) => setForm({ ...form, target_trade: e.target.value })} placeholder="plumber, electrician..." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Region</label>
              <Input value={form.target_region} onChange={(e) => setForm({ ...form, target_region: e.target.value })} placeholder="Miami, FL" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Sender Email</label>
            <Input value={form.sender_email} onChange={(e) => setForm({ ...form, sender_email: e.target.value })} placeholder="support@wefixtrades.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending} className="bg-[#0d3cfc] hover:bg-[#0b34d6]">
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Campaign Detail Panel ─── */
function CampaignDetail({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<CampaignDetail>({
    queryKey: ["/api/admin/outbound/campaigns", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/outbound/campaigns/${campaignId}`, { credentials: "include" });
      return res.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/outbound/campaigns/${campaignId}/sync`, {});
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/prospects"] });
      toast({ title: "Sync complete", description: `${result.synced} synced, ${result.failed} failed` });
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const OUTREACH_COLORS: Record<string, string> = {
    queued: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    opened: "bg-sky-100 text-sky-700",
    clicked: "bg-brand-blue-100 text-brand-blue-700",
    replied: "bg-green-100 text-green-700",
    bounced: "bg-red-100 text-red-600",
    unsubscribed: "bg-orange-100 text-orange-700",
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  if (!data) return null;

  const { campaign, leads } = data;
  const pendingCount = leads.filter((l) => l.cp.sync_status === "pending").length;

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">{campaign.name}</h3>
          <p className="text-xs text-muted-foreground capitalize">{campaign.platform} · {campaign.external_campaign_id || "no external ID"}</p>
        </div>
        <div className="flex gap-2">
          {campaign.external_campaign_id && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending || pendingCount === 0}
                  >
                    <Send className="w-3 h-3" />
                    {syncMutation.isPending ? "Syncing..." : `Push ${pendingCount} pending`}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                Sends queued leads to your Instantly/Smartlead campaign. Only leads with "pending" sync status are pushed.
              </TooltipContent>
            </Tooltip>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>Close</Button>
        </div>
      </div>

      {!campaign.external_campaign_id && (
        <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            No external campaign ID set — leads cannot be synced until you add an Instantly or Smartlead campaign ID.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {leads.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No leads assigned yet. Go to Prospects and assign approved leads to this campaign.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border sticky top-0">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Business</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">Sent</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 cursor-default">
                        Sync <HelpCircle className="w-3 h-3 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">
                      Whether this lead has been sent to the outreach platform (pending → synced → failed).
                    </TooltipContent>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map(({ cp, prospect }) => (
                <tr key={cp.id} className="hover:bg-muted/50">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground truncate max-w-[160px]">{prospect?.business_name || "—"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{prospect?.trade_category} · {[prospect?.city, prospect?.state].filter(Boolean).join(", ")}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">
                    {prospect?.primary_email || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{cp.emails_sent}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${OUTREACH_COLORS[cp.outreach_status] ?? "bg-muted/50 text-muted-foreground"}`}>
                      {cp.outreach_status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs ${cp.sync_status === "synced" ? "text-green-600" : cp.sync_status === "failed" ? "text-red-500" : "text-gray-400"}`}>
                      {cp.sync_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function CampaignsPage() {
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/outbound/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/campaigns", { credentials: "include" });
      return res.json();
    },
  });

  const PLATFORM_COLORS: Record<string, string> = {
    instantly: "bg-blue-100 text-blue-700",
    smartlead: "bg-brand-blue-100 text-brand-blue-700",
  };

  const STATUS_COLORS: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    paused: "bg-amber-100 text-amber-700",
    archived: "bg-gray-100 text-gray-500",
  };

  return (
    <AdminLayout pageContext={{ page: "outbound-campaigns", section: "Outbound" }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Outreach Campaigns</h2>
            <p className="text-sm text-muted-foreground">Link to existing Instantly or Smartlead campaigns</p>
          </div>
          <Button size="sm" className="bg-[#0d3cfc] hover:bg-[#0b34d6] gap-1.5" onClick={() => setNewCampaignOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            New Campaign
          </Button>
        </div>

        <div className={`grid gap-4 ${selectedCampaignId ? "grid-cols-2" : "grid-cols-1"}`}>
          {/* Campaign list */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : campaigns.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                <Button size="sm" className="mt-3 bg-[#0d3cfc] hover:bg-[#0b34d6]" onClick={() => setNewCampaignOpen(true)}>Create your first campaign</Button>
              </div>
            ) : (
              campaigns.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCampaignId(c.id === selectedCampaignId ? null : c.id)}
                  className={`bg-card rounded-lg border cursor-pointer hover:border-[#0d3cfc] transition-colors p-4 ${c.id === selectedCampaignId ? "border-[#0d3cfc] shadow-sm" : "border-border"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-foreground">{c.name}</h3>
                      {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${PLATFORM_COLORS[c.platform]}`}>
                          {c.platform}
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[c.status]}`}>
                          {c.status}
                        </span>
                        {c.target_trade && (
                          <span className="text-xs text-muted-foreground">{c.target_trade}</span>
                        )}
                        {c.target_region && (
                          <span className="text-xs text-muted-foreground">· {c.target_region}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {c.external_campaign_id ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Linked
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-500">
                          <AlertCircle className="w-3.5 h-3.5" />
                          No ID
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Detail panel */}
          {selectedCampaignId && (
            <CampaignDetail
              campaignId={selectedCampaignId}
              onClose={() => setSelectedCampaignId(null)}
            />
          )}
        </div>
      </div>

      <NewCampaignDialog open={newCampaignOpen} onClose={() => setNewCampaignOpen(false)} />
    </AdminLayout>
  );
}
