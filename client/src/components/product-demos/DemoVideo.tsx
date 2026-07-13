/**
 * DemoVideo — captured product-demo loop rendered in the same dark glass card
 * frame the animated <*Demo/> components use, so a real screen-capture can
 * stand in for a hand-built animation in the product "See it in action" cards.
 *
 * Behaviour:
 *  - autoplay-muted-loop 16:9 video (webm → mp4), objectFit:cover, poster frame.
 *  - prefers-reduced-motion: no autoplay — the poster still frame is shown.
 *  - onError (asset missing / decode fail): degrades to the supplied `fallback`
 *    node (the original animated demo component) so nothing ever renders blank.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { mkt } from "@/theme/tokens";

interface DemoVideoProps {
  /** mp4 (h264) source path under /videos. */
  src: string;
  /** webm (vp9) source path — preferred, smaller. */
  webm: string;
  /** poster still (payoff frame) shown before play / under reduced-motion. */
  poster: string;
  /** Descriptive accessible label for the loop. */
  label: string;
  /** Rendered if the video fails to load — keep the original animated demo. */
  fallback?: ReactNode;
  /** Max width of the card, matching the demo it replaces. */
  maxWidth?: number;
}

export default function DemoVideo({ src, webm, poster, label, fallback, maxWidth = 420 }: DemoVideoProps) {
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Honour reduced-motion at runtime: pause on the poster/first frame.
  useEffect(() => {
    if (!reduced) return;
    const v = videoRef.current;
    if (v) {
      v.pause();
      try { v.currentTime = 0; } catch { /* not seekable yet — poster still shows */ }
    }
  }, [reduced]);

  if (failed && fallback) return <>{fallback}</>;

  return (
    <div style={{ position: "relative", width: "100%", maxWidth, margin: "0 auto" }}>
      <div
        style={{
          position: "absolute",
          inset: -40,
          background: "radial-gradient(ellipse, rgba(13,60,252,0.12) 0%, transparent 60%)",
          pointerEvents: "none",
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          paddingBottom: "56.25%", // 16:9 — matches the captured frame
          borderRadius: 20,
          overflow: "hidden",
          border: `1px solid ${mkt.onDarkBorder}`,
          background: mkt.dark,
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}
      >
        <video
          ref={videoRef}
          role="img"
          aria-label={label}
          poster={poster}
          autoPlay={!reduced}
          loop
          muted
          playsInline
          preload="metadata"
          onError={() => setFallbackOnError(setFailed, fallback)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        >
          <source src={webm} type="video/webm" />
          <source src={src} type="video/mp4" />
        </video>
      </div>
    </div>
  );
}

/** Only flip to the fallback when one is provided; otherwise keep the poster. */
function setFallbackOnError(setFailed: (v: boolean) => void, fallback?: ReactNode) {
  if (fallback) setFailed(true);
}
