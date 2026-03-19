import type { Request, Response } from "express";
import express from "express";

const router = express.Router();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function safeJsonError(res: Response, code: number, message: string) {
  return res.status(code).json({ ok: false, error: message });
}

function normalizeUrl(input: string): string {
  let u = (input || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("172.") ||
      host.startsWith("192.168.") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      !host.includes(".")
    ) {
      return "";
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function fetchJson(url: string) {
  const r = await fetch(url);
  const text = await r.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!r.ok) {
    const msg =
      data?.error_message || data?.error?.message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

router.post("/search-places", async (req: Request, res: Response) => {
  try {
    const key = requireEnv("GOOGLE_MAPS_API_KEY");
    const query = String(req.body?.query || "").trim();
    if (query.length < 2) return safeJsonError(res, 400, "Query too short");

    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json?` +
      `query=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;

    const data = await fetchJson(url);

    const results = Array.isArray(data?.results) ? data.results : [];
    const predictions = results.slice(0, 8).map((r: any) => ({
      placeId: r.place_id,
      name: r.name,
      formattedAddress: r.formatted_address,
    }));

    return res.json({ ok: true, predictions });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "search-places failed");
  }
});

router.post("/place-details", async (req: Request, res: Response) => {
  try {
    const key = requireEnv("GOOGLE_MAPS_API_KEY");
    const placeId = String(req.body?.placeId || "").trim();
    if (!placeId) return safeJsonError(res, 400, "placeId required");

    const fields = [
      "place_id",
      "name",
      "formatted_address",
      "rating",
      "user_ratings_total",
      "website",
      "formatted_phone_number",
      "opening_hours/weekday_text",
      "photos/photo_reference",
    ].join(",");

    const url =
      `https://maps.googleapis.com/maps/api/place/details/json?` +
      `place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields)}` +
      `&key=${encodeURIComponent(key)}`;

    const data = await fetchJson(url);
    const result = data?.result;
    if (!result) return safeJsonError(res, 404, "Place not found");

    const photosRefs = Array.isArray(result?.photos) ? result.photos : [];
    const photos = photosRefs
      .slice(0, 10)
      .map((p: any) => p?.photo_reference)
      .filter(Boolean)
      .map(
        (ref: string) =>
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`
      );

    const payload = {
      placeId: result.place_id || placeId,
      name: result.name || "",
      formattedAddress: result.formatted_address || "",
      rating: typeof result.rating === "number" ? result.rating : null,
      reviewsCount:
        typeof result.user_ratings_total === "number"
          ? result.user_ratings_total
          : 0,
      website: result.website || "",
      phone: result.formatted_phone_number || "",
      hours: result?.opening_hours?.weekday_text || [],
      photos,
    };

    return res.json({ ok: true, business: payload });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "place-details failed");
  }
});

router.post("/pagespeed", async (req: Request, res: Response) => {
  try {
    const key = requireEnv("PAGESPEED_API_KEY");
    const urlRaw = String(req.body?.url || "");
    const url = normalizeUrl(urlRaw);
    if (!url) return safeJsonError(res, 400, "Invalid url");

    const run = async (strategy: "mobile" | "desktop") => {
      const endpoint =
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?` +
        `url=${encodeURIComponent(url)}` +
        `&strategy=${strategy}` +
        `&key=${encodeURIComponent(key)}`;

      const data = await fetchJson(endpoint);
      const lhr = data?.lighthouseResult;
      const score01 = lhr?.categories?.performance?.score;
      const score =
        typeof score01 === "number" ? Math.round(score01 * 100) : null;

      const audits = lhr?.audits || {};
      const numVal = (key: string) => {
        const v = audits[key]?.numericValue;
        return typeof v === "number" ? v : null;
      };

      return {
        score,
        fcp: numVal("first-contentful-paint") !== null ? +(numVal("first-contentful-paint")! / 1000).toFixed(2) : null,
        lcp: numVal("largest-contentful-paint") !== null ? +(numVal("largest-contentful-paint")! / 1000).toFixed(2) : null,
        tbt: numVal("total-blocking-time") !== null ? Math.round(numVal("total-blocking-time")!) : null,
        cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      };
    }

    const [mobile, desktop] = await Promise.all([
      run("mobile"),
      run("desktop"),
    ]);
    return res.json({ ok: true, speedData: { mobile, desktop } });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "pagespeed failed");
  }
});

router.post("/generate", async (req: Request, res: Response) => {
  try {
    const business = req.body?.business;
    const speedData = req.body?.speedData || null;

    if (!business || !business.name)
      return safeJsonError(res, 400, "business required");

    const rating =
      typeof business.rating === "number" ? business.rating : null;
    const reviewsCount =
      typeof business.reviewsCount === "number" ? business.reviewsCount : 0;
    const website = String(business.website || "");
    const photosLen = Array.isArray(business.photos)
      ? business.photos.length
      : 0;

    const mobileScore =
      typeof speedData?.mobile?.score === "number"
        ? speedData.mobile.score
        : null;
    const desktopScore =
      typeof speedData?.desktop?.score === "number"
        ? speedData.desktop.score
        : null;

    let localVisibility = 100;

    if (reviewsCount < 10) localVisibility -= 25;
    else if (reviewsCount < 25) localVisibility -= 15;
    else if (reviewsCount < 50) localVisibility -= 8;

    if (rating !== null) {
      if (rating < 3.5) localVisibility -= 20;
      else if (rating < 4.0) localVisibility -= 10;
    }

    if (photosLen === 0) localVisibility -= 12;
    else if (photosLen < 5) localVisibility -= 6;

    if (!website) localVisibility -= 15;

    localVisibility = clamp(localVisibility, 0, 100);

    const issues: Array<{
      title: string;
      severity: "High" | "Medium";
      impact: string;
      fix: string;
    }> = [];

    if (reviewsCount < 20) {
      issues.push({
        title: "Low review count",
        severity: "High",
        impact:
          "Fewer reviews reduces trust and hurts your visibility in Maps.",
        fix: "Ask recent happy customers for reviews and follow up with a simple link.",
      });
    }

    if (photosLen === 0) {
      issues.push({
        title: "No recent photos",
        severity: "Medium",
        impact: "Listings with photos get more clicks and calls.",
        fix: "Upload 10\u201315 high-quality photos (work, team, before/after, exterior).",
      });
    }

    if (mobileScore !== null && mobileScore < 50) {
      issues.push({
        title: "Slow mobile website",
        severity: "High",
        impact:
          "Mobile slowness reduces conversions and can impact search visibility.",
        fix: "Compress images, remove heavy scripts, and improve Core Web Vitals.",
      });
    }

    if (
      mobileScore !== null &&
      desktopScore !== null &&
      mobileScore + 5 < desktopScore
    ) {
      issues.push({
        title: "Mobile slower than desktop",
        severity: "Medium",
        impact:
          "Most customers browse on phones; slow mobile hurts bookings.",
        fix: "Optimize mobile-first: images, fonts, scripts, and layout shifts.",
      });
    }

    if (!website) {
      issues.push({
        title: "No website linked",
        severity: "High",
        impact:
          "A website link improves trust and increases conversions from Maps.",
        fix: "Add a simple 1-page site or link your existing site to the profile.",
      });
    }

    if (rating !== null && rating < 3.5) {
      issues.push({
        title: "Low average rating",
        severity: "High",
        impact: "Low ratings reduce click-through and ranking performance.",
        fix: "Reply to all reviews and address recurring complaints in operations.",
      });
    }

    const quickWins: string[] = [];
    if (reviewsCount < 25)
      quickWins.push(
        "Ask 10 happy customers for a review this week and share a direct review link."
      );
    if (photosLen < 5)
      quickWins.push(
        "Upload 10\u201315 fresh photos (work, team, before/after, exterior) to your profile."
      );
    if (!website)
      quickWins.push(
        "Add a simple 1-page website and link it in your Google Business Profile."
      );
    if (mobileScore !== null && mobileScore < 60)
      quickWins.push(
        "Compress images and remove heavy scripts to improve mobile speed."
      );
    if (rating !== null && rating < 4.0)
      quickWins.push(
        "Reply to every review (especially negatives) with a professional response and resolution."
      );

    const next7Days: string[] = [
      "Verify your business info: name, address, phone, hours, and service area.",
      "Upload fresh photos and add at least 1 post/update.",
      "Collect new reviews from recent customers and reply to all existing reviews.",
    ];
    if (!website)
      next7Days.push(
        "Publish a simple landing page and link it in your profile."
      );
    if (mobileScore !== null && mobileScore < 60)
      next7Days.push(
        "Fix mobile speed: compress images, lazy-load, remove unused scripts."
      );

    const next30Days: string[] = [
      "Build a repeatable review system (SMS/email follow-ups).",
      "Add service pages and FAQs targeting your local service keywords.",
      "Track calls, messages, and directions in your GBP insights and iterate weekly.",
    ];
    if (rating !== null && rating < 4.0)
      next30Days.push(
        "Resolve the root causes of negative reviews and follow up with customers."
      );

    const recommendedServices = [
      {
        name: "Google Maps Optimization",
        why: "Improves visibility and converts more calls from your listing.",
        cta: "Fix my Google Maps",
      },
      {
        name: "Website Speed & SEO",
        why: "Faster pages and better SEO increases leads from search.",
        cta: "Boost my website",
      },
      {
        name: "Review Management",
        why: "Consistent reviews grow trust and ranking over time.",
        cta: "Improve my reviews",
      },
    ];

    const report_json = {
      business: {
        name: business.name || "",
        address: business.formattedAddress || "",
        rating,
        reviewsCount,
        website,
        phone: business.phone || "",
      },
      scores: {
        localVisibility,
        websiteSpeedMobile: mobileScore,
        websiteSpeedDesktop: desktopScore,
      },
      issues,
      quickWins,
      actionPlan: { next7Days, next30Days },
      recommendedServices,
    };

    return res.json({ ok: true, report_json });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "generate failed");
  }
});

/* ─── Lead submission + optional email ─── */

router.post("/submit-lead", async (req: Request, res: Response) => {
  try {
    const { name, email, phone, wantsHelp, business, scores, reportJson } =
      req.body ?? {};

    const emailStr = String(email || "").trim().toLowerCase();
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      return safeJsonError(res, 400, "A valid email is required.");
    }

    const leadPayload = {
      name: String(name || "").trim() || null,
      email: emailStr,
      phone: String(phone || "").trim() || null,
      wantsHelp: !!wantsHelp,
      businessName: business?.name || null,
      placeId: business?.placeId || null,
      localVisibility: scores?.localVisibility ?? null,
      mobileSpeed: scores?.websiteSpeedMobile ?? null,
      desktopSpeed: scores?.websiteSpeedDesktop ?? null,
      issueCount:
        Array.isArray(reportJson?.issues) ? reportJson.issues.length : 0,
      submittedAt: new Date().toISOString(),
    };

    // Log the lead (primary capture mechanism without DB)
    console.log(
      `[AuditLead] ${leadPayload.email} | ${leadPayload.businessName} | visibility=${leadPayload.localVisibility} | wantsHelp=${leadPayload.wantsHelp}`
    );

    // Best-effort email delivery
    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || smtpUser;

      if (smtpHost && smtpUser && smtpPass) {
        const nodemailer = await import("nodemailer");
        const port = parseInt(process.env.SMTP_PORT || "587", 10);
        const transporter = nodemailer.default.createTransport({
          host: smtpHost,
          port,
          secure: port === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        const biz = business?.name || "your business";
        const vis = scores?.localVisibility ?? "--";
        const mob = scores?.websiteSpeedMobile ?? "--";
        const desk = scores?.websiteSpeedDesktop ?? "--";

        const issues: Array<{ title: string; severity: string; fix: string }> =
          Array.isArray(reportJson?.issues) ? reportJson.issues : [];
        const quickWins: string[] = Array.isArray(reportJson?.quickWins)
          ? reportJson.quickWins
          : [];

        const issueLines = issues
          .map(
            (i, idx) => `  ${idx + 1}. [${i.severity}] ${i.title}\n     → ${i.fix}`
          )
          .join("\n\n");

        const quickWinLines = quickWins
          .map((w, idx) => `  ${idx + 1}. ${w}`)
          .join("\n");

        const text = [
          `Hi${leadPayload.name ? ` ${leadPayload.name}` : ""},`,
          ``,
          `Here's your free audit report for ${biz}.`,
          ``,
          `── Scores ──`,
          `Local Visibility:  ${vis}/100`,
          `Mobile Speed:      ${mob !== "--" ? `${mob}/100` : "N/A"}`,
          `Desktop Speed:     ${desk !== "--" ? `${desk}/100` : "N/A"}`,
          ``,
          issues.length > 0
            ? `── Issues Found (${issues.length}) ──\n${issueLines}`
            : `── No Issues Found ──`,
          ``,
          quickWins.length > 0
            ? `── Quick Wins ──\n${quickWinLines}`
            : "",
          ``,
          `Want us to fix these for you? Reply to this email or visit:`,
          `https://wefixtrades.com/contact`,
          ``,
          `— WeFixTrades`,
        ]
          .filter(Boolean)
          .join("\n");

        await transporter.sendMail({
          from: smtpFrom,
          to: emailStr,
          subject: `Your Free Audit Report — ${biz}`,
          text,
        });
      }
    } catch (emailErr: any) {
      // Non-fatal: log but don't fail the request
      console.error("[AuditLead] Email send failed:", emailErr?.message);
    }

    return res.json({ ok: true });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "submit-lead failed");
  }
});

export default router;
