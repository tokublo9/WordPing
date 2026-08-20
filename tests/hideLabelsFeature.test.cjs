const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function withoutJsxComments(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

test('Hide Labels UI is dormant without leaving its row separator behind', () => {
  const source = fs.readFileSync('src/app/AppContextMenu.tsx', 'utf8');
  const activeRender = withoutJsxComments(source).split('const styles =')[0];

  assert.doesNotMatch(activeRender, /hide_level_labels|show_level_labels/u);
  assert.doesNotMatch(activeRender, /onToggleLevelLabels|showLevelLabels/u);
  assert.equal(
    (activeRender.match(/styles\.sep/gu) ?? []).length,
    1,
    'only the separator between Select Entries and Reorder should remain',
  );
  assert.match(source, /Hide Labels is temporarily disabled[\s\S]*?onToggleLevelLabels/u);
});

test('labels stay visible while the retained Hide Labels implementation is unused', () => {
  const app = withoutJsxComments(fs.readFileSync('App.tsx', 'utf8'));
  const cards = fs.readFileSync('src/features/cards/useCards.ts', 'utf8');
  const translations = fs.readFileSync('src/i18n.ts', 'utf8');

  assert.match(app, /const SHOW_LEVEL_LABELS = true;/u);
  assert.equal(
    (app.match(/showLevelLabels=\{SHOW_LEVEL_LABELS\}/gu) ?? []).length,
    2,
    'Folder List and Word List should both keep labels visible',
  );
  assert.doesNotMatch(app, /setShowLevelLabels\(/u);
  assert.match(cards, /useState\(true\)[\s\S]*?showLevelLabels, setShowLevelLabels/u);
  assert.match(translations, /show_level_labels/u);
  assert.match(translations, /hide_level_labels/u);
});
