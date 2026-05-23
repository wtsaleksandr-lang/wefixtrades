/**
 * Invoice template dispatcher — slug → PDFKit renderer.
 *
 * Adding a Phase-B template = drop a new file + register one entry below.
 */

import { renderPdf as renderClassicMinimal } from "./ClassicMinimal";
import { renderPdf as renderModernBold } from "./ModernBold";
import { renderPdf as renderTradeService } from "./TradeService";
import type { InvoicePdfData } from "./base";

export type InvoiceTemplateSlug = "classic-minimal" | "modern-bold" | "trade-service";

export const BUILTIN_TEMPLATE_SLUGS: InvoiceTemplateSlug[] = [
  "classic-minimal",
  "modern-bold",
  "trade-service",
];

const RENDERERS: Record<InvoiceTemplateSlug, (d: InvoicePdfData) => Promise<Buffer>> = {
  "classic-minimal": renderClassicMinimal,
  "modern-bold": renderModernBold,
  "trade-service": renderTradeService,
};

export function isBuiltinSlug(slug: string | null | undefined): slug is InvoiceTemplateSlug {
  return !!slug && BUILTIN_TEMPLATE_SLUGS.includes(slug as InvoiceTemplateSlug);
}

/**
 * Render the invoice PDF using the requested template slug. Falls back to
 * Classic Minimal if the slug is unknown — we never throw on an unknown
 * template because that would block invoice send.
 */
export async function renderInvoicePdf(
  slug: string | null | undefined,
  data: InvoicePdfData,
): Promise<Buffer> {
  const renderer = isBuiltinSlug(slug) ? RENDERERS[slug] : RENDERERS["classic-minimal"];
  return renderer(data);
}

export type { InvoicePdfData } from "./base";
