import { storage } from "../storage";

export async function runDailyAggregation(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  const calcs = await storage.getAllCalculatorsWithEmail();
  let processed = 0;

  for (const calc of calcs) {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [eventCounts, weeklyLeadCount, avgQuote, bestDay] = await Promise.all([
        storage.getEventCounts(calc.id, sevenDaysAgo),
        storage.getLeadCountSince(calc.id, sevenDaysAgo),
        storage.getAvgQuoteAmount(calc.id),
        storage.getBestDay(calc.id, sevenDaysAgo),
      ]);

      const weeklyViews = eventCounts.views;
      const weeklyLeads = weeklyLeadCount;
      const conversionRate = weeklyViews > 0 ? Math.round((weeklyLeads / weeklyViews) * 100) : 0;

      await storage.upsertAnalyticsSummary({
        calculator_id: calc.id,
        period_date: now,
        total_views: calc.total_views || 0,
        total_quotes: eventCounts.quotes,
        total_leads: weeklyLeads,
        conversion_rate: conversionRate,
        avg_quote_value: avgQuote,
        best_day: bestDay,
        metadata: {
          period: 'weekly',
          views_this_week: weeklyViews,
          leads_this_week: weeklyLeads,
          quotes_this_week: eventCounts.quotes,
          total_views_all_time: calc.total_views || 0,
          aggregated_at: now.toISOString(),
        },
      });

      processed++;
    } catch (err: any) {
      errors.push(`Calculator ${calc.id}: ${err.message}`);
    }
  }

  return { processed, errors };
}
