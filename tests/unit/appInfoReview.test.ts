import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_STORE_ID, APP_STORE_REVIEW_URL, APP_STORE_URL } from '../../src/config/appStore';
import { requestReview, type NativeReviewApi } from '../../src/features/appInfo/review';
import { buildRecommendationShareContent } from '../../src/features/appInfo/share';

test('both public App Store URLs are derived from the one configured id', () => {
  assert.equal(APP_STORE_ID, '6784470769');
  assert.equal(APP_STORE_URL, 'https://apps.apple.com/app/id6784470769');
  assert.equal(APP_STORE_REVIEW_URL, 'https://apps.apple.com/app/id6784470769?action=write-review');
});

test('review requests prefer the native review API when it is available', async () => {
  const calls: string[] = [];
  const nativeReview: NativeReviewApi = {
    async isAvailableAsync() { calls.push('available'); return true; },
    async requestReview() { calls.push('native'); },
  };
  const opened = await requestReview({
    nativeReview,
    reviewUrl: 'https://apps.apple.com/app/id123?action=write-review',
    async openUrl() { calls.push('url'); },
  });
  assert.equal(opened, true);
  assert.deepEqual(calls, ['available', 'native']);
});

test('an unavailable or failed native prompt falls back to the review URL', async () => {
  const calls: string[] = [];
  const nativeReview: NativeReviewApi = {
    async isAvailableAsync() { return true; },
    async requestReview() { throw new Error('native failed'); },
  };
  const opened = await requestReview({
    nativeReview,
    reviewUrl: 'https://apps.apple.com/app/id123?action=write-review',
    async openUrl(url) { calls.push(url); },
  });
  assert.equal(opened, true);
  assert.deepEqual(calls, ['https://apps.apple.com/app/id123?action=write-review']);
});

test('review reports failure only after both methods fail', async () => {
  const nativeReview: NativeReviewApi = {
    async isAvailableAsync() { throw new Error('native failed'); },
    async requestReview() { throw new Error('not reached'); },
  };
  assert.equal(await requestReview({
    nativeReview,
    reviewUrl: 'https://apps.apple.com/app/id123?action=write-review',
    async openUrl() { throw new Error('url failed'); },
  }), false);
});

test('the recommendation payload contains only public copy and the App Store URL', () => {
  const url = 'https://apps.apple.com/app/id123';
  assert.deepEqual(buildRecommendationShareContent('Try WordCore!', url), {
    title: 'WordCore',
    message: `Try WordCore!\n${url}`,
    url,
  });
});
