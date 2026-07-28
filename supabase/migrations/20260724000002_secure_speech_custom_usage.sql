-- Secure, per-user usage accounting and duplicate protection for standalone
-- Text-to-Speech generations. These objects are service-role only; clients
-- cannot read, insert, update, delete, or execute the accounting RPCs.

-- A client must never be able to grant itself a paid plan.
DROP POLICY IF EXISTS "users_manage_own_plan" ON public.user_plans;
CREATE POLICY "users_read_own_plan" ON public.user_plans
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.user_plans FROM anon, authenticated;
GRANT SELECT ON public.user_plans TO authenticated;

CREATE TABLE public.speech_custom_usage (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_group   text        NOT NULL DEFAULT 'speech_custom'
                             CHECK (action_group = 'speech_custom'),
  request_hash   text        NOT NULL,
  request_count  integer     NOT NULL DEFAULT 1 CHECK (request_count = 1),
  character_count integer    NOT NULL CHECK (character_count > 0),
  status         text        NOT NULL DEFAULT 'reserved'
                             CHECK (status IN ('reserved', 'completed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

CREATE INDEX speech_custom_usage_user_created_idx
  ON public.speech_custom_usage (user_id, created_at DESC);

CREATE TABLE public.speech_custom_generations (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash text        NOT NULL,
  status       text        NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  storage_path text,
  content_type text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_hash),
  CHECK (
    (status = 'completed' AND storage_path IS NOT NULL AND content_type IS NOT NULL)
    OR status <> 'completed'
  )
);

ALTER TABLE public.speech_custom_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speech_custom_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.speech_custom_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.speech_custom_generations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.speech_custom_usage TO service_role;
GRANT ALL ON public.speech_custom_generations TO service_role;

-- Private server-side cache for generated audio. No client storage policies are
-- created; only the Edge Function's service-role client can access these files.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('speech-custom-cache', 'speech-custom-cache', false, 10485760)
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = EXCLUDED.file_size_limit;

CREATE OR REPLACE FUNCTION public.reserve_speech_custom_usage(
  p_user_id uuid,
  p_request_hash text,
  p_character_count integer,
  p_minute_request_limit integer,
  p_daily_request_limit integer,
  p_monthly_request_limit integer,
  p_daily_character_limit integer,
  p_monthly_character_limit integer
)
RETURNS TABLE (reservation_id uuid, error_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_minute_count integer;
  v_daily_count integer;
  v_monthly_count integer;
  v_daily_chars bigint;
  v_monthly_chars bigint;
  v_reservation_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_plans
    WHERE user_id = p_user_id AND plan = 'premium'
  ) THEN
    RETURN QUERY SELECT NULL::uuid, 'premium_required'::text;
    RETURN;
  END IF;

  IF p_character_count <= 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'invalid_input'::text;
    RETURN;
  END IF;

  -- Serialize all reservations for one user. Counts include live reservations,
  -- preventing concurrent requests from racing past any limit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':speech_custom', 0));

  -- Expire abandoned reservations left by a crashed/timed-out Edge invocation.
  DELETE FROM public.speech_custom_usage
  WHERE user_id = p_user_id
    AND status = 'reserved'
    AND created_at < v_now - interval '2 minutes';

  SELECT
    coalesce(sum(request_count) FILTER (WHERE created_at >= v_now - interval '1 minute'), 0),
    coalesce(sum(request_count) FILTER (
      WHERE created_at >= date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ), 0),
    coalesce(sum(request_count) FILTER (
      WHERE created_at >= date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ), 0),
    coalesce(sum(character_count) FILTER (
      WHERE created_at >= date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ), 0),
    coalesce(sum(character_count) FILTER (
      WHERE created_at >= date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ), 0)
  INTO v_minute_count, v_daily_count, v_monthly_count, v_daily_chars, v_monthly_chars
  FROM public.speech_custom_usage
  WHERE user_id = p_user_id
    AND status IN ('reserved', 'completed');

  IF v_minute_count >= p_minute_request_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'rate_limit_exceeded'::text;
  ELSIF v_daily_count >= p_daily_request_limit
     OR v_monthly_count >= p_monthly_request_limit
     OR v_daily_chars + p_character_count > p_daily_character_limit
     OR v_monthly_chars + p_character_count > p_monthly_character_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'usage_limit_exceeded'::text;
  ELSE
    INSERT INTO public.speech_custom_usage (
      user_id, request_hash, character_count
    ) VALUES (
      p_user_id, p_request_hash, p_character_count
    )
    RETURNING id INTO v_reservation_id;
    RETURN QUERY SELECT v_reservation_id, NULL::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_speech_custom_generation(
  p_user_id uuid,
  p_request_hash text
)
RETURNS TABLE (claim_status text, storage_path text, content_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.speech_custom_generations (user_id, request_hash, status)
  VALUES (p_user_id, p_request_hash, 'processing')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    RETURN QUERY SELECT 'claimed'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- A failed or abandoned owner may be atomically replaced by this caller.
  UPDATE public.speech_custom_generations
  SET status = 'processing', storage_path = NULL, content_type = NULL,
      created_at = now(), updated_at = now()
  WHERE user_id = p_user_id
    AND request_hash = p_request_hash
    AND (status = 'failed' OR (status = 'processing' AND updated_at < now() - interval '2 minutes'));
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    RETURN QUERY SELECT 'claimed'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT g.status, g.storage_path, g.content_type
  FROM public.speech_custom_generations g
  WHERE g.user_id = p_user_id AND g.request_hash = p_request_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_speech_custom_usage(p_reservation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.speech_custom_usage
  SET status = 'completed', completed_at = now()
  WHERE id = p_reservation_id AND status = 'reserved';
$$;

CREATE OR REPLACE FUNCTION public.release_speech_custom_usage(p_reservation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.speech_custom_usage
  WHERE id = p_reservation_id AND status = 'reserved';
$$;

REVOKE ALL ON FUNCTION public.reserve_speech_custom_usage(uuid, text, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_speech_custom_generation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_speech_custom_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_speech_custom_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_speech_custom_usage(uuid, text, integer, integer, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_speech_custom_generation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_speech_custom_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_speech_custom_usage(uuid) TO service_role;
