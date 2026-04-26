/**
 * ContentFlow — WordPress publisher.
 *
 * Pushes an approved RankFlow article (`content_drafts.kind='article'`,
 * `surface='rankflow'`, `status='approved'`) to a client's WordPress site
 * via the REST API (POST /wp-json/wp/v2/posts) using HTTP Basic Auth with
 * an Application Password.
 *
 * Credentials live in `rankflow_profiles.credentials.wordpress`. The
 * application password is encrypted at rest via the existing
 * tokenEncryption helper (AES-256-GCM with TOKEN_ENCRYPTION_KEY).
 *
 * Defaults to WordPress post status 'draft' on the WP side — admin opts
 * into 'publish' explicitly per call. Never throws — returns a structured
 * result so callers (route handlers, retry flows) can branch cleanly.
 *
 * Sprint 4 scope: manual admin-triggered publish only. No queue, no cron,
 * no auto-publish, no scheduling.
 */

import { storage } from "../../storage";
import { renderArticleHtml } from "./articleHtml";
import { decryptToken, isEncryptionConfigured } from "../socialSync/tokenEncryption";
import type { ContentDraft } from "@shared/schema";

/* ─── Public types ──────────────────────────────────────────────────── */

export interface PublishOptions {
  /** WordPress post status to set on creation. Defaults to 'draft'. */
  status?: "draft" | "publish";
  /** Optional fetch override for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export type WordpressPublishResult =
  | {
      ok: true;
      post_id: number;
      post_url: string;
      wp_status: string;
      published_at: string;
    }
  | {
      ok: false;
      reason:
        | "draft_not_found"
        | "wrong_kind"
        | "wrong_surface"
        | "not_approved"
        | "missing_body"
        | "no_profile"
        | "wrong_cms_type"
        | "missing_credentials"
        | "encryption_unavailable"
        | "decrypt_failed"
        | "wp_error"
        | "network_error";
      message: string;
      http_status?: number;
    };

export type PublishStatusReport =
  | { state: "not_configured"; message: string }
  | { state: "configured"; cms_url: string }
  | {
      state: "published";
      post_id: number;
      post_url: string;
      published_at: string;
      wp_status: string;
    }
  | { state: "failed"; error: string; attempted_at: string };

/* ─── Credential shape (stored in rankflow_profiles.credentials.wordpress) ─ */

interface StoredWpCreds {
  cms_url: string;            // e.g. "https://example.com" — root site URL, no trailing /wp-json
  cms_username: string;       // WP username
  cms_app_password: string;   // ENCRYPTED hex string (encryptToken output)
  cms_default_status?: "draft" | "publish";
  configured_at?: string;
}

interface RankflowProfileWithCreds {
  client_id: number;
  cms_type: string | null;
  website_url: string | null;
  credentials: { wordpress?: StoredWpCreds } | Record<string, any> | null;
}

/* ─── Publisher ─────────────────────────────────────────────────────── */

const WP_POSTS_PATH = "/wp-json/wp/v2/posts";

function loadCredsForClient(profile: RankflowProfileWithCreds): StoredWpCreds | null {
  const creds = (profile.credentials || {}) as { wordpress?: StoredWpCreds };
  const wp = creds.wordpress;
  if (!wp || typeof wp !== "object") return null;
  if (!wp.cms_url || !wp.cms_username || !wp.cms_app_password) return null;
  return wp;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Publish an approved RankFlow article draft to the client's WordPress site.
 * Idempotency note: this DOES NOT check whether the draft was already
 * published — admins can re-publish if they want a second WP post (rare).
 * Most callers should gate on draft.metadata.wordpress.post_url before
 * calling.
 */
export async function publishDraftToWordpress(
  draftId: number,
  opts: PublishOptions = {},
): Promise<WordpressPublishResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  /* 1. Load the draft. */
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) {
    return { ok: false, reason: "draft_not_found", message: `draft ${draftId} not found` };
  }
  if (draft.kind !== "article") {
    return { ok: false, reason: "wrong_kind", message: `draft ${draftId} is not an article (kind=${draft.kind})` };
  }
  if (draft.surface !== "rankflow") {
    return { ok: false, reason: "wrong_surface", message: `draft ${draftId} is not a RankFlow draft (surface=${draft.surface})` };
  }
  if (draft.status !== "approved") {
    return { ok: false, reason: "not_approved", message: `draft ${draftId} status is ${draft.status}, not 'approved'` };
  }
  if (!draft.body || draft.body.length === 0) {
    return { ok: false, reason: "missing_body", message: `draft ${draftId} has no body` };
  }

  /* 2. Load the client's RankFlow profile (where the WP creds live). */
  const profile = (await storage.getRankFlowProfile(draft.client_id)) as RankflowProfileWithCreds | undefined;
  if (!profile) {
    return { ok: false, reason: "no_profile", message: `client ${draft.client_id} has no RankFlow profile` };
  }
  if (profile.cms_type !== "wordpress") {
    return { ok: false, reason: "wrong_cms_type", message: `client ${draft.client_id} cms_type is ${profile.cms_type ?? "null"}, expected 'wordpress'` };
  }

  const creds = loadCredsForClient(profile);
  if (!creds) {
    return { ok: false, reason: "missing_credentials", message: `client ${draft.client_id} has no stored WordPress credentials` };
  }
  if (!isEncryptionConfigured()) {
    return { ok: false, reason: "encryption_unavailable", message: "TOKEN_ENCRYPTION_KEY is not set; cannot decrypt stored credentials" };
  }

  /* 3. Decrypt the application password. */
  let appPassword: string;
  try {
    appPassword = decryptToken(creds.cms_app_password);
  } catch (err: any) {
    return { ok: false, reason: "decrypt_failed", message: `failed to decrypt stored credentials: ${err.message}` };
  }

  /* 4. Render markdown body to HTML for WP. */
  const contentHtml = renderArticleHtml({
    title: null,        // WP renders its own <h1> from the post title field
    excerpt: null,      // WP has a dedicated excerpt field — handled separately
    bodyMd: draft.body,
  });

  /* 5. Call WordPress REST API. */
  const wpStatus = opts.status === "publish" ? "publish" : "draft";
  const targetUrl = `${trimTrailingSlash(creds.cms_url)}${WP_POSTS_PATH}`;
  const authHeader = "Basic " + Buffer.from(`${creds.cms_username}:${appPassword}`).toString("base64");

  let response: Response;
  try {
    response = await fetchImpl(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({
        title: draft.title || "Untitled article",
        content: contentHtml,
        excerpt: draft.excerpt || "",
        status: wpStatus,
      }),
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[contentflow] WP publish network error for draft ${draftId} → ${trimTrailingSlash(creds.cms_url)}: ${msg}`);
    await persistFailure(draftId, msg);
    return { ok: false, reason: "network_error", message: msg };
  }

  if (!response.ok) {
    let bodyText = "";
    try { bodyText = await response.text(); } catch {/* ignore */}
    const summary = bodyText.slice(0, 500);
    console.error(`[contentflow] WP publish HTTP ${response.status} for draft ${draftId}: ${summary}`);
    await persistFailure(draftId, `HTTP ${response.status}: ${summary}`);
    return { ok: false, reason: "wp_error", message: `WordPress responded with ${response.status}: ${summary}`, http_status: response.status };
  }

  let parsed: any;
  try {
    parsed = await response.json();
  } catch (err: any) {
    const msg = `WordPress returned non-JSON response: ${err.message}`;
    console.error(`[contentflow] ${msg} (draft ${draftId})`);
    await persistFailure(draftId, msg);
    return { ok: false, reason: "wp_error", message: msg, http_status: response.status };
  }

  const postId = typeof parsed?.id === "number" ? parsed.id : Number(parsed?.id);
  const postUrl = typeof parsed?.link === "string" ? parsed.link : "";
  const respStatus = typeof parsed?.status === "string" ? parsed.status : wpStatus;

  if (!Number.isFinite(postId) || !postUrl) {
    const msg = "WordPress response missing id or link field";
    console.error(`[contentflow] ${msg} (draft ${draftId}). Body keys: ${Object.keys(parsed || {}).join(",")}`);
    await persistFailure(draftId, msg);
    return { ok: false, reason: "wp_error", message: msg, http_status: response.status };
  }

  /* 6. Persist success on the draft + upsert rankflow_pages if linked. */
  const publishedAt = new Date().toISOString();
  const existingMeta = (draft.metadata || {}) as Record<string, any>;
  await storage.updateContentDraft(draftId, {
    status: "published",
    target_url: postUrl,
    metadata: {
      ...existingMeta,
      wordpress: {
        post_id: postId,
        post_url: postUrl,
        wp_status: respStatus,
        published_at: publishedAt,
      },
    },
  });

  if (draft.linked_task_id) {
    try {
      await storage.upsertPage(draft.client_id, postUrl, {
        target_keyword: (existingMeta.primary_keyword as string | undefined) ?? null,
        page_type: (existingMeta.page_type as string | undefined) ?? null,
        created_by_task_id: draft.linked_task_id,
        indexed: false,
      } as any);
    } catch (err: any) {
      // Non-fatal: the WP post is already created. Log + continue.
      console.error(`[contentflow] WP publish: rankflow_pages upsert failed for draft ${draftId}: ${err.message}`);
    }
  }

  console.log(`[contentflow] WP publish ok: draft=${draftId} client=${draft.client_id} post_id=${postId} status=${respStatus}`);
  return {
    ok: true,
    post_id: postId,
    post_url: postUrl,
    wp_status: respStatus,
    published_at: publishedAt,
  };
}

/**
 * Persist a publish failure into the draft's metadata so the admin UI can
 * surface the error and offer a Retry. Status stays 'approved' (not flipped
 * to 'failed') so the regular publish path can be retried.
 */
async function persistFailure(draftId: number, errorMsg: string): Promise<void> {
  try {
    const draft = await storage.getContentDraftById(draftId);
    if (!draft) return;
    const existingMeta = (draft.metadata || {}) as Record<string, any>;
    await storage.updateContentDraft(draftId, {
      metadata: {
        ...existingMeta,
        wordpress: {
          ...(existingMeta.wordpress || {}),
          error: errorMsg.slice(0, 500),
          attempted_at: new Date().toISOString(),
        },
      },
    });
  } catch (err: any) {
    console.error(`[contentflow] WP publish: failed to persist failure metadata for draft ${draftId}: ${err.message}`);
  }
}

/**
 * Compute a publish-status report for the admin UI without making any
 * outbound HTTP calls. Reads only the draft + the client's RankFlow profile.
 */
export async function getPublishStatus(draftId: number): Promise<PublishStatusReport | null> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return null;

  const meta = (draft.metadata || {}) as Record<string, any>;
  const wp = meta.wordpress as
    | { post_id?: number; post_url?: string; published_at?: string; wp_status?: string; error?: string; attempted_at?: string }
    | undefined;

  if (wp?.post_url && wp?.post_id) {
    return {
      state: "published",
      post_id: wp.post_id,
      post_url: wp.post_url,
      published_at: wp.published_at ?? "",
      wp_status: wp.wp_status ?? "draft",
    };
  }
  if (wp?.error) {
    return { state: "failed", error: wp.error, attempted_at: wp.attempted_at ?? "" };
  }

  const profile = (await storage.getRankFlowProfile(draft.client_id)) as RankflowProfileWithCreds | undefined;
  if (!profile || profile.cms_type !== "wordpress") {
    return { state: "not_configured", message: "Client does not have a WordPress CMS configured" };
  }
  const creds = loadCredsForClient(profile);
  if (!creds) {
    return { state: "not_configured", message: "WordPress credentials not stored for this client" };
  }
  return { state: "configured", cms_url: creds.cms_url };
}
