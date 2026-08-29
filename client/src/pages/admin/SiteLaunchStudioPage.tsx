import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCopilotForm } from "@/context/CopilotFormContext";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Wand2,
} from "lucide-react";

/**
 * Admin "SiteLaunch Studio".
 *
 * The operator tooling SiteLaunch has never had. Before this page the only
 * SiteLaunch admin surface was an orders table whose own copy read
 * "SiteLaunch is fulfilled by a third-party supplier"
 * (SiteLaunchOpsPage.tsx) — while the supplier row is a deactivated
 * `design@example.com` placeholder. There was nothing that could build,
 * review, edit or approve a website.
 *
 * This page does four things:
 *   1. lists every generated site with its real lifecycle state
 *   2. creates a site from an intake form and lands an editable DRAFT
 *   3. opens a token-gated, noindex preview of that draft
 *   4. moves a site draft → in_review → approved → published, and records
 *      what an operator actually did about DNS
 *
 * HONEST-STATUS DISCIPLINE. Everything this page says about hosting and SSL
 * comes from the server's capability report (`/api/admin/sitelaunch/meta`),
 * which hard-codes `implemented: false` for domain provisioning in phase 1.
 * The page never renders a status the backend cannot stand behind, and the
 * manual stages are labelled as manual.
 *
 * URL: /admin/sitelaunch  (list)  ·  /admin/sitelaunch?id=123  (editor)
 */

interface SiteSummary {
  id: number;
  slug: string;
  business_name: string;
  theme_id: string;
  status: string;
  client_id: number | null;
  client_service_id: number | null;
  hosting_mode: string;
  custom_domain: string | null;
  domain_status: string;
  domain_status_note: string | null;
  page_count?: number;
  published_at: string | null;
  approved_at: string | null;
  last_generated_at: string | null;
  last_generation_error: string | null;
  updated_at: string;
  created_at: string;
}

interface ThemeMeta {
  id: string;
  name: string;
  character: string;
  best_for: string;
}

interface MetaResponse {
  themes: ThemeMeta[];
  statuses: string[];
  hosting_modes: string[];
  domain_statuses: string[];
  generation: { enabled: boolean; reason: string | null };
  domain_provisioning: { automated: boolean; message: string };
}

interface SiteDetail {
  site: SiteSummary;
  document: {
    theme_id: string;
    brand: { primary: string; source: string };
    business: { name: string; phone: string; email: string; city: string; region: string };
    pages: Array<{ id: string; slug: string; title: string; nav_label: string; sections: Array<{ id: string; type: string }> }>;
  } | null;
  document_error: string | null;
  preview_url: string;
  domain_provisioning: { automated: boolean; message: string };
}

const STATUS_TONE: Record<string, string> = {
  draft: "text-muted-foreground",
  in_review: "text-amber-600",
  approved: "text-emerald-600",
  published: "text-emerald-700",
  archived: "text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function SiteLaunchStudioPage() {
  const search = useSearch();
  const siteId = Number(new URLSearchParams(search).get("id") || 0);

  useEffect(() => {
    document.title = "SiteLaunch Studio — WeFixTrades Admin";
  }, []);

  return (
    <AdminLayout>
      <div data-theme="light">
        {siteId ? <SiteEditor siteId={siteId} /> : <SiteList />}
      </div>
    </AdminLayout>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * Capability banner — renders the server's honest capability report
 * ══════════════════════════════════════════════════════════════════════ */

/** The server's `reason` already ends in a period; trim it before we append
 *  our own sentence, or the banner reads "…is not set.. Sites still…". */
function trimPeriod(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\.+$/, "");
}

function CapabilityNotice({ meta }: { meta?: MetaResponse }) {
  if (!meta) return null;
  return (
    <div className="mb-5 space-y-2">
      {!meta.generation.enabled && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="m-0">
            AI copy generation is off — {trimPeriod(meta.generation.reason)}. Sites still generate
            with the deterministic structure and fallback copy.
          </p>
        </div>
      )}
      {!meta.domain_provisioning.automated && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="m-0">{meta.domain_provisioning.message}</p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * List + create
 * ══════════════════════════════════════════════════════════════════════ */

function SiteList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: meta } = useQuery<MetaResponse>({ queryKey: ["/api/admin/sitelaunch/meta"] });
  const { data, isLoading } = useQuery<{ sites: SiteSummary[] }>({
    queryKey: ["/api/admin/sitelaunch/sites"],
  });

  const [form, setForm] = useState({
    businessName: "",
    tradeType: "",
    phone: "",
    email: "",
    city: "",
    region: "",
    services: "",
    serviceAreas: "",
    hours: "",
    yearsInBusiness: "",
    licenseNumber: "",
    usp: "",
    calculatorToken: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useCopilotForm({
    formLabel: "New SiteLaunch site",
    fields: [
      { key: "businessName", label: "Business name" },
      { key: "tradeType", label: "Trade (e.g. plumbing, roofing, cleaning)" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "city", label: "City" },
      { key: "region", label: "Province / state" },
      { key: "services", label: "Services, one per line" },
      { key: "serviceAreas", label: "Service areas, one per line" },
      { key: "hours", label: "Opening hours, one line per day" },
      { key: "yearsInBusiness", label: "Years in business (leave blank if unknown)" },
      { key: "licenseNumber", label: "Licence number (leave blank if unknown)" },
      { key: "usp", label: "What makes them different" },
      { key: "calculatorToken", label: "QuoteQuick calculator token (optional)" },
    ],
    values: form,
    onApply: (fills) => {
      setForm((prev) => {
        const next = { ...prev };
        for (const fill of fills) {
          if (fill.field_key in next) {
            (next as Record<string, string>)[fill.field_key] = String(fill.value ?? "");
          }
        }
        return next;
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sitelaunch/sites", {
        intake: {
          business_name: form.businessName.trim(),
          trade_type: form.tradeType.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          city: form.city.trim() || undefined,
          region: form.region.trim() || undefined,
          services: linesToArray(form.services),
          service_areas: linesToArray(form.serviceAreas),
          hours: linesToArray(form.hours),
          years_in_business: form.yearsInBusiness.trim() || undefined,
          license_number: form.licenseNumber.trim() || undefined,
          unique_selling_points: form.usp.trim() || undefined,
          calculator_token: form.calculatorToken.trim() || undefined,
        },
      });
      return res.json();
    },
    onSuccess: (result: { site: SiteSummary; missing_facts: string[]; ai_copy_used: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sitelaunch/sites"] });
      setShowCreate(false);
      toast({
        title: "Draft created",
        description: result.ai_copy_used
          ? "AI copy applied. Review before approving."
          : "Built with deterministic copy — AI generation was unavailable.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not create site", description: err.message, variant: "destructive" });
    },
  });

  const sites = data?.sites ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-foreground">SiteLaunch Studio</h1>
          <p className="m-0 max-w-2xl text-sm text-muted-foreground">
            Generate, review, edit and approve customer websites. Publishing is always an explicit
            action — nothing here goes live on its own.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} data-testid="button-new-site">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New site
        </Button>
      </div>

      <CapabilityNotice meta={meta} />

      {showCreate && (
        <Card className="mb-5 p-5" data-section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Intake</h2>
          <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
            Leave a field blank rather than guessing. Blank fields are reported back as
            &ldquo;ask the customer&rdquo; — nothing is invented to fill them.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Business name" required value={form.businessName} onChange={set("businessName")} testId="input-business-name" />
            <Field label="Trade" value={form.tradeType} onChange={set("tradeType")} placeholder="plumbing, roofing, cleaning…" testId="input-trade" />
            <Field label="Phone" value={form.phone} onChange={set("phone")} testId="input-phone" />
            <Field label="Email" value={form.email} onChange={set("email")} testId="input-email" />
            <Field label="City" value={form.city} onChange={set("city")} testId="input-city" />
            <Field label="Province / state" value={form.region} onChange={set("region")} testId="input-region" />
            <Field label="Years in business" value={form.yearsInBusiness} onChange={set("yearsInBusiness")} help="Leave blank if unknown — it will not be claimed." testId="input-years" />
            <Field label="Licence number" value={form.licenseNumber} onChange={set("licenseNumber")} help="Leave blank if unknown — it will not be claimed." testId="input-licence" />
            <Field label="QuoteQuick calculator token" value={form.calculatorToken} onChange={set("calculatorToken")} help="Optional. Powers the instant-quote section." testId="input-calc-token" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <AreaField label="Services" help="One per line." value={form.services} onChange={set("services")} testId="input-services" />
            <AreaField label="Service areas" help="One per line." value={form.serviceAreas} onChange={set("serviceAreas")} testId="input-areas" />
            <AreaField label="Opening hours" help="One line per day." value={form.hours} onChange={set("hours")} testId="input-hours" />
          </div>
          <div className="mt-4">
            <AreaField label="What makes them different" value={form.usp} onChange={set("usp")} testId="input-usp" />
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.businessName.trim() || createMutation.isPending}
              data-testid="button-create-site"
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Generate draft
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : sites.length === 0 ? (
        <Card className="p-8">
          <p className="m-0 text-sm text-muted-foreground">
            No sites yet. Use <strong>New site</strong> to generate the first draft.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 font-medium text-muted-foreground">Business</th>
                <th className="py-2 pr-4 font-medium text-muted-foreground">Status</th>
                <th className="py-2 pr-4 font-medium text-muted-foreground">Theme</th>
                <th className="py-2 pr-4 font-medium text-muted-foreground">Pages</th>
                <th className="py-2 pr-4 font-medium text-muted-foreground">Domain</th>
                <th className="py-2 font-medium text-muted-foreground">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id} className="border-b border-border" data-testid={`row-site-${site.id}`}>
                  <td className="py-3 pr-4">
                    <Link href={`/admin/sitelaunch?id=${site.id}`} className="font-medium text-foreground hover:underline">
                      {site.business_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">/{site.slug}</div>
                  </td>
                  <td className={`py-3 pr-4 ${STATUS_TONE[site.status] ?? ""}`}>
                    {STATUS_LABEL[site.status] ?? site.status}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{site.theme_id}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{site.page_count ?? "—"}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {site.custom_domain || "Not set"}
                    <div className="text-xs">{site.domain_status.replace(/_/g, " ")}</div>
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {new Date(site.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * Editor
 * ══════════════════════════════════════════════════════════════════════ */

function SiteEditor({ siteId }: { siteId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: meta } = useQuery<MetaResponse>({ queryKey: ["/api/admin/sitelaunch/meta"] });
  const { data, isLoading } = useQuery<SiteDetail>({
    queryKey: [`/api/admin/sitelaunch/sites/${siteId}`],
  });

  const [domainForm, setDomainForm] = useState({ customDomain: "", domainStatus: "", note: "" });

  useEffect(() => {
    if (!data?.site) return;
    setDomainForm({
      customDomain: data.site.custom_domain ?? "",
      domainStatus: data.site.domain_status,
      note: data.site.domain_status_note ?? "",
    });
  }, [data?.site?.id, data?.site?.custom_domain, data?.site?.domain_status, data?.site?.domain_status_note]);

  useCopilotForm({
    formLabel: "SiteLaunch domain record",
    fields: [
      { key: "customDomain", label: "Custom domain (e.g. acmeplumbing.com)" },
      { key: "note", label: "What was actually done about DNS / SSL" },
    ],
    values: domainForm,
    onApply: (fills) => {
      setDomainForm((prev) => {
        const next = { ...prev };
        for (const fill of fills) {
          if (fill.field_key in next) {
            (next as Record<string, string>)[fill.field_key] = String(fill.value ?? "");
          }
        }
        return next;
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("POST", `/api/admin/sitelaunch/sites/${siteId}/status`, { status });
      return res.json();
    },
    onSuccess: (result: { note?: string }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/sitelaunch/sites/${siteId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sitelaunch/sites"] });
      toast({ title: "Status updated", description: result.note });
    },
    onError: (err: Error) =>
      toast({ title: "Status change failed", description: err.message, variant: "destructive" }),
  });

  const domainMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/sitelaunch/sites/${siteId}/domain`, {
        custom_domain: domainForm.customDomain.trim() || null,
        domain_status: domainForm.domainStatus || undefined,
        domain_status_note: domainForm.note.trim() || null,
        hosting_mode: domainForm.customDomain.trim() ? "custom_domain" : "not_provisioned",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/sitelaunch/sites/${siteId}`] });
      toast({ title: "Domain record saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const themeName = useMemo(() => {
    const id = data?.site.theme_id;
    return meta?.themes.find((t) => t.id === id)?.name ?? id ?? "";
  }, [meta, data?.site.theme_id]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-8">
        <p className="m-0 text-sm text-muted-foreground">Site not found.</p>
      </Card>
    );
  }

  const site = data.site;
  const nextStatus =
    site.status === "draft"
      ? "in_review"
      : site.status === "in_review"
        ? "approved"
        : site.status === "approved"
          ? "published"
          : null;

  return (
    <>
      <Link href="/admin/sitelaunch" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
        All sites
      </Link>

      <div className="mb-4">
        <h1 className="mb-1 text-xl font-semibold text-foreground">{site.business_name}</h1>
        <p className="m-0 text-sm text-muted-foreground">
          /{site.slug} · {themeName} · {STATUS_LABEL[site.status] ?? site.status} ·{" "}
          {site.page_count ?? data.document?.pages.length ?? 0} pages
        </p>
      </div>

      <CapabilityNotice meta={meta} />

      {data.document_error && (
        <div className="mb-5 flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="m-0">This site&rsquo;s stored document is invalid: {data.document_error}</p>
        </div>
      )}

      {site.last_generation_error && (
        <div className="mb-5 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="m-0">
            Last generation note: {trimPeriod(site.last_generation_error)} — the draft uses
            deterministic copy for any slot the model did not fill.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ── Review + approve ── */}
        <Card className="p-5 lg:col-span-2" data-section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Review</h2>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto [&>*]:justify-center">
            <a
              className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              href={data.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-preview"
            >
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              Open preview
            </a>
            {nextStatus && (
              <Button onClick={() => statusMutation.mutate(nextStatus)} disabled={statusMutation.isPending} data-testid="button-advance">
                {statusMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {nextStatus === "in_review"
                  ? "Send to review"
                  : nextStatus === "approved"
                    ? "Approve"
                    : "Publish"}
              </Button>
            )}
            {site.status !== "draft" && site.status !== "archived" && (
              <Button variant="outline" onClick={() => statusMutation.mutate("draft")} disabled={statusMutation.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to draft
              </Button>
            )}
          </div>
          <p className="m-0 mb-4 max-w-2xl text-sm text-muted-foreground">
            The preview link is unguessable and marked <code>noindex</code>. Publishing serves the
            site from this app; it does not point a domain at it.
          </p>

          <h3 className="mb-2 text-sm font-semibold text-foreground">Pages</h3>
          <ul className="m-0 list-none p-0">
            {(data.document?.pages ?? []).map((page) => (
              <li key={page.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 text-sm">
                <span className="font-medium text-foreground">{page.title}</span>
                <span className="text-muted-foreground">
                  /{page.slug} · {page.sections.length} sections
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Domain record ── */}
        <Card className="p-5" data-section>
          <h2 className="mb-2 text-base font-semibold text-foreground">Domain</h2>
          <p className="m-0 mb-4 text-sm text-muted-foreground">{data.domain_provisioning.message}</p>
          <div className="grid grid-cols-1 gap-4">
            <Field
              label="Custom domain"
              value={domainForm.customDomain}
              onChange={(v) => setDomainForm((p) => ({ ...p, customDomain: v }))}
              placeholder="acmeplumbing.com"
              testId="input-custom-domain"
            />
            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">Verified state</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                value={domainForm.domainStatus}
                onChange={(e) => setDomainForm((p) => ({ ...p, domainStatus: e.target.value }))}
                data-testid="select-domain-status"
              >
                {(meta?.domain_statuses ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <p className="m-0 mt-1 text-xs text-muted-foreground">
                Only set &ldquo;live&rdquo; once you have loaded the domain over HTTPS yourself.
              </p>
            </div>
            <AreaField
              label="What you did"
              help="Free text. This is an operator log, not an automated status."
              value={domainForm.note}
              onChange={(v) => setDomainForm((p) => ({ ...p, note: v }))}
              testId="input-domain-note"
            />
            <Button onClick={() => domainMutation.mutate()} disabled={domainMutation.isPending} data-testid="button-save-domain">
              {domainMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Save domain record
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * Field primitives — title in field, help top-left, tight gaps
 * ══════════════════════════════════════════════════════════════════════ */

function Field({
  label,
  value,
  onChange,
  help,
  placeholder,
  required,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  placeholder?: string;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div data-input-cluster>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </Label>
      {help && <p className="m-0 mb-1 text-xs text-muted-foreground">{help}</p>}
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} />
    </div>
  );
}

function AreaField({
  label,
  value,
  onChange,
  help,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  testId?: string;
}) {
  return (
    <div data-input-cluster>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      {help && <p className="m-0 mb-1 text-xs text-muted-foreground">{help}</p>}
      <Textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </div>
  );
}
