/**
 * VoicePreviewButton — small reusable Play/Stop control that streams a
 * cached TTS sample for a TradeLine voice or template and plays it
 * inline using a single `<audio>` element.
 *
 * Usage:
 *   <VoicePreviewButton url="/api/admin/tradeline/voices/sarah_warm/sample" />
 *   <VoicePreviewButton
 *     url="/api/admin/tradeline/templates/tradeline/plumber/voice-sample"
 *     label="Hear voice"
 *   />
 *
 * Behavior:
 *   - Click "Play" → fetch the URL with credentials, blob it, and play.
 *   - Click again while playing → pause + reset to Play.
 *   - On a 503 (preview_unavailable) → toast "Voice preview unavailable".
 *   - On audio end → flip back to Play.
 *
 * No new audio HTML element is rendered per button — we keep a hidden
 * `<audio>` ref scoped to this component, and only one preview can play
 * at a time per button instance. Page-wide singleton coordination (stop
 * one when another starts) is left to the parent if needed.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VoicePreviewButtonProps {
  /** API endpoint that streams audio/mpeg (with credentials). */
  url: string;
  /** Visible label next to the icon. Defaults to "Hear voice". */
  label?: string;
  /** Optional className override for layout/sizing. */
  className?: string;
  /** Optional data-testid for E2E selectors. */
  testId?: string;
  /** Tooltip / aria-label override. */
  title?: string;
  /** Render as compact icon-only button (no label). */
  iconOnly?: boolean;
  /** Button variant — defaults to outline so it stays subtle. */
  variant?: React.ComponentProps<typeof Button>["variant"];
  /** Button size — defaults to "sm". */
  size?: React.ComponentProps<typeof Button>["size"];
}

export default function VoicePreviewButton({
  url,
  label = "Hear voice",
  className,
  testId,
  title,
  iconOnly = false,
  variant = "outline",
  size = "sm",
}: VoicePreviewButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Tear down any blob URL + audio on unmount so we don't leak object URLs.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  async function handleClick() {
    // Toggle off if already playing.
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        // 503 preview_unavailable / 429 rate_limited / 404 template_not_found
        let body: { error?: string } = {};
        try {
          body = await res.json();
        } catch {
          /* non-JSON */
        }
        const msg =
          body?.error === "rate_limited"
            ? "Too many previews — wait a moment and try again"
            : "Voice preview unavailable";
        toast({ title: msg, variant: "destructive" });
        setLoading(false);
        return;
      }
      const blob = await res.blob();
      // Replace any previous blob URL with the new one.
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = URL.createObjectURL(blob);
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener("ended", () => setPlaying(false));
        audioRef.current.addEventListener("pause", () => {
          // Browsers fire `pause` on natural end too; treat both the same.
          if (audioRef.current && audioRef.current.ended) setPlaying(false);
        });
      }
      audioRef.current.src = blobUrlRef.current;
      await audioRef.current.play();
      setPlaying(true);
    } catch (err) {
      toast({ title: "Voice preview unavailable", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const Icon = loading ? Loader2 : playing ? Pause : Play;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn(className)}
      data-testid={testId ?? "button-voice-preview"}
      title={title ?? (playing ? "Stop preview" : "Hear voice")}
      aria-label={title ?? (playing ? "Stop preview" : "Hear voice")}
      disabled={loading}
    >
      <Icon
        className={cn(
          "h-4 w-4",
          loading && "animate-spin",
          !iconOnly && "mr-1.5",
        )}
      />
      {!iconOnly && (
        <span>
          {loading ? "Loading…" : playing ? "Stop" : label}
        </span>
      )}
    </Button>
  );
}
