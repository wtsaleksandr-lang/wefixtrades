/**
 * ListSearchAndFilters
 *
 * Shared header for admin list pages: debounced search input + multi-select
 * filter chip groups + "Clear all" affordance. Visual + interaction surface
 * is unified across the 5 wired pages (Clients, Audit Leads, Support Inbox,
 * Admin Audit Log, Inbox) so operators learn the gesture once.
 *
 * Filtering itself happens in the caller — this component is purely a
 * controlled UI: it owns the debounced search input, but the parent
 * receives a debounced value via `onSearchChange` and the active filter
 * values via `onFiltersChange`. That keeps the component agnostic to
 * server-side vs client-side data sources.
 *
 * URL persistence is opt-in via the sibling `useListUrlState` hook —
 * pages that need refresh-preserving state call it and pipe the values
 * back into this component.
 */
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export type FilterOption = {
  /** Stable machine value persisted to URL — keep snake_case / lowercase. */
  value: string;
  /** Human label shown in the chip. */
  label: string;
  /** Optional small count rendered in muted text after the label. */
  count?: number;
};

export type FilterGroup = {
  /** Stable id — also the URL query-param key when persisted. */
  id: string;
  /** Human label, shown before the chip row (e.g. "Status"). */
  label: string;
  options: FilterOption[];
  /** Allow multiple chips selected concurrently. Defaults to `true`. */
  multi?: boolean;
};

export interface ListSearchAndFiltersProps {
  /** Debounced search value (parent state). */
  search: string;
  /** Called with the new search string after 250ms debounce. */
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;

  /** Filter groups to render. Empty array hides the chip row entirely. */
  filterGroups?: FilterGroup[];
  /** Map of group id -> selected option values. */
  activeFilters?: Record<string, string[]>;
  /** Called with a new (full) filter map whenever a chip is toggled. */
  onFiltersChange?: (next: Record<string, string[]>) => void;

  /** Extra slot rendered after the search input (e.g. a Refresh button). */
  rightSlot?: React.ReactNode;

  className?: string;
}

export default function ListSearchAndFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filterGroups = [],
  activeFilters = {},
  onFiltersChange,
  rightSlot,
  className = "",
}: ListSearchAndFiltersProps) {
  // Local input value so typing feels instant; debounce notifies parent.
  const [local, setLocal] = useState(search);
  const debounceRef = useRef<number | null>(null);

  // Keep local input in sync if parent resets the value externally
  // (e.g. "Clear all" or URL navigation).
  useEffect(() => {
    setLocal(search);
  }, [search]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (local === search) return; // no change, no notify
    debounceRef.current = window.setTimeout(() => {
      onSearchChange(local);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  const totalActiveChips = Object.values(activeFilters).reduce(
    (acc, arr) => acc + arr.length,
    0,
  );
  const hasAnyActive = totalActiveChips > 0 || (search?.trim().length ?? 0) > 0;

  function toggleChip(groupId: string, value: string, multi: boolean) {
    if (!onFiltersChange) return;
    const current = activeFilters[groupId] ?? [];
    let nextValues: string[];
    if (multi) {
      nextValues = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
    } else {
      // single-select chip group: clicking the active chip clears it
      nextValues = current.includes(value) ? [] : [value];
    }
    const next = { ...activeFilters };
    if (nextValues.length === 0) delete next[groupId];
    else next[groupId] = nextValues;
    onFiltersChange(next);
  }

  function clearAll() {
    setLocal("");
    onSearchChange("");
    if (onFiltersChange) onFiltersChange({});
  }

  return (
    <div data-theme="light" className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 h-10"
            aria-label="Search"
          />
          {local && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setLocal("");
                onSearchChange("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {rightSlot}
      </div>

      {filterGroups.length > 0 && (
        <div className="flex items-start gap-x-3 gap-y-1.5 flex-wrap">
          {filterGroups.map((group) => {
            const selected = activeFilters[group.id] ?? [];
            const multi = group.multi !== false;
            return (
              <div
                key={group.id}
                className="flex items-center gap-1.5 flex-wrap"
              >
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mr-0.5">
                  {group.label}
                </span>
                {group.options.map((opt) => {
                  const active = selected.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleChip(group.id, opt.value, multi)}
                      aria-pressed={active}
                      className={[
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                        active
                          ? "border-brand-blue text-brand-blue bg-brand-blue/5"
                          : "border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300",
                      ].join(" ")}
                    >
                      {opt.label}
                      {opt.count !== undefined && (
                        <span
                          className={
                            active ? "text-brand-blue/70" : "text-gray-400"
                          }
                        >
                          {opt.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {hasAnyActive && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-brand-blue hover:underline ml-auto font-medium"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
