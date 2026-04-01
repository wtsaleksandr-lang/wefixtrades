import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Send, BrainCircuit, Loader2 } from "lucide-react";
import { getSessionId, readSSEStream, type ChatMessage } from "@/lib/chatHelpers";

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
  topTasks?: Array<{ title: string; status: string; priority: string }>;
}

/* ─── Storage keys (separate from marketing chat) ─── */
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

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
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

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      let assistantText = "";
      const withPlaceholder = [...updated, { role: "assistant" as const, content: "" }];
      setMessages(withPlaceholder);

      await readSSEStream(response, (fullText) => {
        assistantText = fullText;
        setMessages([...updated, { role: "assistant", content: fullText }]);
      });

      const final = [...updated, { role: "assistant" as const, content: assistantText }];
      setMessages(final);
      saveCopilotMessages(final);
    } catch (err) {
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
          <div className="text-center py-8">
            <BrainCircuit className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Ask me about this page.</p>
            <p className="text-xs text-gray-400 mt-1">I can explain what you see, suggest next steps, and answer questions.</p>
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
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
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
    </div>
  );
}
