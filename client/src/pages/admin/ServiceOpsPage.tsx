import { useEffect, useState } from "react";
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
import { ArrowLeft, CheckCircle2, Loader2, Save, Layout, BarChart3, Send } from "lucide-react";

/**
 * Admin "Service Ops" page.
 *
 * Two service types have dedicated fulfillment data that needs to be
 * captured outside the generic task flow:
 *
 *  1. `sitelaunch-template` — picked template, brand colors, content blocks
 *  2. `adflow-*` — enter monthly campaign performance metrics
 *
 * This page surfaces the right form based on the client_service's service_id.
 *
 * URL: /admin/service-ops?csid=123
 */

const SITELAUNCH_TEMPLATES = [
  { id: "trade-classic-v2", name: "Classic (trusted, dependable)", best_for: "Plumbers, electricians, HVAC" },
  { id: "trade-bold-v2", name: "Bold (high-contrast, visual)", best_for: "Roofers, remodelers, landscapers" },
  { id: "trade-clean-v2", name: "Clean (modern, minimal)", best_for: "Cleaners, painters, window services" },
  { id: "trade-pro-v2", name: "Pro (premium, corporate)", best_for: "Commercial contractors, multi-location" },
];

interface ClientService {
  id: number;
  client_id: number;
  service_id: string;
  status: string;
  metadata: Record<string, any> | null;
}

export default function ServiceOpsPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const csid = parseInt(params.get("csid") || "0");

  useEffect(() => {
    document.title = "Service Ops — WeFixTrades Admin";
  }, []);

  if (!csid) {
    return (
      <AdminLayout>
        <div data-theme="light" className="p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-4">Service Ops</h1>
          <Card className="p-8 max-w-xl">
            <p className="text-sm text-gray-600">
              Open a client service from the CRM and click "Service Ops" to
              configure it. Or append <code>?csid=NN</code> to this URL.
            </p>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return <ServiceOpsInner csid={csid} />;
}

function ServiceOpsInner({ csid }: { csid: number }) {
  const { data, isLoading, error } = useQuery<ClientService>({
    queryKey: [`/api/admin/crm/client-services/${csid}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/crm/client-services/${csid}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-4">
          <Link href={data ? `/admin/crm/${data.client_id}` : "/admin/crm"}>
            <Button variant="ghost" size="sm" className="text-xs text-gray-500">
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to client
            </Button>
          </Link>
        </div>
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-gray-900">Service Ops</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data ? `Service #${csid} · ${data.service_id}` : `Service #${csid}`}
          </p>
        </div>

      {isLoading && <Skeleton className="h-48 w-full max-w-xl" />}
      {error && (
        <Card className="p-6 max-w-xl bg-red-50 border-red-200">
          <p className="text-sm text-red-700">Couldn't load this service. It may have been removed.</p>
        </Card>
      )}
      {data && data.service_id === "sitelaunch-template" && <SiteLaunchTemplateForm cs={data} />}
      {data && data.service_id.startsWith("adflow") && <AdFlowMetricsForm cs={data} />}
      {data && data.service_id !== "sitelaunch-template" && !data.service_id.startsWith("adflow") && (
        <Card className="p-6 max-w-xl">
          <p className="text-sm text-gray-700 font-medium mb-1">No ops form for this service type</p>
          <p className="text-xs text-gray-500">
            Service Ops forms exist for <code>sitelaunch-template</code> and <code>adflow-*</code>. For anything else, use the general fulfillment task view on the client page.
          </p>
        </Card>
      )}
      </div>
    </AdminLayout>
  );
}

/* ═══════════════════════════════════════════
   SiteLaunch Template form
   ═══════════════════════════════════════════ */

function SiteLaunchTemplateForm({ cs }: { cs: ClientService }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const existing = (cs.metadata as any)?.config?.sitelaunch_template ?? {};

  const [templateId, setTemplateId] = useState<string>(existing.template_id || SITELAUNCH_TEMPLATES[0].id);
  const [brandColors, setBrandColors] = useState<string>(existing.brand_colors || "");
  const [logoUrl, setLogoUrl] = useState<string>(existing.logo_url || "");
  const [heroTitle, setHeroTitle] = useState<string>(existing.content?.hero_title || "");
  const [heroSub, setHeroSub] = useState<string>(existing.content?.hero_sub || "");
  const [about, setAbout] = useState<string>(existing.content?.about || "");
  const [servicesText, setServicesText] = useState<string>(
    existing.content?.services
      ? (existing.content.services as any[]).map(s => `${s.name} | ${s.description}`).join("\n")
      : ""
  );
  const [serviceArea, setServiceArea] = useState<string>(existing.content?.service_area || "");
  const [phone, setPhone] = useState<string>(existing.content?.contact?.phone || "");
  const [email, setEmail] = useState<string>(existing.content?.contact?.email || "");
  const [address, setAddress] = useState<string>(existing.content?.contact?.address || "");
  const [hours, setHours] = useState<string>(existing.content?.contact?.hours || "");
  const [domain, setDomain] = useState<string>(existing.domain || "");
  const [notes, setNotes] = useState<string>(existing.notes || "");

  const mutation = useMutation({
    mutationFn: async () => {
      const services = servicesText
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
          const [name, ...desc] = l.split("|").map(s => s.trim());
          return { name: name || "", description: desc.join(" | ") || "" };
        });
      const body = {
        template_id: templateId,
        brand_colors: brandColors || undefined,
        logo_url: logoUrl || undefined,
        content: {
          hero_title: heroTitle || undefined,
          hero_sub: heroSub || undefined,
          about: about || undefined,
          services,
          service_area: serviceArea || undefined,
          contact: {
            phone,
            email,
            address: address || undefined,
            hours: hours || undefined,
          },
        },
        domain: domain || undefined,
        notes: notes || undefined,
      };
      const res = await apiRequest("POST", `/api/admin/crm/client-services/${cs.id}/sitelaunch-template`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Template saved", description: "Content is staged for build." });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/client-services/${cs.id}`] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  /* Phase 1c: register the SiteLaunch template form with the copilot. This
   * sub-component only mounts for `sitelaunch-template` services, so the
   * registration is naturally scoped. templateId is validated against the
   * known template set. */
  useCopilotForm({
    formLabel: "SiteLaunch setup",
    fields: [
      {
        key: "templateId",
        label: `Template (one of: ${SITELAUNCH_TEMPLATES.map((t) => t.id).join(", ")})`,
      },
      { key: "brandColors", label: "Brand colors (hex pair, e.g. #0d3cfc,#F5FCFF)" },
      { key: "logoUrl", label: "Logo URL" },
      { key: "heroTitle", label: "Hero title" },
      { key: "heroSub", label: "Hero subtitle" },
      { key: "about", label: "Short about paragraph" },
      { key: "servicesText", label: "Services (one per line: Name | description)" },
      { key: "serviceArea", label: "Service area" },
      { key: "phone", label: "Contact phone" },
      { key: "email", label: "Contact email" },
      { key: "address", label: "Address (optional)" },
      { key: "hours", label: "Hours (optional)" },
      { key: "domain", label: "Domain (if already owned)" },
      { key: "notes", label: "Internal notes" },
    ],
    values: {
      templateId, brandColors, logoUrl, heroTitle, heroSub, about,
      servicesText, serviceArea, phone, email, address, hours, domain, notes,
    },
    onApply: (fills) => {
      for (const f of fills) {
        switch (f.field_key) {
          case "templateId":
            if (SITELAUNCH_TEMPLATES.some((t) => t.id === f.value)) setTemplateId(f.value);
            break;
          case "brandColors": setBrandColors(f.value); break;
          case "logoUrl": setLogoUrl(f.value); break;
          case "heroTitle": setHeroTitle(f.value); break;
          case "heroSub": setHeroSub(f.value); break;
          case "about": setAbout(f.value); break;
          case "servicesText": setServicesText(f.value); break;
          case "serviceArea": setServiceArea(f.value); break;
          case "phone": setPhone(f.value); break;
          case "email": setEmail(f.value); break;
          case "address": setAddress(f.value); break;
          case "hours": setHours(f.value); break;
          case "domain": setDomain(f.value); break;
          case "notes": setNotes(f.value); break;
        }
      }
    },
  });

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-5 bg-[#EEF3FF] border-[#0d3cfc]/20">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white border border-[#0d3cfc]/20 flex items-center justify-center flex-shrink-0">
            <Layout className="w-4 h-4 text-[#0d3cfc]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">SiteLaunch Template</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              Pick a template, paste the customer's content, save. The build task picks up from here and produces the live site.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        {/* Template */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-2 block">Template</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SITELAUNCH_TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                  templateId === t.id
                    ? "border-[#0d3cfc] bg-[#EEF3FF]"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                  {templateId === t.id && <CheckCircle2 className="w-4 h-4 text-[#0d3cfc]" />}
                </div>
                <p className="text-xs text-gray-500">Best for: {t.best_for}</p>
              </button>
            ))}
          </div>
        </div>

        <Field label="Brand colors (hex pair, e.g. #0d3cfc,#F5FCFF)" value={brandColors} onChange={setBrandColors} />
        <Field label="Logo URL (or paste CDN link)" value={logoUrl} onChange={setLogoUrl} />

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Hero</h3>
          <Field label="Hero title" value={heroTitle} onChange={setHeroTitle} />
          <Field label="Hero subtitle" value={heroSub} onChange={setHeroSub} />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">About</h3>
          <FieldTextarea label="Short about paragraph (150-300 chars)" value={about} onChange={setAbout} rows={3} />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Services</h3>
          <FieldTextarea
            label="One per line — format: Service Name | description"
            value={servicesText}
            onChange={setServicesText}
            rows={5}
            placeholder={"Emergency Plumbing | 24/7 burst pipes, leaks, gas issues\nWater Heater Install | New and replacement\nDrain Cleaning | Kitchen, bath, main line"}
          />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact block</h3>
          <Field label="Service area" value={serviceArea} onChange={setServiceArea} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone" value={phone} onChange={setPhone} />
            <Field label="Email" value={email} onChange={setEmail} />
          </div>
          <Field label="Address (optional)" value={address} onChange={setAddress} />
          <Field label="Hours (optional)" value={hours} onChange={setHours} />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Deployment</h3>
          <Field label="Domain (if already owned)" value={domain} onChange={setDomain} placeholder="plumberexample.com" />
          <FieldTextarea label="Internal notes" value={notes} onChange={setNotes} rows={3} />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-[#0d3cfc] hover:bg-[#0b34d6] text-white"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save template config
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════
   AdFlow Metrics form
   ═══════════════════════════════════════════ */

function AdFlowMetricsForm({ cs }: { cs: ClientService }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const existing = (cs.metadata as any)?.latest_report ?? {};

  const [impressions, setImpressions] = useState(existing.impressions?.toString() || "");
  const [clicks, setClicks] = useState(existing.clicks?.toString() || "");
  const [leadsGenerated, setLeadsGenerated] = useState(existing.leads_generated?.toString() || "");
  const [costSpentCents, setCostSpentCents] = useState(
    existing.cost_spent_cents != null ? (existing.cost_spent_cents / 100).toFixed(2) : ""
  );
  const [ctrPct, setCtrPct] = useState(existing.ctr_pct?.toString() || "");
  const [cpcCents, setCpcCents] = useState(
    existing.cpc_cents != null ? (existing.cpc_cents / 100).toFixed(2) : ""
  );
  const [topCreative, setTopCreative] = useState(existing.top_creative || "");
  const [notes, setNotes] = useState(existing.notes || "");
  const [periodStart, setPeriodStart] = useState(existing.period_start || "");
  const [periodEnd, setPeriodEnd] = useState(existing.period_end || "");
  const [recommendations, setRecommendations] = useState(
    (existing.recommendations || []).join("\n")
  );
  const [dailyBreakdownCsv, setDailyBreakdownCsv] = useState(
    (existing.daily_breakdown || []).map((d: any) => `${d.date},${d.leads}`).join("\n")
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
        notes: notes || undefined,
        top_creative: topCreative || undefined,
        recommendations: recommendations
          .split("\n")
          .map((r: string) => r.trim())
          .filter(Boolean),
      };
      if (impressions) body.impressions = parseInt(impressions);
      if (clicks) body.clicks = parseInt(clicks);
      if (leadsGenerated) body.leads_generated = parseInt(leadsGenerated);
      if (costSpentCents) body.cost_spent_cents = Math.round(parseFloat(costSpentCents) * 100);
      if (ctrPct) body.ctr_pct = parseFloat(ctrPct);
      if (cpcCents) body.cpc_cents = Math.round(parseFloat(cpcCents) * 100);

      // Parse daily breakdown CSV (date,leads per line)
      if (dailyBreakdownCsv.trim()) {
        const parsed = dailyBreakdownCsv
          .split("\n")
          .map((line: string) => line.trim())
          .filter(Boolean)
          .map((line: string) => {
            const [date, leadsStr] = line.split(",").map((s: string) => s.trim());
            return { date, leads: parseInt(leadsStr) || 0 };
          })
          .filter((p: { date: string; leads: number }) => p.date);
        if (parsed.length > 0) body.daily_breakdown = parsed;
      }

      const res = await apiRequest("POST", `/api/admin/crm/client-services/${cs.id}/adflow-metrics`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Metrics saved", description: "AdFlow metrics entered for this period." });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/client-services/${cs.id}`] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/crm/client-services/${cs.id}/adflow-send-report`, {});
      return res.json();
    },
    onSuccess: (result: any) => {
      if (result.sent) {
        toast({ title: "Report sent", description: `${result.period} report sent to client.` });
      } else {
        toast({ title: "Report not sent", description: result.reason || "Check metrics and try again.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  /* Phase 1c: register the AdFlow metrics form with the copilot. This
   * sub-component only mounts for `adflow-*` services. All values are kept
   * as strings in form state (matching the inputs), so fills apply directly;
   * numeric coercion happens in the save mutation. */
  useCopilotForm({
    formLabel: "AdFlow metrics",
    fields: [
      { key: "periodStart", label: "Period start (YYYY-MM-DD)" },
      { key: "periodEnd", label: "Period end (YYYY-MM-DD)" },
      { key: "impressions", label: "Impressions (number)" },
      { key: "clicks", label: "Clicks (number)" },
      { key: "leadsGenerated", label: "Leads generated (number)" },
      { key: "costSpentCents", label: "Total spend in dollars (numeric string)" },
      { key: "ctrPct", label: "CTR percent (numeric string)" },
      { key: "cpcCents", label: "CPC in dollars (numeric string)" },
      { key: "topCreative", label: "Top performing creative" },
      { key: "recommendations", label: "Recommendations (one per line)" },
      { key: "notes", label: "Notes" },
    ],
    values: {
      periodStart, periodEnd, impressions, clicks, leadsGenerated,
      costSpentCents, ctrPct, cpcCents, topCreative, recommendations, notes,
    },
    onApply: (fills) => {
      for (const f of fills) {
        switch (f.field_key) {
          case "periodStart": setPeriodStart(f.value); break;
          case "periodEnd": setPeriodEnd(f.value); break;
          case "impressions": setImpressions(f.value); break;
          case "clicks": setClicks(f.value); break;
          case "leadsGenerated": setLeadsGenerated(f.value); break;
          case "costSpentCents": setCostSpentCents(f.value); break;
          case "ctrPct": setCtrPct(f.value); break;
          case "cpcCents": setCpcCents(f.value); break;
          case "topCreative": setTopCreative(f.value); break;
          case "recommendations": setRecommendations(f.value); break;
          case "notes": setNotes(f.value); break;
        }
      }
    },
  });

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-5 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white border border-blue-200 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">AdFlow Metrics</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              Enter the campaign performance metrics for this period. These are sent to the client
              in their monthly report on the 2nd. Save metrics first, then send the report manually or
              let the cron pick it up.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        {/* Period */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Report Period</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period start (YYYY-MM-DD)" value={periodStart} onChange={setPeriodStart} placeholder="2026-04-01" />
            <Field label="Period end (YYYY-MM-DD)" value={periodEnd} onChange={setPeriodEnd} placeholder="2026-04-30" />
          </div>
        </div>

        {/* KPIs */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Campaign KPIs</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Impressions" value={impressions} onChange={setImpressions} numeric />
            <Field label="Clicks" value={clicks} onChange={setClicks} numeric />
            <Field label="Leads generated" value={leadsGenerated} onChange={setLeadsGenerated} numeric />
            <Field label="Total spend ($)" value={costSpentCents} onChange={setCostSpentCents} placeholder="1500.00" />
            <Field label="CTR (%)" value={ctrPct} onChange={setCtrPct} placeholder="2.5" />
            <Field label="CPC ($)" value={cpcCents} onChange={setCpcCents} placeholder="3.50" />
          </div>
        </div>

        {/* Additional */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Additional Info</h3>
          <Field label="Top performing creative" value={topCreative} onChange={setTopCreative} placeholder="e.g. Emergency Plumber - Call Now" />
          <FieldTextarea label="Daily breakdown (CSV: date,leads per line)" value={dailyBreakdownCsv} onChange={setDailyBreakdownCsv} rows={4} placeholder={"2026-04-01,3\n2026-04-02,5\n2026-04-03,2"} />
          <FieldTextarea label="Recommendations (one per line)" value={recommendations} onChange={setRecommendations} rows={3} placeholder={"Increase budget for Google Ads by 20%\nTest new landing page variant"} />
          <FieldTextarea label="Notes (internal or for report)" value={notes} onChange={setNotes} rows={3} />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !periodStart}
          >
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Report Now
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-[#0d3cfc] hover:bg-[#0b34d6] text-white"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Metrics
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Small field helpers
   ═══════════════════════════════════════════ */

function Field({
  label, value, onChange, placeholder, numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <div className="mb-3">
      <Label className="text-xs text-gray-600 mb-1 block">{label}</Label>
      <Input
        type={numeric ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  );
}

function FieldTextarea({
  label, value, onChange, rows, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <Label className="text-xs text-gray-600 mb-1 block">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows || 4}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  );
}
