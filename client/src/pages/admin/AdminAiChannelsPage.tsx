/**
 * W-BA-1 — Admin dashboard for per-channel AI emergency kill switches.
 *
 * One toggle per customer-facing channel (email / SMS / voice / chat). When
 * a channel is OFF, the handler skips the AI and falls back to a safe reply
 * (auto-reply for email/SMS, voicemail for voice, offline notice for chat).
 *
 * Backed by:
 *   GET  /api/admin/ai-channel-gates
 *   POST /api/admin/ai-channel-gates/:channel/toggle           { enabled, notes? }
 *   POST /api/admin/ai-channel-gates/emergency-disable-all     { notes? }
 *
 * Defaults: every channel ships OFF. The founder explicitly enables each one
 * when AI autonomy is ready to go live on that channel.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Loader2, ShieldOff, Mail, MessageSquare, Phone, Radio } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface GateRow {
  channel: string;
  enabled: boolean;
  emergency_disabled_by: number | null;
  emergency_disabled_at: string | null;
  notes: string | null;
  updated_at: string | null;
  updated_by: number | null;
  created_at: string | null;
}

const CHANNEL_META: Record<string, { label: string; icon: typeof Mail; description: string }> = {
  email: { label: "Email", icon: Mail, description: "Inbound support emails — AI triage + reply." },
  sms: { label: "SMS", icon: MessageSquare, description: "Inbound SMS messages — AI auto-reply." },
  voice: { label: "Voice", icon: Phone, description: "Vapi-driven phone calls — AI conversation handler." },
  chat: { label: "Chat", icon: Radio, description: "Embeddable TradeLine chat widget on customer sites." },
};

function formatRelative(ts: string | null): string {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function AdminAiChannelsPage() {
  usePageTitle("AI Channels");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ channels: string[]; gates: GateRow[] }>({
    queryKey: ["/api/admin/ai-channel-gates"],
  });

  const toggle = useMutation({
    mutationFn: async ({ channel, enabled }: { channel: string; enabled: boolean }) =>
      apiRequest("POST", `/api/admin/ai-channel-gates/${channel}/toggle`, { enabled }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai-channel-gates"] });
      toast({ title: `${CHANNEL_META[vars.channel]?.label || vars.channel} ${vars.enabled ? "enabled" : "disabled"}` });
    },
    onError: (e: any) =>
      toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const emergency = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/admin/ai-channel-gates/emergency-disable-all`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai-channel-gates"] });
      toast({ title: "Emergency: AI disabled on every channel" });
    },
    onError: (e: any) =>
      toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const allOff = useMemo(
    () => (data?.gates || []).length > 0 && (data?.gates || []).every((g) => !g.enabled),
    [data],
  );

  /** Drives the shared <ConfirmDialog> for the "disable all" emergency. */
  const [confirmEmergency, setConfirmEmergency] = useState(false);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">AI Channel Kill Switches</h1>
            <p className="text-sm text-muted-foreground">
              Per-channel emergency cut-off. Defaults are OFF — flip a channel on only when
              you're ready for the AI to respond live on it.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => setConfirmEmergency(true)}
            disabled={emergency.isPending || allOff}
            data-testid="ai-channels-emergency-disable"
          >
            {emergency.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ShieldOff className="w-4 h-4 mr-2" />
            )}
            Emergency disable all
          </Button>
        </div>

        <Card className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>AI on</TableHead>
                  <TableHead>Last change</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.gates || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      <Radio className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground mb-0.5">No AI channels configured</p>
                      <p className="text-xs text-muted-foreground">Channel gates appear here once the AI channels migration has run.</p>
                    </TableCell>
                  </TableRow>
                ) : (data?.gates || []).map((row) => {
                  const meta = CHANNEL_META[row.channel] || {
                    label: row.channel,
                    icon: Radio,
                    description: "",
                  };
                  const Icon = meta.icon;
                  return (
                    <TableRow key={row.channel} data-testid={`ai-channel-row-${row.channel}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div>{meta.label}</div>
                            <div className="text-xs text-muted-foreground">{meta.description}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={row.enabled ? "default" : "destructive"}
                          className={row.enabled ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                          {row.enabled ? "ON" : "OFF"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(v) =>
                            toggle.mutate({ channel: row.channel, enabled: !!v })
                          }
                          disabled={toggle.isPending}
                          data-testid={`ai-channel-toggle-${row.channel}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelative(row.updated_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.updated_by ? `user #${row.updated_by}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-medium mb-1">How it works</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  Each channel handler calls{" "}
                  <code className="px-1 mx-1 bg-amber-100 rounded">aiChannelGateOn(channel)</code>{" "}
                  BEFORE invoking the AI.
                </li>
                <li>
                  When OFF, the handler falls back to a safe reply: email/SMS auto-reply,
                  voice routes to voicemail, chat shows an offline notice.
                </li>
                <li>
                  Failures fail CLOSED — if the gate can't be read, the channel is treated as
                  OFF. This is the emergency safety net, not a normal config.
                </li>
                <li>
                  Every toggle is recorded in the admin audit log.
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      {/* Shared emergency-disable confirmation. */}
      <ConfirmDialog
        open={confirmEmergency}
        onOpenChange={setConfirmEmergency}
        title="Disable AI on every channel?"
        description="Customers will immediately get the safe fallback (auto-reply for email/SMS, voicemail for voice, offline notice for chat) until you re-enable each channel manually."
        confirmLabel="Disable all"
        destructive
        pending={emergency.isPending}
        onConfirm={() => {
          setConfirmEmergency(false);
          emergency.mutate();
        }}
      />
    </AdminLayout>
  );
}
