import { mkt } from "@/theme/tokens";
import type { ProductCategory } from "@/config/products";

const CATEGORY_STYLES: Record<
  ProductCategory,
  { label: string; color: string; bg: string; border: string }
> = {
  core: {
    label: "Core Tool",
    color: mkt.accent,
    bg: mkt.accentTint,
    border: `1px solid ${mkt.accent}`,
  },
  ai: {
    label: "AI-Powered",
    color: mkt.orange,
    bg: mkt.orangeTint,
    border: `1px solid ${mkt.orange}`,
  },
  growth: {
    label: "Growth Service",
    color: mkt.cyan,
    bg: mkt.cyanTint,
    border: `1px solid ${mkt.cyan}`,
  },
};

interface ProductCategoryChipProps {
  category: ProductCategory;
  className?: string;
}

export default function ProductCategoryChip({
  category,
  className = "",
}: ProductCategoryChipProps) {
  const style = CATEGORY_STYLES[category];

  return (
    <span
      className={`hero-enter ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: style.bg,
        border: style.border,
        borderRadius: 20,
        padding: "5px 16px",
        fontSize: 12,
        fontWeight: 700,
        color: style.color,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {style.label}
    </span>
  );
}
