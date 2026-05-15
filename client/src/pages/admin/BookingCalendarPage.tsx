import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Link as LinkIcon, Loader2, Plus, Trash2, RefreshCw, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CalendarConnection { id: number; platform: string; status: string; last_synced_at: string | null; slot_duration_minutes: number; buffer_minutes: number; booking_url?: string; metadata?: Record<string, any> | null; }
interface WorkingHours { day: string; enabled: boolean; start: string; end: string; }
interface BookingRow { id: number; date: string; time: string; customer_name: string; customer_phone: string | null; customer_email: string | null; service: string | null; status: string; }

const PL: Record<string, string> = { google: "Google Calendar", google_calendar: "Google Calendar", calcom: "Cal.com", cal_com: "Cal.com", calendly: "Calendly", manual: "Manual / URL" };
// Maps the dialog's short platform keys to the backend connection enum.
const PLATFORM_API: Record<string, string> = { google: "google_calendar", calcom: "cal_com", calendly: "calendly", manual: "manual" };
const PC: Record<string, string> = { google: "bg-blue-50 text-blue-700 border-blue-200", google_calendar: "bg-blue-50 text-blue-700 border-blue-200", calcom: "bg-violet-50 text-violet-700 border-violet-200", cal_com: "bg-violet-50 text-violet-700 border-violet-200", calendly: "bg-sky-50 text-sky-700 border-sky-200", manual: "bg-gray-50 text-gray-600 border-gray-200" };
const SS: Record<string, string> = { connected: "bg-emerald-50 text-emerald-700", disconnected: "bg-gray-100 text-gray-500", error: "bg-red-50 text-red-700", confirmed: "bg-emerald-50 text-emerald-700", pending: "bg-amber-50 text-amber-700", cancelled: "bg-red-50 text-red-600" };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DWH: WorkingHours[] = DAYS.map((d, i) => ({ day: d, enabled: i < 5, start: "09:00", end: "17:00" }));
const TZS = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "Europe/London", "Australia/Sydney"];

function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [platform, setPlatform] = useState(""); const [apiKey, setApiKey] = useState(""); const [eventTypeId, setEventTypeId] = useState(""); const [bookingUrl, setBookingUrl] = useState(""); const [connecting, setConnecting] = useState(false);
  const connect = async () => {
    setConnecting(true);
    try {
      const credentials: Record<string, string> = {};
      if (apiKey) credentials.api_key = apiKey;
      const body: Record<string, unknown> = { platform: PLATFORM_API[platform] || platform };
      if (Object.keys(credentials).length) body.credentials = credentials;
      if (eventTypeId) body.calendar_id = eventTypeId;
      if (bookingUrl) body.booking_url = bookingUrl;
      const r = await apiRequest("POST", "/api/admin/booking/connections", body);
      const d = await r.json();
      if (d.oauth_url) { window.location.href = d.oauth_url; return; }
      qc.invalidateQueries({ queryKey: ["/api/admin/booking/connections"] }); toast({ title: "Calendar connected" }); onClose(); setPlatform(""); setApiKey(""); setEventTypeId(""); setBookingUrl("");
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); } finally { setConnecting(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Connect Calendar</DialogTitle></DialogHeader>
      {!platform ? <div className="grid gap-3 py-2">{(["google", "calcom", "calendly", "manual"] as const).map((p) => (
        <button key={p} onClick={() => setPlatform(p)} className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 text-left">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${PC[p]}`}>{p === "manual" ? <LinkIcon className="w-5 h-5" /> : <CalendarDays className="w-5 h-5" />}</div>
          <div><p className="text-sm font-semibold text-gray-900">{PL[p]}</p><p className="text-xs text-gray-500">{p === "google" ? "OAuth" : p === "calcom" ? "API key" : p === "calendly" ? "Access token" : "Booking URL"}</p></div>
        </button>))}</div>
      : <div className="space-y-4 py-2">
        <button onClick={() => setPlatform("")} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><ChevronDown className="w-3 h-3 rotate-90" />Back</button>
        {platform === "google" && <p className="text-sm text-gray-500">You will be redirected to Google.</p>}
        {platform === "calcom" && <><div><label className="text-xs font-medium text-gray-600 mb-1 block">API Key *</label><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div><div><label className="text-xs font-medium text-gray-600 mb-1 block">Event Type ID *</label><Input value={eventTypeId} onChange={(e) => setEventTypeId(e.target.value)} /></div></>}
        {platform === "calendly" && <div><label className="text-xs font-medium text-gray-600 mb-1 block">Access Token *</label><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>}
        {platform === "manual" && <div><label className="text-xs font-medium text-gray-600 mb-1 block">Booking URL *</label><Input type="url" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} /></div>}
      </div>}
      {platform && <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={connect} disabled={connecting} className="bg-[#2D6A4F] hover:bg-[#1B4332]">{connecting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Connecting...</> : "Connect"}</Button></DialogFooter>}
    </DialogContent></Dialog>
  );
}

function HoursEditor() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: saved } = useQuery<{ hours: WorkingHours[]; timezone: string }>({ queryKey: ["/api/admin/booking/working-hours"] });
  const [hours, setHours] = useState<WorkingHours[]>(saved?.hours || DWH);
  const [tz, setTz] = useState(saved?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const save = useMutation({
    mutationFn: async () => { await apiRequest("PUT", "/api/admin/booking/working-hours", { hours, timezone: tz }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/booking/working-hours"] }); toast({ title: "Saved" }); },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><label className="text-sm font-medium text-gray-700 shrink-0">Timezone</label>
        <Select value={tz} onValueChange={setTz}><SelectTrigger className="w-64"><SelectValue /></SelectTrigger><SelectContent>{TZS.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {hours.map((h, i) => (
          <div key={h.day} className={`flex items-center gap-4 px-4 py-3 ${h.enabled ? "bg-white" : "bg-gray-50"}`}>
            <div className="flex items-center gap-3 w-32 shrink-0"><Switch checked={h.enabled} onCheckedChange={() => setHours((p) => p.map((x, j) => j === i ? { ...x, enabled: !x.enabled } : x))} /><span className={`text-sm font-medium ${h.enabled ? "text-gray-900" : "text-gray-400"}`}>{h.day.slice(0, 3)}</span></div>
            {h.enabled ? <div className="flex items-center gap-2"><Input type="time" value={h.start} onChange={(e) => setHours((p) => p.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} className="w-32 h-9 text-sm" /><span className="text-gray-400 text-sm">to</span><Input type="time" value={h.end} onChange={(e) => setHours((p) => p.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} className="w-32 h-9 text-sm" /></div> : <span className="text-sm text-gray-400 italic">Closed</span>}
          </div>))}
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-[#2D6A4F] hover:bg-[#1B4332]">{save.isPending ? "Saving..." : "Save Working Hours"}</Button>
    </div>
  );
}

export default function BookingCalendarPage() {
  usePageTitle("Booking Calendar");
  const qc = useQueryClient(); const { toast } = useToast(); const [connectOpen, setConnectOpen] = useState(false);
  const { data: conns, isLoading: cl } = useQuery<CalendarConnection[]>({ queryKey: ["/api/admin/booking/connections"], queryFn: async () => { const r = await apiRequest("GET", "/api/admin/booking/connections"); const d = await r.json(); return d.connections; } });
  const { data: bk, isLoading: bl } = useQuery<{ data: BookingRow[]; total: number }>({ queryKey: ["/api/admin/booking/recent"] });
  const testM = useMutation({ mutationFn: async (id: number) => { const r = await apiRequest("POST", `/api/admin/booking/connections/${id}/test`); return r.json(); }, onSuccess: (d: any) => { toast({ title: "Works", description: `${d.slots?.length || 0} slots` }); }, onError: () => { toast({ title: "Test failed", variant: "destructive" }); } });
  const delM = useMutation({ mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/admin/booking/connections/${id}`); }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/booking/connections"] }); toast({ title: "Disconnected" }); } });
  const acceptingM = useMutation({ mutationFn: async ({ id, metadata, accepting }: { id: number; metadata: Record<string, any> | null | undefined; accepting: boolean }) => { await apiRequest("PATCH", `/api/admin/booking/connections/${id}`, { metadata: { ...(metadata || {}), accepting_bookings: accepting } }); }, onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["/api/admin/booking/connections"] }); toast({ title: v.accepting ? "Accepting bookings" : "Bookings paused" }); }, onError: () => { toast({ title: "Update failed", variant: "destructive" }); } });

  return (
    <AdminLayout pageContext={{ page: "booking" }}>
      <div className="max-w-4xl space-y-6">
        <div><h1 className="text-xl font-bold text-gray-900">Booking Calendar</h1><p className="text-sm text-gray-500 mt-0.5">Manage calendars, hours, and bookings</p></div>
        <Tabs defaultValue="connections" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="connections">Connections</TabsTrigger><TabsTrigger value="hours">Working Hours</TabsTrigger><TabsTrigger value="bookings">Bookings</TabsTrigger></TabsList>
          <TabsContent value="connections" className="space-y-4">
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-900">Calendar Connections</h2><Button size="sm" onClick={() => setConnectOpen(true)} className="bg-[#2D6A4F] hover:bg-[#1B4332] gap-1.5"><Plus className="w-3.5 h-3.5" />Connect</Button></div>
            {cl ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            : !conns?.length ? <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center"><CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-3" /><p className="text-sm font-medium text-gray-600">No calendars connected</p><Button size="sm" onClick={() => setConnectOpen(true)} className="mt-4 bg-[#2D6A4F] hover:bg-[#1B4332]"><Plus className="w-3.5 h-3.5 mr-1" />Connect</Button></div>
            : <div className="space-y-3">{conns.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${PC[c.platform] || PC.manual}`}><CalendarDays className="w-5 h-5" /></div>
                  <div><div className="flex items-center gap-2"><span className="text-sm font-semibold text-gray-900">{PL[c.platform] || c.platform}</span><Badge variant="outline" className={SS[c.status] || "bg-gray-100 text-gray-500"}>{c.status}</Badge></div>
                    <div className="flex gap-3 mt-0.5">{c.slot_duration_minutes && <span className="text-xs text-gray-400">{c.slot_duration_minutes}min</span>}{c.last_synced_at && <span className="text-xs text-gray-400">Synced {new Date(c.last_synced_at).toLocaleDateString()}</span>}</div></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={c.metadata?.accepting_bookings !== false} disabled={acceptingM.isPending} onCheckedChange={(v) => acceptingM.mutate({ id: c.id, metadata: c.metadata, accepting: v })} />
                    <span className="text-xs text-gray-500 hidden sm:inline">Accepting bookings</span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600" onClick={() => testM.mutate(c.id)}>{testM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</Button>
                    {c.booking_url && <Button variant="ghost" size="icon" className="h-8 w-8" asChild><a href={c.booking_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a></Button>}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => { if (confirm("Disconnect?")) delM.mutate(c.id); }}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>))}</div>}
          </TabsContent>
          <TabsContent value="hours" className="space-y-4"><h2 className="text-base font-semibold text-gray-900">Working Hours</h2><HoursEditor /></TabsContent>
          <TabsContent value="bookings" className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Bookings</h2>
            {bl ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            : !bk?.data?.length ? <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center"><CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-3" /><p className="text-sm text-gray-600">No bookings yet</p></div>
            : <div className="rounded-xl border border-gray-200 overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b"><th className="text-left px-4 py-3 font-medium text-gray-500">Date</th><th className="text-left px-4 py-3 font-medium text-gray-500">Customer</th><th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Phone</th><th className="text-left px-4 py-3 font-medium text-gray-500">Status</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{bk.data.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50"><td className="px-4 py-3"><div className="font-medium text-gray-900">{new Date(b.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div><div className="text-xs text-gray-500">{b.time}</div></td>
                  <td className="px-4 py-3"><div className="font-medium text-gray-900">{b.customer_name}</div></td><td className="px-4 py-3 hidden sm:table-cell text-gray-600">{b.customer_phone || "--"}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className={SS[b.status] || "bg-gray-100 text-gray-500"}>{b.status}</Badge></td></tr>))}</tbody></table></div>}
          </TabsContent>
        </Tabs>
      </div>
      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
    </AdminLayout>
  );
}
