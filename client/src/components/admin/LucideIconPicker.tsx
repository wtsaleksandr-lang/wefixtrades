/**
 * Lucide icon picker — premium curated gallery for selecting a default-logo
 * icon used by QuoteQuick trades + templates.
 *
 * Uses the curated `QUOTEQUICK_ICONS` set from
 * `client/src/data/quoteQuickIcons.ts` (~72 icons across 8 categories — NOT
 * the full lucide library, which would defeat tree-shaking and overwhelm
 * the admin). Features search + category chip filter + previewed selection.
 *
 * Usage (unchanged from earlier wave):
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
import {
  QUOTEQUICK_ICONS,
  QUOTEQUICK_ICON_NAMES,
  QUOTEQUICK_ICON_CATEGORIES,
  QUOTEQUICK_ICON_CATEGORY_OF,
  type QuoteQuickIconName,
  type QuoteQuickIconCategoryId,
} from "@/data/quoteQuickIcons";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | QuoteQuickIconCategoryId;

interface LucideIconPickerProps {
  open: boolean;
  value?: string | null;
  onClose: () => void;
  onSelect: (iconName: QuoteQuickIconName) => void;
  /** Optional accent colour for the rendered preview tile. Defaults to brand primary. */
  accent?: string;
}

export default function LucideIconPicker({
  open,
  value,
  onClose,
  onSelect,
  accent = "hsl(var(--primary))",
}: LucideIconPickerProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selected, setSelected] = useState<QuoteQuickIconName | null>(
    (value as QuoteQuickIconName) ?? null,
  );

  // Re-sync selected with incoming value and jump to its category when the
  // dialog opens.
  useEffect(() => {
    if (open) {
      const v = (value as QuoteQuickIconName) ?? null;
      setSelected(v);
      setSearch("");
      setCategory(v && QUOTEQUICK_ICON_CATEGORY_OF[v] ? QUOTEQUICK_ICON_CATEGORY_OF[v] : "all");
    }
  }, [open, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base =
      category === "all"
        ? QUOTEQUICK_ICON_NAMES
        : QUOTEQUICK_ICON_NAMES.filter((n) => QUOTEQUICK_ICON_CATEGORY_OF[n] === category);
    if (!q) return base;
    return base.filter((name) => name.toLowerCase().includes(q));
  }, [search, category]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
        </DialogHeader>

        <div className="relative mb-3">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            placeholder="Search icons by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            data-testid="icon-picker-search"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Icon categories">
          <CategoryChip
            label="All"
            active={category === "all"}
            onClick={() => setCategory("all")}
          />
          {QUOTEQUICK_ICON_CATEGORIES.map((cat) => (
            <CategoryChip
              key={cat.id}
              label={cat.label}
              active={category === cat.id}
              onClick={() => setCategory(cat.id)}
              testId={`icon-category-${cat.id}`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">
              No icons match “{search}”.
            </div>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
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
                    aria-pressed={isSelected}
                    className={cn(
                      "group relative flex flex-col items-center justify-center rounded-lg border bg-card",
                      "px-1.5 py-2 transition-all duration-150",
                      "hover:-translate-y-0.5 hover:shadow-sm hover:bg-accent/40",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                      isSelected
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : "border-border",
                    )}
                  >
                    {isSelected && (
                      <span
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm"
                        aria-hidden="true"
                      >
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      </span>
                    )}
                    <div
                      className="w-12 h-12 rounded-md flex items-center justify-center"
                      style={{ background: isSelected ? `${accent}1f` : "transparent" }}
                    >
                      <Icon
                        size={24}
                        color={isSelected ? accent : "currentColor"}
                        strokeWidth={2}
                        className={cn(
                          "transition-colors",
                          isSelected ? "" : "text-foreground/80 group-hover:text-foreground",
                        )}
                      />
                    </div>
                    <div className="text-[10px] leading-tight text-muted-foreground mt-1 truncate w-full text-center">
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

interface CategoryChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}

function CategoryChip({ label, active, onClick, testId }: CategoryChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "px-2.5 py-1 text-xs font-medium rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        active
          ? "border-primary text-primary bg-primary/10"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40",
      )}
    >
      {label}
    </button>
  );
}
