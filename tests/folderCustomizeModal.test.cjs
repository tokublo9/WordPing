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
    /style=\{styles\.headerCloseButton\}[\s\S]{0,120}onPress=\{close\}[\s\S]{0,240}<Ionicons name="close"/u,
  );
});

test('New Folder header close uses the guarded cancellation path and cannot submit', () => {
  const modal = read('src/components/FolderCustomizeModal.tsx');
  const header = modal.slice(modal.indexOf('{/* Header */}'), modal.indexOf('<ScrollView'));

  assert.match(header, /onPress=\{close\}/u);
  assert.doesNotMatch(header, /onPress=\{handleSave\}|onSaveEdit|onSelect/u);
  assert.match(header, /accessibilityRole="button"/u);
  assert.match(header, /accessibilityLabel=\{t\('close'\)\}/u);
  assert.match(header, /hitSlop=\{\{ top: 8, bottom: 8, left: 8, right: 8 \}\}/u);
  assert.match(modal, /headerCloseButton:\s*\{\s*width: 44,\s*height: 44,/u);

  // Backdrop, Cancel, and system back all point at the same close function.
  assert.match(modal, /onRequestClose=\{close\}/u);
  assert.match(modal, /StyleSheet\.absoluteFillObject\} activeOpacity=\{1\} onPress=\{close\}/u);
  assert.match(modal, /style=\{\[styles\.btn, \{ backgroundColor: pal\.chip \}\]\}\s*onPress=\{close\}/u);

  // Repeated close requests cannot queue multiple animation callbacks.
  assert.match(modal, /if \(closingRef\.current\) return;\s*closingRef\.current = true;/u);
  assert.equal((modal.match(/onClose\(\);/gu) ?? []).length, 1);
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
