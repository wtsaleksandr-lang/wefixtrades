import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { Plus, Copy, Trash2, Pencil, Sparkles, HelpCircle, Layers } from "lucide-react";

/* ─── Types ─── */
interface Sequence {
  id: number;
  campaign_id: number | null;
  name: string;
  trade_filter: string | null;
  region_filter: string | null;
  icp: string | null;
  pain_point: string | null;
  offer: string | null;
  sender_persona: string | null;
  tone: string | null;
  ai_personalize: boolean;
  status: "draft" | "active" | "archived";
  owner_id: number | null;
  created_at: string;
  updated_at: string;
}
interface SequenceRow { sequence: Sequence; step_count: number }
interface Step {
  id: number;
  sequence_id: number;
  order_index: number;
  delay_days: number;
  subject_template: string;
  body_template: string;
  ai_personalize: boolean;
}

/* ─── Status badge — outline, not bright fill (Rule 4) ─── */
const STATUS_OUTLINE: Record<string, string> = {
  draft:    "border-gray-300 text-gray-600",
  active:   "border-green-400 text-green-700",
  archived: "border-gray-300 text-gray-400",
};
function StatusBadge({ status }: { status: string }) {
  return (
    <span
      data-theme="light"
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border bg-card ${STATUS_OUTLINE[status] ?? "border-gray-300 text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

/* ─── Create Sequence Dialog ─── */
function CreateSequenceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    trade_filter: "",
    region_filter: "",
    tone: "direct",
    ai_personalize: false,
    initial_subject: "",
    initial_body: "",
  });

  useCopilotForm({
    formLabel: "New outreach sequence",
    fields: [
      { key: "name", label: "Sequence name" },
      { key: "trade_filter", label: "Trade filter (e.g. plumber, electrician)" },
      { key: "region_filter", label: "Region filter (e.g. Toronto, ON, CA)" },
      { key: "tone", label: "Tone (one of: direct, warm, playful, technical)" },
      { key: "ai_personalize", label: "AI personalize (true | false)" },
      { key: "initial_subject", label: "Step 1 subject template" },
      { key: "initial_body", label: "Step 1 body template" },
    ],
    values: form as unknown as Record<string, unknown>,
    onApply: (fills) => {
      setForm((prev) => {
        const next = { ...prev };
        for (const f of fills) {
          if (f.field_key === "ai_personalize") {
            if (f.value === "true" || f.value === "false") next.ai_personalize = f.value === "true";
            continue;
          }
          if (f.field_key in next) {
            (next as any)[f.field_key] = f.value;
          }
        }
        return next;
      });
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        name: form.name,
        trade_filter: form.trade_filter || null,
        region_filter: form.region_filter || null,
        tone: form.tone || "direct",
        ai_personalize: form.ai_personalize,
        status: "draft",
      };
      if (form.initial_subject.trim() && form.initial_body.trim()) {
        body.initial_step = {
          subject_template: form.initial_subject,
          body_template: form.initial_body,
          delay_days: 0,
        };
      }
      const res = await apiRequest("POST", "/api/admin/outbound/sequences", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/sequences"] });
      toast({ title: "Sequence created" });
      setForm({ name: "", trade_filter: "", region_filter: "", tone: "direct", ai_personalize: false, initial_subject: "", initial_body: "" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl" data-theme="light">
        <DialogHeader><DialogTitle>New outreach sequence</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FieldRow label="Sequence name" tooltip="Internal label — not sent to recipients.">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Q3 Plumbers — Toronto warm intro" />
          </FieldRow>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldRow label="Trade filter" tooltip="Optional — restrict this sequence to one trade.">
              <Input value={form.trade_filter} onChange={(e) => setForm((f) => ({ ...f, trade_filter: e.target.value }))} placeholder="plumber" />
            </FieldRow>
            <FieldRow label="Region filter" tooltip="Optional — restrict to a city / state.">
              <Input value={form.region_filter} onChange={(e) => setForm((f) => ({ ...f, region_filter: e.target.value }))} placeholder="Toronto, ON" />
            </FieldRow>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldRow label="Tone" tooltip="Used by AI personalization (when enabled).">
              <Select value={form.tone} onValueChange={(v) => setForm((f) => ({ ...f, tone: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="playful">Playful</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="AI personalize" tooltip="Marks the sequence as using per-prospect AI tokens. Generation worker is not yet wired in this wave.">
              <Select value={form.ai_personalize ? "true" : "false"} onValueChange={(v) => setForm((f) => ({ ...f, ai_personalize: v === "true" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Off</SelectItem>
                  <SelectItem value="true">On (placeholder)</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
          <FieldRow label="Step 1 subject" tooltip="Use {{first_name}} / {{business_name}} tokens.">
            <Input value={form.initial_subject} onChange={(e) => setForm((f) => ({ ...f, initial_subject: e.target.value }))} placeholder="Quick question about {{business_name}}" />
          </FieldRow>
          <FieldRow label="Step 1 body" tooltip="Plain text. Tokens are substituted at send time.">
            <Textarea
              value={form.initial_body}
              onChange={(e) => setForm((f) => ({ ...f, initial_body: e.target.value }))}
              rows={6}
              className="font-mono text-xs"
              placeholder={"Hi {{first_name}},\n\nNoticed {{business_name}} doesn't have an online quote tool yet — we just shipped one for {{trade}} shops that cut quote time from 30m to 2m.\n\nWorth a 10-minute look?\n\n— {{sender_name}}"}
            />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || mutation.isPending}
            className="bg-[#0d3cfc] hover:bg-[#0b34d6]"
          >
            {mutation.isPending ? "Creating..." : "Create sequence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Sequence Dialog (steps editor) ─── */
function EditSequenceDialog({ sequence, open, onClose }: { sequence: Sequence | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ subject_template: "", body_template: "", delay_days: 1 });
  // Wave 39 — replaces window.confirm for step deletion.
  const [pendingDeleteStepId, setPendingDeleteStepId] = useState<number | null>(null);

  const stepsQuery = useQuery<{ data: Step[] }>({
    queryKey: ["/api/admin/outbound/sequences", sequence?.id, "steps"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/outbound/sequences/${sequence!.id}/steps`, { credentials: "include" });
      return res.json();
    },
    enabled: open && !!sequence,
  });

  const steps = stepsQuery.data?.data ?? [];
  const nextOrder = useMemo(() => (steps.length > 0 ? Math.max(...steps.map((s) => s.order_index)) + 1 : 1), [steps]);

  useCopilotForm({
    formLabel: "New sequence step",
    fields: [
      { key: "subject_template", label: "Subject template (supports {{token}})" },
      { key: "body_template", label: "Body template (plain text, supports {{token}})" },
      { key: "delay_days", label: "Delay days after previous step (integer)" },
    ],
    values: draft as unknown as Record<string, unknown>,
    onApply: (fills) => {
      setDraft((prev) => {
        const next = { ...prev };
        for (const f of fills) {
          if (f.field_key === "delay_days") {
            const n = parseInt(f.value, 10);
            if (Number.isFinite(n)) next.delay_days = n;
            continue;
          }
          if (f.field_key in next) (next as any)[f.field_key] = f.value;
        }
        return next;
      });
    },
    enabled: open && !!sequence,
  });

  const addStep = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/outbound/sequences/${sequence!.id}/steps`, {
        order_index: nextOrder,
        delay_days: draft.delay_days,
        subject_template: draft.subject_template,
        body_template: draft.body_template,
        ai_personalize: sequence?.ai_personalize ?? false,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/sequences", sequence?.id, "steps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/sequences"] });
      toast({ title: "Step added" });
      setDraft({ subject_template: "", body_template: "", delay_days: 1 });
    },
    onError: (err: any) => toast({ title: "Failed to add step", description: err.message, variant: "destructive" }),
  });

  const deleteStep = useMutation({
    mutationFn: async (stepId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/outbound/sequences/${sequence!.id}/steps/${stepId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/sequences", sequence?.id, "steps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/sequences"] });
    },
  });

  if (!sequence) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-theme="light">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            {sequence.name}
            {sequence.ai_personalize && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-brand-blue-300 text-brand-blue-700">
                <Sparkles className="w-3 h-3" />
                AI: enabled
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Steps ({steps.length})</h3>
            {stepsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : steps.length === 0 ? (
              <p className="text-xs text-muted-foreground">No steps yet — add the intro below.</p>
            ) : (
              <ol className="space-y-2">
                {steps.map((s) => (
                  <li key={s.id} className="rounded border border-border p-3 bg-muted/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">
                        Step {s.order_index}
                        {s.order_index > 1 && <span className="text-muted-foreground font-normal"> · +{s.delay_days}d</span>}
                      </span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-600" onClick={() => setPendingDeleteStepId(s.id)} disabled={deleteStep.isPending} aria-label="Delete step">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-xs font-medium text-foreground">{s.subject_template}</p>
                    <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap mt-1 font-sans">{s.body_template}</pre>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="text-sm font-semibold text-foreground mb-2">Add step {nextOrder}</h3>
            <div className="space-y-2">
              <FieldRow label="Subject" tooltip="Supports {{token}} placeholders.">
                <Input value={draft.subject_template} onChange={(e) => setDraft((d) => ({ ...d, subject_template: e.target.value }))} placeholder="Following up on {{business_name}}" />
              </FieldRow>
              <FieldRow label="Body" tooltip="Plain text. Tokens are substituted at send time.">
                <Textarea
                  rows={5}
                  value={draft.body_template}
                  onChange={(e) => setDraft((d) => ({ ...d, body_template: e.target.value }))}
                  className="font-mono text-xs"
                  placeholder="Hi {{first_name}}, just bumping this up..."
                />
              </FieldRow>
              <FieldRow label="Delay days after previous step" tooltip="0 = same day; 3 = wait 3 days after step N-1.">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={draft.delay_days}
                  onChange={(e) => setDraft((d) => ({ ...d, delay_days: parseInt(e.target.value, 10) || 0 }))}
                />
              </FieldRow>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                onClick={() => addStep.mutate()}
                disabled={!draft.subject_template.trim() || !draft.body_template.trim() || addStep.isPending}
                size="sm"
                className="bg-[#0d3cfc] hover:bg-[#0b34d6] gap-1"
              >
                <Plus className="w-3 h-3" />
                {addStep.isPending ? "Adding..." : "Add step"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Wave 39 — confirm step deletion (replaces window.confirm). */}
      <ConfirmDialog
        open={pendingDeleteStepId !== null}
        onOpenChange={(o) => { if (!o) setPendingDeleteStepId(null); }}
        title="Delete this step?"
        description="This cannot be undone."
        destructive
        confirmLabel="Delete"
        pending={deleteStep.isPending}
        onConfirm={() => {
          if (pendingDeleteStepId !== null) deleteStep.mutate(pendingDeleteStepId);
          setPendingDeleteStepId(null);
        }}
      />
    </Dialog>
  );
}

/* ─── FieldRow — help-cue locked top-left, label inside style ─── */
function FieldRow({ label, tooltip, children }: { label: string; tooltip: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="w-3 h-3 text-muted-foreground shrink-0" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[260px] text-xs">{tooltip}</TooltipContent>
        </Tooltip>
        <label className="text-xs font-medium text-foreground">{label}</label>
      </div>
      {children}
    </div>
  );
}

/* ─── Main Page ─── */
/* ─── Generate-with-AI Dialog (multi-agent copy engine preview) ─── */
function GenerateWithAiDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    icp: "",
    painPoint: "",
    offer: "",
    senderPersona: "",
    tone: "direct",
    stepCount: 4,
  });
  const [result, setResult] = useState<any | null>(null);

  const gen = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/outbound/sequences/generate", {
        icp: form.icp,
        painPoint: form.painPoint,
        offer: form.offer,
        senderPersona: form.senderPersona,
        tone: form.tone,
        stepCount: form.stepCount,
      });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const canGen = !!(form.icp.trim() && form.painPoint.trim() && form.offer.trim() && form.senderPersona.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-theme="light">
        <DialogHeader><DialogTitle>Generate a sequence with AI</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FieldRow label="Ideal customer (ICP)" tooltip="Who this targets.">
            <Input value={form.icp} onChange={(e) => setForm((f) => ({ ...f, icp: e.target.value }))} placeholder="owner-operator plumbers, 1-15 employees, US/Canada" />
          </FieldRow>
          <FieldRow label="Primary pain point" tooltip="The problem the offer solves.">
            <Input value={form.painPoint} onChange={(e) => setForm((f) => ({ ...f, painPoint: e.target.value }))} placeholder="missing calls = lost jobs; no time to chase reviews" />
          </FieldRow>
          <FieldRow label="Offer" tooltip="What you're selling — concrete.">
            <Input value={form.offer} onChange={(e) => setForm((f) => ({ ...f, offer: e.target.value }))} placeholder="free local-SEO audit + 14-day MapGuard trial" />
          </FieldRow>
          <FieldRow label="Sender persona" tooltip="Who the email is from.">
            <Input value={form.senderPersona} onChange={(e) => setForm((f) => ({ ...f, senderPersona: e.target.value }))} placeholder="Aleksandr from WeFixTrades, AI tools for trades" />
          </FieldRow>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldRow label="Tone" tooltip="Voice of the emails.">
              <Select value={form.tone} onValueChange={(v) => setForm((f) => ({ ...f, tone: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="playful">Playful</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Steps" tooltip="Emails in the sequence (intro + follow-ups + breakup).">
              <Select value={String(form.stepCount)} onValueChange={(v) => setForm((f) => ({ ...f, stepCount: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 4, 5, 6].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
          <Button onClick={() => gen.mutate()} disabled={!canGen || gen.isPending} className="bg-[#0d3cfc] hover:bg-[#0b34d6] gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {gen.isPending ? "Generating…" : "Generate"}
          </Button>

          {result && (
            <div className="mt-2 space-y-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                {result.qaReport?.warnings?.length ? `${result.qaReport.warnings.length} QA warning(s)` : "QA: clean"}
                {result.models?.drafter ? ` · drafted by ${result.models.drafter}` : ""}
              </p>
              {(result.steps ?? []).map((s: any) => (
                <div key={s.stepNumber} className="rounded-md border border-border p-3">
                  <p className="text-[11px] font-semibold text-primary">Step {s.stepNumber} · day {s.delayDays}</p>
                  <p className="text-sm font-medium mt-1">{s.subjectVariants?.[0] ?? "(no subject)"}</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground mt-1">{s.body}</p>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">Review the drafts, then create a sequence and paste in the steps you want. (One-click save of generated steps is a follow-up.)</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SequencesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [editing, setEditing] = useState<Sequence | null>(null);
  // Wave 39 — replaces window.confirm for sequence deletion.
  const [pendingDelete, setPendingDelete] = useState<Sequence | null>(null);

  const { data, isLoading } = useQuery<{ data: SequenceRow[] }>({
    queryKey: ["/api/admin/outbound/sequences"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/sequences", { credentials: "include" });
      return res.json();
    },
  });

  const duplicate = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/outbound/sequences/${id}/duplicate`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/sequences"] });
      toast({ title: "Sequence duplicated" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/outbound/sequences/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/sequences"] });
      toast({ title: "Sequence deleted" });
    },
  });

  const archive = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/outbound/sequences/${id}?soft=1`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/outbound/sequences"] });
      toast({ title: "Sequence archived" });
    },
  });

  const rows = data?.data ?? [];

  return (
    <AdminLayout pageContext={{ page: "outbound-sequences", section: "Outbound" }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Outreach Sequences</h2>
            <p className="text-sm text-muted-foreground">Multi-step cold-email templates with optional AI personalization.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setGenOpen(true)}>
              <Sparkles className="w-3.5 h-3.5" />
              Generate with AI
            </Button>
            <Button size="sm" className="bg-[#0d3cfc] hover:bg-[#0b34d6] gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              New sequence
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading sequences...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No sequences yet.{" "}
              <button onClick={() => setCreateOpen(true)} className="text-[#0d3cfc] underline">Create your first one</button>.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Trade</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Region</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-0.5 cursor-default">
                          Steps <HelpCircle className="w-3 h-3 text-muted-foreground" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-xs">
                        Number of email steps (intro + followups).
                      </TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">AI</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ sequence: s, step_count }) => (
                  <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground">{s.name}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground capitalize">{s.trade_filter || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{s.region_filter || "—"}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-foreground">{step_count}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-2.5">
                      {s.ai_personalize ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-brand-blue-300 text-brand-blue-700">
                          <Sparkles className="w-3 h-3" />
                          enabled
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">off</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditing(s)}>
                          <Pencil className="w-3 h-3" />
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => duplicate.mutate(s.id)} disabled={duplicate.isPending}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        {s.status !== "archived" ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => archive.mutate(s.id)} disabled={archive.isPending}>
                            Archive
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600" onClick={() => setPendingDelete(s)} disabled={remove.isPending}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateSequenceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <GenerateWithAiDialog open={genOpen} onClose={() => setGenOpen(false)} />
      <EditSequenceDialog sequence={editing} open={!!editing} onClose={() => setEditing(null)} />

      {/* Wave 39 — confirm sequence deletion (replaces window.confirm). */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={pendingDelete ? `Permanently delete "${pendingDelete.name}"?` : "Delete sequence?"}
        description="This cannot be undone."
        destructive
        confirmLabel="Delete sequence"
        pending={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </AdminLayout>
  );
}
