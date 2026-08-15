const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Add and Edit Folder share a handle-free sheet with natural header spacing', () => {
  const modal = read('src/components/FolderCustomizeModal.tsx');
  const appModals = read('src/app/AppModals.tsx');

  assert.equal(
    (appModals.match(/<FolderCustomizeModal/gu) ?? []).length,
    2,
    'Add and Edit Folder should continue to use the shared sheet',
  );
  assert.doesNotMatch(modal, /styles\.handleArea|styles\.handle|Drag handle/u);
  assert.doesNotMatch(modal, /handleArea:\s*\{|handle:\s*\{/u);
  assert.match(modal, /headerRow:\s*\{[\s\S]*?paddingTop:\s*20/u);
  assert.match(modal, /onRequestClose=\{close\}/u);
  assert.match(
    modal,
    /<TouchableOpacity onPress=\{handleSave\} hitSlop=\{\{ top: 10, bottom: 10, left: 10, right: 10 \}\}>\s*<Ionicons name="close"/u,
  );
});

test('the folder picker offers the original icons except heart and keeps legacy icons renderable', () => {
  const modal = read('src/components/FolderCustomizeModal.tsx');
  const iconList = modal.match(/export const FOLDER_ICONS = \[([\s\S]*?)\] as const;/u);
  assert.ok(iconList, 'folder icon source should exist');

  const icons = [...iconList[1].matchAll(/'([^']+)'/gu)].map(match => match[1]);
  assert.equal(icons.length, 15);
  assert.deepEqual(icons, [
    'folder-outline', 'folder-open-outline', 'book-outline',
    'star-outline', 'briefcase-outline', 'school-outline',
    'globe-outline', 'musical-notes-outline', 'home-outline',
    'leaf-outline', 'flash-outline', 'cafe-outline',
    'airplane-outline', 'ribbon-outline', 'fitness-outline',
  ]);
  assert.ok(!icons.includes('heart-outline'));

  // The current saved value still drives the preview and save path even when it is no
  // longer one of the selectable options, so legacy heart folders remain valid.
  assert.match(modal, /setSelectedIcon\(currentValue\)/u);
  assert.match(modal, /name=\{selectedIcon as any\}/u);
  assert.match(modal, /onSaveEdit\?\.\(trimmed, selectedIcon\)/u);
});
