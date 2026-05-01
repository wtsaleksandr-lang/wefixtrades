/**
 * ContentFlow — CMS adapter interface (Sprint 8: multi-CMS).
 *
 * Defines a unified interface for publishing blog posts to any CMS
 * platform (WordPress, Wix, Shopify, Squarespace, custom). The
 * cmsRouter dispatches to the correct adapter based on the client's
 * configured CMS type.
 *
 * Each CMS adapter implements `CmsAdapter.publishPost()` and
 * optionally `updatePost()`. The router resolves credentials from
 * rankflow_profiles or client_service metadata and passes them through.
 */

/* ─── Credential shape ────────────────────────────────────────────── */

export interface CmsCredentials {
  platform: "wordpress" | "wix" | "shopify" | "squarespace" | "custom";
  /** Platform-specific fields stored in encrypted metadata. */
  [key: string]: any;
}

/* ─── Publish result ──────────────────────────────────────────────── */

export interface CmsPublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

/* ─── Post payload ────────────────────────────────────────────────── */

export interface CmsPostPayload {
  title: string;
  content: string;
  excerpt?: string;
  status?: string;
}

/* ─── Adapter interface ───────────────────────────────────────────── */

export interface CmsAdapter {
  readonly platform: string;

  /**
   * Publish a new blog post to the CMS.
   * Never throws on expected errors — returns { success: false, error }.
   */
  publishPost(
    credentials: CmsCredentials,
    post: CmsPostPayload,
  ): Promise<CmsPublishResult>;

  /**
   * Update an existing post. Optional — not all CMS platforms support
   * this or it may not be needed for the initial integration.
   */
  updatePost?(
    credentials: CmsCredentials,
    postId: string,
    post: Partial<CmsPostPayload>,
  ): Promise<CmsPublishResult>;
}
