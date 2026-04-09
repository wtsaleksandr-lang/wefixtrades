import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Send, BrainCircuit, Loader2, ChevronDown, ChevronUp, Code2 } from "lucide-react";
import { readSSEStream, type ChatMessage } from "@/lib/chatHelpers";

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

function loadCopilotMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(COPILOT_MESSAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-30);
    }
  } catch {}
  return [];
}

function saveCopilotMessages(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(COPILOT_MESSAGES_KEY, JSON.stringify(messages.slice(-30)));
  } catch {}
}

/* ─── Context Preview ─── */
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadCopilotMessages());
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!text.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    saveCopilotMessages(updated);
    setInput("");
    setStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          surface: "admin",
          messages: updated.slice(-20),
          sessionId: getCopilotSessionId(),
          pageContext,
        }),
      });

      if (!response.ok) throw new Error("Chat request failed");

      let assistantText = "";
      setMessages([...updated, { role: "assistant" as const, content: "" }]);

      await readSSEStream(response, (fullText) => {
        assistantText = fullText;
        setMessages([...updated, { role: "assistant", content: fullText }]);
      });

      const final = [...updated, { role: "assistant" as const, content: assistantText }];
      setMessages(final);
      saveCopilotMessages(final);
    } catch {
      const errorMsg: ChatMessage = { role: "assistant", content: "Sorry, something went wrong. Please try again." };
      const final = [...updated, errorMsg];
      setMessages(final);
      saveCopilotMessages(final);
    } finally {
      setStreaming(false);
    }
  }

  function handleClear() {
    setMessages([]);
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
              className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1"
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
                  disabled={streaming}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#2D6A4F] text-white"
                  : "bg-gray-50 text-gray-800"
              }`}
            >
              {msg.content || (
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Show chips after conversation too, for follow-up */}
        {messages.length > 0 && !streaming && (
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
      <div className="border-t border-gray-100 p-3 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this page..."
            disabled={streaming}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || streaming}
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
