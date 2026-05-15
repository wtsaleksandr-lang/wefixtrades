/**
 * HeaderFilterDropdown — a column-header filter for data tables.
 *
 * Renders a clickable header label with a chevron; clicking opens a
 * popover of multi-select checkboxes. Empty selection = no filter.
 * Reusable across every product table (ContentFlow, SocialSync, …).
 */
import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";

export interface HeaderFilterOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export function HeaderFilterDropdown({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  align = "start",
}: {
  label: string;
  options: HeaderFilterOption[];
  /** Selected values. Empty set = no filter applied. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Show a search box inside the popover (for long lists like clients). */
  searchable?: boolean;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const active = selected.size > 0;

  const shown = useMemo(() => {
    if (!searchable || !q.trim()) return options;
    const ql = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(ql));
  }, [options, q, searchable]);

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded transition-colors hover:bg-gray-100 ${
            active ? "text-indigo-700 font-semibold" : ""
          }`}
        >
          {label}
          {active && (
            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-indigo-100 px-1 text-[10px] text-indigo-700">
              {selected.size}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-56 p-2">
        {searchable && (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="mb-2 h-8 text-sm"
          />
        )}
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {shown.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</div>
          )}
          {shown.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50"
            >
              <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
              {o.icon}
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="mt-2 w-full text-center text-xs text-indigo-600 hover:underline"
          >
            Clear filter
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
