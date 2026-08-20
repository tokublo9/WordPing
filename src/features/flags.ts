/**
 * Build-time feature flags.
 *
 * Every flag here is a product decision, not a plan or entitlement check.
 * Entitlements live in features/backup/backupAccess.ts and are verified
 * server-side by the Worker — never gate a paid feature with a flag from here.
 */

/**
 * The four GPT-backed text features: AI Meaning, AI Translation, AI Breakdown
 * and AI Example.
 *
 * TEMPORARILY HIDDEN FOR RELEASE. This is a product decision, not a removal:
 * the client helpers (lib/generateMeaning.ts), the API client, the Worker
 * routes and every test for them are all intact, and vocabulary that already
 * contains AI-generated meanings or notes keeps rendering normally — that text
 * is stored in ordinary word fields, not in anything gated by this flag.
 *
 * Flip to `true` to bring them back. Everything that shows or promotes them
 * derives its visibility from this one constant, so there is a single place to
 * change and nothing to hunt for:
 *
 *   - WordModal          the generate / translate controls on a word
 *   - SettingsModal      the "Hide AI" preference row (meaningless while hidden)
 *   - ProSheet           the promo sections and the plan comparison rows
 *
 * The user's saved "Hide AI" preference is untouched while hidden, so it still
 * applies the moment this is re-enabled.
 */
export const AI_TEXT_FEATURES_ENABLED = false;

/**
 * Standalone Text-to-Speech.
 *
 * TEMPORARILY HIDDEN FROM THE APP. The screen, saved audio/history, client
 * implementation, translations and Worker route remain intact. Flip this to
 * `true` to restore the folder-header entry point and both Upgrade Plan rows.
 */
export const TEXT_TO_SPEECH_ENABLED = false;

/**
 * Links every Test Mode grade to card visibility. The former Settings toggle
 * is intentionally dormant; keep the grading option itself so configurability
 * can be restored later without rebuilding the grading rules.
 */
export const SYNC_WITH_TEST_RESULTS_ENABLED = true;

/** Feature keys of the four hidden text features, as used by the paywall. */
export const AI_TEXT_FEATURE_KEYS = ['meaning', 'example', 'translate', 'breakdown'] as const;

export type AiTextFeatureKey = (typeof AI_TEXT_FEATURE_KEYS)[number];

export function isAiTextFeatureKey(key: string): key is AiTextFeatureKey {
  return (AI_TEXT_FEATURE_KEYS as readonly string[]).includes(key);
}

/**
 * Drops AI-text entries from a list while the flag is off.
 *
 * Used for both the paywall promo sections and the plan comparison rows so the
 * two cannot fall out of step. `enabled` is injectable purely so tests can
 * prove the entries are hidden when off and intact when on — production callers
 * pass nothing and get the flag.
 */
export function filterAiTextEntries<T>(
  items: readonly T[],
  isAiText: (item: T) => boolean,
  enabled: boolean = AI_TEXT_FEATURES_ENABLED,
): T[] {
  return enabled ? [...items] : items.filter(item => !isAiText(item));
}

/** Drops Text-to-Speech entries while retaining their source definitions. */
export function filterTextToSpeechEntries<T>(
  items: readonly T[],
  isTextToSpeech: (item: T) => boolean,
  enabled: boolean = TEXT_TO_SPEECH_ENABLED,
): T[] {
  return enabled ? [...items] : items.filter(item => !isTextToSpeech(item));
}
