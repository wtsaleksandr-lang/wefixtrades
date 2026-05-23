-- 0043_service_area_map_configs.sql
--
-- Free-tools batch 3: Service-Area Map widget.
--
-- One PNG per (client, address, radius, style, pin colour, circle colour,
-- circle opacity) tuple. The customer embed is a single <img> tag pointed at
-- /free-tool/service-area/:token.png; our server proxies Google Static Maps
-- on first request, caches the resulting PNG to disk, and serves the cache
-- thereafter. Cache is immutable — any config change recomputes cache_key
-- and writes a new file, so HTTP responses can be `Cache-Control: public,
-- max-age=2592000, immutable` without risking stale embeds.
--
-- Geocoding happens server-side on save; lat/lng are cached on the row so
-- subsequent regenerations don't re-bill the Google Geocoding API.
--
-- FK targets clients(id) — the embed resolves a widget_token (already on
-- clients) back to the client row, matching free-tools batches 1 & 2.

CREATE TABLE IF NOT EXISTS service_area_map_configs (
  client_id        INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Address inputs — geocoded server-side on save.
  address_line     TEXT NOT NULL,
  address_city     TEXT,
  address_region   TEXT,
  address_postal   TEXT,
  address_country  TEXT DEFAULT 'US',
  -- Geocoded centre — populated after the first successful save.
  center_lat       DECIMAL(10, 7),
  center_lng       DECIMAL(10, 7),
  -- Service radius.
  radius_value     INTEGER NOT NULL DEFAULT 25,
  radius_unit      TEXT NOT NULL DEFAULT 'miles' CHECK (radius_unit IN ('miles', 'km')),
  -- Visual style.
  map_style        TEXT NOT NULL DEFAULT 'roadmap' CHECK (map_style IN ('roadmap', 'satellite', 'terrain', 'hybrid')),
  pin_color        TEXT NOT NULL DEFAULT '#0d3cfc',
  circle_color     TEXT NOT NULL DEFAULT '#0d3cfc',
  circle_opacity   DECIMAL(3, 2) NOT NULL DEFAULT 0.20,
  -- Cache bookkeeping.
  -- cache_key = sha256(address|radius|style|pin|circle|opacity|poweredBy).
  -- When this changes, regenerate. cache_path points at the on-disk PNG
  -- (data/service-area-cache/<cache_key>.png) — immutable; never overwritten.
  cache_key        TEXT,
  cache_path       TEXT,
  cached_at        TIMESTAMP WITH TIME ZONE,
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
