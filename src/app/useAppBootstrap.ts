import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Folder, OnboardingChoices, WordCard } from '../types';
import { HIDE_AI_TOOLS_KEY, ONBOARDING_KEY, SHOW_FULL_CARD_KEY, VERTICAL_FLIP_KEY } from '../constants';
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
  setVerticalFlip(v: boolean): void;
  setHideAiTools(v: boolean): void;
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
  hasLoaded: MutableRefObject<boolean>;
}

export function useAppBootstrap({
  applySettings,
  markSettingsLoaded,
  setShowFullCard,
  setVerticalFlip,
  setHideAiTools,
}: UseAppBootstrapParams): AppBootstrapState {
  const [cards, setCards] = useState<WordCard[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [learnLang, setLearnLang] = useState<string | null>(null);
  const [nativeLang, setNativeLang] = useState('en-US');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notificationGranted, setNotificationGranted] = useState(false);

  const hasLoaded = useRef(false);
  const foldersRef = useRef<Folder[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // ── Phase 1: Critical local path ────────────────────────────────────────
      // bootstrapData must complete before readFolders: on first launch it writes
      // the default FOLDERS_KEY entry so readFolders() sees it immediately after.
      let local: Awaited<ReturnType<typeof bootstrapData>>;
      let storedFolders: Folder[];
      try {
        local = await bootstrapData();
        storedFolders = await readFolders();
      } catch (e) {
        if (__DEV__) {
          console.error(
            '[bootstrap] local data load failed:',
            e instanceof Error ? e.name : 'UnknownError',
          );
        }
        // Return early; the finally block will call markSettingsLoaded and
        // set hasLoaded so the app remains usable with default state.
        return;
      }

      if (cancelled) return;

      const { cards: migratedCards, folders: migratedFolders } = migrateCards(
        local.cards,
        storedFolders,
      );
      foldersRef.current = migratedFolders;
      setCards(migratedCards);
      setFolders(migratedFolders);
      applySettings(local.settings);

      // ── Phase 2: UI preferences (parallel, non-critical) ──────────────────
      let rawShowFull: string | null = null;
      let rawVertFlip: string | null = null;
      let rawHideAi:  string | null = null;
      let obRaw: string | null = null;
      try {
        [rawShowFull, rawVertFlip, rawHideAi, obRaw] = await Promise.all([
          AsyncStorage.getItem(SHOW_FULL_CARD_KEY),
          AsyncStorage.getItem(VERTICAL_FLIP_KEY),
          AsyncStorage.getItem(HIDE_AI_TOOLS_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
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

      if (rawShowFull === 'true') setShowFullCard(true);
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
        // Always finalize the persistence gate, regardless of success or failure.
        // hasLoaded is a ref — safe to write after unmount.
        hasLoaded.current = true;
        // markSettingsLoaded calls a state setter; only call it if still mounted.
        // On the happy path it was already called above (idempotent).
        if (!cancelled) markSettingsLoaded();
      });

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
    hasLoaded,
  };
}
