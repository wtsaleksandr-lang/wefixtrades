import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, CheckCircle, Clock, ArrowRight, TrendingUp, FileText,
  MapPin, BarChart3, Sparkles, Globe, Search, ArrowUpRight, Minus,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";

/* ─── Types ─── */
interface RankFlowData {
  active: boolean;
  plan_tier?: string;
  month?: string;
  statusLine?: string;
  narrative?: string;
  metrics?: {
    tasksCompleted: number;
    totalTasks: number;
    pagesCreated: number;
    citationsBuilt: number;
    progressPct: number;
  };
  ranking?: {
    highlights: string[];
    keywordsTracked: number;
    keywordsTop10: number;
    keywordsTop20: number;
    keywordsImproved: number;
    avgPosition: number | null;
  };
  indexing?: {
    totalPages: number;
    indexed: number;
    pending: number;
  };
  completed?: { label: string; detail: string; completedAt: string | null }[];
  inProgress?: { label: string; detail: string }[];
  nextUp?: string[];
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TRADE_OPTIONS = [
  "Plumbing", "HVAC", "Electrical", "Roofing", "Cleaning", "Landscaping", "Locksmith", "General Contractor",
];

/* ─── Main Component ─── */
export default function PortalRankFlow() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<RankFlowData>({
    queryKey: ["/api/portal/rankflow"],
    queryFn: async () => {
      const res = await fetch("/api/portal/rankflow", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      </PortalLayout>
    );
  }

  if (!data || !data.active) {
    return (
      <PortalLayout>
        <OnboardingWizard onComplete={() => qc.invalidateQueries({ queryKey: ["/api/portal/rankflow"] })} />
      </PortalLayout>
    );
  }

  const m = data.metrics!;
  const r = data.ranking;
  const idx = data.indexing;
  const tier = (data.plan_tier || "starter").charAt(0).toUpperCase() + (data.plan_tier || "starter").slice(1);

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto space-y-5 pb-8">

        {/* ─── Header ─── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-[#2D6A4F]" />
            <h1 className="text-lg font-semibold text-gray-900">RankFlow SEO Report</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 capitalize">{tier}</span>
          </div>
          <p className="text-sm text-gray-600">{data.statusLine}</p>
        </div>

        {/* ─── Monthly Narrative ─── */}
        {data.narrative && (
          <div className="bg-[#F0F7F4] border border-[#2D6A4F]/10 rounded-xl px-5 py-4">
            <p className="text-sm text-[#1B4332] leading-relaxed">{data.narrative}</p>
          </div>
        )}

        {/* ─── Metrics Row ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={CheckCircle} label="Work Done" value={`${m.tasksCompleted}/${m.totalTasks}`} color="emerald" />
          <MetricCard icon={FileText} label="Pages Created" value={String(m.pagesCreated)} color="blue" />
          <MetricCard icon={MapPin} label="Listings Built" value={String(m.citationsBuilt)} color="amber" />
          <MetricCard icon={BarChart3} label="Progress" value={`${m.progressPct}%`} color="indigo" />
        </div>

        {/* ─── Progress Bar ─── */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Monthly Progress</span>
            <span className="text-xs text-gray-400">{m.progressPct}% complete</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#2D6A4F] rounded-full transition-all duration-500" style={{ width: `${m.progressPct}%` }} />
          </div>
        </div>

        {/* ─── Ranking Highlights ─── */}
        {r && (r.keywordsTracked > 0 || r.highlights.length > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Search className="w-4 h-4 text-gray-400" /> Ranking Progress
              </h2>
            </div>
            <div className="px-5 py-4">
              {/* Stat row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <MiniStat label="Keywords Tracked" value={String(r.keywordsTracked)} />
                <MiniStat label="Top 10" value={String(r.keywordsTop10)} highlight={r.keywordsTop10 > 0} />
                <MiniStat label="Top 20" value={String(r.keywordsTop20)} highlight={r.keywordsTop20 > 0} />
                <MiniStat label="Improved" value={String(r.keywordsImproved)} highlight={r.keywordsImproved > 0} />
              </div>
              {/* Highlights */}
              {r.highlights.length > 0 && (
                <ul className="space-y-1.5">
                  {r.highlights.map((h, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-emerald-700">
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              {r.avgPosition !== null && (
                <p className="text-xs text-gray-400 mt-3">Average position: {r.avgPosition}</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Indexing Status ─── */}
        {idx && idx.totalPages > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-gray-400" /> Pages on Google
              </h2>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-600">{idx.indexed} of {idx.totalPages} pages indexed</span>
                    <span className="text-xs text-gray-400">{idx.totalPages > 0 ? Math.round((idx.indexed / idx.totalPages) * 100) : 0}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${idx.totalPages > 0 ? (idx.indexed / idx.totalPages) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
              {idx.pending > 0 && (
                <p className="text-xs text-gray-400 mt-2">{idx.pending} page{idx.pending > 1 ? "s" : ""} waiting to be indexed by Google</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Work Completed ─── */}
        {data.completed && data.completed.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">What We Did This Month</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.completed.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{item.detail}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-medium text-gray-400">{item.label}</span>
                      {item.completedAt && <span className="text-[10px] text-gray-300">{formatDate(item.completedAt)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── In Progress ─── */}
        {data.inProgress && data.inProgress.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Currently Working On</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.inProgress.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{item.detail}</p>
                    <span className="text-[10px] font-medium text-gray-400">{item.label}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── What's Next ─── */}
        {data.nextUp && data.nextUp.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Coming Up Next</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.nextUp.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-center gap-3">
                  <ArrowRight className="w-4 h-4 text-[#2D6A4F] shrink-0" />
                  <p className="text-sm text-gray-700">{item}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </PortalLayout>
  );
}

/* ─── Sub-Components ─── */

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-500",
    blue: "text-blue-500",
    amber: "text-amber-500",
    indigo: "text-indigo-500",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
      <Icon className={`w-4 h-4 mx-auto mb-1.5 ${colors[color] || "text-gray-400"}`} />
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-semibold ${highlight ? "text-emerald-600" : "text-gray-900"}`}>{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

/* ─── Onboarding Wizard ─── */

function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);

  // Accept prefill from audit conversion URL param
  const prefillData = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("prefill");
      if (raw) return JSON.parse(decodeURIComponent(raw));
    } catch {}
    return null;
  })();

  const [form, setForm] = useState({
    business_name: prefillData?.business_name || "",
    website_url: prefillData?.website_url || "",
    niche: prefillData?.niche || "",
    location: prefillData?.location || "",
    additional_services: "",
    additional_locations: "",
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const onboard = useMutation({
    mutationFn: async () => {
      const body = {
        business_name: form.business_name.trim(),
        website_url: form.website_url.trim(),
        niche: form.niche,
        location: form.location.trim(),
        additional_services: form.additional_services ? form.additional_services.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        additional_locations: form.additional_locations ? form.additional_locations.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      };
      const res = await fetch("/api/portal/rankflow/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to complete setup");
      }
      return res.json();
    },
    onSuccess: () => { setDone(true); setTimeout(() => onComplete(), 2000); },
    onError: (e: any) => setError(e.message),
  });

  const canAdvance1 = form.business_name.trim() && form.website_url.trim();
  const canAdvance2 = form.niche && form.location.trim();

  if (done) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-[#2D6A4F]" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">You're all set!</h1>
        <p className="text-sm text-gray-500">We're starting your SEO work now. Check back soon to see progress.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="text-center mb-6">
        <TrendingUp className="w-8 h-8 text-[#2D6A4F] mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-gray-900">Set Up RankFlow</h1>
        <p className="text-sm text-gray-500 mt-1">Tell us about your business so we can start improving your local SEO.</p>
      </div>
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? "bg-[#2D6A4F]" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center mb-4">Step {step} of 3</p>

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <Field label="Business name" placeholder="e.g. Ace Plumbing" value={form.business_name} onChange={v => setForm({ ...form, business_name: v })} />
            <Field label="Website URL" placeholder="e.g. https://aceplumbing.ca" value={form.website_url} onChange={v => setForm({ ...form, website_url: v })} type="url" />
          </div>
          <button className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] disabled:opacity-50 transition-colors" disabled={!canAdvance1} onClick={() => setStep(2)}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">What type of trade?</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 bg-white" value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })}>
                <option value="">Select your trade...</option>
                {TRADE_OPTIONS.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
              </select>
            </div>
            <Field label="Primary city or area" placeholder="e.g. Hamilton, ON" value={form.location} onChange={v => setForm({ ...form, location: v })} />
            <Field label="Other services you offer" placeholder="e.g. drain cleaning, water heater repair" value={form.additional_services} onChange={v => setForm({ ...form, additional_services: v })} optional hint="Separate with commas" />
            <Field label="Other areas you serve" placeholder="e.g. Burlington, Stoney Creek" value={form.additional_locations} onChange={v => setForm({ ...form, additional_locations: v })} optional hint="Separate with commas" />
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors" onClick={() => setStep(1)}>Back</button>
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] disabled:opacity-50 transition-colors" disabled={!canAdvance2} onClick={() => setStep(3)}>Continue</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Confirm your details</h2>
            <dl className="space-y-2 text-sm">
              <ConfirmRow label="Business" value={form.business_name} />
              <ConfirmRow label="Website" value={form.website_url} />
              <ConfirmRow label="Trade" value={form.niche} />
              <ConfirmRow label="Location" value={form.location} />
              {form.additional_services && <ConfirmRow label="Services" value={form.additional_services} />}
              {form.additional_locations && <ConfirmRow label="Areas" value={form.additional_locations} />}
            </dl>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
            <p className="text-sm text-emerald-800"><Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />We'll automatically generate your first SEO plan and start work right away.</p>
          </div>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors" onClick={() => setStep(2)}>Back</button>
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] disabled:opacity-50 transition-colors" disabled={onboard.isPending} onClick={() => onboard.mutate()}>
              {onboard.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Start My SEO"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Form Helpers ─── */

function Field({ label, placeholder, value, onChange, type, optional, hint }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
  type?: string; optional?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} {optional && <span className="text-gray-400">(optional)</span>}
      </label>
      <input
        type={type || "text"} placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F]"
        value={value} onChange={e => onChange(e.target.value)}
      />
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 font-medium capitalize text-right max-w-[200px] truncate">{value}</dd>
    </div>
  );
}
