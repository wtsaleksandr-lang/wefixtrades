import { storage } from "../storage";
import { checkKeywordRanks } from "../services/rankflow/rankTracker";
import { checkIndexStatuses } from "../services/rankflow/indexChecker";
import { WORKER_LIMITS, prioritizeProfiles } from "../services/rankflow/scalingConfig";
import { createLogger } from "../lib/logger";

const log = createLogger("TrackingWorker");

/**
 * Weekly tracking job: check keyword rankings and page index status.
 * Load-controlled: max N clients per run, max keywords/pages per client,
 * prioritized by tier (Pro first).
 */
export async function processRankFlowTracking(): Promise<{
  clients_processed: number;
  keywords_checked: number;
  pages_checked: number;
}> {
  const allProfiles = await storage.listEnabledRankFlowProfiles();
  const sorted = prioritizeProfiles(allProfiles);
  const batch = sorted.slice(0, WORKER_LIMITS.tracking_max_clients);

  let keywords_checked = 0;
  let pages_checked = 0;
  let globalKwBudget = WORKER_LIMITS.tracking_max_keywords;
  let globalPageBudget = WORKER_LIMITS.tracking_max_pages;

  for (const profile of batch) {
    if (globalKwBudget <= 0 && globalPageBudget <= 0) break;

    try {
      const domain = profile.website_url;
      if (!domain) continue;

      // 1. Check keyword rankings (capped per client and globally)
      if (globalKwBudget > 0) {
        const keywords = await storage.listKeywordsByClient(profile.client_id);
        const kwLimit = Math.min(
          keywords.length,
          WORKER_LIMITS.tracking_keywords_per_client,
          globalKwBudget,
        );

        if (kwLimit > 0) {
          // Priority keywords first (already sorted by priority desc from storage)
          const kwInputs = keywords.slice(0, kwLimit).map(k => ({ id: k.id, keyword: k.keyword }));
          const rankResults = await checkKeywordRanks(kwInputs, domain, profile.location || undefined);

          for (const result of rankResults) {
            const lastRanking = await storage.getLastRankingForKeyword(result.keyword_id);
            const previousPosition = lastRanking?.position ?? null;
            const change = (previousPosition !== null && result.position !== null)
              ? previousPosition - result.position
              : null;

            await storage.insertRankingRecord({
              keyword_id: result.keyword_id,
              position: result.position,
              previous_position: previousPosition,
              change,
              checked_at: new Date(),
            });
            keywords_checked++;
            globalKwBudget--;
          }
        }
      }

      // 2. Check page index status (capped per client and globally)
      if (globalPageBudget > 0) {
        const pages = await storage.listPagesByClient(profile.client_id);
        const pageLimit = Math.min(
          pages.length,
          WORKER_LIMITS.tracking_pages_per_client,
          globalPageBudget,
        );

        if (pageLimit > 0) {
          const pageInputs = pages.slice(0, pageLimit).map(p => ({ id: p.id, url: p.url }));
          const indexResults = await checkIndexStatuses(pageInputs);

          for (const result of indexResults) {
            await storage.updatePageIndexStatus(result.page_id, result.indexed);
            pages_checked++;
            globalPageBudget--;
          }
        }
      }

      // 3. Compute signal summary (always — cheap operation)
      await computeSignalSummary(profile.client_id);

      log.info(`[tracking-worker] Client ${profile.client_id}: kw=${keywords_checked}, pages=${pages_checked}`);
    } catch (err: any) {
      log.error(`[tracking-worker] Error for client ${profile.client_id}:`, err.message);
    }
  }

  if (allProfiles.length > batch.length) {
    log.info(`[tracking-worker] Tracked ${batch.length}/${allProfiles.length} clients (capped at ${WORKER_LIMITS.tracking_max_clients})`);
  }

  return { clients_processed: batch.length, keywords_checked, pages_checked };
}

/**
 * Compute and store signal summary for a client.
 * Cheap operation — reads from DB, no external calls.
 */
async function computeSignalSummary(clientId: number): Promise<void> {
  const allKeywords = await storage.listKeywordsByClient(clientId);
  let top10 = 0;
  let top20 = 0;
  let improved = 0;
  let positionSum = 0;
  let positionCount = 0;

  for (const kw of allKeywords) {
    const lastRanking = await storage.getLastRankingForKeyword(kw.id);
    if (lastRanking?.position !== null && lastRanking?.position !== undefined) {
      if (lastRanking.position <= 10) top10++;
      if (lastRanking.position <= 20) top20++;
      positionSum += lastRanking.position;
      positionCount++;
    }
    if (lastRanking?.change !== null && lastRanking?.change !== undefined && lastRanking.change > 0) {
      improved++;
    }
  }

  const pages = await storage.listPagesByClient(clientId);
  const pagesIndexed = pages.filter(p => p.indexed).length;

  await storage.upsertSignalSummary(clientId, {
    total_keywords: allKeywords.length,
    keywords_top_10: top10,
    keywords_top_20: top20,
    keywords_improved: improved,
    avg_position: positionCount > 0 ? String(Math.round(positionSum / positionCount)) : null,
    pages_indexed: pagesIndexed,
    pages_total: pages.length,
  });
}
