export interface RecommendationShareContent {
  title: string;
  message: string;
  url: string;
}

/** Public app copy only: no installation, account, subscription, or card data. */
export function buildRecommendationShareContent(
  localizedCopy: string,
  appStoreUrl: string,
): RecommendationShareContent {
  return {
    title: 'WordCore',
    message: `${localizedCopy}\n${appStoreUrl}`,
    url: appStoreUrl,
  };
}
