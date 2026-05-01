/**
 * ContentFlow — Shopify CMS publisher (Sprint 8: multi-CMS).
 *
 * Publishes blog articles to Shopify stores via the Admin API
 * (POST https://{store}.myshopify.com/admin/api/2024-01/blogs/{blog_id}/articles.json).
 *
 * Auth: X-Shopify-Access-Token header with a custom app access token.
 *
 * Credentials shape (stored in client_service.metadata.shopify_credentials
 * or rankflow_profiles.credentials.shopify):
 *   {
 *     shopify_store: string,          // e.g. "my-trades-shop"
 *     shopify_access_token: string,   // encrypted
 *     shopify_blog_id: string,        // numeric blog ID
 *   }
 */

import { createLogger } from "../../lib/logger";
import type { CmsAdapter, CmsCredentials, CmsPostPayload, CmsPublishResult } from "./cmsAdapter";

const log = createLogger("ShopifyPublisher");

const SHOPIFY_API_VERSION = "2024-01";

export const shopifyPublisher: CmsAdapter = {
  platform: "shopify",

  async publishPost(
    credentials: CmsCredentials,
    post: CmsPostPayload,
  ): Promise<CmsPublishResult> {
    const store = credentials.shopify_store;
    const accessToken = credentials.shopify_access_token;
    const blogId = credentials.shopify_blog_id;

    if (!store || !accessToken || !blogId) {
      return {
        success: false,
        error: "Missing Shopify credentials: shopify_store, shopify_access_token, and shopify_blog_id are required",
      };
    }

    // Normalize store name: strip .myshopify.com if user included it
    const storeName = store.replace(/\.myshopify\.com$/i, "");
    const url = `https://${storeName}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/blogs/${blogId}/articles.json`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          article: {
            title: post.title || "Untitled",
            body_html: post.content,
            summary_html: post.excerpt || undefined,
            published: post.status !== "draft",
            author: "WeFixTrades",
          },
        }),
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      log.error("Shopify publish network error", { error: msg });
      return { success: false, error: `Network error: ${msg}` };
    }

    if (!response.ok) {
      let bodyText = "";
      try { bodyText = await response.text(); } catch { /* ignore */ }
      const summary = bodyText.slice(0, 500);
      log.error("Shopify publish HTTP error", { status: String(response.status), body: summary });
      return {
        success: false,
        error: `Shopify API responded with ${response.status}: ${summary}`,
      };
    }

    let parsed: any;
    try {
      parsed = await response.json();
    } catch (err: any) {
      log.error("Shopify publish: non-JSON response", { error: err.message });
      return { success: false, error: `Shopify returned non-JSON response: ${err.message}` };
    }

    const article = parsed?.article;
    if (!article?.id) {
      log.error("Shopify publish: missing article ID in response", { keys: Object.keys(parsed || {}).join(",") });
      return { success: false, error: "Shopify response missing article ID" };
    }

    // Build the public article URL
    const articleHandle = article.handle || "";
    const postUrl = articleHandle
      ? `https://${storeName}.myshopify.com/blogs/${blogId}/${articleHandle}`
      : "";

    log.info("Shopify publish ok", { articleId: String(article.id), postUrl });
    return {
      success: true,
      postId: String(article.id),
      postUrl: postUrl || undefined,
    };
  },
};
