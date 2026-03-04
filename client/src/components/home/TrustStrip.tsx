import { useEffect, useRef, useState } from "react";

type Pill = { label: string };

const TRUST_PILLS: Pill[] = [
  { label: "North America focused" },
  { label: "Built for service businesses" },
  { label: "Runs in the background" },
];

function useCountUpOnView<T extends HTMLElement>(
  opts: { durationMs?: number; once?: boolean; threshold?: number } = {}
) {
  const { durationMs = 900, once = true, threshold = 0.25 } = opts;
  const ref = useRef<T | null>(null);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasEntered(true);
          if (once) obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [once, threshold]);

  const animateNumber = (from: number, to: number, onUpdate: (v: number) => void) => {
    if (!hasEntered) { onUpdate(from); return; }
    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const val = from + (to - from) * easeOutCubic(t);
      onUpdate(val);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return { ref, hasEntered, animateNumber };
}

export default function TrustStrip() {
  const { ref: metricsRef, hasEntered, animateNumber } = useCountUpOnView<HTMLDivElement>({
    durationMs: 950,
    once: true,
    threshold: 0.35,
  });

  const [coverage, setCoverage] = useState(0);
  const [responseSec, setResponseSec] = useState(0);
  const [rating, setRating] = useState(0);

  useEffect(() => {
    if (!hasEntered) return;
    animateNumber(0, 24, (v) => setCoverage(Math.round(v)));
    animateNumber(0, 60, (v) => setResponseSec(Math.round(v)));
    animateNumber(0, 4.7, (v) => setRating(Math.round(v * 10) / 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEntered]);

  return (
    <section data-testid="trust-strip" className="w-full bg-transparent">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          ref={metricsRef}
          className="relative overflow-hidden rounded-2xl border border-black/10 bg-white/40 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] p-4 sm:p-5"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              background:
                "linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0) 70%)",
              transform: "translateX(-60%)",
              animation: "wftShine 6s ease-in-out infinite",
            }}
          />

          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

          <div className="relative my-3 h-px w-full bg-black/10" />

          <div className="relative grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-xl border border-black/10 bg-white/55 p-3">
              <div className="text-lg font-extrabold text-black/85">{coverage}/7</div>
              <div className="text-xs text-black/60">Answering coverage</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white/55 p-3">
              <div className="text-lg font-extrabold text-black/85">{"< "}{responseSec}{" sec"}</div>
              <div className="text-xs text-black/60">Avg. lead response (with automations)</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white/55 p-3">
              <div className="text-lg font-extrabold text-black/85">{rating}/5</div>
              <div className="text-xs text-black/60">User satisfaction</div>
            </div>
          </div>

          <p className="relative mt-2 text-xs text-black/45">
            Notes: stats shown are typical outcomes when automations are enabled. Results vary.
          </p>
        </div>
      </div>

      <div className="h-8 sm:h-10" />
    </section>
  );
}
