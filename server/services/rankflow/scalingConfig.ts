/**
 * RankFlow Scaling Configuration
 *
 * Controls worker load limits, client prioritization, batch sizing,
 * and tracking throttles to keep RankFlow safe at 20-100+ clients.
 */

/* ─── Worker Load Limits ─── */

export const WORKER_LIMITS = {
  /** Max clients processed per plan generation run */
  plan_generation_max_clients: 25,

  /** Max AI tasks auto-processed per run (across all clients) */
  ai_tasks_max_per_run: 50,

  /** Max clients tracked per tracking run */
  tracking_max_clients: 10,

  /** Max keywords checked per tracking run (across all clients) */
  tracking_max_keywords: 100,

  /** Max pages checked per tracking run (across all clients) */
  tracking_max_pages: 50,

  /** Max keywords checked per client per run */
  tracking_keywords_per_client: 15,

  /** Max pages checked per client per run */
  tracking_pages_per_client: 10,
};

/* ─── Batch Sizing ─── */

export const BATCH_LIMITS = {
  /** Minimum tasks before creating a vendor batch */
  min_tasks_per_batch: 3,

  /** Maximum tasks per vendor batch */
  max_tasks_per_batch: 30,

  /** Maximum open draft batches per vendor type */
  max_open_drafts_per_vendor: 3,
};

/* ─── Client Priority ─── */

const TIER_PRIORITY: Record<string, number> = {
  pro: 3,
  growth: 2,
  starter: 1,
};

export interface PrioritizedProfile {
  client_id: number;
  plan_tier: string;
  priority: number;
  website_url: string | null;
  niche: string | null;
  location: string | null;
  target_services: any;
  target_locations: any;
  enabled: boolean;
}

/**
 * Sort profiles by priority: Pro > Growth > Starter.
 * Within same tier, no further sorting (FIFO from DB order).
 */
export function prioritizeProfiles<T extends { plan_tier: string }>(profiles: T[]): T[] {
  return [...profiles].sort((a, b) => {
    const pa = TIER_PRIORITY[a.plan_tier] || 0;
    const pb = TIER_PRIORITY[b.plan_tier] || 0;
    return pb - pa; // descending
  });
}

/**
 * Chunk an array into groups of max size.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
