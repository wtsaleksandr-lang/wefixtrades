import { useEffect } from "react";

/**
 * Injects FAQPage JSON-LD structured data into <head>.
 * Call once per page with the FAQ items array.
 * Cleans up on unmount.
 */
export function useFaqSchema(faqs: Array<{ question: string; answer: string }>) {
  useEffect(() => {
    if (faqs.length === 0) return;

    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    script.dataset.faqSchema = "true";
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [faqs]);
}
