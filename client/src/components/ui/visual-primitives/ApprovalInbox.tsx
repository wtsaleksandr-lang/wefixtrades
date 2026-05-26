/**
 * ApprovalInbox — shared Gmail-style approval queue primitive.
 *
 * Wave 22C. Competitive research surfaced that NONE of 13 reviewed
 * platforms (Hootsuite / Buffer / Later / Sprout / Vista on social side;
 * Birdeye / Podium / NiceJob / GatherUp / BrightLocal on review side)
 * ships a true Gmail-style triage inbox for approvals. Wave 25
 * (SocialSync) and Wave 28 (ReputationShield) both need the human-
 * approval-before-posting loop — build it once.
 *
 * Layout: 2-pane (list rail + detail). Single-pane on mobile (< 768px).
 *
 * Per-item actions are configurable via the `actions` prop. When 2+
 * items are selected via shift-click / Cmd-click, `bulkActions` show
 * instead. Keyboard shortcuts:
 *   j / k       — next / previous item
 *   Enter       — focus detail pane
 *   Esc         — clear selection / close detail
 *   Ctrl/Cmd+a  — select all visible
 *   Single-letter shortcuts from actions[].shortcut
 *
 * DESIGN-SYSTEM compliance: semantic tokens only, 2px gaps in list rows,
 * no hover-transform, selected = 2px brand-blue outline (NOT fill).
 * Respects prefers-reduced-motion. Pure React + Framer Motion for the
 * arrive/depart animations.
 *
 * Parent owns data + persistence. No internal fetching, no folders, no
 * drag-drop reordering, no "compose new" button — those are app-level.
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
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ImageIcon,
  MessageSquare,
  Newspaper,
  Search,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill, type StatusPillStatus } from "./StatusPill";

export type InboxItemKind = "social_post" | "review_reply" | "article" | "image";

export type InboxItemStatus =
  | "unread"
  | "starred"
  | "replied"
  | "approved"
  | "archived";

export type InboxItemSentiment = "positive" | "neutral" | "negative";

export type InboxItem = {
  id: string;
  kind: InboxItemKind;
  createdAt: Date;
  status: InboxItemStatus;
  authorName?: string;
  authorAvatar?: string;
  title: string;
  preview: string;
  thumbnailUrl?: string;
  channelBadge?: string;
  channelColor?: string;
  rating?: number;
  sentiment?: InboxItemSentiment;
  metadata?: Record<string, unknown>;
};

export type InboxAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  variant?: "primary" | "secondary" | "ghost";
  handler: (item: InboxItem) => Promise<void> | void;
};

export type ApprovalInboxFilters = {
  statuses?: InboxItemStatus[];
  kinds?: InboxItemKind[];
  channels?: string[];
};

export type ApprovalInboxProps = {
  items: InboxItem[];
  selectedItemId?: string;
  onSelectItem?: (item: InboxItem) => void;
  actions: InboxAction[];
  bulkActions?: InboxAction[];
  filters?: ApprovalInboxFilters;
  onSearch?: (query: string) => void;
  loading?: boolean;
  emptyStateMessage?: string;
  className?: string;
};

const KIND_LABEL: Record<InboxItemKind, string> = {
  social_post: "Social post",
  review_reply: "Review reply",
  article: "Article",
  image: "Image",
};

const KIND_ICON: Record<InboxItemKind, ReactNode> = {
  social_post: <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />,
  review_reply: <Star className="h-3.5 w-3.5" aria-hidden="true" />,
  article: <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />,
  image: <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />,
};

const STATUS_TO_PILL: Record<InboxItemStatus, StatusPillStatus> = {
  unread: "draft",
  starred: "scheduled",
  replied: "in_progress",
  approved: "approved",
  archived: "draft",
};

function formatRelative(d: Date): string {
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString();
}

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function Avatar({ name, src }: { name?: string; src?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? "avatar"}
        className="h-8 w-8 rounded-full object-cover ring-1 ring-[color:var(--border)]"
      />
    );
  }
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-1 ring-[color:var(--border)]"
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating} of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i <= filled
              ? "fill-[hsl(var(--chart-4))] text-[hsl(var(--chart-4))]"
              : "text-muted-foreground/40"
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function SentimentDot({ sentiment }: { sentiment: InboxItemSentiment }) {
  const color =
    sentiment === "positive"
      ? "bg-[hsl(var(--chart-2))]"
      : sentiment === "negative"
      ? "bg-[hsl(var(--destructive))]"
      : "bg-muted-foreground";
  return (
    <span
      className={cn("inline-block h-3 w-3 rounded-full", color)}
      aria-label={`sentiment: ${sentiment}`}
    />
  );
}

function ChannelBadge({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      data-testid="channel-badge"
    >
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={color ? { background: color } : undefined}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function actionButtonVariant(v?: InboxAction["variant"]) {
  if (v === "primary") return "default" as const;
  if (v === "ghost") return "ghost" as const;
  return "outline" as const;
}

function matchesFilters(item: InboxItem, filters?: ApprovalInboxFilters) {
  if (!filters) return true;
  if (filters.statuses?.length && !filters.statuses.includes(item.status))
    return false;
  if (filters.kinds?.length && !filters.kinds.includes(item.kind)) return false;
  if (
    filters.channels?.length &&
    item.channelBadge &&
    !filters.channels.includes(item.channelBadge)
  )
    return false;
  return true;
}

export function ApprovalInbox({
  items,
  selectedItemId,
  onSelectItem,
  actions,
  bulkActions,
  filters,
  onSearch,
  loading,
  emptyStateMessage,
  className,
}: ApprovalInboxProps) {
  const reduceMotion = useReducedMotion();
  const [internalSelectedId, setInternalSelectedId] = useState<string | undefined>(
    selectedItemId
  );
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [searchValue, setSearchValue] = useState<string>("");
  const [activeFilters, setActiveFilters] = useState<ApprovalInboxFilters>(
    filters ?? {}
  );
  const [showDetailOnMobile, setShowDetailOnMobile] = useState<boolean>(false);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedItemId !== undefined) setInternalSelectedId(selectedItemId);
  }, [selectedItemId]);

  // Debounced search forwarder.
  useEffect(() => {
    if (!onSearch) return;
    const id = window.setTimeout(() => onSearch(searchValue), 200);
    return () => window.clearTimeout(id);
  }, [searchValue, onSearch]);

  const visibleItems = useMemo(() => {
    let next = items.filter((it) => matchesFilters(it, activeFilters));
    if (searchValue.trim() && !onSearch) {
      const q = searchValue.toLowerCase();
      next = next.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.preview.toLowerCase().includes(q) ||
          (it.authorName?.toLowerCase().includes(q) ?? false)
      );
    }
    return next;
  }, [items, activeFilters, searchValue, onSearch]);

  const selectedItem = useMemo(
    () => visibleItems.find((it) => it.id === internalSelectedId) ?? null,
    [visibleItems, internalSelectedId]
  );

  const handleSelect = useCallback(
    (item: InboxItem, opts?: { additive?: boolean; range?: boolean }) => {
      if (opts?.additive) {
        setMultiSelected((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
        return;
      }
      if (opts?.range && internalSelectedId) {
        const anchorIdx = visibleItems.findIndex(
          (i) => i.id === internalSelectedId
        );
        const targetIdx = visibleItems.findIndex((i) => i.id === item.id);
        if (anchorIdx >= 0 && targetIdx >= 0) {
          const [lo, hi] = [anchorIdx, targetIdx].sort((a, b) => a - b);
          const range = new Set(
            visibleItems.slice(lo, hi + 1).map((i) => i.id)
          );
          setMultiSelected(range);
          return;
        }
      }
      setMultiSelected(new Set());
      setInternalSelectedId(item.id);
      setShowDetailOnMobile(true);
      onSelectItem?.(item);
    },
    [internalSelectedId, visibleItems, onSelectItem]
  );

  // Keyboard navigation.
  const onListKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!visibleItems.length) return;
      const currentIdx = visibleItems.findIndex(
        (i) => i.id === internalSelectedId
      );

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = visibleItems[Math.min(visibleItems.length - 1, currentIdx + 1)];
        if (next) handleSelect(next);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = visibleItems[Math.max(0, currentIdx - 1)];
        if (prev) handleSelect(prev);
        return;
      }
      if (e.key === "Enter") {
        if (selectedItem) {
          e.preventDefault();
          detailRef.current?.focus();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInternalSelectedId(undefined);
        setMultiSelected(new Set());
        setShowDetailOnMobile(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setMultiSelected(new Set(visibleItems.map((i) => i.id)));
        return;
      }

      // Single-letter action shortcuts.
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.length === 1 &&
        /[a-z]/i.test(e.key)
      ) {
        const activeActions = multiSelected.size > 1 ? bulkActions ?? [] : actions;
        const match = activeActions.find(
          (a) => a.shortcut && a.shortcut.toLowerCase() === e.key.toLowerCase()
        );
        if (match) {
          if (multiSelected.size > 1) {
            visibleItems
              .filter((i) => multiSelected.has(i.id))
              .forEach((i) => match.handler(i));
          } else if (selectedItem) {
            match.handler(selectedItem);
          }
          e.preventDefault();
        }
      }
    },
    [
      visibleItems,
      internalSelectedId,
      selectedItem,
      handleSelect,
      multiSelected,
      bulkActions,
      actions,
    ]
  );

  const toggleStatusFilter = useCallback((s: InboxItemStatus) => {
    setActiveFilters((prev) => {
      const cur = prev.statuses ?? [];
      const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
      return { ...prev, statuses: next };
    });
  }, []);

  const toggleKindFilter = useCallback((k: InboxItemKind) => {
    setActiveFilters((prev) => {
      const cur = prev.kinds ?? [];
      const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      return { ...prev, kinds: next };
    });
  }, []);

  const bulkCount = multiSelected.size;
  const showingBulkBar = bulkCount > 1 && (bulkActions?.length ?? 0) > 0;

  return (
    <div
      className={cn(
        "flex h-[640px] w-full overflow-hidden rounded-lg border bg-card text-card-foreground",
        className
      )}
      data-testid="approval-inbox"
    >
      {/* LEFT RAIL ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex w-full flex-col border-r md:w-[360px]",
          showDetailOnMobile && "hidden md:flex"
        )}
      >
        {/* Search + filters */}
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search inbox..."
              className="pl-8"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              data-testid="inbox-search"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["unread", "starred", "approved"] as InboxItemStatus[]).map((s) => {
              const on = activeFilters.statuses?.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatusFilter(s)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                    on
                      ? "bg-[hsl(var(--chart-1)/0.12)] text-[hsl(var(--chart-1))] ring-[color:hsl(var(--chart-1)/0.4)]"
                      : "bg-muted text-muted-foreground ring-[color:var(--border)]"
                  )}
                  data-testid={`filter-status-${s}`}
                >
                  {s}
                </button>
              );
            })}
            {(["social_post", "review_reply", "article"] as InboxItemKind[]).map(
              (k) => {
                const on = activeFilters.kinds?.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKindFilter(k)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      on
                        ? "bg-[hsl(var(--chart-4)/0.12)] text-[hsl(var(--chart-4))] ring-[color:hsl(var(--chart-4)/0.4)]"
                        : "bg-muted text-muted-foreground ring-[color:var(--border)]"
                    )}
                    data-testid={`filter-kind-${k}`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {showingBulkBar ? (
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
            <span className="font-medium">{bulkCount} selected</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {bulkActions!.map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant={actionButtonVariant(a.variant)}
                  onClick={() =>
                    visibleItems
                      .filter((i) => multiSelected.has(i.id))
                      .forEach((i) => a.handler(i))
                  }
                  data-testid={`bulk-action-${a.id}`}
                >
                  {a.icon}
                  <span className={cn(a.icon && "ml-1")}>{a.label}</span>
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMultiSelected(new Set())}
                aria-label="clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* List */}
        <div
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label="Approval inbox"
          onKeyDown={onListKeyDown}
          className="flex-1 overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:hsl(var(--chart-1))]"
          data-testid="inbox-list"
        >
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded bg-muted/60"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <span className="text-3xl" aria-hidden="true">
                ✦
              </span>
              <p>{emptyStateMessage ?? "Nothing to approve right now."}</p>
            </div>
          ) : (
            <ul className="space-y-0.5 p-1">
              <AnimatePresence initial={false}>
                {visibleItems.map((item) => {
                  const isSelected = item.id === internalSelectedId;
                  const isMulti = multiSelected.has(item.id);
                  const unread = item.status === "unread";
                  return (
                    <motion.li
                      key={item.id}
                      layout={!reduceMotion}
                      initial={
                        reduceMotion ? false : { opacity: 0, y: -8 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={
                        reduceMotion
                          ? undefined
                          : { opacity: 0, height: 0, marginTop: 0 }
                      }
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <button
                        type="button"
                        onClick={(e) =>
                          handleSelect(item, {
                            additive: e.ctrlKey || e.metaKey,
                            range: e.shiftKey,
                          })
                        }
                        className={cn(
                          "group flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors",
                          "hover:bg-muted/60",
                          (isSelected || isMulti) &&
                            "bg-muted/40 ring-2 ring-inset ring-[color:hsl(var(--chart-1))]",
                          unread &&
                            !isSelected &&
                            !isMulti &&
                            "border-l-2 border-[hsl(var(--chart-1))] pl-1.5"
                        )}
                        style={{ minHeight: 64 }}
                        data-testid={`inbox-row-${item.id}`}
                        data-selected={isSelected ? "true" : undefined}
                      >
                        <Avatar
                          name={item.authorName}
                          src={item.authorAvatar}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-sm",
                                unread ? "font-semibold" : "font-medium"
                              )}
                            >
                              {item.authorName ?? KIND_LABEL[item.kind]}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {formatRelative(item.createdAt)}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.title}
                          </span>
                          <span className="mt-1 flex items-center gap-1.5">
                            {item.channelBadge ? (
                              <ChannelBadge
                                label={item.channelBadge}
                                color={item.channelColor}
                              />
                            ) : null}
                            <StatusPill
                              status={STATUS_TO_PILL[item.status]}
                              label={item.status}
                            />
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      {/* RIGHT PANE ────────────────────────────────────────────────────── */}
      <div
        ref={detailRef}
        tabIndex={-1}
        className={cn(
          "flex min-w-0 flex-1 flex-col focus:outline-none",
          !showDetailOnMobile && "hidden md:flex"
        )}
        data-testid="inbox-detail"
      >
        {selectedItem ? (
          <DetailPane
            item={selectedItem}
            actions={actions}
            onBack={() => setShowDetailOnMobile(false)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            Select an item to review.
          </div>
        )}
      </div>
    </div>
  );
}

function DetailPane({
  item,
  actions,
  onBack,
}: {
  item: InboxItem;
  actions: InboxAction[];
  onBack: () => void;
}) {
  const primary = actions.filter((a) => a.variant === "primary");
  const secondary = actions.filter((a) => a.variant !== "primary");
  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3 border-b p-4">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden -ml-1 mr-1 rounded p-1 hover:bg-muted"
          aria-label="back to list"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar name={item.authorName} src={item.authorAvatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-semibold">
              {item.authorName ?? KIND_LABEL[item.kind]}
            </h3>
            <span className="shrink-0 text-xs text-muted-foreground">
              {item.createdAt.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              {KIND_ICON[item.kind]}
              {KIND_LABEL[item.kind]}
            </span>
            {item.channelBadge ? (
              <ChannelBadge
                label={item.channelBadge}
                color={item.channelColor}
              />
            ) : null}
            <StatusPill
              status={STATUS_TO_PILL[item.status]}
              label={item.status}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h4 className="text-base font-semibold leading-snug">{item.title}</h4>

        {item.rating !== undefined || item.sentiment ? (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            {item.rating !== undefined ? <StarRating rating={item.rating} /> : null}
            {item.sentiment ? (
              <span className="inline-flex items-center gap-1.5">
                <SentimentDot sentiment={item.sentiment} />
                {item.sentiment}
              </span>
            ) : null}
          </div>
        ) : null}

        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="mt-3 max-h-80 w-full rounded-md object-cover ring-1 ring-[color:var(--border)]"
          />
        ) : null}

        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {item.preview}
        </p>
      </div>

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {secondary.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant={actionButtonVariant(a.variant)}
              onClick={() => a.handler(item)}
              data-testid={`detail-action-${a.id}`}
            >
              {a.icon}
              <span className={cn(a.icon && "ml-1")}>{a.label}</span>
              {a.shortcut ? (
                <kbd className="ml-1.5 hidden rounded bg-muted px-1 text-[10px] font-mono text-muted-foreground sm:inline">
                  {a.shortcut.toUpperCase()}
                </kbd>
              ) : null}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {primary.map((a) => (
            <Button
              key={a.id}
              size="sm"
              onClick={() => a.handler(item)}
              data-testid={`detail-action-${a.id}`}
            >
              {a.icon}
              <span className={cn(a.icon && "ml-1")}>{a.label}</span>
              {a.shortcut ? (
                <kbd className="ml-1.5 hidden rounded bg-background/40 px-1 text-[10px] font-mono sm:inline">
                  {a.shortcut.toUpperCase()}
                </kbd>
              ) : null}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}

export default ApprovalInbox;
