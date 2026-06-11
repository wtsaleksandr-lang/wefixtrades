-- 0085_contentflow_video_pipeline.sql
--
-- ContentFlow Phase 2 — full video generation pipeline (script → scene plan
-- → multi-scene render → stitched video → draft).
--
-- 1. video_projects — one row per user-requested video. Holds the Director's
--    scene plan, lifecycle status, stitch state, cost accounting and the
--    linkage to the content_drafts row (kind='video') that carries the video
--    through the existing approval/publish pipeline.
--
--    status:        planned | rendering | stitching | ready | needs_attention
--                   | failed | canceled
--    stitch_status: pending | stitching | done | failed
--
--    idempotency_key dedupes UI double-submits (sha256 of client|prompt|day|
--    nonce) — the route returns the existing project on conflict.
--
--    COST INVARIANT: every stage cost is written twice — to
--    video_projects.actual_cost_micro_usd / cost_breakdown AND to
--    content_drafts.generation_cost_micro_usd via addDraftGenerationCost —
--    so the existing ContentFlow monthly spend cap counts video spend
--    unchanged. See server/storage/contentflowVideo.ts addProjectCost.
--
-- 2. video_scenes — one row per Director scene. The render worker claims
--    planned scenes with FOR UPDATE SKIP LOCKED, submits to a provider
--    (Veo / Kling), persists the provider operation ref between ticks
--    (no in-process awaiting of multi-minute renders), and polls to
--    completion. provider_request_id is persisted BEFORE submit so a
--    crashed submit is detectable and idempotent to the provider.
--
--    status: planned | rendering | rendered | failed
--
-- 3. contentflow_settings.max_video_cost_usd — admin per-video cost ceiling
--    (whole USD; NULL = fall back to env VIDEO_MAX_COST_USD / built-in cap).
--    NOTE: contentflow_settings is ALSO lazy-created at runtime by
--    ensureContentflowSettingsTable in server/storage/contentflow.ts —
--    new columns must be added in BOTH places. The CREATE below guards the
--    ALTER on databases where the lazy DDL has never run.
--
-- Additive only: new tables + indexes + one new nullable column. Fully
-- idempotent — the bootstrap migrator runs every file on every cold boot.

CREATE TABLE IF NOT EXISTS video_projects (
  id                        SERIAL PRIMARY KEY,
  client_id                 INTEGER NOT NULL REFERENCES clients(id),
  draft_id                  INTEGER NOT NULL REFERENCES content_drafts(id),
  idempotency_key           VARCHAR(100) NOT NULL,
  title                     TEXT,
  source_prompt             TEXT NOT NULL,
  -- 3-source snapshot: { template_id? | custom_prompt_id? | free_form? }
  prompt_source             JSONB,
  -- Director output (styleBible + scenes + totals); scenes are ALSO
  -- normalized into video_scenes — this is the audit copy.
  scene_plan                JSONB,
  aspect_ratio              VARCHAR(10) NOT NULL DEFAULT '16:9',
  narration_enabled         BOOLEAN NOT NULL DEFAULT true,
  audio_mode                VARCHAR(10),          -- native | tts | silent
  status                    VARCHAR(20) NOT NULL DEFAULT 'planned',
  stitch_status             VARCHAR(20) NOT NULL DEFAULT 'pending',
  stitch_operation_ref      TEXT,
  estimated_cost_micro_usd  INTEGER,
  actual_cost_micro_usd     INTEGER NOT NULL DEFAULT 0,
  cost_breakdown            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {director,scenes,tts,stitch}
  video_url                 TEXT,
  error                     TEXT,
  locked_at                 TIMESTAMP,
  locked_by                 VARCHAR(80),
  created_at                TIMESTAMP DEFAULT NOW(),
  updated_at                TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS video_projects_idempotency_uidx
  ON video_projects(idempotency_key);

CREATE INDEX IF NOT EXISTS video_projects_status_client_idx
  ON video_projects(status, client_id);

CREATE TABLE IF NOT EXISTS video_scenes (
  id                       SERIAL PRIMARY KEY,
  project_id               INTEGER NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  scene_index              INTEGER NOT NULL,
  prompt                   TEXT NOT NULL,
  narration                TEXT,
  duration_sec             INTEGER NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'planned',
  provider                 VARCHAR(20),           -- veo_31 | kling_30
  provider_operation_ref   TEXT,                  -- LRO name / queue id, persisted between ticks
  provider_request_id      VARCHAR(100),          -- idempotency token to the provider, set BEFORE submit
  video_url                TEXT,                  -- per-scene R2 asset (resumability + retry)
  cost_micro_usd           INTEGER NOT NULL DEFAULT 0,
  attempts                 INTEGER NOT NULL DEFAULT 0,
  last_error               TEXT,
  next_attempt_at          TIMESTAMP,             -- retry backoff gate
  locked_at                TIMESTAMP,
  locked_by                VARCHAR(80),
  rendered_at              TIMESTAMP,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS video_scenes_project_scene_uidx
  ON video_scenes(project_id, scene_index);

CREATE INDEX IF NOT EXISTS video_scenes_status_next_attempt_idx
  ON video_scenes(status, next_attempt_at);

-- contentflow_settings may not exist yet on a database where the runtime
-- lazy-DDL (ensureContentflowSettingsTable) has never run — create it with
-- the full current shape first so the ALTER below is always valid.
CREATE TABLE IF NOT EXISTS contentflow_settings (
  id INTEGER PRIMARY KEY,
  kill_switch BOOLEAN NOT NULL DEFAULT false,
  text_tier VARCHAR(20) NOT NULL DEFAULT 'standard',
  disabled_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  monthly_spend_cap_usd INTEGER,
  max_video_cost_usd INTEGER,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER
);

ALTER TABLE contentflow_settings
  ADD COLUMN IF NOT EXISTS max_video_cost_usd INTEGER;
