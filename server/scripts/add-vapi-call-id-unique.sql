-- Add unique constraint on vapi_call_id in tradeline_call_log.
-- Run before drizzle-kit push if existing data may contain duplicates.

-- Step 1: De-duplicate — keep the earliest row per vapi_call_id
DELETE FROM tradeline_call_log
WHERE id NOT IN (
  SELECT MIN(id)
  FROM tradeline_call_log
  WHERE vapi_call_id IS NOT NULL
  GROUP BY vapi_call_id
)
AND vapi_call_id IS NOT NULL;

-- Step 2: Add the unique index (matches Drizzle .unique() output)
CREATE UNIQUE INDEX IF NOT EXISTS tradeline_call_log_vapi_call_id_unique
  ON tradeline_call_log (vapi_call_id);
