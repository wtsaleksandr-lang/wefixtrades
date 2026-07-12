import { useEffect } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Effortel-matched easing: smooth ease-out with slight overshoot
const EASE = "cubic-bezier(0.526, 0.007, 0, 0.989)";

// Never start fully transparent. A card that is mid-stagger, mid-fade, or sitting
// just below the trigger line must stay legible (the audit caught reveal content
// left at ~2:1). The translate/scale still carries the entrance; opacity only
// dips to this floor, so content is always readable if the user lands or scrolls
// fast. Resting state is full opacity (see the tween target below).
const START_OPACITY = 0.45;

// Cap any per-element data-delay so a long stagger can never strand a later card
// at START_OPACITY for an appreciable time.
const MAX_DELAY = 0.25;

const REVEAL_VARIANTS: Record<string, gsap.TweenVars> = {
  "fade-up":    { y: 40, opacity: START_OPACITY },
  "fade-left":  { x: -32, opacity: START_OPACITY },
  "fade-right": { x: 32, opacity: START_OPACITY },
  "scale":      { scale: 0.94, opacity: START_OPACITY },
  "fade":       { opacity: START_OPACITY },
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
      const delay = Math.min(delayAttr ? parseInt(delayAttr, 10) / 1000 : 0, MAX_DELAY);

      const from = REVEAL_VARIANTS[variant] ?? REVEAL_VARIANTS["fade-up"];

      gsap.set(el, from);

      const trigger = ScrollTrigger.create({
        trigger: el,
        // Fire as soon as the top edge peeks into the viewport so a card that
        // lands at the bottom of the fold reveals immediately (with once:true it
        // will have finished animating by the time it is fully on screen),
        // rather than sitting at START_OPACITY until scrolled further.
        start: "top bottom",
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
