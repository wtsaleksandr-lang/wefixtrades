import { useEffect } from "react";

export function useScrollReveal() {
  useEffect(() => {
    const applyReveal = () => {
      const els = document.querySelectorAll("[data-reveal]");
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-visible");
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
      );
      els.forEach((el) => observer.observe(el));
      return observer;
    };

    const observer = applyReveal();
    return () => observer.disconnect();
  }, []);
}
