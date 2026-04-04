import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, ChevronDown, Send, MessageCircle, Plus, CheckCircle2,
  HelpCircle, CreditCard, Wrench, ClipboardList, Calculator,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";

/* ─── FAQ Data ─── */
const FAQS = [
  {
    question: "How does getting started work?",
    answer: "After you purchase a service, we'll ask you to fill in a short setup form (2–3 minutes). This gives us the info we need to get started — things like your business name, services you offer, and any access details. You can find pending setup forms on your Services page.",
    icon: ClipboardList,
  },
  {
    question: "How does billing work?",
    answer: "You'll receive an invoice when a service is provisioned. Monthly services are billed automatically each month. One-time services are charged once. You can view all your invoices and payment history on the Billing page.",
    icon: CreditCard,
  },
  {
    question: "How do I access my QuoteQuick dashboard?",
    answer: "If you have a QuoteQuick calculator, you'll see a summary card on your portal dashboard with an 'Open Dashboard' button. This opens your full QuoteQuick dashboard in a new tab where you can manage leads, analytics, and settings.",
    icon: Calculator,
  },
  {
    question: "What happens after I buy a service?",
    answer: "Once payment is confirmed, we set up your service and send you a short setup form. You'll see the status on your Services page and get notified when we need anything from you.",
    icon: Wrench,
  },
  {
    question: "How do I request changes or updates?",
    answer: "Use the contact form at the bottom of this page to submit a ticket. Describe what you need, optionally select the related service, and we'll get back to you. You can track all your tickets in the history section below.",
    icon: HelpCircle,
  },
];

/* ─── FAQ Accordion ─── */
function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Frequently Asked Questions</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {FAQS.map((faq, i) => {
          const open = openIndex === i;
          const Icon = faq.icon;
          return (
            <button
              key={i}
              onClick={() => setOpenIndex(open ? null : i)}
              className="w-full text-left px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm font-medium text-gray-800">{faq.question}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </div>
              {open && (
                <p className="text-sm text-gray-600 mt-2 ml-7 leading-relaxed">{faq.answer}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── AI Help Section ─── */
function AiHelpSection() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const SUGGESTIONS = [
    "How do I complete my setup form?",
    "When will my service go live?",
    "How do I check my billing status?",
    "What does my service include?",
  ];

  async function send(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    const updated = [...messages, { role: "user" as const, content: msg }];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          context: { surface: "help" },
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "Sorry, something went wrong." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-[#2D6A4F]" />
        <h2 className="text-sm font-semibold text-gray-900">Ask AI</h2>
      </div>
      <div className="p-4">
        {/* Messages */}
        <div className="min-h-[120px] max-h-[300px] overflow-y-auto space-y-3 mb-3">
          {messages.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400 mb-3">Ask anything about your services, billing, or account.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-[#2D6A4F] text-white" : "bg-gray-100 text-gray-700"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-3 py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {/* Input */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Type your question..."
            className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F]"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="px-3 py-2.5 rounded-lg bg-[#2D6A4F] text-white hover:bg-[#1B4332] disabled:opacity-40 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Ticket Form + History ─── */
function TicketSection() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: ticketData } = useQuery<{ tickets: TicketRow[] }>({
    queryKey: ["/api/portal/tickets"],
    queryFn: async () => {
      const res = await fetch("/api/portal/tickets", { credentials: "include" });
      if (!res.ok) return { tickets: [] };
      return res.json();
    },
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create ticket");
      return res.json();
    },
    onSuccess: () => {
      setSubject("");
      setMessage("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tickets"] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    createTicket.mutate();
  }

  const tickets = ticketData?.tickets ?? [];

  return (
    <div className="space-y-4">
      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Contact Us</h2>
          <p className="text-xs text-gray-500 mt-0.5">Submit a ticket and we'll get back to you.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Question about my MapGuard service"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Message <span className="text-red-400">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what you need help with..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F] resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!message.trim() || createTicket.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] disabled:opacity-60 transition-colors"
            >
              {createTicket.isPending ? "Submitting..." : "Submit Ticket"}
            </button>
            {success && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ticket submitted
              </span>
            )}
            {createTicket.error && (
              <span className="text-xs text-red-600">Failed to submit ticket. Please try again.</span>
            )}
          </div>
        </form>
      </div>

      {/* History */}
      {tickets.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Your Tickets</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {tickets.map((t) => (
              <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{t.subject || t.description.slice(0, 60)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    #{t.id} &middot; {formatDate(t.created_at)}
                    {t.updated_at && t.updated_at !== t.created_at && (
                      <> &middot; Updated {formatDate(t.updated_at)}</>
                    )}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ml-3 ${TICKET_STATUS[t.status] || "bg-gray-100 text-gray-600"}`}>
                  {TICKET_STATUS_LABELS[t.status] || t.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Types + Helpers ─── */
interface TicketRow {
  id: number;
  subject: string | null;
  status: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
}

const TICKET_STATUS: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/* ─── Main Page ─── */
export default function PortalHelp() {
  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Help</h1>
          <p className="text-sm text-gray-500 mt-0.5">Find answers, ask AI, or contact us.</p>
        </div>

        {/* FAQ */}
        <FaqSection />

        {/* AI Help */}
        <AiHelpSection />

        {/* Contact / Tickets */}
        <TicketSection />
      </div>
    </PortalLayout>
  );
}
