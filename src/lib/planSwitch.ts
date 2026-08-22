/**
 * Plan ordering and renewal-date formatting for the plan-switch UI.
 *
 * Pure — no react-native import — so the ordering and the date formatting are
 * unit-tested rather than checked by staring at the paywall.
 */

export type PlanTier = 'free' | 'basic' | 'premium';

/**
 * Tier ordering, mirroring the Worker's TIER_RANK in
 * cloudflare/wordping-api/src/entitlements.ts.
 *
 * IMPORTANT: this must stay in sync with the subscription **level ordering in
 * App Store Connect** (group "WordPing Monthly": Premium = Level 1, Basic =
 * Level 2 — a lower level number is the higher tier). StoreKit decides on its
 * own whether a switch is an immediate upgrade or a deferred downgrade, using
 * those levels, and the app has no way to read them at runtime. If the ASC
 * levels are ever changed, this map has to change with them or the deferred-
 * start notice will describe behaviour the store is not producing.
 *
 * This is a known, accepted tradeoff: there is no runtime source of truth for it.
 */
export const PLAN_RANK: Readonly<Record<PlanTier, number>> = {
  free: 0,
  basic: 1,
  premium: 2,
};

/**
 * Whether moving from `current` to `target` is a downgrade.
 *
 * Only a downgrade defers to the next renewal. An upgrade takes effect at once
 * and must not show the deferred-start notice, and switching to the plan already
 * held is not a switch at all.
 */
export function isDowngrade(current: PlanTier, target: PlanTier): boolean {
  return PLAN_RANK[target] < PLAN_RANK[current];
}

/**
 * A renewal date in the locale's own long form — "2026年9月22日" for Japanese.
 *
 * Returns null rather than a partial string when there is nothing usable to
 * show, so the caller can drop the whole notice instead of rendering a sentence
 * with a blank or an ISO timestamp where the date belongs.
 */
export function formatSubscriptionDate(
  expirationDate: string | null | undefined,
  language: string,
): string | null {
  if (typeof expirationDate !== 'string' || expirationDate === '') return null;
  const parsed = new Date(expirationDate);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return parsed.toLocaleDateString(language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    // An unsupported locale tag must not take the notice down with it.
    return expirationDate.slice(0, 10);
  }
}

/**
 * Whether the deferred-start notice should be shown at all.
 *
 * Requires both a lower tier to move to and a date to name. Without the date the
 * sentence would have to fall back to vague wording, which is worse than saying
 * nothing on a screen that is already dense.
 */
export function shouldShowDeferredSwitchNotice(
  current: PlanTier,
  target: PlanTier,
  formattedDate: string | null,
): boolean {
  return formattedDate !== null && isDowngrade(current, target);
}
