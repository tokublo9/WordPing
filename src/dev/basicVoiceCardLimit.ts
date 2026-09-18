import { VOICE_LIFETIME_CREDITS } from '../lib/planLimits';

/**
 * In a development or EAS sandbox build, change 10 to a smaller number such as
 * 5 to test the Basic card limit without creating 11 cards. Production builds
 * always use the Worker's real 10-card grant, even if this value stays changed.
 * Each test number gets separate local selection and popup state.
 * This changes the app's cutoff only; the deployed Worker uses its own grant.
 */
export const BASIC_VOICE_CARD_LIMIT_FOR_TESTING = 10;

export function resolveBasicVoiceCardLimit(
  productionLimit: number,
  testingLimit: number,
  isTestBuild: boolean,
): number {
  if (!isTestBuild || !Number.isFinite(testingLimit) || testingLimit < 1) return productionLimit;
  return Math.max(1, Math.min(productionLimit, Math.floor(testingLimit)));
}

const PRODUCTION_LIMIT = VOICE_LIFETIME_CREDITS.basic ?? 0;
const isTestBuild = (typeof __DEV__ !== 'undefined' && __DEV__)
  || process.env.EXPO_PUBLIC_BUILD_PROFILE === 'sandbox';
export const BASIC_VOICE_CARD_LIMIT = resolveBasicVoiceCardLimit(
  PRODUCTION_LIMIT,
  BASIC_VOICE_CARD_LIMIT_FOR_TESTING,
  isTestBuild,
);
export const BASIC_VOICE_TEST_LIMIT_ACTIVE = BASIC_VOICE_CARD_LIMIT !== PRODUCTION_LIMIT;
