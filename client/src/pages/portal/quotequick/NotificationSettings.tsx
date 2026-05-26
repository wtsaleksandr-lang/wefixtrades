/**
 * /portal/quotequick/notifications — Wave 29.
 *
 * Customer notification preferences for QuoteQuick events. Event ×
 * channel matrix persisted in clients.metadata.quotequick_notifications.
 *
 * SMS column is read-only with a callout when the master sms_opt_in flag
 * is off (same pattern as Wave 27 MapGuard + Wave 28 ReputationShield).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AtSign, Bell, Loader2, Save, Smartphone } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";

type ChannelMap = { email: boolean; sms: boolean };
type EventKey =
  | "quote_viewed"
  | "quote_started"
  | "quote_completed"
  | "deposit_paid"
  | "quote_expired";
type Settings = Record<EventKey, ChannelMap>;

interface SettingsResponse {
  previewMode?: boolean;
  settings: Settings;
  eventMeta: Record<EventKey, { label: string; description: string }>;
  smsGloballyAllowed: boolean;
}

const EVENT_ORDER: EventKey[] = [
  "quote_viewed",
  "quote_started",
  "quote_completed",
  "deposit_paid",
  "quote_expired",
];

export default function QuoteQuickNotificationSettings() {
  usePageTitle("QuoteQuick notifications");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/portal/quotequick/notification-settings"],
    queryFn: async () => {
      const res = await fetch(
        "/api/portal/quotequick/notification-settings",
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (data?.settings && !draft) setDraft(data.settings);
  }, [data?.settings, draft]);

  const save = useMutation({
    mutationFn: async (next: Settings) => {
      return apiRequest(
        "POST",
        "/api/portal/quotequick/notification-settings",
        { settings: next },
      );
    },
    onSuccess: () => {
      toast({ title: "Notification settings saved" });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/quotequick/notification-settings"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  const smsAllowed = data?.smsGloballyAllowed ?? false;

  const dirty = useMemo(() => {
    if (!draft || !data?.settings) return false;
    return JSON.stringify(draft) !== JSON.stringify(data.settings);
  }, [draft, data?.settings]);

  if (isLoading || !draft) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
            <Bell className="h-5 w-5" aria-hidden="true" />
            QuoteQuick notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick which events alert you, and on which channels.
          </p>
        </div>

        {!smsAllowed && (
          <Card className="border-[hsl(var(--chart-4)/0.4)] bg-[hsl(var(--chart-4)/0.06)] p-3">
            <p className="text-xs text-foreground">
              <Smartphone className="mr-1 inline h-3 w-3" aria-hidden="true" />
              SMS notifications are disabled. Enable SMS in{" "}
              <Link
                href="/portal/settings"
                className="font-medium text-[hsl(var(--chart-1))] underline"
              >
                account settings
              </Link>{" "}
              to opt in.
            </p>
          </Card>
        )}

        <Card className="flex flex-col gap-1 p-2">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">
                  <AtSign className="inline h-3 w-3" aria-hidden="true" /> Email
                </th>
                <th className="px-2 py-2">
                  <Smartphone className="inline h-3 w-3" aria-hidden="true" /> SMS
                </th>
              </tr>
            </thead>
            <tbody>
              {EVENT_ORDER.map((k) => {
                const meta = data?.eventMeta[k];
                return (
                  <tr key={k} className="border-t border-border">
                    <td className="px-2 py-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {meta?.label ?? k}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {meta?.description}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Switch
                        checked={draft[k].email}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            [k]: { ...draft[k], email: checked },
                          })
                        }
                        data-testid={`switch-${k}-email`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Switch
                        checked={smsAllowed && draft[k].sms}
                        disabled={!smsAllowed}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            [k]: { ...draft[k], sms: checked },
                          })
                        }
                        data-testid={`switch-${k}-sms`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => data?.settings && setDraft(data.settings)}
            disabled={!dirty || save.isPending}
            data-testid="notif-reset"
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate(draft)}
            disabled={!dirty || save.isPending}
            data-testid="notif-save"
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Save changes
          </Button>
        </div>

        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/quotequick/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </PortalLayout>
  );
}
