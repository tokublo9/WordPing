const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('the app uses one canonical source for all production legal URLs', () => {
  const urls = read('src/config/legalUrls.ts');
  const settings = read('src/components/SettingsModal.tsx');
  const upgrade = read('src/components/ProSheet.tsx');

  assert.match(urls, /export const LEGAL_URLS = \{\s*privacy: 'https:\/\/word-ping-chi\.vercel\.app\/privacy',\s*terms: 'https:\/\/word-ping-chi\.vercel\.app\/terms',\s*licenses: 'https:\/\/word-ping-chi\.vercel\.app\/licenses',\s*commercialTransactions: 'https:\/\/word-ping-chi\.vercel\.app\/ja\/commercial-transactions',\s*\} as const;/u);
  assert.match(settings, /import \{ LEGAL_URLS \} from '\.\.\/config\/legalUrls';/u);
  assert.match(settings, /openExternal\(LEGAL_URLS\.privacy\)/u);
  assert.match(settings, /openExternal\(LEGAL_URLS\.terms\)/u);
  assert.match(settings, /openExternal\(LEGAL_URLS\.licenses\)/u);
  assert.doesNotMatch(settings, /wordping\.app\/(?:privacy|terms|licen[cs]e)|const (?:PRIVACY|TERMS|LICENSE)_URL/u);
  assert.match(upgrade, /import \{ LEGAL_URLS \} from '\.\.\/config\/legalUrls';/u);
  assert.match(upgrade, /t\('sub_info_manage'\)[\s\S]*?openExternal\(LEGAL_URLS\.privacy\)[\s\S]*?t\('privacy_policy'\)[\s\S]*?openExternal\(LEGAL_URLS\.terms\)[\s\S]*?t\('terms_of_service'\)/u);
  assert.match(upgrade, /showJapanCommerceDisclosure && \([\s\S]*?openExternal\(LEGAL_URLS\.commercialTransactions\)[\s\S]*?特定商取引法に基づく表記/u);
  assert.match(upgrade, /getLocales\(\)\[0\]\?\.regionCode/u);
  assert.doesNotMatch(upgrade, /wordping\.app\/(?:privacy|terms|licen[cs]e)|const (?:PRIVACY|TERMS|LICENSE)_URL/u);
});
