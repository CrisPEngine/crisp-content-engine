-- Find scheduled agent Instagram/Facebook content with no publish_jobs row.
-- Run in Supabase SQL editor; use scripts/backfill-agent-meta-publish-jobs.ts to queue jobs.

SELECT
  cm.id AS content_memory_id,
  cm.user_id,
  cm.channel,
  cm.publication_date,
  cm.brand_brain_id
FROM content_memory cm
WHERE cm.publication_status = 'scheduled'
  AND lower(cm.channel) IN ('instagram', 'facebook')
  AND NOT EXISTS (
    SELECT 1
    FROM publish_jobs pj
    WHERE pj.user_id = cm.user_id
      AND pj.content_item_key = cm.id
      AND pj.platform = lower(cm.channel)
      AND pj.status IN ('queued', 'retrying', 'publishing', 'published')
  )
ORDER BY cm.publication_date NULLS LAST, cm.created_at;

-- Example: backfill one Folian post after confirming it appears above:
-- npx tsx scripts/backfill-agent-meta-publish-jobs.ts --user-id=<owner-uuid>
