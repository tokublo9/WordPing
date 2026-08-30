import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Folder, OnboardingChoices, WordCard } from '../types';
import {
  HIDE_AI_TOOLS_KEY,
  SYNC_TEST_RESULTS_KEY,
  ONBOARDING_KEY,
  SHOW_FULL_CARD_KEY,
  SHOW_RESULT_COLOR_KEY,
  VERTICAL_FLIP_KEY,
  WORD_LIST_FILTERS_KEY,
} from '../constants';
import {
  bootstrapData,
  DEFAULT_FOLDER_ID,
  persistFolders,
  readFolders,
  WELCOME_FOLDER_ID,
} from '../lib/db';
import type { Settings } from '../lib/db';
import { getPermissionStatus } from '../notifications';
import { FORCE_SHOW_ONBOARDING } from '../components/OnboardingModal';
import {
  parseActiveResultFiltersByFolder,
  type ActiveResultFiltersByFolder,
} from '../features/cards/levels';
import { parseShowResultColorPreference } from '../features/settings/resultColorPreference';
import {
  FIRST_TEST_ANSWER_KEY,
  RESULT_FILTER_MIGRATION_KEY,
  RESULT_FILTER_TUTORIAL_KEY,
  hasExistingTestResults,
  parseTutorialFlag,
  resolveResultFilterMigration,
  serializeTutorialFlag,
} from '../features/onboarding/tutorialState';
import { loadAIConsent } from '../lib/aiConsent';

// Assigns folderId to cards that predate the folder feature.
// Creates a default folder when none exist — the only side effect.
function migrateCards(
  rawCards: WordCard[],
  existingFolders: Folder[],
): { cards: WordCard[]; folders: Folder[] } {
  if (!rawCards.some(c => !c.folderId)) return { cards: rawCards, folders: existingFolders };
  let finalFolders = existingFolders;
  if (finalFolders.length === 0) {
    finalFolders = [{ id: DEFAULT_FOLDER_ID, name: 'My Words', createdAt: Date.now() }];
    persistFolders(finalFolders);
  }
  const firstId = finalFolders[0].id;
  return {
    cards: rawCards.map(c => c.folderId ? c : { ...c, folderId: firstId }),
    folders: finalFolders,
  };
}

function parseOnboarding(raw: string): OnboardingChoices | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.purpose !== 'language' && value.purpose !== 'words') return null;
    if (typeof value.nativeLang !== 'string' || !value.nativeLang) return null;
    return {
      purpose: value.purpose,
      gender: value.gender === 'woman' || value.gender === 'man' || value.gender === 'non_binary'
        ? value.gender
        : 'prefer_not_to_say',
      dateOfBirth: typeof value.dateOfBirth === 'string' ? value.dateOfBirth : '',
      discoverySource:
        value.discoverySource === 'app_store' || value.discoverySource === 'social_media' ||
        value.discoverySource === 'friend_family' || value.discoverySource === 'web_search' ||
        value.discoverySource === 'advertisement'
          ? value.discoverySource
          : 'other',
      learningLang: typeof value.learningLang === 'string' ? value.learningLang : undefined,
      nativeLang: value.nativeLang,
      wordCategory: typeof value.wordCategory === 'string' ? value.wordCategory : undefined,
    };
  } catch {
    return null;
  }
}

export interface UseAppBootstrapParams {
  applySettings(s: Settings): void;
  markSettingsLoaded(): void;
  setShowFullCard(v: boolean): void;
  setShowResultColor(v: boolean): void;
  setVerticalFlip(v: boolean): void;
  setHideAiTools(v: boolean): void;
  setSyncTestResults(v: boolean): void;
  setResultFilterTutorialSeen(v: boolean): void;
  setFirstTestAnswerRecorded(v: boolean): void;
}

export interface AppBootstrapState {
  cards: WordCard[];
  setCards: Dispatch<SetStateAction<WordCard[]>>;
  folders: Folder[];
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  foldersRef: MutableRefObject<Folder[]>;
  learnLang: string | null;
  setLearnLang: Dispatch<SetStateAction<string | null>>;
  nativeLang: string;
  setNativeLang: Dispatch<SetStateAction<string>>;
  currentFolderId: string | null;
  setCurrentFolderId: Dispatch<SetStateAction<string | null>>;
  showOnboarding: boolean;
  setShowOnboarding: Dispatch<SetStateAction<boolean>>;
  notificationGranted: boolean;
  setNotificationGranted: Dispatch<SetStateAction<boolean>>;
  activeResultFiltersByFolder: ActiveResultFiltersByFolder;
  setActiveResultFiltersByFolder: Dispatch<SetStateAction<ActiveResultFiltersByFolder>>;
  hasLoaded: MutableRefObject<boolean>;
  cardsLoaded: MutableRefObject<boolean>;
  activeResultFiltersLoaded: MutableRefObject<boolean>;
  /**
   * Stored data could not be read. Saving is disabled for this launch so an
   * empty screen cannot be written over the user's real vocabulary.
   */
  loadFailed: boolean;
}

export function useAppBootstrap({
  applySettings,
  markSettingsLoaded,
  setShowFullCard,
  setShowResultColor,
  setVerticalFlip,
  setHideAiTools,
  setSyncTestResults,
  setResultFilterTutorialSeen,
  setFirstTestAnswerRecorded,
}: UseAppBootstrapParams): AppBootstrapState {
  const [cards, setCards] = useState<WordCard[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [learnLang, setLearnLang] = useState<string | null>(null);
  const [nativeLang, setNativeLang] = useState('en-US');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [activeResultFiltersByFolder, setActiveResultFiltersByFolder] = useState<ActiveResultFiltersByFolder>({});

  const hasLoaded = useRef(false);
  // Opens the cards/settings write path as soon as stored cards reach state, without
  // waiting for the later phases. A word added during those phases would otherwise be
  // held in memory only until some other change happened to trigger a write.
  const cardsLoaded = useRef(false);
  const activeResultFiltersLoaded = useRef(false);
  const foldersRef = useRef<Folder[]>([]);
  // Set when the stored cards could not be read at all.
  //
  // This gate is the difference between "the app looks empty this launch" and
  // "the user's vocabulary is gone". `cards` state is still [] after a failed
  // load, and every persist writes the full array — so the first word added
  // afterwards would delete every stored row that is not in it. Writes stay
  // shut until a read has actually succeeded.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // ── Phase 1: Critical local path ────────────────────────────────────────
      // bootstrapData must complete before readFolders: on first launch it writes
      // the default FOLDERS_KEY entry so readFolders() sees it immediately after.
      let local: Awaited<ReturnType<typeof bootstrapData>>;
      let storedFolders: Folder[];
      let rawLevelFilters: string | null = null;
      try {
        local = await bootstrapData();
        [storedFolders, rawLevelFilters] = await Promise.all([
          readFolders(),
          AsyncStorage.getItem(WORD_LIST_FILTERS_KEY).catch(e => {
            if (__DEV__) {
              console.warn(
                '[bootstrap] word-list filters load failed:',
                e instanceof Error ? e.name : 'UnknownError',
              );
            }
            return null;
          }),
        ]);
      } catch (e) {
        if (__DEV__) {
          console.error(
            '[bootstrap] local data load failed:',
            e instanceof Error ? e.name : 'UnknownError',
          );
        }
        // The stored cards were never read, so `cards` is [] for reasons that
        // have nothing to do with what is on disk. Persistence must stay shut:
        // a single word added now would otherwise be written as the complete
        // card list and delete everything else. The UI still loads so the user
        // can close the app rather than being stuck on a blank screen.
        loadFailedRef.current = true;
        if (!cancelled) setLoadFailed(true);
        return;
      }

      if (cancelled) return;

      const { cards: migratedCards, folders: migratedFolders } = migrateCards(
        local.cards,
        storedFolders,
      );
      // Queue the restored filters before folders become tappable. This prevents a
      // Word List from rendering the all-enabled default before its saved state.
      setActiveResultFiltersByFolder(parseActiveResultFiltersByFolder(rawLevelFilters));
      activeResultFiltersLoaded.current = true;
      foldersRef.current = migratedFolders;
      setCards(migratedCards);
      setFolders(migratedFolders);
      applySettings(local.settings);
      // Stored cards and settings are now in state, so persisting them back can only
      // write the same or newer data. Anything the user adds from here is saved.
      cardsLoaded.current = true;

      // ── Phase 2: UI preferences (parallel, non-critical) ──────────────────
      let rawShowFull: string | null = null;
      let rawShowResultColor: string | null = null;
      let rawVertFlip: string | null = null;
      let rawHideAi:  string | null = null;
      let rawSyncTest: string | null = null;
      let obRaw: string | null = null;
      let rawResultFilterTutorial: string | null = null;
      let rawFirstTestAnswer: string | null = null;
      let rawResultFilterMigrated: string | null = null;
      try {
        [
          rawShowFull, rawShowResultColor, rawVertFlip, rawHideAi, rawSyncTest, obRaw,
          rawResultFilterTutorial, rawFirstTestAnswer, rawResultFilterMigrated,
        ] = await Promise.all([
          AsyncStorage.getItem(SHOW_FULL_CARD_KEY),
          AsyncStorage.getItem(SHOW_RESULT_COLOR_KEY),
          AsyncStorage.getItem(VERTICAL_FLIP_KEY),
          AsyncStorage.getItem(HIDE_AI_TOOLS_KEY),
          AsyncStorage.getItem(SYNC_TEST_RESULTS_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
          AsyncStorage.getItem(RESULT_FILTER_TUTORIAL_KEY),
          AsyncStorage.getItem(FIRST_TEST_ANSWER_KEY),
          AsyncStorage.getItem(RESULT_FILTER_MIGRATION_KEY),
        ]);
      } catch (e) {
        if (__DEV__) {
          console.warn(
            '[bootstrap] UI preferences load failed:',
            e instanceof Error ? e.name : 'UnknownError',
          );
        }
        // Non-critical: defaults apply. Continue to navigation.
      }

      if (cancelled) return;

      // Tutorial flags. Absent means "not seen" — an app update never counts as
      // having seen a tutorial.
      setFirstTestAnswerRecorded(parseTutorialFlag(rawFirstTestAnswer));

      // One-time check for an install that predates the result filters. Written
      // straight to storage rather than through the persistence effect, which is
      // still gated shut this early — and writing it here means a crash later in
      // startup cannot leave an experienced user with their filters hidden.
      const storedTutorialSeen = parseTutorialFlag(rawResultFilterTutorial);
      const migration = resolveResultFilterMigration({
        alreadyMigrated: parseTutorialFlag(rawResultFilterMigrated),
        hasSeenResultFilterTutorial: storedTutorialSeen,
        hasHistoricalResults: hasExistingTestResults(migratedCards),
      });
      setResultFilterTutorialSeen(storedTutorialSeen || migration.shouldMarkTutorialSeen);
      if (migration.shouldMarkMigrated) {
        const writes: Promise<void>[] = [
          AsyncStorage.setItem(RESULT_FILTER_MIGRATION_KEY, serializeTutorialFlag(true)),
        ];
        if (migration.shouldMarkTutorialSeen) {
          writes.push(
            AsyncStorage.setItem(RESULT_FILTER_TUTORIAL_KEY, serializeTutorialFlag(true)),
          );
        }
        await Promise.all(writes).catch(e => {
          // Not fatal: the check is idempotent and simply runs again next launch.
          if (__DEV__) {
            console.warn(
              '[bootstrap] result-filter migration write failed:',
              e instanceof Error ? e.name : 'UnknownError',
            );
          }
        });
      }

      if (rawShowFull === 'true') setShowFullCard(true);
      // Missing, malformed and unreadable legacy values are explicitly OFF.
      setShowResultColor(parseShowResultColorPreference(rawShowResultColor));
      // Absent means off, which is the default for existing users.
      if (rawSyncTest === 'true') setSyncTestResults(true);
      if (rawVertFlip !== null) setVerticalFlip(rawVertFlip === 'true');
      if (rawHideAi !== null) {
        setHideAiTools(rawHideAi === 'true');
      } else if (obRaw !== null) {
        // First launch after this feature ships — derive default from onboarding purpose:
        // language learners see AI tools by default; other purposes hide them.
        const ob = parseOnboarding(obRaw);
        if (ob) setHideAiTools(ob.purpose !== 'language');
      }

      // Mark settings ready as early as possible so the subscription enforcement
      // effect can fire without waiting for onboarding/navigation phases.
      // The finally block calls markSettingsLoaded too as a safety net, making
      // this call idempotent on the happy path.
      markSettingsLoaded();

      // ── Phase 3: Onboarding state ──────────────────────────────────────────
      if (obRaw !== null) {
        const ob = parseOnboarding(obRaw);
        if (ob) {
          if (ob.learningLang && ob.learningLang !== 'other') setLearnLang(ob.learningLang);
          if (ob.nativeLang && ob.nativeLang !== 'other') setNativeLang(ob.nativeLang);
        }
      }

      // ── Phase 4: Initial navigation decision ──────────────────────────────
      // Only navigate into the Welcome folder when onboarding won't be shown.
      // If onboarding will cover the screen, currentFolderId is set in onComplete
      // instead, so the Welcome folder becomes visible only after the modal closes.
      const showingOnboarding = obRaw === null || (__DEV__ && FORCE_SHOW_ONBOARDING);
      if (local.isFirstLaunch && !showingOnboarding) setCurrentFolderId(WELCOME_FOLDER_ID);
      if (showingOnboarding) setShowOnboarding(true);
    };

    run()
      .catch(e => {
        // Unexpected error after Phase 1 succeeded. Logged for diagnostics only;
        // finally block below ensures the app reaches a usable state.
        if (__DEV__) {
          console.error(
            '[bootstrap] unexpected error:',
            e instanceof Error ? e.name : 'UnknownError',
          );
        }
      })
      .finally(() => {
        // Finalize the persistence gates — but only when the stored data was
        // actually read. Opening them after a failed read is what would turn a
        // transient storage error into permanent data loss.
        // Refs are safe to write after unmount.
        const readSucceeded = !loadFailedRef.current;
        hasLoaded.current = readSucceeded;
        cardsLoaded.current = readSucceeded;
        activeResultFiltersLoaded.current = readSucceeded;
        // markSettingsLoaded calls a state setter; only call it if still mounted.
        // On the happy path it was already called above (idempotent).
        if (!cancelled) markSettingsLoaded();
      });

    // Warm the AI data-sharing decision so the Settings row and the preload
    // eligibility checks see the real stored value rather than the not-yet-read
    // default. This is a local read of one key; it never blocks anything, and
    // `requireAIConsent` awaits the same load if a request somehow beats it.
    void loadAIConsent();

    // Read permission without prompting. The actual prompt is shown in context
    // when the user enables a notification interval.
    getPermissionStatus().then(granted => {
      if (!cancelled) setNotificationGranted(granted);
    }).catch(() => {
      if (!cancelled) setNotificationGranted(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    cards, setCards,
    folders, setFolders,
    foldersRef,
    learnLang, setLearnLang,
    nativeLang, setNativeLang,
    currentFolderId, setCurrentFolderId,
    showOnboarding, setShowOnboarding,
    notificationGranted, setNotificationGranted,
    activeResultFiltersByFolder, setActiveResultFiltersByFolder,
    hasLoaded,
    cardsLoaded,
    activeResultFiltersLoaded,
    loadFailed,
  };
}
