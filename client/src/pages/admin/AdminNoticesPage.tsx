import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";

/**
 * AI Agenda (Phase 3e-ii-a) — the founder's feed of AI escalations. The AI
 * posts here whenever it isn't sure something needs the founder's call.
 */

interface Notice {
  id: number;
  type: string;
  title: string;
  summary: string;
  entity_type: string | null;
  entity_id: number | null;
  status: string;
  created_at: string;
  read_at: string | null;
}

function entityLink(n: Notice): string | null {
  if (n.entity_type === "support_ticket" && n.entity_id) return `/admin/crm/support/${n.entity_id}`;
  if (n.entity_type === "client" && n.entity_id) return `/admin/crm/clients/${n.entity_id}`;
  return null;
}

export default function AdminNoticesPage() {
  usePageTitle("AI Agenda");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ notices: Notice[]; unread_count: number }>({
    queryKey: ["/api/admin/notices"],
  });

  const mark = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/notices/${id}`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }),
  });

  const notices = data?.notices ?? [];

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-gray-900">AI Agenda</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Escalations from the AI — things it wasn't sure about and wants your call on.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : notices.length === 0 ? (
          <Card className="p-8 text-center text-sm text-gray-500">
            Nothing needs your attention. The AI posts here when it's unsure about something.
          </Card>
        ) : (
          <div className="space-y-3">
            {notices.map((n) => {
              const link = entityLink(n);
              const unread = n.status === "unread";
              return (
                <Card key={n.id} className={`p-4 ${unread ? "border-l-2 border-l-[#0d3cfc]" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(n.created_at).toLocaleString()} · {n.status}
                      </p>
                    </div>
                    {unread && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#0d3cfc]">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{n.summary}</p>
                  <div className="flex items-center gap-2 mt-3">
                    {link && (
                      <Link href={link}>
                        <Button variant="outline" size="sm" className="h-8 text-xs">Open</Button>
                      </Link>
                    )}
                    {n.status !== "actioned" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={mark.isPending}
                        onClick={() => mark.mutate({ id: n.id, status: "actioned" })}
                      >
                        Mark done
                      </Button>
                    )}
                    {unread && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        disabled={mark.isPending}
                        onClick={() => mark.mutate({ id: n.id, status: "read" })}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
