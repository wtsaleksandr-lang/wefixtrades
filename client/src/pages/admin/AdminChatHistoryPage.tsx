/**
 * /admin/chat-history (Q30 final piece — chat history UI).
 *
 * Read-only transcript of the admin's rolling AI Copilot thread.
 * Server stores a 7-day rolling memory per admin user (chat_memory
 * table). This page just fetches + renders.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, MessageSquare, Loader2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/hooks/usePageTitle";

interface HistoryResponse {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  memory: {
    userName?: string;
    businessType?: string;
    previousTopics?: string[];
  } | null;
  updated_at: string | null;
}

export default function AdminChatHistoryPage() {
  usePageTitle("Copilot History");

  const { data, isLoading, error } = useQuery<HistoryResponse>({
    queryKey: ["/api/admin/copilot/history"],
    queryFn: async () => {
      const res = await fetch("/api/admin/copilot/history", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      return res.json();
    },
  });

  const messages = data?.messages ?? [];

  return (
    <AdminLayout pageContext={{ page: "chat_history" }}>
      <div className="max-w-3xl mx-auto space-y-4">
        <Link
          href="/admin/crm"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          data-testid="back-to-admin"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to admin
        </Link>

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-brand-blue" />
            AI Copilot — conversation history
          </h1>
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">
            7-day rolling
          </span>
        </div>

        {data?.memory && (data.memory.previousTopics?.length || data.memory.businessType) && (
          <Card className="p-3 space-y-1.5 bg-gray-50 border-gray-200" data-testid="copilot-memory-card">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Remembered context</p>
            {data.memory.businessType && (
              <p className="text-xs text-gray-700"><span className="text-gray-500">Business type:</span> {data.memory.businessType}</p>
            )}
            {data.memory.previousTopics && data.memory.previousTopics.length > 0 && (
              <p className="text-xs text-gray-700"><span className="text-gray-500">Recent topics:</span> {data.memory.previousTopics.join(", ")}</p>
            )}
          </Card>
        )}

        {isLoading && (
          <div className="space-y-3" data-testid="copilot-history-skeleton">
            <div className="flex justify-start"><Skeleton className="h-16 w-2/3 rounded-lg" /></div>
            <div className="flex justify-end"><Skeleton className="h-16 w-2/3 rounded-lg" /></div>
          </div>
        )}

        {error && (
          <Card className="p-4 border-red-200 bg-red-50 text-red-700 text-sm">
            {(error as Error).message}
          </Card>
        )}

        {!isLoading && !error && messages.length === 0 && (
          <Card className="p-8 text-center text-sm text-gray-500" data-testid="copilot-history-empty">
            No conversation history yet. The Copilot keeps a 7-day rolling thread; come back after chatting.
          </Card>
        )}

        {messages.length > 0 && (
          <div className="space-y-3" data-testid="copilot-history-transcript">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-brand-blue text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
