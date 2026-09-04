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

test('the picker is a centered popup, and every way out publishes the draft', () => {
  const body = voiceScreen();
  // A centred dialog over a backdrop, not a full-screen sheet.
  assert.match(body, /<Modal\s+visible=\{visible\}\s+transparent\s+animationType="fade"/u);
  assert.match(body, /style=\{styles\.voiceBackdrop\}/u);
  assert.doesNotMatch(body, /absoluteFillObject, styles\.voiceScreen/u);
  // Backdrop tap, Done and Android back all route to close(), which is the only
  // thing that publishes — so no dismissal can drop the choice or skip a sweep.
  assert.equal((body.match(/onPress=\{close\}/gu) ?? []).length, 2);
  assert.match(body, /onRequestClose=\{close\}/u);

  // The category headings are gone; two voices are listed flat.
  const settings = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');
  assert.match(body, /\{AI_VOICES\.map\(voice => \{/u);
  assert.doesNotMatch(settings, /AI_VOICE_GROUPS|voiceCategoryTitle/u);
  assert.doesNotMatch(
    fs.readFileSync('src/lib/aiVoices.ts', 'utf8'),
    /Female · Calm|Male · Cheerful/u,
  );
});

test('the Settings row carries the info button beside its label', () => {
  const settings = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');
  const row = /<CardBehaviorIcon name="mic-outline"[\s\S]*?<\/TouchableOpacity>\s*\)\}/u.exec(settings)?.[0];
  assert.ok(row, 'AI voice row not found');

  // Label, then the info button, inside the title group — not out at the edge
  // with the value and chevron.
  assert.match(row, /t\('feature_ai_voice'\)\}<\/Text>\s*\{\/\*[\s\S]*?\*\/\}\s*<TouchableOpacity\s+style=\{styles\.infoButton\}/u);
  assert.match(row, /showInfoPopup\(\{\s*title: t\('voice_pick_info_title'\),\s*body: t\('voice_pick_info_body'\),/u);
  // Its own tap target, and it cannot open the picker under it.
  assert.match(row, /onPress=\{event => \{\s*event\.stopPropagation\(\);/u);
  // The value and chevron stay where they were, on the right.
  assert.match(row, /<View style=\{styles\.voiceRowControl\}>[\s\S]*?getAIVoiceLabel\(aiVoice\)[\s\S]*?chevron-forward/u);
});

test('the sweep is the sheet closing, not the row tap', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  // Publishing on close is what feeds the voice-keyed sweep, so the generation
  // for a new voice starts after dismissal rather than while the sheet is open.
  assert.match(app, /const key = `\$\{plan\} \$\{aiVoice\} \$\{entitlementRevision\}`;/u);
  assert.match(app, /preloadAIPronunciationLibrary\(\{/u);
  // And it is the same queue and the same eligibility as every other preload.
  const tts = fs.readFileSync('src/lib/tts.ts', 'utf8');
  assert.match(tts, /for \(const entry of options\.entries\) \{\s*preloadAIPronunciation\(\{/u);
  assert.match(tts, /if \(!isAIConsentGranted\(\)\) return;/u);
});

test('clips for retired voices are collected, and only those', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  const tts = fs.readFileSync('src/lib/tts.ts', 'utf8');
  const voices = fs.readFileSync('src/lib/aiVoices.ts', 'utf8');

  assert.match(app, /useEffect\(\(\) => \{ purgeRetiredVoiceCaches\(\); \}, \[\]\);/u);
  // An allowlist of what may be deleted, never a denylist of what must stay:
  // a Marin or Cedar clip cannot be reached however a filename is shaped.
  assert.match(tts, /return segments\.length >= 3 && RETIRED_AI_VOICES\.has\(segments\[1\]\);/u);
  assert.doesNotMatch(tts, /!AI_VOICES\.includes|!isAIVoice\(/u);
  assert.match(voices, /export const RETIRED_AI_VOICES: ReadonlySet<string>/u);
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
