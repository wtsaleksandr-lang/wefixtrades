import { useEffect } from "react";

/**
 * Sets the document title for the current page.
 * Appends " — WeFixTrades" suffix automatically.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — WeFixTrades`;
    return () => { document.title = "WeFixTrades"; };
  }, [title]);
}
