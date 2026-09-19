import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowJapanCommerceDisclosure } from '../../src/lib/japanCommerceDisclosure';

test('Japanese device region shows the commercial disclosure before prices load', () => {
  assert.equal(shouldShowJapanCommerceDisclosure('JP', {}), true);
  assert.equal(shouldShowJapanCommerceDisclosure('jp', {}), true);
});

test('a Japanese App Store price shows the disclosure even with another UI region', () => {
  assert.equal(shouldShowJapanCommerceDisclosure('US', {
    premium: {
      packageId: 'premium',
      productId: 'com.wordping.premium.monthly',
      priceString: '¥600',
      currencyCode: 'JPY',
      period: 'P1M',
    },
  }), true);
});

test('non-Japanese device and storefront keep the disclosure hidden', () => {
  assert.equal(shouldShowJapanCommerceDisclosure('US', {
    basic: {
      packageId: 'basic',
      productId: 'com.wordping.basic.monthly',
      priceString: '$2.99',
      currencyCode: 'USD',
      period: 'P1M',
    },
  }), false);
  assert.equal(shouldShowJapanCommerceDisclosure(null, {}), false);
});
