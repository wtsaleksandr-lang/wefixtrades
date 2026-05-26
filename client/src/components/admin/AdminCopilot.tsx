import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Send, Sparkles, Loader2, ChevronDown, ChevronUp, Code2, HelpCircle, Wand2, Settings as SettingsIcon } from "lucide-react";
import { readSSEStream, type ChatMessage, type ToolCallEvent } from "@/lib/chatHelpers";
import { getNavigationTrail } from "@/lib/chat/pageContext";
import { useToast } from "@/hooks/use-toast";
import CopilotPromptCard from "@/components/shared/CopilotPromptCard";
import CopilotCards from "@/components/shared/CopilotCards";
import { extractCopilotPrompt, extractCopilotCards, type CopilotPromptRequest, type CopilotCard } from "@shared/copilotProtocol";
import { useActiveCopilotForm } from "@/context/CopilotFormContext";

/* Q30b admin: lightweight action-button protocol shared shape (mirrors
 * the portal-side type but targets /admin/* paths). */
export interface ActionProposal {
  label: string;
  intent: "navigate" | "click";
  /* For navigate: path that must start with /admin/.
   * For click: data-testid value matching ^[a-z0-9_-]+$. The widget calls
   * .click() on document.querySelector(`[data-testid="${target}"]`). */
  target: string;
  hint?: string;
}

/* Q30c: per-field schema a page declares when it wants the AI to be able
 * to propose prefills. The widget renders an Apply/Skip card when the AI
 * returns valid fills; clicking Apply calls _onApplyFormFill with the
 * proposed values. The page's setState updates from there. */
export interface FormFillField {
  key: string;
  label: string;
  required?: boolean;
  /** Current value displayed as context to the AI (helps "what's filled" awareness). */
  currentValue?: string | number | boolean | null;
}
export interface FormFillProposal {
  field_key: string;
  value: string;
  reason?: string;
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
  /** Monitored reviews visible on the reviews page — feeds review tool-use. */
  topReviews?: Array<{
    id?: number;
    reviewer: string;
    rating: number;
    snippet?: string;
    hasDraft?: boolean;
    hasResponse?: boolean;
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
  /* Q30c: a page opts into AI form-fill by declaring its editable fields
   * + an apply handler. The fields[] is sent to the server (so the AI
   * knows what's editable). _onApplyFormFill stays client-only — JSON
   * stringify drops it on the wire automatically. */
  formFillFields?: FormFillField[];
  _onApplyFormFill?: (fills: FormFillProposal[]) => void;
}

/* ─── Suggested prompts per page ─── */
/* Per-page suggestion prompts. Each entry has 3-5 prompts the Copilot
 * surfaces as quick-start chips when the admin lands on the page. Pages
 * not listed fall back to `overview`. */
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
    "Which supplier handles the most tasks?",
    "Any inactive suppliers we should drop?",
    "Cost rate outliers?",
    "Summarize supplier health",
  ],
  services: [
    "Summarize the service catalog",
    "What services are most used?",
    "Any products without Stripe IDs?",
  ],
  product_detail: [
    "Summarize this product",
    "What's editable here?",
    "Any tier without a Stripe price ID?",
    "Draft a tagline for this product",
  ],
  support: [
    "What tickets are oldest?",
    "What's waiting on me?",
    "Summarize support load",
    "Any high-priority tickets?",
  ],
  support_ticket_detail: [
    "Summarize this ticket",
    "Draft a reply",
    "What should happen next?",
    "Is this resolvable now?",
  ],
  alerts: [
    "Which alerts are critical?",
    "What's been unacknowledged longest?",
    "Summarize alert health",
  ],
  audit_log: [
    "What changed in the last 24h?",
    "Any suspicious activity?",
    "Summarize recent edits",
  ],
  reviews: [
    "Any negative reviews to respond to?",
    "Draft a thank-you reply",
    "Review trend this week?",
  ],
  mapguard: [
    "Which clients need attention?",
    "Ranking change this week?",
    "Summarize MapGuard ops",
  ],
  rankflow: [
    "What content is overdue?",
    "Summarize this week's plan",
    "Any client falling behind?",
  ],
  contentflow: [
    "What's in QA queue?",
    "Summarize the article queue",
    "Which articles need approval?",
  ],
  socialsync: [
    "Summarize the social calendar",
    "Any client without posts scheduled?",
    "Draft a caption",
  ],
  tradeline_ops: [
    "Which lines are degraded?",
    "Any auto-response failures?",
    "Summarize TradeLine health",
  ],
  adflow: [
    "Any campaigns missing metrics?",
    "Top ROAS this week?",
    "What needs the most attention?",
  ],
  quotequick: [
    "Most active calculators?",
    "Summarize quote-conversion this week",
  ],
  booking: [
    "Today's upcoming bookings",
    "Any unconfirmed bookings?",
    "Summarize this week",
  ],
  sales: [
    "Top of the pipeline?",
    "Any deals stuck?",
    "Summarize this week's progress",
  ],
  ai_dashboard: [
    "Summarize AI usage this week",
    "Which conversations need review?",
    "Cost trend?",
  ],
  integration_health: [
    "Anything broken right now?",
    "Summarize integration state",
    "Recent downtime?",
  ],
  system_jobs: [
    "Any failed jobs?",
    "Summarize cron health",
    "What's running right now?",
  ],
  system_workers: [
    "Any workers offline?",
    "Summarize worker health",
  ],
  system_availability: [
    "Summarize uptime this week",
    "Any recent incidents?",
  ],
  outbound_prospects: [
    "Who should I contact first?",
    "Any prospects gone cold?",
    "Summarize the queue",
  ],
  outbound_campaigns: [
    "Top-performing campaign?",
    "Any campaign needing approval?",
    "Summarize campaign health",
  ],
  outbound_pipeline: [
    "Top deals in flight",
    "Any deal stuck >30 days?",
    "Summarize pipeline",
  ],
  profile: [
    "What can I change here?",
  ],
  settings: [
    "What can I configure?",
  ],
  change_password: [
    "What are the password rules?",
  ],
  chat_history: [
    "What did we discuss this week?",
  ],
};

/* ─── Storage ─── */
const COPILOT_MESSAGES_KEY = "wft_copilot_messages";
const COPILOT_SESSION_KEY = "wft_copilot_session";
/* Copilot panel size + transparency persisted across mounts. Mirrors the
 * portal widget pattern (Q25/Q25a). Width is for the desktop layout — on
 * mobile the panel uses full viewport width regardless. */
const COPILOT_WIDTH_KEY = "wft_copilot_width";
const COPILOT_OPACITY_KEY = "wft_copilot_opacity";
const MIN_W = 320;
const DEFAULT_W = 380;
const MAX_W_VW_PCT = 0.85;     // hard cap at 85% viewport width
const MIN_OPACITY = 0.7;       // floor so message text remains readable

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
    <div data-theme="light" className="mt-1.5 rounded-md border border-brand-blue/20 bg-[#EEF3FF] overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#DEE7FF] border-b border-brand-blue/15">
        <span className="font-semibold text-brand-blue uppercase tracking-wide text-[10px]">
          Draft · {label}
        </span>
        <div className="flex items-center gap-1.5">
          {onSave && isNote && (
            <button
              onClick={handleSave}
              disabled={saveState !== "idle"}
              className="text-[10px] font-medium px-2 py-0.5 rounded transition-colors disabled:opacity-60
                text-brand-blue hover:text-brand-blue-600 hover:bg-brand-blue/10"
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Failed" : "Save to record"}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="text-[10px] font-medium text-brand-blue hover:text-brand-blue-600 px-2 py-0.5 rounded hover:bg-brand-blue/10 transition-colors"
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
type AssistantMessageWithActions = ChatMessage & {
  actions?: ActionProposal[];
  cards?: CopilotCard[];
  /* Wave 12D — alert investigation "Run fix" buttons parsed from the
   * [BUTTON: …] markers in the assistant reply. */
  alertFixButtons?: AlertFixButton[];
};
type CopilotMessage = AssistantMessageWithActions | ToolCallMessage;

/* Q30b admin: parse + sanitize ACTION_PROPOSAL block out of the assembled
 * stream text. Returns the cleaned visible reply + the validated actions.
 * Whitelist: target must start with /admin/, no ".." traversal, no schemes. */
const ACTION_BLOCK_RE = /<<<ACTION_PROPOSAL>>>([\s\S]*?)<<<END_ACTION_PROPOSAL>>>/;
const FORM_FILL_BLOCK_RE = /<<<FORM_FILL>>>([\s\S]*?)<<<END_FORM_FILL>>>/;
const TEST_ID_RE = /^[a-z0-9_-]+$/i;

/* Wave 12D — Alert investigation "[BUTTON: <label> | action: <name> | alertId: <id>]"
 * marker emitted by the AI when in ALERT INVESTIGATION mode. The marker is
 * parsed client-side, stripped from the visible message, and rendered as a
 * styled "Run fix" button. Clicking POSTs to /api/admin/alerts/run-fix —
 * the server validates the action against its OWN whitelist. The client
 * whitelist below is a UX guard so we don't render a button for an action
 * the server will reject. */
const ALERT_FIX_BUTTON_RE = /\[BUTTON:\s*([^|\]]+?)\s*\|\s*action:\s*([a-z0-9-]+)\s*\|\s*alertId:\s*(\d+)\s*\]/gi;
const ALERT_FIX_ACTION_WHITELIST = new Set([
  "acknowledge",
  "retry-vapi-assistant",
  "retry-mapguard-scan",
  "mark-known-issue",
]);
interface AlertFixButton {
  label: string;
  action: string;
  alertId: number;
}

function extractAlertFixButtons(fullText: string): { cleanedText: string; buttons?: AlertFixButton[] } {
  const buttons: AlertFixButton[] = [];
  const re = new RegExp(ALERT_FIX_BUTTON_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    const label = m[1].trim().slice(0, 60);
    const action = m[2].trim().toLowerCase();
    const alertId = parseInt(m[3], 10);
    if (!ALERT_FIX_ACTION_WHITELIST.has(action)) continue;
    if (!Number.isFinite(alertId) || alertId <= 0) continue;
    // Hard rule from the wave spec: AT MOST one button per reply.
    if (buttons.length >= 1) continue;
    buttons.push({ label, action, alertId });
  }
  const cleanedText = fullText.replace(ALERT_FIX_BUTTON_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanedText, buttons: buttons.length > 0 ? buttons : undefined };
}

/* Q30c: parse FORM_FILL block out of the assembled stream + validate
 * against the field list the page declared. Returns sanitized fills. */
function extractFormFill(fullText: string, allowedKeys: Set<string>): { cleanedText: string; fills?: FormFillProposal[] } {
  const match = fullText.match(FORM_FILL_BLOCK_RE);
  if (!match) return { cleanedText: fullText };
  let fills: FormFillProposal[] | undefined;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed && Array.isArray(parsed.fills)) {
      const valid = parsed.fills
        .filter((f: any) => f
          && typeof f.field_key === "string"
          && typeof f.value === "string"
          && (allowedKeys.size === 0 || allowedKeys.has(f.field_key)))
        .slice(0, 5)
        .map((f: any) => ({
          field_key: f.field_key.slice(0, 100),
          value: String(f.value).slice(0, 2000),
          reason: typeof f.reason === "string" ? f.reason.slice(0, 300) : undefined,
        }));
      if (valid.length > 0) fills = valid;
    }
  } catch { /* malformed JSON — strip block but emit no fills */ }
  const cleanedText = fullText.replace(FORM_FILL_BLOCK_RE, "").trim();
  return { cleanedText, fills };
}

function extractActionProposals(fullText: string): { cleanedText: string; actions?: ActionProposal[] } {
  const match = fullText.match(ACTION_BLOCK_RE);
  if (!match) return { cleanedText: fullText };
  let actions: ActionProposal[] | undefined;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed && Array.isArray(parsed.actions)) {
      const valid = parsed.actions
        .filter((a: any) => {
          if (!a || typeof a.label !== "string" || typeof a.target !== "string") return false;
          if (a.intent === "navigate") {
            return a.target.startsWith("/admin/")
              && !a.target.includes("..")
              && !a.target.includes(":");
          }
          if (a.intent === "click") {
            return TEST_ID_RE.test(a.target) && a.target.length <= 80;
          }
          return false;
        })
        .slice(0, 3)
        .map((a: any) => ({
          label: a.label.slice(0, 40),
          intent: a.intent as "navigate" | "click",
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
        <p className="text-sm font-medium text-gray-900">{display.title}</p>
        {display.lines.map((line, i) => (
          <p key={i} className="text-xs text-gray-600 break-words">{line}</p>
        ))}
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
            className="flex-1 text-xs font-medium text-white bg-brand-blue hover:bg-brand-blue-600 py-1.5 rounded transition-colors"
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
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<CopilotMessage[]>(() => loadCopilotMessages());
  /* Q30c: pending form-fill proposal — rendered as an Apply/Skip card under
   * the chat transcript. Cleared on Apply, Skip, or new user turn. */
  const [pendingFormFill, setPendingFormFill] = useState<FormFillProposal[] | null>(null);
  const [applyingFormFill, setApplyingFormFill] = useState(false);
  // Phase 0: AI-generated confirmation prompt (question + dynamic buttons).
  const [pendingPrompt, setPendingPrompt] = useState<CopilotPromptRequest | null>(null);
  // Phase 1a: a form registered via useCopilotForm() is the universal form-fill
  // target; falls back to pageContext.formFillFields for not-yet-migrated pages.
  const registeredForm = useActiveCopilotForm();
  const formFieldDefs = registeredForm?.fields ?? pageContext.formFillFields;

  /* Resize + transparency (mirrors portal Q25/Q25a). Width is for desktop
   * only; mobile always full-width. Opacity floor 0.7 keeps text readable. */
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem(COPILOT_WIDTH_KEY) ?? "", 10);
      if (Number.isFinite(v) && v >= MIN_W) return v;
    } catch { /* noop */ }
    return DEFAULT_W;
  });
  const [panelOpacity, setPanelOpacity] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem(COPILOT_OPACITY_KEY) ?? "");
      if (!isNaN(v) && v >= MIN_OPACITY && v <= 1) return v;
    } catch { /* noop */ }
    return 1;
  });
  useEffect(() => {
    try { localStorage.setItem(COPILOT_WIDTH_KEY, String(panelWidth)); } catch { /* noop */ }
  }, [panelWidth]);
  useEffect(() => {
    try { localStorage.setItem(COPILOT_OPACITY_KEY, String(panelOpacity)); } catch { /* noop */ }
  }, [panelOpacity]);

  const [showSettings, setShowSettings] = useState(false);

  // Drag-to-resize from the LEFT edge (panel anchored right). Dragging
  // left grows the panel; right shrinks. Clamped MIN_W ≤ w ≤ 85vw.
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
  const [input, setInput] = useState("");
  /* Wave 12D — per-button local state for the "Run fix" CTAs rendered next
   * to assistant messages. Keyed by `${messageIndex}-${alertId}-${action}`. */
  const [alertFixState, setAlertFixState] = useState<Record<string, "idle" | "running" | "done" | "error">>({});
  const [alertFixResults, setAlertFixResults] = useState<Record<string, string>>({});
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

  /* Wave 12D — POST a whitelisted Run-fix action against an alert. Both the
   * client-side button (which only renders for whitelisted action names) and
   * the server route enforce the whitelist; the server is the authority. */
  async function runFixAction(messageIndex: number, btn: AlertFixButton) {
    const key = `${messageIndex}-${btn.alertId}-${btn.action}`;
    setAlertFixState((s) => ({ ...s, [key]: "running" }));
    try {
      const res = await fetch("/api/admin/alerts/run-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ alertId: btn.alertId, action: btn.action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { message } = await res.json();
      setAlertFixState((s) => ({ ...s, [key]: "done" }));
      setAlertFixResults((s) => ({ ...s, [key]: message || "Fix ran successfully." }));
      toast({ title: "Fix ran", description: message || "Action completed." });
      // Invalidate alert lists so the page refreshes counts / state.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inbox"] });
    } catch (err: any) {
      setAlertFixState((s) => ({ ...s, [key]: "error" }));
      setAlertFixResults((s) => ({ ...s, [key]: err?.message || "Failed to run fix" }));
      toast({ title: "Fix failed", description: err?.message || "Action did not complete.", variant: "destructive" });
    }
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  /* Wave 12D — Alert Investigation Panel.
   *
   * Other admin pages (SystemAlertsPage) dispatch
   *   window.dispatchEvent(new CustomEvent("copilot:seed-and-send", { detail: { text } }))
   * to programmatically open the Copilot with a pre-filled investigation
   * prompt. We listen here so the dispatch site doesn't need a ref to this
   * component. The seed text becomes the next user message and is sent
   * immediately, without going through the input box.
   *
   * Guarded: only fires when the panel is open AND nothing is streaming —
   * otherwise the event is dropped to avoid clobbering an in-flight turn.
   */
  const sendMessageRef = useRef<((text: string) => void) | null>(null);
  useEffect(() => {
    function handler(ev: Event) {
      const detail = (ev as CustomEvent).detail;
      const text = typeof detail?.text === "string" ? detail.text : null;
      if (!text || !text.trim()) return;
      if (!open) return; // parent must open the panel first
      if (streaming || hasPendingToolCall) return;
      sendMessageRef.current?.(text);
    }
    window.addEventListener("copilot:seed-and-send", handler as EventListener);
    return () => window.removeEventListener("copilot:seed-and-send", handler as EventListener);
  }, [open, streaming, hasPendingToolCall]);

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
    // Q30c: a new turn supersedes any unanswered fill proposal.
    setPendingFormFill(null);
    // Phase 0: a new turn also supersedes any unanswered confirmation prompt.
    setPendingPrompt(null);

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

      // Phase 1a: when a page registered a form via useCopilotForm(), use it
      // as the page's formFillFields so the AI knows what it can fill.
      const effectivePageContext = registeredForm
        ? {
            ...pageContext,
            formFillFields: registeredForm.fields.map((f) => {
              const v = registeredForm.getValues()[f.key];
              return {
                key: f.key,
                label: f.label,
                required: f.required,
                currentValue:
                  typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                    ? v
                    : v == null
                      ? null
                      : String(v),
              };
            }),
          }
        : pageContext;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          surface: "admin",
          messages: apiMessages.slice(-20),
          sessionId: getCopilotSessionId(),
          pageContext: effectivePageContext,
          pageContentSnapshot,
          /* Persistent-chat: include the navigation trail captured by
           * AdminLayout's per-route effect. Lets the admin AI handle
           * "what page was I just on?" without forcing the operator
           * to retype context after every click. */
          recent_navigation: getNavigationTrail().map((s) => ({
            route: s.route,
            page_title: s.page_title,
            visible_entities: s.visible_entities,
            ts: s.ts,
          })),
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

      // Q30b admin + Q30c: extract ACTION_PROPOSAL first, then FORM_FILL from
      // the already-cleaned text. Both blocks land at the end of the reply per
      // the system prompt, so the user briefly sees the raw fenced text mid-
      // stream; the snap to cleaned happens here once the stream finishes.
      const allowedKeys = new Set((effectivePageContext.formFillFields ?? []).map((f) => f.key));
      const afterActions = extractActionProposals(assistantText);
      const afterFills = extractFormFill(afterActions.cleanedText, allowedKeys);
      // Phase 0: extract the COPILOT_PROMPT block, then the CARDS block.
      const afterPrompt = extractCopilotPrompt(afterFills.cleanedText);
      // Wave 12A: extract COPILOT_CARDS recommendation tiles.
      const afterCards = extractCopilotCards(afterPrompt.cleanedText);
      // Wave 12D: extract alert-investigation Run-fix buttons.
      const afterAlertButtons = extractAlertFixButtons(afterCards.cleanedText);
      const cleanedText = afterAlertButtons.cleanedText;
      const actions = afterActions.actions;
      const cards = afterCards.cards;
      const alertFixButtons = afterAlertButtons.buttons;
      if (afterFills.fills && afterFills.fills.length > 0) {
        setPendingFormFill(afterFills.fills);
      }
      if (afterPrompt.prompt) {
        setPendingPrompt(afterPrompt.prompt);
      }

      if (toolCallReceived) {
        // Save only the text portion; tool_call cards are transient
        const persistable: CopilotMessage[] = [...updated];
        if (cleanedText) persistable.push({ role: "assistant" as const, content: cleanedText, actions, cards, alertFixButtons });
        saveCopilotMessages(persistable);
      } else {
        const final: CopilotMessage[] = [...updated, { role: "assistant" as const, content: cleanedText, actions, cards, alertFixButtons }];
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

  // Wave 12D — Keep the ref pointed at the freshest sendMessage closure so
  // the copilot:seed-and-send event handler can call it without remounting.
  sendMessageRef.current = sendMessage;

  function handleClear() {
    setMessages([] as CopilotMessage[]);
    saveCopilotMessages([]);
  }

  const chips = PROMPT_CHIPS[pageContext.page] || PROMPT_CHIPS.overview;

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-auto flex flex-col border-l border-gray-200 shadow-xl"
      style={{
        // Mobile: ignore inline width (Tailwind w-full wins). Desktop: use saved panelWidth.
        width: typeof window !== "undefined" && window.innerWidth >= 640 ? panelWidth : undefined,
        backgroundColor: `rgba(255, 255, 255, ${panelOpacity})`,
      }}
      data-testid="copilot-panel"
    >
      {/* Resize handle on the LEFT edge — drag left to grow, right to shrink. */}
      <div
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        className="group absolute inset-y-0 left-0 w-2 cursor-ew-resize z-10 hidden sm:flex items-center justify-center hover:bg-brand-blue/10 transition-colors"
        style={{ touchAction: "none" }}
        title="Drag to resize"
        data-testid="copilot-resize-handle"
        aria-label="Resize Copilot panel"
      >
        {/* Always-visible grip so the resize affordance is discoverable. */}
        <div className="h-8 w-1 rounded-full bg-gray-300 group-hover:bg-brand-blue transition-colors" />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-2 border-brand-blue shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-blue" />
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
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-label="Copilot settings"
            aria-pressed={showSettings}
            title="Panel transparency + size"
            className={`p-1.5 rounded ${showSettings ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"}`}
            data-testid="button-copilot-settings"
          >
            <SettingsIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setLocation("/admin/chat-history");
              onClose();
            }}
            title="View 7-day Copilot history"
            className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1"
            data-testid="copilot-history-link"
          >
            History
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Settings drawer — transparency slider. Width is set via the left-edge
          handle so no slider for that. Bubbles stay opaque regardless. */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 space-y-2 shrink-0" data-testid="copilot-settings-drawer">
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
            className="w-full accent-brand-blue"
            data-testid="copilot-opacity-slider"
            aria-label="Panel transparency"
          />
          <p className="text-[10px] text-gray-400">
            Affects the panel background only — chat bubbles stay solid so text remains readable.
            Drag the left edge to resize the panel width.
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Sparkles className="w-8 h-8 text-gray-200 mx-auto mb-3" />
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
          const cards = msg.role === "assistant" ? assistantMsg.cards : undefined;
          const alertFixButtons = msg.role === "assistant" ? assistantMsg.alertFixButtons : undefined;
          return (
            <div
              key={i}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "max-w-[85%] bg-brand-blue text-white"
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
              {cards && cards.length > 0 && (
                <div className="mt-1.5 w-full max-w-[92%]" data-testid={`copilot-cards-${i}`}>
                  <CopilotCards
                    cards={cards}
                    variant="admin"
                    onSelect={(card) => {
                      if (card.href && card.href.startsWith("/admin/")) {
                        setLocation(card.href);
                        onClose();
                        return;
                      }
                      if (card.href && (card.href.startsWith("/") || card.href.startsWith("https://"))) {
                        window.open(card.href, card.href.startsWith("/") ? "_self" : "_blank", "noopener");
                      }
                    }}
                  />
                </div>
              )}
              {actions && actions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[92%]" data-testid={`copilot-actions-${i}`}>
                  {actions.map((a, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => {
                        if (a.intent === "navigate") {
                          if (!a.target.startsWith("/admin/") || a.target.includes("..") || a.target.includes(":")) return;
                          setLocation(a.target);
                          onClose();
                          return;
                        }
                        if (a.intent === "click") {
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-brand-blue bg-white border border-brand-blue/30 rounded-full hover:bg-[#EEF3FF] hover:border-brand-blue/60 transition-colors"
                      data-testid={`copilot-action-${i}-${j}`}
                    >
                      {a.label}
                      <span aria-hidden="true">{a.intent === "navigate" ? "→" : "✓"}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Wave 12D — Alert investigation "Run fix" CTA buttons.
                  Each maps to a whitelisted server-side handler. We render
                  AT MOST ONE per message (spec) — the AI is also instructed
                  to emit at most one marker. State is local; results stay
                  visible after success so the operator sees what ran. */}
              {alertFixButtons && alertFixButtons.length > 0 && (
                <div className="mt-2 w-full max-w-[92%] space-y-1.5" data-testid={`copilot-alert-fix-${i}`}>
                  {alertFixButtons.map((btn, j) => {
                    const key = `${i}-${btn.alertId}-${btn.action}`;
                    const state = alertFixState[key] ?? "idle";
                    const result = alertFixResults[key];
                    return (
                      <div key={j} className="rounded-md border border-amber-200 bg-amber-50 overflow-hidden">
                        <div className="px-3 py-1.5 bg-amber-100 border-b border-amber-200">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            Suggested fix — alert #{btn.alertId}
                          </span>
                        </div>
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-700 truncate">{btn.label}</span>
                          {state === "done" ? (
                            <span className="text-[11px] text-green-600 font-medium shrink-0">Done ✓</span>
                          ) : (
                            <button
                              type="button"
                              disabled={state === "running"}
                              onClick={() => runFixAction(i, btn)}
                              className="px-3 py-1 text-xs font-medium text-white bg-brand-blue hover:bg-brand-blue-600 rounded disabled:opacity-60 shrink-0"
                              data-testid={`copilot-alert-fix-run-${i}-${j}`}
                            >
                              {state === "running" ? "Running…" : state === "error" ? "Retry" : "Run fix"}
                            </button>
                          )}
                        </div>
                        {result && (
                          <p className={`px-3 pb-2 text-[11px] ${state === "error" ? "text-red-600" : "text-gray-600"}`}>
                            {result}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Q30c: FORM_FILL Apply/Skip card — only when the page declared
            fields AND the AI returned a valid proposal. */}
        {pendingFormFill && pendingFormFill.length > 0 && formFieldDefs && formFieldDefs.length > 0 && (
          <div className="border border-brand-blue/30 bg-[#EEF3FF] rounded-lg p-3 space-y-2" data-testid="copilot-form-fill-card">
            <div className="flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-brand-blue" />
              <p className="text-xs font-medium text-gray-900">Apply these to the form?</p>
            </div>
            <ul className="space-y-1.5">
              {pendingFormFill.map((f, idx) => {
                const fieldDef = formFieldDefs?.find((x) => x.key === f.field_key);
                return (
                  <li key={idx} className="text-xs bg-white rounded px-2 py-1.5 border border-gray-200">
                    <div className="font-medium text-gray-800">{fieldDef?.label ?? f.field_key}</div>
                    <div className="text-gray-600 break-all">→ {f.value}</div>
                    {f.reason && <div className="text-[10px] text-gray-400 mt-0.5">{f.reason}</div>}
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={applyingFormFill}
                onClick={async () => {
                  setApplyingFormFill(true);
                  try {
                    // Phase 1a: prefer the form registered via useCopilotForm().
                    if (registeredForm) {
                      await registeredForm.onApply(pendingFormFill);
                    } else {
                      pageContext._onApplyFormFill?.(pendingFormFill);
                    }
                    toast({ title: "Applied to the form", description: `${pendingFormFill.length} field(s) updated. Review + save when ready.` });
                    setPendingFormFill(null);
                  } finally {
                    setApplyingFormFill(false);
                  }
                }}
                className="px-3 py-1 text-xs font-medium text-white bg-brand-blue rounded hover:bg-brand-blue-600 disabled:opacity-60"
                data-testid="copilot-form-fill-apply"
              >
                {applyingFormFill ? "Applying…" : "Apply"}
              </button>
              <button
                type="button"
                onClick={() => setPendingFormFill(null)}
                className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
                data-testid="copilot-form-fill-skip"
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
            disabled={streaming}
            onRespond={(v) => { setPendingPrompt(null); sendMessage(v); }}
          />
        )}

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
            className="bg-brand-blue hover:bg-brand-blue-600 h-9 w-9 shrink-0"
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
