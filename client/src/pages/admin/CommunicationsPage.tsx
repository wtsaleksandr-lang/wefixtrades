/**
 * Wave R-pre W-TWILIO — Admin Communications Panel.
 *
 * Two top-level tabs:
 *   • SMS   — conversation list + thread view + new message
 *   • Phone — dialer pad + outbound call (Twilio Voice JS SDK best-effort)
 *               + recent calls list
 *
 * All data is read straight from the Twilio API via the
 * /api/admin/twilio/* endpoints — no DB cache in v1.
 *
 * The page polls the messages endpoint every 15s while open so new
 * inbound texts appear without manual refresh. No websocket / SSE.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Device, Call } from "@twilio/voice-sdk";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FloatField from "@/components/wizard/elfsight/FloatField";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Phone,
  Plus,
  Send,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneOff,
  AlertTriangle,
  RefreshCw,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── shared types (mirror server normalize) ─────────────────────── */

interface TwilioMessage {
  sid: string;
  direction: "inbound" | "outbound" | "unknown";
  from: string | null;
  to: string | null;
  body: string;
  date_sent: string | null;
  status: string | null;
  thread_contact: string | null;
}

interface TwilioCall {
  sid: string;
  direction: string;
  from: string | null;
  to: string | null;
  status: string;
  duration_sec: number | null;
  start_time: string | null;
  end_time: string | null;
  price: string | null;
}

interface ConfigResp {
  smsReady: boolean;
  voiceReady: boolean;
  fromNumber: string | null;
  missing: { sms: string[]; voice: string[] };
}

/* ─── helpers ────────────────────────────────────────────────────── */

function formatPhone(p: string | null | undefined): string {
  if (!p) return "(unknown)";
  // basic +1XXXXXXXXXX prettify
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return p;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = (now.getTime() - d.getTime()) / 86400000;
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" }) +
      " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function normalizeContact(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

/* Group raw messages by thread_contact, return most-recent first. */
function groupThreads(messages: TwilioMessage[]) {
  const map = new Map<string, { contact: string; messages: TwilioMessage[]; lastAt: number; lastBody: string; lastDirection: string }>();
  for (const m of messages) {
    if (!m.thread_contact) continue;
    const key = normalizeContact(m.thread_contact);
    if (!key) continue;
    const ts = m.date_sent ? Date.parse(m.date_sent) : 0;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        contact: m.thread_contact,
        messages: [m],
        lastAt: ts,
        lastBody: m.body,
        lastDirection: m.direction,
      });
    } else {
      existing.messages.push(m);
      if (ts > existing.lastAt) {
        existing.lastAt = ts;
        existing.lastBody = m.body;
        existing.lastDirection = m.direction;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
}

/* ─── component ──────────────────────────────────────────────────── */

export default function CommunicationsPage() {
  usePageTitle("Communications");

  const [tab, setTab] = useState<"sms" | "phone">("sms");
  const [activeContact, setActiveContact] = useState<string | null>(null);
  const [newMsgOpen, setNewMsgOpen] = useState(false);

  /* config — drives empty/warning states */
  const { data: config } = useQuery<ConfigResp>({
    queryKey: ["/api/admin/twilio/config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/twilio/config", { credentials: "include" });
      if (!res.ok) throw new Error("config failed");
      return res.json();
    },
  });

  return (
    <AdminLayout pageContext={{ page: "communications" }}>
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Communications</h2>
            <p className="text-sm text-gray-500">
              {config?.fromNumber
                ? <>Twilio number: <span className="font-medium text-gray-700">{formatPhone(config.fromNumber)}</span></>
                : "Twilio number not configured"}
            </p>
          </div>
        </div>

        {/* Setup warnings — only show in the relevant tab section */}
        {config && !config.smsReady && (
          <ConfigBanner
            title="SMS not configured"
            missing={config.missing.sms}
            help="Set the missing env vars in Doppler (TWILIO_PHONE_NUMBER is the most commonly missed one)."
          />
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as "sms" | "phone")}>
          <TabsList>
            <TabsTrigger value="sms" className="gap-2">
              <MessageSquare className="w-4 h-4" /> SMS
            </TabsTrigger>
            <TabsTrigger value="phone" className="gap-2">
              <Phone className="w-4 h-4" /> Phone
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sms" className="mt-3">
            <SmsPanel
              smsReady={!!config?.smsReady}
              activeContact={activeContact}
              onSelectContact={setActiveContact}
              onNewMessage={() => setNewMsgOpen(true)}
            />
          </TabsContent>

          <TabsContent value="phone" className="mt-3">
            <PhonePanel
              voiceReady={!!config?.voiceReady}
              voiceMissing={config?.missing.voice ?? []}
              fromNumber={config?.fromNumber ?? null}
            />
          </TabsContent>
        </Tabs>
      </div>

      <NewMessageDialog
        open={newMsgOpen}
        onClose={() => setNewMsgOpen(false)}
        onSent={(toNum) => {
          setNewMsgOpen(false);
          setActiveContact(toNum);
        }}
      />
    </AdminLayout>
  );
}

/* ─── SMS panel ──────────────────────────────────────────────────── */

function SmsPanel({
  smsReady,
  activeContact,
  onSelectContact,
  onNewMessage,
}: {
  smsReady: boolean;
  activeContact: string | null;
  onSelectContact: (c: string | null) => void;
  onNewMessage: () => void;
}) {
  const { data, isLoading, refetch, isRefetching } = useQuery<{ messages: TwilioMessage[]; hasMore: boolean }>({
    queryKey: ["/api/admin/twilio/messages"],
    queryFn: async () => {
      const res = await fetch("/api/admin/twilio/messages?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("messages failed");
      return res.json();
    },
    enabled: smsReady,
    refetchInterval: 15000, // poll every 15s for new texts
  });

  const threads = useMemo(() => groupThreads(data?.messages ?? []), [data?.messages]);

  // Auto-select first thread on load if none active
  useEffect(() => {
    if (!activeContact && threads.length > 0) {
      onSelectContact(threads[0].contact);
    }
  }, [threads, activeContact, onSelectContact]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 min-h-[60vh]">
      {/* LEFT — conversation list */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Conversations</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => refetch()}
              title="Refresh"
              disabled={isRefetching}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 gap-1 bg-[#0d3cfc] hover:bg-[#0b34d6]"
              onClick={onNewMessage}
              disabled={!smsReady}
            >
              <Plus className="w-3.5 h-3.5" /> New
            </Button>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          data-testid="twilio-thread-list"
        >
          {!smsReady ? (
            <EmptyState
              icon={<MessageSquare className="w-8 h-8 text-gray-300" />}
              title="SMS not ready"
              message="Configure Twilio env vars to load conversations."
            />
          ) : isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="w-8 h-8 text-gray-300" />}
              title="No messages yet"
              message="Inbound and outbound texts on your Twilio number will appear here."
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {threads.map((t) => {
                const active = normalizeContact(t.contact) === normalizeContact(activeContact ?? "");
                return (
                  <li key={t.contact}>
                    <button
                      type="button"
                      onClick={() => onSelectContact(t.contact)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors",
                        active && "bg-[#EEF3FF] hover:bg-[#EEF3FF]"
                      )}
                      data-testid={`twilio-thread-${normalizeContact(t.contact)}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={cn(
                          "text-sm font-medium truncate",
                          active ? "text-[#0d3cfc]" : "text-gray-900"
                        )}>
                          {formatPhone(t.contact)}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {formatTimestamp(new Date(t.lastAt).toISOString())}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {t.lastDirection === "outbound" && <span className="text-gray-400">You: </span>}
                        {t.lastBody || <em className="opacity-60">(no body)</em>}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* RIGHT — thread view */}
      <Card className="flex flex-col overflow-hidden min-h-[60vh]">
        {activeContact ? (
          <ThreadView contact={activeContact} />
        ) : (
          <EmptyState
            icon={<MessageSquare className="w-10 h-10 text-gray-300" />}
            title="Pick a conversation"
            message="Select a thread on the left or start a new message."
          />
        )}
      </Card>
    </div>
  );
}

/* ─── Thread view ────────────────────────────────────────────────── */

function ThreadView({ contact }: { contact: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<{ messages: TwilioMessage[]; contact: string }>({
    queryKey: ["/api/admin/twilio/messages/thread", contact],
    queryFn: async () => {
      const url = `/api/admin/twilio/messages/thread?contact=${encodeURIComponent(contact)}&limit=200`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("thread failed");
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages?.length]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/twilio/messages", {
        to: contact,
        body: draft,
      });
      return res.json();
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/messages/thread", contact] });
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) sendMutation.mutate();
    }
  };

  return (
    <>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{formatPhone(contact)}</p>
          <p className="text-[11px] text-gray-400">{data?.messages?.length ?? 0} messages</p>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-[#FAFBFD]"
        data-testid="twilio-thread-messages"
      >
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="h-10 w-1/2 ml-auto rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
          </div>
        ) : (data?.messages?.length ?? 0) === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">No messages in this thread yet.</p>
        ) : (
          (data?.messages ?? []).map((m) => (
            <Bubble key={m.sid} message={m} />
          ))
        )}
      </div>

      {/* Composer — Enter sends */}
      <div className="border-t border-gray-100 p-3 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20 focus:border-[#0d3cfc]/60 min-h-[40px] max-h-[120px]"
            data-testid="twilio-composer-input"
          />
          <Button
            type="button"
            onClick={() => sendMutation.mutate()}
            disabled={!draft.trim() || sendMutation.isPending}
            className="bg-[#0d3cfc] hover:bg-[#0b34d6] h-10 gap-1"
            data-testid="twilio-composer-send"
          >
            <Send className="w-4 h-4" />
            {sendMutation.isPending ? "…" : "Send"}
          </Button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 ml-1">Enter to send · Shift+Enter for newline</p>
      </div>
    </>
  );
}

function Bubble({ message }: { message: TwilioMessage }) {
  const isMine = message.direction === "outbound";
  return (
    <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words",
          isMine
            ? "bg-[#0d3cfc] text-white rounded-br-sm"
            : "bg-white text-gray-900 border border-gray-200 rounded-bl-sm"
        )}
        data-testid={`twilio-bubble-${message.direction}`}
      >
        {message.body || <em className="opacity-60">(no body)</em>}
        <div className={cn(
          "text-[10px] mt-1 opacity-70",
          isMine ? "text-blue-100" : "text-gray-400"
        )}>
          {formatTimestamp(message.date_sent)}
          {message.status && message.status !== "delivered" && (
            <span className="ml-1.5">· {message.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── New message dialog ─────────────────────────────────────────── */

function NewMessageDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: (toNum: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) {
      setTo("");
      setBody("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/twilio/messages", { to, body });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/twilio/messages"] });
      toast({ title: "Message sent", description: formatPhone(to) });
      onSent(to);
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const isValidPhone = /^\+\d{7,15}$/.test(to);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FloatField
            label="To (E.164, e.g. +15551234567)"
            htmlFor="twilio-new-to"
            infoText="Use the full international format starting with +. Country code required."
          >
            <input
              id="twilio-new-to"
              className="premium-input"
              placeholder=" "
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="twilio-new-to"
            />
          </FloatField>

          <FloatField
            label="Message"
            htmlFor="twilio-new-body"
            infoText="Max 1600 characters. Standard SMS rates apply on your Twilio account."
          >
            <textarea
              id="twilio-new-body"
              className="premium-input min-h-[100px] resize-none"
              placeholder=" "
              value={body}
              onChange={(e) => setBody(e.target.value)}
              data-testid="twilio-new-body"
            />
          </FloatField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValidPhone || !body.trim() || mutation.isPending}
            className="bg-[#0d3cfc] hover:bg-[#0b34d6]"
            data-testid="twilio-new-send"
          >
            {mutation.isPending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Phone panel ────────────────────────────────────────────────── */

/**
 * Token refresh interval — Twilio access tokens are typically 1h TTL,
 * so we re-fetch every 30 min to stay well clear of expiry.
 */
const TOKEN_REFRESH_MS = 30 * 60 * 1000;

type DialerState =
  | "idle"
  | "initializing"  // fetching token / setting up device
  | "ready"         // device registered, no active call
  | "calling"      // outbound call in progress (ringing or connected)
  | "incoming"     // inbound call ringing
  | "not_configured" // env vars missing or device init failed
  ;

function PhonePanel({
  voiceReady,
  voiceMissing,
  fromNumber,
}: {
  voiceReady: boolean;
  voiceMissing: string[];
  fromNumber: string | null;
}) {
  const { toast } = useToast();
  const [dialNumber, setDialNumber] = useState("");

  // Voice SDK plumbing
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const [dialerState, setDialerState] = useState<DialerState>("idle");
  const [activeCallNumber, setActiveCallNumber] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const { data: callsData, isLoading: callsLoading, refetch: refetchCalls } = useQuery<{ calls: TwilioCall[] }>({
    queryKey: ["/api/admin/twilio/calls"],
    queryFn: async () => {
      const res = await fetch("/api/admin/twilio/calls?limit=50", { credentials: "include" });
      if (!res.ok) throw new Error("calls failed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  /* Fetch a fresh access token from the server. */
  const fetchToken = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/admin/twilio/voice-token", { credentials: "include" });
    if (!res.ok) {
      // 503 → voice not configured; bubble up so caller can show empty state.
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail?.error || `token fetch failed (${res.status})`);
    }
    const data = await res.json();
    if (!data?.token) throw new Error("token missing in response");
    return data.token as string;
  }, []);

  /* Initialize the Voice SDK Device. Called on mount + when voiceReady flips. */
  useEffect(() => {
    if (!voiceReady) {
      setDialerState("not_configured");
      return;
    }

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      setDialerState("initializing");
      setInitError(null);
      try {
        const token = await fetchToken();
        if (cancelled) return;

        const device = new Device(token, {
          // Use the SDK defaults — codecs etc. The TwiML App handles routing.
          logLevel: "warn",
        });

        device.on(Device.EventName.Registered, () => {
          if (cancelled) return;
          setDialerState((s) => (s === "calling" || s === "incoming" ? s : "ready"));
        });

        device.on(Device.EventName.Error, (err: any) => {
          // Surface as toast; don't tear down the device — SDK auto-retries.
          toast({
            title: "Voice error",
            description: err?.message ?? "Unknown Voice SDK error",
            variant: "destructive",
          });
        });

        device.on(Device.EventName.Incoming, (call: Call) => {
          if (cancelled) return;
          setIncomingCall(call);
          setDialerState("incoming");

          call.on("cancel", () => {
            setIncomingCall((c) => (c === call ? null : c));
            setDialerState((s) => (s === "incoming" ? "ready" : s));
          });
          call.on("disconnect", () => {
            setIncomingCall((c) => (c === call ? null : c));
            setDialerState((s) => (s === "incoming" ? "ready" : s));
            refetchCalls();
          });
          call.on("reject", () => {
            setIncomingCall((c) => (c === call ? null : c));
            setDialerState((s) => (s === "incoming" ? "ready" : s));
          });
        });

        await device.register();
        if (cancelled) {
          device.destroy();
          return;
        }
        deviceRef.current = device;

        // Periodic token refresh.
        refreshTimer = setInterval(async () => {
          try {
            const fresh = await fetchToken();
            device.updateToken(fresh);
          } catch (err: any) {
            // Non-fatal — keep current token until it expires.
            // eslint-disable-next-line no-console
            console.warn("[voice] token refresh failed", err?.message);
          }
        }, TOKEN_REFRESH_MS);
      } catch (err: any) {
        if (cancelled) return;
        setInitError(err?.message ?? "Failed to initialize Voice SDK");
        setDialerState("not_configured");
      }
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      if (activeCallRef.current) {
        try { activeCallRef.current.disconnect(); } catch { /* noop */ }
        activeCallRef.current = null;
      }
      if (deviceRef.current) {
        try { deviceRef.current.destroy(); } catch { /* noop */ }
        deviceRef.current = null;
      }
    };
  }, [voiceReady, fetchToken, toast, refetchCalls]);

  /* Place an outbound call. */
  const handleCall = async () => {
    if (!dialNumber.trim()) return;
    const device = deviceRef.current;
    if (!device) {
      toast({
        title: "Voice not ready",
        description: initError ?? "Device still initializing.",
        variant: "destructive",
      });
      return;
    }
    try {
      setDialerState("calling");
      setActiveCallNumber(dialNumber);
      const call = await device.connect({ params: { To: dialNumber } });
      activeCallRef.current = call;
      call.on("disconnect", () => {
        activeCallRef.current = null;
        setActiveCallNumber(null);
        setDialerState("ready");
        refetchCalls();
      });
      call.on("cancel", () => {
        activeCallRef.current = null;
        setActiveCallNumber(null);
        setDialerState("ready");
      });
      call.on("error", (err: any) => {
        toast({
          title: "Call error",
          description: err?.message ?? "Call failed",
          variant: "destructive",
        });
        activeCallRef.current = null;
        setActiveCallNumber(null);
        setDialerState("ready");
      });
    } catch (err: any) {
      toast({
        title: "Call failed",
        description: err?.message ?? "Could not place call",
        variant: "destructive",
      });
      setActiveCallNumber(null);
      setDialerState("ready");
    }
  };

  /* Hang up the currently active outbound call. */
  const handleHangup = () => {
    if (activeCallRef.current) {
      try { activeCallRef.current.disconnect(); } catch { /* noop */ }
    }
  };

  /* Accept / decline incoming call. */
  const handleAcceptIncoming = () => {
    if (!incomingCall) return;
    try {
      incomingCall.accept();
      activeCallRef.current = incomingCall;
      setActiveCallNumber(incomingCall.parameters?.From ?? null);
      setDialerState("calling");
      setIncomingCall(null);
    } catch (err: any) {
      toast({ title: "Accept failed", description: err?.message ?? "", variant: "destructive" });
    }
  };
  const handleDeclineIncoming = () => {
    if (!incomingCall) return;
    try { incomingCall.reject(); } catch { /* noop */ }
    setIncomingCall(null);
    setDialerState("ready");
  };

  // The voice panel is "configured" if the server says so AND device init didn't fail.
  const showEmptyState = !voiceReady || dialerState === "not_configured";
  const showIncomingBanner = dialerState === "incoming" && incomingCall;
  const showActiveCallBanner = dialerState === "calling" && activeCallNumber;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3">
      {/* Dialer */}
      <Card className="p-5 flex flex-col" data-testid="twilio-dialer-panel">
        <div className="flex items-center gap-2 mb-1">
          <PhoneCall className="w-4 h-4 text-[#0d3cfc]" />
          <h3 className="text-sm font-semibold text-gray-900">Dialer</h3>
          {dialerState === "ready" && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Ready
            </span>
          )}
          {dialerState === "initializing" && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" /> Connecting…
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {fromNumber ? <>From {formatPhone(fromNumber)}</> : "From: Twilio number not set"}
        </p>

        {showEmptyState ? (
          <>
            <ConfigBanner
              title="Voice dialer not configured"
              missing={voiceMissing}
              help={
                initError
                  ? `Init error: ${initError}. Verify TWILIO_APP_SID points at a TwiML App whose Voice URL is /api/twilio/voice-twiml.`
                  : "Create a TwiML App in the Twilio Console (Voice URL → /api/twilio/voice-twiml) and set TWILIO_APP_SID. Also need TWILIO_API_KEY + TWILIO_API_KEY_SECRET (separate from your Auth Token)."
              }
            />
            <div className="mt-5 p-4 rounded-lg border border-dashed border-gray-200 text-center" data-testid="twilio-dialer-empty">
              <Phone className="w-7 h-7 text-gray-300 mx-auto" />
              <p className="text-sm font-medium text-gray-600 mt-2">Voice not configured</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                Set the env vars above in Doppler and reload to enable browser-based calling.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mt-2">
              <FloatField
                label="Number to call (e.g. +15551234567)"
                htmlFor="twilio-dial-to"
                infoText="E.164 format with country code. The call originates from your Twilio number."
              >
                <input
                  id="twilio-dial-to"
                  className="premium-input"
                  placeholder=" "
                  value={dialNumber}
                  onChange={(e) => setDialNumber(e.target.value)}
                  disabled={dialerState === "calling"}
                  data-testid="twilio-dial-input"
                />
              </FloatField>
            </div>

            {/* Dial pad */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {["1","2","3","4","5","6","7","8","9","*","0","#"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    if (dialerState === "calling" && activeCallRef.current) {
                      // Send DTMF tone during an active call.
                      try { activeCallRef.current.sendDigits(d); } catch { /* noop */ }
                    } else {
                      setDialNumber((n) => n + d);
                    }
                  }}
                  className="h-12 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-800 text-base font-medium transition-colors"
                  data-testid={`twilio-dial-key-${d}`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button
                variant="outline"
                onClick={() => setDialNumber("")}
                disabled={!dialNumber || dialerState === "calling"}
              >
                Clear
              </Button>
              {dialerState === "calling" ? (
                <Button
                  onClick={handleHangup}
                  className="bg-red-600 hover:bg-red-700 gap-1.5"
                  data-testid="twilio-hangup-button"
                >
                  <PhoneOff className="w-4 h-4" /> Hang up
                </Button>
              ) : (
                <Button
                  onClick={handleCall}
                  disabled={!dialNumber || dialerState !== "ready"}
                  className="bg-green-600 hover:bg-green-700 gap-1.5"
                  data-testid="twilio-call-button"
                >
                  <PhoneCall className="w-4 h-4" /> Call
                </Button>
              )}
            </div>

            {/* Active call banner */}
            {showActiveCallBanner && (
              <div
                className="mt-5 p-3 rounded-lg border border-green-200 bg-green-50 flex items-center gap-3"
                data-testid="twilio-active-call-banner"
              >
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-green-900">In call</p>
                  <p className="text-xs text-green-700 truncate">{formatPhone(activeCallNumber)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleHangup}
                  className="h-7 px-2 gap-1 border-red-200 text-red-700 hover:bg-red-50"
                >
                  <PhoneOff className="w-3.5 h-3.5" /> End
                </Button>
              </div>
            )}

            {/* Incoming-call banner */}
            {showIncomingBanner && (
              <div
                className="mt-5 p-3 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-3"
                data-testid="twilio-incoming-call-banner"
              >
                <PhoneIncoming className="w-5 h-5 text-blue-600 animate-pulse" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-blue-900">Incoming call</p>
                  <p className="text-xs text-blue-700 truncate">
                    {formatPhone(incomingCall?.parameters?.From ?? null)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleAcceptIncoming}
                  className="h-7 px-2 gap-1 bg-green-600 hover:bg-green-700"
                  data-testid="twilio-incoming-accept"
                >
                  <Check className="w-3.5 h-3.5" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDeclineIncoming}
                  className="h-7 px-2 gap-1 border-red-200 text-red-700 hover:bg-red-50"
                  data-testid="twilio-incoming-decline"
                >
                  <X className="w-3.5 h-3.5" /> Decline
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Recent calls */}
      <Card className="flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Recent calls</h3>
          <p className="text-[11px] text-gray-400">Last 50 from Twilio</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {callsLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (callsData?.calls?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Phone className="w-8 h-8 text-gray-300" />}
              title="No calls yet"
              message="Inbound and outbound calls on your Twilio number will appear here."
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {callsData!.calls.map((c) => {
                const isInbound = (c.direction ?? "").startsWith("inbound");
                const other = isInbound ? c.from : c.to;
                const Icon = isInbound ? PhoneIncoming : PhoneOutgoing;
                return (
                  <li key={c.sid} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={cn("w-3.5 h-3.5 shrink-0", isInbound ? "text-blue-500" : "text-gray-400")} />
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {formatPhone(other)}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {formatTimestamp(c.start_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-5.5 pl-1">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full",
                        c.status === "completed" ? "bg-green-50 text-green-700"
                          : c.status === "no-answer" || c.status === "failed" ? "bg-red-50 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      )}>
                        {c.status}
                      </span>
                      {c.duration_sec != null && (
                        <span className="text-[10px] text-gray-400">
                          {Math.floor(c.duration_sec / 60)}m {c.duration_sec % 60}s
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ─── small shared ───────────────────────────────────────────────── */

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon}
      <p className="text-sm font-medium text-gray-700 mt-3">{title}</p>
      <p className="text-xs text-gray-500 mt-1 max-w-xs">{message}</p>
    </div>
  );
}

function ConfigBanner({
  title,
  missing,
  help,
}: {
  title: string;
  missing: string[];
  help: string;
}) {
  return (
    <Card className="p-3 bg-amber-50 border-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-900">{title}</p>
          {missing.length > 0 && (
            <p className="text-xs text-amber-800 mt-0.5">
              Missing: <code className="bg-amber-100 px-1 rounded text-[11px]">{missing.join(", ")}</code>
            </p>
          )}
          <p className="text-xs text-amber-700 mt-1">{help}</p>
        </div>
      </div>
    </Card>
  );
}
