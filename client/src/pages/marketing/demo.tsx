import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Send, Bot, User } from "lucide-react";

const p = {
  colors: {
    accent: "#4A7C6F",
    accentDark: "#1B4332",
    navyBg: "#0B1F3A",
    lightBg: "#F7F8FA",
    surface: "#FFFFFF",
    heading: "#111827",
    body: "#374151",
    muted: "#6B7280",
    border: "#E5E7EB",
    blue: "#2563EB",
  },
  shadows: {
    card: "0 1px 3px rgba(0,0,0,0.05), 0 1px 8px rgba(0,0,0,0.04)",
  },
  radius: { sm: "8px", md: "12px", pill: "999px" },
};

const TRADES = [
  { label: "Plumbing", testid: "trade-chip-plumbing" },
  { label: "Electrical", testid: "trade-chip-electrical" },
  { label: "HVAC", testid: "trade-chip-hvac" },
  { label: "Roofing", testid: "trade-chip-roofing" },
  { label: "Painting", testid: "trade-chip-painting" },
  { label: "Landscaping", testid: "trade-chip-landscaping" },
  { label: "Cleaning", testid: "trade-chip-cleaning" },
  { label: "Flooring", testid: "trade-chip-flooring" },
];

function getInitialMessage(trade: string): string {
  const messages: Record<string, string> = {
    Plumbing: "Hi! I need a quote for a plumbing job.",
    Electrical: "Hi! I need a quote for an electrical job.",
    HVAC: "Hi! I need a quote for an HVAC installation or repair.",
    Roofing: "Hi! I need a quote for a roofing job.",
    Painting: "Hi! I need a quote for a painting job.",
    Landscaping: "Hi! I need a quote for landscaping work.",
    Cleaning: "Hi! I need a quote for a cleaning service.",
    Flooring: "Hi! I need a quote for a flooring project.",
  };
  return messages[trade] || `Hi! I need a quote for a ${trade.toLowerCase()} job.`;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function DemoPage() {
  const [selectedTrade, setSelectedTrade] = useState("Plumbing");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Try the Demo — QuickQuotePro";
  }, []);

  useEffect(() => {
    const initialMsg = getInitialMessage(selectedTrade);
    setMessages([{ role: "user", content: initialMsg }]);
    setInitialized(false);
  }, [selectedTrade]);

  useEffect(() => {
    if (messages.length > 0 && !initialized) {
      setInitialized(true);
      sendMutation.mutate([{ role: "user", content: messages[0].content }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, initialized]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const res = await apiRequest("POST", "/api/ai/demo-chat", {
        messages: msgs,
        trade_category: selectedTrade,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const reply = data?.reply || data?.message || "Thanks for your inquiry! I can help you get a quick estimate. Could you tell me a bit more about the scope of work?";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    },
    onError: () => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Thanks for reaching out about your ${selectedTrade.toLowerCase()} job! I can help you get an estimate. Could you describe the work you need done — for example, the size of the area, number of fixtures, or any specific issues you're dealing with?`,
      }]);
    },
  });

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || sendMutation.isPending) return;
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInputValue("");
    sendMutation.mutate(newMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTradeSelect = (trade: string) => {
    setSelectedTrade(trade);
    setInitialized(false);
  };

  return (
    <MarketingLayout>
      <div data-testid="demo-page" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Page Header */}
        <div style={{ background: p.colors.lightBg, padding: "60px 24px 48px", borderBottom: `1px solid ${p.colors.border}` }}>
          <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
            <div style={{
              display: "inline-block",
              background: "#EFF6FF",
              color: "#2563EB",
              padding: "4px 14px",
              borderRadius: p.radius.pill,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              marginBottom: 20,
            }}>
              Live Demo
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, color: p.colors.heading, margin: "0 0 14px", letterSpacing: "-0.02em" }}>
              See It In Action
            </h1>
            <p style={{ fontSize: 18, color: p.colors.muted, margin: 0 }}>
              Try a live quote calculator + AI employee. No login required.
            </p>
          </div>
        </div>

        {/* Demo Panels */}
        <div style={{ background: p.colors.surface, padding: "48px 24px" }}>
          <div style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 32,
            alignItems: "start",
          }}>
            {/* LEFT: Trade Selector */}
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: p.colors.heading, margin: "0 0 20px" }}>
                Choose a trade
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10 }}>
                {TRADES.map(({ label, testid }) => (
                  <button
                    key={label}
                    data-testid={testid}
                    onClick={() => handleTradeSelect(label)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: p.radius.sm,
                      border: `1.5px solid ${selectedTrade === label ? p.colors.accent : p.colors.border}`,
                      background: selectedTrade === label ? p.colors.accent : p.colors.surface,
                      color: selectedTrade === label ? "#FFFFFF" : p.colors.body,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 13, color: p.colors.muted, marginTop: 20, lineHeight: 1.6 }}>
                Select a trade to load a pre-configured AI assistant. The AI will ask relevant questions and provide a ballpark estimate.
              </p>
            </div>

            {/* RIGHT: Chat Demo */}
            <div style={{
              border: `1px solid ${p.colors.border}`,
              borderRadius: p.radius.md,
              boxShadow: p.shadows.card,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column" as const,
              height: 480,
            }}>
              {/* Chat Header */}
              <div style={{
                background: p.colors.navyBg,
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: p.colors.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Bot size={18} color="#FFFFFF" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>QuickQuote AI</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{selectedTrade} specialist</div>
                </div>
                <div style={{
                  marginLeft: "auto",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#22C55E",
                }} />
              </div>

              {/* Messages */}
              <div style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column" as const,
                gap: 12,
                background: "#F9FAFB",
              }}>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                      gap: 8,
                      alignItems: "flex-end",
                    }}
                  >
                    {msg.role === "assistant" && (
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: p.colors.accent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <Bot size={14} color="#FFFFFF" />
                      </div>
                    )}
                    <div style={{
                      maxWidth: "75%",
                      padding: "10px 14px",
                      borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      background: msg.role === "user" ? p.colors.accent : "#FFFFFF",
                      color: msg.role === "user" ? "#FFFFFF" : p.colors.body,
                      fontSize: 14,
                      lineHeight: 1.55,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    }}>
                      {msg.content}
                    </div>
                    {msg.role === "user" && (
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#E5E7EB",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <User size={14} color="#6B7280" />
                      </div>
                    )}
                  </div>
                ))}
                {sendMutation.isPending && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: p.colors.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <Bot size={14} color="#FFFFFF" />
                    </div>
                    <div style={{
                      padding: "10px 16px",
                      borderRadius: "16px 16px 16px 4px",
                      background: "#FFFFFF",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      display: "flex",
                      gap: 4,
                      alignItems: "center",
                    }}>
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "#9CA3AF",
                            animation: "pulse 1.2s ease-in-out infinite",
                            animationDelay: `${i * 0.2}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{
                borderTop: `1px solid ${p.colors.border}`,
                padding: "12px 16px",
                background: p.colors.surface,
                display: "flex",
                gap: 10,
                alignItems: "flex-end",
              }}>
                <input
                  data-testid="demo-chat-input"
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask for an estimate..."
                  style={{
                    flex: 1,
                    border: `1.5px solid ${p.colors.border}`,
                    borderRadius: p.radius.sm,
                    padding: "8px 12px",
                    fontSize: 14,
                    color: p.colors.body,
                    background: p.colors.surface,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  data-testid="demo-chat-send"
                  onClick={handleSend}
                  disabled={sendMutation.isPending || !inputValue.trim()}
                  style={{
                    padding: "8px 14px",
                    borderRadius: p.radius.sm,
                    background: inputValue.trim() ? p.colors.accent : "#D1D5DB",
                    color: "#FFFFFF",
                    border: "none",
                    cursor: inputValue.trim() ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    transition: "background 0.15s ease",
                  }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div style={{ background: p.colors.lightBg, padding: "64px 24px", borderTop: `1px solid ${p.colors.border}` }}>
          <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: p.colors.heading, margin: "0 0 14px", letterSpacing: "-0.02em" }}>
              Ready to build your own?
            </h2>
            <p style={{ fontSize: 18, color: p.colors.muted, margin: "0 0 32px", lineHeight: 1.6 }}>
              Set up your quote calculator and AI employee in under 10 minutes.
            </p>
            <Link
              href="/Wizard"
              data-testid="button-build-yours"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 32px",
                borderRadius: p.radius.sm,
                background: p.colors.accent,
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: 700,
                textDecoration: "none",
                transition: "background 0.15s ease",
              }}
            >
              Build Yours Free →
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
