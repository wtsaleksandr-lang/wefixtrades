import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle, Clock, ArrowRight, TrendingUp, FileText, MapPin, BarChart3, Sparkles } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";

/* ─── Types ─── */
interface RankFlowData {
  active: boolean;
  plan_tier?: string;
  month?: string;
  statusLine?: string;
  metrics?: {
    tasksCompleted: number;
    totalTasks: number;
    pagesCreated: number;
    citationsBuilt: number;
    progressPct: number;
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
  const tier = (data.plan_tier || "starter").charAt(0).toUpperCase() + (data.plan_tier || "starter").slice(1);

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto space-y-6 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-[#2D6A4F]" />
            <h1 className="text-lg font-semibold text-gray-900">RankFlow SEO</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 capitalize">{tier}</span>
          </div>
          <p className="text-sm text-gray-600">{data.statusLine}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={CheckCircle} label="Tasks Done" value={`${m.tasksCompleted}/${m.totalTasks}`} />
          <MetricCard icon={FileText} label="Pages Created" value={String(m.pagesCreated)} />
          <MetricCard icon={MapPin} label="Listings Built" value={String(m.citationsBuilt)} />
          <MetricCard icon={BarChart3} label="Progress" value={`${m.progressPct}%`} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Monthly Progress</span>
            <span className="text-xs text-gray-400">{m.progressPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#2D6A4F] rounded-full transition-all duration-500" style={{ width: `${m.progressPct}%` }} />
          </div>
        </div>

        {data.completed && data.completed.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Work Completed</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.completed.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{item.detail}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">{item.label}</span>
                      {item.completedAt && <span className="text-[10px] text-gray-400">{formatDate(item.completedAt)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.inProgress && data.inProgress.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">In Progress</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.inProgress.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{item.detail}</p>
                    <span className="text-[10px] text-gray-400">{item.label}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.nextUp && data.nextUp.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">What's Next</h2>
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

/* ─── Onboarding Wizard ─── */

function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    business_name: "",
    website_url: "",
    niche: "",
    location: "",
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
    onSuccess: () => {
      setDone(true);
      setTimeout(() => onComplete(), 2000);
    },
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
      {/* Header */}
      <div className="text-center mb-6">
        <TrendingUp className="w-8 h-8 text-[#2D6A4F] mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-gray-900">Set Up RankFlow</h1>
        <p className="text-sm text-gray-500 mt-1">Tell us about your business so we can start improving your local SEO.</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? "bg-[#2D6A4F]" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center mb-4">Step {step} of 3</p>

      {/* Step 1: Business basics */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Business name</label>
              <input
                type="text" placeholder="e.g. Ace Plumbing"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F]"
                value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Website URL</label>
              <input
                type="url" placeholder="e.g. https://aceplumbing.ca"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F]"
                value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })}
              />
            </div>
          </div>
          <button
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={!canAdvance1} onClick={() => setStep(2)}
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 2: Services & location */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">What type of trade?</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F] bg-white"
                value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })}
              >
                <option value="">Select your trade...</option>
                {TRADE_OPTIONS.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Primary city or area</label>
              <input
                type="text" placeholder="e.g. Hamilton, ON"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F]"
                value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Other services you offer <span className="text-gray-400">(optional)</span></label>
              <input
                type="text" placeholder="e.g. drain cleaning, water heater repair"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F]"
                value={form.additional_services} onChange={e => setForm({ ...form, additional_services: e.target.value })}
              />
              <p className="text-[10px] text-gray-400 mt-1">Separate with commas</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Other areas you serve <span className="text-gray-400">(optional)</span></label>
              <input
                type="text" placeholder="e.g. Burlington, Stoney Creek"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F]"
                value={form.additional_locations} onChange={e => setForm({ ...form, additional_locations: e.target.value })}
              />
              <p className="text-[10px] text-gray-400 mt-1">Separate with commas</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={!canAdvance2} onClick={() => setStep(3)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm + activate */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Confirm your details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Business</dt><dd className="text-gray-900 font-medium">{form.business_name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Website</dt><dd className="text-gray-900 font-medium truncate max-w-[200px]">{form.website_url}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Trade</dt><dd className="text-gray-900 font-medium capitalize">{form.niche}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Location</dt><dd className="text-gray-900 font-medium">{form.location}</dd></div>
              {form.additional_services && <div className="flex justify-between"><dt className="text-gray-500">Services</dt><dd className="text-gray-900 text-right max-w-[200px]">{form.additional_services}</dd></div>}
              {form.additional_locations && <div className="flex justify-between"><dt className="text-gray-500">Areas</dt><dd className="text-gray-900 text-right max-w-[200px]">{form.additional_locations}</dd></div>}
            </dl>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
            <p className="text-sm text-emerald-800">
              <Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              We'll automatically generate your first SEO plan and start work right away.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] disabled:opacity-50 transition-colors"
              disabled={onboard.isPending} onClick={() => onboard.mutate()}
            >
              {onboard.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Start My SEO"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Metric Card ─── */
function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
      <Icon className="w-4 h-4 mx-auto text-gray-400 mb-1.5" />
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
