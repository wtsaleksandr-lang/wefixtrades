import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Loader2, Search, ChevronRight, MessageSquare } from "lucide-react";

/* ─── Types ─── */
interface TicketRow {
  id: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  description: string;
  client_id: number;
  client_name: string | null;
  assigned_to: number | null;
  source: string;
  created_at: string | null;
  updated_at: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_message_author: string | null;
}

interface TicketCounts {
  total: number;
  open: number;
  in_progress: number;
  waiting_on_customer: number;
  resolved: number;
  closed: number;
}

/* ─── Constants ─── */
const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_on_customer", label: "Waiting on Client" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "service", label: "Service" },
  { value: "onboarding", label: "Onboarding" },
  { value: "access", label: "Access" },
  { value: "other", label: "Other" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  waiting_on_customer: "bg-blue-50 text-blue-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_on_customer: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "text-gray-500",
  normal: "text-gray-700",
  high: "text-orange-600",
  urgent: "text-red-600 font-semibold",
};

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function timeAgo(d: string | null): string {
  if (!d) return "";
  const now = new Date();
  const date = new Date(d);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(d);
}

/* ─── Main Page ─── */
export default function SupportInboxPage() {
  usePageTitle("Support");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: counts } = useQuery<TicketCounts>({
    queryKey: ["/api/admin/crm/support/tickets/counts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/support/tickets/counts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: ticketData, isLoading } = useQuery<{ tickets: TicketRow[] }>({
    queryKey: ["/api/admin/crm/support/tickets", statusFilter, priorityFilter, categoryFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "100");
      const res = await fetch(`/api/admin/crm/support/tickets?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const tickets = ticketData?.tickets ?? [];

  return (
    <AdminLayout pageContext={{ page: "support" }}>
      <div data-theme="light" className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Support Tickets</h1>
            <p className="text-sm text-gray-500">
              {counts ? `${counts.open + counts.in_progress + counts.waiting_on_customer} unresolved` : ""}
            </p>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            const count = tab.value === ""
              ? counts?.total
              : counts?.[tab.value as keyof TicketCounts];
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  active
                    ? "bg-[#0d3cfc] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
                }`}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className={`ml-1.5 ${active ? "text-white/70" : "text-gray-400"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20 focus:border-[#0d3cfc] bg-white"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20 focus:border-[#0d3cfc]"
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20 focus:border-[#0d3cfc]"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Ticket list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No support tickets yet. Tickets will appear here when clients submit them from the portal.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/crm/support/${t.id}`}
                  className="block px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {(t.priority === "urgent" || t.priority === "high") && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                            t.priority === "urgent" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                          }`}>
                            {t.priority}
                          </span>
                        )}
                        <p className="text-sm font-medium text-gray-900 truncate">{t.subject}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">#{t.id}</span>
                        {t.client_name && (
                          <span className="text-xs text-gray-500">{t.client_name}</span>
                        )}
                        <span className="text-xs text-gray-400">&middot;</span>
                        <span className="text-xs text-gray-400">{timeAgo(t.last_message_at || t.created_at)}</span>
                      </div>
                      {t.last_message_preview && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {t.last_message_author === "customer" ? "Customer: " : t.last_message_author === "admin" ? "You: " : ""}
                          {t.last_message_preview}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLES[t.status] || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[t.status] || t.status.replace(/_/g, " ")}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
