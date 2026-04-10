import { storage } from "../storage";
import { checkKeywordRanks } from "../services/rankflow/rankTracker";
import { checkIndexStatuses } from "../services/rankflow/indexChecker";

/**
 * Weekly tracking job: check keyword rankings and page index status
 * for all enabled RankFlow clients.
 */
export async function processRankFlowTracking(): Promise<{
  clients_processed: number;
  keywords_checked: number;
  pages_checked: number;
}> {
  const profiles = await storage.listEnabledRankFlowProfiles();
  let keywords_checked = 0;
  let pages_checked = 0;

  for (const profile of profiles) {
    try {
      const domain = profile.website_url;
      if (!domain) continue;

      // 1. Check keyword rankings
      const keywords = await storage.listKeywordsByClient(profile.client_id);
      if (keywords.length > 0) {
        const kwInputs = keywords.slice(0, 20).map(k => ({ id: k.id, keyword: k.keyword }));
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
        }
      }

      // 2. Check page index status
      const pages = await storage.listPagesByClient(profile.client_id);
      if (pages.length > 0) {
        const pageInputs = pages.map(p => ({ id: p.id, url: p.url }));
        const indexResults = await checkIndexStatuses(pageInputs);

        for (const result of indexResults) {
          await storage.updatePageIndexStatus(result.page_id, result.indexed);
          pages_checked++;
        }
      }

      // 3. Compute signal summary
      const allKeywords = await storage.listKeywordsByClient(profile.client_id);
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

      const updatedPages = await storage.listPagesByClient(profile.client_id);
      const pagesIndexed = updatedPages.filter(p => p.indexed).length;

      await storage.upsertSignalSummary(profile.client_id, {
        total_keywords: allKeywords.length,
        keywords_top_10: top10,
        keywords_top_20: top20,
        keywords_improved: improved,
        avg_position: positionCount > 0 ? String(Math.round(positionSum / positionCount)) : null,
        pages_indexed: pagesIndexed,
        pages_total: updatedPages.length,
      });

      console.log(`[tracking-worker] Client ${profile.client_id}: ${keywords_checked} kw checked, ${pages_checked} pages checked, top10=${top10}, improved=${improved}`);
    } catch (err: any) {
      console.error(`[tracking-worker] Error for client ${profile.client_id}:`, err.message);
    }
  }

  return { clients_processed: profiles.length, keywords_checked, pages_checked };
}
