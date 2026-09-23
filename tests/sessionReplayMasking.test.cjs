const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/**
 * That nothing is recorded, and that the masking which made recording safe is
 * still in place if it ever is again.
 *
 * PostHog has been removed: the last four tests in this file are what holds
 * that — no client, no capture, no research properties, no Share Usage Data
 * row. The masking tests above them are deliberately kept. The mask wrappers
 * are still in the tree, and they are the only reason a restored Session
 * Replay would not screenshot the user's vocabulary on its first frame; a
 * wrapper silently dropped while replay is off would be found only after it
 * had already been recorded.
 *
 * Replay on React Native is screenshots, so anything legible on screen is in the
 * recording unless a native view carries the mask marker. Two rules matter and
 * neither is visible from a diff of any single file: every place a stored field
 * is drawn must be wrapped, and the wrapper must be chosen by *provenance* —
 * whether the app or the user wrote the text — rather than by reading the text.
 */

/** Every .tsx under src, so a new screen cannot quietly skip the sweep. */
function tsxFiles(dir = 'src', out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Every .ts and .tsx under src. */
function tsFiles(dir = 'src', out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(full, out);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const STORED_FIELD = /\{\s*(?:item|card|c|word|folder|draggingCard)!?\.(?:word|meaning|note|name)\s*(?:\?\?[^}]*)?\}|\{folderName\}/u;

test('every rendered front, back, note and folder name sits inside a mask wrapper', () => {
  const unmasked = [];
  let sites = 0;
  for (const file of tsxFiles()) {
    const lines = read(file).split('\n');
    lines.forEach((line, index) => {
      if (!STORED_FIELD.test(line)) return;
      sites += 1;
      // The wrapper opens on one of the few lines above the value it guards.
      const window = lines.slice(Math.max(0, index - 6), index + 1).join('\n');
      if (!window.includes('<MaskedUserText') && !window.includes('<PostHogMaskView')) {
        unmasked.push(`${file}:${index + 1}`);
      }
    });
  }
  assert.ok(sites >= 24, `expected the known render sites, found ${sites}`);
  assert.deepEqual(unmasked, [], 'these render stored text with nothing masking it');
});

test('visibility comes from a stored flag, never from the id or the text', () => {
  const rule = read('src/features/cards/builtInCards.ts');
  const code = rule.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

  // One question, asked of one persisted field.
  assert.match(code, /card\?\.builtIn === true/u);
  assert.match(code, /return !isBuiltInTutorialCard\(card\);/u);

  // Not the id: a seeded id survives editing, so it cannot decide visibility.
  // Not the copy, its translation, the position, or the folder either.
  assert.doesNotMatch(code, /WELCOME_CARD_IDS|wp-w|\.id\b|\.word\b|\.meaning\b|\.note\b|folderId|indexOf|\[i\]/u);
  // Comment-stripped: the prose above mentions imports, the file has none.
  assert.doesNotMatch(code, /^import /mu, 'the rule depends on nothing');
});

test('the flag is written where provenance is known and cleared on the first content edit', () => {
  // Both creation paths mark their own copy.
  assert.equal((read('src/lib/db.ts').match(/builtIn: true/gu) ?? []).length, 8, 'all eight seeds');
  assert.equal(
    (read('src/features/onboarding/welcomeContent.ts').match(/builtIn:\s+true,/gu) ?? []).length, 2,
    'both buildWelcomeCards branches',
  );

  // The first edit of front, back or note drops it, and only those three.
  const cards = read('src/features/cards/useCards.ts');
  assert.match(cards, /c\.builtIn === true\s*&& \(c\.word !== edits\.word \|\| c\.meaning !== edits\.meaning \|\| c\.note !== edits\.note\)\s*\? \{ builtIn: undefined \}/u);
  // Applied through the ordinary edit, so it rides the same persist.
  assert.match(cards, /\{ \.\.\.c, \.\.\.edits, \.\.\.declassify\(c\) \}/u);
});

test('the column is durable, defaults to masked, and backfills nothing', () => {
  const schema = read('src/lib/sqlite/schema.ts');
  assert.match(schema, /export const CURRENT_SCHEMA_VERSION = 6;/u);
  assert.match(schema, /built_in {5}INTEGER NOT NULL DEFAULT 0/u, 'fresh installs carry the column');
  assert.match(schema, /ALTER TABLE words ADD COLUMN built_in INTEGER NOT NULL DEFAULT 0;/u);

  // No backfill: an existing wp-w* row may already have been edited, so every
  // pre-existing row stays masked.
  const sixth = schema.slice(schema.indexOf('version: 6,'));
  assert.doesNotMatch(sixth, /UPDATE words SET built_in/u, 'nothing is retroactively trusted');
  assert.doesNotMatch(sixth, /wp-w|WELCOME_CARD_IDS/u);

  // It round-trips through the one place vocabulary SQL is written.
  const repos = read('src/lib/sqlite/repositories.ts');
  assert.match(repos, /if \(row\.built_in === 1\) card\.builtIn = true;/u);
  assert.match(repos, /built_in = excluded\.built_in/u);
  assert.match(repos, /card\.builtIn === true \? 1 : 0,/u);

  // A backup carries no provenance, so a restore lands masked and the backup
  // format version does not move.
  assert.doesNotMatch(read('src/lib/backup/exportBackup.ts'), /built_in/u);
  assert.doesNotMatch(read('src/lib/backup/importBackup.ts'), /built_in/u);
});

test('the two masking branches render the same view, so layout cannot shift', () => {
  const component = read('src/components/MaskedUserText.tsx');

  // Both branches are a View with the same style. Returning children bare when
  // unmasked would drop the wrapper's style — and with it the flex the wrapper
  // took from the Text at three call sites — so a tutorial card would lay out
  // differently from the user's.
  assert.match(component, /<PostHogMaskView style=\{style\}>\{children\}<\/PostHogMaskView>/u);
  assert.match(component, /<View style=\{style\} collapsable=\{false\}>\{children\}<\/View>/u);
});

// ── Native alerts ────────────────────────────────────────────────────────────

test('no native alert carries a front, back, note or folder name', () => {
  // An Alert is an OS view. Session Replay captures it and no React wrapper can
  // reach inside it, so the only fix is not to put the value there.
  const hook = read('src/features/notifications/useFolderNotifications.ts');
  assert.match(hook, /t\('notif_conflict_body'\),/u);
  assert.doesNotMatch(hook, /conflictName|targetName/u);
  assert.doesNotMatch(hook, /notif_conflict_body'\)\.replace/u);

  // The copy itself no longer has slots to fill, in any locale.
  const i18n = read('src/i18n.ts');
  for (const value of i18n.match(/notif_conflict_body: '[^']*'/gu) ?? []) {
    assert.doesNotMatch(value, /\{0\}|\{1\}/u, `placeholder left in: ${value}`);
  }

  // Same for the standalone-audio screen, fixed while it is still switched off.
  assert.doesNotMatch(read('src/components/TextToSpeechScreen.tsx'), /Delete “\$\{item\.filename\}”/u);
});

/** Source with block comments and whole-line `//` comments removed. */
function live(relative) {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

test('no analytics client is constructed, so nothing can be captured', () => {
  // PostHog was removed. The module still exists, and the whole previous
  // integration is kept commented out inside it so it can be restored
  // deliberately — which is exactly why this reads the live code only.
  const config = live('src/config/posthog.ts');

  assert.match(config, /export const posthog: PostHog \| undefined = undefined;/u);
  assert.doesNotMatch(config, /new PostHog\(/u, 'no client may be constructed');
  assert.doesNotMatch(config, /enableSessionReplay|sessionReplayConfig/u, 'no replay configuration');
  assert.doesNotMatch(config, /optIn\(\)|optOut\(\)|setPersonProperties|\.capture\(/u);
  // A type-only import: the package must not be pulled into the runtime graph
  // by this module.
  assert.match(config, /^import type PostHog from 'posthog-react-native';$/mu);

  // The provider is gone too, so no lifecycle event, screen event or Session
  // Replay frame is captured by the SDK's own instrumentation.
  const app = live('App.tsx');
  assert.match(app, /export default function App\(\) \{\s*return <AppContent \/>;\s*\}/u);
  assert.doesNotMatch(app, /PostHogProvider|PostHogErrorBoundary|publishAnalyticsResearchProperties\(\)/u);
});

test('no event is captured anywhere in the app', () => {
  const offenders = [];
  for (const file of ['App.tsx', ...tsFiles()]) {
    if (/\.capture\(/u.test(live(file))) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'these still capture an analytics event');
});

test('the research properties are no longer built or sent', () => {
  // `parseOnboardingChoices` stays — bootstrap reads the stored answers to
  // restore the languages — but nothing derives a payload from them any more.
  const research = live('src/features/onboarding/researchProperties.ts');
  assert.match(research, /export function parseOnboardingChoices/u);
  assert.doesNotMatch(research, /export function buildResearchProperties/u);

  const sender = live('src/lib/analyticsResearchProperties.ts');
  assert.equal(sender.trim(), '', 'the sender must be commented out in full');
});

test('Share Usage Data is gone from Settings, with no consent left to read', () => {
  const settings = live('src/components/SettingsModal.tsx');
  assert.doesNotMatch(settings, /analytics_setting|analyticsInfoVisible|setAnalyticsConsent/u);
  assert.doesNotMatch(settings, /from '\.\.\/lib\/analyticsConsent'/u);
});

/**
 * The one input deliberately left legible.
 *
 * It searches the app's own theme catalogue, so what is useful to type into it
 * is app-provided names — not one of the private categories. Listed by file
 * rather than waived wholesale, so any *other* unmasked input still fails.
 */
const VISIBLE_INPUT_FILES = new Set(['src/components/KisekaeShopSheet.tsx']);

test('every TextInput that can hold the user’s own words is masked individually', () => {
  // With the global flag off this was the only thing standing between a private
  // field and the recording, so it is checked over the whole tree rather than a
  // list of files someone has to remember to extend. Kept while replay is off:
  // see the note at the top of this file.
  const unmasked = [];
  let inputs = 0;
  for (const file of tsxFiles()) {
    const lines = read(file).split('\n');
    lines.forEach((line, index) => {
      // JSX only — `useRef<TextInput>` is a type, not a rendered input.
      if (!/<TextInput$|<TextInput\s/u.test(line.trim())) return;
      inputs += 1;
      if (VISIBLE_INPUT_FILES.has(file)) return;
      const window = lines.slice(Math.max(0, index - 8), index + 1).join('\n');
      if (!window.includes('<PostHogMaskView') && !window.includes('<MaskedUserText')) {
        unmasked.push(`${file}:${index + 1}`);
      }
    });
  }
  assert.ok(inputs >= 7, `expected the known inputs, found ${inputs}`);
  assert.deepEqual(unmasked, [], 'these inputs would be recorded in the clear');

  // The exception is one input in one file, and it stays that way.
  const shop = read('src/components/KisekaeShopSheet.tsx');
  assert.equal((shop.match(/<TextInput/gu) ?? []).length, 1, 'the shop has one input');
  assert.doesNotMatch(shop, /PostHogMaskView|MaskedUserText/u, 'and it is deliberately unmasked');
});

test('no user-supplied image can reach a recording', () => {
  // `maskAllImages: false` is only safe because every image is a bundled asset.
  // There is no picker, no camera, and no image field on a card.
  const sources = [];
  for (const file of tsxFiles()) sources.push(read(file));
  const all = sources.join('\n');
  assert.doesNotMatch(all, /ImagePicker|launchCamera|launchImageLibrary/u);
  assert.doesNotMatch(read('src/types.ts'), /\bimage\b|avatar|photo/u, 'no image field on a card');
});
