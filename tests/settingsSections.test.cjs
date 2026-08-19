const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

// ── Backup gating ────────────────────────────────────────────────────────────

test('Free users see no Backup section at all — no locked row, badge or prompt', () => {
  const section = read('src/components/BackupSection.tsx');
  // Renders nothing at all when not entitled: no locked state to leak.
  assert.match(section, /if \(!unlocked\) return null;/u);
  assert.doesNotMatch(section, /backup_locked_desc|backup_locked_badge|lock-closed-outline/u);
  assert.doesNotMatch(section, /onRequestSubscription|BACKUP_PAYWALL_SOURCE/u);

  // The heading and divider are gated on the same check, so no empty section.
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(settings, /const backupVisible = canUseBackup\(\{ isSubscribed, isSubscriptionLoaded \}\);/u);
  assert.match(settings, /\{backupVisible && \(\s*<>\s*<View style=\{\[styles\.divider/u);
});

test('handler-level access still rejects an unentitled caller', () => {
  const section = read('src/components/BackupSection.tsx');
  // Kept even though the section is not rendered: a stale callback or a queued
  // Alert action must not be able to read or overwrite the user's data.
  assert.match(section, /const ensureEntitled = useCallback\(\(\): boolean => unlocked, \[unlocked\]\);/u);
  assert.match(section, /const runExport = useCallback\(async \(\) => \{\s*if \(!ensureEntitled\(\)\) return;/u);
  assert.match(section, /const runImport = useCallback\(async \(\) => \{\s*if \(!ensureEntitled\(\)\) return;/u);
  assert.match(section, /const applyImport = useCallback\(async \(raw: unknown, mode: ImportMode\) => \{[\s\S]*?if \(!ensureEntitled\(\)\) return;/u);
  // resolveBackupAccess remains the single source of truth.
  assert.match(section, /canUseBackup\(\{ isSubscribed, isSubscriptionLoaded \}\)/u);
});

test('Backup lives in App Info, not on the main Settings screen, and appears once', () => {
  const settings = read('src/components/SettingsModal.tsx');
  assert.equal((settings.match(/<BackupSection/gu) ?? []).length, 1, 'exactly one Backup section');

  // It sits inside AppInfoSheet, after the Purchases section.
  const appInfoStart = settings.indexOf('function AppInfoSheet');
  const backupAt = settings.indexOf('<BackupSection');
  const purchasesAt = settings.indexOf("t('purchases_section')");
  assert.ok(backupAt > appInfoStart, 'Backup must be inside AppInfoSheet');
  assert.ok(backupAt > purchasesAt, 'Backup must come after Purchases');

  // And not in the main Settings ScrollView, which ends before AppInfoSheet.
  const mainScreen = settings.slice(0, appInfoStart);
  assert.doesNotMatch(mainScreen, /<BackupSection/u);
  assert.doesNotMatch(mainScreen, /\{t\('backup'\)\}/u);
});

test('Restore Purchases stays visible to Free users and outside the backup gate', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const appInfo = settings.slice(settings.indexOf('function AppInfoSheet'));
  const restoreAt = appInfo.indexOf("t('restore_purchases')");
  const backupGateAt = appInfo.indexOf('{backupVisible &&');
  assert.ok(restoreAt > 0 && backupGateAt > 0);
  assert.ok(restoreAt < backupGateAt, 'Restore must sit before, and outside, the backup gate');
  assert.doesNotMatch(read('src/components/BackupSection.tsx'), /restore_purchases|onRestore/u);
});

// ── How to Use removal ───────────────────────────────────────────────────────

test('"How to use WordPing" is gone, along with its dead code', () => {
  const settings = read('src/components/SettingsModal.tsx');
  assert.doesNotMatch(settings, /how_to_use|TutorialModal|tutorialVisible/u);

  // The component existed only for this item.
  assert.equal(fs.existsSync('src/components/TutorialModal.tsx'), false);

  // No source file references it, and its orphaned keys are gone from i18n.
  const i18n = read('src/i18n.ts');
  assert.doesNotMatch(i18n, /'how_to_use'|how_to_use:/u);
  assert.doesNotMatch(i18n, /'got_it'|got_it:/u);
});

// ── Announcements ────────────────────────────────────────────────────────────

test('Announcements opens the Announcements screen', () => {
  const settings = read('src/components/SettingsModal.tsx');

  assert.match(settings, /label=\{t\('announcements'\)\}[\s\S]{0,80}onPress=\{\(\) => setAnnouncementsVisible\(true\)\}/u);
  assert.match(settings, /<AnnouncementsSheet\s+visible=\{announcementsVisible\}/u);
  assert.match(settings, /onClose=\{\(\) => setAnnouncementsVisible\(false\)\}/u);
  assert.match(settings, /import \{ AnnouncementsSheet \} from '\.\/AnnouncementsSheet';/u);
});

test('the Announcements screen matches the Settings sub-screen conventions', () => {
  const sheet = read('src/components/AnnouncementsSheet.tsx');

  // Same back-chevron dismissal and header as AppInfoSheet.
  assert.match(sheet, /name="chevron-back"/u);
  assert.match(sheet, /accessibilityRole="header"/u);
  assert.match(sheet, /\{t\('announcements'\)\}/u);
  // Safe area, theming and accessibility.
  assert.match(sheet, /useSafeAreaInsets\(\)/u);
  assert.match(sheet, /paddingTop: insets\.top/u);
  assert.match(sheet, /paddingBottom: insets\.bottom/u);
  assert.match(sheet, /backgroundColor: pal\.bg/u);
  assert.match(sheet, /accessibilityLabel=\{t\('close'\)\}/u);
  // No remote data source.
  assert.doesNotMatch(sheet, /fetch\(|axios|http/u);
});

test('the empty state copy is shown when there are no announcements', () => {
  const sheet = read('src/components/AnnouncementsSheet.tsx');
  assert.match(sheet, /items\.length === 0 \? \(/u);
  assert.match(sheet, /t\('announcements_empty_title'\)/u);
  assert.match(sheet, /t\('announcements_empty_desc'\)/u);

  const i18n = read('src/i18n.ts');
  assert.match(i18n, /announcements_empty_title: 'No announcements yet'/u);
  assert.match(i18n, /announcements_empty_desc:  'Updates and important information from WordPing will appear here\.'/u);
  assert.match(i18n, /announcements_empty_title: 'お知らせはまだありません'/u);
  assert.match(i18n, /announcements_empty_desc:  'WordPingのアップデートや重要なお知らせがここに表示されます。'/u);
});

test('the screen renders supplied announcements instead of the empty state', () => {
  const sheet = read('src/components/AnnouncementsSheet.tsx');
  // Injectable list, ordered and validated by the shared helper.
  assert.match(sheet, /announcements\?: readonly Announcement\[\];/u);
  assert.match(sheet, /visibleAnnouncements\(announcements\)/u);
  assert.match(sheet, /items\.map\(item => \(/u);
  assert.match(sheet, /key=\{item\.id\}/u);
});

// ── Translations ─────────────────────────────────────────────────────────────

test('backup and announcement copy is translated in English and Japanese', () => {
  const i18n = read('src/i18n.ts');
  assert.match(i18n, /backup:                'Backup & Restore',/u);
  assert.match(i18n, /backup_desc:           'Export or restore your WordPing data\.',/u);

  assert.match(i18n, /backup:                'バックアップと復元',/u);
  assert.match(i18n, /backup_desc:           'WordPingのデータをエクスポートまたは復元できます。',/u);
  // The locked-state copy was removed with the locked UI: Free users see no
  // Backup section at all now, so there is nothing to describe.
  assert.doesNotMatch(i18n, /backup_locked_desc|backup_locked_badge/u);
});

// ── The release-blocking transaction safety must survive ─────────────────────

test('gating did not weaken the exclusive backup import', () => {
  assert.match(read('src/lib/backup/backupFile.ts'), /return runExclusive\(\(\) => importBackup\(db, raw/u);
  assert.match(read('src/lib/db.ts'), /export async function runExclusive<T>/u);
});

// ── Temporarily hidden AI text features ──────────────────────────────────────

test('one central flag drives every AI text feature', () => {
  const flags = read('src/features/flags.ts');
  assert.match(flags, /export const AI_TEXT_FEATURES_ENABLED = false;/u);
  // The comment explaining the temporary hide must survive refactors.
  assert.match(flags, /TEMPORARILY HIDDEN FOR RELEASE/u);

  // Every consumer derives from the flag; no scattered hardcoded false.
  for (const path of [
    'src/components/WordModal.tsx',
    'src/components/SettingsModal.tsx',
    'src/components/ProSheet.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /from '\.\.\/features\/flags'/u, `${path} must import the central flag`);
  }
});

test('all four AI text entry points are hidden in the word editor', () => {
  const modal = read('src/components/WordModal.tsx');

  // A single derived condition gates every control.
  assert.match(modal, /const aiTextVisible = AI_TEXT_FEATURES_ENABLED && isPremium && !hideAiTools;/u);
  // That derivation is the only place the old condition survives, so no AI
  // control can bypass the flag by testing isPremium directly.
  assert.equal((modal.match(/isPremium && !hideAiTools/gu) ?? []).length, 1);

  // Generate meaning, generate example, breakdown and both translate controls.
  for (const handler of ['handleGenerate', 'handleGenerateExample', 'handleTranslateMeaning', 'handleTranslateNote']) {
    assert.match(modal, new RegExp(`onPress=\\{${handler}\\}`, 'u'), `${handler} must still exist`);
  }
  assert.equal((modal.match(/\{aiTextVisible/gu) ?? []).length >= 4, true, 'every AI block is gated');
});

test('the AI implementation is intact and only hidden', () => {
  // Client helpers, API client, Worker routes and their tests all remain.
  const generate = read('src/lib/generateMeaning.ts');
  assert.match(generate, /generateMeaning|generateBreakdown|generateExample|translateText/u);
  assert.match(read('src/lib/openaiGateway.ts'), /requestAIText/u);
  assert.match(read('src/lib/api/client.ts'), /'\/v1\/meaning'|'\/v1\/breakdown'|'\/v1\/translate'|'\/v1\/examples'/u);
  for (const route of ['/v1/meaning', '/v1/breakdown', '/v1/translate', '/v1/examples']) {
    assert.match(read('cloudflare/wordping-api/src/index.ts'), new RegExp(route.replace(/\//gu, '\\/'), 'u'));
  }
});

test('previously generated AI content is never deleted', () => {
  // AI output is written into ordinary word fields, so nothing about hiding the
  // controls touches stored data.
  const repositories = read('src/lib/sqlite/repositories.ts');
  assert.doesNotMatch(repositories, /AI_TEXT_FEATURES_ENABLED|aiText/u);
  assert.doesNotMatch(read('src/lib/db.ts'), /AI_TEXT_FEATURES_ENABLED/u);
  // The schema still stores meaning and note.
  assert.match(read('src/lib/sqlite/schema.ts'), /meaning\s+TEXT\s+NOT NULL/u);
  assert.match(read('src/lib/sqlite/schema.ts'), /CREATE TABLE IF NOT EXISTS notes/u);
});

test('the "Hide AI" settings row is hidden without leaving a gap', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // Gated, not deleted: the preference and its translations still exist.
  assert.match(settings, /\{AI_TEXT_FEATURES_ENABLED && isPremium && \(\s*<ToggleRow\s*label=\{t\('hide_ai_tools'\)\}/u);
  // ToggleRow owns its own spacing, so rendering nothing leaves no empty row.
  assert.doesNotMatch(settings, /hide_ai_tools[\s\S]{0,200}styles\.divider/u);

  // The persisted preference is untouched.
  assert.match(read('src/constants.ts'), /HIDE_AI_TOOLS_KEY/u);
  assert.match(read('src/app/useAppPersistence.ts'), /HIDE_AI_TOOLS_KEY, hideAiTools/u);
  assert.match(read('src/i18n.ts'), /hide_ai_tools:/u);
});

test('the plan comparison table contains none of the four AI rows', () => {
  const sheet = read('src/components/ProSheet.tsx');
  // Rows keep their definitions but are filtered through the shared helper.
  assert.match(sheet, /const rows: TableRowData\[\] = filterAiTextEntries\(allRows, row => row\.aiText === true\);/u);
  for (const key of ['cmp_ai_example', 'cmp_ai_breakdown', 'cmp_ai_meaning', 'cmp_ai_translation']) {
    assert.match(sheet, new RegExp(`t\\('${key}'\\)[^\\n]*aiText: true`, 'u'),
      `${key} must be marked aiText so it is filtered`);
  }
  // Separators are derived from the filtered rows, so none dangles.
  assert.match(sheet, /i < rows\.length - 1 &&/u);

  // Audio and non-AI-text rows must survive.
  for (const key of ['cmp_themes', 'cmp_ai_voice_hq', 'cmp_custom_voice', 'cmp_priority_support', 'cmp_data_transfer']) {
    assert.match(sheet, new RegExp(`t\\('${key}'\\)`, 'u'));
    assert.doesNotMatch(sheet, new RegExp(`t\\('${key}'\\)[^\\n]*aiText`, 'u'), `${key} must not be filtered`);
  }
});

test('the Upgrade Plan sheet promotes none of the four AI features', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.match(sheet, /const FEATURE_SECTIONS: FeatureConfig\[\] = filterAiTextEntries\(\s*ALL_FEATURE_SECTIONS,\s*feature => isAiTextFeatureKey\(feature\.key\),\s*\);/u);
  // Definitions retained for re-enabling.
  for (const key of ['meaning', 'example', 'translate', 'breakdown']) {
    assert.match(sheet, new RegExp(`\\{ key: '${key}',`, 'u'), `${key} definition must remain`);
  }
  // Prices and non-AI benefits untouched.
  assert.match(sheet, /\{ key: 'custom_voice',/u);
  assert.match(sheet, /\{ key: 'priority',/u);
  assert.match(sheet, /\{ key: 'transfer',/u);
});

test('no misleading AI benefit copy is rendered elsewhere in the paywall', () => {
  // ai_features_explain claims Basic includes Translate/Example/Breakdown/Meaning.
  // It must not be rendered anywhere while those are hidden.
  for (const path of ['src/components/ProSheet.tsx', 'src/components/PaywallModal.tsx']) {
    assert.doesNotMatch(read(path), /ai_features_explain/u, `${path} must not render that claim`);
  }
});

// ── Restore Purchases moved to App Info ──────────────────────────────────────

test('Restore Purchases is gone from the paywall and the upgrade sheet', () => {
  assert.doesNotMatch(read('src/components/PaywallModal.tsx'), /restore_purchases|onRestore/u);
  assert.doesNotMatch(read('src/components/ProSheet.tsx'), /restore_purchases|onRestore/u);
});

test('Restore Purchases appears exactly once, on App Info', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // Rendered once, inside AppInfoSheet under a Purchases heading.
  assert.equal((settings.match(/<Text style=\{\[styles\.rowLabel[^>]*>\{t\('restore_purchases'\)\}/gu) ?? []).length, 1);
  assert.match(settings, /\{t\('purchases_section'\)\}/u);

  // No other component renders it.
  const fs2 = require('node:fs');
  const components = fs2.readdirSync('src/components').filter(f => f.endsWith('.tsx'));
  const renderers = components.filter(f =>
    /<Text[^>]*>\{t\('restore_purchases'\)\}/u.test(read(`src/components/${f}`)));
  assert.deepEqual(renderers, ['SettingsModal.tsx']);
});

test('Restore Purchases is reachable by Free users and is not behind the backup gate', () => {
  const settings = read('src/components/SettingsModal.tsx');

  // Restore is rendered before the entitlement-gated Backup block, so nothing
  // about a Free plan can hide it.
  const appInfo = settings.slice(settings.indexOf('function AppInfoSheet'));
  const restoreAt = appInfo.indexOf("t('restore_purchases')");
  const gateAt = appInfo.indexOf('{backupVisible &&');
  assert.ok(restoreAt > 0 && gateAt > restoreAt, 'Restore must precede the backup gate');
  // The restore row itself is never wrapped in an entitlement condition.
  const restoreBlock = appInfo.slice(restoreAt - 900, restoreAt);
  assert.doesNotMatch(restoreBlock, /isSubscribed \?|backupVisible &&/u);
  assert.doesNotMatch(read('src/components/BackupSection.tsx'), /restore_purchases|onRestore/u);
});

test('Restore reuses the shared handler and cannot be run twice at once', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // Re-entrancy guard.
  assert.match(settings, /if \(restoring\) return;\s*setRestoring\(true\);/u);
  assert.match(settings, /\} finally \{\s*setRestoring\(false\);/u);
  assert.match(settings, /disabled=\{restoring\}/u);
  assert.match(settings, /accessibilityState=\{\{ disabled: restoring, busy: restoring \}\}/u);
  // Delegates to the existing RevenueCat handler; no duplicated purchase logic.
  assert.match(settings, /await onRestore\(\);/u);
  assert.doesNotMatch(settings, /Purchases\.restorePurchases/u);
  // useSubscription still owns success / empty / failure feedback.
  const subscription = read('src/hooks/useSubscription.ts');
  assert.match(subscription, /const restore = \(\): Promise<void> =>/u);
  assert.match(subscription, /setError\('Restore failed\. Please try again\.'\)/u);
  assert.match(subscription, /applyVerifiedCustomerInfo\('after-restore-refresh'/u);
});

test('Purchases copy is translated in English and Japanese', () => {
  const i18n = read('src/i18n.ts');
  assert.match(i18n, /purchases_section:  'Purchases',/u);
  assert.match(i18n, /restore_purchases:  'Restore Purchases',/u);
  assert.match(i18n, /purchases_section:  '購入',/u);
  assert.match(i18n, /restore_purchases:  '購入を復元',/u);
});

// ── Themes are subscription-only ─────────────────────────────────────────────

test('no individual-theme purchase code remains anywhere', () => {
  const fs = require('node:fs');
  assert.equal(fs.existsSync('src/features/themes/themeProducts.ts'), false);
  assert.equal(fs.existsSync('src/lib/themePurchases.ts'), false);

  for (const path of [
    'App.tsx',
    'src/app/AppModals.tsx',
    'src/components/KisekaeShopSheet.tsx',
    'src/components/ThemeDetailsSheet.tsx',
    'src/components/SettingsModal.tsx',
    'src/features/themes/themeAccess.ts',
    'src/hooks/useSubscription.ts',
    'src/lib/releasePreflight.ts',
    'scripts/releasePreflight.cjs',
  ]) {
    assert.doesNotMatch(
      read(path),
      /themeProducts|buyTheme|purchasingThemeId|ownedProductIds|purchaseStoreProduct|THEME_PRODUCTS_CONFIGURED|checkThemeProducts/u,
      `${path} still references individual theme purchasing`,
    );
  }
  // No proposed per-theme product identifier survives in any form.
  assert.doesNotMatch(read('src/components/KisekaeShopSheet.tsx'), /wordping\.theme/u);
});

test('subscription purchasing and Restore Purchases are untouched', () => {
  const subscription = read('src/hooks/useSubscription.ts');
  // The generic purchase utilities Basic/Premium rely on must survive.
  assert.match(subscription, /const subscribe = \(\): Promise<void> => purchasePlan\(PACKAGE_IDS\.BASIC\)/u);
  assert.match(subscription, /const subscribePremium = \(\): Promise<void> => purchasePlan\(PACKAGE_IDS\.PREMIUM\)/u);
  assert.match(subscription, /const restore = \(\): Promise<void> =>/u);
  assert.match(subscription, /Purchases\.restorePurchases\(\)/u);
  assert.match(subscription, /applyVerifiedCustomerInfo\('after-restore-refresh'/u);
  // Restore stays reachable from App Info.
  assert.match(read('src/components/SettingsModal.tsx'), /t\('restore_purchases'\)/u);
});

test('theme access is decided only by price and subscription', () => {
  const access = read('src/features/themes/themeAccess.ts');
  assert.match(access, /if \(price <= 0\) return \{ state: 'unlocked', reason: 'free' \};/u);
  assert.match(access, /if \(isSubscriptionLoaded && isSubscribed\) return \{ state: 'unlocked', reason: 'subscription' \};/u);
  assert.match(access, /return \{ state: 'locked' \};/u);
  // The purchasable / unavailable states are gone with the Buy button.
  assert.doesNotMatch(access, /purchasable|unavailable|reason: 'purchased'/u);
});

test('a free user tapping a paid theme opens Upgrade Plan and applies nothing', () => {
  const shop = read('src/components/KisekaeShopSheet.tsx');
  // Only an unlocked theme is ever applied; everything else routes to Upgrade.
  assert.match(
    shop,
    /if \(accessFor\(item\)\.state === 'unlocked'\) \{[\s\S]{0,220}onPickSkin\(exists \? item\.id : null\);[\s\S]{0,40}return;\s*\}\s*\/\/[\s\S]{0,320}onUpgrade\?\.\(\);/u,
  );
  // No purchase alert path survives.
  assert.doesNotMatch(shop, /Alert\.alert/u);
});

test('an expired subscription falls back to a free theme without losing the preference', () => {
  const controller = read('src/features/themes/useThemeController.ts');
  // A paid skin resolves to null (default palette) the moment isSubscribed is
  // false — it is never applied without an entitlement, and never crashes.
  assert.match(
    controller,
    /SKINS\.find\(s => s\.id === skinId && \(isSubscribed \|\| FREE_SKIN_IDS\.has\(s\.id\)\)\) \?\? null;/u,
  );
  // skinId itself is untouched, so resubscribing restores the chosen theme.
  assert.doesNotMatch(controller, /setSkinId|onPickSkin/u);
});

test('release preflight no longer blocks on theme products', () => {
  const preflight = read('src/lib/releasePreflight.ts');
  assert.doesNotMatch(preflight, /checkThemeProducts|THEME_PRODUCTS_CONFIGURED|paidThemeIds/u);
  const script = read('scripts/releasePreflight.cjs');
  assert.doesNotMatch(script, /checkThemeProducts|themeProducts|paidThemeIds/u);
  // The subscription key check — the one that does still matter — stays.
  assert.match(preflight, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/u);
});

// ── Plan comparison table ────────────────────────────────────────────────────

test('the generic "Monthly API requests" row is gone everywhere', () => {
  const i18n = read('src/i18n.ts');
  // Key and both translations removed.
  assert.doesNotMatch(i18n, /cmp_monthly_api/u);
  assert.doesNotMatch(i18n, /Monthly API requests/u);
  assert.doesNotMatch(i18n, /月間APIリクエスト/u);
  // No paywall renders it, and the old helper is gone.
  for (const path of ['src/components/ProSheet.tsx', 'src/components/PaywallModal.tsx']) {
    assert.doesNotMatch(read(path), /cmp_monthly_api|formatMonthlyApiLimit/u);
  }
  assert.doesNotMatch(read('src/lib/planLimits.ts'), /formatMonthlyApiLimit|MONTHLY_API_LIMITS/u);
});

test('High-Quality AI Voice shows a Basic count and the Premium included symbol', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.match(sheet, /const voiceBasic = formatVoiceMonthlyLimit\('basic', language\);/u);
  assert.match(sheet, /const voicePremium = formatVoiceMonthlyLimit\('premium', language\);/u);
  assert.match(
    sheet,
    /label: t\('cmp_ai_voice_hq'\),\s*basic: voiceBasic \?\? 'circle',\s*premium: voicePremium \?\? 'circle',/u,
  );
  // Values come from the shared plan definition, never literals.
  assert.doesNotMatch(sheet, /'100 \/ month'|'月100回'|'1,000 \/ month'/u);
  assert.match(sheet, /import \{ formatVoiceMonthlyLimit \} from '\.\.\/lib\/planLimits';/u);
});

test('unrelated comparison rows keep their circle and cross rendering', () => {
  const sheet = read('src/components/ProSheet.tsx');
  // Priority Support is asserted separately: it is now Premium-only and derives
  // its symbols from PRIORITY_SUPPORT rather than from literals.
  for (const [key, basic, premium] of [
    ['cmp_themes', 'circle', 'circle'],
    ['cmp_custom_voice', 'cross', 'circle'],
    ['cmp_data_transfer', 'circle', 'circle'],
  ]) {
    assert.match(
      sheet,
      new RegExp(`t\\('${key}'\\),\\s*basic: '${basic}', premium: '${premium}'`, 'u'),
      `${key} must keep its symbols`,
    );
  }
  // TableCell still renders symbols for those and text for anything else.
  assert.match(sheet, /if \(value === 'cross'\)/u);
  assert.match(sheet, /if \(value === 'circle'\)/u);
});

test('the four hidden AI rows remain absent from the table', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.match(sheet, /const rows: TableRowData\[\] = filterAiTextEntries\(allRows, row => row\.aiText === true\);/u);
  for (const key of ['cmp_ai_example', 'cmp_ai_breakdown', 'cmp_ai_meaning', 'cmp_ai_translation']) {
    assert.match(sheet, new RegExp(`t\\('${key}'\\)[^\\n]*aiText: true`, 'u'));
  }
});

test('the voice limit copy is translated in English and Japanese', () => {
  const i18n = read('src/i18n.ts');
  assert.match(i18n, /err_voice_limit_title:     'Monthly voice limit reached',/u);
  assert.match(i18n, /err_voice_limit_title:     '月間音声生成上限に達しました',/u);
  assert.match(i18n, /You’ve used all \{limit\} High-Quality AI Voice generations for this month\. Upgrade to Premium for unlimited access\./u);
  assert.match(i18n, /今月の高品質AI音声生成を\{limit\}回使用しました。Premiumにアップグレードすると無制限で利用できます。/u);

  // The old generic-API and Premium-limit messages are gone.
  assert.doesNotMatch(i18n, /err_monthly_limit_(title|basic|premium)/u);
  assert.doesNotMatch(i18n, /Upgrade to Premium for a higher limit/u);
  assert.doesNotMatch(i18n, /Your limit resets on/u);
  assert.doesNotMatch(i18n, /API requests for this month/u);
});

test('the voice allowance is enforced by the Worker, on the voice routes only', () => {
  const pipeline = read('cloudflare/wordping-api/src/pipeline.ts');
  const limits = read('cloudflare/wordping-api/src/planLimits.ts');

  // Only the High-Quality AI Voice generation routes are metered.
  assert.match(limits, /VOICE_QUOTA_FEATURES: readonly Feature\[\] = \['voice_card', 'voice_sample'\]/u);
  assert.match(pipeline, /const meteredForVoice = isVoiceQuotaFeature\(spec\.feature\);/u);
  assert.match(pipeline, /if \(!meteredForVoice\) return null;/u);

  // Premium has no monthly product quota; the allowance is keyed to the
  // verified RevenueCat App User ID and reserved after the rate limiter.
  assert.match(limits, /premium: null/u);
  assert.match(pipeline, /privacyHash\(env, 'rcuser', identity\.appUserId\)/u);
  assert.match(pipeline, /reserveMonthlyQuota\(/u);
  const guard = pipeline.slice(pipeline.indexOf('const requiredTier'));
  assert.match(guard, /tier = entitlement\.tier;/u);

  // No client-supplied plan or usage is ever read.
  assert.doesNotMatch(pipeline, /body\.plan|body\.tier|body\.used|body\.remaining/u);

  // General abuse protection is untouched.
  assert.match(pipeline, /const decision = await consume\(/u);
  assert.match(pipeline, /runtime\.disabledFeatures\.has\(spec\.feature\)/u);
});

// ── Theme cards carry no price or purchase state ─────────────────────────────

test('no theme card shows a price, an Owned badge or a Buy button', () => {
  const shop = read('src/components/KisekaeShopSheet.tsx');
  assert.doesNotMatch(shop, /formatPrice|shop_owned|shop_included_in_plan|theme_details_buy/u);
  // No placeholder and no reserved vertical space below the name.
  assert.doesNotMatch(shop, /cardPrice/u);
  assert.doesNotMatch(shop, /<Text style=\{styles\.cardPrice\}>\{' '\}<\/Text>/u);
  // The card renders exactly the preview, the name and one badge.
  assert.match(shop, /<Text style=\{\[styles\.cardName[\s\S]{0,120}<\/Text>\s*<\/TouchableOpacity>/u);

  const details = read('src/components/ThemeDetailsSheet.tsx');
  assert.doesNotMatch(details, /formatPrice|theme_details_buy|theme_details_owned_badge|priceText/u);
});

test('a locked card shows a lock and an accessible label instead of a price', () => {
  const shop = read('src/components/KisekaeShopSheet.tsx');
  assert.match(shop, /isLocked \? \(\s*<View style=\{styles\.lockBadge\}>/u);
  assert.match(shop, /accessibilityRole="button"/u);
  assert.match(shop, /accessibilityState=\{\{ selected: isSelected, disabled: false \}\}/u);
  // Same markup for every plan, so grid alignment cannot differ by plan.
  assert.doesNotMatch(shop, /isSubscribed \? null/u);
});

test('the theme detail action is Apply or Upgrade, never Buy', () => {
  const details = read('src/components/ThemeDetailsSheet.tsx');
  assert.match(
    details,
    /const actionLabel = isApplied[\s\S]{0,200}isUnlocked\s*\?\s*t\('theme_details_apply'\)\s*:\s*t\('theme_details_upgrade'\)/u,
  );
  // Only "Free" is badged; there is no ownership state left to show.
  assert.match(details, /isFreeItem\s*\?\s*\{ label: t\('theme_details_free_badge'\)/u);
  assert.match(details, /:\s*null;/u);
});

// ── Priority Support ─────────────────────────────────────────────────────────

test('Priority Support is Premium-only, from a single definition', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.match(sheet, /const PRIORITY_SUPPORT = \{ basic: false, premium: true \} as const;/u);
  // Both surfaces derive from it, so they cannot disagree.
  assert.match(sheet, /basic: PRIORITY_SUPPORT\.basic, premium: PRIORITY_SUPPORT\.premium/u);
  assert.match(
    sheet,
    /label: t\('cmp_priority_support'\),\s*basic: PRIORITY_SUPPORT\.basic \? 'circle' : 'cross',\s*premium: PRIORITY_SUPPORT\.premium \? 'circle' : 'cross',/u,
  );
  // A Boolean row, never text.
  assert.doesNotMatch(sheet, /cmp_priority_support'\)[^\n]*'\d/u);
  // No copy anywhere claims Basic includes it.
  assert.doesNotMatch(read('src/i18n.ts'), /Basic[^\n]*[Pp]riority [Ss]upport/u);
});

// ── Sync with test results ───────────────────────────────────────────────────

test('the toggle sits directly below Vertical Flip and defaults to off', () => {
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(
    settings,
    /value=\{verticalFlip\}[\s\S]{0,160}\/>\s*<ToggleRow\s*label=\{t\('sync_test_results'\)\}/u,
    'the toggle must render immediately after Vertical Flip',
  );
  // Off by default for existing and new users.
  assert.match(read('src/app/useAppSettings.ts'), /const \[syncTestResults, setSyncTestResults\] = useState\(false\);/u);
  // Absent storage means off.
  assert.match(read('src/app/useAppBootstrap.ts'), /if \(rawSyncTest === 'true'\) setSyncTestResults\(true\);/u);
  // Persisted through the existing architecture, never sent anywhere.
  assert.match(read('src/app/useAppPersistence.ts'), /AsyncStorage\.setItem\(SYNC_TEST_RESULTS_KEY/u);
  assert.doesNotMatch(read('src/lib/api/client.ts'), /syncTestResults/u);
});

test('the toggle is accessible', () => {
  // The row supplies the label and hint; the shared control owns the semantics.
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(settings, /accessibilityLabel=\{label\}/u);
  assert.match(settings, /accessibilityHint: info/u);

  const control = read('src/components/CompactSwitch.tsx');
  assert.match(control, /accessibilityRole="switch"/u);
  assert.match(control, /accessibilityState=\{\{ checked: value \}\}/u);
  assert.match(control, /accessibilityLabel=\{accessibilityLabel\}/u);
});

// ── Compact Settings switches ────────────────────────────────────────────────

test('exactly the three Settings toggles use the compact control', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // One shared component, used once inside ToggleRow — not three transforms.
  assert.equal((settings.match(/<CompactSwitch/gu) ?? []).length, 1);
  assert.doesNotMatch(settings, /<Switch\b/u);
  assert.doesNotMatch(settings, /transform: \[\{ scale/u);

  // ToggleRow renders exactly the three visible Card Behavior toggles.
  const rows = [...settings.matchAll(/<ToggleRow\s+label=\{t\('([a-z_]+)'\)\}/gu)].map(m => m[1]);
  assert.deepEqual(rows, ['show_full_card', 'vertical_flip', 'sync_test_results', 'hide_ai_tools']);
  // hide_ai_tools is behind AI_TEXT_FEATURES_ENABLED (false), so three render.
  assert.match(settings, /\{AI_TEXT_FEATURES_ENABLED && isPremium && \(\s*<ToggleRow\s+label=\{t\('hide_ai_tools'\)\}/u);

  // Nothing else in the app adopts it by accident.
  const notif = read('src/components/NotificationModal.tsx');
  assert.doesNotMatch(notif, /CompactSwitch/u);
});

test('the compact switch keeps a 44x44 target and does not shrink the text', () => {
  const control = read('src/components/CompactSwitch.tsx');
  assert.match(control, /export const COMPACT_SWITCH_SCALE = 0\.8;/u);
  assert.match(control, /export const MIN_TAP_TARGET = 44;/u);
  assert.match(control, /minWidth: MIN_TAP_TARGET,\s*minHeight: MIN_TAP_TARGET,/u);
  assert.match(control, /hitSlop=\{HIT_SLOP\}/u);
  // Only the control is transformed; nothing clips it.
  assert.match(control, /control: \{ transform: \[\{ scale: COMPACT_SWITCH_SCALE \}\] \}/u);
  assert.doesNotMatch(control, /overflow: 'hidden'/u);

  // Row height and the label/description type sizes are untouched.
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(settings, /toggleRow: \{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 \}/u);
  // The title keeps the same 15pt size the plain Settings rows use.
  assert.match(settings, /toggleLabel: \{ fontSize: 15, flexShrink: 1 \}/u);
  assert.match(settings, /rowLabel: \{ flex: 1, fontSize: 15 \}/u);
});

test('toggle state and persistence are unchanged', () => {
  const settings = read('src/components/SettingsModal.tsx');
  for (const [value, handler] of [
    ['showFullCard', 'onToggleShowFullCard'],
    ['verticalFlip', 'onToggleVerticalFlip'],
    ['syncTestResults', 'onToggleSyncTestResults'],
  ]) {
    assert.match(settings, new RegExp(`value=\\{${value}\\}\\s*onToggle=\\{${handler}\\}`, 'u'));
  }
  // The same three AsyncStorage writers still run.
  const persistence = read('src/app/useAppPersistence.ts');
  for (const key of ['SHOW_FULL_CARD_KEY', 'VERTICAL_FLIP_KEY', 'SYNC_TEST_RESULTS_KEY']) {
    assert.match(persistence, new RegExp(`AsyncStorage\\.setItem\\(${key}`, 'u'));
  }
});

test('the toggle copy is translated in English and Japanese', () => {
  const i18n = read('src/i18n.ts');
  assert.match(i18n, /sync_test_results:          'Sync with test results',/u);
  assert.match(i18n, /sync_test_results:          'テスト結果と連動',/u);

  // The complete explanation, used by the information popup.
  assert.match(
    i18n,
    /sync_test_results_desc:     'Links your test results with your word list\. Perfect permanently deletes the card, Pretty good shows it again after 3 days, Not really shows it again after 1 day, and Don’t know leaves it unchanged\.',/u,
  );
  assert.match(
    i18n,
    /sync_test_results_desc:     'テスト結果と単語帳を連動します。Perfectではカードを完全に削除し、Pretty goodでは3日後、Not reallyでは1日後に再表示します。Don’t knowではそのまま残ります。',/u,
  );
});

// ── Settings information popups ──────────────────────────────────────────────

test('the Sync description covers all four results and both durations', () => {
  const i18n = read('src/i18n.ts');
  const en = i18n.match(/sync_test_results_desc:     '(Links[^']*)'/u)[1];
  const ja = i18n.match(/sync_test_results_desc:     '(テスト結果と単語帳[^']*)'/u)[1];

  for (const result of ['Perfect', 'Pretty good', 'Not really', 'Don’t know']) {
    assert.ok(en.includes(result), `EN is missing ${result}`);
    assert.ok(ja.includes(result), `JA is missing ${result}`);
  }
  // The durations must match the implemented rules exactly.
  assert.ok(en.includes('3 days') && en.includes('1 day'));
  assert.ok(ja.includes('3日後') && ja.includes('1日後'));
  assert.ok(/permanently deletes/u.test(en) && /完全に削除/u.test(ja));
});

test('no conflicting older Sync description survives', () => {
  const i18n = read('src/i18n.ts');
  // Every superseded wording, including the 24-hour version.
  assert.doesNotMatch(i18n, /Pretty good hides it for/u);
  assert.doesNotMatch(i18n, /hides it for 24 hours/u);
  assert.doesNotMatch(i18n, /Pretty goodでは24時間非表示/u);
  assert.doesNotMatch(i18n, /Pretty goodでは3日間、Not reallyでは1日間非表示/u);
  // Exactly one definition per locale.
  assert.equal((i18n.match(/sync_test_results_desc:/gu) ?? []).length, 2);
});

test('exactly three Settings rows carry an information button', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // The button is rendered once, inside ToggleRow, gated on `info` being given.
  // (The same icon also names the App Info and App version rows, which are
  // SettingRow `icon` props, not information buttons.)
  const toggleRow = settings.slice(settings.indexOf('// ── Toggle row'), settings.indexOf('const styles = StyleSheet.create'));
  assert.equal((toggleRow.match(/information-circle-outline/gu) ?? []).length, 1);
  assert.match(settings, /const showInfoButton = info !== undefined && onShowInfo !== undefined;/u);

  const withInfo = [...settings.matchAll(/<ToggleRow\s+label=\{t\('([a-z_]+)'\)\}[\s\S]{0,400}?\/>/gu)]
    .filter(match => match[0].includes('info={t('))
    .map(match => match[1]);
  assert.deepEqual(withInfo, ['show_full_card', 'vertical_flip', 'sync_test_results']);

  // No unrelated row gets one: SettingRow and the plain rows are untouched.
  const settingRow = settings.slice(settings.indexOf('function SettingRow'), settings.indexOf('// ── Toggle row'));
  assert.doesNotMatch(settingRow, /information-circle-outline|onShowInfo/u);
  assert.doesNotMatch(settings, /removeAdsRow[\s\S]{0,200}information-circle-outline/u);
  // hide_ai_tools (behind the AI flag) deliberately has none.
  assert.doesNotMatch(settings, /label=\{t\('hide_ai_tools'\)\}[\s\S]{0,200}info=\{/u);
});

test('all three toggle rows use the same title-info-switch layout', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const rows = [...settings.matchAll(/<ToggleRow\s+label=\{t\('([a-z_]+)'\)\}[\s\S]{0,400}?\/>/gu)]
    .filter(match => match[0].includes('info={t('));
  assert.deepEqual(rows.map(match => match[1]), ['show_full_card', 'vertical_flip', 'sync_test_results']);

  // No row renders a subtitle, and the prop that produced one is gone, so no
  // row can reintroduce a second line and break the shared height.
  assert.doesNotMatch(settings, /description=\{t\(/u);
  assert.doesNotMatch(settings, /toggleDesc|toggleText/u);

  // One shared layout: the group takes the free space, the switch is the only
  // thing on the right, so all three switches share a right edge.
  assert.match(settings, /titleAndInfo: \{ flex: 1, flexDirection: 'row', alignItems: 'center' \}/u);
  assert.match(
    settings,
    /<View style=\{styles\.titleAndInfo\}>\s*<Text style=\{\[styles\.toggleLabel, \{ color: pal\.text \}\]\}>\{label\}<\/Text>/u,
  );
  // The information button lives inside that group, next to the title.
  assert.match(settings, /<View style=\{styles\.titleAndInfo\}>[\s\S]{0,900}styles\.infoButton[\s\S]{0,600}<\/View>\s*\{\/\*/u);

  // Centred on one line, with no per-row offsets anywhere.
  assert.match(settings, /toggleRow: \{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 \}/u);
  assert.doesNotMatch(settings, /styles\.toggleRow[\s\S]{0,200}marginTop:/u);
  // The title must not carry flex: 1 — that is what stretched it to the top of
  // the row and produced the upward offset.
  assert.match(settings, /toggleLabel: \{ fontSize: 15, flexShrink: 1 \}/u);
  assert.doesNotMatch(settings, /toggleLabel: \{[^}]*flex: 1/u);

  // VoiceOver still reaches the explanation through the switch's hint.
  assert.match(settings, /accessibilityHint: info/u);

  // The translation keys stay: still exported copy, and removing them would be
  // a bulk i18n edit for no gain.
  const i18n = read('src/i18n.ts');
  assert.match(i18n, /show_full_card_desc:/u);
  assert.match(i18n, /vertical_flip_desc:/u);
});

test('each button opens its own description, and the toggle is untouched', () => {
  const settings = read('src/components/SettingsModal.tsx');
  for (const [row, body] of [
    ['show_full_card', 'show_full_card_info'],
    ['vertical_flip', 'vertical_flip_info'],
    ['sync_test_results', 'sync_test_results_desc'],
  ]) {
    assert.match(
      settings,
      new RegExp(`label=\\{t\\('${row}'\\)\\}[\\s\\S]{0,160}info=\\{t\\('${body}'\\)\\}`, 'u'),
    );
  }
  // The popup receives the row's own title and body, and nothing else.
  assert.match(settings, /onPress=\{\(\) => onShowInfo\(\(\{ title: label, body: info \}\)\)\}/u);
  // The information button is a separate touchable from the switch, so neither
  // tap can reach the other.
  assert.match(settings, /<TouchableOpacity\s*style=\{styles\.infoButton\}[\s\S]{0,400}<\/TouchableOpacity>\s*\)\}/u);
  assert.match(settings, /accessibilityRole="button"\s*accessibilityLabel=\{`\$\{label\}: \$\{t\('info_button_label'\)\}`\}/u);
});

test('only one popup can be open, and closing it changes no setting', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // A single content slot: a second tap replaces it rather than stacking.
  assert.match(settings, /const \[infoContent, setInfoContent\] = useState<SettingsInfoContent \| null>\(null\);/u);
  assert.equal((settings.match(/<SettingsInfoPopup/gu) ?? []).length, 1);
  assert.match(settings, /content=\{infoContent\}\s*onClose=\{\(\) => setInfoContent\(null\)\}/u);

  const popup = read('src/components/SettingsInfoPopup.tsx');
  // The popup neither reads nor writes any setting.
  assert.doesNotMatch(popup, /onToggle|onValueChange|Switch|setShowFullCard|setVerticalFlip|syncTestResults/u);
  // Back button and outside tap both dismiss.
  assert.match(popup, /onRequestClose=\{onClose\}/u);
  assert.match(popup, /accessibilityViewIsModal/u);
  // Theme, safe area and wrapping.
  assert.match(popup, /backgroundColor: pal\.dialog/u);
  assert.match(popup, /marginTop: insets\.top \+ 24/u);
  assert.match(popup, /marginBottom: insets\.bottom \+ 24/u);
  assert.match(popup, /<ScrollView/u);
  assert.doesNotMatch(popup, /numberOfLines/u);
});

test('both controls keep a 44x44 target and the switch styling is unchanged', () => {
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(settings, /const INFO_BUTTON_TARGET = 44;/u);
  assert.match(settings, /infoButton: \{\s*width: INFO_BUTTON_TARGET,\s*height: INFO_BUTTON_TARGET,/u);

  // The compact switch is exactly as it was.
  const control = read('src/components/CompactSwitch.tsx');
  assert.match(control, /export const COMPACT_SWITCH_SCALE = 0\.8;/u);
  assert.match(control, /export const MIN_TAP_TARGET = 44;/u);
  assert.match(control, /minWidth: MIN_TAP_TARGET,\s*minHeight: MIN_TAP_TARGET,/u);
  assert.match(control, /control: \{ transform: \[\{ scale: COMPACT_SWITCH_SCALE \}\] \}/u);
});

test('the info copy is present in English and Japanese, and optional elsewhere', () => {
  const i18n = read('src/i18n.ts');
  for (const key of ['show_full_card_info', 'vertical_flip_info', 'info_button_label']) {
    // Exactly two definitions: English and Japanese.
    assert.equal((i18n.match(new RegExp(`${key}:`, 'gu')) ?? []).length, 2, key);
  }
  assert.match(i18n, /show_full_card_info:      'In the word list, tapping a card shows its word, meaning and note together/u);
  assert.match(i18n, /vertical_flip_info:       'Changes the card-flip animation from horizontal to vertical/u);
  assert.match(i18n, /show_full_card_info:      '単語リストでカードをタップしたとき/u);
  assert.match(i18n, /vertical_flip_info:       'カードをめくるアニメーションを横方向から縦方向に変更します/u);

  // Declared as optional keys, so the other locales fall back to English
  // instead of failing to compile.
  assert.match(i18n, /type AppShellKey =[\s\S]{0,600}\| 'show_full_card_info' \| 'vertical_flip_info' \| 'info_button_label';/u);
});

test('Settings dividers use one shared, tightened value', () => {
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(settings, /export const SETTINGS_DIVIDER_MARGIN = 17;/u);
  assert.match(settings, /divider: \{ height: StyleSheet\.hairlineWidth, marginVertical: SETTINGS_DIVIDER_MARGIN \}/u);
  // Nothing hardcodes the old value, and no second divider style exists here.
  assert.doesNotMatch(settings, /marginVertical: 20/u);
  assert.equal((settings.match(/divider: \{/gu) ?? []).length, 1);

  // Scoped to Settings: unrelated screens keep their own spacing.
  for (const path of [
    'src/screens/WordListScreen/WordListScreen.tsx',
    'src/components/TestModeScreen.tsx',
  ]) {
    assert.doesNotMatch(read(path), /SETTINGS_DIVIDER_MARGIN/u, path);
  }
  // A hidden section must not leave its divider behind.
  assert.match(settings, /\{backupVisible && \(\s*<>\s*<View style=\{\[styles\.divider/u);
});

// ── Test Mode grading behaviour ──────────────────────────────────────────────

test('Perfect deletes through the canonical path only when the toggle is on', () => {
  const grading = read('src/features/cards/grading.ts');
  assert.match(grading, /if \(syncTestResults && canDelete\) return \{ action: 'delete' \};/u);
  // Off keeps the previous behaviour exactly.
  assert.match(
    grading,
    /return \{ action: 'update', patch: \{ testMastered: true, testLevel: 'perfect', reviewHistory \} \};/u,
  );
  // The screen owns no grading rule of its own and no second delete path.
  const screen = read('src/components/TestModeScreen.tsx');
  assert.doesNotMatch(screen, /setCards\(|DELETE FROM|deleteWord/u);
  assert.match(screen, /const outcome = gradeCard\(card, kind, \{/u);
  // App passes the app's own deleteCard.
  assert.match(read('App.tsx'), /onDeleteCard: deleteCard,/u);
});

test('a repeated tap cannot grade or delete the same card twice', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  assert.match(screen, /if \(gradedIdsRef\.current\.has\(card\.id\)\) return;\s*gradedIdsRef\.current\.add\(card\.id\);/u);
});

test('restarting the session makes every card answerable again', () => {
  // The guard is per pass, not per session: Shuffle and Reset re-queue the same
  // cards, and leaving the answered IDs behind silently swallowed the next
  // grade — the card animated away but no hiddenUntil was ever written.
  const screen = read('src/components/TestModeScreen.tsx');
  assert.match(screen, /setSessionKey\(k => k \+ 1\);[\s\S]{0,400}gradedIdsRef\.current = new Set\(\);/u);
});

test('each grade hides for its own fixed period, only when the toggle is on', () => {
  const grading = read('src/features/cards/grading.ts');
  // One mapping from grade to duration, so no call site can invent its own.
  assert.match(
    grading,
    /const HIDE_MS: Record<AnswerKind, number \| null> = \{\s*perfect:\s*null,\s*good:\s*PRETTY_GOOD_HIDE_MS,\s*slightly:\s*NOT_REALLY_HIDE_MS,\s*unknown:\s*null,\s*\};/u,
  );
  // Off means no hiddenUntil is created or changed at all.
  assert.match(grading, /if \(!syncTestResults \|\| duration === null\) return \{\};/u);
  assert.match(grading, /return \{ hiddenUntil: hiddenUntilFor\(now, duration\) \};/u);

  const visibility = read('src/features/cards/visibility.ts');
  assert.match(visibility, /export const PRETTY_GOOD_HIDE_MS = 72 \* 60 \* 60 \* 1000;/u);
  assert.match(visibility, /export const NOT_REALLY_HIDE_MS = 24 \* 60 \* 60 \* 1000;/u);
  // The superseded single-duration constant is gone.
  assert.doesNotMatch(visibility, /HIDE_AFTER_PRETTY_GOOD_MS/u);

  // Existing scoring is unchanged either way.
  assert.match(grading, /testNextReview: now \+ \(NEXT_REVIEW_DELAY_MS\.good as number\),\s*testLevel: 'good',/u);
  assert.match(grading, /testNextReview: now \+ \(NEXT_REVIEW_DELAY_MS\.slightly as number\),\s*testLevel: 'slightly',/u);
  // Only Perfect deletes; no other grade may.
  assert.match(grading, /if \(syncTestResults && canDelete\) return \{ action: 'delete' \};/u);
  assert.equal((grading.match(/return \{ action: 'delete' \}/gu) ?? []).length, 1);
});

test('clearing a test result also lifts the hide it produced', () => {
  // Both reset paths, otherwise a reset card stays invisible with nothing on
  // screen explaining why.
  assert.match(
    read('src/components/TestModeScreen.tsx'),
    /testMastered: false, testNextReview: 0, testLevel: undefined, \.\.\.CLEAR_HIDE,/u,
  );
  assert.match(read('src/features/cards/useCards.ts'), /testMastered: undefined,\s*\/\/[^\n]*\n\s*\.\.\.CLEAR_HIDE,/u);
});

test('reordering never drops a hidden card out of state', () => {
  // Every ordering path used to rebuild the folder from the visible list only,
  // so a sort, a drag or a cancel deleted the hidden cards and the next persist
  // removed their rows.
  const useCards = read('src/features/cards/useCards.ts');
  assert.match(useCards, /const replaceFolderOrder = useCallback\(\(orderedVisible: readonly WordCard\[\]\) => \{/u);
  assert.match(useCards, /mergeVisibleCardOrder\(inFolder, orderedVisible\)/u);
  for (const call of [
    /if \(orig\.length\) replaceFolderOrder\(orig\);/u,
    /replaceFolderOrder\(sortByRating\(folderCards, dir === 'asc' \? 'highest' : 'lowest'\)\);/u,
    /replaceFolderOrder\(sortByRegistrationOrder\(folderCards\)\);/u,
  ]) {
    assert.match(useCards, call);
  }
  assert.match(read('App.tsx'), /onReorder: replaceFolderOrder,/u);
});

test('hidden cards are excluded from every learning view but kept in data', () => {
  // Word List, Flip and search all derive from folderCards.
  assert.match(read('src/features/cards/useCards.ts'), /visibleCards\(cards\.filter\(c => c\.folderId === currentFolderId\)\)/u);
  // Notifications and folder counts.
  assert.match(read('src/notifications.ts'), /!isCardHidden\(c\)/u);
  assert.match(read('src/screens/FolderListScreen/FolderListScreen.tsx'), /if \(isCardHidden\(card\)\) continue;/u);
  // Test Mode receives the already-filtered folderCards.
  assert.match(read('App.tsx'), /cards: folderCards,/u);

  // But never from backup, migration or repository reads.
  for (const path of [
    'src/lib/backup/exportBackup.ts',
    'src/lib/backup/importBackup.ts',
    'src/lib/sqlite/repositories.ts',
    'src/lib/sqlite/legacyMigration.ts',
  ]) {
    assert.doesNotMatch(read(path), /isCardHidden|visibleCards/u, `${path} must not filter hidden cards`);
  }
});

test('hiddenUntil is an absolute UTC timestamp persisted in SQLite', () => {
  const schema = read('src/lib/sqlite/schema.ts');
  assert.match(schema, /ALTER TABLE learning_progress ADD COLUMN hidden_until INTEGER;/u);
  assert.match(schema, /version: 2,/u);
  assert.match(schema, /CURRENT_SCHEMA_VERSION = 2/u);
  // Derived on read, never a timer.
  const visibility = read('src/features/cards/visibility.ts');
  assert.match(visibility, /card\.hiddenUntil > now/u);
  assert.doesNotMatch(visibility, /setTimeout|setInterval/u);
});
