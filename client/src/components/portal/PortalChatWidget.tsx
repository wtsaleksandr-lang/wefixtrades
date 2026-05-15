import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  X, Send, Loader2, ClipboardList, CheckCircle2, Settings as SettingsIcon, History, Wand2, Sparkles, ArrowLeft,
} from "lucide-react";
import ChatAttachmentInput, {
  ChatAttachmentChips,
  type ChatAttachment,
  type ChatAttachmentInputHandle,
} from "@/components/shared/ChatAttachmentInput";
import { loadPortalMessages, savePortalMessages } from "@/lib/chatHelpers";
import { useToast } from "@/hooks/use-toast";
import CopilotPromptCard from "@/components/shared/CopilotPromptCard";
import type { CopilotPromptRequest } from "@shared/copilotProtocol";
import { useActiveCopilotForm } from "@/context/CopilotFormContext";

const LAST_OPEN_KEY = "wft_portal_chat_last_open";
const OPACITY_KEY = "wft_portal_chat_opacity";
const WIDTH_KEY = "wft_portal_chat_width";
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_W = 320;
const DEFAULT_W = 384;
const MAX_W_VW_PCT = 0.85; // hard cap at 85% viewport width

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

/* Per-page quick-start prompts. Matches against the current location
 * path; longest-prefix wins. Pages not listed fall back to the generic
 * "default" list. Each entry has 3-4 prompts. */
const SUGGESTIONS_BY_PATH: Array<{ prefix: string; prompts: string[] }> = [
  { prefix: "/portal/onboarding", prompts: [
    "What does this question mean?",
    "Help me fill in my business info",
    "How long does setup take?",
  ]},
  { prefix: "/portal/billing", prompts: [
    "What's my current balance?",
    "When's my next invoice?",
    "How do I update my payment method?",
    "Why was I charged this amount?",
  ]},
  { prefix: "/portal/invoices", prompts: [
    "What invoices are outstanding?",
    "How do I download a receipt?",
    "Can I dispute a charge?",
  ]},
  { prefix: "/portal/payment-methods", prompts: [
    "How do I add a new card?",
    "How do I change my default payment method?",
    "Are bank transfers supported?",
  ]},
  { prefix: "/portal/services", prompts: [
    "What's the status of my services?",
    "When will my service go live?",
    "Any blockers I should know about?",
  ]},
  { prefix: "/portal/catalog", prompts: [
    "Which tier should I pick for my business?",
    "What's the difference between Starter and Pro?",
    "Recommend a bundle for me",
    "What's in this bundle?",
  ]},
  { prefix: "/portal/reviews", prompts: [
    "How does the review widget work?",
    "How do I respond to a negative review?",
    "What's my average rating this month?",
  ]},
  { prefix: "/portal/mapguard", prompts: [
    "What does my MapGuard score mean?",
    "How do I improve my ranking?",
    "What's blocking my listing?",
  ]},
  { prefix: "/portal/socialsync", prompts: [
    "Help me write a post",
    "What should I post about this week?",
    "When are my posts scheduled?",
  ]},
  { prefix: "/portal/rankflow", prompts: [
    "What content is planned for this month?",
    "How do I review an article?",
    "What's my SEO progress?",
  ]},
  { prefix: "/portal/articles", prompts: [
    "Walk me through approving an article",
    "What's pending my review?",
  ]},
  { prefix: "/portal/dispatch", prompts: [
    "What jobs are happening today?",
    "How do I confirm a booking?",
  ]},
  { prefix: "/portal/help", prompts: [
    "How do I contact support?",
    "What's the typical response time?",
    "How do I escalate an issue?",
  ]},
  { prefix: "/portal/settings", prompts: [
    "How do I change my password?",
    "How do I upload my logo?",
    "How do I pause AI automation?",
  ]},
  { prefix: "/portal", prompts: [
    "What needs my attention?",
    "When is my next service activation?",
    "Summarize my dashboard",
  ]},
];

function suggestionsForPath(path: string): string[] {
  const match = SUGGESTIONS_BY_PATH.find((s) => path.startsWith(s.prefix));
  return match?.prompts ?? [
    "What can you help me with?",
    "How do I get started?",
    "Where do I check my billing?",
  ];
}

/**
 * PortalChatWidget — single global portal AI Copilot.
 *
 * Rendered by PortalLayout on every portal page. The open/close state and
 * the trigger button live in PortalLayout's top navbar (mirroring the admin
 * AdminCopilot pattern), so this component is purely the panel.
 *
 * Context-aware:
 *  - Default (no chatContext or surface="help"): general support + escalation
 *  - Onboarding context: form-field-aware assistant, no escalation
 */
export default function PortalChatWidget({
  chatContext,
  open,
  onClose,
}: {
  chatContext?: PortalChatContext;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  // Phase 1a: the form registered by the current page via useCopilotForm()
  // is the universal source of fillable fields. Falls back to the legacy
  // chatContext prop for pages not yet migrated to the hook.
  const registeredForm = useActiveCopilotForm();
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
  // Phase 0: AI-generated confirmation prompt (question + dynamic buttons).
  const [pendingPrompt, setPendingPrompt] = useState<CopilotPromptRequest | null>(null);
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

  // Drag-to-resize from the LEFT edge (panel anchored to the right edge,
  // full viewport height — same as the admin Copilot). Dragging left grows
  // the panel; right shrinks. Clamped MIN_W ≤ w ≤ 85vw. Width persists.
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem(WIDTH_KEY) ?? "", 10);
      if (Number.isFinite(v) && v >= MIN_W) return v;
    } catch { /* noop */ }
    return DEFAULT_W;
  });
  useEffect(() => {
    try { localStorage.setItem(WIDTH_KEY, String(panelWidth)); } catch { /* noop */ }
  }, [panelWidth]);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const handleResizeDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startW: panelWidth };
  };
  const handleResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const { startX, startW } = resizeRef.current;
    const maxW = Math.floor(window.innerWidth * MAX_W_VW_PCT);
    // Dragging LEFT (clientX decreases) increases width.
    const newW = Math.max(MIN_W, Math.min(maxW, startW + (startX - e.clientX)));
    setPanelWidth(newW);
  };
  const handleResizeUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
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

  // Inline chat-history view — replaces the message list + input with a
  // read-only 7-day transcript. A "Return to chat" button brings the live
  // chat back. (Previously this navigated to a separate /portal/chat-history
  // page.)
  const [historyView, setHistoryView] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  async function openHistory() {
    setHistoryView(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch("/api/portal/ai-chat/history", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      const data = await res.json();
      setHistoryMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setHistoryError((e as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }

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
    if (!historyView) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, escalationDraft, historyView]);

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
    // Phase 1a: prefer the form registered via useCopilotForm(); fall back to
    // the legacy chatContext prop for pages not yet migrated.
    const formFields = registeredForm?.fields ?? chatContext?.fields;
    const formValues = registeredForm ? registeredForm.getValues() : chatContext?.current_responses;
    if (isOnboarding) {
      return {
        service_name: chatContext!.service_name,
        service_id: chatContext!.service_id,
        fields: formFields,
        current_responses: formValues,
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
      // A registered form makes form-fill available on any page, not just onboarding.
      ...(formFields && formFields.length > 0
        ? { fields: formFields, current_responses: formValues }
        : {}),
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
    setPendingPrompt(null);

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

      // Phase 0: AI-generated confirmation prompt (server already sanitized it).
      if (data.prompt_request) {
        setPendingPrompt(data.prompt_request as CopilotPromptRequest);
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
      if (registeredForm) {
        await registeredForm.onApply(pendingProposal);
        setMessages((prev) => [...prev, {
          role: "assistant" as const,
          content: `Done — filled ${pendingProposal.length === 1 ? "1 field" : `${pendingProposal.length} fields`} for you. Please review before saving.`,
        }]);
      } else if (chatContext?.onApplyFill) {
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-auto flex flex-col border-l border-gray-200 shadow-xl"
      style={{
        // Mobile: ignore inline width (Tailwind w-full wins). Desktop: use saved panelWidth.
        width: typeof window !== "undefined" && window.innerWidth >= 640 ? panelWidth : undefined,
        backgroundColor: `rgba(255, 255, 255, ${panelOpacity})`,
      }}
      data-testid="portal-chat-panel"
    >
      {/* Resize handle on the LEFT edge — drag left to grow, right to shrink. */}
      <div
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize z-10 hover:bg-[#0d3cfc]/20 transition-colors hidden sm:block"
        style={{ touchAction: "none" }}
        title="Drag to resize"
        data-testid="chat-resize-handle"
        aria-label="Resize AI Copilot panel"
      />

      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#0d3cfc]" aria-hidden="true" />
          <span className="text-sm font-semibold text-gray-900">AI Copilot</span>
          {isOnboarding && (
            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">setup</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!historyView && (
            <button
              type="button"
              onClick={openHistory}
              title="View 7-day chat history"
              className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1"
              data-testid="button-chat-history"
            >
              History
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={`p-1.5 rounded ${showSettings ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"}`}
            aria-label="Chat settings"
            aria-pressed={showSettings}
            data-testid="button-chat-settings"
          >
            <SettingsIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            aria-label="Close AI Copilot"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Q25: settings drawer — transparency slider */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 space-y-2 shrink-0" data-testid="chat-settings-drawer">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-gray-600 uppercase tracking-wide">Panel transparency</label>
            <span className="text-[10px] text-gray-500">{Math.round(panelOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.7"
            max="1"
            step="0.05"
            value={panelOpacity}
            onChange={(e) => setPanelOpacity(parseFloat(e.target.value))}
            className="w-full accent-[#0d3cfc]"
            aria-label="Panel transparency"
            data-testid="slider-chat-opacity"
          />
          <p className="text-[10px] text-gray-500">
            Affects the panel background only — message bubbles stay solid so text remains readable.
            Drag the left edge to resize the panel width.
          </p>
        </div>
      )}

      {historyView ? (
        /* ─── Inline history view ─── */
        <>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/80 shrink-0">
            <button
              type="button"
              onClick={() => setHistoryView(false)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0d3cfc] hover:text-[#0a31d6]"
              data-testid="button-history-return"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Return to chat
            </button>
            <span className="ml-auto text-[10px] text-gray-400 uppercase tracking-wide">7-day history</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3" data-testid="chat-history-transcript">
            {historyLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}
            {historyError && (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3 text-xs text-red-700">
                {historyError}
              </div>
            )}
            {!historyLoading && !historyError && historyMessages.length === 0 && (
              <div className="text-center text-xs text-gray-500 py-10" data-testid="chat-history-empty">
                No conversation history yet. The assistant keeps a 7-day rolling thread — come back after a chat.
              </div>
            )}
            {historyMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user" ? "bg-[#0d3cfc] text-white" : "bg-gray-100 text-gray-800"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ─── Live chat view ─── */
        <>
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
                  {suggestionsForPath(location).map((s, i) => (
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
                  m.role === "user" ? "bg-[#0d3cfc] text-white" : "bg-gray-100 text-gray-700"
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
                            onClose();
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
                            onClose();
                          }
                        }}
                        title={a.hint}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#0d3cfc] bg-white border border-[#0d3cfc]/30 rounded-full hover:bg-[#EEF3FF] hover:border-[#0d3cfc]/60 transition-colors"
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
              <div className="border border-[#0d3cfc]/30 bg-[#EEF3FF] rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 text-[#0d3cfc]" />
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
                        className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#0d3cfc]/30 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">Category</label>
                      <select
                        value={draftCategory}
                        onChange={(e) => setDraftCategory(e.target.value)}
                        className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#0d3cfc]/30 bg-white"
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
                      className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#0d3cfc]/30 bg-white resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={submitEscalationTicket}
                    disabled={!draftSubject.trim() || !draftDescription.trim() || submittingTicket}
                    className="px-3 py-1 text-xs font-medium text-white bg-[#0d3cfc] rounded hover:bg-[#0a31d6] disabled:opacity-60 transition-colors"
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
              <div className="border border-[#0d3cfc]/30 bg-[#EEF3FF] rounded-lg p-3 space-y-2" data-testid="form-fill-proposal">
                <div className="flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-[#0d3cfc]" />
                  <p className="text-xs font-medium text-gray-900">
                    Suggested fill ({pendingProposal.length} field{pendingProposal.length === 1 ? "" : "s"})
                  </p>
                </div>
                <div className="space-y-1.5">
                  {pendingProposal.map((fill, i) => {
                    const fieldDefs = registeredForm?.fields ?? chatContext?.fields;
                    const label = fieldDefs?.find((f) => f.key === fill.field_key)?.label ?? fill.field_key;
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
                    className="px-3 py-1 text-xs font-medium text-white bg-[#0d3cfc] rounded hover:bg-[#0a31d6] disabled:opacity-60 transition-colors"
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

            {/* Phase 0: AI-generated confirmation prompt with dynamic buttons */}
            {pendingPrompt && (
              <CopilotPromptCard
                request={pendingPrompt}
                disabled={loading}
                onRespond={(v) => { setPendingPrompt(null); send(v); }}
              />
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
                className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20 focus:border-[#0d3cfc]"
              />
              <button
                onClick={() => send()}
                disabled={
                  loading ||
                  attachments.some((a) => a.status === "pending") ||
                  (!input.trim() && !attachments.some((a) => a.status === "uploaded"))
                }
                className="p-2 rounded-lg bg-[#0d3cfc] text-white hover:bg-[#0a31d6] disabled:opacity-40 transition-colors"
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
        </>
      )}
    </div>
  );
}
