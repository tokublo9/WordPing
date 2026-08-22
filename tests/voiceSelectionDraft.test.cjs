const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

/**
 * The TTS file cache is keyed by voice, so App's preload effect re-generates the
 * entire word library whenever `aiVoice` changes. Publishing the choice on every
 * row tap therefore cost a full library sweep per tap — most of them for voices
 * the user was only comparing. The screen holds a draft and publishes once, on
 * the way out.
 */

function voiceScreen() {
  const source = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');
  const body = /function VoiceSelectionScreen\(\{[\s\S]*?\n\}\n/u.exec(source)?.[0];
  assert.ok(body, 'VoiceSelectionScreen not found');
  return body;
}

test('tapping a voice row only updates the draft, never the saved preference', () => {
  const body = voiceScreen();
  const rowPress = /onPress=\{\(\) => \{\s*previewSequence\.current\+\+;[\s\S]*?\}\}/u.exec(body)?.[0];
  assert.ok(rowPress, 'row press handler not found');
  assert.match(rowPress, /setDraftVoice\(voice\)/u);
  assert.doesNotMatch(rowPress, /onSelect/u, 'a row tap must not publish the choice');
});

test('the choice is published exactly once, on leaving the screen', () => {
  const body = voiceScreen();
  // Counts real invocations only: `onSelect(` also appears in the prop type
  // signature, which is a declaration rather than a call site.
  assert.equal(
    (body.match(/onSelect\((?!voice: AIVoice\))/gu) ?? []).length,
    1,
    'onSelect should be invoked from close() alone',
  );
  // Backing out unchanged must not trigger a library sweep for the same voice.
  assert.match(body, /if \(draftVoice !== selectedVoice\) onSelect\(draftVoice\);/u);
});

test('the highlight follows the draft, not the saved value', () => {
  const body = voiceScreen();
  assert.match(body, /const selected = voice === draftVoice;/u);
});

test('reopening the screen starts from the saved voice', () => {
  const body = voiceScreen();
  // Adjusted during render, so an abandoned draft cannot paint for a frame on
  // the next open.
  assert.match(
    body,
    /if \(visible !== renderedVisible\) \{\s*setRenderedVisible\(visible\);\s*if \(visible\) setDraftVoice\(selectedVoice\);/u,
  );
});

test('preview stays a separate action that does not select', () => {
  const body = voiceScreen();
  // The play button is its own tap target inside the row; previewing a voice
  // must not move the selection, or comparing would commit by accident.
  const previewPress = /onPress=\{\(\) => preview\(voice\)\}/u;
  assert.match(body, previewPress);
  const previewFn = /const preview = useCallback\(async \(voice: AIVoice\) => \{[\s\S]*?\}, \[/u.exec(body)?.[0];
  assert.ok(previewFn, 'preview handler not found');
  assert.doesNotMatch(previewFn, /setDraftVoice|onSelect/u);
});
