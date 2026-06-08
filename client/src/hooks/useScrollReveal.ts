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

    // Defensive: if ScrollTrigger (and therefore IntersectionObserver under
    // the hood) isn't usable for any reason, NEVER hide the content — leave it
    // visible. Without this guard a failed/unsupported ScrollTrigger would
    // leave every [data-reveal] element stuck at opacity:0 (blank page for
    // crawlers / older engines). The baseline [data-reveal] CSS is already
    // visible-by-default; we only opt into the hidden start state when we know
    // we can animate it back.
    if (!ScrollTrigger || typeof ScrollTrigger.create !== "function") {
      return;
    }

    els.forEach((el) => {
      // Never touch elements inside the automation diagram section
      if (el.closest('.ad-diagram')) return;

      const variant = el.getAttribute("data-reveal") || "fade-up";
      const delayAttr = el.getAttribute("data-delay");
      const delay = delayAttr ? parseInt(delayAttr, 10) / 1000 : 0;

      const from = REVEAL_VARIANTS[variant] ?? REVEAL_VARIANTS["fade-up"];

      gsap.set(el, from);

      const trigger = ScrollTrigger.create({
        trigger: el,
        start: "top 95%",
        once: true,
        onEnter: () => {
          gsap.to(el, {
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.55,
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
      // Safety net: on teardown, clear any leftover hidden inline state so an
      // element can never be left permanently invisible (e.g. a trigger killed
      // before it fired during a fast route change).
      els.forEach((el) => {
        if (el.closest('.ad-diagram')) return;
        gsap.set(el, { clearProps: "opacity,transform,x,y,scale" });
      });
    };
  }, []);
}
