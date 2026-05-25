/**
 * Full Audit Master — shared Zod schema + TypeScript types for the
 * 5-section MasterAuditReport.
 *
 * Wave 3.6 (2026-05-25). The shape is intentionally narrow: every section
 * returns the same `SectionResult` envelope so the renderer / email
 * template / API consumer can iterate uniformly without per-section
 * branching. Section-specific raw data lives in `rawData` for future
 * deep-link "view details" affordances.
 */
import { z } from "zod";

export const SectionFindingSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  description: z.string(),
  suggestedFix: z.string().optional(),
});
export type SectionFinding = z.infer<typeof SectionFindingSchema>;

export const SectionResultSchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["pass", "warning", "fail"]),
  summary: z.string(),
  findings: z.array(SectionFindingSchema),
  rawData: z.record(z.unknown()).optional(),
});
export type SectionResult = z.infer<typeof SectionResultSchema>;

export const MasterAuditReportSchema = z.object({
  orderId: z.string(),
  websiteUrl: z.string().url(),
  businessName: z.string(),
  generatedAt: z.string().datetime(),
  overallScore: z.number().min(0).max(100),
  sections: z.object({
    speed: SectionResultSchema.optional(),
    mobile: SectionResultSchema.optional(),
    seo: SectionResultSchema.optional(),
    accessibility: SectionResultSchema.optional(),
    security: SectionResultSchema.optional(),
    gbp: SectionResultSchema.optional(),
    competitors: SectionResultSchema.optional(),
    reviews: SectionResultSchema.optional(),
  }),
});
export type MasterAuditReport = z.infer<typeof MasterAuditReportSchema>;

/** Section keys we render in order in both the email + share page. */
export const SECTION_ORDER: Array<keyof MasterAuditReport["sections"]> = [
  "speed",
  "mobile",
  "seo",
  "accessibility",
  "security",
  "gbp",
  "competitors",
  "reviews",
];

export const SECTION_LABELS: Record<keyof MasterAuditReport["sections"], string> = {
  speed: "Desktop speed",
  mobile: "Mobile speed",
  seo: "SEO health",
  accessibility: "Accessibility (WCAG 2.1)",
  security: "Security & headers",
  gbp: "Google Business Profile",
  competitors: "Local competitors",
  reviews: "Review health",
};
