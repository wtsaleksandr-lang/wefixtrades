/**
 * /admin/tradeline/ports — Wave 86 Layer 8.
 *
 * Last-resort escape hatch for in-flight ports. Lists every row currently
 * in transit across all clients, sorted oldest-first so stuck rows surface
 * at the top. Three manual actions per row:
 *   - Mark complete (carrier confirmed out-of-band)
 *   - Force-cancel  (give up on the port)
 *   - Send custom SMS (free-form admin → customer)
 *
 * Designed for the ~5% of edge cases the auto-poller can't resolve.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, MessageSquare, RefreshCw } from "lucide-react";

interface InFlightRow {
  id: number;
  client_id: number;
  customer_number: string | null;
  port_status: string | null;
  port_submitted_at: string | null;
  port_last_polled_at: string | null;
  port_twilio_order_sid: string | null;
  port_rejection_code: string | null;
  client_business_name: string;
  client_contact_email: string | null;
  daysInFlight: number;
  translation: {
    title: string;
    fixInstructions: string;
    customerFixable: boolean;
    category: string;
  } | null;
}

interface InFlightResponse {
  rows: InFlightRow[];
  count: number;
}

function statusTone(s: string | null): "default" | "secondary" | "destructive" {
  if (!s) return "secondary";
  if (s.includes("fail") || s === "rejected") return "destructive";
  if (s === "pending_loa") return "destructive";
  return "default";
}

function formatTimestamp(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function AdminTradelinePorts() {
  usePageTitle("TradeLine Ports — Admin");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [msgTarget, setMsgTarget] = useState<InFlightRow | null>(null);
  const [msgBody, setMsgBody] = useState("");

  const listQuery = useQuery<InFlightResponse>({
    queryKey: ["/api/admin/tradeline-ports/in-flight"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tradeline-ports/in-flight", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load ports");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const completeMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/tradeline-ports/${id}/force-complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error("Force complete failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Port marked complete" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline-ports/in-flight"] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/tradeline-ports/${id}/force-cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Admin escape hatch" }),
      });
      if (!res.ok) throw new Error("Force cancel failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Port canceled" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline-ports/in-flight"] });
    },
  });

  const sendMsgMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) => {
      const res = await fetch(`/api/admin/tradeline-ports/${id}/send-message`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("Send failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Message sent" });
      setMsgTarget(null);
      setMsgBody("");
    },
  });

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">TradeLine Ports — In Flight</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every port currently in transit. Sorted oldest-first so stuck rows surface at the top.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        <Card className="p-4">
          {listQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : listQuery.error ? (
            <p className="text-sm text-destructive">Failed to load.</p>
          ) : !listQuery.data || listQuery.data.count === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">
              No ports currently in flight.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Last update</TableHead>
                  <TableHead>Twilio SID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.client_business_name}</div>
                      {r.client_contact_email && (
                        <div className="text-xs text-muted-foreground">
                          {r.client_contact_email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.customer_number || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusTone(r.port_status)}>{r.port_status}</Badge>
                      {r.translation && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {r.translation.title}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{r.daysInFlight}</TableCell>
                    <TableCell className="text-xs">{formatTimestamp(r.port_last_polled_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.port_twilio_order_sid || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeMut.mutate(r.id)}
                          disabled={completeMut.isPending}
                          data-testid={`complete-${r.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelMut.mutate(r.id)}
                          disabled={cancelMut.isPending}
                          data-testid={`cancel-${r.id}`}
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setMsgTarget(r);
                            setMsgBody("");
                          }}
                          data-testid={`message-${r.id}`}
                        >
                          <MessageSquare className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Custom message dialog */}
        <Dialog open={!!msgTarget} onOpenChange={(open: boolean) => !open && setMsgTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Send custom SMS to {msgTarget?.client_business_name}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Will send to {msgTarget?.customer_number}. Plain text, no template.
            </p>
            <Textarea
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              maxLength={320}
            />
            <div className="text-xs text-muted-foreground">{msgBody.length} / 320</div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMsgTarget(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (msgTarget && msgBody.trim()) {
                    sendMsgMut.mutate({ id: msgTarget.id, body: msgBody.trim() });
                  }
                }}
                disabled={!msgBody.trim() || sendMsgMut.isPending}
              >
                Send SMS
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
