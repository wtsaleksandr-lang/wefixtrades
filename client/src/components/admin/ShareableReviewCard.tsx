/**
 * Shareable review image generator.
 * Renders a branded review card in a hidden DOM element,
 * then uses html2canvas to export as PNG.
 */

import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Image } from "lucide-react";

export type CardStyle = "light" | "dark" | "accent";

interface ReviewCardData {
  businessName: string;
  reviewerName: string;
  rating: number;
  text: string;
  platform: string;
}

/** Trim review text intelligently to fit a card. */
function trimText(text: string, maxLen = 180): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + "...";
}

/** Mask reviewer name: "John Smith" → "John S." */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "Customer";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function stars(rating: number): string {
  return "★".repeat(Math.min(rating, 5));
}

const STYLES: Record<CardStyle, { bg: string; text: string; accent: string; starColor: string; subtleText: string; border: string }> = {
  light: { bg: "#FFFFFF", text: "#1a1a2e", accent: "#0d3cfc", starColor: "#FBBF24", subtleText: "#9CA3AF", border: "1px solid #E5E7EB" },
  dark: { bg: "#1a1a2e", text: "#FFFFFF", accent: "#0d3cfc", starColor: "#FBBF24", subtleText: "rgba(255,255,255,0.5)", border: "none" },
  accent: { bg: "#0d3cfc", text: "#1a1a2e", accent: "#1a1a2e", starColor: "#1a1a2e", subtleText: "rgba(0,0,0,0.5)", border: "none" },
};

function ReviewCardTemplate({ data, style, size }: { data: ReviewCardData; style: CardStyle; size: "square" | "story" }) {
  const s = STYLES[style];
  const w = size === "square" ? 1080 : 1080;
  const h = size === "square" ? 1080 : 1920;
  const trimmed = trimText(data.text, size === "square" ? 180 : 280);

  return (
    <div style={{
      width: w, height: h, background: s.bg, border: s.border,
      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      padding: size === "square" ? 80 : 120,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      boxSizing: "border-box",
    }}>
      {/* Stars */}
      <div style={{ fontSize: size === "square" ? 48 : 56, color: s.starColor, letterSpacing: 6, marginBottom: 24 }}>
        {stars(data.rating)}
      </div>

      {/* Quote */}
      <div style={{
        fontSize: size === "square" ? 32 : 38, fontWeight: 500, color: s.text, lineHeight: 1.5,
        textAlign: "center", marginBottom: 32, maxWidth: size === "square" ? 880 : 840,
      }}>
        &ldquo;{trimmed}&rdquo;
      </div>

      {/* Reviewer */}
      <div style={{ fontSize: size === "square" ? 22 : 26, color: s.subtleText, marginBottom: 8 }}>
        — {maskName(data.reviewerName)}
      </div>

      {/* Platform */}
      <div style={{ fontSize: size === "square" ? 16 : 18, color: s.subtleText, textTransform: "capitalize", marginBottom: 40 }}>
        {data.platform} Review
      </div>

      {/* Divider */}
      <div style={{ width: 60, height: 3, background: s.accent, borderRadius: 2, marginBottom: 24 }} />

      {/* Business name */}
      <div style={{ fontSize: size === "square" ? 28 : 32, fontWeight: 700, color: s.text }}>
        {data.businessName}
      </div>
    </div>
  );
}

interface ShareableReviewCardProps {
  businessName: string;
  reviewerName: string;
  rating: number;
  text: string;
  platform: string;
  onClose?: () => void;
}

export default function ShareableReviewCard({ businessName, reviewerName, rating, text, platform, onClose }: ShareableReviewCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CardStyle>("light");
  const [size, setSize] = useState<"square" | "story">("square");
  const [generating, setGenerating] = useState(false);

  const data: ReviewCardData = { businessName, reviewerName, rating, text, platform };

  async function downloadImage() {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 1,
        useCORS: true,
        backgroundColor: null,
        width: size === "square" ? 1080 : 1080,
        height: size === "square" ? 1080 : 1920,
      });
      const link = document.createElement("a");
      link.download = `review-${(reviewerName || "customer").split(" ")[0].toLowerCase()}-${size}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Image generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }

  // Preview is scaled down to fit the dialog
  const previewScale = size === "square" ? 0.3 : 0.2;
  const previewW = (size === "square" ? 1080 : 1080) * previewScale;
  const previewH = (size === "square" ? 1080 : 1920) * previewScale;

  return (
    <div className="space-y-4">
      {/* Style + size controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["light", "dark", "accent"] as CardStyle[]).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                style === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {s === "light" ? "Light" : s === "dark" ? "Dark" : "Bold"}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["square", "story"] as const).map((sz) => (
            <button
              key={sz}
              onClick={() => setSize(sz)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                size === sz ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {sz === "square" ? "Square" : "Story"}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="flex justify-center bg-gray-100 rounded-lg p-4 overflow-hidden">
        <div style={{ width: previewW, height: previewH, overflow: "hidden", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left" }}>
            <div ref={cardRef}>
              <ReviewCardTemplate data={data} style={style} size={size} />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={downloadImage}
          disabled={generating}
          className="bg-[#0d3cfc] hover:bg-[#0b34d6]"
        >
          {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
          Download {size === "square" ? "1080×1080" : "1080×1920"} PNG
        </Button>
        {onClose && (
          <Button variant="outline" onClick={onClose}>Back</Button>
        )}
      </div>
    </div>
  );
}

/** Check if a review is suitable for sharing. */
export function isShareable(review: { rating: number; review_text: string | null; response_text?: string | null }): boolean {
  return review.rating >= 4 && !!review.review_text && review.review_text.length >= 20;
}
