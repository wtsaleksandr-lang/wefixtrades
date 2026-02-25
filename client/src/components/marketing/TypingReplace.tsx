import { useState, useEffect, useRef } from "react";

interface TypingReplaceProps {
  words: string[];
  color?: string;
  fontSize?: string | number;
}

export default function TypingReplace({
  words,
  color = "#6EE7B7",
  fontSize = "clamp(22px, 2.6vw, 38px)",
}: TypingReplaceProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [highlightWidth, setHighlightWidth] = useState(0);
  const [highlightOpacity, setHighlightOpacity] = useState(0);

  const measureRef = useRef<HTMLSpanElement>(null);
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

      /* ── 1. TYPE ── */
      let charIndex = 0;
      const typeInterval = setInterval(() => {
        charIndex++;
        const next = word.slice(0, charIndex);
        displayedRef.current = next;
        setDisplayedText(next);
        if (charIndex >= word.length) {
          clearInterval(typeInterval);

          /* ── 2. PAUSE ── */
          schedule(() => {
            /* ── 3. HIGHLIGHT IN ── */
            const w = measureRef.current?.offsetWidth ?? 0;
            setHighlightWidth(w);
            setHighlightOpacity(1);

            /* ── 4. HOLD ── */
            schedule(() => {
              /* ── 5. DELETE ── */
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

                  /* ── 6. GAP → NEXT WORD ── */
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

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        overflow: "hidden",
        maxWidth: "100%",
        minHeight: "1.5em",
        flexWrap: "nowrap",
      }}
    >
      <span
        style={{
          color: "rgba(255,255,255,0.45)",
          fontSize,
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        Built for
      </span>

      <span style={{ position: "relative", display: "inline-block" }}>
        {/* Selection highlight */}
        <span
          style={{
            position: "absolute",
            top: "0.05em",
            left: 0,
            bottom: "0.05em",
            width: highlightWidth,
            opacity: highlightOpacity,
            background: "rgba(37,99,235,0.38)",
            borderRadius: 4,
            transition: "width 130ms ease, opacity 150ms ease",
            pointerEvents: "none",
          }}
        />

        {/* Visible typed text */}
        <span
          style={{
            color,
            fontWeight: 800,
            fontSize,
            position: "relative",
            zIndex: 1,
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
          }}
        >
          {displayedText}
        </span>

        {/* Blinking caret */}
        <span
          className="mkt-cursor"
          style={{
            display: "inline-block",
            width: 2,
            height: "0.85em",
            background: color,
            marginLeft: 1,
            verticalAlign: "text-bottom",
            position: "relative",
            zIndex: 1,
            borderRadius: 1,
          }}
        />

        {/* Hidden measuring span — always full current word */}
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
