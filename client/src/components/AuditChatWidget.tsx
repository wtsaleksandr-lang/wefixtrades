import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import s from "../pages/marketing/FreeAuditReport.module.css";
import {
  getSessionId, readSSEStream, sendChatMessage,
  loadMessages, saveMessages, loadOpenState, saveOpenState,
  type ChatMessage,
} from "@/lib/chatHelpers";

interface AuditChatWidgetProps {
  businessName: string;
  trade: string;
  city: string;
  score: number;
  grade: string;
  actionPlan: any[];
  estimatedRevenueLoss: any;
  reportId?: string;
  detectedIssueIds?: string[];
}

export default function AuditChatWidget(props: AuditChatWidgetProps) {
  const { businessName, trade, city, score, grade, actionPlan, estimatedRevenueLoss, reportId, detectedIssueIds } = props;

  const greeting = useRef<ChatMessage>({
    role: "assistant",
    content: actionPlan?.[0]
      ? `Hi! I've reviewed your audit for ${businessName}. Your most urgent issue is ${actionPlan[0].title} — this could be worth ${actionPlan[0].estimatedImpact || "significant revenue"} in additional leads. Want me to explain what's happening and how to fix it?`
      : `Hi! I've reviewed your audit for ${businessName}. Your score is ${score}/100 (grade ${grade}). Ask me anything about your results!`,
  }).current;

  const [open, setOpen] = useState(() => loadOpenState());
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadMessages();
    return saved.length > 0 ? saved : [greeting];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showDot, setShowDot] = useState(() => loadMessages().length <= 1);
  const [pulsing, setPulsing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(getSessionId());

  // Stop pulsing after 15s
  useEffect(() => {
    const t = setTimeout(() => setPulsing(false), 15000);
    return () => clearTimeout(t);
  }, []);

  // Auto-open after 8s on audit page
  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(prev => {
        if (!prev) {
          setShowDot(false);
          saveOpenState(true);
          return true;
        }
        return prev;
      });
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  // Persist messages and open state
  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { saveOpenState(open); }, [open]);

  // Scroll to bottom within the chat container (not the page)
  useEffect(() => {
    const container = chatMessagesRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, streaming]);

  // Native wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const el = chatMessagesRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      const { scrollTop, scrollHeight, clientHeight } = el!;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) {
        e.preventDefault();
      }
      e.stopPropagation();
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]); // Re-attach when chat opens/closes

  function openChat() {
    setOpen(true);
    setShowDot(false);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    // Auto-open if closed
    if (!open) {
      setOpen(true);
      setShowDot(false);
    }

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setStreaming(true);

    try {
      const res = await sendChatMessage({
        surface: "audit",
        messages: newMessages,
        sessionId: sessionId.current,
        reportId,
        auditContext: {
          businessName, trade, city, score, grade,
          topIssues: actionPlan?.slice(0, 5)?.map((a: any) => ({
            title: a.title,
            estimatedImpact: a.estimatedImpact,
            priority: a.priority,
          })),
          actionPlan: actionPlan?.slice(0, 5),
          estimatedRevenueLoss,
          detectedIssueIds,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: "assistant", content: err.error || "Sorry, something went wrong. Try again in a moment." }]);
        setStreaming(false);
        return;
      }

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);
      await readSSEStream(res, (fullText) => {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: fullText };
          return copy;
        });
      });
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          copy[copy.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
        } else {
          copy.push({ role: "assistant", content: "Something went wrong. Please try again." });
        }
        return copy;
      });
    }
    setStreaming(false);
  }

  return (
    <>
      {!open && (
        <button
          className={`${s.chatBubble} ${pulsing ? s.chatBubblePulse : ""}`}
          onClick={openChat}
          aria-label="Open chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          {showDot && <span className={s.chatDot}>1</span>}
        </button>
      )}

      {open && (
        <div className={s.chatWindow} onWheel={e => e.stopPropagation()}>
          <div className={s.chatHeader}>
            <div className={s.chatHeaderInfo}>
              <div className={s.chatHeaderTitle}>WeFixTrades AI Advisor</div>
              <div className={s.chatHeaderSub}>
                <span className={s.chatOnline} /> Ask me about your report
              </div>
            </div>
            <button className={s.chatClose} onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </div>

          <div ref={chatMessagesRef} className={s.chatMessages}>
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === "assistant" ? s.chatMsgAi : s.chatMsgUser}>
                {msg.content || "\u00A0"}
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div className={s.typingDots}>
                <span /><span /><span />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={s.chatInputArea}>
            <input
              className={s.chatInput}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask anything about your audit..."
              disabled={streaming}
            />
            <button className={s.chatSend} onClick={handleSend} disabled={streaming} aria-label="Send">
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
