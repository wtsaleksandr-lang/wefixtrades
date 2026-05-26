/**
 * Wave 25 — SocialSync channel picker.
 *
 * Per competitive research only Hootsuite supports WhatsApp publishing
 * (gated to upper tiers). To turn WhatsApp into a structural moat for
 * trades businesses, we render WhatsApp as an EQUAL tile alongside
 * Facebook / Instagram / LinkedIn — same size, same prominence, no
 * "Other" or "Coming soon" bucket.
 *
 * Each tile shows:
 *   - platform dot + label
 *   - connected/disconnected status pill
 *   - hint tooltip (WhatsApp gets the moat tooltip)
 *
 * Used inside the new-post composer (top of body) + connection settings.
 */

import { Check, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORMS, type SocialPlatformId } from "./platforms";

export interface ChannelPickerProps {
  /** Set of platform ids the user has connected. */
  connected: Set<SocialPlatformId>;
  /** Set of platform ids the user has selected for the current draft. */
  selected: Set<SocialPlatformId>;
  onToggle: (id: SocialPlatformId) => void;
  className?: string;
}

export function ChannelPicker({
  connected,
  selected,
  onToggle,
  className,
}: ChannelPickerProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 md:grid-cols-4",
        className,
      )}
      data-testid="channel-picker"
      role="group"
      aria-label="Channels"
    >
      {PLATFORMS.map((p) => {
        const isConnected = connected.has(p.id);
        const isSelected = selected.has(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            disabled={!isConnected}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors",
              isSelected
                ? "ring-2 ring-inset ring-[color:hsl(var(--chart-1))]"
                : "ring-1 ring-[color:var(--border)]",
              !isConnected && "opacity-60",
            )}
            data-testid={`channel-tile-${p.id}`}
            data-connected={isConnected ? "true" : "false"}
            data-selected={isSelected ? "true" : "false"}
            title={p.moatTooltip}
            aria-pressed={isSelected}
          >
            <div className="flex w-full items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: p.color }}
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-semibold text-foreground">
                {p.label}
              </span>
              {isSelected ? (
                <Check
                  className="h-4 w-4 text-[hsl(var(--chart-1))]"
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                isConnected
                  ? "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] ring-[hsl(var(--chart-2)/0.4)]"
                  : "bg-muted text-muted-foreground ring-[color:var(--border)]",
              )}
            >
              {isConnected ? (
                <>
                  <Check className="h-3 w-3" /> Connected
                </>
              ) : (
                <>
                  <Plug className="h-3 w-3" /> Connect
                </>
              )}
            </span>
            {p.moatTooltip ? (
              <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                {p.moatTooltip}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default ChannelPicker;
