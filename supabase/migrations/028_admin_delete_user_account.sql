-- Allow admins to permanently delete deactivated accounts only when no entries
-- are connected to that account.

DO $$
BEGIN
    IF to_regclass('public.account_activity_logs') IS NOT NULL THEN
        ALTER TABLE public.account_activity_logs
        DROP CONSTRAINT IF EXISTS account_activity_logs_action_check;

        ALTER TABLE public.account_activity_logs
        ADD CONSTRAINT account_activity_logs_action_check
        CHECK (
            action IN (
                'account_created',
                'account_updated',
                'account_deactivated',
                'account_activated',
                'password_changed',
                'account_deleted'
            )
        );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user_account(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_profile public.profiles;
    v_actor_name TEXT;
    v_connected_entries INTEGER := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only active admins can delete user accounts.'
            USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User id is required.'
            USING ERRCODE = '22023';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own signed-in account.'
            USING ERRCODE = '23514';
    END IF;

    SELECT *
    INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile was not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_profile.status <> 'deactivated' THEN
        RAISE EXCEPTION 'Only deactivated accounts can be deleted.'
            USING ERRCODE = '23514';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_connected_entries
    FROM public.entries
    WHERE owner_id = p_user_id
        OR reviewer_id = p_user_id;

    IF v_connected_entries > 0 THEN
        RAISE EXCEPTION 'This account still has % connected entr%.',
            v_connected_entries,
            CASE WHEN v_connected_entries = 1 THEN 'y' ELSE 'ies' END
            USING ERRCODE = '23514';
    END IF;

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
        'account_deleted',
        auth.uid(),
        v_actor_name,
        jsonb_build_object(
            'deleted_account', jsonb_build_object(
                'username', v_profile.username,
                'role', v_profile.role::TEXT,
                'status', v_profile.status::TEXT,
                'connected_entries', v_connected_entries
            )
        )
    );

    IF to_regclass('public.budget_transactions') IS NOT NULL THEN
        UPDATE public.budget_transactions
        SET actor_id = NULL
        WHERE actor_id = p_user_id;
    END IF;

    DELETE FROM public.profiles
    WHERE id = p_user_id;

    DELETE FROM auth.identities
    WHERE user_id = p_user_id;

    DELETE FROM auth.users
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'deleted_user_id', p_user_id,
        'deleted_username', v_profile.username,
        'deleted_full_name', v_profile.full_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
