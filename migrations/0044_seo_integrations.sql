-- 0044_seo_integrations.sql
--
-- SEO Integrations wave — token storage + indexing history.
--
-- `oauth_tokens` is keyed by `provider` (single connected account per
-- provider; reconnecting overwrites). access_token / refresh_token are
-- AES-256-GCM ciphertext from server/lib/tokenEncryption.ts (prefix
-- "enc:v1:"). Never store raw tokens; the API shim layer decrypts at use.
--
-- `seo_indexing_history` is append-only audit of sitemap submissions and
-- per-URL index requests against GSC + Bing. The admin Integrations page
-- reads it for the activity panel; the background indexing job writes it.

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,
  account_email   TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  expires_at      TIMESTAMP WITH TIME ZONE,
  scopes          TEXT[],
  connected_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_tokens_provider_idx ON oauth_tokens(provider);

CREATE TABLE IF NOT EXISTS seo_indexing_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url             TEXT NOT NULL,
  action          TEXT NOT NULL,
  source          TEXT NOT NULL,
  status          TEXT,
  details         JSONB,
  performed_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_indexing_history_url_idx ON seo_indexing_history(url, performed_at DESC);
