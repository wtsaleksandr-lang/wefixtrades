import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import s from "../pages/marketing/FreeAuditReport.module.css";

type ChatMessage = { role: "user" | "assistant"; content: string };

interface AuditChatWidgetProps {
  businessName: string;
  trade: string;
  city: string;
  score: number;
  grade: string;
  actionPlan: any[];
  estimatedRevenueLoss: any;
}

export default function AuditChatWidget(props: AuditChatWidgetProps) {
  const { businessName, trade, city, score, grade, actionPlan, estimatedRevenueLoss } = props;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [showDot, setShowDot] = useState(true);
  const [pulsing, setPulsing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop pulsing after 15 seconds
  useEffect(() => {
    const t = setTimeout(() => setPulsing(false), 15000);
    return () => clearTimeout(t);
  }, []);

  // Auto-open after 8 seconds with first message
  useEffect(() => {
    autoTimerRef.current = setTimeout(() => {
      if (!hasOpened) {
        openChat();
      }
    }, 8000);
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, []);

  // Scroll to bottom on new messages
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
        ? `Hi! I've reviewed your audit for ${businessName}. Your most urgent issue is ${topIssue.title} \u2014 this could be worth ${topIssue.estimatedImpact || "significant revenue"} in additional leads. Want me to explain what's happening and how to fix it?`
        : `Hi! I've reviewed your audit for ${businessName}. Your score is ${score}/100 (grade ${grade}). Ask me anything about your results!`;
      setMessages([{ role: "assistant", content: firstMsg }]);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setStreaming(true);

    try {
      const res = await fetch("/api/audit/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          auditContext: {
            businessName, trade, city, score, grade,
            topIssue: actionPlan?.[0]?.title || "",
            estimatedLoss: estimatedRevenueLoss,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: "assistant", content: err.error || "Sorry, something went wrong. Try again." }]);
        setStreaming(false);
        return;
      }

      // Stream the response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantText += parsed.text;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: assistantText };
                  return copy;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setStreaming(false);
  }

  return (
    <>
      {/* Floating bubble */}
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

      {/* Chat window */}
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
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask anything..."
              disabled={streaming}
            />
            <button className={s.chatSend} onClick={sendMessage} disabled={streaming} aria-label="Send">
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
