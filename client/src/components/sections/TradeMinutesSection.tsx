import { useMemo } from "react";
import { ArrowRight, BookOpen, Users, Boxes, Wrench, Zap, PhoneCall, MessageSquare, Star, Sparkles } from "lucide-react";

type TradeBadge = { label: string; icon: React.ReactNode; bg: string; fg: string };

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

export default function TradeMinutesSection() {
  const tradeBadges = useMemo<TradeBadge[]>(
    () => [
      { label: "Plumbing", icon: <Wrench className="h-4 w-4" />, bg: "bg-orange-500/15", fg: "text-orange-200" },
      { label: "HVAC", icon: <Zap className="h-4 w-4" />, bg: "bg-sky-500/15", fg: "text-sky-200" },
      { label: "Electrical", icon: <Sparkles className="h-4 w-4" />, bg: "bg-yellow-400/15", fg: "text-yellow-100" },
      { label: "Roofing", icon: <Boxes className="h-4 w-4" />, bg: "bg-emerald-500/15", fg: "text-emerald-200" },
      { label: "Cleaning", icon: <Users className="h-4 w-4" />, bg: "bg-fuchsia-500/15", fg: "text-fuchsia-200" },
      { label: "Landscaping", icon: <Wrench className="h-4 w-4" />, bg: "bg-lime-500/15", fg: "text-lime-200" },
      { label: "Painting", icon: <Sparkles className="h-4 w-4" />, bg: "bg-indigo-500/15", fg: "text-indigo-200" },
      { label: "Garage Doors", icon: <Boxes className="h-4 w-4" />, bg: "bg-rose-500/15", fg: "text-rose-200" },
    ],
    []
  );

  return (
    <section data-testid="trade-minutes-section" className="w-full">
      <div className="relative w-full overflow-hidden bg-[#070A0F]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(59,130,246,0.28),rgba(0,0,0,0))]" />
          <div className="absolute inset-0 bg-[radial-gradient(55%_55%_at_0%_40%,rgba(16,185,129,0.10),rgba(0,0,0,0))]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="text-center">
            <div className="text-[11px] tracking-[0.25em] uppercase text-white/55">
              SETUP IN MINUTES
            </div>

            <h2 className="mt-4 text-white font-semibold leading-[1.06] text-[32px] sm:text-[44px] md:text-[52px]">
              Any trade, any business —
              <br className="hidden sm:block" />
              <span className="text-white"> live in minutes</span>
            </h2>

            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {tradeBadges.map((t) => (
                <div
                  key={t.label}
                  data-testid={`trade-badge-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
                    "border border-white/10 backdrop-blur",
                    t.bg
                  )}
                >
                  <span className={cx("inline-flex", t.fg)}>{t.icon}</span>
                  <span className="text-[12px] text-white/80">{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10 items-start">
            <div className="relative">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="text-white/85 text-sm font-medium">QuickQuote Pro — Instant Estimate</div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-white/25" />
                    <span className="h-2 w-2 rounded-full bg-white/25" />
                    <span className="h-2 w-2 rounded-full bg-white/25" />
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-7 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[12px] text-white/70">Job Type</div>
                      <div className="mt-2 space-y-2">
                        {["Install", "Repair", "Inspection"].map((x) => (
                          <div
                            key={x}
                            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                          >
                            <span className="text-sm text-white/80">{x}</span>
                            <span className="text-[12px] text-white/45">Select</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="col-span-5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[12px] text-white/70">Estimated Range</div>
                      <div className="mt-2 text-2xl font-semibold text-white">$240–$480</div>
                      <div className="mt-1 text-[12px] text-white/50">Shown to customers instantly.</div>

                      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="h-4 w-4 text-white/70" />
                          <div className="text-[12px] text-white/70">Missed call recovered</div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-white/70" />
                          <div className="text-[12px] text-white/70">Text sent in 30 sec</div>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[12px] text-white/70">Embed on your site</div>
                          <div className="text-[12px] text-white/45">Copy + paste one snippet.</div>
                        </div>
                        <button
                          data-testid="btn-start-building"
                          className={cx(
                            "relative overflow-hidden rounded-full px-4 py-2 text-sm font-semibold",
                            "bg-[#1D4ED8] text-white shadow-[0_10px_30px_rgba(29,78,216,0.35)]",
                            "hover:brightness-110 active:brightness-95 transition"
                          )}
                        >
                          <span className="relative z-10 inline-flex items-center gap-2">
                            Start building <ArrowRight className="h-4 w-4" />
                          </span>
                          <span className="pointer-events-none absolute inset-0">
                            <span className="absolute -left-[40%] top-0 h-full w-[40%] rotate-12 bg-white/25 blur-md animate-[wftShimmer_3.8s_ease-in-out_infinite]" />
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute -inset-6 bg-[radial-gradient(40%_40%_at_50%_55%,rgba(59,130,246,0.25),rgba(0,0,0,0))]" />
            </div>

            <div className="space-y-5">
              <div className="flex gap-3">
                <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] p-2">
                  <BookOpen className="h-5 w-5 text-white/80" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold">Templates & embeds</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-white/60">
                    Pick a trade template, customize wording and ranges, and embed on your site.
                  </div>
                  <button data-testid="link-view-templates" className="mt-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[#60A5FA] hover:text-[#93C5FD] transition">
                    View templates <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] p-2">
                  <PhoneCall className="h-5 w-5 text-white/80" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold">24/7 answering</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-white/60">
                    Calls and messages handled automatically. Leads captured and sent to your phone.
                  </div>
                  <button data-testid="link-view-demo" className="mt-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[#60A5FA] hover:text-[#93C5FD] transition">
                    View demo <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] p-2">
                  <Users className="h-5 w-5 text-white/80" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold">Follow-ups & reviews</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-white/60">
                    Missed-lead recovery, automatic follow-ups, and review requests that run in the background.
                  </div>
                  <button data-testid="link-how-it-works" className="mt-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[#60A5FA] hover:text-[#93C5FD] transition">
                    See how it works <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button data-testid="btn-talk-expert" className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/[0.06] transition">
                  Talk to an expert <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div className="mx-auto max-w-4xl text-center">
            <div className="text-[22px] sm:text-[26px] leading-snug font-semibold text-[#0B1220]">
              "Setup was quick. Customers got answers instantly. We stopped missing good leads."
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-[#445064]">
              <div className="h-9 w-9 rounded-full bg-[#E9EEF7] border border-[#DDE6F5]" />
              <div className="text-left">
                <div className="font-semibold text-[#0B1220]">Owner</div>
                <div className="text-[#55627A]">Service business — North America</div>
              </div>
              <div className="ml-6 inline-flex items-center gap-1 text-[#0B1220]">
                <Star className="h-4 w-4 text-[#2563EB]" />
                <span className="font-semibold">4.7</span>
                <span className="text-[#6B778C]">avg satisfaction</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-14 sm:pb-16">
          <div className="text-center">
            <h3 className="text-[28px] sm:text-[36px] font-semibold text-[#0B1220] leading-tight">
              Focus on the work — leave the customer chase to us
            </h3>
            <p className="mt-3 text-[14px] sm:text-[15px] text-[#55627A] max-w-2xl mx-auto">
              Instant estimates, 24/7 answering, follow-ups, and review requests — running quietly in the background.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: "Instant estimates",
                desc: "Customers get pricing ranges in seconds — without waiting.",
                icon: <Zap className="h-5 w-5" />,
              },
              {
                title: "24/7 answering",
                desc: "Calls and messages answered automatically with lead capture.",
                icon: <PhoneCall className="h-5 w-5" />,
              },
              {
                title: "Follow-ups that don't forget",
                desc: "Recover missed leads with fast texts and reminders.",
                icon: <MessageSquare className="h-5 w-5" />,
              },
              {
                title: "Review requests on autopilot",
                desc: "Automatic review follow-ups to build trust and rankings.",
                icon: <Star className="h-5 w-5" />,
              },
            ].map((c) => (
              <div
                key={c.title}
                data-testid={`focus-card-${c.title.toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-2xl border border-[#E7ECF5] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)] p-5"
              >
                <div className="h-10 w-10 rounded-xl bg-[#EEF4FF] border border-[#DCE8FF] flex items-center justify-center text-[#2563EB]">
                  {c.icon}
                </div>
                <div className="mt-3 font-semibold text-[#0B1220]">{c.title}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-[#55627A]">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
