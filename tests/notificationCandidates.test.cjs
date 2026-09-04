const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/**
 * Opt-in notifications.
 *
 * The rule itself is covered by tests/unit/notificationCandidates.test.ts, and
 * the stored shape by the SQLite tests. What is pinned here is the wiring: that
 * every surface asks the one rule, that the two Add/Edit actions exist and go
 * where they should, and that the mute this replaced is gone rather than left
 * behind as a second veto.
 */

// ── The Add/Edit sheet ───────────────────────────────────────────────────────

test('the two actions sit under the Note field, above Review History', () => {
  const modal = read('src/components/WordModal.tsx');

  const actionsAt = modal.indexOf('{/* Word actions');
  const noteAt = modal.indexOf('{/* Note field */}');
  const historyAt = modal.indexOf('{/* Review History');
  assert.ok(actionsAt > noteAt, 'the actions come after the note input');
  assert.ok(actionsAt < historyAt, 'and before the review history');

  // Both need a saved word, so both are behind the same editing check the
  // history uses — there is nothing to move or to list until Save has run.
  const block = modal.slice(actionsAt, historyAt);
  assert.match(block, /\{t\('move'\)\}/u, 'Move reuses the existing label');
  assert.match(block, /t\(notifCandidate \? 'notif_remove_word' : 'notif_add_word'\)/u);
  assert.ok(modal.indexOf('{editingCard && (', actionsAt) < historyAt, 'editing only');
});

test('the notification action shows its state and announces it', () => {
  const modal = read('src/components/WordModal.tsx');
  const block = modal.slice(modal.indexOf('{/* Word actions'), modal.indexOf('{/* Review History'));

  // Colour is never the only signal: the bell, label and checkmark follow state.
  assert.match(block, /name=\{notifCandidate \? 'notifications' : 'notifications-outline'\}/u);
  assert.match(block, /t\(notifCandidate \? 'notif_remove_word' : 'notif_add_word'\)/u);
  assert.match(block, /borderColor: notifCandidate \? themeColor : pal\.border/u);
  assert.match(block, /color=\{notifCandidate \? themeColor : pal\.sub\}/u);
  assert.match(block, /color: notifCandidate \? themeColor : pal\.sub/u);
  assert.match(block, /notifCandidate && \(\s*<Ionicons name="checkmark" size=\{17\} color=\{themeColor\}/u);
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}/iu, 'active colour always follows the current theme');
  assert.match(block, /accessibilityRole="switch"/u);
  assert.match(block, /accessibilityState=\{\{ checked: notifCandidate \}\}/u);
});

test('the edit-sheet actions reuse the Flip Mode pill-button design', () => {
  const modal = read('src/components/WordModal.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');

  for (const declaration of [
    /gap: 5,/u,
    /paddingHorizontal: 16,/u,
    /paddingVertical: 9,/u,
    /borderRadius: 20,/u,
    /borderWidth: 1,/u,
    /fontSize:\s*13,\s*fontWeight:\s*'500'/u,
  ]) {
    assert.match(modal, declaration);
    assert.match(flip, declaration);
  }

  const block = modal.slice(modal.indexOf('{/* Word actions'), modal.indexOf('{/* Review History'));
  assert.match(block, /name="folder-outline" size=\{17\} color=\{pal\.sub\}/u);
  assert.match(block, /size=\{17\}\s+color=\{pal\.sub\}/u);
  assert.doesNotMatch(block, /activeOpacity=/u, 'use the same default pressed opacity as Flip Mode');
  assert.doesNotMatch(block, /backgroundColor:/u, 'the former pills have a transparent background');
});

test('word-card notification indicators keep their original outlined styling', () => {
  const row = read('src/components/SwipeableCard.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');

  assert.match(row, /!!item\.notifCandidate[\s\S]*?opacity: 0\.45[\s\S]*?name="notifications-outline"[\s\S]*?size=\{13\}/u);
  assert.match(flip, /c\.notifCandidate[\s\S]*?style=\{s\.notifBadge\}[\s\S]*?name="notifications-outline" size=\{13\} color=\{pal\.sub\}/u);
});

test('the toggle writes through immediately, and the label follows the card', () => {
  // Not staged behind Save: it calls the same card toggle every other surface
  // calls, so closing with Cancel leaves the word where the user just put it.
  assert.match(
    read('App.tsx'),
    /onToggleNotifCandidate: \(\) => \{ if \(editingCard\) toggleCardNotif\(editingCard\.id\); \}/u,
  );
  // And the state shown is read off the live card, never the opened snapshot,
  // which goes stale the moment the toggle is tapped.
  assert.match(
    read('App.tsx'),
    /cards\.find\(c => c\.id === editingCard\.id\)\?\.notifCandidate === true/u,
  );
  assert.doesNotMatch(
    read('src/components/WordModal.tsx'),
    /editingCard\??\.notifCandidate/u,
    'the sheet must not read the snapshot',
  );
});

test('Move reuses the existing folder move, aimed at the one word', () => {
  const app = read('App.tsx');
  assert.match(app, /setWordModalVisible\(false\);\s*openMovePicker\(\[editingCard\.id\]\);/u);
  // The same picker the list rows and the selection bar open — not a second one.
  assert.match(app, /onMove: openMovePicker,/u, 'Flip Mode');
  assert.match(app, /onMoveSelected: \(\) => openMovePicker\(\[\.\.\.selectedIds\]\)/u, 'the selection bar');
  assert.equal((app.match(/openMovePicker/gu) ?? []).length, 4, 'one import-free helper, three callers');
});

// ── The rule ─────────────────────────────────────────────────────────────────

test('every surface asks the one eligibility rule', () => {
  // The scheduler filters ownership, then defers. It does not decide.
  const notifications = read('src/notifications.ts');
  assert.match(notifications, /const owned = cards\.filter\(c => c\.folderId === folder\.id\);/u);
  assert.match(notifications, /notifiableCards\(owned, folder\.notifSettings\)/u);
  assert.doesNotMatch(notifications, /notifCandidate|notifyAllWords|isCardHidden/u);

  // Send Test draws from the same pool, so it can only fire a word the schedule
  // could have picked — and fires nothing when the schedule would fire nothing.
  const hook = read('src/features/notifications/useFolderNotifications.ts');
  assert.match(hook, /notifiableCards\(allFolderCards, currentFolder\?\.notifSettings\)/u);
  assert.match(hook, /hasNoNotifiableWords\(allFolderCards, currentFolder\?\.notifSettings\)/u);
});

test('an empty list schedules nothing rather than everything', () => {
  const notifications = read('src/notifications.ts');
  const loop = notifications.slice(notifications.indexOf('for (const folder of active)'));
  assert.match(loop, /if \(eligible\.length === 0\) continue;/u);
  // No second pass over the folder to fall back to.
  assert.doesNotMatch(loop, /\?\?\s*owned|:\s*owned\b/u, 'there is no fallback to all words');
});

// ── The Notification sheet ───────────────────────────────────────────────────

test('the sheet presents one informational scope row and one selectable toggle', () => {
  const sheet = read('src/components/NotificationModal.tsx');
  assert.match(sheet, /label=\{t\('notif_selected_words'\)\}/u);
  assert.match(sheet, /label=\{t\('notif_all_words'\)\}/u);
  assert.match(sheet, /value=\{notifyAllWords\}\s*onValueChange=\{onToggleNotifyAllWords\}/u);
  assert.doesNotMatch(sheet, /selected=\{!notifyAllWords\}|onToggleNotifyAllWords\(false\)/u);
  assert.match(
    sheet,
    /if \(\s*value === undefined[\s\S]*?return \(\s*<View style=\{styles\.scopeRow\}>/u,
  );
  assert.match(sheet, /const handleToggle = \(\) => onValueChange\(!value\)/u);
  assert.match(sheet, /<CompactSwitch/u);
  assert.match(sheet, /accessibilityRole="switch"/u);
  const scopeRow = sheet.slice(
    sheet.indexOf('function NotificationScopeRow'),
    sheet.indexOf('const styles = StyleSheet.create'),
  );
  assert.doesNotMatch(scopeRow, /accessibilityRole="radio"/u);

  // Explanations live only in the two Info popups, never as text below a row.
  assert.ok((sheet.match(/name="information-circle-outline"/gu) ?? []).length >= 1);
  assert.match(sheet, /event\.stopPropagation\(\);\s*onShowInfo\(\{ title: label, body: info \}\)/u);
  assert.match(sheet, /<SettingsInfoPopup/u);
  assert.doesNotMatch(sheet, /<Text[^>]*>\s*\{t\('notif_(?:selected_words|all_words)_desc'\)\}/u);

  const i18n = read('src/i18n.ts');
  const selectedInfo = i18n.slice(
    i18n.indexOf("notif_selected_words_desc:\n    'This"),
    i18n.indexOf("notif_all_words:", i18n.indexOf("notif_selected_words_desc:\n    'This")),
  );
  assert.match(selectedInfo, /default behavior/u);
  assert.match(selectedInfo, /“Notify All Words” is off/u);
  assert.match(selectedInfo, /manually added/u);

  // Empty candidate feedback and the rest of the sheet stay intact.
  assert.match(sheet, /\{noNotifiableWords && \(/u);
  assert.match(sheet, /\{t\('notif_no_candidates'\)\}/u);

  // The message names both ways out of the empty state.
  const en = read('src/i18n.ts');
  const copy = en.slice(en.indexOf('notif_no_candidates:'), en.indexOf('notif_no_candidates:') + 320);
  assert.match(copy, /Add to Notifications/u);
  assert.match(copy, /Notify All Words/u);

  assert.match(sheet, /INTERVAL_OPTIONS\.map/u);
  assert.match(sheet, /\{t\('display_only_word'\)\}/u);
});

test('the switch is stored per folder and defaults to off', () => {
  assert.match(read('src/types.ts'), /notifyAllWords\?: boolean;/u);
  // Written only when on, so a folder that never touched it keeps its old shape.
  assert.match(
    read('src/lib/sqlite/repositories.ts'),
    /if \(row\.notif_notify_all_words === 1\) folder\.notifSettings\.notifyAllWords = true;/u,
  );
  assert.match(read('App.tsx'), /notifyAllWords: folderNotifSettings\.notifyAllWords === true,/u);
});

test('every newly created folder explicitly starts with scheduling off', () => {
  const defaults = read('src/features/notifications/defaultSettings.ts');
  const folders = read('src/features/folders/useFolders.ts');
  const bootstrap = read('src/app/useAppBootstrap.ts');
  const db = read('src/lib/db.ts');

  assert.match(defaults, /return \{ intervalSeconds: 0, displayOnlyWord: false \};/u);
  assert.equal(
    (folders.match(/notifSettings: createDefaultFolderNotifSettings\(\)/gu) ?? []).length,
    3,
    'manual creation and both replacement-folder paths default off',
  );
  assert.match(bootstrap, /notifSettings: createDefaultFolderNotifSettings\(\)/u);
  assert.equal(
    (db.match(/notifSettings: createDefaultFolderNotifSettings\(\)/gu) ?? []).length,
    2,
    'both first-launch folders default off',
  );
  assert.doesNotMatch(defaults, /reschedule|scheduleNotification|requestPermission/u);
});

// ── The mute it replaced ─────────────────────────────────────────────────────

test('the old opt-out mute is gone from every surface', () => {
  for (const path of [
    'src/types.ts',
    'src/notifications.ts',
    'src/features/cards/useCards.ts',
    'src/components/SwipeableCard.tsx',
    'src/components/FlipCardBrowser.tsx',
    'src/screens/WordListScreen/WordListScreen.tsx',
    'src/app/AppModals.tsx',
    'App.tsx',
  ]) {
    const source = read(path).replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    assert.doesNotMatch(source, /notifOff/u, `${path} must not keep the mute`);
  }
  // Its strings went with it — nothing labels a word "Notification Off" now.
  assert.doesNotMatch(read('src/i18n.ts'), /notif_on\b|notif_off_action/u);
});

test('the upgrade keeps an existing user’s reminders arriving', () => {
  const schema = read('src/lib/sqlite/schema.ts');
  assert.match(schema, /ALTER TABLE words ADD COLUMN notif_candidate INTEGER NOT NULL DEFAULT 0;/u);
  assert.match(schema, /UPDATE words SET notif_candidate = 1 WHERE notif_off = 0;/u);
  assert.match(schema, /export const CURRENT_SCHEMA_VERSION = 5;/u);

  // Version 4 was consumed twice in development, so it can assert nothing and
  // the work lives in 5, which asks the database instead of trusting the number.
  // The behaviour is covered by tests/unit/notifCandidateMigration.test.ts.
  assert.match(schema, /version: 4,\s*async up\(\) \{\},/u, 'version 4 is retired, not reused');
  assert.match(schema, /if \(!words\.has\('notif_candidate'\)\) \{/u);
  assert.match(schema, /if \(!folders\.has\('notif_notify_all_words'\)\) \{/u);
  // The backfill sits inside the branch that created the column, so a database
  // that already had it is never re-backfilled over the user's own choices.
  const added = schema.slice(
    schema.indexOf("if (!words.has('notif_candidate')) {"),
    schema.indexOf("const folders = await tableColumns(db, 'folders');"),
  );
  assert.match(added, /UPDATE words SET notif_candidate = 1/u);
  assert.equal((schema.match(/UPDATE words SET notif_candidate = 1/gu) ?? []).length, 1);

  // A backup written before the change converts the same way.
  assert.match(
    read('src/lib/backup/importBackup.ts'),
    /if \(word\.notifOff !== undefined\) return word\.notifOff !== true;/u,
  );
  assert.match(read('src/lib/parsing.ts'), /: c\.notifOff !== true;/u);
});

test('toggling eligibility touches nothing else on the word', () => {
  const cards = read('src/features/cards/useCards.ts');
  const toggleStart = cards.indexOf('const toggleCardNotif');
  const toggleEnd = cards.indexOf('\n  };', toggleStart) + '\n  };'.length;
  const toggle = cards.slice(toggleStart, toggleEnd);
  assert.match(
    toggle,
    /c\.id === id \? \{ \.\.\.c, notifCandidate: !c\.notifCandidate \} : c/u,
    'one field, spread over the live card',
  );
  assert.doesNotMatch(
    toggle,
    /testLevel|testNextReview|hideWord|CLEAR_HIDE/u,
  );
});
