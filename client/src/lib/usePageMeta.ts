import { useEffect } from "react";

interface PageMeta {
  title: string;
  description: string;
  canonicalPath: string;
}

/**
 * Sets document title, meta description, canonical URL, OG and Twitter Card tags.
 * Cleans up OG/Twitter tags on unmount to prevent stale data when navigating.
 */
export function usePageMeta({ title, description, canonicalPath }: PageMeta) {
  useEffect(() => {
    document.title = title;

    const origin = window.location.origin;
    const url = `${origin}${canonicalPath}`;

    const setName = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        (el as HTMLMetaElement).name = name;
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setProperty = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // Standard meta
    setName("description", description);

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;

    // Open Graph
    setProperty("og:title", title);
    setProperty("og:description", description);
    setProperty("og:url", url);

    // Twitter Card
    setName("twitter:title", title);
    setName("twitter:description", description);

    return () => {
      // Clean up OG/Twitter tags to prevent stale data
      for (const prop of ["og:title", "og:description", "og:url"]) {
        document.querySelector(`meta[property="${prop}"]`)?.remove();
      }
      for (const name of ["twitter:title", "twitter:description"]) {
        document.querySelector(`meta[name="${name}"]`)?.remove();
      }
    };
  }, [title, description, canonicalPath]);
}
