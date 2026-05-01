import type { Express, Request, Response } from "express";
import { chat } from "../services/aiService";
import { createLogger } from "../lib/logger";

const log = createLogger("DemoRoutes");

/* ─── Rate limiting ─── */
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_MAX_SOCIALSYNC = 10;
const RATE_MAX_RANKFLOW = 5;

function checkRate(ip: string, max: number): boolean {
  const now = Date.now();
  let rl = rateMap.get(ip);
  if (!rl || now > rl.resetAt) {
    rl = { count: 0, resetAt: now + RATE_WINDOW };
    rateMap.set(ip, rl);
  }
  rl.count++;
  return rl.count <= max;
}

/* ─── URL normalizer ─── */
function normalizeUrl(input: string): string {
  let u = (input || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

export function registerDemoRoutes(app: Express): void {
  /* ──────────────────────────────────────────────
   * POST /api/demos/socialsync/generate
   * Generate 5 sample social media posts via Claude
   * ────────────────────────────────────────────── */
  app.post("/api/demos/socialsync/generate", async (req: Request, res: Response) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRate(ip, RATE_MAX_SOCIALSYNC)) {
        return res.status(429).json({ error: "Too many requests. Please try again later." });
      }

      const { trade_type, city, business_name } = req.body;
      if (!trade_type || !city) {
        return res.status(400).json({ error: "trade_type and city are required" });
      }

      const bizName = business_name || `${city} ${trade_type}`;

      const systemPrompt = `You are a social media content expert for trades businesses. Generate engaging, authentic social media posts that feel like a real small business owner would post them. Use a friendly, professional tone. Include relevant emojis and hashtags. Each post should be 150-280 characters (not counting hashtags). Make them varied — tips, project showcases, seasonal advice, customer appreciation, and community engagement.`;

      const userPrompt = `Generate exactly 5 social media posts for a ${trade_type} business called "${bizName}" in ${city}.

Return ONLY valid JSON, no other text. Use this exact format:
[
  {"platform":"facebook","content":"Post text here","hashtags":["tag1","tag2","tag3"]},
  {"platform":"facebook","content":"Post text here","hashtags":["tag1","tag2","tag3"]},
  {"platform":"instagram","content":"Post text here","hashtags":["tag1","tag2","tag3","tag4"]},
  {"platform":"instagram","content":"Post text here","hashtags":["tag1","tag2","tag3","tag4"]},
  {"platform":"google_business","content":"Post text here","hashtags":["tag1","tag2"]}
]

Requirements:
- Posts 1-2: Facebook posts (conversational, community-focused)
- Posts 3-4: Instagram posts (visual-focused, more hashtags)
- Post 5: Google Business Profile update (professional, service-focused)
- Make posts specific to ${trade_type} work in the ${city} area
- Include seasonal or local references when possible
- Each post should have a different angle/topic`;

      const raw = await chat({
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1200,
      });

      // Parse JSON from response — handle potential markdown wrapping
      let posts;
      try {
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("No JSON array found");
        posts = JSON.parse(jsonMatch[0]);
      } catch (parseErr: any) {
        log.error("[socialsync-demo] JSON parse error", { raw: raw.substring(0, 200) });
        return res.status(500).json({ error: "Failed to generate posts. Please try again." });
      }

      // Validate structure
      if (!Array.isArray(posts) || posts.length < 3) {
        return res.status(500).json({ error: "Incomplete response. Please try again." });
      }

      const validated = posts.slice(0, 5).map((p: any) => ({
        platform: String(p.platform || "facebook"),
        content: String(p.content || ""),
        hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(String) : [],
      }));

      log.info("[socialsync-demo] Generated posts", { trade_type, city, count: validated.length });
      return res.json({ posts: validated });
    } catch (err: any) {
      log.error("[socialsync-demo] error:", err?.message);
      return res.status(500).json({ error: "Failed to generate posts. Please try again." });
    }
  });

  /* ──────────────────────────────────────────────
   * POST /api/demos/rankflow/analyze
   * Run PageSpeed + Claude SEO analysis
   * ────────────────────────────────────────────── */
  app.post("/api/demos/rankflow/analyze", async (req: Request, res: Response) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRate(ip, RATE_MAX_RANKFLOW)) {
        return res.status(429).json({ error: "Too many requests. Try again in an hour." });
      }

      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const normalized = normalizeUrl(url);
      if (!normalized) {
        return res.status(400).json({ error: "Invalid URL" });
      }

      // Run PageSpeed API
      const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
      let mobileData: any = null;
      let desktopData: any = null;

      if (key) {
        const runPageSpeed = async (strategy: "mobile" | "desktop") => {
          try {
            const params = new URLSearchParams({
              url: normalized,
              strategy,
              key,
              category: "performance",
            });
            const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            const resp = await fetch(endpoint, { signal: controller.signal });
            clearTimeout(timeout);
            if (!resp.ok) return null;
            const data = await resp.json();
            const lhr = data?.lighthouseResult;
            const score01 = lhr?.categories?.performance?.score;
            if (score01 == null) return null;
            const audits = lhr?.audits || {};
            const numVal = (k: string) => {
              const v = audits[k]?.numericValue;
              return typeof v === "number" ? v : null;
            };
            return {
              score: Math.round(score01 * 100),
              fcp: numVal("first-contentful-paint") !== null ? +(numVal("first-contentful-paint")! / 1000).toFixed(2) : null,
              lcp: numVal("largest-contentful-paint") !== null ? +(numVal("largest-contentful-paint")! / 1000).toFixed(2) : null,
              tbt: numVal("total-blocking-time") !== null ? Math.round(numVal("total-blocking-time")!) : null,
              cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
            };
          } catch {
            return null;
          }
        };

        const [mResult, dResult] = await Promise.allSettled([
          runPageSpeed("mobile"),
          runPageSpeed("desktop"),
        ]);
        mobileData = mResult.status === "fulfilled" ? mResult.value : null;
        desktopData = dResult.status === "fulfilled" ? dResult.value : null;
      }

      // Compute overall scores
      const mobileScore = mobileData?.score ?? null;
      const desktopScore = desktopData?.score ?? null;
      const speedScore = desktopScore ?? mobileScore ?? null;

      // Derive letter grade
      function toGrade(score: number | null): string {
        if (score == null) return "?";
        if (score >= 90) return "A";
        if (score >= 75) return "B";
        if (score >= 50) return "C";
        if (score >= 30) return "D";
        return "F";
      }

      // Generate Claude SEO analysis
      const scoreContext = speedScore !== null
        ? `PageSpeed desktop score: ${desktopScore}/100, mobile score: ${mobileScore}/100. FCP: ${mobileData?.fcp ?? "?"}s, LCP: ${mobileData?.lcp ?? "?"}s, TBT: ${mobileData?.tbt ?? "?"}ms, CLS: ${mobileData?.cls ?? "?"}.`
        : `PageSpeed data was not available for this URL.`;

      const seoPrompt = `You are an SEO expert for local trades businesses. Analyze this website and provide actionable recommendations.

Website: ${normalized}
${scoreContext}

Return ONLY valid JSON in this exact format:
{
  "issues": [
    {"title":"Issue title","severity":"high","description":"Brief description of the issue"},
    {"title":"Issue title","severity":"medium","description":"Brief description"},
    {"title":"Issue title","severity":"low","description":"Brief description"}
  ],
  "recommendations": [
    {"title":"Recommendation","impact":"high","description":"What to do and why it matters"},
    {"title":"Recommendation","impact":"medium","description":"What to do and why"},
    {"title":"Recommendation","impact":"medium","description":"What to do and why"},
    {"title":"Recommendation","impact":"low","description":"What to do and why"}
  ]
}

Provide exactly 3 issues (ordered high to low severity) and exactly 4 recommendations (ordered high to low impact). Focus on local SEO, page speed, mobile experience, and content structure. Be specific to the URL provided.`;

      let issues: any[] = [];
      let recommendations: any[] = [];

      try {
        const raw = await chat({
          system: "You are an SEO expert. Return only valid JSON.",
          messages: [{ role: "user", content: seoPrompt }],
          maxTokens: 1000,
        });
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 3) : [];
          recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 4) : [];
        }
      } catch (parseErr: any) {
        log.error("[rankflow-demo] Claude parse error", { error: parseErr?.message });
      }

      // Fallback issues if Claude didn't produce any
      if (issues.length === 0) {
        issues = [
          { title: "Page speed needs improvement", severity: "high", description: "Slow load times hurt rankings and user experience." },
          { title: "Mobile optimization gaps", severity: "medium", description: "Mobile-first indexing means your mobile experience matters most." },
          { title: "Missing meta descriptions", severity: "low", description: "Meta descriptions improve click-through rates from search results." },
        ];
      }

      const overallGrade = toGrade(speedScore);

      log.info("[rankflow-demo] Analysis complete", { url: normalized, overallGrade, speedScore });

      return res.json({
        score: overallGrade,
        speedScore: speedScore,
        mobileScore: mobileScore,
        desktopScore: desktopScore,
        mobile: mobileData,
        desktop: desktopData,
        issues,
        recommendations,
      });
    } catch (err: any) {
      log.error("[rankflow-demo] error:", err?.message);
      return res.status(500).json({ error: "Analysis failed. Please try again." });
    }
  });
}
