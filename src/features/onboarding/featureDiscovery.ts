import { planCanUseAI } from '../../lib/aiEntitlement';
import type { PlanTier } from '../../lib/planLimits';

/**
 * The "!" markers on features a new subscription just unlocked.
 *
 * Each marker is an independent, versioned id. Independent because opening the
 * Theme Shop says nothing about whether the user has found the voice picker;
 * versioned because a genuinely new feature later should be able to raise a
 * fresh marker without un-dismissing the ones already seen.
 *
 * A marker is only ever a hint. It never grants anything: entitlement and
 * consent are checked where they always were, and dismissing a marker changes
 * nothing except whether the dot is drawn.
 *
 * Pure — no react-native import — so the visibility and dismissal rules are
 * tested directly.
 */

export const FEATURE_MARKERS = {
  /** Settings → Card Behavior → the AI voice picker row. Basic and Premium. */
  naturalAIVoice: 'natural-ai-voice.v1',
  /** Settings → Help → About AI Voice. Basic and Premium. */
  aboutAIVoice: 'about-ai-voice.v1',
  /** Settings → Theme Shop. Basic and Premium. */
  themeShop: 'theme-shop.v1',
  /**
   * The custom-audio control in the word editor, Premium only.
   *
   * One id for both the Add and the Edit sheet: it is the same control on the
   * same field, so finding it in one is finding it. There is no separate
   * "Voice Select" control in those sheets — this is the only voice control
   * there that a plan unlocks.
   */
  customAudio: 'custom-audio.v1',
} as const;

export type FeatureMarkerId = (typeof FEATURE_MARKERS)[keyof typeof FEATURE_MARKERS];

/**
 * The plan a marker's feature needs.
 *
 * Read from the entitlement configuration rather than restated: the three
 * Basic markers use `planCanUseAI`, which is the same rule the features
 * themselves are gated on, and the Premium one asks for Premium directly.
 */
export function planUnlocksFeature(marker: FeatureMarkerId, plan: PlanTier): boolean {
  return marker === FEATURE_MARKERS.customAudio ? plan === 'premium' : planCanUseAI(plan);
}

export interface MarkerVisibilityInput {
  marker: FeatureMarkerId;
  plan: PlanTier;
  /** Nothing is marked before RevenueCat has answered. */
  isSubscriptionLoaded: boolean;
  /** Ids already dismissed, from storage. */
  seen: ReadonlySet<string>;
}

/**
 * Whether to draw the marker.
 *
 * Three conditions, in the order they matter: the subscription state is known,
 * the plan actually unlocks the feature, and the user has not already found it.
 * A downgrade therefore hides markers immediately without touching what has
 * been seen, and resubscribing does not bring dismissed ones back.
 */
export function shouldShowFeatureMarker(input: MarkerVisibilityInput): boolean {
  if (!input.isSubscriptionLoaded) return false;
  if (!planUnlocksFeature(input.marker, input.plan)) return false;
  return !input.seen.has(input.marker);
}

/** Storage key for the dismissed set. Versioned with its contents. */
export const FEATURE_DISCOVERY_KEY = 'wordping_feature_discovery_v1';

/**
 * Reads the dismissed set.
 *
 * Anything unreadable is an empty set — the cost of getting this wrong is one
 * extra dot, so it fails towards showing rather than towards hiding a feature
 * the user has not seen. Unknown ids are kept, so rolling back a build cannot
 * lose a newer marker's dismissal.
 */
export function parseSeenFeatures(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id !== ''));
  } catch {
    return new Set();
  }
}

export function serializeSeenFeatures(seen: ReadonlySet<string>): string {
  return JSON.stringify([...seen].sort());
}

/** Adds one id. Returns the same set when nothing changed, so callers can skip a write. */
export function markFeatureSeen(seen: ReadonlySet<string>, marker: FeatureMarkerId): Set<string> {
  if (seen.has(marker)) return seen as Set<string>;
  return new Set([...seen, marker]);
}
