import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Loader2, ArrowLeft, Send, Eye, EyeOff, AlertTriangle, RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─── */
interface TicketDetail {
  id: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  description: string;
  client_id: number;
  client_name?: string | null;
  assigned_to: number | null;
  source: string;
  ai_summary: string | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
}

interface TicketMessage {
  id: number;
  author_id: number | null;
  author_type: string;
  author_name: string | null;
  visibility: string;
  content: string;
  created_at: string | null;
}

interface AdminUser {
  id: number;
  name: string | null;
  email: string;
}

/* ─── Constants ─── */
const STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_on_customer", label: "Waiting on Customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "service", label: "Service" },
  { value: "onboarding", label: "Onboarding" },
  { value: "access", label: "Access" },
  { value: "other", label: "Other" },
];

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  in_progress: "bg-brand-blue-50 text-brand-blue-700",
  waiting_on_customer: "bg-blue-50 text-blue-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
};

function formatTime(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return `${date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} at ${date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/* ─── Main Page ─── */
export default function SupportTicketDetailPage() {
  const [, params] = useRoute("/admin/crm/support/:id");
  const ticketId = params?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [replyText, setReplyText] = useState("");
  const [visibility, setVisibility] = useState<"customer" | "internal">("customer");
  const endRef = useRef<HTMLDivElement>(null);

  // Fetch ticket + messages
  const { data, isLoading, isError, refetch } = useQuery<{ ticket: TicketDetail; messages: TicketMessage[] }>({
    queryKey: ["/api/admin/crm/support/tickets", ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/crm/support/tickets/${ticketId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!ticketId,
  });

  // Fetch admin list for assignee dropdown
  const { data: adminUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/crm/team"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/team", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Update ticket mutation
  const updateTicket = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await fetch(`/api/admin/crm/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update ticket");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/support/tickets/counts"] });
      toast({ title: "Ticket updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/crm/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: replyText.trim(), visibility }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send");
      }
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      toast({ title: "Message sent" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/support/tickets"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  const ticket = data?.ticket;
  const messages = data?.messages ?? [];

  if (!ticketId) {
    return (
      <AdminLayout pageContext={{ page: "support" }}>
        {/* CONTRAST-2 — admin pages are light-theme locked. */}
        <div data-theme="light" className="text-center py-12 text-muted-foreground text-sm">Invalid ticket.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageContext={{ page: "support" }}>
      {/* CONTRAST-2 — admin pages are light-theme locked. */}
      <div data-theme="light">
        {/* Back link */}
        <Link href="/admin/crm/support" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Tickets
        </Link>

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Couldn't load this ticket</p>
              <p className="text-xs text-red-700 mt-1">Check your connection and try again.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-card rounded-xl border border-border px-5 py-4 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
          </div>
        )}

        {ticket && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Messages thread (2 cols) */}
            <div className="lg:col-span-2 space-y-4">
              {/* Header */}
              <div className="bg-card rounded-xl border border-border px-5 py-4">
                <h1 className="text-base font-semibold text-foreground">{ticket.subject}</h1>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  #{ticket.id} &middot; {ticket.client_name || `Client #${ticket.client_id}`} &middot; {ticket.source === "ai_escalation" ? "AI escalation" : "Manual"} &middot; Created {formatDate(ticket.created_at)}
                </p>
                {ticket.ai_summary && (
                  <div className="mt-3 p-3 bg-brand-blue-50 border border-brand-blue-100 rounded-lg">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-brand-blue-500 mb-1">AI Summary</p>
                    <p className="text-xs text-brand-blue-700">{ticket.ai_summary}</p>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">Messages</h2>
                </div>
                <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
                  {messages.length === 0 && (
                    <p className="text-sm text-muted-foreground/70 text-center py-4">No messages yet.</p>
                  )}
                  {messages.map((m) => {
                    const isInternal = m.visibility === "internal";
                    const isCustomer = m.author_type === "customer";
                    const isAdmin = m.author_type === "admin";
                    const isSystem = m.author_type === "system";
                    return (
                      <div key={m.id} className={`${isInternal ? "border-l-2 border-amber-300 pl-3" : ""}`}>
                        <div className={`rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                          isInternal
                            ? "bg-amber-50 text-amber-900"
                            : isCustomer
                            ? "bg-blue-50 text-blue-900"
                            : isSystem
                            ? "bg-muted/50 text-muted-foreground italic"
                            : "bg-muted text-foreground"
                        }`}>
                          {m.content}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-muted-foreground/70">
                            {isCustomer ? "Customer" : isAdmin ? (m.author_name || "Admin") : "System"} &middot; {formatTime(m.created_at)}
                          </p>
                          {isInternal && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                              <EyeOff className="w-2.5 h-2.5" /> Internal
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                {/* Reply box */}
                <div className={`border-t-2 px-5 py-4 space-y-3 transition-colors ${
                  visibility === "internal"
                    ? "border-amber-400 bg-amber-50/40"
                    : "border-border bg-card"
                }`}>
                  {/* Visibility toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVisibility("customer")}
                      title="Customer will see this message"
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        visibility === "customer"
                          ? "bg-brand-blue text-white ring-2 ring-brand-blue/30"
                          : "bg-muted text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Eye className="w-3 h-3" /> Reply to Customer
                    </button>
                    <button
                      onClick={() => setVisibility("internal")}
                      title="Only admins can see this — customer will NOT see it"
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        visibility === "internal"
                          ? "bg-amber-500 text-white ring-2 ring-amber-400/40"
                          : "bg-muted text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <EyeOff className="w-3 h-3" /> Internal Note
                    </button>
                  </div>

                  {/* Internal note warning banner */}
                  {visibility === "internal" && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-100 border border-amber-300 rounded-lg">
                      <EyeOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <p className="text-xs font-medium text-amber-800">
                        Internal note — only visible to admins, never shown to the customer.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && replyText.trim()) {
                          e.preventDefault();
                          sendMessage.mutate();
                        }
                      }}
                      placeholder={visibility === "internal" ? "Add an internal note (not visible to customer)..." : "Type your reply to the customer..."}
                      rows={3}
                      className={`flex-1 text-sm px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 resize-none ${
                        visibility === "internal"
                          ? "border-amber-300 focus:ring-amber-200/50 focus:border-amber-400 bg-amber-50"
                          : "border-border focus:ring-brand-blue/20 focus:border-brand-blue"
                      }`}
                    />
                    <button
                      onClick={() => sendMessage.mutate()}
                      disabled={!replyText.trim() || sendMessage.isPending}
                      className={`px-3 py-2.5 rounded-lg text-white disabled:opacity-40 transition-colors self-end ${
                        visibility === "internal"
                          ? "bg-amber-500 hover:bg-amber-600"
                          : "bg-brand-blue hover:bg-brand-blue-600"
                      }`}
                    >
                      {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  {sendMessage.error && (
                    <p className="text-xs text-red-600">
                      {(sendMessage.error as Error).message || "Failed to send."}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/70">
                    Ctrl+Enter to send.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Ticket metadata sidebar (1 col) */}
            <div className="space-y-4">
              {/* Ticket Controls */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manage</h3>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Status</label>
                    <select
                      value={ticket.status}
                      onChange={(e) => updateTicket.mutate({ status: e.target.value })}
                      disabled={updateTicket.isPending}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                    >
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Priority</label>
                      <select
                        value={ticket.priority}
                        onChange={(e) => updateTicket.mutate({ priority: e.target.value })}
                        disabled={updateTicket.isPending}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Category</label>
                      <select
                        value={ticket.category}
                        onChange={(e) => updateTicket.mutate({ category: e.target.value })}
                        disabled={updateTicket.isPending}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Assigned To</label>
                      <select
                        value={ticket.assigned_to ?? ""}
                        onChange={(e) => updateTicket.mutate({ assigned_to: e.target.value ? Number(e.target.value) : null })}
                        disabled={updateTicket.isPending}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                      >
                        <option value="">Unassigned</option>
                        {(adminUsers ?? []).map((u) => (
                          <option key={u.id} value={u.id}>{u.name || u.email}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</h3>
                </div>
                <div className="p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Client</span>
                    <span className="text-foreground font-medium">{ticket.client_name || `#${ticket.client_id}`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created via</span>
                    <span className="text-foreground">{ticket.source === "ai_escalation" ? "AI chat" : ticket.source === "admin_created" ? "Admin" : "Customer form"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-foreground">{formatDate(ticket.created_at)}</span>
                  </div>
                  {ticket.resolved_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolved</span>
                      <span className="text-foreground">{formatDate(ticket.resolved_at)}</span>
                    </div>
                  )}
                  {ticket.closed_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Closed</span>
                      <span className="text-foreground">{formatDate(ticket.closed_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
