import { useEffect } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Effortel-matched easing: smooth ease-out with slight overshoot
const EASE = "cubic-bezier(0.526, 0.007, 0, 0.989)";

const REVEAL_VARIANTS: Record<string, gsap.TweenVars> = {
  "fade-up":    { y: 40, opacity: 0 },
  "fade-left":  { x: -32, opacity: 0 },
  "fade-right": { x: 32, opacity: 0 },
  "scale":      { scale: 0.94, opacity: 0 },
  "fade":       { opacity: 0 },
};

export function useScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const triggers: ScrollTrigger[] = [];

    els.forEach((el) => {
      const variant = el.getAttribute("data-reveal") || "fade-up";
      const delayAttr = el.getAttribute("data-delay");
      const delay = delayAttr ? parseInt(delayAttr, 10) / 1000 : 0;

      const from = REVEAL_VARIANTS[variant] ?? REVEAL_VARIANTS["fade-up"];

      gsap.set(el, from);

      const trigger = ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        once: true,
        onEnter: () => {
          gsap.to(el, {
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.72,
            delay,
            ease: EASE,
            clearProps: "transform",
          });
        },
      });

      triggers.push(trigger);
    });

    return () => {
      triggers.forEach((t) => t.kill());
    };
  }, []);
}
