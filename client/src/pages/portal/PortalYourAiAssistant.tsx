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
 *   - Appearance (smart-timing) → links to the wizard Style tab; never
 *     duplicated here.
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
interface AiStatus {
  hasCalculator: boolean;
  calculator: {
    id: number;
    business_name: string;
    slug: string;
    enabled: boolean;
    active: boolean;
    aiChatVisibility: "rescue" | "always";
  } | null;
}
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

        {/* ── 4. Teach your assistant (single optional knowledge surface) ── */}
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

        {/* ── 5. Appearance (link to wizard, never duplicated) ── */}
        <Card className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Appearance &amp; timing</h2>
            <p className="text-sm text-muted-foreground">
              {calc?.aiChatVisibility === "always"
                ? "Set to always show the chat bubble on your calculator."
                : "Set to smart timing — the bubble appears only when a visitor looks stuck."}{" "}
              Change this on the wizard's Style tab.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" data-testid="link-appearance-wizard">
            <Link href="/wizard">
              Open Style tab <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </Card>
      </div>
    </PortalLayout>
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
