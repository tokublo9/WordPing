import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  AI_CONSENT_KEY,
  configureAIConsentStorage,
  getAIConsent,
  loadAIConsent,
  resetAIConsentForTests,
  setAIConsent,
} from '../../src/lib/aiConsent';
import {
  dismissAIConsentPrompt,
  ensureAIConsentForUserAction,
  isAIConsentPromptOpen,
  registerAIConsentPromptHost,
  resetAIConsentPromptForTests,
  resolveAIConsentPrompt,
} from '../../src/lib/aiConsentPrompt';
import {
  createVoicePreviewFlow,
  previewPhaseForPlayback,
  voicePreviewBusyVoice,
  voicePreviewPlayingVoice,
  type VoicePreviewFlow,
  type VoicePreviewSnapshot,
} from '../../src/features/voice/voicePreviewFlow';
import { AI_VOICES, type AIVoice } from '../../src/lib/aiVoices';
import type { TTSPlaybackPhase } from '../../src/lib/ttsPlaybackState';

/**
 * Tapping a Marin or Cedar sample from the voice picker.
 *
 * The bug these cover: the picker is a presented modal of its own, and the only
 * consent host mounted was the one out in Settings — underneath it. iOS refuses
 * to present a second modal from a controller that is already presenting one,
 * so the dialog never appeared and the promise the sample was waiting on never
 * settled. Debug builds logged a warning; TestFlight was silent, and every
 * sample tap did nothing for the rest of the session.
 *
 * The host is now mounted inside the picker (asserted structurally in
 * tests/voicePreviews.test.cjs, since it is JSX). What is exercised here is
 * everything that has to be true once the dialog can be seen: the same question
 * the Word List asks, the tapped sample playing on Allow, nothing playing on
 * any other answer, one dialog however many taps arrive, and a run that always
 * ends with the rows back at rest — including when there is no host at all.
 */

class FakeStore {
  readonly writes: string[] = [];
  constructor(private value: string | null = null) {}
  getItem(key: string): Promise<string | null> {
    assert.equal(key, AI_CONSENT_KEY);
    return Promise.resolve(this.value);
  }
  setItem(key: string, value: string): Promise<void> {
    assert.equal(key, AI_CONSENT_KEY);
    this.writes.push(value);
    this.value = value;
    return Promise.resolve();
  }
}

/** Stands in for the `AIConsentDialog` the picker now mounts inside itself. */
class FakeConsentHost {
  opens = 0;
  visible = false;
  private unregister: (() => void) | null = null;

  mount(): this {
    this.unregister = registerAIConsentPromptHost({
      open: () => { this.opens += 1; this.visible = true; },
      close: () => { this.visible = false; },
    });
    return this;
  }

  /** The screen going away — the picker closing, or Settings being dismissed. */
  unmount(): void {
    this.unregister?.();
    this.unregister = null;
  }
}

const IDLE: VoicePreviewSnapshot<AIVoice> = { voice: null, phase: 'idle' };

interface Harness {
  flow: VoicePreviewFlow<AIVoice>;
  /** Every voice a generation was actually started for, in order. */
  readonly played: AIVoice[];
  readonly errors: unknown[];
  current(): VoicePreviewSnapshot<AIVoice>;
  stops(): number;
  /** What the two rows would draw right now. */
  busy(): AIVoice | null;
  playing(): AIVoice | null;
}

/**
 * The picker's preview wiring, with the real consent module behind it.
 *
 * Only `play` and `stop` are faked: those are expo-audio. The question, the
 * dialog routing and the stored decision are the production modules.
 */
function harness(
  play?: (voice: AIVoice, report: (phase: TTSPlaybackPhase) => void) => Promise<void>,
): Harness {
  const played: AIVoice[] = [];
  const errors: unknown[] = [];
  let snapshot: VoicePreviewSnapshot<AIVoice> = IDLE;
  let stopCount = 0;

  const flow = createVoicePreviewFlow<AIVoice>({
    ensureConsent: () => ensureAIConsentForUserAction(),
    play: play ?? (async (voice, report) => {
      played.push(voice);
      report('checking-cache');
      report('generating-or-downloading');
      report('playing');
      report('idle');
    }),
    stop: () => { stopCount += 1; },
    onChange: next => { snapshot = next; },
    onError: error => { errors.push(error); },
  });

  return {
    flow,
    played,
    errors,
    current: () => snapshot,
    stops: () => stopCount,
    busy: () => voicePreviewBusyVoice(snapshot),
    playing: () => voicePreviewPlayingVoice(snapshot),
  };
}

/** One turn of the loop: `ensureAIConsentForUserAction` awaits a storage read. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** Both rows tappable, nothing spinning, nothing marked as sounding. */
function assertAtRest(h: Harness, note: string): void {
  assert.deepEqual(h.current(), IDLE, note);
  assert.equal(h.busy(), null, `${note}: no row may be left spinning`);
  assert.equal(h.playing(), null, `${note}: no row may be left showing stop`);
}

beforeEach(() => {
  resetAIConsentForTests();
  resetAIConsentPromptForTests();
});

test('the picker previews the two voices the app ships, and only those', () => {
  assert.deepEqual([...AI_VOICES], ['marin', 'cedar']);
});

// ── 1 & 2: the question, then the sample that was tapped ─────────────────────

for (const [voice, stored] of [['marin', null], ['cedar', 'declined']] as const) {
  test(`a ${stored ?? 'missing'} decision asks before the ${voice} sample and plays it on Allow`, async () => {
    const store = new FakeStore(stored);
    configureAIConsentStorage(store);
    const host = new FakeConsentHost().mount();
    const h = harness();

    const request = h.flow.request(voice);
    await flush();

    // The dialog is up, and nothing has been generated behind it.
    assert.equal(host.opens, 1);
    assert.equal(host.visible, true);
    assert.equal(isAIConsentPromptOpen(), true);
    assert.deepEqual(h.played, [], 'nothing may be generated before the answer');
    assert.equal(h.busy(), voice, 'the tapped row shows the tap registered');

    await resolveAIConsentPrompt('granted');
    assert.equal(await request, 'played');

    // Allow persists through the shared store — the same one the Word List
    // reads — and continues the run that asked, without a second tap.
    assert.equal(getAIConsent(), 'granted');
    assert.deepEqual(store.writes, ['granted']);
    assert.deepEqual(h.played, [voice], 'the sample tapped is the sample played');
    assertAtRest(h, 'after a completed preview');
  });
}

test('consent revoked mid-session asks again, and Cedar still plays on Allow', async () => {
  const store = new FakeStore('granted');
  configureAIConsentStorage(store);
  await loadAIConsent();
  // About AI Voice → Revoke Permission.
  await setAIConsent('declined');

  const host = new FakeConsentHost().mount();
  const h = harness();
  const request = h.flow.request('cedar');
  await flush();
  assert.equal(host.opens, 1, 'a revoked permission is asked for again');

  await resolveAIConsentPrompt('granted');
  assert.equal(await request, 'played');
  assert.deepEqual(h.played, ['cedar']);
  assert.deepEqual(store.writes, ['declined', 'granted']);
});

test('a granted decision plays straight away, with no dialog', async () => {
  configureAIConsentStorage(new FakeStore('granted'));
  const host = new FakeConsentHost().mount();
  const h = harness();

  assert.equal(await h.flow.request('marin'), 'played');
  assert.equal(host.opens, 0, 'a granted user is never re-prompted');
  assert.deepEqual(h.played, ['marin']);
  assertAtRest(h, 'after a preview that needed no dialog');
});

// ── 3: no answer, no playback, and the controls come back ────────────────────

for (const voice of AI_VOICES) {
  test(`Not Now plays no ${voice} sample and returns the rows to rest`, async () => {
    const store = new FakeStore(null);
    configureAIConsentStorage(store);
    new FakeConsentHost().mount();
    const h = harness();

    const request = h.flow.request(voice);
    await flush();
    await resolveAIConsentPrompt('declined');

    assert.equal(await request, 'consent_refused');
    assert.deepEqual(h.played, [], 'declining must not generate anything');
    assert.deepEqual(store.writes, ['declined']);
    assertAtRest(h, 'after Not Now');
  });

  test(`dismissing the dialog plays no ${voice} sample and stores nothing`, async () => {
    const store = new FakeStore(null);
    configureAIConsentStorage(store);
    const h = harness();
    new FakeConsentHost().mount();

    const request = h.flow.request(voice);
    await flush();
    // A backdrop tap, a swipe, or the Android back button.
    dismissAIConsentPrompt();

    assert.equal(await request, 'consent_refused');
    assert.deepEqual(h.played, []);
    assert.deepEqual(store.writes, [], 'a dismissal is not a decision');
    assert.equal(getAIConsent(), 'unknown', 'so the next tap asks again');
    assertAtRest(h, 'after a dismissal');
  });

  test(`a refused ${voice} sample leaves the picker able to try again`, async () => {
    configureAIConsentStorage(new FakeStore(null));
    new FakeConsentHost().mount();
    const h = harness();

    const declined = h.flow.request(voice);
    await flush();
    dismissAIConsentPrompt();
    await declined;
    assertAtRest(h, 'after the dismissal');

    // The very next tap is a fresh request, not a no-op left over from the
    // abandoned one: the flow released the row in its `finally`.
    const retry = h.flow.request(voice);
    await flush();
    await resolveAIConsentPrompt('granted');
    assert.equal(await retry, 'played');
    assert.deepEqual(h.played, [voice]);
  });
}

// ── 4: one dialog, however many taps ─────────────────────────────────────────

test('rapid taps on the same sample join the open question', async () => {
  configureAIConsentStorage(new FakeStore(null));
  await loadAIConsent();
  const host = new FakeConsentHost().mount();
  const h = harness();

  const first = h.flow.request('marin');
  const second = h.flow.request('marin');
  const third = h.flow.request('marin');
  await flush();

  assert.equal(host.opens, 1, 'a repeat tap must not stack a second dialog');
  // The repeats join rather than cancelling — the run that asked the question
  // is the run that has to answer it, or Allow would play nothing.
  assert.equal(await second, 'joined');
  assert.equal(await third, 'joined');

  await resolveAIConsentPrompt('granted');
  assert.equal(await first, 'played');
  assert.deepEqual(h.played, ['marin'], 'three taps, one generation');
});

test('tapping the other sample while the dialog is up reuses it and plays that one', async () => {
  configureAIConsentStorage(new FakeStore(null));
  await loadAIConsent();
  const host = new FakeConsentHost().mount();
  const h = harness();

  const marin = h.flow.request('marin');
  await flush();
  const cedar = h.flow.request('cedar');
  await flush();

  assert.equal(host.opens, 1, 'still one dialog');
  assert.equal(h.busy(), 'cedar', 'the newest tap owns the question');

  await resolveAIConsentPrompt('granted');
  assert.equal(await marin, 'superseded');
  assert.equal(await cedar, 'played');
  assert.deepEqual(h.played, ['cedar'], 'the sample last tapped is the one that plays');
  assertAtRest(h, 'after the superseded run finished');
});

test('tapping the sample that is sounding stops it instead of re-asking', async () => {
  configureAIConsentStorage(new FakeStore('granted'));
  new FakeConsentHost().mount();
  // A holder rather than a bare `let`: the assignment happens inside the
  // player, where narrowing cannot see it.
  const player: { release: (() => void) | null } = { release: null };
  const h = harness(async (voice, report) => {
    h.played.push(voice);
    report('playing');
    await new Promise<void>(resolve => { player.release = resolve; });
  });

  const playing = h.flow.request('cedar');
  await flush();
  assert.equal(h.playing(), 'cedar');

  assert.equal(await h.flow.request('cedar'), 'stopped');
  assert.equal(h.stops() > 0, true, 'the audio is actually silenced');
  assertAtRest(h, 'after tapping stop');

  player.release?.();
  assert.equal(await playing, 'superseded');
  assert.deepEqual(h.played, ['cedar'], 'stopping does not generate a second time');
});

// ── 5: nowhere to ask, or nowhere left ───────────────────────────────────────

test('with no host mounted the request settles at once instead of hanging', async () => {
  configureAIConsentStorage(new FakeStore(null));
  const h = harness();

  // This is the shape the bug took: a dialog that could not be presented left
  // this promise pending forever, and with it the row that was waiting on it.
  assert.equal(await h.flow.request('marin'), 'consent_refused');
  assert.deepEqual(h.played, []);
  assertAtRest(h, 'with no host to ask');

  // And the picker is not wedged: mounting a host makes the next tap work.
  new FakeConsentHost().mount();
  const retry = h.flow.request('marin');
  await flush();
  await resolveAIConsentPrompt('granted');
  assert.equal(await retry, 'played');
});

test('a host that goes away mid-question settles the request as no consent', async () => {
  const store = new FakeStore(null);
  configureAIConsentStorage(store);
  const host = new FakeConsentHost().mount();
  const h = harness();

  const request = h.flow.request('cedar');
  await flush();
  // The picker was closed while the dialog was up.
  host.unmount();

  assert.equal(await request, 'consent_refused');
  assert.deepEqual(h.played, [], 'an unanswered question is never consent');
  assert.deepEqual(store.writes, []);
  assertAtRest(h, 'after the host disappeared');
});

test('closing the screen abandons the run, and a late answer plays nothing', async () => {
  configureAIConsentStorage(new FakeStore(null));
  const host = new FakeConsentHost().mount();
  const h = harness();

  const request = h.flow.request('marin');
  await flush();

  // close() / unmount: the flow is cancelled first, then the host unregisters.
  h.flow.cancel();
  assertAtRest(h, 'as soon as the screen is closed');
  host.unmount();

  assert.equal(await request, 'superseded');
  assert.deepEqual(h.played, [], 'a request the user walked away from plays nothing');
  assertAtRest(h, 'after the abandoned run settled');
});

test('a generation that fails reports once and still frees the row', async () => {
  configureAIConsentStorage(new FakeStore('granted'));
  new FakeConsentHost().mount();
  const failure = new Error('service_unavailable');
  const h = harness(async (_voice, report) => {
    report('checking-cache');
    report('generating-or-downloading');
    throw failure;
  });

  assert.equal(await h.flow.request('marin'), 'failed');
  assert.deepEqual(h.errors, [failure]);
  assertAtRest(h, 'after a failed generation');
});

test('a failure after the screen moved on is neither reported nor drawn', async () => {
  configureAIConsentStorage(new FakeStore('granted'));
  new FakeConsentHost().mount();
  const player: { fail: ((error: unknown) => void) | null } = { fail: null };
  const h = harness(async (_voice, report) => {
    report('generating-or-downloading');
    await new Promise<void>((_resolve, reject) => { player.fail = reject; });
  });

  const request = h.flow.request('marin');
  await flush();
  h.flow.cancel();
  player.fail?.(new Error('service_unavailable'));

  assert.equal(await request, 'superseded');
  assert.deepEqual(h.errors, [], 'an alert for a screen the user has left is noise');
  assertAtRest(h, 'after a superseded failure');
});

// ── The spinner rule the rows are drawn from ─────────────────────────────────

test('the spinner stays exclusive to the consent wait and a confirmed network miss', () => {
  const phases: [TTSPlaybackPhase, string][] = [
    ['checking-cache', 'preparing'],
    ['generating-or-downloading', 'loading'],
    ['ready', 'preparing'],
    ['playing', 'playing'],
    ['failed', 'idle'],
    ['idle', 'idle'],
  ];
  for (const [phase, expected] of phases) {
    assert.equal(previewPhaseForPlayback(phase), expected, phase);
  }

  // A cached sample goes preparing → playing and never flashes a spinner.
  assert.equal(voicePreviewBusyVoice({ voice: 'marin', phase: 'preparing' }), null);
  assert.equal(voicePreviewBusyVoice({ voice: 'marin', phase: 'consent' }), 'marin');
  assert.equal(voicePreviewBusyVoice({ voice: 'marin', phase: 'loading' }), 'marin');
  assert.equal(voicePreviewPlayingVoice({ voice: 'cedar', phase: 'playing' }), 'cedar');
  assert.equal(voicePreviewPlayingVoice({ voice: 'cedar', phase: 'loading' }), null);
});
