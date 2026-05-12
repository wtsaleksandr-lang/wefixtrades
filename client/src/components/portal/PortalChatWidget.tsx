import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  MessageCircle, X, Send, Loader2, ClipboardList, CheckCircle2,
} from "lucide-react";
import ChatAttachmentInput, {
  ChatAttachmentChips,
  type ChatAttachment,
  type ChatAttachmentInputHandle,
} from "@/components/shared/ChatAttachmentInput";
import { loadPortalMessages, savePortalMessages } from "@/lib/chatHelpers";

/* ─── Types ─── */
export interface PortalChatContext {
  /** "help" for general support (escalation enabled), or omit for onboarding */
  surface?: "help";
  /** Onboarding context — passed when user is on an onboarding form */
  service_name?: string;
  service_id?: string;
  fields?: { key: string; label: string; required: boolean }[];
  current_responses?: Record<string, any>;
}

interface EscalationDraft {
  subject: string;
  category: string;
  description: string;
  ai_summary: string | null;
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "service", label: "Service" },
  { value: "onboarding", label: "Onboarding" },
  { value: "access", label: "Access" },
  { value: "other", label: "Other" },
];

const SUGGESTIONS = [
  "How do I complete my setup form?",
  "When will my service go live?",
  "How do I check my billing status?",
  "What does my service include?",
];

/**
 * PortalChatWidget — single global portal assistant.
 *
 * Rendered by PortalLayout on every portal page.
 * One floating FAB → one chat panel → one API endpoint.
 *
 * Context-aware:
 *  - Default (no chatContext or surface="help"): general support + escalation
 *  - Onboarding context: form-field-aware assistant, no escalation
 */
export default function PortalChatWidget({
  chatContext,
}: {
  chatContext?: PortalChatContext;
}) {
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  // Q24: persist messages across page navigations + page reloads via localStorage.
  // Backend chat_memory table is also linked via session id once the user logs in.
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>(
    () => {
      const saved = loadPortalMessages();
      return saved.length > 0 ? saved.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })) : [];
    },
  );
  useEffect(() => {
    savePortalMessages(messages);
  }, [messages]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const attachmentInputRef = useRef<ChatAttachmentInputHandle | null>(null);
  const [loading, setLoading] = useState(false);

  // Escalation state
  const [escalationDraft, setEscalationDraft] = useState<EscalationDraft | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftCategory, setDraftCategory] = useState("general");
  const [draftDescription, setDraftDescription] = useState("");
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [ticketCreated, setTicketCreated] = useState<{ id: number } | null>(null);
  const [escalationCooldown, setEscalationCooldown] = useState(0);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, escalationDraft]);

  // Determine context for this request
  const isOnboarding = !!(chatContext?.service_name && chatContext?.fields);
  const escalationEnabled = !isOnboarding; // Only on help surface

  // Build the context payload for the API
  function buildContext() {
    // Q22: every chat send now carries the user's current page so the assistant
    // can give page-aware guidance instead of saying "I can't see your screen".
    // Also captures the document title (the active page heading) for human-
    // readable context that's friendlier than a route string alone.
    const page_path = typeof window !== "undefined" ? location : undefined;
    const page_title = typeof document !== "undefined" ? document.title : undefined;
    if (isOnboarding) {
      return {
        service_name: chatContext!.service_name,
        service_id: chatContext!.service_id,
        fields: chatContext!.fields,
        current_responses: chatContext!.current_responses,
        page_path,
        page_title,
      };
    }
    return {
      surface: "help",
      skip_escalation: escalationCooldown > 0,
      page_path,
      page_title,
    };
  }

  async function send(text?: string) {
    const msg = (text || input).trim();
    /* Allow sending an attachment-only message (msg may be empty if
     * the user just pasted a screenshot and hit send without typing).
     * Block while a previous send is still in flight, or while any
     * attachment is still uploading. */
    const hasUploadedAttachments = attachments.some((a) => a.status === "uploaded");
    if ((!msg && !hasUploadedAttachments) || loading) return;
    if (attachments.some((a) => a.status === "pending")) return;

    /* Compose the user-visible message. If the user attached files
     * we append a short "[+1 attachment]" suffix so the conversation
     * preserves the fact that something was sent. */
    const attachmentSuffix = hasUploadedAttachments
      ? ` [${attachments.filter((a) => a.status === "uploaded").length} attachment${
          attachments.filter((a) => a.status === "uploaded").length === 1 ? "" : "s"
        }]`
      : "";
    const renderedContent = msg + attachmentSuffix;

    const updated = [...messages, { role: "user" as const, content: renderedContent }];
    setMessages(updated);
    setInput("");
    /* Capture the attachment list now and clear the chip strip so the
     * next message starts fresh. */
    const sentAttachments = attachments.filter((a) => a.status === "uploaded");
    setAttachments([]);
    setLoading(true);
    setEscalationDraft(null);
    setTicketCreated(null);

    const currentCooldown = escalationCooldown;
    if (currentCooldown > 0) setEscalationCooldown(currentCooldown - 1);

    try {
      const res = await fetch("/api/portal/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          context: buildContext(),
          attachments: sentAttachments.map((a) => ({
            url: a.url,
            filename: a.filename,
            mime: a.mime,
            size: a.size,
          })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.reply || "Sorry, something went wrong.",
      }]);

      // Handle escalation draft (only for help surface)
      if (escalationEnabled && data.escalation_draft) {
        const draft = data.escalation_draft as EscalationDraft;
        setEscalationDraft(draft);
        setDraftSubject(draft.subject);
        setDraftCategory(draft.category);
        setDraftDescription(draft.description);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "Something went wrong. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function submitEscalationTicket() {
    if (!draftSubject.trim() || !draftDescription.trim() || submittingTicket) return;
    setSubmittingTicket(true);
    try {
      const transcript = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/portal/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: draftSubject.trim(),
          message: draftDescription.trim(),
          category: draftCategory,
          source: "ai_escalation",
          ai_summary: escalationDraft?.ai_summary || null,
          transcript_json: transcript,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create ticket");
      }
      const data = await res.json();
      setTicketCreated({ id: data.id });
      setEscalationDraft(null);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tickets"] });
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Ticket #${data.id} has been created. Our team will review it and get back to you.`,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Sorry, I couldn't create the ticket: ${(err as Error).message}. You can create one manually from the Help page.`,
      }]);
      setEscalationDraft(null);
    } finally {
      setSubmittingTicket(false);
    }
  }

  function dismissDraft() {
    setEscalationDraft(null);
    setEscalationCooldown(2);
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: "No problem. You can create a ticket from the Help page anytime, or keep chatting here.",
    }]);
  }

  const title = isOnboarding ? "Setup Assistant" : "Support";

  return (
    <>
      {/* FAB — always visible when panel is closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-[#2D6A4F] text-white shadow-lg hover:bg-[#1B4332] flex items-center justify-center transition-colors"
          title="Need help? Chat with our assistant"
          aria-label="Open support chat"
        >
          <MessageCircle className="w-5 h-5" aria-hidden="true" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-80 sm:w-96 max-h-[520px] flex flex-col bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-[#2D6A4F] shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white">{title}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-white/20 text-white"
              aria-label="Close support chat"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[180px] max-h-[340px]">
            {messages.length === 0 && !isOnboarding && (
              <div className="text-center py-3">
                <p className="text-xs text-gray-400 mb-2">Ask anything about your services, billing, or account.</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className="px-2.5 py-1 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.length === 0 && isOnboarding && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-700">
                  Hi! I'm here to help you fill out the {chatContext?.service_name} setup form. Ask me anything about any of the fields.
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-[#2D6A4F] text-white" : "bg-gray-100 text-gray-700"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}

            {/* Escalation draft card */}
            {escalationDraft && !ticketCreated && (
              <div className="border border-[#2D6A4F]/30 bg-[#F0F7F4] rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 text-[#2D6A4F]" />
                  <p className="text-xs font-medium text-gray-900">Support Ticket Draft</p>
                </div>
                <p className="text-[10px] text-gray-500">Review and edit. No ticket until you confirm.</p>

                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_auto] gap-1.5">
                    <div>
                      <label className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">Subject</label>
                      <input
                        value={draftSubject}
                        onChange={(e) => setDraftSubject(e.target.value)}
                        className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]/30 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">Category</label>
                      <select
                        value={draftCategory}
                        onChange={(e) => setDraftCategory(e.target.value)}
                        className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]/30 bg-white"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">Description</label>
                    <textarea
                      value={draftDescription}
                      onChange={(e) => setDraftDescription(e.target.value)}
                      rows={2}
                      className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]/30 bg-white resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={submitEscalationTicket}
                    disabled={!draftSubject.trim() || !draftDescription.trim() || submittingTicket}
                    className="px-3 py-1 text-xs font-medium text-white bg-[#2D6A4F] rounded hover:bg-[#1B4332] disabled:opacity-60 transition-colors"
                  >
                    {submittingTicket ? "Creating..." : "Create Ticket"}
                  </button>
                  <button
                    onClick={dismissDraft}
                    disabled={submittingTicket}
                    className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Ticket created confirmation */}
            {ticketCreated && (
              <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-2.5 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-emerald-800">Ticket #{ticketCreated.id} created</p>
                  <Link href={`/portal/help/tickets/${ticketCreated.id}`} className="text-[10px] text-emerald-700 underline hover:no-underline">
                    View ticket
                  </Link>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 shrink-0">
            <ChatAttachmentChips
              value={attachments}
              onRemove={(id) => setAttachments(attachments.filter((a) => a.id !== id))}
            />
            <div className="p-2 flex gap-1 items-center">
              <ChatAttachmentInput
                ref={attachmentInputRef}
                value={attachments}
                onChange={setAttachments}
                variant="portal"
                disabled={loading}
              />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                /* Ctrl+V on the text input: ChatAttachmentInput's
                   handlePaste reads any files on the clipboard and
                   uploads them; plain-text pastes still flow into the
                   input as normal because handlePaste only calls
                   preventDefault when it found files. */
                onPaste={(e) => attachmentInputRef.current?.handlePaste(e)}
                placeholder={isOnboarding ? "Ask about any field..." : "Type or paste a screenshot..."}
                className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F]"
              />
              <button
                onClick={() => send()}
                disabled={
                  loading ||
                  attachments.some((a) => a.status === "pending") ||
                  (!input.trim() && !attachments.some((a) => a.status === "uploaded"))
                }
                className="p-2 rounded-lg bg-[#2D6A4F] text-white hover:bg-[#1B4332] disabled:opacity-40 transition-colors"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
