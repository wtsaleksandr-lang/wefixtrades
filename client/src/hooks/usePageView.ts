import { useEffect } from "react";

export function usePageView(path: string) {
  useEffect(() => {
    fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: path }),
    }).catch(() => {});
  }, [path]);
}
