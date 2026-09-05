import { planCanUseAI } from '../../lib/aiEntitlement';
import { planIsSubscribed, type PlanTier } from '../../lib/planLimits';

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
  /** Settings → Card Behavior → the AI voice picker row. Premium only. */
  naturalAIVoice: 'natural-ai-voice.v1',
  /** Settings → Help → About AI Voice. Premium only. */
  aboutAIVoice: 'about-ai-voice.v1',
  /** Settings → Theme Shop. Basic and Premium. */
  themeShop: 'theme-shop.v1',
  /**
   * The custom-audio control in the word editor. Available on every plan.
   *
   * One id for both the Add and the Edit sheet: it is the same control on the
   * same field, so finding it in one is finding it. There is no separate
   * "Voice Select" control in those sheets — this is the only voice control
   * there.
   */
  customAudio: 'custom-audio.v1',
  /** Settings → Upgrade Plan. Marked on every plan; a subscriber may still move. */
  upgradePlan: 'upgrade-plan.v1',
  /**
   * The Word List header's Test icon.
   *
   * Its marker replaces the remaining-word count rather than sitting beside it,
   * so the corner says one thing at a time — see `TestStatusIcon`.
   */
  testIcon: 'test-icon.v1',
  /**
   * The Word List header's Notification icon.
   *
   * Second in a sequence: it is withheld until `firstTestExited` is recorded,
   * so the two markers are never competing for the same header.
   */
  notificationIcon: 'notification-icon.v1',
  /** Notification sheet's Send Test button. Independent of the header icon. */
  sendTest: 'send-test.v1',
  /**
   * Not a marker of its own — a milestone, kept in the same set because the set
   * is exactly "ids this install has reached, once and permanently".
   *
   * Recorded when the Word List is on screen and the Test icon has already been
   * tapped, which is the same condition whether the user left the test normally
   * or force-quit inside it. Nothing renders it.
   */
  firstTestExited: 'first-test-exited.v1',
  /** Hide Front Word, beside the Word field's label. Every plan. */
  hideWord: 'hide-word.v1',
  /** Add to Notifications, under the Note field. Editing only, every plan. */
  notifyWord: 'notify-word.v1',
  /** Bulk Import, in the Add sheet's header. Every plan. */
  bulkImport: 'bulk-import.v1',
} as const;

export type FeatureMarkerId = (typeof FEATURE_MARKERS)[keyof typeof FEATURE_MARKERS];

/**
 * The plan a marker's feature needs.
 *
 * Read from each feature's own access rule rather than restated, so a marker
 * can never point at something the plan cannot open. The two AI voice markers
 * ride on `planCanUseAI`, the Theme Shop remains a paid feature, and Custom
 * Voice is available to every plan.
 */
export function planUnlocksFeature(marker: FeatureMarkerId, plan: PlanTier): boolean {
  switch (marker) {
    // Controls every plan already has: the word editor's own, Bulk Import, the
    // two Word List header icons, Send Test, and Upgrade Plan — which is the one
    // place a Free user most needs to find, so gating its marker on a plan would
    // hide it from exactly the people it is for.
    case FEATURE_MARKERS.hideWord:
    case FEATURE_MARKERS.notifyWord:
    case FEATURE_MARKERS.bulkImport:
    case FEATURE_MARKERS.upgradePlan:
    case FEATURE_MARKERS.testIcon:
    case FEATURE_MARKERS.notificationIcon:
    case FEATURE_MARKERS.sendTest:
    case FEATURE_MARKERS.firstTestExited:
    case FEATURE_MARKERS.customAudio:
      return true;
    case FEATURE_MARKERS.themeShop:
      return planIsSubscribed(plan);
    default:
      return planCanUseAI(plan);
  }
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

/**
 * The Test icon's marker, which stands in place of the remaining-word count.
 *
 * The same rule as any other marker. It is named here only because the icon it
 * belongs to has to choose between two things to draw, and that choice reads
 * better as one question than as a marker check spelled out at the call site.
 */
export function shouldShowTestMarker(input: Omit<MarkerVisibilityInput, 'marker'>): boolean {
  return shouldShowFeatureMarker({ ...input, marker: FEATURE_MARKERS.testIcon });
}

/**
 * The Notification icon's marker: second in the sequence, and only second.
 *
 * The extra condition is the whole point of the flow. Tapping Test is not
 * enough — the user is inside the test at that moment, and a marker appearing
 * on a header they cannot see would be spent by the time they returned. It
 * waits for `firstTestExited`, which is recorded once the Word List is on
 * screen again, so a normal exit and a force-quit inside the first test arrive
 * here identically.
 */
export function shouldShowNotificationMarker(input: Omit<MarkerVisibilityInput, 'marker'>): boolean {
  if (!input.seen.has(FEATURE_MARKERS.firstTestExited)) return false;
  return shouldShowFeatureMarker({ ...input, marker: FEATURE_MARKERS.notificationIcon });
}

/**
 * Whether the first Test session has been opened and left, and therefore
 * whether the milestone is due to be recorded.
 *
 * Deliberately not "the test was closed": it is true on the next launch after a
 * force-quit as well, because the session was opened and is no longer open.
 * Recording it is idempotent, so the effect that calls this may fire on every
 * render without writing more than once.
 */
export function hasExitedFirstTest(seen: ReadonlySet<string>, isTestModeOpen: boolean): boolean {
  return !isTestModeOpen && seen.has(FEATURE_MARKERS.testIcon);
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
