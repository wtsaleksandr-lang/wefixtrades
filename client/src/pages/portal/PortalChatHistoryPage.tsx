/**
 * /portal/chat-history (Q30 final piece — chat history UI).
 *
 * Read-only transcript of the user's rolling AI chat thread.
 * Server-side `chat_memory` keeps a 7-day rolling thread keyed by
 * user id (`portal_<userId>`). This page just fetches + renders.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, MessageCircle, Loader2 } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { usePageTitle } from "@/hooks/usePageTitle";

interface HistoryResponse {
  messages: Array<{ role: "user" | "assistant"; content: string; created_at?: string }>;
}

function formatTime(d: string): string {
  try {
    return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function PortalChatHistoryPage() {
  usePageTitle("Chat History");

  const { data, isLoading, error } = useQuery<HistoryResponse>({
    queryKey: ["/api/portal/ai-chat/history"],
    queryFn: async () => {
      const res = await fetch("/api/portal/ai-chat/history", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      return res.json();
    },
  });

  const messages = data?.messages ?? [];

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          data-testid="back-to-portal"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to portal
        </Link>

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[#0d3cfc]" />
            Your chat history
          </h1>
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">7-day rolling</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <Card className="p-4 border-red-200 bg-red-50 text-red-700 text-sm">
            {(error as Error).message}
          </Card>
        )}

        {!isLoading && !error && messages.length === 0 && (
          <Card className="p-8 text-center text-sm text-gray-500" data-testid="chat-history-empty">
            No conversation history yet. The chat assistant keeps a 7-day rolling thread — come back after a chat.
          </Card>
        )}

        {messages.length > 0 && (
          <div className="space-y-3" data-testid="chat-history-transcript">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col gap-0.5 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[#0d3cfc] text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {m.content}
                </div>
                {m.created_at && (
                  <span className="text-xs text-gray-400">
                    {m.role === "user" ? "You" : "Assistant"} · {formatTime(m.created_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
