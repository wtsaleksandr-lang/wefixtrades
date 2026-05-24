/**
 * useListUrlState
 *
 * Two-way binding between the browser URL's query string and the search +
 * filter state used by `<ListSearchAndFilters>`. Designed so refresh /
 * back-button preserves what the operator was looking at.
 *
 * Why a custom hook instead of wouter's useLocation: wouter's helper
 * only exposes the pathname; query string handling is left to the
 * caller. We read/write `window.location.search` directly and use
 * `history.replaceState` so changes don't pile up in the history stack
 * — operators expect Back to return to the previous page, not to
 * undo every chip click.
 *
 * The hook deliberately uses ONE param key for search (`q`) and one
 * key per filter group. Filter values are joined with commas because
 * the chip groups in this app are short tokens (status / priority /
 * etc.) where commas don't collide.
 */
import { useCallback, useEffect, useState } from "react";

export interface ListUrlState {
  search: string;
  filters: Record<string, string[]>;
}

function parseFromLocation(filterKeys: string[]): ListUrlState {
  if (typeof window === "undefined") return { search: "", filters: {} };
  const sp = new URLSearchParams(window.location.search);
  const filters: Record<string, string[]> = {};
  for (const key of filterKeys) {
    const v = sp.get(key);
    if (v) filters[key] = v.split(",").filter(Boolean);
  }
  return { search: sp.get("q") ?? "", filters };
}

export function useListUrlState(filterKeys: string[]): {
  search: string;
  filters: Record<string, string[]>;
  setSearch: (v: string) => void;
  setFilters: (next: Record<string, string[]>) => void;
} {
  const [state, setState] = useState<ListUrlState>(() =>
    parseFromLocation(filterKeys),
  );

  // Re-sync on browser back/forward.
  useEffect(() => {
    const handler = () => setState(parseFromLocation(filterKeys));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKeys.join(",")]);

  const writeUrl = useCallback(
    (next: ListUrlState) => {
      if (typeof window === "undefined") return;
      const sp = new URLSearchParams(window.location.search);
      if (next.search) sp.set("q", next.search);
      else sp.delete("q");
      for (const key of filterKeys) {
        const vals = next.filters[key];
        if (vals && vals.length > 0) sp.set(key, vals.join(","));
        else sp.delete(key);
      }
      const qs = sp.toString();
      const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKeys.join(",")],
  );

  const setSearch = useCallback(
    (v: string) => {
      setState((prev) => {
        const next = { ...prev, search: v };
        writeUrl(next);
        return next;
      });
    },
    [writeUrl],
  );

  const setFilters = useCallback(
    (filters: Record<string, string[]>) => {
      setState((prev) => {
        const next = { ...prev, filters };
        writeUrl(next);
        return next;
      });
    },
    [writeUrl],
  );

  return { search: state.search, filters: state.filters, setSearch, setFilters };
}
