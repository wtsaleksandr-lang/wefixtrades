/**
 * "Your AI assistant" — the single owner-facing surface that manages ONE
 * assistant across every placement (Calculator widget, Website / TradeLine,
 * Phone). Replaces the scattered AI toggles so an owner sees one clear page.
 *
 * Identity rule (spec §A / Identity rule): this assistant talks to the OWNER's
 * CUSTOMERS and wears the OWNER's brand — it is NOT the "WeFixTrades assistant"
 * concierge (that one is OURS, helping the owner, and lives in the top-bar
 * copilot). The header copy makes that distinction crisp.
 *
 * Audience-tier trust (spec §B, Alex 2026-06-12): a "What your assistant will
 * never share" card is REQUIRED — it converts the leak concern (would it expose
 * my backend rates / margins?) into a selling point: it only knows public-
 * equivalent data + what the owner teaches it here. No "one shared brain"
 * messaging anywhere.
 *
 * Reuse, no new stores:
 *   - Calculator placement on/off → GET/PATCH /api/portal/ai-assistant/* (the
 *     session-authed bridge to the same ai_employee state the dashboard free
 *     toggle writes). Honest status from the shared isAiAssistantActive.
 *   - Website (TradeLine) placement → existing /api/portal/widget/site.
 *   - Teach your assistant → existing tradeline_knowledge_base CRUD
 *     (/api/portal/tradeline/knowledge). Business notes = a single kind:"doc"
 *     entry; Q&A pairs = kind:"faq" entries. ONE place, applies everywhere.
 *   - Appearance & timing → grouped with Teach under one "Assistant settings"
 *     area (Phase 1 consolidation). Still links to the wizard Style tab for the
 *     real controls; never duplicated here. Phase 2 gives the chat widget its
 *     own persisted styling and slots inline where the TODO(phase-2) marks.
 *
 * DS compliance: title-in-field inputs, help cue top-left, theme-aware (NO
 * hard-coded colors), selected = outline not bright fill, ≤3 decisions on the
 * default surface with everything else behind the "Teach your assistant"
 * expander (Tesla/Apple simplicity).
 */

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sparkles,
  Calculator,
  Globe,
  Phone,
  ShieldCheck,
  GraduationCap,
  Palette,
  Plus,
  Trash2,
  Save,
  ChevronDown,
  ExternalLink,
  Info,
  RotateCw,
  AlertCircle,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

/* ─── shared fetch helper ─── */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

/* ─── types ─── */
type WidgetIcon = "chat" | "sparkles" | "help" | "message" | "bot";
type WidgetFont = "inter" | "georgia" | "montserrat" | "merriweather" | "roboto-mono";
interface AiWidgetStyle {
  styleMode: "inherit" | "custom";
  theme: "light" | "dark";
  launcherColor?: string;
  launcherIcon: WidgetIcon;
  greeting?: string;
  font: WidgetFont;
  position: "bottom-right" | "bottom-left";
  visibility?: "rescue" | "always";
}
interface AiStatus {
  hasCalculator: boolean;
  calculator: {
    id: number;
    business_name: string;
    slug: string;
    enabled: boolean;
    active: boolean;
    aiChatVisibility: "off" | "rescue" | "always";
    aiWidget: AiWidgetStyle;
  } | null;
}

/* Phase 2 — option lists for the independent chat-widget styling controls. */
const WIDGET_ICON_OPTIONS: { value: WidgetIcon; label: string }[] = [
  { value: "chat", label: "Chat" },
  { value: "message", label: "Message" },
  { value: "sparkles", label: "Sparkle" },
  { value: "help", label: "Help" },
  { value: "bot", label: "Bot" },
];
const WIDGET_FONT_OPTIONS: { value: WidgetFont; label: string }[] = [
  { value: "inter", label: "Inter" },
  { value: "georgia", label: "Georgia" },
  { value: "montserrat", label: "Montserrat" },
  { value: "merriweather", label: "Merriweather" },
  { value: "roboto-mono", label: "Roboto Mono" },
];
const DEFAULT_LAUNCHER_COLOR = "#6366f1";
const GREETING_CAP = 200;
interface WidgetSite {
  site: { enabled: boolean; site_key?: string } | null;
  tradeType: string | null;
}
type Kind = "faq" | "service" | "policy" | "pricing" | "doc";
interface KbEntry {
  id: string;
  kind: Kind;
  title: string;
  content: string;
  priority: number;
  status: "active" | "draft" | "archived";
}

/* The single business-notes entry is identified by this stable title so the
 * page round-trips ONLY its own entry and never collides with notes the owner
 * authored on the full Knowledge Base page. */
const NOTES_TITLE = "Business notes";
const NOTES_CAP = 2000;
const QA_CAP = 30;

/* ─── placement status pill — honest, theme-aware, outline not bright fill ─── */
type PlacementState = "active" | "paused" | "not_set_up";
function StatusPill({ state }: { state: PlacementState }) {
  const label =
    state === "active" ? "Active" : state === "paused" ? "Paused" : "Not set up";
  const tone =
    state === "active"
      ? "border-green-500/40 text-green-700 dark:text-green-400"
      : state === "paused"
        ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
        : "border-border text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 text-xs font-medium ${tone}`}
      data-testid={`status-pill-${state}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          state === "active"
            ? "bg-green-500"
            : state === "paused"
              ? "bg-amber-500"
              : "bg-muted-foreground/50"
        }`}
      />
      {label}
    </span>
  );
}

export default function PortalYourAiAssistant() {
  usePageTitle("Your AI assistant");
  const qc = useQueryClient();

  /* ── placement: calculator ── */
  const statusQ = useQuery<AiStatus>({
    queryKey: ["/api/portal/ai-assistant/status"],
    queryFn: () => api("/api/portal/ai-assistant/status"),
  });
  /* ── placement: website / TradeLine ── */
  const siteQ = useQuery<WidgetSite>({
    queryKey: ["/api/portal/widget/site"],
    queryFn: () => api("/api/portal/widget/site"),
  });
  /* ── teach: knowledge base ── */
  const kbQ = useQuery<{ entries: KbEntry[] }>({
    queryKey: ["/api/portal/tradeline/knowledge"],
    queryFn: () => api("/api/portal/tradeline/knowledge"),
  });

  const calc = statusQ.data?.calculator ?? null;
  const businessName = calc?.business_name || "your business";

  /* ── calculator placement toggle ── */
  const calcToggleMut = useMutation({
    mutationFn: (enabled: boolean) =>
      api("/api/portal/ai-assistant/calculator-placement", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/ai-assistant/status"] }),
  });

  /* ── website placement toggle (reuses existing widget/site PATCH) ── */
  const siteToggleMut = useMutation({
    mutationFn: (enabled: boolean) =>
      api("/api/portal/widget/site", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/widget/site"] }),
  });

  /* ── derive placement states from the SAME predicates the widgets use ── */
  const calcState: PlacementState = !statusQ.data?.hasCalculator
    ? "not_set_up"
    : calc?.active
      ? "active"
      : calc?.enabled
        ? "paused" // enabled but predicate false (e.g. trial lapsed)
        : "not_set_up";

  const siteState: PlacementState = !siteQ.data?.site
    ? "not_set_up"
    : siteQ.data.site.enabled
      ? "active"
      : "paused";

  /* ── teach: business notes (single doc entry) ── */
  const notesEntry = useMemo(
    () =>
      (kbQ.data?.entries ?? []).find(
        (e) => e.kind === "doc" && e.title === NOTES_TITLE,
      ) ?? null,
    [kbQ.data],
  );
  const qaEntries = useMemo(
    () => (kbQ.data?.entries ?? []).filter((e) => e.kind === "faq"),
    [kbQ.data],
  );

  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  useEffect(() => {
    if (!notesDirty) setNotes(notesEntry?.content ?? "");
  }, [notesEntry, notesDirty]);

  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [teachOpen, setTeachOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  /* ── Phase 2 — independent chat-widget styling form ── */
  const serverWidget = calc?.aiWidget;
  const [widget, setWidget] = useState<AiWidgetStyle>({
    styleMode: "inherit",
    theme: "light",
    launcherIcon: "chat",
    font: "inter",
    position: "bottom-right",
  });
  const [widgetDirty, setWidgetDirty] = useState(false);
  // Hydrate from the server once (and whenever the server value changes) unless
  // the owner has unsaved edits in flight.
  useEffect(() => {
    if (!widgetDirty && serverWidget) setWidget(serverWidget);
  }, [serverWidget, widgetDirty]);
  const patchWidget = (p: Partial<AiWidgetStyle>) => {
    setWidget((w) => ({ ...w, ...p }));
    setWidgetDirty(true);
  };
  const saveWidgetMut = useMutation({
    mutationFn: (w: AiWidgetStyle) =>
      api("/api/portal/ai-assistant/widget-style", {
        method: "PATCH",
        body: JSON.stringify({
          styleMode: w.styleMode,
          theme: w.theme,
          launcherColor: w.launcherColor,
          launcherIcon: w.launcherIcon,
          greeting: w.greeting?.slice(0, GREETING_CAP) || undefined,
          font: w.font,
          position: w.position,
          visibility: w.visibility,
        }),
      }),
    onSuccess: () => {
      setWidgetDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/portal/ai-assistant/status"] });
    },
  });
  const widgetCustom = widget.styleMode === "custom";

  const saveNotesMut = useMutation({
    mutationFn: async (content: string) => {
      if (notesEntry) {
        return api(`/api/portal/tradeline/knowledge/${notesEntry.id}`, {
          method: "PATCH",
          body: JSON.stringify({ content: content || " " }),
        });
      }
      return api("/api/portal/tradeline/knowledge", {
        method: "POST",
        body: JSON.stringify({
          kind: "doc",
          title: NOTES_TITLE,
          content: content || " ",
          status: "active",
        }),
      });
    },
    onSuccess: () => {
      setNotesDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/portal/tradeline/knowledge"] });
    },
  });

  const addQaMut = useMutation({
    mutationFn: (data: { q: string; a: string }) =>
      api("/api/portal/tradeline/knowledge", {
        method: "POST",
        body: JSON.stringify({
          kind: "faq",
          title: data.q.slice(0, 200),
          content: data.a,
          status: "active",
        }),
      }),
    onSuccess: () => {
      setNewQ("");
      setNewA("");
      qc.invalidateQueries({ queryKey: ["/api/portal/tradeline/knowledge"] });
    },
  });

  const deleteQaMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/portal/tradeline/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/portal/tradeline/knowledge"] }),
  });

  /* Copilot form-fill — the assistant can pre-fill the teachable fields. */
  useCopilotForm({
    formLabel: "Teach your AI assistant",
    fields: [
      { key: "notes", label: "Business notes the assistant should know", required: false },
      { key: "question", label: "A common customer question", required: false },
      { key: "answer", label: "The answer to that question", required: false },
    ],
    values: { notes, question: newQ, answer: newA },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        if (f.field_key === "notes") {
          setNotes(v.slice(0, NOTES_CAP));
          setNotesDirty(true);
          setTeachOpen(true);
        } else if (f.field_key === "question") {
          setNewQ(v);
          setTeachOpen(true);
        } else if (f.field_key === "answer") {
          setNewA(v);
          setTeachOpen(true);
        }
      }
    },
  });

  const kbLoadFailed = kbQ.isError;
  const qaAtCap = qaEntries.length >= QA_CAP;

  return (
    <PortalLayout>
      <div className="mx-auto w-full max-w-[920px] px-4 py-6 sm:px-6 space-y-6">
        {/* ── 1. One identity header ── */}
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground tracking-tight">
            <Sparkles className="h-6 w-6 text-brand-blue" /> Your AI assistant
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One assistant that answers your customers wherever they meet you —
            your calculator, your website, your phone — branded as{" "}
            <span className="font-medium text-foreground">{businessName}</span>, never as
            WeFixTrades. (The WeFixTrades assistant in the top bar is a different helper —
            that one works for you, not your customers.)
          </p>
        </header>

        {/* ── 2. Placements ── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Where it answers</h2>
            <p className="text-xs text-muted-foreground">
              Turn the assistant on or off per place. It's free on every one.
            </p>
          </div>

          {(statusQ.isLoading || siteQ.isLoading) && (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
              ))}
            </div>
          )}

          {!statusQ.isLoading && !siteQ.isLoading && (
            <div className="space-y-2">
              {/* Calculator widget */}
              <PlacementRow
                icon={<Calculator className="h-5 w-5 text-muted-foreground" />}
                title="Calculator widget"
                blurb="Helps visitors finish a quote on your published calculator and hands off to you when a human's needed."
                state={calcState}
                toggle={
                  statusQ.data?.hasCalculator ? (
                    <Switch
                      checked={!!calc?.enabled}
                      disabled={calcToggleMut.isPending}
                      onCheckedChange={(v) => calcToggleMut.mutate(v)}
                      aria-label="Toggle calculator assistant"
                      data-testid="toggle-placement-calculator"
                    />
                  ) : (
                    <Button asChild size="sm" variant="outline" data-testid="link-build-calculator">
                      <Link href="/wizard">Build one</Link>
                    </Button>
                  )
                }
              />

              {/* Website (TradeLine) */}
              <PlacementRow
                icon={<Globe className="h-5 w-5 text-muted-foreground" />}
                title="Website"
                blurb="The chat widget you embed on your own site (TradeLine). Same assistant, same answers."
                state={siteState}
                toggle={
                  siteQ.data?.site ? (
                    <Switch
                      checked={!!siteQ.data.site.enabled}
                      disabled={siteToggleMut.isPending}
                      onCheckedChange={(v) => siteToggleMut.mutate(v)}
                      aria-label="Toggle website assistant"
                      data-testid="toggle-placement-website"
                    />
                  ) : (
                    <Button asChild size="sm" variant="outline" data-testid="link-setup-website">
                      <Link href="/portal/tradeline/setup">Set up</Link>
                    </Button>
                  )
                }
                footerLink={{
                  href: "/portal/tradeline/chat-widget/install",
                  label: "Install on my site",
                }}
              />

              {/* Phone */}
              <PlacementRow
                icon={<Phone className="h-5 w-5 text-muted-foreground" />}
                title="Phone"
                blurb="Answers calls 24/7 with the same knowledge. Set up a number to switch it on."
                state="not_set_up"
                toggle={
                  <Button asChild size="sm" variant="outline" data-testid="link-setup-phone">
                    <Link href="/portal/tradeline/setup">Set up</Link>
                  </Button>
                }
              />
            </div>
          )}
        </section>

        {/* ── 3. What your assistant will never share (REQUIRED trust card) ── */}
        <Card className="border-green-500/30 p-5" data-testid="card-never-shares">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
            <div className="min-w-0 space-y-2">
              <h2 className="text-sm font-semibold text-foreground">
                What your assistant will never share
              </h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Your pricing formulas, margins, or cost structure</li>
                <li>• Your internal notes and business analytics</li>
                <li>• Any other customer's contact details</li>
              </ul>
              <p className="text-sm text-foreground">
                It only knows what a visitor could already see on your calculator —
                plus anything you teach it below.
              </p>
            </div>
          </div>
        </Card>

        {/* ── 4. Assistant settings — Teach + Appearance & timing, one coherent area ──
         *
         * Phase 1 (this PR): the two previously-scattered controls — the inline
         * "Teach" expander and the punt-out "Appearance & timing" card — are grouped
         * under one "Assistant settings" heading as two matching collapsible rows, so
         * the owner configures the assistant in one place instead of bouncing to the
         * calculator wizard. Appearance/timing still links to the wizard (that's where
         * the real controls live today) because aiChatVisibility is derived read-only
         * from wizard settings — writing it here would need a wizard-settings refactor,
         * out of scope for Phase 1. */}
        <section className="space-y-3" data-testid="section-assistant-settings">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Assistant settings</h2>
            <p className="text-xs text-muted-foreground">
              Teach it what to say, and control how it looks and when it appears — all in one place.
            </p>
          </div>

          {/* Teach your assistant (collapsible) */}
          <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setTeachOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 p-5 text-left"
            aria-expanded={teachOpen}
            data-testid="toggle-teach-expander"
          >
            <span className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-brand-blue" />
              <span className="text-sm font-semibold text-foreground">Teach your assistant</span>
              <span className="text-xs text-muted-foreground">— optional</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${teachOpen ? "rotate-180" : ""}`}
            />
          </button>

          {teachOpen && (
            <div className="space-y-5 border-t border-border p-5">
              {/* help cue — top-left, single per block */}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" /> Whatever you add applies everywhere your
                assistant answers. No per-place setup.
              </p>

              {kbLoadFailed && (
                <Card className="border-red-200 bg-red-50 p-4 dark:border-red-800/60 dark:bg-red-950/40">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        Couldn't load what you've taught it
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => kbQ.refetch()}
                        disabled={kbQ.isFetching}
                        data-testid="button-retry-teach"
                      >
                        <RotateCw
                          className={`mr-1.5 h-3.5 w-3.5 ${kbQ.isFetching ? "animate-spin" : ""}`}
                        />
                        Retry
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Business notes — title-in-field textarea, help cue top-left */}
              <div className="space-y-1.5">
                <label htmlFor="ai-notes" className="block text-sm font-medium text-foreground">
                  Business notes
                </label>
                <p className="text-xs text-muted-foreground">
                  Hours, service area, special offers — anything you'd tell a customer who asked.
                </p>
                <Textarea
                  id="ai-notes"
                  rows={5}
                  maxLength={NOTES_CAP}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesDirty(true);
                  }}
                  placeholder="e.g. We're open Mon–Sat 8–6, cover all of Greater Manchester, and offer free callouts within 5 miles."
                  data-testid="input-business-notes"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {notes.length}/{NOTES_CAP}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => saveNotesMut.mutate(notes)}
                    disabled={!notesDirty || saveNotesMut.isPending}
                    data-testid="button-save-notes"
                  >
                    <Save className="mr-1 h-3.5 w-3.5" /> Save notes
                  </Button>
                </div>
              </div>

              {/* Q&A pairs */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <label className="block text-sm font-medium text-foreground">
                    Questions &amp; answers
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {qaEntries.length}/{QA_CAP}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Teach it the exact answer to questions customers ask a lot.
                </p>

                {qaEntries.length > 0 && (
                  <ul className="space-y-2">
                    {qaEntries.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                            {e.content}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteQaMut.mutate(e.id)}
                          aria-label={`Delete answer to ${e.title}`}
                          data-testid={`button-delete-qa-${e.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {!qaAtCap && (
                  <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3">
                    <Input
                      value={newQ}
                      maxLength={200}
                      onChange={(e) => setNewQ(e.target.value)}
                      placeholder="Question — e.g. Do you offer emergency callouts?"
                      aria-label="New question"
                      data-testid="input-new-question"
                    />
                    <Textarea
                      rows={2}
                      maxLength={2000}
                      value={newA}
                      onChange={(e) => setNewA(e.target.value)}
                      placeholder="Answer the assistant should give"
                      aria-label="New answer"
                      data-testid="input-new-answer"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => addQaMut.mutate({ q: newQ.trim(), a: newA.trim() })}
                        disabled={!newQ.trim() || !newA.trim() || addQaMut.isPending}
                        data-testid="button-add-qa"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                  </div>
                )}
                {qaAtCap && (
                  <p className="text-xs text-muted-foreground">
                    You've added the maximum of {QA_CAP} questions. Remove one to add another.
                  </p>
                )}
              </div>
            </div>
          )}
          </Card>

          {/* Appearance & timing (collapsible — matches the Teach row) */}
          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => setAppearanceOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-3 p-5 text-left"
              aria-expanded={appearanceOpen}
              data-testid="toggle-appearance-expander"
            >
              <span className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-brand-blue" />
                <span className="text-sm font-semibold text-foreground">Appearance &amp; timing</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${appearanceOpen ? "rotate-180" : ""}`}
              />
            </button>

            {appearanceOpen && (
              <div className="space-y-4 border-t border-border p-5">
                {/* help cue — top-left, single per block */}
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" /> Controls how the chat bubble looks and when it
                  appears to visitors.
                </p>

                {/* ── Phase 2 — mode toggle. Inherit keeps the calculator look
                     (safe default); Customize reveals the independent controls.
                     Selected = outline, never a bright fill (DS rule). ── */}
                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-foreground">Style</span>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Widget style mode">
                    <ModeButton
                      selected={!widgetCustom}
                      onClick={() => patchWidget({ styleMode: "inherit" })}
                      title="Inherit from calculator"
                      blurb="Matches your calculator's colour and light theme."
                      testid="widget-mode-inherit"
                    />
                    <ModeButton
                      selected={widgetCustom}
                      onClick={() => patchWidget({ styleMode: "custom" })}
                      title="Customize"
                      blurb="Give the chat its own colour, theme, and greeting."
                      testid="widget-mode-custom"
                    />
                  </div>
                </div>

                {widgetCustom && (
                  <div className="space-y-4 rounded-lg border border-border p-4" data-testid="widget-custom-controls">
                    {/* Launcher colour */}
                    <div className="space-y-1.5">
                      <label htmlFor="widget-color" className="block text-sm font-medium text-foreground">
                        Launcher colour
                      </label>
                      <p className="text-xs text-muted-foreground">
                        The bubble, header, and reply accents use this colour.
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          id="widget-color"
                          type="color"
                          value={widget.launcherColor || DEFAULT_LAUNCHER_COLOR}
                          onChange={(e) => patchWidget({ launcherColor: e.target.value })}
                          className="h-9 w-14 cursor-pointer rounded-md border border-border bg-transparent p-1"
                          data-testid="input-widget-color"
                          aria-label="Launcher colour"
                        />
                        <span className="font-mono text-xs text-muted-foreground">
                          {(widget.launcherColor || DEFAULT_LAUNCHER_COLOR).toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Theme — removes the light-lock */}
                    <SegmentedField
                      label="Theme"
                      help="Dark gives the chat panel a dark surface."
                      value={widget.theme}
                      options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                      ]}
                      onChange={(v) => patchWidget({ theme: v as AiWidgetStyle["theme"] })}
                      testid="widget-theme"
                    />

                    {/* Launcher icon */}
                    <SegmentedField
                      label="Launcher icon"
                      help="The glyph shown on the closed chat button."
                      value={widget.launcherIcon}
                      options={WIDGET_ICON_OPTIONS}
                      onChange={(v) => patchWidget({ launcherIcon: v as WidgetIcon })}
                      testid="widget-icon"
                    />

                    {/* Greeting */}
                    <div className="space-y-1.5">
                      <label htmlFor="widget-greeting" className="block text-sm font-medium text-foreground">
                        Greeting
                      </label>
                      <p className="text-xs text-muted-foreground">
                        The first line the assistant says when the chat opens.
                      </p>
                      <Textarea
                        id="widget-greeting"
                        rows={2}
                        maxLength={GREETING_CAP}
                        value={widget.greeting ?? ""}
                        onChange={(e) => patchWidget({ greeting: e.target.value })}
                        placeholder={`Hi! I'm the virtual assistant for ${businessName}. How can I help you today?`}
                        data-testid="input-widget-greeting"
                      />
                      <span className="text-xs text-muted-foreground">
                        {(widget.greeting ?? "").length}/{GREETING_CAP}
                      </span>
                    </div>

                    {/* Font */}
                    <SegmentedField
                      label="Font"
                      help="Body font for the chat panel."
                      value={widget.font}
                      options={WIDGET_FONT_OPTIONS}
                      onChange={(v) => patchWidget({ font: v as WidgetFont })}
                      testid="widget-font"
                    />

                    {/* Position */}
                    <SegmentedField
                      label="Position"
                      help="Which corner the chat launcher sits in."
                      value={widget.position}
                      options={[
                        { value: "bottom-right", label: "Bottom right" },
                        { value: "bottom-left", label: "Bottom left" },
                      ]}
                      onChange={(v) => patchWidget({ position: v as AiWidgetStyle["position"] })}
                      testid="widget-position"
                    />
                  </div>
                )}

                {/* Timing — independent of style; applies in both modes. */}
                <SegmentedField
                  label="When it appears"
                  help="Smart shows it only when a visitor looks stuck. Always keeps it visible (paid plans)."
                  value={widget.visibility ?? "rescue"}
                  options={[
                    { value: "rescue", label: "Smart" },
                    { value: "always", label: "Always" },
                  ]}
                  onChange={(v) => patchWidget({ visibility: v as AiWidgetStyle["visibility"] })}
                  testid="widget-visibility"
                />

                {/* Save + escape hatch to the wizard for turning chat fully off. */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Link
                    href="/wizard"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
                    data-testid="link-appearance-wizard"
                  >
                    Turn chat off / advanced <ExternalLink className="h-3 w-3" />
                  </Link>
                  <Button
                    size="sm"
                    onClick={() => saveWidgetMut.mutate(widget)}
                    disabled={!widgetDirty || saveWidgetMut.isPending}
                    data-testid="button-save-widget-style"
                  >
                    <Save className="mr-1 h-3.5 w-3.5" /> Save appearance
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>
    </PortalLayout>
  );
}

/* ─── Phase 2 — style mode card button (selected = outline, never bright fill) ─── */
function ModeButton({
  selected,
  onClick,
  title,
  blurb,
  testid,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  blurb: string;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testid}
      className={`rounded-lg border bg-transparent p-3 text-left transition-colors ${
        selected
          ? "border-brand-blue ring-1 ring-brand-blue/40"
          : "border-border hover:border-brand-blue/50"
      }`}
    >
      <span className={`block text-sm font-medium ${selected ? "text-brand-blue" : "text-foreground"}`}>
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>
    </button>
  );
}

/* ─── Phase 2 — segmented enum picker (selected = outline) ─── */
function SegmentedField({
  label,
  help,
  value,
  options,
  onChange,
  testid,
}: {
  label: string;
  help?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  testid: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={selected}
              data-testid={`${testid}-${o.value}`}
              className={`rounded-md border bg-transparent px-3 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? "border-brand-blue text-brand-blue ring-1 ring-brand-blue/40"
                  : "border-border text-muted-foreground hover:border-brand-blue/50"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── placement row ─── */
function PlacementRow({
  icon,
  title,
  blurb,
  state,
  toggle,
  footerLink,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  state: PlacementState;
  toggle: React.ReactNode;
  footerLink?: { href: string; label: string };
}) {
  return (
    <Card className="p-4" data-testid={`placement-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{title}</span>
            <Badge variant="secondary" className="text-[10px]">
              Free
            </Badge>
            <StatusPill state={state} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{blurb}</p>
          {footerLink && (
            <Link
              href={footerLink.href}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
            >
              {footerLink.label} <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="flex-shrink-0 self-center">{toggle}</div>
      </div>
    </Card>
  );
}
