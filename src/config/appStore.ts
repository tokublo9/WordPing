/**
 * WordCore's public App Store identity.
 *
 * The numeric App Store id is written once here and every public URL is derived
 * from it, so review and sharing code never carries a second copy that could
 * drift. Nothing in this module is a secret: these are the same addresses the
 * App Store serves to anyone.
 */
export const APP_STORE_ID = '6784470769';

/** The public product page. */
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/** The same page, opened straight onto its review composer. */
export const APP_STORE_REVIEW_URL = `${APP_STORE_URL}?action=write-review`;
