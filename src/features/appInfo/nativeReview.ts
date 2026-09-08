import { requireOptionalNativeModule } from 'expo-modules-core';

import type { NativeReviewApi } from './review';

/**
 * expo-store-review is not a dependency of this app, and this module is the
 * reason its absence is harmless: the native module is looked up **by name at
 * runtime**, so there is no static import and no `require('expo-store-review')`
 * for Metro to resolve. A bundle built without the package resolves this to
 * null and "Write a Review" opens the public App Store review URL instead.
 *
 * Adding the package later needs no change here — the lookup starts returning
 * the module and `requestReview` prefers the in-app prompt on its own.
 */
const nativeModule = requireOptionalNativeModule<Partial<NativeReviewApi>>('ExpoStoreReview');

/**
 * Both methods are checked because a host that ships a differently shaped
 * `ExpoStoreReview` must fall back to the URL rather than throw at the call.
 */
export const nativeReviewApi: NativeReviewApi | null =
  nativeModule
  && typeof nativeModule.isAvailableAsync === 'function'
  && typeof nativeModule.requestReview === 'function'
    ? (nativeModule as NativeReviewApi)
    : null;
