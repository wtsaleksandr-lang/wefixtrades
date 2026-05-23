import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminProductPageShell, type ProductStats } from "@/components/admin/AdminProductPageShell";
import AppetizeEmbed from "@/components/admin/AppetizeEmbed";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Phone, RefreshCw, XCircle, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const PRODUCT_ID = "tradeline";

interface FleetRow { clientServiceId: number; clientId: number; businessName: string; serviceId: string; status: string; variant: string; mode: string; assistantStatus: string; lastCallAt: string | null; periodMinutes: number; failedCalls24h: number; }
interface CallRow { id: number; client_service_id: number; caller_number: string | null; duration_seconds: number | null; outcome: string; summary: string | null; ended_at: string | null; created_at: string | null; transcript_json: any; recording_url: string | null; business_name: string; client_id: number; }

interface ProductRecord {
  live: { id: string; name: string; is_active: boolean; hidden: boolean } | null;
}

function relativeTime(dateStr: string | null): string { if (!dateStr) return "Never"; const diff = Date.now() - new Date(dateStr).getTime(); const mins = Math.floor(diff / 60000); if (mins < 1) return "Just now"; if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`; }
function VariantBadge({ variant }: { variant: string }) { const s: Record<string,string> = { call_backup: "bg-blue-50 text-blue-700", chat: "bg-purple-50 text-purple-700", complete: "bg-emerald-50 text-emerald-700" }; const l: Record<string,string> = { call_backup: "Call Backup", chat: "Chat", complete: "Complete" }; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${s[variant] || "bg-gray-100 text-gray-600"}`}>{l[variant] || variant}</span>; }
function ModeBadge({ mode }: { mode: string }) { const s: Record<string,string> = { available: "bg-green-50 text-green-700", on_the_job: "bg-amber-50 text-amber-700", after_hours: "bg-slate-100 text-slate-600" }; const l: Record<string,string> = { available: "Available", on_the_job: "On Job", after_hours: "After Hours" }; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${s[mode] || "bg-gray-100 text-gray-600"}`}>{l[mode] || mode}</span>; }
function AssistantStatusBadge({ status }: { status: string }) { const s: Record<string,string> = { built: "bg-green-50 text-green-700", building: "bg-blue-50 text-blue-600", not_built: "bg-gray-100 text-gray-500", failed: "bg-red-50 text-red-700", disabled: "bg-red-100 text-red-800" }; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${s[status] || "bg-gray-100 text-gray-600"}`}>{status.replace("_", " ")}</span>; }

function CallsTab() {
  const [expandedCallId, setExpandedCallId] = useState<number | null>(null);
  const { data: callsData, isLoading } = useQuery<{ calls: CallRow[]; total: number }>({ queryKey: ["/api/admin/crm/tradeline/calls"], queryFn: async () => { const res = await fetch("/api/admin/crm/tradeline/calls?limit=50", { credentials: "include" }); if (!res.ok) throw new Error("Failed"); return res.json(); } });
  const { data: callDetail } = useQuery<{ call: CallRow }>({ queryKey: ["/api/admin/crm/tradeline/calls", expandedCallId], queryFn: async () => { const res = await fetch(`/api/admin/crm/tradeline/calls/${expandedCallId}`, { credentials: "include" }); if (!res.ok) throw new Error("Failed"); return res.json(); }, enabled: !!expandedCallId });
  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  const calls = callsData?.calls ?? [];
  if (!calls.length) return <Card className="p-12 text-center"><Phone className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No TradeLine calls recorded yet.</p></Card>;
  return (
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-gray-50/80"><th className="text-left px-4 py-3 font-medium text-gray-600">Client</th><th className="text-left px-4 py-3 font-medium text-gray-600">Caller</th><th className="text-left px-4 py-3 font-medium text-gray-600">Time</th><th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th><th className="text-left px-4 py-3 font-medium text-gray-600">Outcome</th><th className="text-left px-4 py-3 font-medium text-gray-600">Summary</th></tr></thead><tbody className="divide-y divide-gray-100">{calls.map(call => (<tr key={call.id} className="hover:bg-gray-50/50"><td className="px-4 py-3" colSpan={6}><button type="button" className="w-full text-left" onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}><div className="grid grid-cols-6 gap-2 items-center"><span className="font-medium text-gray-900 truncate">{call.business_name}</span><span className="text-gray-600 truncate">{call.caller_number || "Unknown"}</span><span className="text-gray-500">{relativeTime(call.created_at)}</span><span className="text-gray-700 font-mono">{call.duration_seconds ? `${Math.floor(call.duration_seconds/60)}:${String(call.duration_seconds%60).padStart(2,"0")}` : "-"}</span><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium w-fit capitalize ${call.outcome==="answered"?"bg-emerald-50 text-emerald-700":call.outcome==="failed"?"bg-red-100 text-red-800":"bg-gray-100 text-gray-600"}`}>{call.outcome}</span><div className="flex items-center gap-2"><span className="text-gray-500 text-xs truncate">{call.summary||"-"}</span><ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${expandedCallId===call.id?"rotate-180":""}`}/></div></div></button>{expandedCallId===call.id&&(<div className="mt-3 space-y-3 border-t border-gray-100 pt-3">{call.summary&&<div><p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Summary</p><p className="text-xs text-gray-700">{call.summary}</p></div>}{callDetail?.call?.transcript_json?.lead_data&&(<div><p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Extracted Lead</p><div className="grid grid-cols-4 gap-1.5 text-xs">{callDetail.call.transcript_json.lead_data.caller_name&&<div><span className="text-gray-400">Name:</span> {callDetail.call.transcript_json.lead_data.caller_name}</div>}{callDetail.call.transcript_json.lead_data.job_type&&<div><span className="text-gray-400">Job:</span> {callDetail.call.transcript_json.lead_data.job_type}</div>}</div></div>)}{callDetail?.call?.recording_url&&<div><p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Recording</p><audio controls className="w-full h-8" src={callDetail.call.recording_url}/></div>}{callDetail?.call?.transcript_json?.text&&<div><p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Transcript</p><div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto text-xs text-gray-700 whitespace-pre-wrap">{callDetail.call.transcript_json.text}</div></div>}</div>)}</td></tr>))}</tbody></table></div>{callsData&&callsData.total>calls.length&&<div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500 text-center">Showing {calls.length} of {callsData.total} calls</div>}</Card>
  );
}

function FleetTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: fleet, isLoading } = useQuery<FleetRow[]>({ queryKey: ["/api/admin/crm/tradeline/fleet"], queryFn: async () => { const res = await fetch("/api/admin/crm/tradeline/fleet", { credentials: "include" }); if (!res.ok) throw new Error("Failed"); return res.json(); } });
  const rebuildMutation = useMutation({ mutationFn: async (csId: number) => { const res = await apiRequest("POST", `/api/admin/crm/tradeline/${csId}/build-assistant`); return res.json(); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/tradeline/fleet"] }); toast({ title: "Rebuild triggered" }); }, onError: (err: Error) => { toast({ title: "Rebuild failed", description: err.message, variant: "destructive" }); } });
  /* Per-client disable toggle (existing behavior preserved per audit). The
   * product-level is_active / hidden toggles live in the shell header. */
  const disableMutation = useMutation({ mutationFn: async (csId: number) => { const res = await apiRequest("POST", `/api/admin/crm/tradeline/${csId}/disable`); return res.json(); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/tradeline/fleet"] }); toast({ title: "Service disabled" }); }, onError: (err: Error) => { toast({ title: "Disable failed", description: err.message, variant: "destructive" }); } });
  const failedItems = fleet?.filter(r => r.assistantStatus==="failed"||r.failedCalls24h>0) ?? [];
  const activeItems = fleet?.filter(r => r.assistantStatus!=="failed"&&r.failedCalls24h===0) ?? [];
  return (
    <div data-theme="light" className="space-y-4">
      <div className="flex items-center justify-end gap-2 text-sm text-gray-500"><Phone className="w-4 h-4"/><span>{fleet?.length??0} services</span></div>
      {isLoading&&<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>}
      {failedItems.length>0&&(<Card className="border-red-200 bg-red-50/50 p-4"><div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-red-600"/><h2 className="text-sm font-semibold text-red-800">Attention Required ({failedItems.length})</h2></div><div className="space-y-2">{failedItems.map(row=>(<div key={row.clientServiceId} className="flex items-center justify-between bg-white border border-red-100 rounded-lg px-4 py-3"><div className="flex items-center gap-3"><span className="font-medium text-sm text-gray-900">{row.businessName}</span><AssistantStatusBadge status={row.assistantStatus}/>{row.failedCalls24h>0&&<span className="text-xs text-red-600 font-medium">{row.failedCalls24h} failed call{row.failedCalls24h>1?"s":""} (24h)</span>}</div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={()=>rebuildMutation.mutate(row.clientServiceId)} disabled={rebuildMutation.isPending}><RefreshCw className="w-3.5 h-3.5 mr-1"/>Rebuild</Button><Button variant="destructive" size="sm" onClick={()=>disableMutation.mutate(row.clientServiceId)} disabled={disableMutation.isPending}><XCircle className="w-3.5 h-3.5 mr-1"/>Disable</Button></div></div>))}</div></Card>)}
      {!isLoading&&activeItems.length>0&&(<Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-gray-50/80"><th className="text-left px-4 py-3 font-medium text-gray-600">Client</th><th className="text-left px-4 py-3 font-medium text-gray-600">Variant</th><th className="text-left px-4 py-3 font-medium text-gray-600">Mode</th><th className="text-left px-4 py-3 font-medium text-gray-600">Assistant</th><th className="text-left px-4 py-3 font-medium text-gray-600">Last Call</th><th className="text-right px-4 py-3 font-medium text-gray-600">Minutes</th><th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{activeItems.map(row=>(<tr key={row.clientServiceId} className="hover:bg-gray-50/50"><td className="px-4 py-3 font-medium text-gray-900">{row.businessName}</td><td className="px-4 py-3"><VariantBadge variant={row.variant}/></td><td className="px-4 py-3"><ModeBadge mode={row.mode}/></td><td className="px-4 py-3"><AssistantStatusBadge status={row.assistantStatus}/></td><td className="px-4 py-3 text-gray-500">{relativeTime(row.lastCallAt)}</td><td className="px-4 py-3 text-right text-gray-700 font-mono">{row.periodMinutes}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" onClick={()=>rebuildMutation.mutate(row.clientServiceId)} disabled={rebuildMutation.isPending} title="Rebuild"><RefreshCw className="w-3.5 h-3.5"/></Button><Button variant="ghost" size="sm" onClick={()=>disableMutation.mutate(row.clientServiceId)} disabled={disableMutation.isPending} title="Disable" className="text-red-500 hover:text-red-700 hover:bg-red-50"><XCircle className="w-3.5 h-3.5"/></Button></div></td></tr>))}</tbody></table></div></Card>)}
      {!isLoading&&(!fleet||fleet.length===0)&&<Card className="p-12 text-center"><Phone className="w-10 h-10 text-gray-300 mx-auto mb-3"/><p className="text-gray-500">No TradeLine services found.</p></Card>}
    </div>
  );
}

export default function TradeLineOpsPage() {
  usePageTitle("TradeLine Ops");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* AdminProductPageShell wiring — see QuoteQuickPage pilot (PR #578). */
  const productKey = ["/api/admin/products", PRODUCT_ID] as const;
  const { data: productData } = useQuery<ProductRecord>({
    queryKey: productKey,
    queryFn: () => apiRequest("GET", `/api/admin/products/${PRODUCT_ID}`).then((r) => r.json()),
  });
  const live = productData?.live ?? null;

  const statsKey = ["/api/admin/products", PRODUCT_ID, "stats"] as const;
  const { data: productStats } = useQuery<ProductStats>({
    queryKey: statsKey,
    queryFn: () => apiRequest("GET", `/api/admin/products/${PRODUCT_ID}/stats`).then((r) => r.json()),
  });

  const activeToggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${PRODUCT_ID}/status`, { is_active: next });
      return res.json();
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: productKey });
      const prev = queryClient.getQueryData<ProductRecord>(productKey);
      if (prev?.live) {
        queryClient.setQueryData<ProductRecord>(productKey, { live: { ...prev.live, is_active: next } });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(productKey, ctx.prev);
      toast({ title: "Could not update status", description: "Try again", variant: "destructive" });
    },
    onSuccess: (_data, next) => {
      toast({ title: next ? "Product activated" : "Product deactivated" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKey });
    },
  });

  const hiddenToggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${PRODUCT_ID}/visibility`, { hidden: next });
      return res.json();
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: productKey });
      const prev = queryClient.getQueryData<ProductRecord>(productKey);
      if (prev?.live) {
        queryClient.setQueryData<ProductRecord>(productKey, { live: { ...prev.live, hidden: next } });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(productKey, ctx.prev);
      toast({ title: "Could not update visibility", description: "Try again", variant: "destructive" });
    },
    onSuccess: (_data, next) => {
      toast({ title: next ? "Hidden from public catalog" : "Visible in public catalog" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKey });
    },
  });

  return (
    <AdminLayout>
      <AdminProductPageShell
        productId={PRODUCT_ID}
        productName="TradeLine"
        isActive={live?.is_active ?? true}
        hidden={live?.hidden ?? false}
        stats={productStats ?? null}
        tabs={[
          { id: "fleet", label: "Fleet", render: () => <FleetTab /> },
          { id: "calls", label: "Calls", render: () => <CallsTab /> },
          { id: "appPreview", label: "App Preview", render: () => <AppetizeEmbed /> },
        ]}
        onToggleActive={(next) => activeToggle.mutate(next)}
        onToggleHidden={(next) => hiddenToggle.mutate(next)}
      />
    </AdminLayout>
  );
}
