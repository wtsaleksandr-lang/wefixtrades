/**
 * SerpAwareGenerator brain (Wave 21) — barrel.
 *
 * Public surface used by `apiDispatchArticle.ts` and any future admin
 * surface to read briefs / scores / topical maps.
 */

export { buildBrief } from "./briefBuilder";
export type { SerpBrief, SerpBriefResult, SerpBriefTerm } from "./briefBuilder";

export { scoreContent } from "./scorer";
export type { ContentScore, ContentScoreBreakdown } from "./scorer";

export { autoOptimize, parseRewriteOutput } from "./autoOptimizer";
export type { AutoOptimizeResult } from "./autoOptimizer";

export { buildTopicalMap, parseClustersOutput } from "./topicalMap";
export type { TopicalCluster } from "./topicalMap";
