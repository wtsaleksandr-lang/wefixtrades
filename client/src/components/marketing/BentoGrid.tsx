import { useEffect, useRef, useState } from "react";
import { useRive } from "@rive-app/react-canvas";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* ── edit content here ───────────────────────────────────────────────── */

const SECTION_HEADING = {
  line1: "From Vision to Reality:",
  line2: "Launching Your MVNO",
  highlight: "Your MVNO",
  subtitle:
    "Effortel's MVNO LaunchPad and Mobile Suite provide the foundation you need to not only launch your MVNO with unprecedented speed, but also thrive in the competitive telecommunications landscape.",
};

const BENTO_DATA = [
  // Row 1
  {
    row: 1,
    size: "small" as const,
    title: "Rapid Time-to-Market",
    description:
      "Fast MVNO launch with pre-configured modules and expert guidance.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eabe04512ce29a391f1c8f_home___bento___launch.riv",
    mobileImage:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67ac7c3f85e907f8edb90b8b_LaunchBento.svg",
    canvasSize: { width: 166, height: 166 },
  },
  {
    row: 1,
    size: "large" as const,
    title: "Proven Methodology",
    description:
      "Step-by-step LaunchPad program for planning, implementation, marketing, and acquisition.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eabe04da3f942ebdcfe3b9_home___bento___business_plan%20(1).riv",
    mobileImage:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67ac7bd0f7cbce9d93123833_BP%20mobile.svg",
    canvasSize: { width: 335, height: 167 },
  },
  // Row 2 — wide first, then narrow
  {
    row: 2,
    size: "large" as const,
    title: "Scalability and Performance",
    description:
      "Platform scales to meet growing demands, ensuring peak performance.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eabe04a9adbc4bb69179e2_home___bento___performance.riv",
    mobileImage:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67ac7f33c64c18598e9358be_Performance%20Mobile.svg",
    canvasSize: { width: 335, height: 167 },
  },
  {
    row: 2,
    size: "small" as const,
    title: "Reduced Operational Costs",
    description:
      "Streamlined automation and interface for optimized resources.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eba32013c4292f5dbd55b0_home___bento___cost%20(2).riv",
    mobileImage:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67ac802e9b2b1323a3ce791e_Metric.svg",
    canvasSize: { width: 166, height: 166 },
  },
  // Row 3
  {
    row: 3,
    size: "small" as const,
    title: "Expert Support",
    description: "24/7 support for smooth and efficient operations.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eabe044ccd47ce4732cded_home___bento___chat%20(2).riv",
    mobileImage:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67a0e74da325fe9f8205305d_Chat%20(1).webp",
    canvasSize: { width: 166, height: 166 },
  },
  {
    row: 3,
    size: "large" as const,
    title: "Unmatched Flexibility",
    description:
      "Configurable workflows, rules, and integrations for unique business needs.",
    riveUrl:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67eabe04b8befb8a3707dc96_home___bento___flexibility.riv",
    mobileImage:
      "https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/67ac8744fcbaf9f6c913621a_FlexibilityMob.svg",
    canvasSize: { width: 335, height: 167 },
  },
] as const;

/* ── Effortel color tokens ───────────────────────────────────────────── */
const BG = "#e4edf1";
const CARD_BG = "#f5fcff";
const TEXT = "#22282a";
const TEXT_MUTED = "#5f6f77";
const ACCENT = "#06b6d4";

/* ── Rive visual (desktop only — split so useRive never mounts on mobile) */
function BentoVisualDesktop({
  riveUrl,
  canvasSize,
}: {
  riveUrl: string;
  canvasSize: { width: number; height: number };
}) {
  const { RiveComponent } = useRive({
    src: riveUrl,
    stateMachines: "State Machine 1",
    autoplay: true,
  });
  return (
    <div
      style={{
        width: "100%",
        maxWidth: canvasSize.width,
        // maintain aspect ratio as card narrows on tablet
        aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
        margin: "0 auto",
      }}
    >
      <RiveComponent />
    </div>
  );
}

function BentoVisual({
  riveUrl,
  mobileImage,
  canvasSize,
  mobile,
}: {
  riveUrl: string;
  mobileImage: string;
  canvasSize: { width: number; height: number };
  mobile: boolean;
}) {
  if (mobile) {
    return (
      <img
        src={mobileImage}
        alt=""
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    );
  }
  return (
    <BentoVisualDesktop riveUrl={riveUrl} canvasSize={canvasSize} />
  );
}

/* ── heading with highlighted word ──────────────────────────────────── */
function HeadingWords({
  text,
  highlight,
  headingRef,
}: {
  text: string;
  highlight: string;
  headingRef: React.RefObject<HTMLDivElement>;
}) {
  const words = text.split(" ");
  const highlightWords = highlight.split(" ");

  // Build token list: mark which words are part of the highlight phrase
  const tokens: { word: string; isHighlight: boolean }[] = [];
  let hi = 0;
  for (let i = 0; i < words.length; i++) {
    if (
      hi < highlightWords.length &&
      words[i] === highlightWords[hi]
    ) {
      tokens.push({ word: words[i], isHighlight: true });
      hi++;
    } else {
      hi = 0; // reset if sequence breaks
      tokens.push({ word: words[i], isHighlight: false });
    }
  }

  return (
    <div ref={headingRef} style={{ display: "inline" }}>
      {tokens.map((t, i) => (
        <span
          key={i}
          className="bento-word"
          style={{
            display: "inline-block",
            opacity: 0,
            color: t.isHighlight ? ACCENT : TEXT,
            marginRight: i < tokens.length - 1 ? "0.25em" : 0,
          }}
        >
          {t.word}
        </span>
      ))}
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────── */
export default function BentoGrid() {
  const [mobile, setMobile] = useState(false);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headingRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  // Mobile detection
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // GSAP animations
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Heading words animate in
      if (headingRef.current) {
        const words = headingRef.current.querySelectorAll(".bento-word");
        gsap.fromTo(
          words,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: "power2.out",
            stagger: 0.08,
            scrollTrigger: {
              trigger: headingRef.current,
              start: "top 88%",
            },
          }
        );
      }

      // Subtitle fades in
      if (subtitleRef.current) {
        gsap.fromTo(
          subtitleRef.current,
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: "power2.out",
            delay: 0.3,
            scrollTrigger: {
              trigger: subtitleRef.current,
              start: "top 90%",
            },
          }
        );
      }

      // Per-row card entrance
      rowRefs.current.forEach((rowEl) => {
        if (!rowEl) return;
        const cards = Array.from(rowEl.children) as HTMLElement[];
        gsap.fromTo(
          cards,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: "power2.out",
            stagger: 0.15,
            scrollTrigger: {
              trigger: rowEl,
              start: "top 85%",
            },
          }
        );
      });
    });

    return () => ctx.revert();
  }, []);

  // Group cards by row
  const rows = [1, 2, 3].map((r) =>
    BENTO_DATA.filter((c) => c.row === r)
  );

  const headingFull = `${SECTION_HEADING.line1} ${SECTION_HEADING.line2}`;

  return (
    <section
      data-testid="bento-grid"
      style={{
        background: BG,
        padding: mobile ? "48px 16px 80px" : "80px 28px 140px",
        overflow: "hidden",
        position: "relative",
        zIndex: 2,
      }}
    >
      {/* ── heading ────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto 56px",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            margin: "0 0 20px",
            fontSize: "clamp(28px, 3.5vw, 46px)",
            fontWeight: 400,
            lineHeight: 1.15,
            letterSpacing: "-0.025em",
            color: TEXT,
          }}
        >
          <HeadingWords
            text={headingFull}
            highlight={SECTION_HEADING.highlight}
            headingRef={headingRef as React.RefObject<HTMLDivElement>}
          />
        </h2>
        <p
          ref={subtitleRef}
          style={{
            margin: "0 auto",
            maxWidth: 600,
            fontSize: 16,
            lineHeight: 1.7,
            color: TEXT_MUTED,
            opacity: 0,
          }}
        >
          {SECTION_HEADING.subtitle}
        </p>
      </div>

      {/* ── bento grid ──────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {rows.map((rowCards, ri) => (
          <div
            key={ri}
            ref={(el) => { rowRefs.current[ri] = el; }}
            style={{
              display: "flex",
              flexDirection: mobile ? "column" : "row",
              gap: 16,
            }}
          >
            {rowCards.map((card) => (
              <div
                key={card.title}
                style={{
                  flexBasis: mobile
                    ? "100%"
                    : card.size === "small"
                    ? "33.333%"
                    : undefined,
                  flex: card.size === "large" || mobile ? 1 : undefined,
                  flexShrink: card.size === "small" && !mobile ? 0 : undefined,
                  background: CARD_BG,
                  borderRadius: 20,
                  border: "1px solid rgba(213,225,231,0.6)",
                  padding: "28px 28px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                  boxShadow: "0 2px 16px rgba(34,40,42,0.05)",
                }}
              >
                {/* text */}
                <div>
                  <h3
                    style={{
                      margin: "0 0 10px",
                      fontSize: 17,
                      fontWeight: 700,
                      color: TEXT,
                      lineHeight: 1.3,
                    }}
                  >
                    {card.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.65,
                      color: TEXT_MUTED,
                    }}
                  >
                    {card.description}
                  </p>
                </div>

                {/* visual */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                  }}
                >
                  <BentoVisual
                    riveUrl={card.riveUrl}
                    mobileImage={card.mobileImage}
                    canvasSize={card.canvasSize}
                    mobile={mobile}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
