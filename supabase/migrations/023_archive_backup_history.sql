-- Track yearly archive backups before any old-year cleanup is allowed.

CREATE TABLE IF NOT EXISTS public.archive_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    planning_year INTEGER NOT NULL UNIQUE,
    csv_filename TEXT,
    csv_record_count INTEGER NOT NULL DEFAULT 0 CHECK (csv_record_count >= 0),
    csv_generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    csv_generated_by_name TEXT,
    csv_generated_at TIMESTAMPTZ,
    sql_backup_filename TEXT,
    sql_backup_marked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sql_backup_marked_by_name TEXT,
    sql_backup_marked_at TIMESTAMPTZ,
    cleanup_completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cleanup_completed_by_name TEXT,
    cleanup_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archive_backups_planning_year
ON public.archive_backups(planning_year DESC);

DROP TRIGGER IF EXISTS update_archive_backups_updated_at ON public.archive_backups;
CREATE TRIGGER update_archive_backups_updated_at
    BEFORE UPDATE ON public.archive_backups
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.archive_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view archive backups" ON public.archive_backups;
CREATE POLICY "Admins can view archive backups" ON public.archive_backups
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert archive backups" ON public.archive_backups;
CREATE POLICY "Admins can insert archive backups" ON public.archive_backups
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update archive backups" ON public.archive_backups;
CREATE POLICY "Admins can update archive backups" ON public.archive_backups
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

REVOKE ALL ON public.archive_backups FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.archive_backups TO authenticated;

NOTIFY pgrst, 'reload schema';
