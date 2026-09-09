import { isThemeUnlockOverrideEnabled } from '../features/themes/themeAccess';

/**
 * TEMPORARY, DEVELOPMENT-ONLY: unlock every theme for Simulator recording.
 *
 * WHY THIS EXISTS. The Theme Shop's paid themes need to be on screen to be
 * recorded, and none of the real routes to them work on a Simulator: the App
 * Store sandbox cannot buy there, and driving RevenueCat's Test Store means a
 * real purchase flow with real entitlements. This is a display-and-selection
 * override and nothing more — it buys nothing, grants no plan, and touches no
 * receipt.
 *
 * WHAT IT DOES NOT DO, deliberately:
 *
 *  - It does not change the effective plan. `useSubscription` still reports
 *    whatever RevenueCat says, so Basic's 200 AI Voice credits, Premium's
 *    unlimited voice, Backup, Hide Word and Custom Voice are all exactly as
 *    they were. Only theme access moves.
 *  - It does not write ownership. `ownedEntitlementIds` is receipt-backed and
 *    is never touched here, so no theme is ever recorded as bought and nothing
 *    survives turning the flag back off.
 *  - It does not call RevenueCat. No purchase, no restore, no configure — this
 *    module imports nothing from the SDK and nothing from the network.
 *  - It does not unlock theme *colours*. Free is still blue-only; the
 *    enforcement in App.tsx for `themeColor` is untouched. Only skins unlock.
 *
 * The RevenueCat Test Store switch (`src/features/purchases/revenueCatKey.ts`)
 * is left in place and unused by this. It remains the right tool for recording
 * a real *purchase* flow; this is the right tool for recording themes.
 *
 * ── TO RECORD ────────────────────────────────────────────────────────────────
 *
 * Change the one line below to `true`, save, and reload the app in the
 * Simulator. Change it back to `false` when you are done. That is the whole
 * procedure — no environment variable, no rebuild, no store account.
 *
 * `npm run preflight` fails with a blocking error while it is `true`, so a
 * production build cannot be made without noticing.
 */
export const FORCE_UNLOCK_ALL_THEMES = false;

/**
 * Whether the override applies right now.
 *
 * `__DEV__` is read here and nowhere else, and it is `&&`, not `||`. A release
 * bundle has `__DEV__` false, so the flag being left `true` changes nothing
 * there — which is asserted directly in tests/unit/themeAccess.test.ts by
 * calling `isThemeUnlockOverrideEnabled(false, true)`.
 */
export function themeUnlockOverrideActive(): boolean {
  return isThemeUnlockOverrideEnabled(__DEV__, FORCE_UNLOCK_ALL_THEMES);
}
