import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, Folder, OnboardingChoices, WordCard } from '../types';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  ONBOARDING_KEY,
  SHOW_FULL_CARD_KEY,
  VERTICAL_FLIP_KEY,
} from '../constants';
import {
  bootstrapData,
  DEFAULT_FOLDER_ID,
  persistFolders,
  readFolders,
  WELCOME_FOLDER_ID,
} from '../lib/db';
import type { AppData, Settings } from '../lib/db';
import { requestPermission } from '../notifications';
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
    return JSON.parse(raw) as OnboardingChoices;
  } catch {
    return null;
  }
}

export interface AppBootstrapState {
  cards: WordCard[];
  setCards: Dispatch<SetStateAction<WordCard[]>>;
  folders: Folder[];
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  foldersRef: MutableRefObject<Folder[]>;
  themeColor: string;
  setThemeColor: Dispatch<SetStateAction<string>>;
  appearance: Appearance;
  setAppearance: Dispatch<SetStateAction<Appearance>>;
  skinId: string | null;
  setSkinId: Dispatch<SetStateAction<string | null>>;
  language: string;
  setLanguage: Dispatch<SetStateAction<string>>;
  showFullCard: boolean;
  setShowFullCard: Dispatch<SetStateAction<boolean>>;
  verticalFlip: boolean;
  setVerticalFlip: Dispatch<SetStateAction<boolean>>;
  settingsLoaded: boolean;
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

export function useAppBootstrap(): AppBootstrapState {
  const [cards, setCards] = useState<WordCard[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME);
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [skinId, setSkinId] = useState<string | null>(null);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [showFullCard, setShowFullCard] = useState(false);
  const [verticalFlip, setVerticalFlip] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [learnLang, setLearnLang] = useState<string | null>(null);
  const [nativeLang, setNativeLang] = useState('en-US');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notificationGranted, setNotificationGranted] = useState(false);

  const hasLoaded = useRef(false);
  const foldersRef = useRef<Folder[]>([]);

  useEffect(() => {
    const applySettings = (s: Settings) => {
      setThemeColor(s.themeColor);
      setAppearance(s.appearance);
      setSkinId(s.skinId ?? null);
      setLanguage(s.language ?? DEFAULT_LANGUAGE);
    };

    const handleRemoteData = (remote: AppData) => {
      applySettings(remote.settings);
      const { cards: migratedCards } = migrateCards(remote.cards, foldersRef.current);
      setCards(migratedCards);
    };

    (async () => {
      // ── Phase 1: Critical local path ──────────────────────────────────────────
      // bootstrapData must complete before readFolders: on first launch it writes
      // the default FOLDERS_KEY entry so readFolders() sees it immediately after.
      let local: Awaited<ReturnType<typeof bootstrapData>>;
      let storedFolders: Folder[];
      try {
        local = await bootstrapData(handleRemoteData);
        storedFolders = await readFolders();
      } catch (e) {
        if (__DEV__) console.error('[bootstrap] local data load failed:', e);
        // Guarantee the app is usable even when local storage is unreadable.
        setSettingsLoaded(true);
        hasLoaded.current = true;
        return;
      }

      const { cards: migratedCards, folders: migratedFolders } = migrateCards(
        local.cards,
        storedFolders,
      );
      foldersRef.current = migratedFolders;
      setCards(migratedCards);
      setFolders(migratedFolders);
      applySettings(local.settings);

      // ── Phase 2: UI preferences (parallel, non-critical) ──────────────────────
      let rawShowFull: string | null = null;
      let rawVertFlip: string | null = null;
      let obRaw: string | null = null;
      try {
        [rawShowFull, rawVertFlip, obRaw] = await Promise.all([
          AsyncStorage.getItem(SHOW_FULL_CARD_KEY),
          AsyncStorage.getItem(VERTICAL_FLIP_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
        ]);
      } catch (e) {
        if (__DEV__) console.warn('[bootstrap] UI preferences load failed:', e);
        // Non-critical: defaults apply. Continue to navigation.
      }

      // Only enable from the exact stored string 'true'; any other value stays OFF.
      if (rawShowFull === 'true') setShowFullCard(true);
      if (rawVertFlip !== null) setVerticalFlip(rawVertFlip === 'true');

      setSettingsLoaded(true);

      // ── Phase 3: Onboarding state ─────────────────────────────────────────────
      if (obRaw !== null) {
        const ob = parseOnboarding(obRaw);
        if (ob) {
          if (ob.learningLang && ob.learningLang !== 'other') setLearnLang(ob.learningLang);
          if (ob.nativeLang && ob.nativeLang !== 'other') setNativeLang(ob.nativeLang);
        }
      }

      // ── Phase 4: Initial navigation decision ──────────────────────────────────
      // Only navigate into the Welcome folder when onboarding won't be shown.
      // If onboarding will cover the screen, currentFolderId is set in onComplete
      // instead, so the Welcome folder becomes visible only after the modal closes.
      const showingOnboarding = obRaw === null || (__DEV__ && FORCE_SHOW_ONBOARDING);
      if (local.isFirstLaunch && !showingOnboarding) setCurrentFolderId(WELCOME_FOLDER_ID);
      if (showingOnboarding) setShowOnboarding(true);

      hasLoaded.current = true;
    })();

    // Notification permission runs concurrently with the data startup path.
    requestPermission().then(setNotificationGranted);
  }, []);

  return {
    cards, setCards,
    folders, setFolders,
    foldersRef,
    themeColor, setThemeColor,
    appearance, setAppearance,
    skinId, setSkinId,
    language, setLanguage,
    showFullCard, setShowFullCard,
    verticalFlip, setVerticalFlip,
    settingsLoaded,
    learnLang, setLearnLang,
    nativeLang, setNativeLang,
    currentFolderId, setCurrentFolderId,
    showOnboarding, setShowOnboarding,
    notificationGranted, setNotificationGranted,
    hasLoaded,
  };
}
