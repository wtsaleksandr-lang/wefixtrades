/**
 * Lucide icon picker — modal for selecting a default-logo icon used by
 * QuoteQuick trades + templates.
 *
 * Wave W-AI-3a. Uses the curated `QUOTEQUICK_ICONS` set from
 * `client/src/data/quoteQuickIcons.ts` (NOT the full lucide library — that
 * would be 1000+ icons / overwhelming and would defeat tree-shaking).
 *
 * Usage:
 *   <LucideIconPicker
 *     open={open}
 *     value={currentIconName}
 *     onClose={() => setOpen(false)}
 *     onSelect={(name) => save(name)}
 *   />
 */

import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Check } from "lucide-react";
import { QUOTEQUICK_ICONS, QUOTEQUICK_ICON_NAMES, type QuoteQuickIconName } from "@/data/quoteQuickIcons";
import { cn } from "@/lib/utils";

interface LucideIconPickerProps {
  open: boolean;
  value?: string | null;
  onClose: () => void;
  onSelect: (iconName: QuoteQuickIconName) => void;
  /** Optional accent colour for the rendered preview tile. Defaults to indigo. */
  accent?: string;
}

export default function LucideIconPicker({
  open,
  value,
  onClose,
  onSelect,
  accent = "#4f46e5",
}: LucideIconPickerProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<QuoteQuickIconName | null>(
    (value as QuoteQuickIconName) ?? null,
  );

  // Re-sync selected with incoming value whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected((value as QuoteQuickIconName) ?? null);
      setSearch("");
    }
  }, [open, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return QUOTEQUICK_ICON_NAMES;
    return QUOTEQUICK_ICON_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [search]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <Input
            type="search"
            placeholder="Search icons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            data-testid="icon-picker-search"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <div className="text-sm text-gray-500 py-10 text-center">
              No icons match “{search}”.
            </div>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {filtered.map((name) => {
                const Icon = QUOTEQUICK_ICONS[name];
                const isSelected = selected === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelected(name)}
                    onDoubleClick={() => {
                      setSelected(name);
                      onSelect(name);
                    }}
                    title={name}
                    data-testid={`icon-option-${name}`}
                    className={cn(
                      "group flex flex-col items-center justify-center rounded-md border p-2 transition",
                      "hover:border-indigo-300 hover:bg-indigo-50",
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300"
                        : "border-gray-200",
                    )}
                  >
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center"
                      style={{ background: `${accent}1a` }}
                    >
                      <Icon size={18} color={accent} strokeWidth={2.25} />
                    </div>
                    <div className="text-[10px] text-gray-600 mt-1 truncate w-full text-center">
                      {name}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
            data-testid="icon-picker-confirm"
          >
            <Check className="w-3.5 h-3.5 mr-1" /> Use this icon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
