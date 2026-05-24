/**
 * /admin/system/availability — operating-brand availability toggle.
 *
 * When OFF, the brand's TradeLine assistant uses `away_message` instead of
 * the standard greeting and creates a ticket for every inbound contact.
 *
 * Backed by:
 *   GET  /api/admin/system/availability
 *   POST /api/admin/system/availability
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/AdminLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MessageSquare, AlertTriangle, RotateCw } from "lucide-react";

interface Availability {
  id: number;
  is_available: boolean;
  away_message: string;
  set_at: string | null;
}

export default function SystemAvailabilityPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<Availability>({
    queryKey: ["/api/admin/system/availability"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system/availability", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load availability");
      return res.json();
    },
  });

  const [draftMessage, setDraftMessage] = useState("");
  useEffect(() => { if (data?.away_message && !draftMessage) setDraftMessage(data.away_message); }, [data?.away_message]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { is_available: boolean; away_message?: string }) => {
      const res = await apiRequest("POST", "/api/admin/system/availability", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/system/availability"] });
      toast({ title: "Availability updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  if (isError) {
    return (
      <AdminLayout>
        <div data-theme="light" className="space-y-6">
          <BackButton to="/admin/crm" label="Back to admin" />
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Couldn't load brand availability</p>
              <p className="text-xs text-red-700 mt-1">Check your connection and try again.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <AdminLayout>
        <div data-theme="light" className="space-y-6">
          <BackButton to="/admin/crm" label="Back to admin" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Card className="p-6 border-2 border-gray-200">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          </Card>
          <Card className="p-6 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <div className="flex justify-end">
              <Skeleton className="h-9 w-40 rounded" />
            </div>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const lastSet = data.set_at ? new Date(data.set_at).toLocaleString() : "never";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <BackButton to="/admin/crm" label="Back to admin" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brand availability</h1>
          <p className="text-sm text-gray-500 mt-1">
            When OFF, our TradeLine assistant uses the away message instead of the standard greeting and creates a ticket for every inbound call or text.
          </p>
        </div>

        {/* Big toggle */}
        <Card className={`p-6 border-2 ${data.is_available ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30"}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className={`inline-block w-3 h-3 rounded-full ${data.is_available ? "bg-emerald-500" : "bg-amber-500"}`} />
                <h2 className="text-lg font-semibold text-gray-900">
                  {data.is_available ? "Available — AI handles normally" : "Unavailable — AI takes a message + opens a ticket"}
                </h2>
              </div>
              <p className="text-xs text-gray-500">Last changed: {lastSet}</p>
            </div>
            <Switch
              checked={data.is_available}
              onCheckedChange={(checked) => saveMutation.mutate({ is_available: checked })}
              disabled={saveMutation.isPending}
            />
          </div>
        </Card>

        {/* Away-message editor */}
        <Card className="p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Away message</h3>
          <p className="text-sm text-gray-500 mb-4">
            Used as the first thing the caller hears (and the SMS auto-reply) when availability is OFF. Keep it short and warm.
          </p>
          <textarea
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            className="w-full min-h-[120px] p-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="All of our team members are tied up at the moment..."
          />
          <div className="flex justify-between items-center mt-3">
            <div className="text-xs text-gray-400">{draftMessage.length} characters</div>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate({ is_available: data.is_available, away_message: draftMessage })}
              disabled={saveMutation.isPending || draftMessage === data.away_message}
            >
              Save away message
            </Button>
          </div>
        </Card>

        {/* What happens panel */}
        <Card className="p-6 bg-gray-50/50">
          <h3 className="text-base font-semibold text-gray-900 mb-4">When availability is OFF</h3>
          <ul className="space-y-3 text-sm text-gray-700">
            <li className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <span>Inbound calls hear your away message, then the AI takes a name + number + brief description and confirms a callback.</span>
            </li>
            <li className="flex items-start gap-3">
              <MessageSquare className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <span>Inbound SMS gets an auto-reply with the away message + a ticket reference.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-4 h-4 inline-flex items-center justify-center text-amber-600 mt-0.5 flex-shrink-0">⚑</span>
              <span>Every contact creates a support ticket in <code className="text-xs bg-white border border-gray-200 rounded px-1">/admin/crm/support</code>.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-4 h-4 inline-flex items-center justify-center text-amber-600 mt-0.5 flex-shrink-0">⊘</span>
              <span>Spam and clearly out-of-scope messages are still filtered and never become tickets.</span>
            </li>
          </ul>
        </Card>
      </div>
    </AdminLayout>
  );
}
