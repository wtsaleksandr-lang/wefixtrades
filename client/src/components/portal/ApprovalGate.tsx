import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import DeliverableViewer from "./DeliverableViewer";
import type { Deliverable } from "./DeliverableViewer";

interface ApprovalGateTask {
  id: number;
  title: string;
  deliverables?: Deliverable[];
}

interface ApprovalGateProps {
  task: ApprovalGateTask;
  /** Query key to invalidate on success */
  serviceQueryKey: (string | undefined)[];
}

export default function ApprovalGate({ task, serviceQueryKey }: ApprovalGateProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");

  const deliverables: Deliverable[] = Array.isArray(task.deliverables) ? task.deliverables : [];

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/tasks/${task.id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to approve" }));
        throw new Error(data.error || "Failed to approve");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: `"${task.title}" has been approved. We'll move forward.` });
      queryClient.invalidateQueries({ queryKey: serviceQueryKey });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const revisionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/tasks/${task.id}/request-revision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: revisionNotes.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to request revision" }));
        throw new Error(data.error || "Failed to request revision");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Revision requested", description: "We've received your feedback and will update the design." });
      setShowRevisionForm(false);
      setRevisionNotes("");
      queryClient.invalidateQueries({ queryKey: serviceQueryKey });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isPending = approveMutation.isPending || revisionMutation.isPending;

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-gray-900">Your Approval Needed</h2>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          Review the deliverables below for <span className="font-medium">"{task.title}"</span> and let us know if you're happy to proceed.
        </p>
      </div>

      {/* Deliverables */}
      {deliverables.length > 0 && (
        <div className="px-5 py-4 border-b border-gray-100">
          <DeliverableViewer deliverables={deliverables} showThumbnails={true} />
        </div>
      )}

      {/* Action area */}
      <div className="px-5 py-4">
        {!showRevisionForm ? (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm"
            >
              {approveMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Approving...</>
              ) : (
                <><Check className="w-3.5 h-3.5 mr-1.5" /> Approve Design</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowRevisionForm(true)}
              disabled={isPending}
              className="h-9 text-sm"
            >
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
              Request Changes
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                What would you like changed?
              </label>
              <Textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Describe the changes you'd like us to make..."
                className="min-h-[100px] text-sm resize-none"
                disabled={isPending}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => revisionMutation.mutate()}
                disabled={isPending || !revisionNotes.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white h-9 text-sm"
              >
                {revisionMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Sending...</>
                ) : (
                  <><MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Send Revision Notes</>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowRevisionForm(false);
                  setRevisionNotes("");
                }}
                disabled={isPending}
                className="h-9 text-sm text-gray-500"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
