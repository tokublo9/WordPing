-- Server-side rate limiting and duplicate prevention for action: "speech"
-- (AI voice for word-card playback). Uses a separate action group (speech_card)
-- that is independent of speech_custom. The two sets of limits are enforced by
-- entirely different tables and RPCs — a speech request cannot consume
-- speech_custom quota, and vice versa.

CREATE TABLE public.speech_card_usage (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_group    text        NOT NULL DEFAULT 'speech_card'
                              CHECK (action_group = 'speech_card'),
  request_hash    text        NOT NULL,
  request_count   integer     NOT NULL DEFAULT 1 CHECK (request_count = 1),
  character_count integer     NOT NULL CHECK (character_count > 0),
  status          text        NOT NULL DEFAULT 'reserved'
                              CHECK (status IN ('reserved', 'completed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX speech_card_usage_user_created_idx
  ON public.speech_card_usage (user_id, created_at DESC);

-- Tracks in-flight generations to prevent concurrent duplicate calls from
-- generating the same audio more than once. Unlike speech_custom there is no
-- server-side audio cache, so a 'completed' row is re-claimed as 'processing'
-- when a new session requests the same audio (and therefore calls OpenAI again).
CREATE TABLE public.speech_card_generations (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash text        NOT NULL,
  status       text        NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_hash)
);

ALTER TABLE public.speech_card_usage      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speech_card_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.speech_card_usage      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.speech_card_generations FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.speech_card_usage      TO service_role;
GRANT  ALL ON public.speech_card_generations TO service_role;

-- ---------------------------------------------------------------------------
-- claim_speech_card_generation
--
-- Returns 'claimed'     — this invocation owns the generation slot.
-- Returns 'in_progress' — another invocation is already generating this audio;
--                         the caller should return 409 without calling OpenAI.
--
-- Re-claims rows that are failed, completed (no server-side cache to serve),
-- or stale-processing (crashed / timed-out caller, > 2 minutes old).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_speech_card_generation(
  p_user_id      uuid,
  p_request_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.speech_card_generations (user_id, request_hash, status)
  VALUES (p_user_id, p_request_hash, 'processing')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    RETURN 'claimed';
  END IF;

  UPDATE public.speech_card_generations
  SET    status     = 'processing',
         created_at = now(),
         updated_at = now()
  WHERE  user_id      = p_user_id
    AND  request_hash = p_request_hash
    AND  (
           status IN ('failed', 'completed')
           OR (status = 'processing' AND updated_at < now() - interval '2 minutes')
         );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN CASE WHEN v_inserted = 1 THEN 'claimed' ELSE 'in_progress' END;
END;
$$;

-- ---------------------------------------------------------------------------
-- reserve_speech_card_usage
--
-- Atomically enforces per-plan rate and character limits. The Edge Function
-- derives limit values from the verified server-side plan and passes them as
-- parameters; this function never reads or trusts client-supplied plan values.
--
-- Returns (reservation_id, NULL)          on success.
-- Returns (NULL, 'rate_limit_exceeded')   on burst violation.
-- Returns (NULL, 'usage_limit_exceeded')  on daily/monthly violation.
-- Returns (NULL, 'invalid_input')         on bad character count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_speech_card_usage(
  p_user_id                 uuid,
  p_request_hash            text,
  p_character_count         integer,
  p_minute_request_limit    integer,
  p_daily_request_limit     integer,
  p_monthly_request_limit   integer,
  p_daily_character_limit   integer,
  p_monthly_character_limit integer
)
RETURNS TABLE (reservation_id uuid, error_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now            timestamptz := now();
  v_minute_count   integer;
  v_daily_count    integer;
  v_monthly_count  integer;
  v_daily_chars    bigint;
  v_monthly_chars  bigint;
  v_reservation_id uuid;
BEGIN
  IF p_character_count <= 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'invalid_input'::text;
    RETURN;
  END IF;

  -- Serialize all reservations for one user so concurrent requests cannot race
  -- past any limit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':speech_card', 0));

  -- Expire abandoned reservations left by crashed / timed-out Edge invocations.
  DELETE FROM public.speech_card_usage
  WHERE  user_id = p_user_id
    AND  status  = 'reserved'
    AND  created_at < v_now - interval '2 minutes';

  SELECT
    coalesce(sum(request_count) FILTER (WHERE created_at >= v_now - interval '1 minute'), 0),
    coalesce(sum(request_count) FILTER (
      WHERE created_at >= date_trunc('day',   v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ), 0),
    coalesce(sum(request_count) FILTER (
      WHERE created_at >= date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ), 0),
    coalesce(sum(character_count) FILTER (
      WHERE created_at >= date_trunc('day',   v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ), 0),
    coalesce(sum(character_count) FILTER (
      WHERE created_at >= date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ), 0)
  INTO v_minute_count, v_daily_count, v_monthly_count, v_daily_chars, v_monthly_chars
  FROM public.speech_card_usage
  WHERE user_id = p_user_id
    AND status  IN ('reserved', 'completed');

  IF v_minute_count >= p_minute_request_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'rate_limit_exceeded'::text;
  ELSIF v_daily_count   >= p_daily_request_limit
     OR v_monthly_count >= p_monthly_request_limit
     OR v_daily_chars   + p_character_count > p_daily_character_limit
     OR v_monthly_chars + p_character_count > p_monthly_character_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'usage_limit_exceeded'::text;
  ELSE
    INSERT INTO public.speech_card_usage (user_id, request_hash, character_count)
    VALUES (p_user_id, p_request_hash, p_character_count)
    RETURNING id INTO v_reservation_id;
    RETURN QUERY SELECT v_reservation_id, NULL::text;
  END IF;
END;
$$;

-- Mark a reserved slot as consumed. Called only after OpenAI returns 200.
CREATE OR REPLACE FUNCTION public.complete_speech_card_usage(p_reservation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.speech_card_usage
  SET    status       = 'completed',
         completed_at = now()
  WHERE  id     = p_reservation_id
    AND  status = 'reserved';
$$;

-- Release an unused reservation (OpenAI call failed or was never made).
CREATE OR REPLACE FUNCTION public.release_speech_card_usage(p_reservation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.speech_card_usage
  WHERE  id     = p_reservation_id
    AND  status = 'reserved';
$$;

-- Record the final status of a generation so the next caller can re-claim it.
CREATE OR REPLACE FUNCTION public.mark_speech_card_generation_done(
  p_user_id      uuid,
  p_request_hash text,
  p_status       text   -- 'completed' or 'failed'
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.speech_card_generations
  SET    status     = p_status,
         updated_at = now()
  WHERE  user_id      = p_user_id
    AND  request_hash = p_request_hash;
$$;

-- All functions are service-role only. No client (anon or authenticated) may
-- call them directly.
REVOKE ALL ON FUNCTION public.claim_speech_card_generation(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_speech_card_usage(uuid, text, integer, integer, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_speech_card_usage(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_speech_card_usage(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_speech_card_generation_done(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_speech_card_generation(uuid, text)                                           TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_speech_card_usage(uuid, text, integer, integer, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_speech_card_usage(uuid)                                                   TO service_role;
GRANT EXECUTE ON FUNCTION public.release_speech_card_usage(uuid)                                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_speech_card_generation_done(uuid, text, text)                                 TO service_role;
