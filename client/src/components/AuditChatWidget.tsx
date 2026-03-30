import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import s from "../pages/marketing/FreeAuditReport.module.css";
import { getSessionId, readSSEStream, sendChatMessage, type ChatMessage } from "@/lib/chatHelpers";

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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [showDot, setShowDot] = useState(true);
  const [pulsing, setPulsing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionId = useRef(getSessionId());

  useEffect(() => {
    const t = setTimeout(() => setPulsing(false), 15000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    autoTimerRef.current = setTimeout(() => {
      if (!hasOpened) openChat();
    }, 8000);
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  function openChat() {
    setOpen(true);
    setHasOpened(true);
    setShowDot(false);
    if (messages.length === 0) {
      const topIssue = actionPlan?.[0];
      const firstMsg = topIssue
        ? `Hi! I've reviewed your audit for ${businessName}. Your most urgent issue is ${topIssue.title} — this could be worth ${topIssue.estimatedImpact || "significant revenue"} in additional leads. Want me to explain what's happening and how to fix it?`
        : `Hi! I've reviewed your audit for ${businessName}. Your score is ${score}/100 (grade ${grade}). Ask me anything about your results!`;
      setMessages([{ role: "assistant", content: firstMsg }]);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

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
      // Replace the empty streaming placeholder with error message
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
        <div className={s.chatWindow}>
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

          <div className={s.chatMessages}>
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
