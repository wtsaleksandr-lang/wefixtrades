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
import { ArrowLeft, CheckCircle2, Loader2, Save, Layout, BarChart3 } from "lucide-react";

/**
 * Admin "Service Ops" page.
 *
 * Two service types have dedicated fulfillment data that needs to be
 * captured outside the generic task flow:
 *
 *  1. `sitelaunch-template` — picked template, brand colors, content blocks
 *  2. `adflow-*` — monthly performance metrics that feed the monthly report email
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
        <div className="p-6">
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

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-5 bg-[#F0F7F4] border-[#2D6A4F]/20">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white border border-[#2D6A4F]/20 flex items-center justify-center flex-shrink-0">
            <Layout className="w-4 h-4 text-[#2D6A4F]" />
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
                    ? "border-[#2D6A4F] bg-[#F0F7F4]"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                  {templateId === t.id && <CheckCircle2 className="w-4 h-4 text-[#2D6A4F]" />}
                </div>
                <p className="text-xs text-gray-500">Best for: {t.best_for}</p>
              </button>
            ))}
          </div>
        </div>

        <Field label="Brand colors (hex pair, e.g. #2D6A4F,#F5FCFF)" value={brandColors} onChange={setBrandColors} />
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
            className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white"
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

  const [impressions, setImpressions] = useState<string>(existing.impressions?.toString() ?? "");
  const [clicks, setClicks] = useState<string>(existing.clicks?.toString() ?? "");
  const [conversions, setConversions] = useState<string>(existing.conversions?.toString() ?? "");
  const [leads, setLeads] = useState<string>(existing.leads_generated?.toString() ?? "");
  const [spendCents, setSpendCents] = useState<string>(existing.cost_spent_cents?.toString() ?? "");
  const [cpcCents, setCpcCents] = useState<string>(existing.cpc_cents?.toString() ?? "");
  const [ctr, setCtr] = useState<string>(existing.ctr_pct?.toString() ?? "");
  const [topCreative, setTopCreative] = useState<string>(existing.top_creative ?? "");
  const [notes, setNotes] = useState<string>(existing.notes ?? "");
  const [periodStart, setPeriodStart] = useState<string>(existing.period_start ?? "");
  const [periodEnd, setPeriodEnd] = useState<string>(existing.period_end ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        impressions: impressions || undefined,
        clicks: clicks || undefined,
        conversions: conversions || undefined,
        leads_generated: leads || undefined,
        cost_spent_cents: spendCents || undefined,
        cpc_cents: cpcCents || undefined,
        ctr_pct: ctr || undefined,
        top_creative: topCreative || undefined,
        notes: notes || undefined,
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
      };
      const res = await apiRequest("POST", `/api/admin/crm/client-services/${cs.id}/adflow-metrics`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Metrics saved", description: "Next monthly-report task will email these to the customer." });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/crm/client-services/${cs.id}`] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  // Derive quick helpers
  const derivedCtr = useMemo(() => {
    const i = Number(impressions);
    const c = Number(clicks);
    if (i > 0 && c >= 0) return ((c / i) * 100).toFixed(2);
    return "";
  }, [impressions, clicks]);

  const derivedCpc = useMemo(() => {
    const c = Number(clicks);
    const spend = Number(spendCents);
    if (c > 0 && spend > 0) return Math.round(spend / c).toString();
    return "";
  }, [clicks, spendCents]);

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-5 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white border border-blue-200 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">AdFlow Monthly Metrics</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              Populate these from the white-label agency's report, then mark the "Monthly performance report" fulfillment task as delivered — the customer gets a branded email summarizing the numbers.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Reporting period</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Period start (YYYY-MM-DD)" value={periodStart} onChange={setPeriodStart} placeholder="2026-03-01" />
            <Field label="Period end (YYYY-MM-DD)" value={periodEnd} onChange={setPeriodEnd} placeholder="2026-03-31" />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Traffic & engagement</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Impressions" value={impressions} onChange={setImpressions} numeric />
            <Field label="Clicks" value={clicks} onChange={setClicks} numeric />
            <Field label="CTR %" value={ctr} onChange={setCtr} numeric placeholder={derivedCtr || "auto"} />
          </div>
          {derivedCtr && !ctr && (
            <p className="text-[11px] text-gray-500 mt-2">
              Auto-calculated CTR: {derivedCtr}% — click the CTR field to override.
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Conversions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <Field label="Conversions" value={conversions} onChange={setConversions} numeric />
            <Field label="Leads generated" value={leads} onChange={setLeads} numeric />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Spend</h3>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <Field label="Total spend (cents, e.g. 50000 = $500)" value={spendCents} onChange={setSpendCents} numeric />
            <Field label="CPC (cents)" value={cpcCents} onChange={setCpcCents} numeric placeholder={derivedCpc || "auto"} />
          </div>
          {derivedCpc && !cpcCents && (
            <p className="text-[11px] text-gray-500 mt-2">
              Auto-calculated CPC: ${(Number(derivedCpc) / 100).toFixed(2)} — click CPC to override.
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Narrative</h3>
          <Field label="Top creative this period" value={topCreative} onChange={setTopCreative} placeholder="Short description of the winning ad" />
          <FieldTextarea label="Team notes for the customer" value={notes} onChange={setNotes} rows={3} placeholder="What worked, what we're changing next period..." />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save metrics
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
