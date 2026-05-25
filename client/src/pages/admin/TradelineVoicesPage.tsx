/**
 * Wave W-AW-1 — Admin TradeLine Voices + per-client budget settings.
 *
 * Mounted at /admin/tradeline/voices (admin-only).
 *
 * Two-card layout:
 *   - Voice catalog card grid (add / edit / archive / sample play)
 *   - Per-client budget + voice override table (set monthly minute cap)
 *
 * Plus a small usage summary chart fed by GET /api/admin/tradeline/voices/usage.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/AdminLayout";
import { ProductSettingsMenu } from "@/components/admin/AdminProductPageShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Play, Pause, Archive, Pencil, Save, X, Mic2, Loader2, AlertCircle, RotateCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Voice {
  id: string;
  elevenlabs_voice_id: string;
  display_name: string;
  description: string | null;
  gender: string | null;
  accent: string | null;
  tags: string[];
  sample_audio_url: string | null;
  status: "active" | "archived";
}

interface ClientSetting {
  client_id: number;
  business_name: string;
  trade_type: string | null;
  voice_id: string | null;
  greeting: string | null;
  response_style: string | null;
  monthly_minute_budget: number | null;
  monthly_minute_used: number;
  auto_disable_on_cap: boolean;
  fallback_voice_id: string | null;
}

interface UsageRow {
  voice_id: string | null;
  minutes_used: number;
  client_count: number;
}

interface ProvisioningHealth {
  dbServicesTotal: number;
  dbServicesActive: number;
  dbServicesPending: number;
  dbServicesWithAssistantId: number;
  dbServicesFailed: number;
  dbAssistantSettingsRows: number;
  vapiAssistantsTotal: number;
  vapiTradelineAssistants: number;
  driftCount: number;
  driftIds: string[];
  failures: Array<{ id: number; status: string; lastBuildError: string }>;
  vapiReachable: boolean;
  vapiError: string | null;
  generatedAt: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export default function TradelineVoicesPage() {
  usePageTitle("TradeLine Voices");
  const qc = useQueryClient();
  const { toast } = useToast();

  /* Single shared <audio> element so clicking Play on a second voice
   * stops the first. Tracks the slug currently playing + the slug whose
   * sample is being fetched, so the row can render the right icon. */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const handlePreview = async (voiceId: string) => {
    // Toggle off if user clicks the currently-playing voice.
    if (playingId === voiceId && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    // Stop any previous playback before starting a new one.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setLoadingId(voiceId);
    try {
      const r = await fetch(`/api/admin/tradeline/voices/${voiceId}/sample`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlayingId((cur) => (cur === voiceId ? null : cur));
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPlayingId((cur) => (cur === voiceId ? null : cur));
        toast({ title: "Voice preview unavailable", variant: "destructive" });
      };
      audioRef.current = audio;
      await audio.play();
      setPlayingId(voiceId);
    } catch {
      toast({ title: "Voice preview unavailable", variant: "destructive" });
    } finally {
      setLoadingId((cur) => (cur === voiceId ? null : cur));
    }
  };

  const voices = useQuery<{ voices: Voice[] }>({
    queryKey: ["/api/admin/tradeline/voices"],
    queryFn: () => api("/api/admin/tradeline/voices"),
  });

  const clientsQ = useQuery<{ clients: ClientSetting[] }>({
    queryKey: ["/api/admin/tradeline/settings/clients"],
    queryFn: () => api("/api/admin/tradeline/settings/clients"),
  });

  const usageQ = useQuery<{ usage: UsageRow[] }>({
    queryKey: ["/api/admin/tradeline/voices/usage"],
    queryFn: () => api("/api/admin/tradeline/voices/usage"),
  });

  /* Read-only side-by-side: DB-side TradeLine provisioning state vs the
   * live Vapi assistant inventory. Caught zero-live-assistants drift in
   * PR #698 audit — keep it visible so it can't slip again silently. */
  const healthQ = useQuery<ProvisioningHealth>({
    queryKey: ["/api/admin/tradeline/provisioning-health"],
    queryFn: () => api("/api/admin/tradeline/provisioning-health"),
    refetchInterval: 60_000,
  });

  const [editing, setEditing] = useState<Voice | null>(null);
  const [creating, setCreating] = useState(false);
  /** Voice pending archival — drives the shared <ConfirmDialog>. */
  const [pendingArchive, setPendingArchive] = useState<Voice | null>(null);

  const saveVoice = useMutation({
    mutationFn: async (data: Partial<Voice> & { id?: string }) => {
      if (creating) {
        return api("/api/admin/tradeline/voices", { method: "POST", body: JSON.stringify(data) });
      }
      return api(`/api/admin/tradeline/voices/${data.id}`, { method: "PATCH", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/tradeline/voices"] });
      setEditing(null);
      setCreating(false);
    },
  });

  const archiveVoice = useMutation({
    mutationFn: (id: string) => api(`/api/admin/tradeline/voices/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/tradeline/voices"] }),
  });

  const saveClient = useMutation({
    mutationFn: ({ clientId, body }: { clientId: number; body: Partial<ClientSetting> }) =>
      api(`/api/admin/tradeline/settings/${clientId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/tradeline/settings/clients"] }),
  });

  const voiceMap = useMemo(() => new Map((voices.data?.voices ?? []).map((v) => [v.id, v])), [voices.data]);

  const totalMinutes = useMemo(
    () => (usageQ.data?.usage ?? []).reduce((acc, r) => acc + Number(r.minutes_used ?? 0), 0),
    [usageQ.data],
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Mic2 className="w-6 h-6 text-brand-blue-600" /> TradeLine Voices
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage the ElevenLabs voice catalog, monthly minute budgets, and per-client overrides.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => { setCreating(true); setEditing({ id: "", elevenlabs_voice_id: "", display_name: "", description: "", gender: "", accent: "us-en", tags: [], sample_audio_url: "", status: "active" }); }} data-testid="button-add-voice">
              <Plus className="w-4 h-4 mr-1" /> Add voice
            </Button>
            <ProductSettingsMenu productId="tradeline" productName="TradeLine" />
          </div>
        </div>

        {/* Provisioning health widget — DB-side vs live Vapi inventory. */}
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                {healthQ.data && (healthQ.data.driftCount > 0 || healthQ.data.dbServicesFailed > 0 || !healthQ.data.vapiReachable) ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-brand-blue-600" />
                )}
                Provisioning health
              </h2>
              <p className="text-xs text-gray-500">
                DB-side TradeLine state vs the live Vapi account. Auto-refreshes every minute.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => healthQ.refetch()}
              disabled={healthQ.isFetching}
              data-testid="button-refresh-health"
            >
              <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${healthQ.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {healthQ.isLoading && <div className="text-sm text-gray-500">Loading provisioning health…</div>}
          {healthQ.isError && (
            <div className="text-sm text-red-700">
              Couldn't load provisioning health: {(healthQ.error as Error | null)?.message ?? "unknown"}
            </div>
          )}
          {healthQ.data && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded border border-gray-200 p-2">
                  <div className="text-[11px] text-gray-500">DB services (total)</div>
                  <div className="text-lg font-semibold text-gray-900" data-testid="health-db-total">
                    {healthQ.data.dbServicesTotal}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {healthQ.data.dbServicesActive} active · {healthQ.data.dbServicesPending} pending
                  </div>
                </div>
                <div className="rounded border border-gray-200 p-2">
                  <div className="text-[11px] text-gray-500">DB with vapi_id</div>
                  <div className="text-lg font-semibold text-gray-900" data-testid="health-db-with-vapi-id">
                    {healthQ.data.dbServicesWithAssistantId}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    settings rows: {healthQ.data.dbAssistantSettingsRows}
                  </div>
                </div>
                <div className="rounded border border-gray-200 p-2">
                  <div className="text-[11px] text-gray-500">Live Vapi (tradeline)</div>
                  <div className="text-lg font-semibold text-gray-900" data-testid="health-vapi-tradeline">
                    {healthQ.data.vapiReachable ? healthQ.data.vapiTradelineAssistants : "—"}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    of {healthQ.data.vapiReachable ? healthQ.data.vapiAssistantsTotal : "?"} total
                  </div>
                </div>
                <div
                  className={`rounded border p-2 ${
                    healthQ.data.driftCount > 0
                      ? "border-amber-300 bg-amber-50"
                      : "border-gray-200"
                  }`}
                >
                  <div className="text-[11px] text-gray-500">Drift</div>
                  <div
                    className={`text-lg font-semibold ${
                      healthQ.data.driftCount > 0 ? "text-amber-700" : "text-gray-900"
                    }`}
                    data-testid="health-drift-count"
                  >
                    {healthQ.data.vapiReachable ? healthQ.data.driftCount : "—"}
                  </div>
                  <div className="text-[11px] text-gray-500">DB ids missing live</div>
                </div>
              </div>

              {!healthQ.data.vapiReachable && (
                <div className="text-xs text-red-700" data-testid="health-vapi-unreachable">
                  Vapi unreachable: {healthQ.data.vapiError ?? "unknown error"}
                </div>
              )}

              {healthQ.data.driftCount > 0 && (
                <div className="text-xs text-amber-800">
                  Drift IDs: <code className="font-mono">{healthQ.data.driftIds.join(", ")}</code>
                </div>
              )}

              {healthQ.data.failures.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-700 hover:text-gray-900">
                    {healthQ.data.failures.length} failed build{healthQ.data.failures.length === 1 ? "" : "s"} (click to expand)
                  </summary>
                  <ul className="mt-2 space-y-1 text-gray-600">
                    {healthQ.data.failures.map((f) => (
                      <li key={f.id} className="font-mono">
                        service #{f.id} · {f.status} · {f.lastBuildError}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Card>

        {/* Usage chart */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-900">Voice usage this month</h2>
              <p className="text-xs text-gray-500">Minutes consumed per voice, rolled up across all clients.</p>
            </div>
            <Badge variant="secondary">{totalMinutes.toLocaleString()} total min</Badge>
          </div>
          <div className="space-y-2">
            {(usageQ.data?.usage ?? []).length === 0 && (
              <div className="text-sm text-gray-500">No usage recorded yet.</div>
            )}
            {(usageQ.data?.usage ?? []).map((row) => {
              const voice = row.voice_id ? voiceMap.get(row.voice_id) : null;
              const pct = totalMinutes > 0 ? Math.round((Number(row.minutes_used) / totalMinutes) * 100) : 0;
              return (
                <div key={row.voice_id ?? "unassigned"} className="flex items-center gap-3">
                  <div className="w-44 text-sm font-medium text-gray-800 truncate">
                    {voice?.display_name ?? row.voice_id ?? "Unassigned"}
                  </div>
                  <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                    <div className="h-2 bg-brand-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-32 text-right text-xs text-gray-600">
                    {Number(row.minutes_used).toLocaleString()} min · {row.client_count} client{Number(row.client_count) !== 1 ? "s" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Voice catalog */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Voice catalog</h2>
          {voices.isError && (
            <Card className="p-4 bg-red-50 border-red-200 mb-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-800">Couldn't load voice catalog</p>
                  <p className="text-xs text-red-700 mt-1">
                    {(voices.error as Error | null)?.message ?? "The server didn't respond as expected."}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => voices.refetch()}
                    disabled={voices.isFetching}
                    data-testid="button-retry-voices"
                  >
                    <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${voices.isFetching ? "animate-spin" : ""}`} />
                    Retry
                  </Button>
                </div>
              </div>
            </Card>
          )}
          {voices.isLoading && <div className="text-sm text-gray-500">Loading voices…</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(voices.data?.voices ?? []).map((v) => (
              <Card key={v.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">{v.display_name}</div>
                    <div className="text-xs text-gray-500">{v.id} · {v.elevenlabs_voice_id}</div>
                  </div>
                  <Badge variant={v.status === "active" ? "default" : "secondary"}>{v.status}</Badge>
                </div>
                {v.description && <div className="text-sm text-gray-700">{v.description}</div>}
                <div className="flex flex-wrap gap-1">
                  {v.gender && <Badge variant="outline">{v.gender}</Badge>}
                  {v.accent && <Badge variant="outline">{v.accent}</Badge>}
                  {v.tags?.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePreview(v.id)}
                    disabled={loadingId === v.id}
                    className="text-brand-blue-600 border-brand-blue-200 hover:bg-brand-blue-50"
                    aria-label={playingId === v.id ? `Stop preview of ${v.display_name}` : `Play preview of ${v.display_name}`}
                    data-testid={`button-preview-voice-${v.id}`}
                  >
                    {loadingId === v.id ? (
                      <Loader2 className="w-[18px] h-[18px] mr-1 animate-spin" />
                    ) : playingId === v.id ? (
                      <Pause className="w-[18px] h-[18px] mr-1" />
                    ) : (
                      <Play className="w-[18px] h-[18px] mr-1" />
                    )}
                    {playingId === v.id ? "Stop" : "Play"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(v); setCreating(false); }} data-testid={`button-edit-voice-${v.id}`}>
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  {v.status === "active" && (
                    <Button size="sm" variant="ghost" onClick={() => setPendingArchive(v)}>
                      <Archive className="w-3 h-3 mr-1" /> Archive
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Per-client budget */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Per-client budgets &amp; voice overrides</h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Client</th>
                  <th className="text-left px-3 py-2">Trade</th>
                  <th className="text-left px-3 py-2">Voice</th>
                  <th className="text-right px-3 py-2">Used / Budget (min)</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(clientsQ.data?.clients ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-500">
                      <Mic2 className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700 mb-0.5">No TradeLine clients yet</p>
                      <p className="text-xs text-gray-500">Per-client voice overrides and call-minute budgets appear here once clients onboard to TradeLine.</p>
                    </td>
                  </tr>
                ) : (
                  (clientsQ.data?.clients ?? []).map((c) => (
                    <ClientRow
                      key={c.client_id}
                      row={c}
                      voices={voices.data?.voices ?? []}
                      onSave={(body) => saveClient.mutate({ clientId: c.client_id, body })}
                      saving={saveClient.isPending}
                    />
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Edit / create dialog */}
        <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setCreating(false); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{creating ? "Add voice" : `Edit ${editing?.display_name ?? "voice"}`}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                {creating && (
                  <Field label="ID (slug)">
                    <Input value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} placeholder="e.g. sarah_warm" />
                  </Field>
                )}
                <Field label="ElevenLabs voice ID">
                  <Input value={editing.elevenlabs_voice_id} onChange={(e) => setEditing({ ...editing, elevenlabs_voice_id: e.target.value })} />
                </Field>
                <Field label="Display name">
                  <Input value={editing.display_name} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} />
                </Field>
                <Field label="Description">
                  <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Gender">
                    <Select value={editing.gender ?? ""} onValueChange={(v) => setEditing({ ...editing, gender: v || null })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Accent">
                    <Input value={editing.accent ?? ""} onChange={(e) => setEditing({ ...editing, accent: e.target.value })} placeholder="us-en" />
                  </Field>
                </div>
                <Field label="Tags (comma separated)">
                  <Input
                    value={editing.tags?.join(", ") ?? ""}
                    onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  />
                </Field>
                <Field label="Sample audio URL">
                  <Input value={editing.sample_audio_url ?? ""} onChange={(e) => setEditing({ ...editing, sample_audio_url: e.target.value })} placeholder="https://…" />
                </Field>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setEditing(null); setCreating(false); }}><X className="w-4 h-4 mr-1" /> Cancel</Button>
              <Button onClick={() => editing && saveVoice.mutate(editing)} disabled={saveVoice.isPending}>
                <Save className="w-4 h-4 mr-1" /> Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Shared archive-voice confirmation. */}
        <ConfirmDialog
          open={pendingArchive !== null}
          onOpenChange={(o) => { if (!o) setPendingArchive(null); }}
          title={pendingArchive ? `Archive "${pendingArchive.display_name}"?` : "Archive voice?"}
          description="Clients currently using this voice will fall back to the default voice."
          confirmLabel="Archive"
          destructive
          pending={archiveVoice.isPending}
          onConfirm={() => {
            if (pendingArchive) {
              archiveVoice.mutate(pendingArchive.id);
              setPendingArchive(null);
            }
          }}
        />
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700 font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ClientRow({
  row,
  voices,
  onSave,
  saving,
}: {
  row: ClientSetting;
  voices: Voice[];
  onSave: (body: Partial<ClientSetting>) => void;
  saving: boolean;
}) {
  const [voiceId, setVoiceId] = useState<string>(row.voice_id ?? "");
  const [budget, setBudget] = useState<string>(row.monthly_minute_budget?.toString() ?? "");
  const dirty = voiceId !== (row.voice_id ?? "") || budget !== (row.monthly_minute_budget?.toString() ?? "");
  return (
    <tr className="border-t border-gray-100">
      <td className="px-3 py-2 text-gray-900 font-medium">{row.business_name}</td>
      <td className="px-3 py-2 text-gray-600">{row.trade_type ?? "—"}</td>
      <td className="px-3 py-2">
        <Select value={voiceId} onValueChange={setVoiceId}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Default" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Default</SelectItem>
            {voices.filter((v) => v.status === "active").map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="text-gray-600">{row.monthly_minute_used}</span>
          <span className="text-gray-400">/</span>
          <Input
            className="w-24 text-right"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="∞"
          />
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() => onSave({
            voice_id: voiceId || null,
            monthly_minute_budget: budget.trim() === "" ? null : Number.parseInt(budget, 10),
          })}
        >
          Save
        </Button>
      </td>
    </tr>
  );
}
