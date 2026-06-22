// Type declarations for the proven vanilla-JS roof-feature detector
// (rooffeatures.mjs is ported as-is from the standalone widget spike and is
// intentionally kept as an .mjs module — only its public API is typed here).

export interface RoofFeaturePoint {
  nx: number;
  ny: number;
}

export interface RoofFeaturesResult {
  roofType: string;
  chimneys: RoofFeaturePoint[];
  vents: RoofFeaturePoint[];
  skylights: RoofFeaturePoint[];
  dormers: RoofFeaturePoint[];
  counts: { chimneys: number; vents: number; skylights: number; dormers: number };
  ok: boolean;
  error?: string;
}

export function detectMimeType(buf: Buffer): "image/jpeg" | "image/png" | null;
export function parseFeatures(rawText: string): RoofFeaturesResult;
export function detectRoofFeatures(
  imageBuffer: Buffer,
  geminiApiKey: string,
  opts?: { timeoutMs?: number },
): Promise<RoofFeaturesResult>;
