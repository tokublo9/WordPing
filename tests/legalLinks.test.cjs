const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('the app uses one canonical source for all production legal URLs', () => {
  const urls = read('src/config/legalUrls.ts');
  const settings = read('src/components/SettingsModal.tsx');

  assert.match(urls, /export const LEGAL_URLS = \{\s*privacy: 'https:\/\/word-ping-chi\.vercel\.app\/privacy',\s*terms: 'https:\/\/word-ping-chi\.vercel\.app\/terms',\s*licenses: 'https:\/\/word-ping-chi\.vercel\.app\/licenses',\s*\} as const;/u);
  assert.match(settings, /import \{ LEGAL_URLS \} from '\.\.\/config\/legalUrls';/u);
  assert.match(settings, /openExternal\(LEGAL_URLS\.privacy\)/u);
  assert.match(settings, /openExternal\(LEGAL_URLS\.terms\)/u);
  assert.match(settings, /openExternal\(LEGAL_URLS\.licenses\)/u);
  assert.doesNotMatch(settings, /wordping\.app\/(?:privacy|terms|licen[cs]e)|const (?:PRIVACY|TERMS|LICENSE)_URL/u);
});
