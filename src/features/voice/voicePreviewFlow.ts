import type { TTSPlaybackPhase } from '../../lib/ttsPlaybackState';

/**
 * One tap on a Marin or Cedar sample, from the question to the audio and back.
 *
 * A voice sample is an ordinary user-content AI request — the same generation a
 * word card makes, on the same account, against the same store — so it asks the
 * same question the Word List's AI Voice button asks, through
 * `ensureAIConsentForUserAction`. What is different is where it is asked from:
 * the picker is a presented modal of its own, and the answer can arrive long
 * after the tap, or never.
 *
 * That is the whole reason this lives outside the component. The ordering is
 * the feature:
 *
 *  - Nothing is generated before an explicit `granted`. Not Now, a backdrop
 *    tap, the Android back button and a screen that went away mid-question all
 *    mean the same thing here, and none of them plays anything.
 *  - Allow continues the run that asked. The sample the user tapped is the
 *    sample that plays, without a second tap.
 *  - Every exit publishes an idle snapshot before it returns, so a row can
 *    never be left spinning behind a dialog that is gone. This is what a
 *    `finally` is for, and it is why the consent await is inside the `try`
 *    rather than in front of it.
 *  - A second tap while the dialog is up joins the open question instead of
 *    cancelling it. `requestAIConsentDecision` already refuses to stack a
 *    second dialog; this refuses to throw away the first run that asked for it.
 *
 * Pure — no react-native or expo import — so all of that is tested against the
 * real consent singleton and a fake player rather than described in a comment.
 * The player, the consent question and the state sink are injected.
 */

export type VoicePreviewPhase =
  /** Nothing is running; every row is tappable and drawn at rest. */
  | 'idle'
  /** The consent dialog is up and this run is waiting on the answer. */
  | 'consent'
  /** Consent settled; the player is looking for the clip on the device. */
  | 'preparing'
  /** A confirmed cache miss: audio is being generated or downloaded. */
  | 'loading'
  /** Audio is sounding. */
  | 'playing';

/** The whole preview state, as one value, so no two fields can disagree. */
export interface VoicePreviewSnapshot<V> {
  /** The voice this run belongs to. Always null while the phase is idle. */
  voice: V | null;
  phase: VoicePreviewPhase;
}

/** Why a request finished. Returned for the tests; the UI reads the snapshot. */
export type VoicePreviewOutcome =
  /** Played to the end, or until something else took over the audio. */
  | 'played'
  /** A tap on the row that was already sounding: it stopped. */
  | 'stopped'
  /** A repeat tap while this row's consent dialog is already open. */
  | 'joined'
  /** Not Now, a dismissal, or nowhere to ask. Nothing was sent. */
  | 'consent_refused'
  /** A newer request, a row tap, or the screen closing replaced this run. */
  | 'superseded'
  /** The generation or the playback failed; `onError` was told. */
  | 'failed';

export interface VoicePreviewFlowOptions<V> {
  /**
   * The shared consent question — the exact call the Word List makes.
   *
   * Resolves false for Not Now, for a dismissal and for a missing host, which
   * are three different events with one correct answer: do not send anything.
   */
  ensureConsent: () => Promise<boolean>;
  /** Generates or replays the fixed sample, reporting playback progress. */
  play: (voice: V, report: (phase: TTSPlaybackPhase) => void) => Promise<void>;
  /** Silences whatever is currently sounding. Safe to call when nothing is. */
  stop: () => void;
  /** Publishes a new snapshot. Called only when something actually changed. */
  onChange: (snapshot: VoicePreviewSnapshot<V>) => void;
  /** A real failure — never a cancellation, which is not worth a dialog. */
  onError: (error: unknown) => void;
}

export interface VoicePreviewFlow<V> {
  /** Handles a tap on a voice's play button. */
  request(voice: V): Promise<VoicePreviewOutcome>;
  /** Abandons the current run and returns every row to rest. */
  cancel(): void;
}

/**
 * How a playback phase reads on a preview row.
 *
 * The spinner stays exclusive to a confirmed network miss, exactly as
 * `isTTSNetworkLoading` defines it: a cached sample must not flash a spinner on
 * its way to playing. `failed` reports idle because nothing is sounding by
 * then — the rejection that follows carries the message.
 */
export function previewPhaseForPlayback(phase: TTSPlaybackPhase): VoicePreviewPhase {
  switch (phase) {
    case 'generating-or-downloading': return 'loading';
    case 'playing':                   return 'playing';
    case 'checking-cache':
    case 'ready':                     return 'preparing';
    case 'failed':
    case 'idle':                      return 'idle';
  }
}

/**
 * The row drawn with a spinner, if any.
 *
 * The consent wait counts: a tap that opens a dialog has to look like it
 * registered, and the same `finally` that ends the run clears it. Exported so
 * the picker and its tests read one definition of "this row is working" — a
 * second copy in the component is how a spinner outlives the run that set it.
 */
export function voicePreviewBusyVoice<V>(snapshot: VoicePreviewSnapshot<V>): V | null {
  return snapshot.phase === 'consent' || snapshot.phase === 'loading' ? snapshot.voice : null;
}

/** The row drawn with the stop glyph, if any. */
export function voicePreviewPlayingVoice<V>(snapshot: VoicePreviewSnapshot<V>): V | null {
  return snapshot.phase === 'playing' ? snapshot.voice : null;
}

export function createVoicePreviewFlow<V>(
  options: VoicePreviewFlowOptions<V>,
): VoicePreviewFlow<V> {
  // Bumped by anything that abandons a run: a new tap, a row tap, the screen
  // closing, the component going away. A run whose number is stale publishes
  // nothing and plays nothing, however late its await resolves.
  let sequence = 0;
  let current: VoicePreviewSnapshot<V> = { voice: null, phase: 'idle' };

  function publish(voice: V | null, phase: VoicePreviewPhase): void {
    if (current.voice === voice && current.phase === phase) return;
    current = { voice, phase };
    options.onChange(current);
  }

  function cancel(): void {
    sequence++;
    options.stop();
    publish(null, 'idle');
  }

  async function request(voice: V): Promise<VoicePreviewOutcome> {
    if (current.voice === voice) {
      // The dialog is already up for this very row. Treating a second tap as
      // "stop" here would throw away the run that asked the question, and the
      // user's Allow would then play nothing.
      if (current.phase === 'consent') return 'joined';
      cancel();
      return 'stopped';
    }

    const run = ++sequence;
    // A different row. Whatever is sounding belongs to a sample the user has
    // just moved off, and it stops before the question is asked rather than
    // after the answer.
    options.stop();
    publish(voice, 'consent');

    try {
      const granted = await options.ensureConsent();
      // Staleness is checked before the answer, so a run the user walked away
      // from reports that it was abandoned rather than that consent was
      // refused. Granting permission is not permission to play something that
      // is no longer on screen.
      if (run !== sequence) return 'superseded';
      if (!granted) return 'consent_refused';

      publish(voice, 'preparing');
      await options.play(voice, phase => {
        if (run !== sequence) return;
        const next = previewPhaseForPlayback(phase);
        publish(next === 'idle' ? null : voice, next);
      });
      return run === sequence ? 'played' : 'superseded';
    } catch (error) {
      if (run !== sequence) return 'superseded';
      options.onError(error);
      return 'failed';
    } finally {
      // Every path out of this function passes here: Allow, Not Now, a
      // dismissal, a host that was never mounted or has gone away, an outage,
      // a cancellation. The row is tappable again before `request` returns.
      if (run === sequence) publish(null, 'idle');
    }
  }

  return { request, cancel };
}
