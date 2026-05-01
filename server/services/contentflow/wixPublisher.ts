/**
 * ContentFlow — Wix CMS publisher (Sprint 8: multi-CMS).
 *
 * Publishes blog posts to Wix sites via the Wix Blog API v3
 * (POST https://www.wixapis.com/blog/v3/posts).
 *
 * Auth: Bearer token using a Wix API key generated from
 * Wix Dashboard → Settings → API Keys.
 *
 * Wix rich content: Wix uses a proprietary JSON rich content format.
 * For simplicity, we wrap the HTML body inside a single RICH_CONTENT
 * node of type `HTML`. This preserves all formatting from the article
 * renderer and avoids brittle HTML-to-Wix-JSON conversion.
 *
 * Credentials shape (stored in client_service.metadata.wix_credentials
 * or rankflow_profiles.credentials.wix):
 *   { wix_api_key: string (encrypted), wix_site_id: string }
 */

import { createLogger } from "../../lib/logger";
import { isAllowedDestinationUrl } from "./wordpressPublisher";
import type { CmsAdapter, CmsCredentials, CmsPostPayload, CmsPublishResult } from "./cmsAdapter";

const log = createLogger("WixPublisher");

const WIX_BLOG_API = "https://www.wixapis.com/blog/v3/posts";

/**
 * Convert HTML content to Wix rich content format.
 * Wix expects a rich content JSON structure. We wrap HTML in a single
 * HTML node — Wix renders this faithfully in the blog editor.
 */
function htmlToWixRichContent(html: string): Record<string, any> {
  return {
    nodes: [
      {
        type: "HTML",
        htmlData: {
          html,
          containerData: {
            width: { size: "CONTENT" },
            alignment: "CENTER",
          },
        },
        id: `html-${Date.now()}`,
      },
    ],
    metadata: {
      version: 1,
      createdTimestamp: new Date().toISOString(),
      updatedTimestamp: new Date().toISOString(),
    },
  };
}

export const wixPublisher: CmsAdapter = {
  platform: "wix",

  async publishPost(
    credentials: CmsCredentials,
    post: CmsPostPayload,
  ): Promise<CmsPublishResult> {
    const apiKey = credentials.wix_api_key;
    const siteId = credentials.wix_site_id;

    if (!apiKey || !siteId) {
      return {
        success: false,
        error: "Missing Wix credentials: wix_api_key and wix_site_id are required",
      };
    }

    const richContent = htmlToWixRichContent(post.content);

    let response: Response;
    try {
      response = await fetch(WIX_BLOG_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "wix-site-id": siteId,
        },
        body: JSON.stringify({
          post: {
            title: post.title || "Untitled",
            richContent,
            excerpt: post.excerpt || undefined,
            status: "PUBLISHED",
          },
        }),
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      log.error("Wix publish network error", { error: msg });
      return { success: false, error: `Network error: ${msg}` };
    }

    if (!response.ok) {
      let bodyText = "";
      try { bodyText = await response.text(); } catch { /* ignore */ }
      const summary = bodyText.slice(0, 500);
      log.error("Wix publish HTTP error", { status: String(response.status), body: summary });
      return {
        success: false,
        error: `Wix API responded with ${response.status}: ${summary}`,
      };
    }

    let parsed: any;
    try {
      parsed = await response.json();
    } catch (err: any) {
      log.error("Wix publish: non-JSON response", { error: err.message });
      return { success: false, error: `Wix returned non-JSON response: ${err.message}` };
    }

    const postData = parsed?.post || parsed;
    const postId = postData?.id || postData?._id || "";
    const postUrl = postData?.url || "";

    if (!postId) {
      log.error("Wix publish: missing post ID in response", { keys: Object.keys(parsed || {}).join(",") });
      return { success: false, error: "Wix response missing post ID" };
    }

    log.info("Wix publish ok", { postId, postUrl });
    return {
      success: true,
      postId: String(postId),
      postUrl: postUrl || undefined,
    };
  },
};
