-- N/A at any lower hierarchy level means the corresponding foreign key can be
-- NULL. This reinforces migration 016 for projects that still have old NOT NULL
-- constraints on imported or newly submitted entries.

ALTER TABLE IF EXISTS entries
ALTER COLUMN sub_component_id DROP NOT NULL,
ALTER COLUMN key_activity_id DROP NOT NULL,
ALTER COLUMN sub_activity_id DROP NOT NULL;

ALTER TABLE IF EXISTS entries
ADD COLUMN IF NOT EXISTS sub_component_text TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS key_activity_text TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS sub_activity_text TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS no TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS performance_indicator TEXT DEFAULT '';

UPDATE entries
SET sub_component_text = 'N/A'
WHERE sub_component_id IS NULL
  AND NULLIF(sub_component_text, '') IS NULL;

UPDATE entries
SET key_activity_text = 'N/A'
WHERE key_activity_id IS NULL
  AND NULLIF(key_activity_text, '') IS NULL;

UPDATE entries
SET no = 'N/A'
WHERE key_activity_id IS NULL
  AND NULLIF(no, '') IS NULL;

UPDATE entries
SET performance_indicator = 'N/A'
WHERE key_activity_id IS NULL
  AND NULLIF(performance_indicator, '') IS NULL;

UPDATE entries
SET sub_activity_text = 'N/A'
WHERE sub_activity_id IS NULL
  AND NULLIF(sub_activity_text, '') IS NULL;

NOTIFY pgrst, 'reload schema';
