/**
 * /portal/mapguard/alert-settings — customer notification preferences.
 *
 * Wave 27. The customer ticks which MapGuard events to be notified about
 * and through which channel. Backend route enforces SMS opt-in
 * compliance (PR #770) — if `sms_opt_in` is not set at the client level
 * we render the SMS column read-only with a link to billing settings.
 *
 * Anti-patterns:
 *   - Don't auto-send anything without explicit channel opt-in.
 *   - Don't pretend SMS is available when the master flag is off.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2, Save, Smartphone, AtSign } from "lucide-react";
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
  | "rank_drop_top3"
  | "citation_nap_mismatch"
  | "new_negative_review"
  | "competitor_outranked";
type Settings = Record<EventKey, ChannelMap>;

interface SettingsResponse {
  previewMode?: boolean;
  settings: Settings;
  eventMeta: Record<EventKey, { label: string; description: string }>;
  smsGloballyAllowed: boolean;
}

const EVENT_ORDER: EventKey[] = [
  "rank_drop_top3",
  "citation_nap_mismatch",
  "new_negative_review",
  "competitor_outranked",
];

export default function MapGuardAlertSettings() {
  usePageTitle("MapGuard alert settings");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/portal/mapguard/notification-settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/mapguard/notification-settings", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (data?.settings && !draft) {
      setDraft(data.settings);
    }
  }, [data?.settings, draft]);

  const save = useMutation({
    mutationFn: async (next: Settings) => {
      const res = await apiRequest(
        "POST",
        "/api/portal/mapguard/notification-settings",
        { settings: next },
      );
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/mapguard/notification-settings"],
      });
      toast({
        title: "Notification preferences saved",
        description: "Future alerts will follow your new settings.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to save",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const dirty = useMemo(() => {
    if (!draft || !data?.settings) return false;
    return JSON.stringify(draft) !== JSON.stringify(data.settings);
  }, [draft, data?.settings]);

  const update = (event: EventKey, channel: "email" | "sms", value: boolean) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [event]: { ...prev[event], [channel]: value } };
    });
  };

  const smsAllowed = data?.smsGloballyAllowed ?? false;

  return (
    <PortalLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <div
            data-theme="light"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-blue"
          >
            <Bell className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              MapGuard alerts
            </h1>
            <p className="text-sm text-muted-foreground">
              Pick which events alert you, and where they go.
            </p>
          </div>
        </div>

        {!smsAllowed && (
          <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              SMS alerts are currently disabled at the account level. Enable
              SMS in{" "}
              <Link
                href="/portal/settings"
                className="font-medium underline-offset-2 hover:underline"
              >
                account settings
              </Link>{" "}
              to receive rank-change pings on your phone.
            </p>
          </Card>
        )}

        {isLoading || !draft ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Loading notification preferences…
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <AtSign className="h-3 w-3" /> Email
                    </span>
                  </th>
                  <th className="px-4 py-2 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Smartphone className="h-3 w-3" /> SMS
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {EVENT_ORDER.map((key) => {
                  const meta = data!.eventMeta[key];
                  const row = draft[key];
                  return (
                    <tr
                      key={key}
                      className="border-t border-border"
                      data-testid={`alert-row-${key}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {meta.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {meta.description}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={row.email}
                          onCheckedChange={(v) => update(key, "email", v)}
                          data-testid={`alert-toggle-${key}-email`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={row.sms && smsAllowed}
                          disabled={!smsAllowed}
                          onCheckedChange={(v) => update(key, "sms", v)}
                          data-testid={`alert-toggle-${key}-sms`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/portal/mapguard/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back to dashboard
          </Link>
          <Button
            disabled={!dirty || save.isPending}
            onClick={() => draft && save.mutate(draft)}
            data-testid="alert-settings-save"
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save preferences
          </Button>
        </div>
      </div>
    </PortalLayout>
  );
}
