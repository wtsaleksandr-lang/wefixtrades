import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  MessageCircle, X, Send, Loader2, ClipboardList, CheckCircle2, Settings as SettingsIcon, History, Wand2,
} from "lucide-react";
import ChatAttachmentInput, {
  ChatAttachmentChips,
  type ChatAttachment,
  type ChatAttachmentInputHandle,
} from "@/components/shared/ChatAttachmentInput";
import { loadPortalMessages, savePortalMessages } from "@/lib/chatHelpers";
import { useToast } from "@/hooks/use-toast";

const LAST_OPEN_KEY = "wft_portal_chat_last_open";
const OPACITY_KEY = "wft_portal_chat_opacity";
const SIZE_KEY = "wft_portal_chat_size";
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_W = 320, MIN_H = 400, DEFAULT_W = 384, DEFAULT_H = 520;

/** Grab a short, useful snapshot of what's visible to the user on the current page.
 *  Used by the chat assistant so it can answer page-aware questions like
 *  "what should I fill in here?" or "what does this status mean?" */
function readPageContentSnapshot(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const main = document.querySelector("main") ?? document.querySelector("[data-portal-main]") ?? document.body;
  const text = (main as HTMLElement | null)?.innerText ?? "";
  // Collapse whitespace + cap at ~1.5k chars to keep token cost sane.
  const collapsed = text.replace(/\s+/g, " ").trim().slice(0, 1500);
  return collapsed || undefined;
}

/* ─── Types ─── */

/* Q30b: lightweight action-button protocol. AI emits these inside a
 * <<<ACTION_PROPOSAL>>>{...}<<<END_ACTION_PROPOSAL>>> block; server parses
 * + sanitizes + returns under `actions` on the response. Client renders
 * each as a clickable button under the assistant message that proposed
 * them. Only `navigate` intent is shipped in v1 — `click` and `fill`
 * follow once we have a use case. Target is whitelisted to /portal/*
 * on both server and client (defence in depth). */
export interface ActionProposal {
  label: string;
  intent: "navigate" | "click";
  /* For navigate: path that must start with /portal/.
   * For click: data-testid value matching ^[a-z0-9_-]+$. The widget calls
   * .click() on document.querySelector(`[data-testid="${target}"]`). */
  target: string;
  hint?: string;
}

export interface FormFillProposal {
  field_key: string;
  value: string;
  reason?: string;
}

export interface PortalChatContext {
  /** "help" for general support (escalation enabled), or omit for onboarding */
  surface?: "help";
  /** Onboarding context — passed when user is on an onboarding form */
  service_name?: string;
  service_id?: string;
  fields?: { key: string; label: string; required: boolean }[];
  current_responses?: Record<string, any>;
  /** Q23: optional handler the host page provides — the chat widget calls
   *  this with the proposed fills when the user clicks "Apply" on an AI
   *  proposal card. The host page (e.g. PortalOnboarding) updates its form
   *  state from these values. If not provided, the Apply button is hidden. */
  onApplyFill?: (fills: FormFillProposal[]) => void | Promise<void>;
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
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  // Q25: transparency slider — persists across mounts. 0.7 floor so messages remain readable.
  const [panelOpacity, setPanelOpacity] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem(OPACITY_KEY) ?? "");
      if (!isNaN(v) && v >= 0.7 && v <= 1) return v;
    } catch { /* noop */ }
    return 1;
  });
  useEffect(() => {
    try { localStorage.setItem(OPACITY_KEY, String(panelOpacity)); } catch { /* noop */ }
  }, [panelOpacity]);
  const [showSettings, setShowSettings] = useState(false);
  // Q25: "Previous conversation" banner shown ONCE per re-open when last open was > 24h ago.
  const [showHistoryBanner, setShowHistoryBanner] = useState(false);
  // Q23: form-fill proposal card (rendered inline after the assistant reply that proposed it).
  const [pendingProposal, setPendingProposal] = useState<FormFillProposal[] | null>(null);
  const [applyingProposal, setApplyingProposal] = useState(false);
  // Q24: cross-session / cross-device hydration — on first mount, fetch the
  // server-side thread for this user and merge if richer than localStorage.
  // Survives logout/login + different browsers/devices.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/ai-chat/history", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const serverMessages: { role: "user" | "assistant"; content: string }[] = Array.isArray(data.messages) ? data.messages : [];
        if (cancelled || serverMessages.length === 0) return;
        // Server is canonical when it has MORE messages than current state
        // (which came from localStorage). Skip otherwise to avoid clobbering
        // local edits the server hasn't seen yet.
        setMessages((prev) => (serverMessages.length > prev.length ? serverMessages : prev));
      } catch { /* network errors are fine — falls back to localStorage */ }
    })();
    return () => { cancelled = true; };
  }, []);
  // Q25a: drag-to-resize from top-left corner (panel is anchored bottom-right).
  // Persist user's preferred size so it survives navigations + reloads.
  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SIZE_KEY) ?? "");
      if (saved && typeof saved.w === "number" && typeof saved.h === "number") {
        return { w: Math.max(MIN_W, saved.w), h: Math.max(MIN_H, saved.h) };
      }
    } catch { /* noop */ }
    return { w: DEFAULT_W, h: DEFAULT_H };
  });
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const { startX, startY, startW, startH } = resizeRef.current;
    // Panel anchored bottom-right: dragging top-left corner UP-LEFT grows the panel.
    const dx = startX - e.clientX;
    const dy = startY - e.clientY;
    const maxW = Math.min(window.innerWidth * 0.85, 800);
    const maxH = Math.min(window.innerHeight * 0.85, 900);
    setSize({
      w: Math.max(MIN_W, Math.min(maxW, startW + dx)),
      h: Math.max(MIN_H, Math.min(maxH, startH + dy)),
    });
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(size)); } catch { /* noop */ }
  };
  // Q24: persist messages across page navigations + page reloads via localStorage.
  // Backend chat_memory table is also linked via session id once the user logs in.
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; actions?: ActionProposal[] }[]>(
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
    // Q22: every chat send now carries the user's current page + a snapshot of
    // what's visible on it (truncated innerText of <main>) so the assistant can
    // answer page-aware questions instead of saying "I can't see your screen".
    const page_path = typeof window !== "undefined" ? location : undefined;
    const page_title = typeof document !== "undefined" ? document.title : undefined;
    const page_content = readPageContentSnapshot();
    if (isOnboarding) {
      return {
        service_name: chatContext!.service_name,
        service_id: chatContext!.service_id,
        fields: chatContext!.fields,
        current_responses: chatContext!.current_responses,
        page_path,
        page_title,
        page_content,
      };
    }
    return {
      surface: "help",
      skip_escalation: escalationCooldown > 0,
      page_path,
      page_title,
      page_content,
    };
  }

  // Q25: detect cross-day reopens — show "Previous conversation" banner the
  // first time the widget is opened after >24h of inactivity, provided some
  // history exists.
  useEffect(() => {
    if (!open) return;
    try {
      const last = parseInt(localStorage.getItem(LAST_OPEN_KEY) ?? "0", 10);
      const now = Date.now();
      if (last > 0 && now - last > DAY_MS && messages.length > 0) {
        setShowHistoryBanner(true);
      }
      localStorage.setItem(LAST_OPEN_KEY, String(now));
    } catch { /* noop */ }
    // intentionally only run on transition to open=true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

      // Q30b: parse + sanitize ACTION_PROPOSAL from server response. The
      // server already whitelisted to /portal/* paths; we re-validate here
      // as defence in depth and to drop any malformed entries before render.
      const safeActions: ActionProposal[] | undefined = Array.isArray(data.actions)
        ? data.actions
            .filter((a: any) => {
              if (!a || typeof a.label !== "string" || typeof a.target !== "string") return false;
              if (a.intent === "navigate") {
                return a.target.startsWith("/portal/") && !a.target.includes(":") && !a.target.includes("..");
              }
              if (a.intent === "click") {
                return /^[a-z0-9_-]+$/i.test(a.target) && a.target.length <= 80;
              }
              return false;
            })
            .slice(0, 3)
            .map((a: any) => ({
              label: a.label.slice(0, 40),
              intent: a.intent as "navigate" | "click",
              target: a.target,
              hint: typeof a.hint === "string" ? a.hint.slice(0, 200) : undefined,
            }))
        : undefined;

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.reply || "Sorry, something went wrong.",
        actions: safeActions && safeActions.length > 0 ? safeActions : undefined,
      }]);

      // Handle escalation draft (only for help surface)
      if (escalationEnabled && data.escalation_draft) {
        const draft = data.escalation_draft as EscalationDraft;
        setEscalationDraft(draft);
        setDraftSubject(draft.subject);
        setDraftCategory(draft.category);
        setDraftDescription(draft.description);
      }

      // Q23: form-fill proposal — render an inline card with Apply/Skip
      if (data.proposal && Array.isArray(data.proposal.fills) && data.proposal.fills.length > 0) {
        setPendingProposal(data.proposal.fills as FormFillProposal[]);
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

  // Q23: form-fill proposal handlers — Apply calls onApplyFill from the host
  // (e.g. PortalOnboarding) which is responsible for updating the form state.
  // Skip just clears the proposal. Both add an assistant-tone follow-up
  // message to the chat so the customer sees what happened.
  async function applyProposal() {
    if (!pendingProposal || applyingProposal) return;
    setApplyingProposal(true);
    try {
      if (chatContext?.onApplyFill) {
        await chatContext.onApplyFill(pendingProposal);
        setMessages((prev) => [...prev, {
          role: "assistant" as const,
          content: `Done — filled ${pendingProposal.length === 1 ? "1 field" : `${pendingProposal.length} fields`} for you. Please review before saving.`,
        }]);
      } else {
        // No host integration yet — still acknowledge so the user sees feedback
        setMessages((prev) => [...prev, {
          role: "assistant" as const,
          content: "I'd fill the fields for you, but this page hasn't wired up form-fill yet. Capturing your confirmation only.",
        }]);
      }
      setPendingProposal(null);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant" as const,
        content: `Couldn't apply the fill: ${(err as Error).message}. You can fill the fields manually.`,
      }]);
    } finally {
      setApplyingProposal(false);
    }
  }
  function skipProposal() {
    setPendingProposal(null);
    setMessages((prev) => [...prev, {
      role: "assistant" as const,
      content: "Okay — leaving those fields as they are. Tell me if you want me to suggest different values.",
    }]);
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
        <div
          className="fixed bottom-4 right-4 z-50 flex flex-col rounded-xl border border-gray-200 shadow-xl overflow-hidden"
          style={{
            backgroundColor: `rgba(255, 255, 255, ${panelOpacity})`,
            width: size.w,
            height: size.h,
          }}
          data-testid="portal-chat-panel"
        >
          {/* Q25a: resize handle at top-left (panel grows up+left from bottom-right anchor) */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-10"
            style={{ touchAction: "none" }}
            title="Drag to resize"
            data-testid="chat-resize-handle"
            aria-label="Resize chat window"
          >
            {/* tiny visual cue: two diagonal lines in the corner */}
            <svg width="14" height="14" viewBox="0 0 14 14" className="absolute top-0.5 left-0.5 text-white/60 pointer-events-none" aria-hidden="true">
              <path d="M3 11 L11 3 M6 11 L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-[#2D6A4F] shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white">{title}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSettings((v) => !v)}
                className={`p-1 rounded text-white ${showSettings ? "bg-white/30" : "hover:bg-white/20"}`}
                aria-label="Chat settings"
                aria-pressed={showSettings}
                data-testid="button-chat-settings"
              >
                <SettingsIcon className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/20 text-white"
                aria-label="Close support chat"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Q25: settings drawer — transparency slider */}
          {showSettings && (
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 space-y-2" data-testid="chat-settings-drawer">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-gray-600 uppercase tracking-wide">Window transparency</label>
                <span className="text-[10px] text-gray-500">{Math.round(panelOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.7"
                max="1"
                step="0.05"
                value={panelOpacity}
                onChange={(e) => setPanelOpacity(parseFloat(e.target.value))}
                className="w-full"
                aria-label="Window transparency"
                data-testid="slider-chat-opacity"
              />
              <p className="text-[10px] text-gray-500">Affects the window only — message bubbles stay readable.</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Q25: history banner on next-day reopen with prior messages */}
            {showHistoryBanner && messages.length > 0 && (
              <div className="flex items-center gap-2 -mt-1 mb-1 px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded text-[11px] text-gray-500" data-testid="banner-prior-conversation">
                <History className="w-3 h-3 shrink-0 text-gray-400" />
                <span className="flex-1">Previous conversation — picking up where you left off.</span>
                <button
                  onClick={() => setShowHistoryBanner(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
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
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-[#2D6A4F] text-white" : "bg-gray-100 text-gray-700"
                }`}>
                  {m.content}
                </div>
                {m.role === "assistant" && m.actions && m.actions.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[85%]" data-testid={`chat-actions-${i}`}>
                    {m.actions.map((a, j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => {
                          if (a.intent === "navigate") {
                            // Re-validate target once more before navigating.
                            if (!a.target.startsWith("/portal/") || a.target.includes("..") || a.target.includes(":")) return;
                            setLocation(a.target);
                            setOpen(false);
                            return;
                          }
                          if (a.intent === "click") {
                            // Q30b v2: dispatch click on the element matching the
                            // proposed data-testid. Re-validate target shape, then
                            // close the chat panel so the operator sees the
                            // resulting state change (e.g. a confirm toast).
                            if (!/^[a-z0-9_-]+$/i.test(a.target)) return;
                            const el = document.querySelector(`[data-testid="${a.target}"]`) as HTMLElement | null;
                            if (!el) {
                              toast({ title: "Couldn't find that button on this page", description: "It may have moved or already been used.", variant: "destructive" });
                              return;
                            }
                            el.click();
                            setOpen(false);
                          }
                        }}
                        title={a.hint}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#2D6A4F] bg-white border border-[#2D6A4F]/30 rounded-full hover:bg-[#F0F7F4] hover:border-[#2D6A4F]/60 transition-colors"
                        data-testid={`chat-action-${i}-${j}`}
                      >
                        {a.label}
                        <span aria-hidden="true">{a.intent === "navigate" ? "→" : "✓"}</span>
                      </button>
                    ))}
                  </div>
                )}
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

            {/* Q23: form-fill proposal card */}
            {pendingProposal && pendingProposal.length > 0 && (
              <div className="border border-[#2D6A4F]/30 bg-[#F0F7F4] rounded-lg p-3 space-y-2" data-testid="form-fill-proposal">
                <div className="flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-[#2D6A4F]" />
                  <p className="text-xs font-medium text-gray-900">
                    Suggested fill ({pendingProposal.length} field{pendingProposal.length === 1 ? "" : "s"})
                  </p>
                </div>
                <div className="space-y-1.5">
                  {pendingProposal.map((fill, i) => {
                    const label = chatContext?.fields?.find((f) => f.key === fill.field_key)?.label ?? fill.field_key;
                    return (
                      <div key={i} className="text-[11px] bg-white rounded border border-gray-100 px-2 py-1.5">
                        <p className="font-medium text-gray-700">{label}</p>
                        <p className="text-gray-900 break-words">{fill.value}</p>
                        {fill.reason && <p className="text-[10px] text-gray-500 mt-0.5">{fill.reason}</p>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={applyProposal}
                    disabled={applyingProposal}
                    className="px-3 py-1 text-xs font-medium text-white bg-[#2D6A4F] rounded hover:bg-[#1B4332] disabled:opacity-60 transition-colors"
                    data-testid="button-apply-fill"
                  >
                    {applyingProposal ? "Applying..." : "Apply"}
                  </button>
                  <button
                    onClick={skipProposal}
                    disabled={applyingProposal}
                    className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                    data-testid="button-skip-fill"
                  >
                    Skip
                  </button>
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
            {/* Q25: subtle "safe to close" reassurance */}
            <p className="px-3 pb-2 text-[10px] text-gray-400 leading-snug">
              You can close this — your conversation stays saved.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
