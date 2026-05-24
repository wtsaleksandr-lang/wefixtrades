-- 0046_rum_web_vitals.sql
--
-- SEO Wave D — Real User Monitoring for Core Web Vitals.
--
-- Single append-only table receives a sample per (page, metric, session)
-- from the public client. The browser captures LCP, CLS, INP, FCP, and
-- TTFB via PerformanceObserver and POSTs to /api/rum/web-vitals; this
-- table backs the eventual admin "Web Vitals" dashboard and lets us
-- correlate slow pages with the Wave C audit tools.
--
-- visitor_meta is intentionally narrow: only sha256(user_agent + ip)
-- truncated to 32 hex chars — no raw UA, no raw IP. `rating` is GA's
-- standard "good" | "needs-improvement" | "poor" bucket so the
-- dashboard can colour-code without recomputing thresholds.

CREATE TABLE IF NOT EXISTS rum_web_vitals_samples (
  id              BIGSERIAL PRIMARY KEY,
  url             TEXT NOT NULL,
  metric_name     TEXT NOT NULL,
  value           DOUBLE PRECISION NOT NULL,
  rating          TEXT,
  metric_id       TEXT,
  navigation_type TEXT,
  user_agent_hash TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rum_web_vitals_url_metric_time_idx
  ON rum_web_vitals_samples(url, metric_name, created_at DESC);

CREATE INDEX IF NOT EXISTS rum_web_vitals_metric_time_idx
  ON rum_web_vitals_samples(metric_name, created_at DESC);
