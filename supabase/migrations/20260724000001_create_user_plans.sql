-- Stores the billing plan for each authenticated user.
-- This is the server-side source of truth that the openai Edge Function
-- reads before calling OpenAI. Clients may not override it per-request.
--
-- Plan values:
--   'free'    — no OpenAI access
--   'basic'   — AI speech only
--   'premium' — speech + all text AI actions (meaning, breakdown, translation, example)
--
-- Row is written by the client on subscribe / unsubscribe (stub while IAP is not yet
-- integrated). When react-native-purchases (RevenueCat) is added, replace the
-- client-side upsert with a server-side webhook that sets the plan based on a
-- verified purchase receipt.
CREATE TABLE IF NOT EXISTS user_plans (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan       text        NOT NULL DEFAULT 'free'
                         CHECK (plan IN ('free', 'basic', 'premium')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own plan row.
-- Replace with a stricter policy (SELECT only for user, INSERT/UPDATE via service role)
-- once real IAP webhook verification is in place.
CREATE POLICY "users_manage_own_plan" ON user_plans
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
