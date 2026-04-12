/**
 * Public widget routes — serves review widget data and embed script.
 * No authentication required. Access controlled via widget_token.
 *
 * Endpoints:
 *   GET /api/widget/:token/data  — JSON review data for the widget
 *   GET /widget/embed.js         — standalone embed script
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { mergeWidgetSettings } from "@shared/reputationConfig";

/* ─── In-memory cache for widget data (5 minute TTL) ─── */
const widgetCache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedData(key: string): any | null {
  const entry = widgetCache.get(key);
  if (!entry || Date.now() > entry.expires) {
    widgetCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedData(key: string, data: any): void {
  widgetCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  // Evict old entries periodically
  if (widgetCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of widgetCache) {
      if (now > v.expires) widgetCache.delete(k);
    }
  }
}

export function registerWidgetRoutes(app: Express): void {

  /**
   * GET /api/widget/:token/data
   * Returns public-safe review data for the widget.
   * Cached for 5 minutes. CORS enabled for any origin.
   */
  app.get("/api/widget/:token/data", async (req: Request, res: Response) => {
    // CORS: allow embedding from any site
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Cache-Control", "public, max-age=300");

    try {
      const token = req.params.token;
      if (!token || token.length < 16) {
        return res.status(400).json({ error: "Invalid token" });
      }

      // Check cache first
      const cached = getCachedData(token);
      if (cached) return res.json(cached);

      // Look up client
      const client = await storage.getClientByWidgetToken(token);
      if (!client) {
        return res.status(404).json({ error: "Widget not found" });
      }

      // Load widget settings from service metadata
      const svc = await storage.getClientReputationService(client.id);
      const settings = svc?.metadata?.reputation_settings?.widget;
      const ws = mergeWidgetSettings(settings);

      if (!ws.enabled) {
        return res.status(403).json({ error: "Widget disabled" });
      }

      // Fetch reviews
      const reviews = await storage.getWidgetReviews(client.id, ws.min_rating, ws.max_reviews);

      // Compute average rating across ALL reviews (not just filtered)
      const allReviews = await storage.getWidgetReviews(client.id, 1, 1000);
      const totalCount = allReviews.length;
      const avgRating = totalCount > 0
        ? Math.round((allReviews.reduce((sum, r) => sum + r.rating, 0) / totalCount) * 10) / 10
        : 0;

      const data = {
        businessName: client.business_name,
        averageRating: avgRating,
        totalReviews: totalCount,
        settings: {
          type: ws.type,
          showReviewerName: ws.show_reviewer_name,
          showDate: ws.show_date,
        },
        reviews: reviews.map((r) => ({
          reviewerName: ws.show_reviewer_name ? r.reviewer_name : null,
          rating: r.rating,
          text: r.review_text ? r.review_text.slice(0, 500) : null,
          date: ws.show_date && r.published_at ? r.published_at : null,
          platform: r.platform,
        })),
      };

      setCachedData(token, data);
      res.json(data);
    } catch (err: any) {
      console.error("[widget] data error:", err.message);
      res.status(500).json({ error: "Failed to load widget data" });
    }
  });

  /**
   * GET /widget/embed.js
   * Serves the standalone widget embed script.
   * This is a self-contained JS file that renders the widget on third-party sites.
   */
  app.get("/widget/embed.js", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(EMBED_SCRIPT);
  });
}

/* ─── Embed Script (self-contained, no React) ─── */
const EMBED_SCRIPT = `
(function() {
  "use strict";

  var WIDGET_VERSION = "1.0";
  var API_BASE = (document.currentScript && document.currentScript.src)
    ? new URL(document.currentScript.src).origin
    : "";

  // Find all widget mount points
  var scripts = document.querySelectorAll("script[data-wft-widget]");
  for (var i = 0; i < scripts.length; i++) {
    initWidget(scripts[i]);
  }

  function initWidget(scriptEl) {
    var token = scriptEl.getAttribute("data-wft-token");
    var type = scriptEl.getAttribute("data-wft-widget") || "carousel";
    if (!token) return;

    // Create container
    var container = document.createElement("div");
    container.className = "wft-widget wft-widget-" + type;
    scriptEl.parentNode.insertBefore(container, scriptEl.nextSibling);

    // Fetch data
    fetch(API_BASE + "/api/widget/" + encodeURIComponent(token) + "/data")
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(data) {
        if (!data || !data.reviews) return;
        if (type === "badge") renderBadge(container, data);
        else renderCarousel(container, data);
      })
      .catch(function() {
        // Silent fail — don't break the host page
      });
  }

  function stars(rating) {
    var html = "";
    for (var i = 1; i <= 5; i++) {
      html += '<span style="color:' + (i <= rating ? "#FBBF24" : "#D1D5DB") + ';font-size:14px;">\\u2605</span>';
    }
    return html;
  }

  function formatDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch(e) { return ""; }
  }

  function esc(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  /* ─── Badge Widget ─── */
  function renderBadge(el, data) {
    el.innerHTML =
      '<div style="' + badgeStyle() + '">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<div style="font-size:28px;font-weight:700;color:#1a1a2e;">' + data.averageRating + '</div>' +
          '<div>' +
            '<div>' + stars(Math.round(data.averageRating)) + '</div>' +
            '<div style="font-size:11px;color:#6B7280;margin-top:2px;">' + data.totalReviews + ' reviews</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:#9CA3AF;margin-top:6px;">Powered by ReputationShield</div>' +
      '</div>';
  }

  function badgeStyle() {
    return "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px 20px;" +
      "display:inline-block;box-shadow:0 1px 3px rgba(0,0,0,0.06);";
  }

  /* ─── Carousel Widget ─── */
  function renderCarousel(el, data) {
    if (!data.reviews.length) {
      el.innerHTML = '<div style="' + badgeStyle() + '">' +
        '<div style="font-size:13px;color:#6B7280;">No reviews yet.</div></div>';
      return;
    }

    var idx = 0;
    var reviews = data.reviews;

    function renderSlide() {
      var r = reviews[idx];
      var html =
        '<div style="' + carouselStyle() + '">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
            '<div>' +
              '<div style="font-size:20px;font-weight:700;color:#1a1a2e;">' + data.averageRating + ' ' + stars(Math.round(data.averageRating)) + '</div>' +
              '<div style="font-size:11px;color:#6B7280;">' + data.totalReviews + ' reviews for ' + esc(data.businessName) + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="border-top:1px solid #F3F4F6;padding-top:12px;">' +
            '<div style="margin-bottom:6px;">' + stars(r.rating) + '</div>' +
            (r.text ? '<p style="font-size:13px;color:#374151;line-height:1.5;margin:0 0 8px;max-height:80px;overflow:hidden;">' + esc(r.text.length > 200 ? r.text.slice(0, 200) + "\\u2026" : r.text) + '</p>' : '') +
            '<div style="display:flex;align-items:center;justify-content:space-between;">' +
              '<div style="font-size:12px;color:#6B7280;">' +
                (r.reviewerName ? esc(r.reviewerName) : 'Verified Customer') +
                (r.date ? ' \\u00B7 ' + formatDate(r.date) : '') +
              '</div>' +
              (reviews.length > 1 ? '<div style="display:flex;gap:4px;">' +
                '<button onclick="this.dispatchEvent(new CustomEvent(\\'wft-prev\\',{bubbles:true}))" style="' + navBtnStyle() + '">\\u2039</button>' +
                '<span style="font-size:11px;color:#9CA3AF;padding:0 4px;">' + (idx + 1) + '/' + reviews.length + '</span>' +
                '<button onclick="this.dispatchEvent(new CustomEvent(\\'wft-next\\',{bubbles:true}))" style="' + navBtnStyle() + '">\\u203A</button>' +
              '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;margin-top:8px;font-size:10px;color:#D1D5DB;">Powered by ReputationShield</div>' +
        '</div>';
      el.innerHTML = html;
    }

    renderSlide();

    el.addEventListener("wft-prev", function() {
      idx = (idx - 1 + reviews.length) % reviews.length;
      renderSlide();
    });
    el.addEventListener("wft-next", function() {
      idx = (idx + 1) % reviews.length;
      renderSlide();
    });

    // Auto-rotate every 8 seconds
    setInterval(function() {
      idx = (idx + 1) % reviews.length;
      renderSlide();
    }, 8000);
  }

  function carouselStyle() {
    return "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:20px;" +
      "max-width:480px;box-shadow:0 1px 3px rgba(0,0,0,0.06);";
  }

  function navBtnStyle() {
    return "border:1px solid #E5E7EB;background:#fff;border-radius:6px;width:28px;height:28px;" +
      "font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#374151;";
  }
})();
`;
