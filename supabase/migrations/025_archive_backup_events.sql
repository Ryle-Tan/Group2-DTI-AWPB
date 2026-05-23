-- Keep an append-only activity history for archive backup actions.

CREATE TABLE IF NOT EXISTS public.archive_backup_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    planning_year INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'csv_backup_downloaded',
            'database_backup_confirmed',
            'cleanup_completed'
        )
    ),
    reference TEXT,
    record_count INTEGER CHECK (record_count IS NULL OR record_count >= 0),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archive_backup_events_created_at
ON public.archive_backup_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_archive_backup_events_planning_year
ON public.archive_backup_events(planning_year DESC);

ALTER TABLE public.archive_backup_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view archive backup events" ON public.archive_backup_events;
CREATE POLICY "Admins can view archive backup events" ON public.archive_backup_events
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert archive backup events" ON public.archive_backup_events;
CREATE POLICY "Admins can insert archive backup events" ON public.archive_backup_events
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

REVOKE ALL ON public.archive_backup_events FROM anon;
GRANT SELECT, INSERT ON public.archive_backup_events TO authenticated;

INSERT INTO public.archive_backup_events (
    planning_year,
    event_type,
    reference,
    record_count,
    actor_id,
    actor_name,
    created_at
)
SELECT
    planning_year,
    'csv_backup_downloaded',
    csv_filename,
    csv_record_count,
    csv_generated_by,
    csv_generated_by_name,
    csv_generated_at
FROM public.archive_backups backup
WHERE csv_generated_at IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM public.archive_backup_events event
        WHERE event.planning_year = backup.planning_year
            AND event.event_type = 'csv_backup_downloaded'
            AND event.created_at = backup.csv_generated_at
    );

INSERT INTO public.archive_backup_events (
    planning_year,
    event_type,
    reference,
    actor_id,
    actor_name,
    created_at
)
SELECT
    planning_year,
    'database_backup_confirmed',
    sql_backup_filename,
    sql_backup_marked_by,
    sql_backup_marked_by_name,
    sql_backup_marked_at
FROM public.archive_backups backup
WHERE sql_backup_marked_at IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM public.archive_backup_events event
        WHERE event.planning_year = backup.planning_year
            AND event.event_type = 'database_backup_confirmed'
            AND event.created_at = backup.sql_backup_marked_at
    );

INSERT INTO public.archive_backup_events (
    planning_year,
    event_type,
    reference,
    actor_id,
    actor_name,
    created_at
)
SELECT
    planning_year,
    'cleanup_completed',
    'Cleaned up planning year ' || planning_year::TEXT,
    cleanup_completed_by,
    cleanup_completed_by_name,
    cleanup_completed_at
FROM public.archive_backups backup
WHERE cleanup_completed_at IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM public.archive_backup_events event
        WHERE event.planning_year = backup.planning_year
            AND event.event_type = 'cleanup_completed'
            AND event.created_at = backup.cleanup_completed_at
    );

NOTIFY pgrst, 'reload schema';
