/**
 * "Meet your AI agents" section for the TradeLine product page.
 *
 * Renders 40 niche-specific AI receptionist cards. Click "Try it" on any
 * card to open a chat + voice demo with that niche's persona loaded.
 *
 * Card design is inspired by /case-studies (icon + tint + capability bullets).
 */

import { useMemo, useState, useEffect, useRef } from "react";
import * as Lucide from "lucide-react";
import { Sparkles, Send, Mic, MicOff, X, Phone, MessageSquare } from "lucide-react";
import { NICHE_CARDS } from "@/data/tradelineNicheCards";
import { mkt, colors } from "@/theme/tokens";
import { useVapiCall } from "@/hooks/useVapiCall";

/* ─── Color tint rotation (mirrors CaseStudies palette) ─── */
const TINTS = [
  { bg: "rgba(102, 232, 250, 0.10)", ink: "#66E8FA", border: "rgba(102, 232, 250, 0.25)" },
  { bg: "rgba(247, 180, 48, 0.10)", ink: "#F7B430", border: "rgba(247, 180, 48, 0.25)" },
  { bg: "rgba(104, 212, 227, 0.10)", ink: "#68D4E3", border: "rgba(104, 212, 227, 0.25)" },
  { bg: "rgba(167, 243, 208, 0.10)", ink: "#A7F3D0", border: "rgba(167, 243, 208, 0.25)" },
  { bg: "rgba(196, 181, 253, 0.10)", ink: "#C4B5FD", border: "rgba(196, 181, 253, 0.25)" },
  { bg: "rgba(253, 186, 116, 0.10)", ink: "#FDBA74", border: "rgba(253, 186, 116, 0.25)" },
];

/** Pretty-print a snake_case slug as a card title fallback. */
function prettyName(slug: string): string {
  return slug
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const VOICE_PRESETS = [
  { id: "professional-female", label: "Professional · Rachel" },
  { id: "friendly-female", label: "Friendly · Bella" },
  { id: "professional-male", label: "Professional · Josh" },
  { id: "friendly-male", label: "Friendly · Adam" },
];

const ALL_SLUGS = Object.keys(NICHE_CARDS).sort();

export default function TradelineAgentGrid() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_SLUGS;
    return ALL_SLUGS.filter((slug) => slug.includes(q) || prettyName(slug).toLowerCase().includes(q));
  }, [search]);

  return (
    <section
      className="py-20 px-6 sm:px-10"
      style={{ backgroundColor: mkt.bg, color: mkt.text }}
      data-testid="tradeline-agent-grid-section"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4 uppercase tracking-wider"
            style={{ backgroundColor: "rgba(102, 232, 250, 0.10)", color: mkt.accent, border: `1px solid rgba(102, 232, 250, 0.25)` }}
          >
            <Sparkles className="w-3 h-3" /> 40 trade-specific agents
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">Meet your AI agents</h2>
          <p className="text-base sm:text-lg max-w-2xl mx-auto" style={{ color: mkt.textMuted }}>
            Every trade has its own knowledge, terminology, and safety rules. We've built a dedicated AI receptionist
            for each — already trained on the questions, codes, and emergency triage for your niche.
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center justify-center mb-8">
          <div className="relative w-full max-w-md">
            <input
              type="search"
              placeholder="Search trades…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{
                backgroundColor: mkt.surface,
                color: mkt.text,
                border: `1px solid ${mkt.border}`,
              }}
            />
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr">
          {filtered.map((slug, i) => (
            <AgentCard key={slug} slug={slug} tint={TINTS[i % TINTS.length]} onTry={() => setOpenSlug(slug)} />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center mt-12 text-sm" style={{ color: mkt.textFaint }}>
            No agents match your search.
          </p>
        )}
      </div>

      {openSlug && <AgentDemoModal slug={openSlug} onClose={() => setOpenSlug(null)} />}
    </section>
  );
}

/* ─── Single card ─── */

function AgentCard({
  slug,
  tint,
  onTry,
}: {
  slug: string;
  tint: { bg: string; ink: string; border: string };
  onTry: () => void;
}) {
  const card = NICHE_CARDS[slug];
  if (!card) return null;

  // Resolve the lucide icon by name. Falls back to Sparkles if not found.
  const IconComp = (Lucide as any)[card.lucideIcon] ?? Sparkles;
  const name = prettyName(slug);

  return (
    <article
      className="rounded-2xl p-5 flex flex-col h-full transition-all hover:scale-[1.01]"
      style={{
        backgroundColor: mkt.surface,
        border: `1px solid ${mkt.border}`,
      }}
      data-testid={`agent-card-${slug}`}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
        style={{ backgroundColor: tint.bg, color: tint.ink, border: `1px solid ${tint.border}` }}
      >
        <IconComp className="w-5 h-5" strokeWidth={1.5} />
      </div>

      <h3 className="text-lg font-semibold mb-1.5">{name}</h3>
      <p className="text-[11px] uppercase tracking-wider mb-3" style={{ color: mkt.textFaint }}>
        AI receptionist
      </p>

      <ul className="space-y-1.5 mb-5 text-sm" style={{ color: mkt.textMuted }}>
        {card.bullets.slice(0, 6).map((b, i) => (
          <li key={i} className="flex gap-2 leading-snug">
            <span style={{ color: tint.ink }} aria-hidden>
              •
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onTry}
        className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
        style={{
          backgroundColor: "rgba(102, 232, 250, 0.10)",
          color: mkt.accent,
          border: `1px solid rgba(102, 232, 250, 0.30)`,
        }}
        data-testid={`agent-try-${slug}`}
      >
        Try this agent <Sparkles className="w-3 h-3" />
      </button>
    </article>
  );
}

/* ─── Demo modal: chat + voice tabs ─── */

interface NicheDemoResponse {
  slug: string;
  name: string;
  defaultTone: string;
  systemPrompt: string;
  firstMessage: string;
  voiceConfig: { provider: string; voiceId: string; label: string; description: string };
}

function AgentDemoModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [tab, setTab] = useState<"chat" | "voice">("chat");
  const [voicePreset, setVoicePreset] = useState<string>("professional-female");
  const [demo, setDemo] = useState<NicheDemoResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    setDemo(null);
    setLoadErr(null);
    fetch(`/api/tradeline-demo/niche/${slug}?voice=${voicePreset}`)
      .then((r) => r.json())
      .then((d: NicheDemoResponse) => {
        if (d?.systemPrompt) setDemo(d);
        else setLoadErr("Failed to load agent");
      })
      .catch(() => setLoadErr("Failed to load agent"));
  }, [slug, voicePreset]);

  const name = demo?.name ?? prettyName(slug);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6" style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl flex flex-col max-h-[90vh]"
        style={{ backgroundColor: mkt.surface, border: `1px solid ${mkt.border}`, color: mkt.text }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: mkt.border }}>
          <div>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: mkt.textFaint }}>Live AI demo</p>
            <h3 className="text-lg font-semibold">{name} — AI receptionist</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:opacity-70" style={{ color: mkt.textMuted }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("chat")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            style={{
              backgroundColor: tab === "chat" ? "rgba(102, 232, 250, 0.10)" : "transparent",
              color: tab === "chat" ? mkt.accent : mkt.textMuted,
              border: `1px solid ${tab === "chat" ? "rgba(102, 232, 250, 0.25)" : mkt.border}`,
            }}
          >
            <MessageSquare className="w-3 h-3" /> Text chat
          </button>
          <button
            type="button"
            onClick={() => setTab("voice")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            style={{
              backgroundColor: tab === "voice" ? "rgba(102, 232, 250, 0.10)" : "transparent",
              color: tab === "voice" ? mkt.accent : mkt.textMuted,
              border: `1px solid ${tab === "voice" ? "rgba(102, 232, 250, 0.25)" : mkt.border}`,
            }}
          >
            <Phone className="w-3 h-3" /> Voice call
          </button>
        </div>

        {/* Body */}
        {loadErr && <p className="px-5 py-4 text-sm" style={{ color: "#FCA5A5" }}>{loadErr}</p>}
        {demo && tab === "chat" && <ChatTab demo={demo} />}
        {demo && tab === "voice" && (
          <VoiceTab demo={demo} voicePreset={voicePreset} onVoiceChange={setVoicePreset} />
        )}
        {!demo && !loadErr && (
          <div className="px-5 py-10 text-sm text-center" style={{ color: mkt.textFaint }}>
            Loading {name} agent…
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Chat tab ─── */

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function ChatTab({ demo }: { demo: NicheDemoResponse }) {
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "assistant", content: demo.firstMessage }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/tradeline-demo/niche-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: demo.slug,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data?.reply ?? "(no reply)" }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "I couldn't reach the demo server. Try again in a moment." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 px-5 pt-3 pb-4">
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 py-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="px-3.5 py-2 rounded-2xl max-w-[80%] text-sm leading-snug"
              style={{
                backgroundColor: m.role === "user" ? "rgba(102, 232, 250, 0.10)" : mkt.sectionLight,
                color: m.role === "user" ? mkt.accent : mkt.text,
                border: `1px solid ${m.role === "user" ? "rgba(102, 232, 250, 0.20)" : mkt.border}`,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-3.5 py-2 text-xs italic" style={{ color: mkt.textFaint }}>
              {demo.name} agent is typing…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Ask the ${demo.name} agent anything…`}
          className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ backgroundColor: mkt.sectionLight, color: mkt.text, border: `1px solid ${mkt.border}` }}
          disabled={sending}
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || sending}
          className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1"
          style={{
            backgroundColor: input.trim() ? "rgba(102, 232, 250, 0.10)" : "transparent",
            color: input.trim() ? mkt.accent : mkt.textFaint,
            border: `1px solid ${input.trim() ? "rgba(102, 232, 250, 0.25)" : mkt.border}`,
          }}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Voice tab (Vapi Web SDK) ─── */

function VoiceTab({
  demo,
  voicePreset,
  onVoiceChange,
}: {
  demo: NicheDemoResponse;
  voicePreset: string;
  onVoiceChange: (id: string) => void;
}) {
  // Stash latest demo + voice in a ref so the Vapi assistantOverrides thunk
  // always reads the freshest values at call-start time, even though the
  // useVapiCall hook only initializes once.
  const demoRef = useRef(demo);
  demoRef.current = demo;

  const vapi = useVapiCall({
    assistantOverrides: () => {
      const d = demoRef.current;
      return {
        model: {
          messages: [{ role: "system", content: d.systemPrompt }],
        },
        firstMessage: d.firstMessage,
        voice: { provider: d.voiceConfig.provider, voiceId: d.voiceConfig.voiceId },
      };
    },
  });
  const isActive = vapi.status === "active" || vapi.status === "connecting";

  async function startCall() {
    await vapi.start();
  }

  return (
    <div className="px-5 pt-3 pb-5 flex flex-col gap-4">
      <div>
        <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: mkt.textFaint }}>
          Voice
        </label>
        <select
          value={voicePreset}
          onChange={(e) => onVoiceChange(e.target.value)}
          disabled={isActive}
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ backgroundColor: mkt.sectionLight, color: mkt.text, border: `1px solid ${mkt.border}` }}
        >
          {VOICE_PRESETS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className="rounded-xl p-5 text-center"
        style={{ backgroundColor: mkt.sectionLight, border: `1px solid ${mkt.border}` }}
      >
        {vapi.status === "idle" && (
          <>
            <Phone className="w-8 h-8 mx-auto mb-2" style={{ color: mkt.textFaint }} />
            <p className="text-sm mb-3" style={{ color: mkt.textMuted }}>
              Live voice demo of the {demo.name} AI agent. The call runs in your browser.
            </p>
            <button
              type="button"
              onClick={startCall}
              className="px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
              style={{ backgroundColor: mkt.accent, color: "#0F172A" }}
            >
              <Phone className="w-4 h-4" /> Start call
            </button>
          </>
        )}
        {(vapi.status === "loading" || vapi.status === "connecting") && (
          <p className="text-sm" style={{ color: mkt.textMuted }}>Connecting to {demo.name} agent…</p>
        )}
        {vapi.status === "active" && (
          <>
            <Mic className={`w-8 h-8 mx-auto mb-2 ${vapi.isAssistantSpeaking ? "animate-pulse" : ""}`} style={{ color: mkt.accent }} />
            <p className="text-sm mb-3" style={{ color: mkt.text }}>
              {vapi.isAssistantSpeaking ? `${demo.name} agent is speaking…` : "Listening — speak to the agent."}
            </p>
            <button
              type="button"
              onClick={() => vapi.stop()}
              className="px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
              style={{ backgroundColor: "rgba(252, 165, 165, 0.10)", color: "#FCA5A5", border: `1px solid rgba(252, 165, 165, 0.30)` }}
            >
              <MicOff className="w-4 h-4" /> End call
            </button>
          </>
        )}
        {vapi.status === "ended" && (
          <>
            <p className="text-sm mb-3" style={{ color: mkt.textMuted }}>Call ended.</p>
            <button
              type="button"
              onClick={startCall}
              className="px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
              style={{ backgroundColor: mkt.accent, color: "#0F172A" }}
            >
              <Phone className="w-4 h-4" /> Call again
            </button>
          </>
        )}
        {vapi.status === "error" && (
          <p className="text-sm" style={{ color: "#FCA5A5" }}>Voice demo unavailable: {vapi.errorMessage}</p>
        )}
      </div>

      <p className="text-[11px] text-center" style={{ color: mkt.textFaint }}>
        Voice powered by Vapi. Audio runs entirely in your browser.
      </p>
    </div>
  );
}
