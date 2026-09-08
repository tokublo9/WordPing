export interface NativeReviewApi {
  isAvailableAsync(): Promise<boolean>;
  requestReview(): Promise<void>;
}

export interface ReviewRequestDependencies {
  /** Null whenever no in-app review module is present — the case today. */
  nativeReview: NativeReviewApi | null;
  reviewUrl: string;
  openUrl(url: string): Promise<unknown>;
}

/**
 * Prefers the platform review prompt when one exists and otherwise opens the
 * App Store review page, which is always available because the URL is derived
 * from a configured App Store id. Failure is returned only after every method
 * this build actually has was attempted.
 */
export async function requestReview(
  dependencies: ReviewRequestDependencies,
): Promise<boolean> {
  const { nativeReview, reviewUrl, openUrl } = dependencies;
  if (nativeReview !== null) {
    try {
      if (await nativeReview.isAvailableAsync()) {
        await nativeReview.requestReview();
        return true;
      }
    } catch {
      // The public App Store review page is the required second method.
    }
  }

  try {
    await openUrl(reviewUrl);
    return true;
  } catch {
    return false;
  }
}
