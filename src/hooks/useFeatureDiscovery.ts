import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FEATURE_DISCOVERY_KEY,
  markFeatureSeen,
  parseSeenFeatures,
  serializeSeenFeatures,
  shouldShowFeatureMarker,
  type FeatureMarkerId,
} from '../features/onboarding/featureDiscovery';
import type { PlanTier } from '../lib/planLimits';
import { reportSideEffectFailure } from '../utils/reportSideEffectFailure';

/**
 * The dismissed-feature set, loaded once and written on each dismissal.
 *
 * Kept out of the app-wide settings hooks because nothing else needs it and its
 * lifetime is different: entries are only ever added, never cleared — a
 * downgrade hides markers by entitlement, not by forgetting what was seen, so
 * resubscribing cannot resurrect a dot the user already dismissed.
 */
export interface FeatureDiscovery {
  /** Whether to draw the marker for this feature right now. */
  isNew(marker: FeatureMarkerId): boolean;
  /** Records the feature as found. Idempotent, and writes only on a change. */
  dismiss(marker: FeatureMarkerId): void;
  /**
   * The stored set itself, for the rules that read more than one id.
   *
   * `isNew` answers about one marker under one plan, which is not enough for a
   * sequence — the Notification marker's condition is another id entirely — nor
   * for the milestones the set also carries, which no plan gates and nothing
   * renders. Those rules live in `featureDiscovery.ts` and take the set.
   */
  seen: ReadonlySet<string>;
}

export interface UseFeatureDiscoveryOptions {
  plan: PlanTier;
  isSubscriptionLoaded: boolean;
}

export function useFeatureDiscovery(
  { plan, isSubscriptionLoaded }: UseFeatureDiscoveryOptions,
): FeatureDiscovery {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [hasLoadedSeen, setHasLoadedSeen] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(FEATURE_DISCOVERY_KEY)
      .then(raw => {
        if (!active) return;
        setSeen(parseSeenFeatures(raw));
        setHasLoadedSeen(true);
      })
      // An unreadable set means "nothing dismissed yet", which shows one extra
      // marker rather than hiding a feature the user has not found.
      .catch(() => {
        if (!active) return;
        setSeen(new Set());
        setHasLoadedSeen(true);
      });
    return () => { active = false; };
  }, []);

  const isNew = useCallback(
    (marker: FeatureMarkerId) =>
      shouldShowFeatureMarker({
        marker,
        plan,
        isSubscriptionLoaded: isSubscriptionLoaded && hasLoadedSeen,
        seen,
      }),
    [hasLoadedSeen, isSubscriptionLoaded, plan, seen],
  );

  const dismiss = useCallback((marker: FeatureMarkerId) => {
    setSeen(current => {
      const next = markFeatureSeen(current, marker);
      if (next === current) return current;
      AsyncStorage.setItem(FEATURE_DISCOVERY_KEY, serializeSeenFeatures(next))
        .catch(e => reportSideEffectFailure('featureDiscovery', e));
      return next;
    });
  }, []);

  return { isNew, dismiss, seen };
}
