import { useEffect } from "react";

/**
 * Injects BreadcrumbList JSON-LD structured data into <head>.
 * Cleans up on unmount.
 */
export function useBreadcrumbSchema(
  items: Array<{ name: string; url: string }>,
) {
  useEffect(() => {
    if (items.length === 0) return;

    const schema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        item: item.url,
      })),
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    script.dataset.breadcrumbSchema = "true";
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [items]);
}
