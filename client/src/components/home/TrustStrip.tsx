type Stat = { value: string; label: string };
type Pill = { label: string };

const STATS: Stat[] = [
  { value: "24/7", label: "Answering coverage" },
  { value: "< 60 sec", label: "Avg. lead response (with automations)" },
  { value: "4.7/5", label: "User satisfaction" },
];

const TRUST_PILLS: Pill[] = [
  { label: "North America focused" },
  { label: "Built for service businesses" },
  { label: "Runs in the background" },
];

export default function TrustStrip() {
  return (
    <section data-testid="trust-strip" className="w-full bg-transparent">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-black/10 bg-white/40 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.12)]" />
                <p className="text-sm font-semibold text-black/80">
                  Built for trades — by people who understand the job
                </p>
              </div>
              <p className="mt-1 text-sm text-black/60">
                A lead + customer response system designed for busy service businesses.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {TRUST_PILLS.map((p) => (
                <span
                  key={p.label}
                  className="inline-flex items-center rounded-full border border-black/10 bg-white/55 px-3 py-1 text-xs font-medium text-black/70"
                >
                  {p.label}
                </span>
              ))}
            </div>
          </div>

          <div className="my-4 h-px w-full bg-black/10" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-black/10 bg-white/55 px-4 py-3"
              >
                <div className="text-lg font-extrabold text-black/85">{s.value}</div>
                <div className="text-xs text-black/60">{s.label}</div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-black/45">
            Notes: stats shown are typical outcomes when automations are enabled. Results vary.
          </p>
        </div>
      </div>

      <div className="h-8 sm:h-10" />
    </section>
  );
}
