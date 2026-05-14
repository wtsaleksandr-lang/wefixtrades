import { useEffect, useRef, useState } from "react";
import { Clock, BarChart3, Timer } from "lucide-react";
import { mkt } from "@/theme/tokens";

function useCountUpController<T extends HTMLElement>(opts: { durationMs?: number; threshold?: number } = {}) {
  const { durationMs = 1200, threshold = 0.35 } = opts;
  const ref = useRef<T | null>(null);
  const [entered, setEntered] = useState(false);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setEntered(true); },
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
      onUpdate(from + (to - from) * easeOutCubic(t));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return { ref, entered, runKey, restart, animateNumber };
}

export default function TrustStrip() {
  const { ref: metricsRef, entered, runKey, restart, animateNumber } =
    useCountUpController<HTMLDivElement>({ durationMs: 1200, threshold: 0.35 });

  const [responseSec, setResponseSec] = useState(0);
  const [recoveryLow, setRecoveryLow] = useState(0);
  const [recoveryHigh, setRecoveryHigh] = useState(0);
  const [savedLow, setSavedLow] = useState(0);
  const [savedHigh, setSavedHigh] = useState(0);
  const [shineKey, setShineKey] = useState(0);

  useEffect(() => {
    if (!entered) return;
    setResponseSec(0);
    setRecoveryLow(0);
    setRecoveryHigh(0);
    setSavedLow(0);
    setSavedHigh(0);
    setShineKey((k) => k + 1);
    animateNumber(0, 60, (v) => setResponseSec(Math.round(v)));
    animateNumber(0, 18, (v) => setRecoveryLow(Math.round(v)));
    animateNumber(0, 35, (v) => setRecoveryHigh(Math.round(v)));
    animateNumber(0, 6, (v) => setSavedLow(Math.round(v)));
    animateNumber(0, 12, (v) => setSavedHigh(Math.round(v)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, runKey]);

  const handleRestart = () => restart();

  return (
    <section data-testid="trust-strip" className="relative w-full py-8 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-x-0 -top-24 h-40 blur-2xl"
          style={{ background: `linear-gradient(to bottom, transparent, ${mkt.accentGlow})` }}
        />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(to right, ${mkt.accentTint}, ${mkt.accentGlow}, ${mkt.accentTint})` }}
        />
        <div
          className="absolute inset-x-0 -bottom-24 h-40 blur-2xl"
          style={{ background: `linear-gradient(to top, transparent, ${mkt.accentGlow})` }}
        />
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.15) 100%)` }} />
      </div>

      <div ref={metricsRef} className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: mkt.accent }} />
            <span className="text-xs font-medium" style={{ color: mkt.textMuted }}>Performance snapshot</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1.5" style={{ color: mkt.text }}>
            Modeled outcomes, built for busy trades
          </h2>
          <p className="text-sm sm:text-[15px]" style={{ color: mkt.textMuted }}>
            Typical targets when automations are enabled. Results vary by business.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[
            {
              icon: Clock,
              value: <>{"< "}{responseSec}</>,
              suffix: "sec",
              title: "Target first response",
              desc: "Auto-reply target when a call or message is missed.",
            },
            {
              icon: BarChart3,
              value: <>{recoveryLow}–{recoveryHigh}</>,
              suffix: "%",
              title: "Estimated missed-lead recovery",
              desc: "Follow-ups + fast replies help recover inquiries.",
            },
            {
              icon: Timer,
              value: <>{savedLow}–{savedHigh}</>,
              suffix: "hrs/wk",
              title: "Estimated admin time saved",
              desc: "Less chasing leads and missed messages.",
            },
          ].map((card) => (
            <div
              key={card.title}
              onClick={handleRestart}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleRestart(); }}
              className="relative overflow-hidden rounded-2xl p-4 sm:p-5 backdrop-blur-xl cursor-pointer select-none transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: mkt.cardBg,
                border: `1px solid ${mkt.cardBorder}`,
                boxShadow: '0 18px 45px rgba(0,0,0,0.25)',
              }}
            >
              <div
                key={shineKey}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  background: "linear-gradient(120deg, transparent 0%, rgba(13,60,252,0.15) 50%, transparent 100%)",
                  transform: "translateX(-120%)",
                  animation: shineKey > 0 ? "wftCardShine 0.9s ease-out forwards" : "none",
                }}
              />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <card.icon size={16} strokeWidth={1.75} style={{ color: mkt.accent }} />
                  <span className="text-xs font-medium" style={{ color: mkt.textMuted }}>{card.title}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ color: mkt.onDark }}>{card.value}</span>
                  <span className="text-base font-medium" style={{ color: mkt.textMuted }}>{card.suffix}</span>
                </div>
                <p className="text-[11px] mt-2 leading-snug" style={{ color: mkt.textFaint }}>{card.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] mt-3" style={{ color: mkt.textFaint }}>
          Metrics shown are modeled targets/estimates and vary by business setup.
        </p>
      </div>
    </section>
  );
}
