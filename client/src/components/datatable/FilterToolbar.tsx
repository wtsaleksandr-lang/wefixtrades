/**
 * FilterToolbar — a search + filter + date-range strip for card-grid pages
 * (the customer portal Content page, etc.) where there are no table column
 * headers to embed filters into. Reuses HeaderFilterDropdown for each
 * filter so the look matches the admin table headers.
 */
import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HeaderFilterDropdown, type HeaderFilterOption } from "./HeaderFilterDropdown";

export type DateRange = "all" | "today" | "7d" | "30d";

/** Epoch-ms cutoff for a date range, or null for "all". */
export function dateRangeCutoff(range: DateRange): number | null {
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === "7d") return Date.now() - 7 * 86_400_000;
  if (range === "30d") return Date.now() - 30 * 86_400_000;
  return null;
}

const DATE_LABELS: Record<DateRange, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

function DateRangeDropdown({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const active = value !== "all";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-gray-50 ${
            active ? "border-indigo-300 font-medium text-indigo-700" : "text-gray-700"
          }`}
        >
          {active ? DATE_LABELS[value] : "Date"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        {(Object.keys(DATE_LABELS) as DateRange[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => { onChange(r); setOpen(false); }}
            className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${
              value === r ? "font-medium text-indigo-700" : ""
            }`}
          >
            {DATE_LABELS[r]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export interface ToolbarFilter {
  label: string;
  options: HeaderFilterOption[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  searchable?: boolean;
}

export function FilterToolbar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  filters = [],
  dateRange,
  onDateRange,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  dateRange?: DateRange;
  onDateRange?: (r: DateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 w-48 pl-8 text-sm sm:w-60"
        />
      </div>
      {filters.map((f) => (
        <div key={f.label} className="rounded-md border px-2 py-1">
          <HeaderFilterDropdown
            label={f.label}
            options={f.options}
            selected={f.selected}
            onChange={f.onChange}
            searchable={f.searchable}
          />
        </div>
      ))}
      {dateRange !== undefined && onDateRange && (
        <DateRangeDropdown value={dateRange} onChange={onDateRange} />
      )}
    </div>
  );
}
