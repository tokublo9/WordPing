const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/**
 * When notification permission is asked for.
 *
 * Once, on the first tap of the Word List's notification icon — before any
 * interval is on screen, and never as a consequence of choosing one. The old
 * placement asked in the middle of a different decision and made the interval
 * the user had just tapped conditional on their answer, which is two questions
 * wearing one control.
 *
 * The rules pinned here are the ones that are invisible until they are wrong:
 * that nothing else prompts, that a determined state is not asked twice, and
 * that granting permission does not quietly switch notifications on.
 */

const HOOK = 'src/features/notifications/useFolderNotifications.ts';

// ── Where it is asked ────────────────────────────────────────────────────────

test('the first tap of the notification icon opens the sheet and asks', () => {
  const app = read('App.tsx');
  const handler = app.slice(app.indexOf('onOpenNotifications: () =>'));
  const body = handler.slice(0, handler.indexOf('},'));

  // The sheet first. The permission step never stands between the tap and the
  // screen the tap is for.
  assert.ok(
    body.indexOf('setNotificationModalVisible(true)') < body.indexOf('requestPermissionOnFirstOpen()'),
    'the sheet opens before anything is asked',
  );
  // The same tap spends the "!" — one tap, both effects.
  assert.match(body, /discovery\.dismiss\(FEATURE_MARKERS\.notificationIcon\)/u);
  assert.match(body, /requestPermissionOnFirstOpen\(\)/u);

  // Its own milestone, not the icon's marker: reusing `notificationIcon` would
  // mean anyone who had already opened the sheet was never asked at all.
  assert.match(
    app,
    /permissionPrompted: discovery\.seen\.has\(FEATURE_MARKERS\.notificationPermission\)/u,
  );
  assert.match(
    app,
    /onPermissionPrompted: \(\) => discovery\.dismiss\(FEATURE_MARKERS\.notificationPermission\)/u,
  );
});

test('choosing an interval asks for nothing', () => {
  const hook = read(HOOK);
  const pickAt = hook.indexOf('const handlePickInterval');
  const pick = hook.slice(pickAt, hook.indexOf('\n  /**', pickAt));

  assert.doesNotMatch(pick, /requestPermission|resolvePermission|PermissionState/u);
  // And the interval is applied outright rather than waiting on an answer.
  assert.match(pick, /updateFolderNotif\(\{ intervalSeconds: seconds \}\);/u);
});

test('nothing else in the app raises the prompt', () => {
  // One caller, so there is one place the question is asked from.
  const callers = ['App.tsx', HOOK, 'src/app/useAppBootstrap.ts', 'src/components/NotificationModal.tsx'];
  const asking = callers.filter(path => /\brequestPermission\(/u.test(read(path)));
  assert.deepEqual(asking, [HOOK]);
  // Bootstrap reads the state and must never prompt during startup.
  assert.match(read('src/app/useAppBootstrap.ts'), /getPermissionStatus\(\)/u);
});

// ── What it does with each answer ────────────────────────────────────────────

test('a determined state is never asked again', () => {
  const notifications = read('src/notifications.ts');
  const request = notifications.slice(notifications.indexOf('export async function requestPermission'));
  const body = request.slice(0, request.indexOf('\n}'));

  // The system prompt is reachable from `undetermined` alone.
  assert.match(body, /if \(current !== 'undetermined'\) return current;/u);
  assert.ok(
    body.indexOf("!== 'undetermined'") < body.indexOf('requestPermissionsAsync'),
    'the state is read before anything is asked',
  );

  // And the icon's step runs once per install.
  assert.match(read(HOOK), /if \(permissionPrompted\) return;/u);
});

test('a refusal is explained as Settings, never as another prompt', () => {
  const hook = read(HOOK);
  const guide = hook.slice(hook.indexOf('const showPermissionSettingsGuide'));

  assert.match(guide.slice(0, guide.indexOf('\n  };')), /t\('notif_permission_denied'\)/u);
  assert.match(guide.slice(0, guide.indexOf('\n  };')), /Linking\.openSettings\(\)/u);
  // Only `denied` is explained. A dismissed system prompt is not a refusal, and
  // stacking a dialog on top of it would read as the app arguing back.
  assert.match(hook, /if \(state === 'denied'\) showPermissionSettingsGuide\(\);/u);
});

test('granting permission changes no notification setting', () => {
  const hook = read(HOOK);
  const firstOpenAt = hook.indexOf('const requestPermissionOnFirstOpen');
  const firstOpen = hook.slice(firstOpenAt, hook.indexOf('\n  const sendTestForCurrentFolder', firstOpenAt));

  // No interval, no switch, no candidate — the permission is an OS answer, not
  // a preference the user has expressed.
  assert.doesNotMatch(firstOpen, /updateFolderNotif|setFolders|notifCandidate|intervalSeconds/u);
  // The one thing it does write is the app's copy of the OS answer, which is
  // what lets an already-chosen interval start firing.
  assert.match(hook, /setNotificationGranted\(state === 'granted'\);/u);
});

// ── The copy ─────────────────────────────────────────────────────────────────

test('every locale ships the guidance rather than falling back', () => {
  const i18n = read('src/i18n.ts');
  const locales = (i18n.match(/^const \w+: Dict = \{$/gmu) ?? []).length;
  assert.ok(locales >= 20, `expected the full locale set, found ${locales}`);
  for (const key of ['notif_permission_denied', 'notif_open_settings', 'notif_test_no_words']) {
    assert.equal(
      (i18n.match(new RegExp(`^  ${key}:`, 'gmu')) ?? []).length,
      locales,
      `${key} is missing from at least one locale`,
    );
  }
});
