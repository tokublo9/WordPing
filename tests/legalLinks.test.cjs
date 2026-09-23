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
  assert.match(upgrade, /<View style=\{s\.legalLinkRow\}>\s*\{showJapanCommerceDisclosure && \([\s\S]*?openExternal\(LEGAL_URLS\.commercialTransactions\)[\s\S]*?特定商取引法に基づく表記[\s\S]*?setAboutAIVoiceVisible\(true\)[\s\S]*?t\('ai_voice_info_menu'\)/u);
  assert.match(upgrade, /getLocales\(\)\[0\]\?\.regionCode/u);
  assert.doesNotMatch(upgrade, /wordping\.app\/(?:privacy|terms|licen[cs]e)|const (?:PRIVACY|TERMS|LICENSE)_URL/u);
});

test('Upgrade Plan always links to read-only About AI Voice beside the regional disclosure', () => {
  const upgrade = read('src/components/ProSheet.tsx');
  const dialog = read('src/components/AboutAIVoiceDialog.tsx');

  // The Japan-only button is conditional; About AI Voice is its unconditional
  // sibling, so it fills that row by itself outside Japan.
  const secondaryRow = upgrade.slice(
    upgrade.indexOf('<View style={s.legalLinkRow}>', upgrade.indexOf("t('terms_of_service')")),
    upgrade.indexOf('</View>', upgrade.indexOf('setAboutAIVoiceVisible(true)')),
  );
  assert.match(secondaryRow, /showJapanCommerceDisclosure && \(/u);
  assert.match(secondaryRow, /setAboutAIVoiceVisible\(true\)/u);
  assert.ok(
    secondaryRow.indexOf('特定商取引法に基づく表記') < secondaryRow.indexOf("t('ai_voice_info_menu')"),
    'About AI Voice must be to the right of the Japan disclosure',
  );

  assert.match(upgrade, /<AboutAIVoiceDialog[\s\S]{0,300}showPermissionAction=\{false\}/u);
  assert.match(upgrade, /setAboutAIVoiceVisible\(false\);\s*stopPlayback\(\);/u);
  assert.match(dialog, /showPermissionAction = true/u);
  assert.match(dialog, /\{showPermissionAction && \(\s*<TouchableOpacity/u);
  assert.match(dialog, /showPermissionAction \? \([\s\S]*?t\('ai_voice_info_body'\)[\s\S]*?: \([\s\S]*?t\('ai_consent_body'\)/u);
});
