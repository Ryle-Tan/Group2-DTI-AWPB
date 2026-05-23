-- Move archive backup writes and audit logging into database transactions.

CREATE OR REPLACE FUNCTION public.admin_record_csv_backup(
    p_planning_year INTEGER,
    p_filename TEXT,
    p_record_count INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_backup public.archive_backups;
    v_event public.archive_backup_events;
    v_actor_name TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_filename TEXT := trim(p_filename);
    v_record_count INTEGER := GREATEST(COALESCE(p_record_count, 0), 0);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only active admins can record CSV backups.'
            USING ERRCODE = '42501';
    END IF;

    IF p_planning_year IS NULL THEN
        RAISE EXCEPTION 'Planning year is required.'
            USING ERRCODE = '22023';
    END IF;

    IF COALESCE(v_filename, '') = '' THEN
        RAISE EXCEPTION 'CSV backup filename is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(username), ''), auth.uid()::TEXT)
    INTO v_actor_name
    FROM public.profiles
    WHERE id = auth.uid();

    v_actor_name := COALESCE(v_actor_name, auth.uid()::TEXT);

    INSERT INTO public.archive_backups (
        planning_year,
        csv_filename,
        csv_record_count,
        csv_generated_by,
        csv_generated_by_name,
        csv_generated_at
    )
    VALUES (
        p_planning_year,
        v_filename,
        v_record_count,
        auth.uid(),
        v_actor_name,
        v_now
    )
    ON CONFLICT (planning_year) DO UPDATE
    SET
        csv_filename = EXCLUDED.csv_filename,
        csv_record_count = EXCLUDED.csv_record_count,
        csv_generated_by = EXCLUDED.csv_generated_by,
        csv_generated_by_name = EXCLUDED.csv_generated_by_name,
        csv_generated_at = EXCLUDED.csv_generated_at
    RETURNING *
    INTO v_backup;

    INSERT INTO public.archive_backup_events (
        planning_year,
        event_type,
        reference,
        record_count,
        actor_id,
        actor_name,
        created_at
    )
    VALUES (
        p_planning_year,
        'csv_backup_downloaded',
        v_filename,
        v_record_count,
        auth.uid(),
        v_actor_name,
        v_now
    )
    RETURNING *
    INTO v_event;

    RETURN jsonb_build_object(
        'backup', to_jsonb(v_backup),
        'event', to_jsonb(v_event)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_database_backup(
    p_planning_year INTEGER,
    p_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_backup public.archive_backups;
    v_event public.archive_backup_events;
    v_actor_name TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_reference TEXT := trim(p_reference);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only active admins can confirm database backups.'
            USING ERRCODE = '42501';
    END IF;

    IF p_planning_year IS NULL THEN
        RAISE EXCEPTION 'Planning year is required.'
            USING ERRCODE = '22023';
    END IF;

    IF COALESCE(v_reference, '') = '' THEN
        RAISE EXCEPTION 'Database backup reference is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_backup
    FROM public.archive_backups
    WHERE planning_year = p_planning_year
    FOR UPDATE;

    IF NOT FOUND OR v_backup.csv_generated_at IS NULL THEN
        RAISE EXCEPTION 'CSV backup must be recorded before database backup confirmation.'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(username), ''), auth.uid()::TEXT)
    INTO v_actor_name
    FROM public.profiles
    WHERE id = auth.uid();

    v_actor_name := COALESCE(v_actor_name, auth.uid()::TEXT);

    UPDATE public.archive_backups
    SET
        sql_backup_filename = v_reference,
        sql_backup_marked_by = auth.uid(),
        sql_backup_marked_by_name = v_actor_name,
        sql_backup_marked_at = v_now
    WHERE id = v_backup.id
    RETURNING *
    INTO v_backup;

    INSERT INTO public.archive_backup_events (
        planning_year,
        event_type,
        reference,
        actor_id,
        actor_name,
        created_at
    )
    VALUES (
        p_planning_year,
        'database_backup_confirmed',
        v_reference,
        auth.uid(),
        v_actor_name,
        v_now
    )
    RETURNING *
    INTO v_event;

    RETURN jsonb_build_object(
        'backup', to_jsonb(v_backup),
        'event', to_jsonb(v_event)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cleanup_archive_year(
    p_planning_year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_backup public.archive_backups;
    v_event public.archive_backup_events;
    v_entry_ids UUID[] := ARRAY[]::UUID[];
    v_entry_count INTEGER := 0;
    v_deleted_entries INTEGER := 0;
    v_deleted_budget_transactions INTEGER := 0;
    v_actor_name TEXT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only active admins can clean archived year data.'
            USING ERRCODE = '42501';
    END IF;

    IF p_planning_year IS NULL THEN
        RAISE EXCEPTION 'Planning year is required.'
            USING ERRCODE = '22023';
    END IF;

    IF p_planning_year >= EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN
        RAISE EXCEPTION 'Only previous planning years can be cleaned up.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_backup
    FROM public.archive_backups
    WHERE planning_year = p_planning_year
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Backup record for % was not found.', p_planning_year
            USING ERRCODE = 'P0002';
    END IF;

    IF v_backup.csv_generated_at IS NULL THEN
        RAISE EXCEPTION 'CSV backup must be recorded before cleanup.'
            USING ERRCODE = '23514';
    END IF;

    IF v_backup.sql_backup_marked_at IS NULL THEN
        RAISE EXCEPTION 'Database backup must be confirmed before cleanup.'
            USING ERRCODE = '23514';
    END IF;

    IF v_backup.cleanup_completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Planning year % has already been cleaned up.', p_planning_year
            USING ERRCODE = '23505';
    END IF;

    SELECT
        COALESCE(array_agg(id), ARRAY[]::UUID[]),
        COUNT(*)::INTEGER
    INTO v_entry_ids, v_entry_count
    FROM public.entries
    WHERE planning_year = p_planning_year;

    IF v_entry_count > 0 THEN
        DELETE FROM public.budget_transactions
        WHERE entry_id = ANY(v_entry_ids);

        GET DIAGNOSTICS v_deleted_budget_transactions = ROW_COUNT;

        DELETE FROM public.entries
        WHERE id = ANY(v_entry_ids);

        GET DIAGNOSTICS v_deleted_entries = ROW_COUNT;
    END IF;

    SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(username), ''), auth.uid()::TEXT)
    INTO v_actor_name
    FROM public.profiles
    WHERE id = auth.uid();

    v_actor_name := COALESCE(v_actor_name, auth.uid()::TEXT);

    UPDATE public.archive_backups
    SET
        cleanup_completed_by = auth.uid(),
        cleanup_completed_by_name = v_actor_name,
        cleanup_completed_at = v_now
    WHERE id = v_backup.id
    RETURNING *
    INTO v_backup;

    INSERT INTO public.archive_backup_events (
        planning_year,
        event_type,
        reference,
        record_count,
        actor_id,
        actor_name,
        created_at
    )
    VALUES (
        p_planning_year,
        'cleanup_completed',
        'Cleaned up planning year ' || p_planning_year::TEXT,
        v_deleted_entries,
        auth.uid(),
        v_actor_name,
        v_now
    )
    RETURNING *
    INTO v_event;

    RETURN jsonb_build_object(
        'planning_year', p_planning_year,
        'deleted_entries', v_deleted_entries,
        'deleted_budget_transactions', v_deleted_budget_transactions,
        'backup', to_jsonb(v_backup),
        'event', to_jsonb(v_event)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_csv_backup(INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_csv_backup(INTEGER, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_confirm_database_backup(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_confirm_database_backup(INTEGER, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_cleanup_archive_year(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_archive_year(INTEGER) TO authenticated;

DROP POLICY IF EXISTS "Admins can insert archive backups" ON public.archive_backups;
DROP POLICY IF EXISTS "Admins can update archive backups" ON public.archive_backups;
REVOKE INSERT, UPDATE ON public.archive_backups FROM authenticated;

DROP POLICY IF EXISTS "Admins can insert archive backup events" ON public.archive_backup_events;
REVOKE INSERT, UPDATE, DELETE ON public.archive_backup_events FROM authenticated;

NOTIFY pgrst, 'reload schema';
