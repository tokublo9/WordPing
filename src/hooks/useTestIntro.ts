import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NO_TEST_INTRO_SEEN,
  TEST_INTRO_KEYS,
  TEST_INTRO_STEPS,
  markTestIntroSeen,
  parseTutorialFlag,
  serializeTutorialFlag,
  type TestIntroSeen,
  type TestIntroStep,
} from '../features/onboarding/tutorialState';
import { TEST_TUTORIAL_MODE } from '../features/flags';
import { reportSideEffectFailure } from '../utils/reportSideEffectFailure';

/**
 * The Test Mode introduction's three dismissal flags.
 *
 * Loaded once, written on each dismissal — the same shape as
 * `useFeatureDiscovery`, and for the same reason: entries are only ever added,
 * so there is no state to reconcile and a failed read costs one repeated popup
 * rather than a lost one.
 *
 * It lives beside Test Mode rather than in the app-wide settings hooks because
 * nothing outside that screen reads it, exactly like the mute preference the
 * same screen already owns. The rules it feeds are pure and live in
 * `features/onboarding/tutorialState.ts`.
 */

export interface TestIntro {
  seen: TestIntroSeen;
  /** False until storage has answered; nothing is shown before then. */
  loaded: boolean;
  /** Records one step as dismissed. Idempotent. */
  markSeen(step: TestIntroStep): void;
}

/**
 * Development only: replay the introduction on every entry.
 *
 * Both halves have to give way for that to work — the read, so the session
 * starts with nothing seen, and the write, so dismissing a step does not settle
 * it for the next one. In-memory marking still happens, which is what lets the
 * three steps advance through their normal order within the session.
 */
const replayIntro = __DEV__ && TEST_TUTORIAL_MODE;

export function useTestIntro(): TestIntro {
  const [seen, setSeen] = useState<TestIntroSeen>(NO_TEST_INTRO_SEEN);
  // Nothing to wait for when replaying: the session starts unseen and ready.
  const [loaded, setLoaded] = useState<boolean>(replayIntro);

  useEffect(() => {
    if (replayIntro) return;
    let active = true;
    AsyncStorage.multiGet(TEST_INTRO_STEPS.map(step => TEST_INTRO_KEYS[step]))
      .then(entries => {
        if (!active) return;
        const next: Record<TestIntroStep, boolean> = { ...NO_TEST_INTRO_SEEN };
        for (const [key, value] of entries) {
          const step = TEST_INTRO_STEPS.find(candidate => TEST_INTRO_KEYS[candidate] === key);
          if (step) next[step] = parseTutorialFlag(value);
        }
        setSeen(next);
        setLoaded(true);
      })
      // An unreadable flag means "not yet", which shows the popup again rather
      // than silently swallowing a step the user has not seen.
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  const markSeen = useCallback((step: TestIntroStep) => {
    // The write is outside the updater on purpose. React invokes a state
    // updater twice in Strict Mode, and a side effect in there would issue the
    // storage write twice for one dismissal.
    setSeen(current => markTestIntroSeen(current, step));
    if (replayIntro) return;
    AsyncStorage.setItem(TEST_INTRO_KEYS[step], serializeTutorialFlag(true))
      .catch(e => reportSideEffectFailure('testIntro', e));
  }, []);

  return { seen, loaded, markSeen };
}
