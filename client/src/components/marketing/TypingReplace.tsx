import { useState, useEffect, useRef } from "react";
import { mkt, colors } from "@/theme/tokens";

interface TypingReplaceProps {
  words: string[];
  color?: string;
  fontSize?: string | number;
}

export default function TypingReplace({
  words,
  color = colors.accent.blue,
  fontSize = "clamp(22px, 2.6vw, 36px)",
}: TypingReplaceProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [highlightWidth, setHighlightWidth] = useState(0);
  const [highlightOpacity, setHighlightOpacity] = useState(0);

  const measureRef = useRef<HTMLSpanElement>(null);
  const cursorMeasureRef = useRef<HTMLSpanElement>(null);
  const wordIndexRef = useRef(0);
  const displayedRef = useRef("");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const reducedMotion = useRef(false);

  const clearAll = () => {
    timersRef.current.forEach(clearTimeout);
    intervalsRef.current.forEach(clearInterval);
    timersRef.current = [];
    intervalsRef.current = [];
  };

  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  };

  useEffect(() => {
    reducedMotion.current =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion.current) {
      setDisplayedText(words[0]);
      let i = 0;
      const id = setInterval(() => {
        i = (i + 1) % words.length;
        setDisplayedText("");
        setTimeout(() => setDisplayedText(words[i]), 400);
      }, 2500);
      intervalsRef.current.push(id);
      return () => clearAll();
    }

    function startLoop() {
      const word = words[wordIndexRef.current];

      let charIndex = 0;
      const typeInterval = setInterval(() => {
        charIndex++;
        const next = word.slice(0, charIndex);
        displayedRef.current = next;
        setDisplayedText(next);
        if (charIndex >= word.length) {
          clearInterval(typeInterval);

          schedule(() => {
            const w = measureRef.current?.offsetWidth ?? 0;
            setHighlightWidth(w);
            setHighlightOpacity(1);

            schedule(() => {
              let remaining = word.length;
              const half = Math.ceil(remaining / 2);
              let fadeStarted = false;

              const deleteInterval = setInterval(() => {
                remaining--;
                const next = word.slice(0, remaining);
                displayedRef.current = next;
                setDisplayedText(next);

                if (!fadeStarted && remaining <= half) {
                  fadeStarted = true;
                  setHighlightOpacity(0);
                }

                if (remaining <= 0) {
                  clearInterval(deleteInterval);
                  setHighlightWidth(0);

                  schedule(() => {
                    wordIndexRef.current =
                      (wordIndexRef.current + 1) % words.length;
                    startLoop();
                  }, 160);
                }
              }, 22);
              intervalsRef.current.push(deleteInterval);
            }, 350);
          }, 700);
        }
      }, 42);
      intervalsRef.current.push(typeInterval);
    }

    startLoop();
    return () => clearAll();
  }, []);

  const longestWord = words.reduce((a, b) => (a.length > b.length ? a : b), "");

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 14,
        padding: "10px 24px",
        minHeight: "1.5em",
      }}
    >
      <span
        style={{
          color: colors.text.secondary,
          fontSize,
          fontWeight: 600,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        Built for
      </span>
      <span style={{ position: "relative", display: "inline-block" }}>
        <span
          aria-hidden="true"
          style={{
            visibility: "hidden",
            whiteSpace: "pre",
            fontWeight: 800,
            fontSize,
            letterSpacing: "-0.01em",
            pointerEvents: "none",
            display: "inline-block",
          }}
        >
          {longestWord}
        </span>

        <span
          style={{
            position: "absolute",
            top: "0.05em",
            left: -2,
            bottom: "0.05em",
            width: highlightWidth ? highlightWidth + 4 : 0,
            opacity: highlightOpacity,
            background: colors.accent.blueGlow,
            borderRadius: 4,
            transition: "width 130ms ease, opacity 150ms ease",
            pointerEvents: "none",
          }}
        />

        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            display: "inline-flex",
            alignItems: "baseline",
            zIndex: 1,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              color,
              fontWeight: 800,
              fontSize,
              letterSpacing: "-0.01em",
            }}
            className={`text-[${colors.accent.blue}]`}
          >
            {displayedText}
          </span>
          <span
            className="mkt-cursor"
            style={{
              display: "inline-block",
              width: 2,
              height: "0.85em",
              background: color,
              marginLeft: 1,
              verticalAlign: "text-bottom",
              borderRadius: 1,
            }}
          />
        </span>

        <span
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            visibility: "hidden",
            whiteSpace: "pre",
            fontWeight: 800,
            fontSize,
            letterSpacing: "-0.01em",
            pointerEvents: "none",
            left: 0,
            top: 0,
          }}
        >
          {words[wordIndexRef.current]}
        </span>
      </span>
    </div>
  );
}
