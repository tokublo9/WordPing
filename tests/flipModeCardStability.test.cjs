const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

/**
 * Two invariants that are structural, not arithmetic, so there is no pure module to
 * drive instead: which tree a Flip slot renders, and where playback is stopped.
 */

// ── The one-frame text flash ─────────────────────────────────────────────────

test('a slot renders the same tree whether or not it is the centred card', () => {
  const flip = read('src/components/FlipCardBrowser.tsx');
  const deck = flip.slice(flip.indexOf('<View style={s.deckWrap}>'), flip.indexOf('{/* Progress bar */}'));

  // The cause of the flash: an adjacent preview used to be a flat View, so the slot a
  // swipe promoted to centre had its subtree unmounted and a ScrollView mounted in its
  // place — the card box painted first and its text arrived with the next layout.
  // Becoming current must be a prop change on already-mounted, already-measured views.
  assert.doesNotMatch(deck, /s\.cardInner/u, 'the separate preview tree must be gone');
  assert.doesNotMatch(flip, /cardInner:/u, 'and its style with it');
  assert.doesNotMatch(deck, /\{isCurr \? \(\s*\/\/ Pressable|isCurr \? \([\s\S]{0,40}<>/u);

  // One front face, rendered unconditionally, with only its props varying by slot.
  const frontFaces = deck.match(/<CardScrollFace/gu) ?? [];
  assert.equal(frontFaces.length, 2, 'one front face for every slot, one back face');
  assert.match(deck, /isCurr\s*\?\s*\{ opacity: frontOpacity, transform: \[\{ perspective: 900 \}/u);
  assert.match(deck, /onFlip=\{isCurr \? doFlip : noFlip\}/u);
  assert.match(deck, /showVoice=\{isCurr\}/u);
  assert.match(deck, /pointerEvents=\{isCurr \? 'auto' : 'none'\}/u);

  // The back face is the only conditional child, and it mounts behind a fully
  // transparent front face, so nothing of it is ever seen arriving.
  assert.match(deck, /\{isCurr \? \(\s*<Animated\.View\s*style=\{\[s\.face, s\.faceAbsolute/u);

  // The correct side is rendered immediately on a card change: the flip value and the
  // side flag are reset synchronously, never from an effect that lands after paint.
  assert.match(flip, /const goTo = useCallback\([\s\S]{0,240}flipAnim\.setValue\(0\);\s*setFlipped\(false\);/u);
});

test('slot content comes from the current render, not from a later effect', () => {
  const flip = read('src/components/FlipCardBrowser.tsx');
  // Text is read straight from the resolved card during render. An effect that patched
  // it afterwards would reintroduce the flash by another route.
  assert.match(flip, /const c = resolveLatestCard\(slotCards\[si\]\);/u);
  assert.match(flip, /cardsById\.get\(slotCard\.id\) \?\? slotCard/u);
  // Slots are keyed by their fixed physical position, never by card id or index, so a
  // navigation never remounts a slot.
  assert.match(flip, /<Animated\.View\s*key=\{si\}/u);
});

// ── Voice stops with the text it belongs to ──────────────────────────────────

test('Flip Mode stops playback on every way the shown text can change', () => {
  const flip = read('src/components/FlipCardBrowser.tsx');

  // Tapping the card to flip it — including the tap that flips back to the front.
  assert.match(flip, /const doFlip = useCallback\(\(\) => \{[\s\S]{0,600}\.start\([\s\S]*?stopVoice\(\);/u);
  // A committed swipe, stopped as the navigation is decided rather than when the
  // 220ms animation lands.
  assert.match(
    flip,
    /if \(toNext \|\| toPrev\) \{\s*transitioningRef\.current = true;[\s\S]{0,240}stopVoice\(\);/u,
  );
  // Any jump: scrubber drag, track tap, delete, and the external-order resync.
  assert.match(flip, /const goTo = useCallback\(\(newIdx: number, publishCurrentWord = true\) => \{\s*stopVoice\(\);/u);
  // Leaving the mode, while both layers stay mounted.
  assert.match(flip, /if \(active\) return;[\s\S]{0,200}stopVoice\(\);/u);

  // One shared player for the screen — the hook is called once, for the centred card.
  assert.equal((flip.match(/useWordCardVoicePlayback\(/gu) ?? []).length, 1);
  assert.match(flip, /item: activeVoiceCard,/u);
});

test('Test Mode stops playback on a flip in either direction', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  // Unconditional in the tap handler: muting only hides the icon, so a clip that
  // was already playing must not survive the next flip either.
  assert.match(screen, /const doToggleFlip = useCallback\(\(\) => \{[\s\S]{0,900}stopVoice\(\);/u);
  assert.doesNotMatch(screen, /if \(!muted\) stopVoice\(\);\s*Animated\.timing\(flipAnim/u);
  // Grading advances the card, and that stops too.
  assert.match(screen, /gradedIdsRef\.current\.add\(card\.id\);\s*stopVoice\(\);/u);
  // Still one player for the screen.
  assert.equal((screen.match(/useWordCardVoicePlayback\(/gu) ?? []).length, 1);
});

test('card taps start both flip animations without awaiting Custom Voice cleanup', () => {
  const cases = [
    ['src/components/FlipCardBrowser.tsx', 'const doFlip = useCallback', 'const noFlip'],
    ['src/components/TestModeScreen.tsx', 'const doToggleFlip = useCallback', 'const advance'],
  ];

  for (const [path, start, end] of cases) {
    const source = read(path);
    const handler = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const stopAt = handler.indexOf('stopVoice();');
    const animationAt = handler.indexOf('Animated.timing(');
    const animationStartAt = handler.indexOf('.start(', animationAt);
    assert.ok(
      animationStartAt > -1 && stopAt > animationStartAt,
      `${path} starts its native animation before audio work`,
    );
    assert.doesNotMatch(handler, /await|\.then\(/u, `${path} must not wait for cleanup`);
  }
});

test('Custom Voice pauses now and destroys its player after the flip interaction', () => {
  const tts = read('src/lib/tts.ts');
  const custom = tts.slice(
    tts.indexOf('export async function speakCustom'),
    tts.indexOf('// ── Public API'),
  );
  const cleanup = read('src/lib/audioPlayerCleanup.ts');

  assert.match(custom, /if \(stopping\) \{[\s\S]*?player\.pause\(\);[\s\S]*?\}/u);
  assert.match(custom, /if \(stopping\) deferAudioPlayerRemoval\(player\);/u);
  assert.doesNotMatch(
    custom,
    /if \(stopping\) \{[^}]*player\.remove\(\)/u,
    'native removal must not run in the card-tap stop stack',
  );
  // One macrotask lets Animated.start register its interaction before cleanup
  // waits for that interaction to finish.
  assert.match(cleanup, /setTimeout\(\(\) => \{[\s\S]*?InteractionManager\.runAfterInteractions\(cleanup\)/u);
});

test('stale Custom Voice status cannot update a flipped or changed card', () => {
  const tts = read('src/lib/tts.ts');
  const custom = tts.slice(
    tts.indexOf('export async function speakCustom'),
    tts.indexOf('// ── Public API'),
  );

  assert.match(
    custom,
    /addListener\('playbackStatusUpdate',[\s\S]*?if \(settled \|\| myEpoch !== epoch\) return;/u,
  );
  assert.match(custom, /if \(settled\) return;\s*settled = true;\s*sub\.remove\(\);/u);
});

test('the shared hook stops audio when the card changes, from one place', () => {
  const hook = read('src/hooks/useWordCardVoicePlayback.ts');

  // Every navigation path ends with the spoken card changing identity, so one stop
  // here covers the ones a screen might forget.
  assert.match(
    hook,
    /const spokenItemIdRef = useRef\(itemId\);\s*useEffect\(\(\) => \{\s*if \(spokenItemIdRef\.current === itemId\) return;\s*spokenItemIdRef\.current = itemId;\s*abandonPlayback\(\);/u,
  );
  // Mounting is not a card change, so a freshly mounted row stops nothing.
  assert.match(hook, /const itemId = item\?\.id \?\? null;/u);

  // Stopping is safe with nothing playing, and a background row cannot silence the
  // screen in front of it: the global stop is only used when this hook owns the audio.
  assert.match(
    hook,
    /const abandonPlayback = useCallback\(\(\) => \{\s*sequenceRef\.current\+\+;\s*if \(voiceStateRef\.current\) stopPlayback\(\);/u,
  );
});

test('a request in flight cannot start after the user has moved on', () => {
  const hook = read('src/hooks/useWordCardVoicePlayback.ts');
  const play = hook.slice(hook.indexOf('const play = useCallback('), hook.indexOf('const playWord ='));

  // The sequence is claimed before the consent prompt, not after it, so a flip or a
  // swipe while the dialog is open abandons the request instead of letting it speak.
  const sequenceAt = play.indexOf('const sequence = ++sequenceRef.current;');
  const consentAt = play.indexOf('await ensureAIConsentForUserAction()');
  assert.ok(sequenceAt > -1 && consentAt > sequenceAt, 'the sequence must precede consent');
  assert.match(play, /if \(sequenceRef\.current !== sequence\) return;/u);
  // Repeated taps on the same button remain a stop, not a second player.
  assert.match(play, /if \(voiceStateRef\.current\?\.target === target\) \{\s*stopVoice\(\);\s*return;/u);
  // Asking for the other side stops what is playing now, rather than leaving it
  // running until the new clip is fetched and claims audio focus.
  assert.match(play, /if \(voiceStateRef\.current\) abandonPlayback\(\);/u);

  // The engine below is the one that owns cancellation: every stop bumps the epoch a
  // resolved fetch is checked against, so no second player is ever created.
  const tts = read('src/lib/tts.ts');
  assert.match(tts, /export function stopPlayback\(\): void \{\s*stopCurrent\(\);[\s\S]*?epoch\+\+;/u);
  assert.match(tts, /if \(myEpoch !== epoch\) throw new Error\('cancelled'\);/u);
  // And a new playback claims app-wide audio focus, which stops the previous owner.
  assert.match(tts, /focusToken = claimAudioFocus\(stopPlayback\);/u);
});
