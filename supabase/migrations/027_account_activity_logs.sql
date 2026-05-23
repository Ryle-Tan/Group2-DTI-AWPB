-- Track admin account-management actions without adding a superuser role.

CREATE TABLE IF NOT EXISTS public.account_activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    target_username TEXT,
    target_full_name TEXT,
    target_email TEXT,
    target_role TEXT,
    target_status TEXT,
    action TEXT NOT NULL CHECK (
        action IN (
            'account_created',
            'account_updated',
            'account_deactivated',
            'account_activated',
            'password_changed'
        )
    ),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name TEXT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_activity_logs_created_at
ON public.account_activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_activity_logs_target_user_id
ON public.account_activity_logs(target_user_id);

CREATE INDEX IF NOT EXISTS idx_account_activity_logs_action
ON public.account_activity_logs(action);

ALTER TABLE public.account_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view account activity logs" ON public.account_activity_logs;
CREATE POLICY "Admins can view account activity logs" ON public.account_activity_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

REVOKE ALL ON public.account_activity_logs FROM anon;
GRANT SELECT ON public.account_activity_logs TO authenticated;

DO $$
BEGIN
    IF to_regprocedure('public.admin_create_user_account(text,text,text,text,text)') IS NOT NULL
        AND to_regprocedure('public.admin_create_user_account_without_account_logging(text,text,text,text,text)') IS NULL THEN
        ALTER FUNCTION public.admin_create_user_account(text, text, text, text, text)
            RENAME TO admin_create_user_account_without_account_logging;
    END IF;

    IF to_regprocedure('public.admin_update_user_account(uuid,text,text,text,text,text,text)') IS NOT NULL
        AND to_regprocedure('public.admin_update_user_account_without_account_logging(uuid,text,text,text,text,text,text)') IS NULL THEN
        ALTER FUNCTION public.admin_update_user_account(uuid, text, text, text, text, text, text)
            RENAME TO admin_update_user_account_without_account_logging;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_user_account(
    p_username TEXT,
    p_full_name TEXT,
    p_email TEXT,
    p_role TEXT,
    p_password TEXT
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_profile public.profiles;
    v_actor_name TEXT;
BEGIN
    v_profile := public.admin_create_user_account_without_account_logging(
        p_username,
        p_full_name,
        p_email,
        p_role,
        p_password
    );

    SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(username), ''), auth.uid()::TEXT)
    INTO v_actor_name
    FROM public.profiles
    WHERE id = auth.uid();

    v_actor_name := COALESCE(v_actor_name, auth.uid()::TEXT);

    INSERT INTO public.account_activity_logs (
        target_user_id,
        target_username,
        target_full_name,
        target_email,
        target_role,
        target_status,
        action,
        actor_id,
        actor_name,
        details
    )
    VALUES (
        v_profile.id,
        v_profile.username,
        v_profile.full_name,
        v_profile.email,
        v_profile.role::TEXT,
        v_profile.status::TEXT,
        'account_created',
        auth.uid(),
        v_actor_name,
        jsonb_build_object(
            'created_account', jsonb_build_object(
                'username', v_profile.username,
                'role', v_profile.role::TEXT,
                'status', v_profile.status::TEXT
            )
        )
    );

    RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_account(
    p_user_id UUID,
    p_username TEXT,
    p_full_name TEXT,
    p_email TEXT,
    p_role TEXT,
    p_status TEXT,
    p_password TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_before public.profiles;
    v_profile public.profiles;
    v_actor_name TEXT;
    v_action TEXT := 'account_updated';
    v_password_changed BOOLEAN := COALESCE(p_password, '') <> '';
    v_profile_changed BOOLEAN := FALSE;
    v_changes JSONB := '{}'::JSONB;
BEGIN
    SELECT *
    INTO v_before
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile was not found.'
            USING ERRCODE = 'P0002';
    END IF;

    v_profile := public.admin_update_user_account_without_account_logging(
        p_user_id,
        p_username,
        p_full_name,
        p_email,
        p_role,
        p_status,
        p_password
    );

    v_profile_changed :=
        v_before.username IS DISTINCT FROM v_profile.username
        OR v_before.full_name IS DISTINCT FROM v_profile.full_name
        OR v_before.email IS DISTINCT FROM v_profile.email
        OR v_before.role IS DISTINCT FROM v_profile.role
        OR v_before.status IS DISTINCT FROM v_profile.status;

    IF v_before.status IS DISTINCT FROM v_profile.status
        AND v_profile.status = 'deactivated' THEN
        v_action := 'account_deactivated';
    ELSIF v_before.status IS DISTINCT FROM v_profile.status
        AND v_profile.status = 'active' THEN
        v_action := 'account_activated';
    ELSIF v_password_changed AND NOT v_profile_changed THEN
        v_action := 'password_changed';
    END IF;

    SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(username), ''), auth.uid()::TEXT)
    INTO v_actor_name
    FROM public.profiles
    WHERE id = auth.uid();

    v_actor_name := COALESCE(v_actor_name, auth.uid()::TEXT);

    v_changes := jsonb_strip_nulls(jsonb_build_object(
        'username',
            CASE WHEN v_before.username IS DISTINCT FROM v_profile.username
                THEN jsonb_build_object('from', v_before.username, 'to', v_profile.username)
            END,
        'full_name',
            CASE WHEN v_before.full_name IS DISTINCT FROM v_profile.full_name
                THEN jsonb_build_object('from', v_before.full_name, 'to', v_profile.full_name)
            END,
        'email',
            CASE WHEN v_before.email IS DISTINCT FROM v_profile.email
                THEN jsonb_build_object('from', v_before.email, 'to', v_profile.email)
            END,
        'role',
            CASE WHEN v_before.role IS DISTINCT FROM v_profile.role
                THEN jsonb_build_object('from', v_before.role::TEXT, 'to', v_profile.role::TEXT)
            END,
        'status',
            CASE WHEN v_before.status IS DISTINCT FROM v_profile.status
                THEN jsonb_build_object('from', v_before.status::TEXT, 'to', v_profile.status::TEXT)
            END,
        'password',
            CASE WHEN v_password_changed
                THEN jsonb_build_object('changed', TRUE)
            END
    ));

    INSERT INTO public.account_activity_logs (
        target_user_id,
        target_username,
        target_full_name,
        target_email,
        target_role,
        target_status,
        action,
        actor_id,
        actor_name,
        details
    )
    VALUES (
        v_profile.id,
        v_profile.username,
        v_profile.full_name,
        v_profile.email,
        v_profile.role::TEXT,
        v_profile.status::TEXT,
        v_action,
        auth.uid(),
        v_actor_name,
        jsonb_build_object('changes', v_changes)
    );

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user_account_without_account_logging(TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_user_account_without_account_logging(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_create_user_account(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user_account(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_user_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

INSERT INTO public.account_activity_logs (
    target_user_id,
    target_username,
    target_full_name,
    target_email,
    target_role,
    target_status,
    action,
    actor_name,
    details,
    created_at
)
SELECT
    id,
    username,
    full_name,
    email,
    role::TEXT,
    status::TEXT,
    'account_created',
    'Existing system record',
    jsonb_build_object('backfilled', TRUE),
    COALESCE(created_at, NOW())
FROM public.profiles profile
WHERE NOT EXISTS (
    SELECT 1
    FROM public.account_activity_logs log
    WHERE log.target_user_id = profile.id
        AND log.action = 'account_created'
);

NOTIFY pgrst, 'reload schema';
