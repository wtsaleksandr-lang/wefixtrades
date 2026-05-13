import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Send, BrainCircuit, Loader2, ChevronDown, ChevronUp, Code2, HelpCircle } from "lucide-react";
import { readSSEStream, type ChatMessage, type ToolCallEvent } from "@/lib/chatHelpers";

/* Q30b admin: lightweight action-button protocol shared shape (mirrors
 * the portal-side type but targets /admin/* paths). */
export interface ActionProposal {
  label: string;
  intent: "navigate";
  target: string;
  hint?: string;
}
import ChatAttachmentInput, {
  ChatAttachmentChips,
  type ChatAttachment,
  type ChatAttachmentInputHandle,
} from "@/components/shared/ChatAttachmentInput";

/* ─── Types ─── */
export interface AdminPageContext {
  route: string;
  page: string;
  clientId?: number;
  clientName?: string;
  clientStatus?: string;
  activeServicesCount?: number;
  openTasksCount?: number;
  overdueTasksCount?: number;
  unpaidAmount?: number;
  totalClients?: number;
  monthlyRevenue?: number;
  totalOpenTasks?: number;
  activeFilters?: string;
  topTasks?: Array<{
    id?: number;
    title: string;
    status: string;
    priority: string;
    client_name?: string | null;
    waiting_on?: string | null;
    handled_by?: string | null;
    automation_status?: string | null;
    next_action?: string | null;
  }>;
  latestPayment?: { status: string; amount_cents: number; date: string | null };
  supplierNames?: string[];
  blockedCount?: number;
  statusCounts?: Record<string, number>;
  waitingOnCounts?: Record<string, number>;
  // Overview enrichment
  pendingOnboardingCount?: number;
  // Client detail enrichment
  tradeType?: string;
  serviceNames?: string[];
  onboardingStatus?: string;
  pinnedNotes?: Array<{ content: string; actor_type: string }>;
  // Billing enrichment
  pendingPaymentsCount?: number;
  failedPaymentsCount?: number;
  overduePaymentsCount?: number;
  topPendingPayments?: Array<{ client_name: string; amount_cents: number; due_at: string | null }>;
  // Suppliers enrichment
  supplierCount?: number;
  activeSupplierCount?: number;
  supplierTypes?: Record<string, number>;
  // Services enrichment
  serviceCatalogCount?: number;
  topServicesByClients?: Array<{ name: string; activeClients: number }>;
  /** Admin section label (e.g. "Outbound") */
  section?: string;
}

/* ─── Suggested prompts per page ─── */
const PROMPT_CHIPS: Record<string, string[]> = {
  overview: [
    "What should I focus on first?",
    "What needs attention?",
    "Summarize this page",
  ],
  clients: [
    "Who needs follow-up?",
    "Summarize this page",
    "What am I missing?",
  ],
  client_detail: [
    "Summarize this client",
    "What should happen next?",
    "What is blocked?",
    "Is this client healthy?",
    "Draft a reply for this client",
    "Write an internal note",
  ],
  inbox: [
    "What should I focus on first?",
    "What is blocked?",
    "What am I waiting on?",
    "Summarize the queue",
  ],
  billing: [
    "What is outstanding right now?",
    "Who owes money?",
    "Summarize billing health",
    "Draft a payment follow-up",
  ],
  suppliers: [
    "Summarize this page",
    "What should I know?",
  ],
  services: [
    "Summarize the service catalog",
    "What services are most used?",
  ],
};

/* ─── Storage ─── */
const COPILOT_MESSAGES_KEY = "wft_copilot_messages";
const COPILOT_SESSION_KEY = "wft_copilot_session";

function getCopilotSessionId(): string {
  let id: string | null = null;
  try { id = localStorage.getItem(COPILOT_SESSION_KEY); } catch {}
  if (!id) {
    id = `cop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try { localStorage.setItem(COPILOT_SESSION_KEY, id); } catch {}
  }
  return id;
}

function loadCopilotMessages(): (ChatMessage & { actions?: ActionProposal[] })[] {
  try {
    const raw = localStorage.getItem(COPILOT_MESSAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-30);
    }
  } catch {}
  return [];
}

function saveCopilotMessages(messages: CopilotMessage[]): void {
  try {
    // Q30b admin: preserve `actions` on persisted assistant messages so they
    // survive reload. localStorage is JSON, the field round-trips naturally.
    const persistable = messages.filter(
      (m): m is ChatMessage => m.role === "user" || m.role === "assistant"
    );
    localStorage.setItem(COPILOT_MESSAGES_KEY, JSON.stringify(persistable.slice(-30)));
  } catch {}
}

/* ─── Draft block parsing ─── */

type TextSegment = { kind: "text"; body: string };
type DraftSegment = { kind: "draft"; label: string; body: string };
type Segment = TextSegment | DraftSegment;

function parseSegments(text: string): Segment[] {
  // New instance each call — avoids stateful lastIndex on global regex
  const re = /---\s*DRAFT:\s*([^\n]+?)\s*---\n([\s\S]*?)---\s*END DRAFT\s*---/g;
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const pre = text.slice(last, m.index).trim();
      if (pre) segments.push({ kind: "text", body: pre });
    }
    segments.push({ kind: "draft", label: m[1].trim(), body: m[2].trim() });
    last = re.lastIndex;
  }

  if (last < text.length) {
    const tail = text.slice(last).trim();
    if (tail) segments.push({ kind: "text", body: tail });
  }

  // Fast path: no draft blocks found
  if (segments.length === 0) segments.push({ kind: "text", body: text });
  return segments;
}

/* ─── Draft block renderer ─── */
type SaveState = "idle" | "saving" | "saved" | "error";

function DraftBlock({
  label,
  body,
  onSave,
}: {
  label: string;
  body: string;
  onSave?: (content: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Strip the "⚑ Review before sending" line from clipboard — it's a UI marker, not send-content
  const clipboardText = body.replace(/[⚑✓]\s*Review before sending\s*/gi, "").trim();

  const isNote = /note/i.test(label);

  function handleCopy() {
    navigator.clipboard.writeText(clipboardText).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  async function handleSave() {
    if (!onSave || saveState !== "idle") return;
    setSaveState("saving");
    try {
      await onSave(clipboardText);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }

  return (
    <div className="mt-1.5 rounded-md border border-[#2D6A4F]/20 bg-[#F0F7F4] overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#E8F4EE] border-b border-[#2D6A4F]/15">
        <span className="font-semibold text-[#2D6A4F] uppercase tracking-wide text-[10px]">
          Draft · {label}
        </span>
        <div className="flex items-center gap-1.5">
          {onSave && isNote && (
            <button
              onClick={handleSave}
              disabled={saveState !== "idle"}
              className="text-[10px] font-medium px-2 py-0.5 rounded transition-colors disabled:opacity-60
                text-[#2D6A4F] hover:text-[#1B4332] hover:bg-[#2D6A4F]/10"
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Failed" : "Save to record"}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="text-[10px] font-medium text-[#2D6A4F] hover:text-[#1B4332] px-2 py-0.5 rounded hover:bg-[#2D6A4F]/10 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      {/* Body */}
      <p className="px-3 py-2.5 text-gray-700 whitespace-pre-wrap leading-relaxed">
        {body}
      </p>
    </div>
  );
}

/* ─── Message content renderer ─── */
function MessageContent({
  content,
  onSaveNote,
}: {
  content: string;
  onSaveNote?: (content: string) => Promise<void>;
}) {
  const segments = parseSegments(content);

  // Fast path: no draft blocks — render exactly as before
  if (segments.length === 1 && segments[0].kind === "text") {
    return <>{content}</>;
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          seg.body ? (
            <span key={i} className="block whitespace-pre-wrap mb-1 last:mb-0">
              {seg.body}
            </span>
          ) : null
        ) : (
          <DraftBlock key={i} label={seg.label} body={seg.body} onSave={onSaveNote} />
        )
      )}
    </>
  );
}


/* ─── Tool call message types ─── */
type ToolCallMessage = {
  role: "tool_call";
  callId: string;
  toolName: string;
  display: ToolCallEvent["display"];
  state: "pending" | "confirming" | "done" | "cancelled";
  error?: string;
};

/* Q30b admin: assistant messages can carry parsed ACTION_PROPOSAL buttons.
 * Extends ChatMessage locally so the shared lib type stays minimal. */
type AssistantMessageWithActions = ChatMessage & { actions?: ActionProposal[] };
type CopilotMessage = AssistantMessageWithActions | ToolCallMessage;

/* Q30b admin: parse + sanitize ACTION_PROPOSAL block out of the assembled
 * stream text. Returns the cleaned visible reply + the validated actions.
 * Whitelist: target must start with /admin/, no ".." traversal, no schemes. */
const ACTION_BLOCK_RE = /<<<ACTION_PROPOSAL>>>([\s\S]*?)<<<END_ACTION_PROPOSAL>>>/;
function extractActionProposals(fullText: string): { cleanedText: string; actions?: ActionProposal[] } {
  const match = fullText.match(ACTION_BLOCK_RE);
  if (!match) return { cleanedText: fullText };
  let actions: ActionProposal[] | undefined;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed && Array.isArray(parsed.actions)) {
      const valid = parsed.actions
        .filter((a: any) => a
          && typeof a.label === "string"
          && a.intent === "navigate"
          && typeof a.target === "string"
          && a.target.startsWith("/admin/")
          && !a.target.includes("..")
          && !a.target.includes(":"))
        .slice(0, 3)
        .map((a: any) => ({
          label: a.label.slice(0, 40),
          intent: "navigate" as const,
          target: a.target.slice(0, 200),
          hint: typeof a.hint === "string" ? a.hint.slice(0, 200) : undefined,
        }));
      if (valid.length > 0) actions = valid;
    }
  } catch { /* malformed JSON — strip block but emit no actions */ }
  const cleanedText = fullText.replace(ACTION_BLOCK_RE, "").trim();
  return { cleanedText, actions };
}

/* ─── Confirmation card ─── */
function ConfirmationCard({
  msg,
  onConfirm,
  onCancel,
}: {
  msg: ToolCallMessage;
  onConfirm: (callId: string) => void;
  onCancel: (callId: string) => void;
}) {
  const { display, state, callId, error } = msg;

  if (state === "cancelled") {
    return (
      <div className="rounded-lg px-3 py-2 text-xs bg-gray-50 text-gray-400 italic">
        No changes made.
      </div>
    );
  }

  // "done" state: the narrative assistant message is shown separately; card is hidden
  if (state === "done") return null;

  return (
    <TooltipProvider>
    <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden text-xs w-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-100 border-b border-amber-200">
        <span className="font-semibold text-amber-800 uppercase tracking-wide text-[10px]">⚡ Proposed action</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="w-3 h-3 text-amber-500 cursor-help shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[200px] text-xs">
            The AI has suggested this change. Review the details and confirm to apply it, or cancel to skip.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="px-3 py-2 space-y-1">
        <p className="text-sm font-medium text-gray-900 truncate">"{display.task_title}"</p>
        <p className="text-xs text-gray-600">
          {display.current_status === "unknown" ? (
            <>Set to <span className="font-medium text-gray-800">{display.proposed_status.replace(/_/g, " ")}</span></>
          ) : (
            <>
              <span className="text-gray-400">{display.current_status.replace(/_/g, " ")}</span>
              {" → "}
              <span className="font-medium text-gray-800">{display.proposed_status.replace(/_/g, " ")}</span>
            </>
          )}
        </p>
        {display.reason && (
          <p className="text-xs text-gray-500 italic">{display.reason}</p>
        )}
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
      {state === "pending" && (
        <div className="flex gap-2 px-3 py-2 border-t border-amber-200">
          <button
            onClick={() => onCancel(callId)}
            className="flex-1 text-xs text-gray-500 hover:text-gray-700 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(callId)}
            className="flex-1 text-xs font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] py-1.5 rounded transition-colors"
          >
            Confirm
          </button>
        </div>
      )}
      {state === "confirming" && (
        <div className="px-3 py-2 border-t border-amber-200 text-center">
          <span className="text-xs text-gray-400 flex items-center justify-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Updating…
          </span>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

function ContextPreview({ context }: { context: AdminPageContext }) {
  const [open, setOpen] = useState(false);
  // Strip undefined values for clean display
  const clean = Object.fromEntries(
    Object.entries(context).filter(([, v]) => v !== undefined && v !== null)
  );

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-2 text-left min-h-[36px]"
      >
        <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <Code2 className="w-3 h-3" /> Context
        </span>
        {open ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3">
          <pre className="text-[10px] leading-relaxed text-gray-500 bg-gray-50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(clean, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─── Component ─── */
export default function AdminCopilot({
  open,
  onClose,
  pageContext,
}: {
  open: boolean;
  onClose: () => void;
  pageContext: AdminPageContext;
}) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<CopilotMessage[]>(() => loadCopilotMessages());
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const attachmentInputRef = useRef<ChatAttachmentInputHandle | null>(null);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPendingToolCall = messages.some(
    (m) => m.role === "tool_call" &&
      ((m as ToolCallMessage).state === "pending" || (m as ToolCallMessage).state === "confirming")
  );

  // Save an AI-drafted internal note to the client record
  async function saveNote(content: string) {
    if (!pageContext.clientId) throw new Error("No client");
    const res = await fetch("/api/admin/crm/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        client_id: pageContext.clientId,
        content,
        actor_type: "ai_agent",
      }),
    });
    if (!res.ok) throw new Error("Save failed");
    queryClient.invalidateQueries({
      queryKey: [`/api/admin/crm/clients/${pageContext.clientId}/notes`],
    });
  }

  const onSaveNote = pageContext.page === "client_detail" && pageContext.clientId
    ? saveNote
    : undefined;

  // Confirm a pending tool action
  async function confirmToolCall(callId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "tool_call" && (m as ToolCallMessage).callId === callId
          ? { ...(m as ToolCallMessage), state: "confirming" as const, error: undefined }
          : m
      )
    );
    try {
      const res = await fetch("/api/admin/tool-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ call_id: callId, confirmed: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(body.error || "Failed");
      }
      const { narrative } = await res.json();
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.role === "tool_call" && (m as ToolCallMessage).callId === callId
            ? { ...(m as ToolCallMessage), state: "done" as const }
            : m
        );
        return [...updated, { role: "assistant" as const, content: narrative }];
      });
      // Invalidate task-related queries so the page refreshes
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/fulfillment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      if (pageContext.clientId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/admin/crm/clients/${pageContext.clientId}/fulfillment`],
        });
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "tool_call" && (m as ToolCallMessage).callId === callId
            ? { ...(m as ToolCallMessage), state: "pending" as const, error: err.message }
            : m
        )
      );
    }
  }

  function cancelToolCall(callId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "tool_call" && (m as ToolCallMessage).callId === callId
          ? { ...(m as ToolCallMessage), state: "cancelled" as const }
          : m
      )
    );
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function sendMessage(text: string) {
    /* Allow attachment-only sends — text may be empty if the operator
     * just pasted a screenshot. Block while a previous send streams,
     * a tool-call confirmation is pending, or any attachment is still
     * uploading. */
    const hasUploadedAttachments = attachments.some((a) => a.status === "uploaded");
    if ((!text.trim() && !hasUploadedAttachments) || streaming || hasPendingToolCall) return;
    if (attachments.some((a) => a.status === "pending")) return;

    const attachmentSuffix = hasUploadedAttachments
      ? ` [${attachments.filter((a) => a.status === "uploaded").length} attachment${
          attachments.filter((a) => a.status === "uploaded").length === 1 ? "" : "s"
        }]`
      : "";

    const userMsg: ChatMessage = { role: "user", content: text.trim() + attachmentSuffix };
    const updated: CopilotMessage[] = [...messages, userMsg];
    setMessages(updated);
    saveCopilotMessages(updated);
    setInput("");
    const sentAttachments = attachments.filter((a) => a.status === "uploaded");
    setAttachments([]);
    setStreaming(true);

    // Only send user/assistant messages to the API
    const apiMessages = updated.filter(
      (m): m is ChatMessage => m.role === "user" || m.role === "assistant"
    );

    try {
      // Q26: snapshot what's visible on the page so the copilot can answer
      // about content the structured pageContext doesn't include (statuses,
      // table cells, dropdown labels, etc.). Cap at 2k to keep token cost sane;
      // admin gets a bit more headroom than portal because it sees richer pages.
      const pageContentSnapshot = (() => {
        if (typeof document === "undefined") return undefined;
        const main = document.querySelector("main") ?? document.querySelector("[data-admin-main]") ?? document.body;
        const text = (main as HTMLElement | null)?.innerText ?? "";
        const collapsed = text.replace(/\s+/g, " ").trim().slice(0, 2000);
        return collapsed || undefined;
      })();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          surface: "admin",
          messages: apiMessages.slice(-20),
          sessionId: getCopilotSessionId(),
          pageContext,
          pageContentSnapshot,
          attachments: sentAttachments.map((a) => ({
            url: a.url,
            filename: a.filename,
            mime: a.mime,
            size: a.size,
          })),
        }),
      });

      if (!response.ok) throw new Error("Chat request failed");

      let assistantText = "";
      let toolCallReceived: ToolCallMessage | null = null;
      setMessages([...updated, { role: "assistant" as const, content: "" }]);

      await readSSEStream(
        response,
        (fullText) => {
          assistantText = fullText;
          setMessages([...updated, { role: "assistant" as const, content: fullText }]);
        },
        (toolCall) => {
          toolCallReceived = {
            role: "tool_call",
            callId: toolCall.call_id,
            toolName: toolCall.tool_name,
            display: toolCall.display,
            state: "pending",
          };
          const msgs: CopilotMessage[] = [...updated];
          if (assistantText) msgs.push({ role: "assistant" as const, content: assistantText });
          msgs.push(toolCallReceived);
          setMessages(msgs);
        },
      );

      // Q30b admin: parse ACTION_PROPOSAL block out of the assembled stream
      // text, strip it from the visible reply, and attach validated actions
      // to the assistant message. The block lands at the end of the reply per
      // the system prompt, so the user briefly sees the raw fenced text mid-
      // stream; the snap to cleaned happens here once the stream finishes.
      const { cleanedText, actions } = extractActionProposals(assistantText);

      if (toolCallReceived) {
        // Save only the text portion; tool_call cards are transient
        const persistable: CopilotMessage[] = [...updated];
        if (cleanedText) persistable.push({ role: "assistant" as const, content: cleanedText, actions });
        saveCopilotMessages(persistable);
      } else {
        const final: CopilotMessage[] = [...updated, { role: "assistant" as const, content: cleanedText, actions }];
        setMessages(final);
        saveCopilotMessages(final);
      }
    } catch {
      const errorMsg: ChatMessage = { role: "assistant", content: "Sorry, something went wrong. Please try again." };
      const final: CopilotMessage[] = [...updated, errorMsg];
      setMessages(final);
      saveCopilotMessages(final);
    } finally {
      setStreaming(false);
    }
  }

  function handleClear() {
    setMessages([] as CopilotMessage[]);
    saveCopilotMessages([]);
  }

  const chips = PROMPT_CHIPS[pageContext.page] || PROMPT_CHIPS.overview;

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[380px] flex flex-col bg-white border-l border-gray-200 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-[#2D6A4F]" />
          <span className="text-sm font-semibold text-gray-900">AI Copilot</span>
          <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
            {pageContext.page.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              disabled={streaming || hasPendingToolCall}
              className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1 disabled:opacity-40 disabled:pointer-events-none"
            >
              Clear
            </button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <BrainCircuit className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Ask me about this page.</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">I can explain what you see, suggest next steps, and answer questions.</p>

            {/* Prompt chips */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  disabled={streaming || hasPendingToolCall}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === "tool_call") {
            const tcMsg = msg as ToolCallMessage;
            return (
              <div key={i} className="flex justify-start">
                <div className="w-full max-w-[92%]">
                  <ConfirmationCard
                    msg={tcMsg}
                    onConfirm={confirmToolCall}
                    onCancel={cancelToolCall}
                  />
                </div>
              </div>
            );
          }
          const assistantMsg = msg as AssistantMessageWithActions;
          const actions = msg.role === "assistant" ? assistantMsg.actions : undefined;
          return (
            <div
              key={i}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "max-w-[85%] bg-[#2D6A4F] text-white"
                    : "max-w-[92%] bg-gray-50 text-gray-800"
                }`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : msg.content ? (
                  <MessageContent content={msg.content} onSaveNote={onSaveNote} />
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                  </span>
                )}
              </div>
              {actions && actions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[92%]" data-testid={`copilot-actions-${i}`}>
                  {actions.map((a, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => {
                        // Re-validate once more before navigating (defence in depth).
                        if (!a.target.startsWith("/admin/") || a.target.includes("..") || a.target.includes(":")) return;
                        setLocation(a.target);
                        onClose();
                      }}
                      title={a.hint}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#2D6A4F] bg-white border border-[#2D6A4F]/30 rounded-full hover:bg-[#F0F7F4] hover:border-[#2D6A4F]/60 transition-colors"
                      data-testid={`copilot-action-${i}-${j}`}
                    >
                      {a.label}
                      <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Show chips after conversation too, for follow-up */}
        {messages.length > 0 && !streaming && !hasPendingToolCall && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chips.slice(0, 3).map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-gray-150 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 shrink-0">
        <ChatAttachmentChips
          value={attachments}
          onRemove={(id) => setAttachments(attachments.filter((a) => a.id !== id))}
        />
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-1 items-center p-3"
        >
          <ChatAttachmentInput
            ref={attachmentInputRef}
            value={attachments}
            onChange={setAttachments}
            variant="admin"
            disabled={streaming || hasPendingToolCall}
          />
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => attachmentInputRef.current?.handlePaste(e)}
            placeholder={hasPendingToolCall ? "Confirm or cancel the action above…" : "Ask, or paste a screenshot..."}
            disabled={streaming || hasPendingToolCall}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={
              streaming ||
              hasPendingToolCall ||
              attachments.some((a) => a.status === "pending") ||
              (!input.trim() && !attachments.some((a) => a.status === "uploaded"))
            }
            className="bg-[#2D6A4F] hover:bg-[#1B4332] h-9 w-9 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </form>
      </div>

      {/* Context preview — dev only, never visible in production */}
      {import.meta.env.DEV && <ContextPreview context={pageContext} />}
    </div>
  );
}
