-- Scope planning estimate movements, approval deductions, and reversals by
-- planning year so reviewing one year cannot affect another year's budget view.

ALTER TABLE IF EXISTS public.budget_transactions
ADD COLUMN IF NOT EXISTS planning_year INTEGER;

UPDATE public.budget_transactions AS bt
SET planning_year = e.planning_year
FROM public.entries AS e
WHERE bt.entry_id = e.id
  AND bt.planning_year IS NULL;

UPDATE public.budget_transactions
SET planning_year = COALESCE(
    EXTRACT(YEAR FROM created_at)::INTEGER,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
WHERE planning_year IS NULL;

ALTER TABLE IF EXISTS public.budget_transactions
ALTER COLUMN planning_year SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_transactions_planning_year_unit_created_at
ON public.budget_transactions(planning_year, unit, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_budget_transactions_planning_year_entry_id
ON public.budget_transactions(planning_year, entry_id);

CREATE OR REPLACE FUNCTION public.admin_approve_entry(
    p_entry_id UUID,
    p_note TEXT DEFAULT ''
)
RETURNS public.entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_entry public.entries;
    v_updated public.entries;
    v_unit TEXT;
    v_amount NUMERIC(14,2);
    v_actor_name TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only active admins can approve entries.'
            USING ERRCODE = '42501';
    END IF;

    IF p_entry_id IS NULL THEN
        RAISE EXCEPTION 'Entry id is required.'
            USING ERRCODE = '22023';
    END IF;

    LOCK TABLE public.budget_transactions IN SHARE ROW EXCLUSIVE MODE;

    SELECT *
    INTO v_entry
    FROM public.entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entry was not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF lower(trim(v_entry.status::TEXT)) = 'approved' THEN
        RAISE EXCEPTION 'Entry is already approved.'
            USING ERRCODE = '23505';
    END IF;

    SELECT upper(trim(COALESCE(code, name, '')))
    INTO v_unit
    FROM public.units
    WHERE id = v_entry.unit_id;

    IF COALESCE(v_unit, '') = '' THEN
        RAISE EXCEPTION 'Entry unit was not found.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT round(COALESCE(SUM(COALESCE(target_quantity, 0) * COALESCE(v_entry.unit_cost, 0)), 0), 2)
    INTO v_amount
    FROM public.monthly_targets
    WHERE entry_id = p_entry_id;

    SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(username), ''), auth.uid()::TEXT)
    INTO v_actor_name
    FROM public.profiles
    WHERE id = auth.uid();

    v_actor_name := COALESCE(v_actor_name, auth.uid()::TEXT);

    IF v_amount > 0 THEN
        INSERT INTO public.budget_transactions (
            amount,
            type,
            description,
            unit,
            actor_id,
            actor_name,
            entry_id,
            planning_year
        )
        VALUES (
            v_amount,
            'DEDUCTED',
            'Approved plan: ' || COALESCE(v_entry.title_of_activities, 'Untitled entry'),
            v_unit,
            auth.uid(),
            v_actor_name,
            p_entry_id,
            v_entry.planning_year
        );
    END IF;

    UPDATE public.entries
    SET
        status = 'Approved'::public.entry_status,
        admin_comment = COALESCE(p_note, ''),
        review_date = NOW(),
        reviewer_id = auth.uid()
    WHERE id = p_entry_id
    RETURNING * INTO v_updated;

    RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_entry_review_status(
    p_entry_id UUID,
    p_status TEXT,
    p_note TEXT DEFAULT ''
)
RETURNS public.entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_entry public.entries;
    v_updated public.entries;
    v_unit TEXT;
    v_current_amount NUMERIC(14,2);
    v_reversal_amount NUMERIC(14,2);
    v_actor_name TEXT;
    v_next_status public.entry_status;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only active admins can review entries.'
            USING ERRCODE = '42501';
    END IF;

    IF p_entry_id IS NULL THEN
        RAISE EXCEPTION 'Entry id is required.'
            USING ERRCODE = '22023';
    END IF;

    IF p_status NOT IN ('Returned', 'Rejected') THEN
        RAISE EXCEPTION 'Review status must be Returned or Rejected.'
            USING ERRCODE = '22023';
    END IF;

    v_next_status := p_status::public.entry_status;

    LOCK TABLE public.budget_transactions IN SHARE ROW EXCLUSIVE MODE;

    SELECT *
    INTO v_entry
    FROM public.entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entry was not found.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT upper(trim(COALESCE(code, name, '')))
    INTO v_unit
    FROM public.units
    WHERE id = v_entry.unit_id;

    SELECT round(COALESCE(SUM(COALESCE(target_quantity, 0) * COALESCE(v_entry.unit_cost, 0)), 0), 2)
    INTO v_current_amount
    FROM public.monthly_targets
    WHERE entry_id = p_entry_id;

    IF lower(trim(v_entry.status::TEXT)) = 'approved' THEN
        SELECT round(COALESCE(
            SUM(
                CASE
                    WHEN type = 'DEDUCTED' THEN amount
                    WHEN type = 'ADDED' THEN -amount
                    ELSE 0
                END
            ),
            0
        ), 2)
        INTO v_reversal_amount
        FROM public.budget_transactions
        WHERE entry_id = p_entry_id;

        IF v_reversal_amount <= 0 THEN
            v_reversal_amount := v_current_amount;
        END IF;

        SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(username), ''), auth.uid()::TEXT)
        INTO v_actor_name
        FROM public.profiles
        WHERE id = auth.uid();

        v_actor_name := COALESCE(v_actor_name, auth.uid()::TEXT);

        IF v_reversal_amount > 0 THEN
            INSERT INTO public.budget_transactions (
                amount,
                type,
                description,
                unit,
                actor_id,
                actor_name,
                entry_id,
                planning_year
            )
            VALUES (
                v_reversal_amount,
                'ADDED',
                'REVERSAL: "' || COALESCE(v_entry.title_of_activities, 'Untitled entry') ||
                    '" changed from ' || v_entry.status::TEXT || ' to ' || p_status,
                v_unit,
                auth.uid(),
                v_actor_name,
                p_entry_id,
                v_entry.planning_year
            );
        END IF;
    END IF;

    UPDATE public.entries
    SET
        status = v_next_status,
        admin_comment = COALESCE(p_note, ''),
        review_date = NOW(),
        reviewer_id = auth.uid()
    WHERE id = p_entry_id
    RETURNING * INTO v_updated;

    RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_review_entry(
    p_entry_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_entry public.entries;
    v_unit TEXT;
    v_current_amount NUMERIC(14,2);
    v_reversal_amount NUMERIC(14,2);
    v_actor_name TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only active admins can delete entries.'
            USING ERRCODE = '42501';
    END IF;

    IF p_entry_id IS NULL THEN
        RAISE EXCEPTION 'Entry id is required.'
            USING ERRCODE = '22023';
    END IF;

    LOCK TABLE public.budget_transactions IN SHARE ROW EXCLUSIVE MODE;

    SELECT *
    INTO v_entry
    FROM public.entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entry was not found.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT upper(trim(COALESCE(code, name, '')))
    INTO v_unit
    FROM public.units
    WHERE id = v_entry.unit_id;

    SELECT round(COALESCE(SUM(COALESCE(target_quantity, 0) * COALESCE(v_entry.unit_cost, 0)), 0), 2)
    INTO v_current_amount
    FROM public.monthly_targets
    WHERE entry_id = p_entry_id;

    IF lower(trim(v_entry.status::TEXT)) = 'approved' THEN
        SELECT round(COALESCE(
            SUM(
                CASE
                    WHEN type = 'DEDUCTED' THEN amount
                    WHEN type = 'ADDED' THEN -amount
                    ELSE 0
                END
            ),
            0
        ), 2)
        INTO v_reversal_amount
        FROM public.budget_transactions
        WHERE entry_id = p_entry_id;

        IF v_reversal_amount <= 0 THEN
            v_reversal_amount := v_current_amount;
        END IF;

        SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(username), ''), auth.uid()::TEXT)
        INTO v_actor_name
        FROM public.profiles
        WHERE id = auth.uid();

        v_actor_name := COALESCE(v_actor_name, auth.uid()::TEXT);

        IF v_reversal_amount > 0 THEN
            INSERT INTO public.budget_transactions (
                amount,
                type,
                description,
                unit,
                actor_id,
                actor_name,
                entry_id,
                planning_year
            )
            VALUES (
                v_reversal_amount,
                'ADDED',
                'REVERSAL: "' || COALESCE(v_entry.title_of_activities, 'Untitled entry') ||
                    '" deleted after approval',
                v_unit,
                auth.uid(),
                v_actor_name,
                p_entry_id,
                v_entry.planning_year
            );
        END IF;
    END IF;

    UPDATE public.budget_transactions
    SET entry_id = NULL
    WHERE entry_id = p_entry_id;

    DELETE FROM public.entries
    WHERE id = p_entry_id;

    RETURN p_entry_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_unit_planning_budget_stats();

CREATE OR REPLACE FUNCTION public.get_unit_planning_budget_stats(
    p_planning_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
    unit TEXT,
    planning_estimate NUMERIC(14,2),
    approved_total NUMERIC(14,2),
    variance NUMERIC(14,2),
    approved_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
    WITH requester AS (
        SELECT public.is_active_user() AS allowed
    ),
    active_units AS (
        SELECT upper(trim(COALESCE(code, name, ''))) AS unit
        FROM public.units
        WHERE is_active = true
          AND COALESCE(code, name, '') <> ''
    ),
    estimate_movements AS (
        SELECT
            upper(trim(unit)) AS unit,
            round(
                COALESCE(
                    SUM(
                        CASE
                            WHEN type = 'ADDED' THEN amount
                            WHEN type = 'DEDUCTED' THEN -amount
                            ELSE 0
                        END
                    ),
                    0
                ),
                2
            ) AS planning_estimate
        FROM public.budget_transactions
        WHERE entry_id IS NULL
          AND (p_planning_year IS NULL OR planning_year = p_planning_year)
        GROUP BY upper(trim(unit))
    ),
    entry_amounts AS (
        SELECT
            e.id,
            upper(trim(COALESCE(u.code, u.name, ''))) AS unit,
            round(COALESCE(SUM(COALESCE(mt.target_quantity, 0) * COALESCE(e.unit_cost, 0)), 0), 2) AS amount
        FROM public.entries e
        JOIN public.units u ON u.id = e.unit_id
        LEFT JOIN public.monthly_targets mt ON mt.entry_id = e.id
        WHERE lower(trim(e.status::TEXT)) = 'approved'
          AND (p_planning_year IS NULL OR e.planning_year = p_planning_year)
        GROUP BY e.id, u.code, u.name
    ),
    approved_by_unit AS (
        SELECT
            unit,
            round(COALESCE(SUM(amount), 0), 2) AS approved_total,
            COUNT(*) AS approved_count
        FROM entry_amounts
        GROUP BY unit
    )
    SELECT
        u.unit,
        COALESCE(m.planning_estimate, 0)::NUMERIC(14,2) AS planning_estimate,
        COALESCE(a.approved_total, 0)::NUMERIC(14,2) AS approved_total,
        (COALESCE(m.planning_estimate, 0) - COALESCE(a.approved_total, 0))::NUMERIC(14,2) AS variance,
        COALESCE(a.approved_count, 0)::BIGINT AS approved_count
    FROM active_units u
    CROSS JOIN requester r
    LEFT JOIN estimate_movements m ON m.unit = u.unit
    LEFT JOIN approved_by_unit a ON a.unit = u.unit
    WHERE r.allowed
    ORDER BY
        CASE u.unit
            WHEN 'MOR' THEN 1
            WHEN 'LDN' THEN 2
            WHEN 'BKD' THEN 3
            WHEN 'RCU' THEN 4
            ELSE 99
        END,
        u.unit;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_entry(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_entry_review_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_review_entry(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unit_planning_budget_stats(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_approve_entry(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_entry_review_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_review_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unit_planning_budget_stats(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
