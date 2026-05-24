-- Keep intentional N/A classification values available after an entry is saved.
-- Optional lower hierarchy levels are stored as NULL foreign keys, so exports need
-- entry-level text columns to round-trip N/A through CSV backup/import.

ALTER TABLE IF EXISTS entries
ADD COLUMN IF NOT EXISTS sub_component_text TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS key_activity_text TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS sub_activity_text TEXT DEFAULT '';

UPDATE entries e
SET sub_component_text = sc.name
FROM sub_components sc
WHERE e.sub_component_id = sc.id
  AND NULLIF(e.sub_component_text, '') IS NULL;

UPDATE entries
SET sub_component_text = 'N/A'
WHERE sub_component_id IS NULL
  AND NULLIF(sub_component_text, '') IS NULL;

UPDATE entries e
SET key_activity_text = ka.name
FROM key_activities ka
WHERE e.key_activity_id = ka.id
  AND NULLIF(e.key_activity_text, '') IS NULL;

UPDATE entries
SET key_activity_text = 'N/A'
WHERE key_activity_id IS NULL
  AND NULLIF(key_activity_text, '') IS NULL;

UPDATE entries e
SET no = ka.activity_no
FROM key_activities ka
WHERE e.key_activity_id = ka.id
  AND NULLIF(e.no, '') IS NULL
  AND NULLIF(ka.activity_no, '') IS NOT NULL;

UPDATE entries
SET no = 'N/A'
WHERE NULLIF(no, '') IS NULL;

UPDATE entries e
SET performance_indicator = ka.performance_indicator
FROM key_activities ka
WHERE e.key_activity_id = ka.id
  AND NULLIF(e.performance_indicator, '') IS NULL
  AND NULLIF(ka.performance_indicator, '') IS NOT NULL;

UPDATE entries
SET performance_indicator = 'N/A'
WHERE NULLIF(performance_indicator, '') IS NULL;

UPDATE entries e
SET sub_activity_text = sa.name
FROM sub_activities sa
WHERE e.sub_activity_id = sa.id
  AND NULLIF(e.sub_activity_text, '') IS NULL;

UPDATE entries
SET sub_activity_text = 'N/A'
WHERE sub_activity_id IS NULL
  AND NULLIF(sub_activity_text, '') IS NULL;

DROP VIEW IF EXISTS entries_with_targets;

CREATE VIEW entries_with_targets AS
SELECT
    e.*,
    json_agg(
        json_build_object(
            'month', mt.month,
            'target_quantity', mt.target_quantity
        ) ORDER BY mt.month
    ) FILTER (WHERE mt.id IS NOT NULL) as monthly_targets
FROM entries e
LEFT JOIN monthly_targets mt ON e.id = mt.entry_id
GROUP BY e.id
ORDER BY e.created_at DESC;

GRANT SELECT ON entries_with_targets TO authenticated;

NOTIFY pgrst, 'reload schema';
