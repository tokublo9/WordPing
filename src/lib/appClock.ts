import { DEV_TIME_OFFSET_MS } from '../dev/timeOffset';

const runtimeIsDevelopment = typeof __DEV__ !== 'undefined' && __DEV__ === true;

/**
 * Applies an offset only for development. Exported separately so the production
 * guard can be covered without changing the source-controlled offset.
 */
export function appNowForEnvironment(
  realNow: number,
  isDevelopment: boolean,
  developmentOffsetMs: number,
): number {
  return realNow + (isDevelopment ? developmentOffsetMs : 0);
}

/** Current time for visibility and due-time comparisons. */
export function appNow(): number {
  return appNowForEnvironment(Date.now(), runtimeIsDevelopment, DEV_TIME_OFFSET_MS);
}
