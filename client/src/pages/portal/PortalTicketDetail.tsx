import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useCopilotForm } from "@/context/CopilotFormContext";

/* ─── Types ─── */
interface TicketDetail {
  id: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
}

interface TicketMessage {
  id: number;
  author_type: string; // "customer" | "support" | "system"
  content: string;
  created_at: string | null;
}

/* ─── Status display ─── */
const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  in_progress: "bg-brand-blue-50 text-brand-blue-700",
  waiting_on_customer: "bg-blue-50 text-blue-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
};
const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on you",
  resolved: "Resolved",
  closed: "Closed",
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  billing: "Billing",
  service: "Service",
  onboarding: "Onboarding",
  access: "Access",
  other: "Other",
};

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return `${date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} at ${date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
}

/* ─── Main Page ─── */
export default function PortalTicketDetail() {
  const [, params] = useRoute("/portal/help/tickets/:id");
  const ticketId = params?.id;
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<{ ticket: TicketDetail; messages: TicketMessage[] }>({
    queryKey: ["/api/portal/tickets", ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/tickets/${ticketId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Ticket not found");
      return res.json();
    },
    enabled: !!ticketId,
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send reply");
      }
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tickets"] });
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  const ticket = data?.ticket;
  const messages = data?.messages ?? [];
  const isClosed = ticket?.status === "closed";

  /* Phase 1c: register the ticket reply box with the copilot. Enabled only
   * once the ticket has loaded and is not closed (same condition that
   * renders the reply textarea). */
  useCopilotForm({
    formLabel: "Ticket reply",
    fields: [{ key: "reply", label: "Reply message", required: true }],
    values: { reply },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "reply") setReply(f.value);
      }
    },
    enabled: !!ticket && !isClosed,
  });

  if (!ticketId) {
    return (
      <PortalLayout>
        <div data-theme="light" className="text-center py-12 text-gray-500 text-sm">Invalid ticket.</div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="max-w-3xl space-y-4">
        {/* Back link */}
        <Link href="/portal/help" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Help
        </Link>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">Ticket not found or you don't have access.</p>
          </div>
        )}

        {ticket && (
          <>
            {/* Ticket header */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-base font-semibold text-gray-900">{ticket.subject}</h1>
                    <p className="text-xs text-gray-400 mt-1">
                      #{ticket.id} &middot; {CATEGORY_LABELS[ticket.category] || ticket.category} &middot; Created {formatDate(ticket.created_at)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${STATUS_STYLES[ticket.status] || "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[ticket.status] || ticket.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            </div>

            {/* Messages thread */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Conversation</h2>
              </div>
              <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
                {messages.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No messages yet.</p>
                )}
                {messages.map((m) => {
                  const isCustomer = m.author_type === "customer";
                  return (
                    <div key={m.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] space-y-1`}>
                        <div className={`rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                          isCustomer
                            ? "bg-brand-blue text-white"
                            : m.author_type === "system"
                            ? "bg-gray-50 text-gray-500 italic"
                            : "bg-gray-100 text-gray-700"
                        }`}>
                          {m.content}
                        </div>
                        <p className={`text-[10px] text-gray-400 ${isCustomer ? "text-right" : ""}`}>
                          {isCustomer ? "You" : m.author_type === "system" ? "System" : "Support"} &middot; {formatTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {/* Reply box */}
              {!isClosed ? (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="flex gap-2">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) {
                          e.preventDefault();
                          sendReply.mutate();
                        }
                      }}
                      placeholder="Type your reply..."
                      rows={2}
                      className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue resize-none"
                    />
                    <button
                      onClick={() => sendReply.mutate()}
                      disabled={!reply.trim() || sendReply.isPending}
                      className="px-4 py-2.5 rounded-lg bg-brand-blue text-white hover:bg-brand-blue-600 disabled:opacity-40 transition-colors self-end text-xs font-medium"
                    >
                      {sendReply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
                    </button>
                  </div>
                  {sendReply.error && (
                    <p className="text-xs text-red-600 mt-2">
                      {(sendReply.error as Error).message || "Failed to send reply."}
                    </p>
                  )}
                </div>
              ) : (
                <div className="border-t border-gray-100 px-5 py-4">
                  <p className="text-xs text-gray-400 text-center">
                    This ticket is closed. Please create a new ticket if you need further help.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
