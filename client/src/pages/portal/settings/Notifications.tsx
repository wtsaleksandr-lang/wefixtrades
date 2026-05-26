/**
 * /portal/settings/notifications — Wave 32 universal notification surface.
 *
 * Single page consolidating the 5 per-product NotificationSettings pages
 * shipped in Waves 27-31, plus a new Web Push channel. Customers manage
 * opt-ins for every notification-eligible event across all 9 products
 * here.
 *
 * Layout (top-down):
 *   1. Channels card row — Email (always on), SMS (gated by sms_opt_in
 *      with a link to billing), Web Push (gated by service-worker
 *      subscription — click-to-enable triggers the subscribe flow).
 *   2. Filter row — search box + product filter.
 *   3. Quiet-hours card — optional silent window honored by the
 *      dispatcher for non-critical events.
 *   4. Per-product collapsible sections — each event row has a per-
 *      channel switch matrix.
 *
 * Anti-patterns enforced:
 *   - Never show "Web Push" as enabled when the browser subscription
 *     doesn't exist.
 *   - Never auto-subscribe to web push — explicit user gesture required.
 *   - SMS column stays read-only with a callout when sms_opt_in is off.
 *
 * Backwards-compat: existing /portal/<product>/notifications pages
 * redirect here with ?filter=<product>.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  Bell,
  BellRing,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  Search,
  Smartphone,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from "@/lib/notifications/webPushClient";

type Channel = "email" | "sms" | "web_push";
type ChannelMap = Record<Channel, boolean>;

interface RegistryEvent {
  key: string;
  product: string;
  label: string;
  description: string;
  severity: "info" | "warning" | "critical";
  defaultChannels: Channel[];
  dedupePerDay?: boolean;
}

interface ProductDescriptor {
  key: string;
  label: string;
}

interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

interface SettingsResponse {
  previewMode?: boolean;
  events: RegistryEvent[];
  products: ProductDescriptor[];
  preferences: Record<string, Record<string, ChannelMap>>;
  smsGloballyAllowed: boolean;
  webPushSubscribed: boolean;
  vapidPublicKey: string | null;
  quietHours: QuietHours;
}

function severityColor(sev: RegistryEvent["severity"]): string {
  switch (sev) {
    case "critical":
      return "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]";
    case "warning":
      return "bg-[hsl(var(--chart-4)/0.12)] text-[hsl(var(--chart-4))]";
    default:
      return "bg-[hsl(var(--muted))] text-muted-foreground";
  }
}

export default function UniversalNotificationsPage() {
  usePageTitle("Notifications");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();

  // Parse optional ?filter=<product> for redirected per-product links.
  const filterFromUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("filter") ?? "";
  }, [location]);

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/portal/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/portal/notifications", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load notification settings");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<
    Record<string, Record<string, ChannelMap>> | null
  >(null);
  const [quietDraft, setQuietDraft] = useState<QuietHours | null>(null);
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data?.preferences && !draft) setDraft(data.preferences);
    if (data?.quietHours && !quietDraft) setQuietDraft(data.quietHours);
  }, [data?.preferences, data?.quietHours, draft, quietDraft]);

  // Auto-apply ?filter=<product> from URL on first load.
  useEffect(() => {
    if (filterFromUrl && !productFilter) {
      setProductFilter(filterFromUrl);
      setExpanded((prev) => ({ ...prev, [filterFromUrl]: true }));
    }
  }, [filterFromUrl, productFilter]);

  const save = useMutation({
    mutationFn: async (next: Record<string, Record<string, ChannelMap>>) => {
      return apiRequest("POST", "/api/portal/notifications", {
        preferences: next,
      });
    },
    onSuccess: () => {
      toast({ title: "Notifications saved" });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/notifications"],
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

  const saveQuiet = useMutation({
    mutationFn: async (next: QuietHours) => {
      return apiRequest("POST", "/api/portal/notifications/quiet-hours", next);
    },
    onSuccess: () => {
      toast({ title: "Quiet hours saved" });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/notifications"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Quiet hours failed to save",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  const togglePush = useMutation({
    mutationFn: async () => {
      if (!data?.vapidPublicKey) {
        throw new Error(
          "Web push isn't configured yet. The admin team needs to set VAPID keys.",
        );
      }
      if (data.webPushSubscribed) {
        await unsubscribeFromWebPush();
      } else {
        await subscribeToWebPush(data.vapidPublicKey);
      }
    },
    onSuccess: () => {
      toast({
        title: data?.webPushSubscribed
          ? "Browser notifications disabled"
          : "Browser notifications enabled",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/notifications"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Browser notification toggle failed",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  const dirty = useMemo(() => {
    if (!draft || !data?.preferences) return false;
    return JSON.stringify(draft) !== JSON.stringify(data.preferences);
  }, [draft, data?.preferences]);

  const quietDirty = useMemo(() => {
    if (!quietDraft || !data?.quietHours) return false;
    return JSON.stringify(quietDraft) !== JSON.stringify(data.quietHours);
  }, [quietDraft, data?.quietHours]);

  const filteredEventsByProduct = useMemo(() => {
    if (!data?.events) return new Map<string, RegistryEvent[]>();
    const search_lower = search.trim().toLowerCase();
    const byProduct = new Map<string, RegistryEvent[]>();
    for (const ev of data.events) {
      if (productFilter && ev.product !== productFilter) continue;
      if (
        search_lower &&
        !ev.label.toLowerCase().includes(search_lower) &&
        !ev.description.toLowerCase().includes(search_lower) &&
        !ev.key.toLowerCase().includes(search_lower)
      ) {
        continue;
      }
      if (!byProduct.has(ev.product)) byProduct.set(ev.product, []);
      byProduct.get(ev.product)!.push(ev);
    }
    return byProduct;
  }, [data?.events, search, productFilter]);

  if (isLoading || !draft || !data || !quietDraft) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center p-12">
          <Loader2
            className="h-6 w-6 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </PortalLayout>
    );
  }

  const smsAllowed = data.smsGloballyAllowed;
  const pushSubscribed = data.webPushSubscribed;
  const vapidReady = !!data.vapidPublicKey;

  function setChannel(
    product: string,
    eventKey: string,
    channel: Channel,
    value: boolean,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      next[product] = { ...next[product] };
      next[product][eventKey] = { ...next[product][eventKey], [channel]: value };
      return next;
    });
  }

  function toggleExpand(product: string) {
    setExpanded((prev) => ({ ...prev, [product]: !prev[product] }));
  }

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
            <Bell className="h-5 w-5" aria-hidden="true" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick which alerts reach you across all WeFixTrades products, and on
            which channel.
          </p>
        </div>

        {/* Channel cards */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Card className="flex flex-col gap-1 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AtSign className="h-4 w-4" aria-hidden="true" />
                Email
              </div>
              <span className="rounded bg-[hsl(var(--chart-2)/0.12)] px-1.5 py-0.5 text-[10px] uppercase text-[hsl(var(--chart-2))]">
                On
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Always available — uses the email on your account.
            </p>
          </Card>

          <Card className="flex flex-col gap-1 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                SMS
              </div>
              <span
                className={
                  smsAllowed
                    ? "rounded bg-[hsl(var(--chart-2)/0.12)] px-1.5 py-0.5 text-[10px] uppercase text-[hsl(var(--chart-2))]"
                    : "rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground"
                }
              >
                {smsAllowed ? "On" : "Off"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {smsAllowed ? (
                "Sent via your registered mobile number."
              ) : (
                <>
                  Enable SMS in{" "}
                  <Link
                    href="/portal/settings"
                    className="underline text-[hsl(var(--chart-1))]"
                  >
                    account settings
                  </Link>
                  {" "}to opt in.
                </>
              )}
            </p>
          </Card>

          <Card className="flex flex-col gap-1 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BellRing className="h-4 w-4" aria-hidden="true" />
                Web push
              </div>
              <Button
                size="sm"
                variant={pushSubscribed ? "ghost" : "default"}
                onClick={() => togglePush.mutate()}
                disabled={togglePush.isPending || !vapidReady}
                data-testid="universal-notif-push-toggle"
              >
                {togglePush.isPending ? (
                  <Loader2
                    className="h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                ) : pushSubscribed ? (
                  "Disable"
                ) : (
                  "Enable"
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {!vapidReady
                ? "Browser notifications aren't configured yet."
                : pushSubscribed
                ? "Browser notifications are enabled in this browser."
                : "Click Enable to receive in-browser alerts on this device."}
            </p>
          </Card>
        </div>

        {/* Quiet hours */}
        <Card className="flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              Quiet hours
              <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                Skip non-critical alerts during this window
              </span>
            </div>
            <Switch
              checked={quietDraft.enabled}
              onCheckedChange={(checked) =>
                setQuietDraft((q) => (q ? { ...q, enabled: checked } : q))
              }
              data-testid="quiet-hours-enable"
            />
          </div>
          {quietDraft.enabled && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex flex-col text-[11px] text-muted-foreground">
                Start
                <Input
                  type="time"
                  value={quietDraft.start}
                  onChange={(e) =>
                    setQuietDraft((q) =>
                      q ? { ...q, start: e.target.value } : q,
                    )
                  }
                  className="h-8 w-28 text-xs"
                  data-testid="quiet-hours-start"
                />
              </label>
              <label className="flex flex-col text-[11px] text-muted-foreground">
                End
                <Input
                  type="time"
                  value={quietDraft.end}
                  onChange={(e) =>
                    setQuietDraft((q) =>
                      q ? { ...q, end: e.target.value } : q,
                    )
                  }
                  className="h-8 w-28 text-xs"
                  data-testid="quiet-hours-end"
                />
              </label>
              <label className="flex flex-col text-[11px] text-muted-foreground">
                Timezone
                <Input
                  type="text"
                  value={quietDraft.timezone}
                  onChange={(e) =>
                    setQuietDraft((q) =>
                      q ? { ...q, timezone: e.target.value } : q,
                    )
                  }
                  className="h-8 w-48 text-xs"
                  data-testid="quiet-hours-tz"
                  placeholder="America/New_York"
                />
              </label>
              <Button
                size="sm"
                onClick={() => saveQuiet.mutate(quietDraft)}
                disabled={!quietDirty || saveQuiet.isPending}
                data-testid="quiet-hours-save"
              >
                {saveQuiet.isPending ? (
                  <Loader2
                    className="mr-1 h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save className="mr-1 h-3 w-3" aria-hidden="true" />
                )}
                Save window
              </Button>
            </div>
          )}
        </Card>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search events"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
              data-testid="universal-notif-search"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setProductFilter("")}
              className={
                productFilter === ""
                  ? "rounded border border-[hsl(var(--chart-1))] px-2 py-1 text-[11px] text-foreground"
                  : "rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              }
              data-testid="filter-all"
            >
              All
            </button>
            {data.products.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setProductFilter(p.key)}
                className={
                  productFilter === p.key
                    ? "rounded border border-[hsl(var(--chart-1))] px-2 py-1 text-[11px] text-foreground"
                    : "rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                }
                data-testid={`filter-${p.key}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Per-product sections */}
        <div className="flex flex-col gap-2">
          {data.products.map((p) => {
            const events = filteredEventsByProduct.get(p.key);
            if (!events || events.length === 0) {
              // Hide a product entirely if it has no matching events (better
              // than rendering an empty header).
              return null;
            }
            const open = expanded[p.key] ?? !!productFilter;
            return (
              <Card key={p.key} className="flex flex-col p-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(p.key)}
                  className="flex items-center justify-between border-b border-border px-3 py-2 text-left hover:bg-[hsl(var(--muted)/0.4)]"
                  data-testid={`product-toggle-${p.key}`}
                >
                  <div className="flex items-center gap-2">
                    {open ? (
                      <ChevronDown
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {p.label}
                    </span>
                    <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {events.length} event{events.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>
                {open && (
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Event</th>
                        <th className="px-2 py-2">
                          <AtSign
                            className="inline h-3 w-3"
                            aria-hidden="true"
                          />{" "}
                          Email
                        </th>
                        <th className="px-2 py-2">
                          <Smartphone
                            className="inline h-3 w-3"
                            aria-hidden="true"
                          />{" "}
                          SMS
                        </th>
                        <th className="px-2 py-2">
                          <BellRing
                            className="inline h-3 w-3"
                            aria-hidden="true"
                          />{" "}
                          Push
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((ev) => {
                        const current =
                          draft[p.key]?.[ev.key] ?? {
                            email: false,
                            sms: false,
                            web_push: false,
                          };
                        return (
                          <tr
                            key={ev.key}
                            className="border-t border-border align-top"
                          >
                            <td className="px-3 py-2">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-foreground">
                                    {ev.label}
                                  </span>
                                  <span
                                    className={
                                      "rounded px-1.5 py-0.5 text-[9px] uppercase " +
                                      severityColor(ev.severity)
                                    }
                                  >
                                    {ev.severity}
                                  </span>
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                  {ev.description}
                                </span>
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <Switch
                                checked={current.email}
                                onCheckedChange={(checked) =>
                                  setChannel(p.key, ev.key, "email", checked)
                                }
                                data-testid={`switch-${p.key}-${ev.key}-email`}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Switch
                                checked={smsAllowed && current.sms}
                                disabled={!smsAllowed}
                                onCheckedChange={(checked) =>
                                  setChannel(p.key, ev.key, "sms", checked)
                                }
                                data-testid={`switch-${p.key}-${ev.key}-sms`}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Switch
                                checked={pushSubscribed && current.web_push}
                                disabled={!pushSubscribed}
                                onCheckedChange={(checked) =>
                                  setChannel(
                                    p.key,
                                    ev.key,
                                    "web_push",
                                    checked,
                                  )
                                }
                                data-testid={`switch-${p.key}-${ev.key}-push`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => data.preferences && setDraft(data.preferences)}
            disabled={!dirty || save.isPending}
            data-testid="universal-notif-reset"
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() => draft && save.mutate(draft)}
            disabled={!dirty || save.isPending}
            data-testid="universal-notif-save"
          >
            {save.isPending ? (
              <Loader2
                className="mr-1 h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Save changes
          </Button>
        </div>

        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </PortalLayout>
  );
}
