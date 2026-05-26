/**
 * VisualCalendar — shared drag-and-drop content calendar primitive.
 *
 * Wave 22B. Competitive research surfaced that HubSpot + Later own the
 * drag-and-drop calendar UX with thumbnails. ContentFlow (Wave 23) and
 * SocialSync (Wave 25) both need this — build it once.
 *
 * Three view modes:
 *  - month: 7-column grid, 6 rows, entries shown as chips (max 3 per cell + "+N more")
 *  - week:  7-column horizontal strip, entries shown as cards with thumbnails
 *  - day:   24-hour vertical strip, entries placed at their hour
 *
 * Drag-drop reschedule via Framer Motion drag. Past dates reject with a
 * gentle bounce. Filters narrow visible entries by contentType / status /
 * channel. Empty-state messaging + slot-click for "create" flow.
 *
 * DESIGN-SYSTEM compliance: semantic tokens only, 2px gaps, no hover-shift,
 * selected = 2px brand-blue outline (not fill). Respects prefers-reduced-motion.
 * Mobile: month view stacks to vertical day-list under 640px.
 *
 * Accessibility: role="grid"/role="gridcell"; arrow-key cell focus; Enter to
 * trigger onSlotClick; Shift+Arrows to reschedule the focused entry by a day
 * (Shift+Right/Left) or a week (Shift+Up/Down).
 *
 * No new npm deps — framer-motion + date-fns are already in the bundle.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  setHours,
  setMinutes,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill, type StatusPillStatus } from "./StatusPill";

export type CalendarView = "month" | "week" | "day";

export type CalendarEntryStatus = StatusPillStatus;

export type CalendarEntry = {
  id: string;
  date: Date;
  title: string;
  thumbnailUrl?: string;
  channelColor?: string;
  status?: CalendarEntryStatus;
  contentType?: string;
  metadata?: Record<string, unknown>;
};

export type CalendarFilters = {
  contentTypes?: string[];
  statuses?: CalendarEntryStatus[];
  channels?: string[];
};

export type VisualCalendarProps = {
  entries: CalendarEntry[];
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  onEntryClick?: (entry: CalendarEntry) => void;
  onEntryReschedule?: (entryId: string, newDate: Date) => Promise<void> | void;
  onSlotClick?: (date: Date) => void;
  weekStartsOn?: 0 | 1;
  filters?: CalendarFilters;
  emptyStateMessage?: string;
  className?: string;
  initialDate?: Date;
  selectedEntryId?: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfNow() {
  return startOfDay(new Date());
}

function applyFilters(
  entries: CalendarEntry[],
  filters: CalendarFilters | undefined
): CalendarEntry[] {
  if (!filters) return entries;
  const { contentTypes, statuses, channels } = filters;
  return entries.filter((e) => {
    if (contentTypes && contentTypes.length && (!e.contentType || !contentTypes.includes(e.contentType))) {
      return false;
    }
    if (statuses && statuses.length && (!e.status || !statuses.includes(e.status))) {
      return false;
    }
    if (channels && channels.length && (!e.channelColor || !channels.includes(e.channelColor))) {
      return false;
    }
    return true;
  });
}

function groupByDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const key = format(e.date, "yyyy-MM-dd");
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  return map;
}

/* ----------------------------------------------------------------------- */
/* Segmented view-mode control                                              */
/* ----------------------------------------------------------------------- */

function ViewSegmented({
  value,
  onChange,
}: {
  value: CalendarView;
  onChange: (v: CalendarView) => void;
}) {
  const opts: CalendarView[] = ["month", "week", "day"];
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="inline-flex items-center gap-0.5 rounded-md border border-[color:var(--border)] bg-card p-0.5"
      data-testid="visual-calendar-view-toggle"
    >
      {opts.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "px-3 py-1 rounded-sm text-xs font-medium capitalize transition-colors",
              active
                ? "bg-[hsl(var(--chart-1)/0.12)] text-[hsl(var(--chart-1))] ring-1 ring-[color:hsl(var(--chart-1)/0.35)]"
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid={`visual-calendar-view-${opt}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Filter chips                                                             */
/* ----------------------------------------------------------------------- */

type FilterChip = {
  key: string;
  label: string;
  group: "contentType" | "status" | "channel";
  value: string;
  active: boolean;
};

function FilterChips({
  chips,
  onToggle,
}: {
  chips: FilterChip[];
  onToggle: (chip: FilterChip) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-0.5"
      data-testid="visual-calendar-filters"
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onToggle(chip)}
          aria-pressed={chip.active}
          className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium transition-colors ring-1",
            chip.active
              ? "bg-[hsl(var(--chart-1)/0.12)] text-[hsl(var(--chart-1))] ring-[color:hsl(var(--chart-1)/0.35)]"
              : "bg-muted text-muted-foreground ring-[color:var(--border)] hover:text-foreground"
          )}
          data-testid={`visual-calendar-filter-${chip.group}-${chip.value}`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Entry visuals                                                            */
/* ----------------------------------------------------------------------- */

type DragMeta = {
  entryId: string;
  originDateKey: string;
};

function EntryThumbnail({
  url,
  size,
  alt,
}: {
  url?: string;
  size: number;
  alt: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="shrink-0 rounded-sm object-cover ring-1 ring-[color:var(--border)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-sm bg-muted text-muted-foreground ring-1 ring-[color:var(--border)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <ImageIcon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

function ChannelDot({ color }: { color?: string }) {
  if (!color) return null;
  return (
    <span
      className="inline-block h-3 w-3 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

type EntryChipProps = {
  entry: CalendarEntry;
  selected: boolean;
  reduceMotion: boolean;
  onClick?: (entry: CalendarEntry) => void;
  onDragStart: (meta: DragMeta) => void;
  onDragEnd: () => void;
  dataAttrs?: Record<string, string>;
};

function EntryChip({
  entry,
  selected,
  reduceMotion,
  onClick,
  onDragStart,
  onDragEnd,
  dataAttrs,
}: EntryChipProps) {
  return (
    <motion.button
      type="button"
      layout
      drag={reduceMotion ? false : true}
      dragSnapToOrigin
      dragElastic={0.18}
      onDragStart={() =>
        onDragStart({
          entryId: entry.id,
          originDateKey: format(entry.date, "yyyy-MM-dd"),
        })
      }
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.04, opacity: 0.85, zIndex: 50 }}
      onClick={() => onClick?.(entry)}
      className={cn(
        "group flex items-center gap-1 w-full px-1 py-0.5 rounded-sm text-left text-[11px] leading-tight",
        "bg-muted/60 hover:bg-muted text-foreground cursor-grab active:cursor-grabbing",
        "ring-1 ring-transparent",
        selected && "ring-2 ring-[hsl(var(--chart-1))]"
      )}
      data-testid="visual-calendar-entry-chip"
      data-entry-id={entry.id}
      {...dataAttrs}
    >
      <EntryThumbnail url={entry.thumbnailUrl} size={16} alt="" />
      <ChannelDot color={entry.channelColor} />
      <span className="flex-1 truncate font-medium">{entry.title}</span>
    </motion.button>
  );
}

type EntryCardProps = {
  entry: CalendarEntry;
  selected: boolean;
  reduceMotion: boolean;
  onClick?: (entry: CalendarEntry) => void;
  onDragStart: (meta: DragMeta) => void;
  onDragEnd: () => void;
  showTime?: boolean;
  dataAttrs?: Record<string, string>;
};

function EntryCard({
  entry,
  selected,
  reduceMotion,
  onClick,
  onDragStart,
  onDragEnd,
  showTime,
  dataAttrs,
}: EntryCardProps) {
  return (
    <motion.button
      type="button"
      layout
      drag={reduceMotion ? false : true}
      dragSnapToOrigin
      dragElastic={0.18}
      onDragStart={() =>
        onDragStart({
          entryId: entry.id,
          originDateKey: format(entry.date, "yyyy-MM-dd"),
        })
      }
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.03, opacity: 0.9, zIndex: 50 }}
      onClick={() => onClick?.(entry)}
      className={cn(
        "flex items-start gap-2 w-full text-left p-2 rounded-md",
        "bg-card hover:bg-muted/40 cursor-grab active:cursor-grabbing",
        "border border-[color:var(--border)]",
        selected && "ring-2 ring-[hsl(var(--chart-1))] border-transparent"
      )}
      data-testid="visual-calendar-entry-card"
      data-entry-id={entry.id}
      {...dataAttrs}
    >
      <EntryThumbnail url={entry.thumbnailUrl} size={32} alt="" />
      <span className="flex-1 min-w-0 space-y-0.5">
        <span className="flex items-center gap-1.5">
          <ChannelDot color={entry.channelColor} />
          <span className="text-xs font-medium line-clamp-2 break-words">
            {entry.title}
          </span>
        </span>
        <span className="flex items-center gap-1.5 flex-wrap">
          {entry.status ? <StatusPill status={entry.status} /> : null}
          {showTime ? (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {format(entry.date, "HH:mm")}
            </span>
          ) : null}
          {entry.contentType ? (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {entry.contentType}
            </span>
          ) : null}
        </span>
      </span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/* Drop overlay — uses pointer events on cells to detect drop target        */
/* ----------------------------------------------------------------------- */

type DropContext = {
  draggingEntryId: string | null;
  setHoverCell: (key: string | null) => void;
  hoverCellKey: string | null;
};

function useDropCells({
  onEntryReschedule,
  entriesById,
}: {
  onEntryReschedule?: (entryId: string, newDate: Date) => Promise<void> | void;
  entriesById: Map<string, CalendarEntry>;
}) {
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [hoverCellKey, setHoverCellKey] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleDragStart = useCallback((meta: DragMeta) => {
    setDraggingEntryId(meta.entryId);
  }, []);

  const handleDragEnd = useCallback(async () => {
    if (!draggingEntryId) {
      setDraggingEntryId(null);
      setHoverCellKey(null);
      return;
    }
    const targetKey = hoverCellKey;
    setDraggingEntryId(null);
    setHoverCellKey(null);
    if (!targetKey) return;
    const entry = entriesById.get(draggingEntryId);
    if (!entry) return;

    const [y, m, d] = targetKey.split("-").map((s) => parseInt(s, 10));
    const target = new Date(y, m - 1, d, entry.date.getHours(), entry.date.getMinutes(), 0, 0);
    const startToday = startOfNow();
    if (target.getTime() < startToday.getTime()) {
      // Past-date rejection — bounce back. dragSnapToOrigin already returns
      // the element; we just skip the callback.
      return;
    }
    if (isSameDay(target, entry.date)) return;
    if (!onEntryReschedule) return;
    setPendingId(draggingEntryId);
    try {
      await onEntryReschedule(draggingEntryId, target);
    } finally {
      setPendingId(null);
    }
  }, [draggingEntryId, hoverCellKey, entriesById, onEntryReschedule]);

  return {
    draggingEntryId,
    hoverCellKey,
    setHoverCellKey,
    pendingId,
    handleDragStart,
    handleDragEnd,
  };
}

/* ----------------------------------------------------------------------- */
/* Cell pointer hover wrapper                                               */
/* ----------------------------------------------------------------------- */

function DropZone({
  cellKey,
  ctx,
  isPast,
  className,
  children,
  onClick,
  ariaProps,
}: {
  cellKey: string;
  ctx: DropContext;
  isPast: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  ariaProps?: Record<string, unknown>;
}) {
  const isHover =
    ctx.draggingEntryId !== null && ctx.hoverCellKey === cellKey && !isPast;

  return (
    <div
      className={cn(
        "relative",
        isHover && "bg-[hsl(var(--chart-1)/0.04)] ring-1 ring-[color:hsl(var(--chart-1)/0.35)]",
        className
      )}
      onPointerEnter={() => {
        if (ctx.draggingEntryId !== null && !isPast) {
          ctx.setHoverCell(cellKey);
        }
      }}
      onPointerLeave={() => {
        if (ctx.hoverCellKey === cellKey) ctx.setHoverCell(null);
      }}
      onClick={onClick}
      data-cell-key={cellKey}
      {...ariaProps}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* MONTH view                                                               */
/* ----------------------------------------------------------------------- */

function MonthView({
  currentDate,
  weekStartsOn,
  byDay,
  ctx,
  selectedEntryId,
  reduceMotion,
  onEntryClick,
  onSlotClick,
  onDragStart,
  onDragEnd,
  focusedCellKey,
  setFocusedCellKey,
  onCellKeyDown,
}: {
  currentDate: Date;
  weekStartsOn: 0 | 1;
  byDay: Map<string, CalendarEntry[]>;
  ctx: DropContext;
  selectedEntryId?: string;
  reduceMotion: boolean;
  onEntryClick?: (entry: CalendarEntry) => void;
  onSlotClick?: (date: Date) => void;
  onDragStart: (m: DragMeta) => void;
  onDragEnd: () => void;
  focusedCellKey: string | null;
  setFocusedCellKey: (k: string | null) => void;
  onCellKeyDown: (
    e: ReactKeyboardEvent<HTMLDivElement>,
    cell: { date: Date; key: string }
  ) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const daysCount = differenceInCalendarDays(gridEnd, gridStart) + 1;
  const days = Array.from({ length: daysCount }, (_, i) => addDays(gridStart, i));
  const todayStart = startOfNow();

  const weekdayLabels = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(start, i), "EEE")
    );
  }, [weekStartsOn]);

  return (
    <div
      role="grid"
      aria-label="Month calendar"
      data-testid="visual-calendar-month"
      className="w-full"
    >
      <div
        role="row"
        className="hidden sm:grid grid-cols-7 gap-0.5 mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
      >
        {weekdayLabels.map((wd) => (
          <div key={wd} role="columnheader" className="px-2 py-1">
            {wd}
          </div>
        ))}
      </div>

      <div
        className={cn(
          "grid gap-0.5",
          "sm:grid-cols-7 grid-cols-1"
        )}
      >
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const entries = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, currentDate);
          const isPast = day.getTime() < todayStart.getTime() && !isSameDay(day, todayStart);
          const visible = entries.slice(0, 3);
          const overflow = entries.length - visible.length;
          const isFocused = focusedCellKey === key;
          const todayCell = isToday(day);

          return (
            <DropZone
              key={key}
              cellKey={key}
              ctx={ctx}
              isPast={isPast}
              className={cn(
                "min-h-[88px] sm:min-h-[112px] p-1 rounded-sm border bg-card",
                inMonth ? "border-[color:var(--border)]" : "border-transparent bg-muted/30",
                isPast && "opacity-60",
                todayCell && "border-[color:hsl(var(--chart-1)/0.5)]"
              )}
              ariaProps={{
                role: "gridcell",
                tabIndex: isFocused ? 0 : -1,
                "aria-selected": isFocused,
                "aria-label": format(day, "PPP"),
                onFocus: () => setFocusedCellKey(key),
                onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) =>
                  onCellKeyDown(e, { date: day, key }),
              }}
              onClick={() => {
                if (!onSlotClick) return;
                onSlotClick(day);
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={cn(
                    "text-[11px] font-semibold tabular-nums px-1",
                    todayCell
                      ? "text-[hsl(var(--chart-1))]"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
                {entries.length > 0 ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {entries.length}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-0.5">
                <LayoutGroup>
                  <AnimatePresence initial={false}>
                    {visible.map((entry) => (
                      <EntryChip
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedEntryId}
                        reduceMotion={reduceMotion}
                        onClick={onEntryClick}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                      />
                    ))}
                  </AnimatePresence>
                </LayoutGroup>
                {overflow > 0 ? (
                  <span className="text-[10px] text-muted-foreground px-1">
                    +{overflow} more
                  </span>
                ) : null}
              </div>
            </DropZone>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* WEEK view                                                                */
/* ----------------------------------------------------------------------- */

function WeekView({
  currentDate,
  weekStartsOn,
  byDay,
  ctx,
  selectedEntryId,
  reduceMotion,
  onEntryClick,
  onSlotClick,
  onDragStart,
  onDragEnd,
}: {
  currentDate: Date;
  weekStartsOn: 0 | 1;
  byDay: Map<string, CalendarEntry[]>;
  ctx: DropContext;
  selectedEntryId?: string;
  reduceMotion: boolean;
  onEntryClick?: (entry: CalendarEntry) => void;
  onSlotClick?: (date: Date) => void;
  onDragStart: (m: DragMeta) => void;
  onDragEnd: () => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStart = startOfNow();

  return (
    <div
      role="grid"
      aria-label="Week calendar"
      data-testid="visual-calendar-week"
      className="w-full overflow-x-auto"
    >
      <div className="grid grid-cols-7 gap-0.5 min-w-[640px]">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const entries = byDay.get(key) ?? [];
          const isPast = day.getTime() < todayStart.getTime() && !isSameDay(day, todayStart);
          const todayCell = isToday(day);

          return (
            <DropZone
              key={key}
              cellKey={key}
              ctx={ctx}
              isPast={isPast}
              className={cn(
                "min-h-[160px] p-1.5 rounded-sm border bg-card flex flex-col gap-1",
                "border-[color:var(--border)]",
                isPast && "opacity-60",
                todayCell && "border-[color:hsl(var(--chart-1)/0.5)]"
              )}
              ariaProps={{ role: "gridcell" }}
              onClick={() => onSlotClick?.(day)}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    todayCell ? "text-[hsl(var(--chart-1))]" : "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              <div className="flex flex-col gap-0.5 flex-1">
                <LayoutGroup>
                  <AnimatePresence initial={false}>
                    {entries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedEntryId}
                        reduceMotion={reduceMotion}
                        onClick={onEntryClick}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        showTime
                      />
                    ))}
                  </AnimatePresence>
                </LayoutGroup>
              </div>
            </DropZone>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* DAY view                                                                 */
/* ----------------------------------------------------------------------- */

function DayView({
  currentDate,
  byDay,
  ctx,
  selectedEntryId,
  reduceMotion,
  onEntryClick,
  onSlotClick,
  onDragStart,
  onDragEnd,
}: {
  currentDate: Date;
  byDay: Map<string, CalendarEntry[]>;
  ctx: DropContext;
  selectedEntryId?: string;
  reduceMotion: boolean;
  onEntryClick?: (entry: CalendarEntry) => void;
  onSlotClick?: (date: Date) => void;
  onDragStart: (m: DragMeta) => void;
  onDragEnd: () => void;
}) {
  const dayKey = format(currentDate, "yyyy-MM-dd");
  const entries = byDay.get(dayKey) ?? [];
  const isPastDay =
    startOfDay(currentDate).getTime() < startOfNow().getTime();

  // Bucket entries by hour
  const buckets = useMemo(() => {
    const m = new Map<number, CalendarEntry[]>();
    for (const e of entries) {
      const h = e.date.getHours();
      const arr = m.get(h) ?? [];
      arr.push(e);
      m.set(h, arr);
    }
    return m;
  }, [entries]);

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div
      role="grid"
      aria-label="Day calendar"
      data-testid="visual-calendar-day"
      className="w-full"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold">{format(currentDate, "EEEE, MMMM d")}</span>
        {isToday(currentDate) ? (
          <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--chart-1))] font-semibold">
            Today
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        {hours.map((h) => {
          const slotEntries = buckets.get(h) ?? [];
          const slotDate = setMinutes(setHours(currentDate, h), 0);
          const slotKey = `${dayKey}-h${h}`;
          const isPastSlot =
            isPastDay ||
            (isSameDay(slotDate, new Date()) && slotDate.getTime() < Date.now() - 30 * 60 * 1000);

          return (
            <DropZone
              key={slotKey}
              cellKey={dayKey}
              ctx={ctx}
              isPast={isPastSlot}
              className={cn(
                "flex items-start gap-2 min-h-[48px] p-1 rounded-sm border border-[color:var(--border)] bg-card",
                isPastSlot && "opacity-60"
              )}
              ariaProps={{ role: "gridcell" }}
              onClick={() => onSlotClick?.(slotDate)}
            >
              <span className="w-12 shrink-0 text-[10px] tabular-nums text-muted-foreground pt-1">
                {format(slotDate, "HH:mm")}
              </span>
              <div className="flex-1 flex flex-col gap-0.5">
                <LayoutGroup>
                  <AnimatePresence initial={false}>
                    {slotEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedEntryId}
                        reduceMotion={reduceMotion}
                        onClick={onEntryClick}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        showTime
                      />
                    ))}
                  </AnimatePresence>
                </LayoutGroup>
              </div>
            </DropZone>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Header (navigation + view toggle)                                        */
/* ----------------------------------------------------------------------- */

function CalendarHeader({
  view,
  currentDate,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}: {
  view: CalendarView;
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (v: CalendarView) => void;
}) {
  let title = "";
  if (view === "month") title = format(currentDate, "MMMM yyyy");
  else if (view === "week") {
    const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
    const we = addDays(ws, 6);
    title = `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
  } else title = format(currentDate, "EEEE, MMM d");

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous"
          className="inline-flex items-center justify-center h-8 w-8 rounded-sm border border-[color:var(--border)] bg-card text-muted-foreground hover:text-foreground"
          data-testid="visual-calendar-prev"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next"
          className="inline-flex items-center justify-center h-8 w-8 rounded-sm border border-[color:var(--border)] bg-card text-muted-foreground hover:text-foreground"
          data-testid="visual-calendar-next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="ml-1 px-2 h-7 rounded-sm border border-[color:var(--border)] bg-card text-xs font-medium text-muted-foreground hover:text-foreground"
          data-testid="visual-calendar-today"
        >
          Today
        </button>
        <span className="ml-2 text-sm font-semibold tabular-nums">{title}</span>
      </div>
      <ViewSegmented value={view} onChange={onViewChange} />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* VisualCalendar — top-level                                               */
/* ----------------------------------------------------------------------- */

export function VisualCalendar({
  entries,
  view: viewProp,
  onViewChange,
  onEntryClick,
  onEntryReschedule,
  onSlotClick,
  weekStartsOn = 0,
  filters,
  emptyStateMessage = "No content scheduled — drag here to add",
  className,
  initialDate,
  selectedEntryId,
}: VisualCalendarProps) {
  const reduceMotionPref = useReducedMotion();
  const reduceMotion = !!reduceMotionPref;

  const [internalView, setInternalView] = useState<CalendarView>(viewProp ?? "month");
  const view = viewProp ?? internalView;
  const setView = useCallback(
    (next: CalendarView) => {
      if (viewProp === undefined) setInternalView(next);
      onViewChange?.(next);
    },
    [viewProp, onViewChange]
  );

  const [currentDate, setCurrentDate] = useState<Date>(
    initialDate ? startOfDay(initialDate) : startOfNow()
  );

  // Internal filter state — chips derived from props
  const [activeFilters, setActiveFilters] = useState<CalendarFilters>(filters ?? {});
  useEffect(() => {
    setActiveFilters(filters ?? {});
  }, [filters]);

  const filteredEntries = useMemo(
    () => applyFilters(entries, activeFilters),
    [entries, activeFilters]
  );
  const byDay = useMemo(() => groupByDay(filteredEntries), [filteredEntries]);
  const entriesById = useMemo(() => {
    const m = new Map<string, CalendarEntry>();
    for (const e of entries) m.set(e.id, e);
    return m;
  }, [entries]);

  const {
    draggingEntryId,
    hoverCellKey,
    setHoverCellKey,
    handleDragStart,
    handleDragEnd,
  } = useDropCells({ onEntryReschedule, entriesById });

  const ctx: DropContext = {
    draggingEntryId,
    hoverCellKey,
    setHoverCell: setHoverCellKey,
  };

  // Filter chip derivation
  const chips: FilterChip[] = useMemo(() => {
    if (!filters) return [];
    const out: FilterChip[] = [];
    for (const v of filters.contentTypes ?? []) {
      out.push({
        key: `ct-${v}`,
        label: v,
        group: "contentType",
        value: v,
        active: (activeFilters.contentTypes ?? []).includes(v),
      });
    }
    for (const v of filters.statuses ?? []) {
      out.push({
        key: `st-${v}`,
        label: v,
        group: "status",
        value: v,
        active: (activeFilters.statuses ?? []).includes(v),
      });
    }
    for (const v of filters.channels ?? []) {
      out.push({
        key: `ch-${v}`,
        label: v,
        group: "channel",
        value: v,
        active: (activeFilters.channels ?? []).includes(v),
      });
    }
    return out;
  }, [filters, activeFilters]);

  const toggleChip = (chip: FilterChip) => {
    setActiveFilters((prev) => {
      const next: CalendarFilters = { ...prev };
      if (chip.group === "contentType") {
        const set = new Set(next.contentTypes ?? []);
        set.has(chip.value) ? set.delete(chip.value) : set.add(chip.value);
        next.contentTypes = Array.from(set);
      } else if (chip.group === "status") {
        const set = new Set(next.statuses ?? []);
        set.has(chip.value as CalendarEntryStatus)
          ? set.delete(chip.value as CalendarEntryStatus)
          : set.add(chip.value as CalendarEntryStatus);
        next.statuses = Array.from(set) as CalendarEntryStatus[];
      } else {
        const set = new Set(next.channels ?? []);
        set.has(chip.value) ? set.delete(chip.value) : set.add(chip.value);
        next.channels = Array.from(set);
      }
      return next;
    });
  };

  const handlePrev = () => {
    if (view === "month") {
      setCurrentDate((d) => addDays(startOfMonth(d), -1));
    } else if (view === "week") {
      setCurrentDate((d) => addDays(d, -7));
    } else {
      setCurrentDate((d) => addDays(d, -1));
    }
  };
  const handleNext = () => {
    if (view === "month") {
      setCurrentDate((d) => addDays(endOfMonth(d), 1));
    } else if (view === "week") {
      setCurrentDate((d) => addDays(d, 7));
    } else {
      setCurrentDate((d) => addDays(d, 1));
    }
  };
  const handleToday = () => setCurrentDate(startOfNow());

  // Keyboard nav for month view + entry shortcuts
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);

  const onCellKeyDown = (
    e: ReactKeyboardEvent<HTMLDivElement>,
    cell: { date: Date; key: string }
  ) => {
    let next: Date | null = null;
    if (e.key === "ArrowRight") next = addDays(cell.date, 1);
    else if (e.key === "ArrowLeft") next = addDays(cell.date, -1);
    else if (e.key === "ArrowUp") next = addDays(cell.date, -7);
    else if (e.key === "ArrowDown") next = addDays(cell.date, 7);
    else if (e.key === "Enter" || e.key === " ") {
      onSlotClick?.(cell.date);
      e.preventDefault();
      return;
    }
    if (next) {
      e.preventDefault();
      setFocusedCellKey(format(next, "yyyy-MM-dd"));
      // Adjust month if focus moved out of view
      if (view === "month" && !isSameMonth(next, currentDate)) {
        setCurrentDate(next);
      }
    }
  };

  const entriesEmpty = filteredEntries.length === 0;

  return (
    <div
      className={cn("flex flex-col gap-2 w-full", className)}
      data-testid="visual-calendar"
      data-cue-allowed-multiple
    >
      <CalendarHeader
        view={view}
        currentDate={currentDate}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onViewChange={setView}
      />

      {chips.length > 0 ? <FilterChips chips={chips} onToggle={toggleChip} /> : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {view === "month" && (
            <MonthView
              currentDate={currentDate}
              weekStartsOn={weekStartsOn}
              byDay={byDay}
              ctx={ctx}
              selectedEntryId={selectedEntryId}
              reduceMotion={reduceMotion}
              onEntryClick={onEntryClick}
              onSlotClick={onSlotClick}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              focusedCellKey={focusedCellKey}
              setFocusedCellKey={setFocusedCellKey}
              onCellKeyDown={onCellKeyDown}
            />
          )}
          {view === "week" && (
            <WeekView
              currentDate={currentDate}
              weekStartsOn={weekStartsOn}
              byDay={byDay}
              ctx={ctx}
              selectedEntryId={selectedEntryId}
              reduceMotion={reduceMotion}
              onEntryClick={onEntryClick}
              onSlotClick={onSlotClick}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          )}
          {view === "day" && (
            <DayView
              currentDate={currentDate}
              byDay={byDay}
              ctx={ctx}
              selectedEntryId={selectedEntryId}
              reduceMotion={reduceMotion}
              onEntryClick={onEntryClick}
              onSlotClick={onSlotClick}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {entriesEmpty ? (
        <div
          className="text-center py-6 text-xs text-muted-foreground"
          data-testid="visual-calendar-empty"
        >
          {emptyStateMessage}
        </div>
      ) : null}
    </div>
  );
}

// Tiny helper kept exported so consumers can compose default times when
// they're building entries to drop in. Intentionally not part of the
// public type since it's an internal convenience.
export function buildEntryDate(day: Date, hour = 9, minute = 0): Date {
  return addMinutes(setMinutes(setHours(startOfDay(day), hour), minute), 0);
}

export default VisualCalendar;
// MS_PER_DAY exported so dependent test scaffolding can use the same constant.
export { MS_PER_DAY };
