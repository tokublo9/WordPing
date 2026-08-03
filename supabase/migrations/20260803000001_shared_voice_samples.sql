-- One private, service-role-only copy of each fixed Natural AI Voice sample.
-- The cache key includes text, voice, model, speed, format, and content version.
CREATE TABLE public.voice_sample_generations (
  sample_key   text        PRIMARY KEY,
  status       text        NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  storage_path text,
  content_type text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'completed' AND storage_path IS NOT NULL AND content_type IS NOT NULL)
    OR status <> 'completed'
  )
);

ALTER TABLE public.voice_sample_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_sample_generations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.voice_sample_generations TO service_role;

CREATE OR REPLACE FUNCTION public.claim_voice_sample_generation(p_sample_key text)
RETURNS TABLE (claim_status text, storage_path text, content_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.voice_sample_generations (sample_key, status)
  VALUES (p_sample_key, 'processing')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    RETURN QUERY SELECT 'claimed'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.voice_sample_generations
  SET status = 'processing', storage_path = NULL, content_type = NULL,
      created_at = now(), updated_at = now()
  WHERE sample_key = p_sample_key
    AND (status = 'failed' OR (status = 'processing' AND updated_at < now() - interval '2 minutes'));
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    RETURN QUERY SELECT 'claimed'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT g.status, g.storage_path, g.content_type
  FROM public.voice_sample_generations g
  WHERE g.sample_key = p_sample_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_voice_sample_generation(
  p_sample_key text,
  p_storage_path text,
  p_content_type text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.voice_sample_generations
  SET status = 'completed', storage_path = p_storage_path,
      content_type = p_content_type, updated_at = now()
  WHERE sample_key = p_sample_key AND status = 'processing';
$$;

CREATE OR REPLACE FUNCTION public.mark_voice_sample_generation_failed(p_sample_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.voice_sample_generations
  SET status = 'failed', storage_path = NULL, content_type = NULL, updated_at = now()
  WHERE sample_key = p_sample_key;
$$;

REVOKE ALL ON FUNCTION public.claim_voice_sample_generation(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_voice_sample_generation(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_voice_sample_generation_failed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_voice_sample_generation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_voice_sample_generation(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_voice_sample_generation_failed(text) TO service_role;
