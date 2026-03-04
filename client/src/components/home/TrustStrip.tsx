import { useEffect, useRef, useState } from "react";

type Pill = { label: string };

const TRUST_PILLS: Pill[] = [
  { label: "North America focused" },
  { label: "Built for service businesses" },
  { label: "Runs in the background" },
];

function useCountUpController<T extends HTMLElement>(opts: { durationMs?: number; threshold?: number } = {}) {
  const { durationMs = 950, threshold = 0.35 } = opts;
  const ref = useRef<T | null>(null);
  const [entered, setEntered] = useState(false);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setEntered(true);
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  const restart = () => setRunKey((k) => k + 1);

  const animateNumber = (from: number, to: number, onUpdate: (v: number) => void) => {
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

  return { ref, entered, runKey, restart, animateNumber };
}

export default function TrustStrip() {
  const { ref: metricsRef, entered, runKey, restart, animateNumber } =
    useCountUpController<HTMLDivElement>({ durationMs: 1000, threshold: 0.35 });

  const [responseSec, setResponseSec] = useState(0);
  const [channels, setChannels] = useState(0);
  const [satisfaction, setSatisfaction] = useState(0);

  useEffect(() => {
    if (!entered) return;
    setResponseSec(0);
    setChannels(0);
    setSatisfaction(0);
    animateNumber(0, 60, (v) => setResponseSec(Math.round(v)));
    animateNumber(0, 3, (v) => setChannels(Math.round(v)));
    animateNumber(0, 4.7, (v) => setSatisfaction(Math.round(v * 10) / 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, runKey]);

  return (
    <section data-testid="trust-strip" className="w-full bg-transparent">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          ref={metricsRef}
          onClick={restart}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") restart(); }}
          className="relative overflow-hidden rounded-2xl p-4 sm:p-5 border border-white/15 text-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] cursor-pointer select-none transition-transform active:scale-[0.99]"
          style={{
            background:
              "radial-gradient(1200px 400px at 20% 0%, rgba(59,130,246,0.35), transparent 55%), radial-gradient(900px 500px at 80% 20%, rgba(37,99,235,0.25), transparent 60%), linear-gradient(180deg, rgba(10,20,40,0.75), rgba(10,20,40,0.55))",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.10]"
            style={{
              background:
                "linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0) 70%)",
              transform: "translateX(-60%)",
              animation: "wftShine 7s ease-in-out infinite",
            }}
          />

          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_0_4px_rgba(96,165,250,0.25)]" />
                <p className="text-sm font-medium text-white/90">
                  Built for trades — by people who understand the job
                </p>
              </div>
              <p className="mt-1 text-xs text-white/70">
                A lead + customer response system designed for busy service businesses.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {TRUST_PILLS.map((p) => (
                <span
                  key={p.label}
                  className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80"
                >
                  {p.label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative my-3 h-px w-full bg-white/15" />

          <div className="relative mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-xl p-3 bg-white/[0.08] border border-white/[0.12] backdrop-blur-md">
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight">{"< "}{responseSec}{" sec"}</div>
              <div className="text-xs text-white/75 mt-1">Auto-reply target</div>
              <div className="text-[11px] text-white/60 mt-1 leading-snug">Instant first response when you miss a call.</div>
            </div>
            <div className="rounded-xl p-3 bg-white/[0.08] border border-white/[0.12] backdrop-blur-md">
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight">{channels}</div>
              <div className="text-xs text-white/75 mt-1">Channels covered</div>
              <div className="text-[11px] text-white/60 mt-1 leading-snug">Calls + web chat + SMS lead capture.</div>
            </div>
            <div className="rounded-xl p-3 bg-white/[0.08] border border-white/[0.12] backdrop-blur-md">
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight">{satisfaction}/5</div>
              <div className="text-xs text-white/75 mt-1">User satisfaction</div>
              <div className="text-[11px] text-white/60 mt-1 leading-snug">Early customer feedback (updated as we scale).</div>
            </div>
          </div>

          <p className="relative mt-2 text-[11px] text-white/55">
            Metrics shown are targets/early feedback and vary by setup.
          </p>
        </div>
      </div>

      <div className="h-8 sm:h-10" />
    </section>
  );
}
