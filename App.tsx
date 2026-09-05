import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  InteractionManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  persistCardsAndWait,
  reloadLocalData,
  TIPS_FOLDER_ID,
  WELCOME_FOLDER_ID,
} from './src/lib/db';
import { BCP47_TO_UI_LANG, LangContext, translate } from './src/i18n';

import type { Appearance, Folder, WordCard } from './src/types';
import type { AIVoice } from './src/lib/aiVoices';
import { FREE_SKIN_IDS, FREE_THEME_COLOR, ONBOARDING_KEY } from './src/constants';
import { appStyles as s } from './src/styles';
import { useSubscription } from './src/hooks/useSubscription';
import { AdBannerPlaceholder } from './src/components/AdBannerPlaceholder';
import { TopBanner } from './src/components/TopBanner';
import { showTopBanner } from './src/lib/topBanner';
import { reportSideEffectFailure } from './src/utils/reportSideEffectFailure';
import { AIConsentDialog } from './src/components/AIConsentDialog';
import { VoiceCreditsExhaustedDialog } from './src/components/VoiceCreditsExhaustedDialog';
import { invalidateAIConsent, subscribeToAIConsent, type AIConsentState } from './src/lib/aiConsent';
import {
  hasEligibleAIEntitlement,
  isVerifiedAIIneligiblePlan,
  planCanUseAI,
  setAIEntitlementSnapshot,
} from './src/lib/aiEntitlement';
import { useFeatureDiscovery } from './src/hooks/useFeatureDiscovery';
import { TestIntroDialog } from './src/components/TestIntroDialog';
import type { SpotlightRect, SpotlightTarget } from './src/features/onboarding/spotlight';
import {
  FEATURE_MARKERS,
  hasExitedFirstTest,
  shouldShowNotificationMarker,
  shouldShowTestMarker,
} from './src/features/onboarding/featureDiscovery';
import {
  SUBSCRIPTION_CONSENT_PROMPT_KEY,
  parseConsentPromptShown,
  serializeConsentPromptShown,
  shouldPromptConsentAfterSubscription,
} from './src/features/onboarding/subscriptionOnboarding';
import { ensureAIConsentForUserAction } from './src/lib/aiConsentPrompt';
import { getAIConsent, loadAIConsent } from './src/lib/aiConsent';
import { shouldShowResultFilters } from './src/features/onboarding/tutorialState';
import { AppOverlays } from './src/app/AppOverlays';
import { useCards } from './src/features/cards/useCards';
import { FolderListScreen } from './src/screens/FolderListScreen/FolderListScreen';
import { WordListScreen } from './src/screens/WordListScreen/WordListScreen';
import { WELCOME_FOLDER_NAMES, TIPS_FOLDER_NAMES, WELCOME_CARD_IDS, buildWelcomeCards } from './src/features/onboarding/welcomeContent';
import { useAppBootstrap } from './src/app/useAppBootstrap';
import { useAppSettings } from './src/app/useAppSettings';
import { AppModals } from './src/app/AppModals';
import { TestModeScreen, type TestModeProgress } from './src/components/TestModeScreen';
import { recordAnswer } from './src/features/study/studyLog';
import { AppContextMenu } from './src/app/AppContextMenu';
import { useFolders } from './src/features/folders/useFolders';
import { useThemeController } from './src/features/themes/useThemeController';
import { useFolderNotifications } from './src/features/notifications/useFolderNotifications';
import { useNotificationRescheduling } from './src/features/notifications/useNotificationRescheduling';
import { useAppPersistence } from './src/app/useAppPersistence';
import {
  preloadAIPronunciation,
  preloadAIPronunciationLibrary,
  cancelAIPronunciationPreload,
  purgeRetiredVoiceCaches,
  releaseAIPronunciationCache,
  setAIVoicePreference,
  syncAIVoiceSamplePreloading,
} from './src/lib/tts';
import { normalizedTTSText } from './src/lib/ttsRequest';
import { fetchVoiceCreditBalance } from './src/lib/api/client';
import { useThemePurchases } from './src/hooks/useThemePurchases';
import { isThemeOwnedIndividually } from './src/features/themes/themeProducts';
import { loadPrototypeSpeechHistory } from './src/lib/prototypeTextToSpeech';
import { resolveBulkImportDestination } from './src/features/cards/bulkImport';
import { TEXT_TO_SPEECH_ENABLED } from './src/features/flags';

// Hide Labels is temporarily disabled, so every existing label surface stays visible.
// The underlying useCards state is intentionally retained for a future restoration.
const SHOW_LEVEL_LABELS = true;

/**
 * The cache keys a set of cards still needs. Two words that normalize to the
 * same text share one cached clip, so this is what stops one being deleted while
 * the other still speaks it.
 */
function normalizedWordTexts(cards: readonly WordCard[]): Set<string> {
  return new Set(cards.map(card => normalizedTTSText(card.word)));
}

/** Values on a card that select or invalidate its generated pronunciation. */
function cardVoiceInput(card: WordCard): string {
  return JSON.stringify({
    text: normalizedTTSText(card.word),
    language: card.wordLang?.trim() || null,
    usesCustomAudio: Boolean(card.audioUri?.trim()),
  });
}

export default function App() {
  const {
    plan,
    planProducts,
    isSubscribed,
    isPremium,
    isLoaded: isSubscriptionLoaded,
    expirationDate: subscriptionExpirationDate,
    entitlementSource,
    entitlementRevision,
    subscribe,
    subscribePremium,
    restore,
    unsubscribe,
  } = useSubscription();

  const {
    themeColor, setThemeColor,
    appearance, setAppearance,
    skinId, setSkinId,
    language, setLanguage,
    aiVoice, setAIVoice,
    preferDeviceVoice, setPreferDeviceVoice,
    showFullCard, setShowFullCard,
    verticalFlip, setVerticalFlip,
    hideAiTools, setHideAiTools,
    syncTestResults: savedSyncTestResults,
    setSyncTestResults: setSavedSyncTestResults,
    studyLog, setStudyLog,
    resultFilterTutorialSeen, setResultFilterTutorialSeen,
    firstTestAnswerRecorded, setFirstTestAnswerRecorded,
    settingsLoaded,
    applySettings, markSettingsLoaded,
  } = useAppSettings();

  const {
    cards, setCards,
    folders, setFolders,
    foldersRef,
    learnLang, setLearnLang,
    nativeLang, setNativeLang,
    currentFolderId, setCurrentFolderId,
    showOnboarding, setShowOnboarding,
    notificationGranted, setNotificationGranted,
    hasLoaded, cardsLoaded, loadFailed,
  } = useAppBootstrap({
    applySettings, markSettingsLoaded, setShowFullCard,
    setVerticalFlip, setPreferDeviceVoice, setHideAiTools,
    setSyncTestResults: setSavedSyncTestResults,
    setStudyLog,
    setResultFilterTutorialSeen,
    setFirstTestAnswerRecorded,
  });

  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(language, key), [language]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  // Saving is switched off when stored data could not be read, so the user has
  // to be told — otherwise the app looks empty and silently discards anything
  // they type. Restarting is what usually clears a transient storage error.
  useEffect(() => {
    if (!loadFailed) return;
    Alert.alert(t('load_failed_title'), t('load_failed_message'));
  }, [loadFailed, t]);

  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [bulkImportVisible, setBulkImportVisible] = useState(false);
  const [bulkImportFolderId, setBulkImportFolderId] = useState<string | null>(null);
  const [textToSpeechVisible, setTextToSpeechVisible] = useState(false);
  const [hasTextToSpeechHistory, setHasTextToSpeechHistory] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [testModeAnalyticsVisible, setTestModeAnalyticsVisible] = useState(false);
  const [testModeProgress, setTestModeProgress] = useState<TestModeProgress | null>(null);
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef<View>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [proSheetVisible, setProSheetVisible] = useState(false);

  useEffect(() => {
    if (!TEXT_TO_SPEECH_ENABLED) return;
    let active = true;
    loadPrototypeSpeechHistory()
      .then(items => { if (active) setHasTextToSpeechHistory(items.length > 0); })
      .catch(() => { if (active) setHasTextToSpeechHistory(false); });
    return () => { active = false; };
  }, []);

  // Files for voices the app no longer offers, collected once per launch. It
  // touches nothing reachable, so it needs no entitlement and no ordering
  // against bootstrap — and it never awaits, so startup does not see it.
  useEffect(() => { purgeRetiredVoiceCaches(); }, []);

  // Consent is a live queue input, not a one-time read. A post-purchase sweep
  // that had to wait for the dialog begins in the same turn that Allow is
  // persisted; declining or withdrawing continues to prevent every preload.
  const [aiConsentState, setAIConsentState] = useState<AIConsentState>(getAIConsent());
  useEffect(() => {
    let active = true;
    void loadAIConsent().then(state => { if (active) setAIConsentState(state); });
    const unsubscribeConsent = subscribeToAIConsent(state => {
      if (active) setAIConsentState(state);
    });
    return () => { active = false; unsubscribeConsent(); };
  }, []);

  // A fresh Worker lookup is the post-purchase/restore barrier: it bypasses a
  // cached Free entitlement, confirms RevenueCat server-side and initializes
  // Basic's Durable Object balance before any library job is admitted.
  const [voiceCreditReadyRevision, setVoiceCreditReadyRevision] = useState<number | null>(null);
  useEffect(() => {
    if (!isSubscriptionLoaded || !planCanUseAI(plan)
      || entitlementSource === 'local-development-scenario') {
      setVoiceCreditReadyRevision(null);
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let finishRetryWait: (() => void) | null = null;
    setVoiceCreditReadyRevision(null);

    const waitBeforeRetry = (milliseconds: number): Promise<void> => new Promise(resolve => {
      finishRetryWait = resolve;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        finishRetryWait = null;
        resolve();
      }, milliseconds);
    });

    void (async () => {
      let lastError: unknown = new Error('voice_credit_balance_not_initialized');
      // RevenueCat's SDK can report the purchase a moment before its REST API
      // reflects it. Every call bypasses the Worker's entitlement cache, so a
      // short bounded retry bridges that propagation window without requiring
      // a screen refresh or app restart.
      for (let attempt = 0; attempt < 5 && !cancelled; attempt += 1) {
        try {
          const balance = await fetchVoiceCreditBalance();
          if (balance.tier === plan) {
            if (!cancelled) setVoiceCreditReadyRevision(entitlementRevision);
            return;
          }
          lastError = new Error('voice_credit_tier_mismatch');
        } catch (error) {
          lastError = error;
        }
        if (attempt < 4 && !cancelled) await waitBeforeRetry(500 * (2 ** attempt));
      }
      if (!cancelled) reportSideEffectFailure('initialize AI Voice credits', lastError);
    })();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
        finishRetryWait?.();
        finishRetryWait = null;
      }
    };
  }, [entitlementRevision, entitlementSource, isSubscriptionLoaded, plan]);

  // Upgrading after Basic exhaustion must resume Natural AI Voice immediately;
  // the fallback preference existed only because Basic had no credits left.
  useEffect(() => {
    if (isSubscriptionLoaded && plan === 'premium') setPreferDeviceVoice(false);
  }, [isSubscriptionLoaded, plan, setPreferDeviceVoice]);

  useEffect(() => {
    if (!isSubscriptionLoaded) return;
    if (entitlementSource === 'local-development-scenario') return;
    syncAIVoiceSamplePreloading({
      hasAIAccess: planCanUseAI(plan),
      activeEntitlement: plan === 'premium' ? plan : undefined,
      triggerReason: entitlementSource ?? 'subscription-state-loaded',
    });
  }, [aiConsentState, entitlementRevision, entitlementSource, isSubscriptionLoaded, plan]);

  // Preload every existing word's AI pronunciation once an entitlement is active, so the
  // voice icon plays from cache instead of generating on first tap. Guarded by a key
  // rather than a bare mount check: the sweep must also run when cards finish loading
  // after the subscription resolves, and must repeat if the chosen voice changes, since
  // the cache is keyed by voice. Cards added later are covered by handleCardRegistered.
  const preloadedLibraryKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (entitlementSource === 'local-development-scenario') {
      preloadedLibraryKeyRef.current = null;
      return;
    }
    const hasAIAccess = planCanUseAI(plan) && !preferDeviceVoice;
    if (!isSubscriptionLoaded || !settingsLoaded || !hasAIAccess
      || voiceCreditReadyRevision !== entitlementRevision
      || aiConsentState !== 'granted') {
      // Losing access clears the key so re-subscribing sweeps again.
      if (!hasAIAccess) preloadedLibraryKeyRef.current = null;
      return;
    }
    if (cards.length === 0) return;

    const key = `${plan} ${aiVoice} ${entitlementRevision}`;
    if (preloadedLibraryKeyRef.current === key) return;
    preloadedLibraryKeyRef.current = key;

    // Put the open folder first without moving any cards in storage. This only
    // affects queue order, so the words the user can currently see become
    // playable before the remainder of a large post-purchase sweep.
    const orderedCards = currentFolderId === null
      ? cards
      : [
        ...cards.filter(card => card.folderId === currentFolderId),
        ...cards.filter(card => card.folderId !== currentFolderId),
      ];

    preloadAIPronunciationLibrary({
      entries: orderedCards.map(card => ({
        id: card.id,
        text: card.word,
        language: card.wordLang,
        hasCustomAudio: Boolean(card.audioUri),
      })),
      voice: aiVoice,
      hasAIAccess: true,
      triggerReason: entitlementSource ?? 'entitlement-active',
    });
  }, [
    aiConsentState, aiVoice, cards, currentFolderId, entitlementRevision, entitlementSource,
    isSubscriptionLoaded, plan, preferDeviceVoice, settingsLoaded, voiceCreditReadyRevision,
  ]);

  // ── AI entitlement ────────────────────────────────────────────────────────────
  // One rule, published to the network guard and read by every AI surface, so
  // no screen has to restate which plans may use AI.
  const aiEntitlement = useMemo(
    () => ({ plan, isSubscriptionLoaded, entitlementSource }),
    [entitlementSource, isSubscriptionLoaded, plan],
  );
  const canUseAI = hasEligibleAIEntitlement(aiEntitlement);
  // High-Quality AI Voice remains entitlement-gated. Custom Voice and Hide Word
  // are local features available on every plan and need no capability state.
  //
  // The user's own fallback is the second half of the rule. Choosing the free
  // device voice after Basic's credits ran out has to stop AI generation being
  // attempted at all — otherwise every card would fetch, be refused, and raise
  // the same dialog again. It withholds nothing they are entitled to: picking a
  // voice again in Settings clears it.
  const voiceBackendReady = entitlementSource === 'local-development-scenario'
    || voiceCreditReadyRevision === entitlementRevision;
  const canUseAIVoice = canUseAI && !preferDeviceVoice && voiceBackendReady;
  const discovery = useFeatureDiscovery({ plan, isSubscriptionLoaded });

  // ── Individual theme purchases ──────────────────────────────────────────────
  // Lives here rather than in the shop because three separate things need the
  // same answer: the shop's prices, the access rule, and the downgrade
  // enforcement below. A second copy could disagree with the first and take a
  // theme away from someone who paid for it.
  const themePurchases = useThemePurchases(isSubscriptionLoaded);
  const ownedThemeEntitlementIds = themePurchases.ownedEntitlementIds;

  useEffect(() => {
    setAIEntitlementSnapshot(aiEntitlement);
  }, [aiEntitlement]);

  // ── Consent, offered once after a verified purchase ───────────────────────
  // Loaded from storage so it cannot repeat on the next launch; cleared on a
  // verified downgrade below, so a later resubscription asks again.
  const [consentPromptShown, setConsentPromptShown] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(SUBSCRIPTION_CONSENT_PROMPT_KEY)
      // Defaults to "already shown" until the real value arrives, so a slow
      // read can never flash the dialog at someone who has seen it.
      .then(raw => setConsentPromptShown(parseConsentPromptShown(raw)))
      .catch(() => setConsentPromptShown(true));
  }, []);

  // A confirmed move to Free ends the period the permission was given for, so
  // the stored answer stops being reusable: resubscribing must ask again.
  //
  // Gated on `isVerifiedAIIneligiblePlan`, never on the plan alone. A RevenueCat outage
  // leaves the plan at its 'free' default with no source, and revoking a paying
  // subscriber's permission because their network was down would be the worst
  // possible reading of that. `invalidateAIConsent` is a no-op once there is
  // nothing stored, so this does not write on every launch.
  useEffect(() => {
    if (!isVerifiedAIIneligiblePlan(aiEntitlement)) return;
    void invalidateAIConsent();
    // The offer belongs to the subscription period that just ended. Clearing it
    // is what lets the next verified subscription ask again.
    setConsentPromptShown(false);
    AsyncStorage.setItem(SUBSCRIPTION_CONSENT_PROMPT_KEY, serializeConsentPromptShown(false))
      .catch(e => reportSideEffectFailure('clearSubscriptionConsentPrompt', e));
  }, [aiEntitlement]);

  // ── Tutorials ─────────────────────────────────────────────────────────────────
  // The filters appear once the user has been told what the colours mean. That
  // is the first answer now — the third Test introduction popup explains the
  // coloured sections at that moment — while the old tutorial's flag is still
  // read for everyone taught the previous way, including the users the
  // bootstrap migration granted it to. One rule, both eras.
  const showResultFilters = shouldShowResultFilters({
    hasSeenResultFilterTutorial: resultFilterTutorialSeen,
    hasCompletedFirstTestAnswer: firstTestAnswerRecorded,
  });

  // A backup import in "replace" mode swaps out every row, so React state and
  // the database have to be resynchronised. Navigation is reset to the folder
  // list because the folder that was open may no longer exist.
  const reloadAfterImport = useCallback(() => {
    reloadLocalData()
      .then(snapshot => {
        setCurrentFolderId(null);
        foldersRef.current = snapshot.folders;
        setFolders(snapshot.folders);
        setCards(snapshot.cards);
        applySettings(snapshot.settings);
      })
      .catch(error => {
        if (__DEV__) {
          console.error(
            '[app] reload after import failed:',
            error instanceof Error ? error.name : 'UnknownError',
          );
        }
      });
  }, [applySettings, foldersRef, setCards, setCurrentFolderId, setFolders]);

  // ── Folder navigation ────────────────────────────────────────────────────────
  const [addingFolder, setAddingFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const folderMenuBtnRef = useRef<View>(null);
  const closeOpenFolder = useRef<(() => void) | null>(null);
  // WordList owns the scroll-position handoff that must happen before List
  // becomes Flip. Settings invokes that same path when the list is mounted;
  // outside a folder there is no position to prepare, so it may update the
  // shared mode state directly.
  const wordListViewModeChangeRef = useRef<((mode: 'list' | 'flip') => void) | null>(null);
  const [menuContext, setMenuContext] = useState<'cards' | 'folders'>('cards');
  const {
    folderSelectionMode, selectedFolderIds, folderReorderMode,
    movePickerVisible, setMovePickerVisible,
    enterFolderSelectionMode, exitFolderSelectionMode, toggleFolderSelect, selectAllFolders,
    deleteSelectedFolders, enterFolderReorderMode, exitFolderReorderMode,
    createFolder, deleteFolder, renameFolder, openMovePicker, moveCardsToFolder,
  } = useFolders({
    folders,
    fallbackFolderName: t('default_folder_name'),
    setFolders,
    setCards,
    setMenuVisible,
    // A move that hits a word the target folder already has leaves it in place.
    // Told as a passing notice rather than an alert: nothing failed and nothing
    // was lost, some words simply had nowhere new to go.
    onDuplicatesSkipped: count => showTopBanner({
      id: 'move-duplicates',
      message: t('duplicate_move_skipped').replace('{n}', String(count)),
    }),
  });

  const automaticAIVoiceReady = canUseAIVoice
    && entitlementSource !== 'local-development-scenario'
    && aiConsentState === 'granted';

  const handleCardRegistered = useCallback(async (
    card: WordCard,
    remaining: readonly WordCard[],
  ) => {
    // Local vocabulary is durable before its text can leave the device. If the
    // card changed or disappeared while SQLite was flushing, its stale job is
    // abandoned and the newer save owns the next enqueue.
    await persistCardsAndWait([...remaining]);
    const current = cardsRef.current.find(candidate => candidate.id === card.id);
    if (!current || cardVoiceInput(current) !== cardVoiceInput(card)) return;
    preloadAIPronunciation({
      entryId: card.id,
      text: card.word,
      voice: aiVoice,
      language: card.wordLang,
      hasAIAccess: automaticAIVoiceReady,
      hasCustomAudio: Boolean(card.audioUri),
      priority: 'high',
    });
  }, [aiVoice, automaticAIVoiceReady]);

  /**
   * An edit is two jobs: the old clip is now unreachable from this card, and the
   * new text has none yet. Release runs first — it cancels this card's queued
   * work, which would otherwise take the preload queued on the line below with it.
   *
   * A word whose normalized text did not move keeps everything: the cache key is
   * unchanged, so there is nothing to generate and nothing that has gone stale.
   */
  const handleCardEdited = useCallback(async (change: {
    card: WordCard;
    previousCard: WordCard;
    remaining: readonly WordCard[];
  }) => {
    if (cardVoiceInput(change.previousCard) === cardVoiceInput(change.card)) return;

    const textChanged = normalizedTTSText(change.previousCard.word)
      !== normalizedTTSText(change.card.word);
    if (textChanged) {
      releaseAIPronunciationCache({
        entryIds: [change.card.id],
        texts: [change.previousCard.word],
        retainedTexts: normalizedWordTexts(change.remaining),
      });
    } else {
      // Language/custom-audio changes make this owner's queued request stale,
      // but do not make the old text cache unreachable for other cards.
      cancelAIPronunciationPreload(change.card.id);
    }

    await persistCardsAndWait([...change.remaining]);
    const current = cardsRef.current.find(candidate => candidate.id === change.card.id);
    if (!current || cardVoiceInput(current) !== cardVoiceInput(change.card)) return;
    preloadAIPronunciation({
      entryId: change.card.id,
      text: change.card.word,
      voice: aiVoice,
      language: change.card.wordLang,
      hasAIAccess: automaticAIVoiceReady,
      hasCustomAudio: Boolean(change.card.audioUri),
      priority: 'high',
    });
  }, [aiVoice, automaticAIVoiceReady]);

  /**
   * Basic's grant is spent. The dialog owns the two ways forward.
   *
   * The replay is kept rather than called: "Use Free Voice" speaks the word the
   * user actually asked for, while "Upgrade to Premium" must not start audio
   * underneath the paywall.
   */
  const [voiceCreditsFallback, setVoiceCreditsFallback] = useState<(() => void) | null>(null);
  const handleVoiceCreditsExhausted = useCallback((useFreeVoice: () => void) => {
    setVoiceCreditsFallback(() => useFreeVoice);
  }, []);
  const handleUpgradeFromVoiceCredits = useCallback(() => {
    setVoiceCreditsFallback(null);
    setProSheetVisible(true);
  }, []);
  const handleUseFreeVoice = useCallback(() => {
    // The preference first: it is what stops the next card raising this again.
    setPreferDeviceVoice(true);
    setVoiceCreditsFallback(current => {
      current?.();
      return null;
    });
  }, [setPreferDeviceVoice]);

  /**
   * Choosing a voice is how the user asks for Natural AI Voice again.
   *
   * Clearing the fallback here rather than in the picker keeps the two halves
   * of the rule together: one place turns it on, one place turns it off.
   */
  const handlePickAIVoice = useCallback((voice: AIVoice) => {
    setAIVoice(voice);
    setPreferDeviceVoice(false);
  }, [setAIVoice, setPreferDeviceVoice]);

  const handleCardsImported = useCallback(async (
    imported: readonly WordCard[],
    remaining: readonly WordCard[],
  ) => {
    await persistCardsAndWait([...remaining]);
    const importedIds = new Set(imported.map(card => card.id));
    const currentImported = cardsRef.current.filter(card => importedIds.has(card.id));
    preloadAIPronunciationLibrary({
      entries: currentImported.map(card => ({
        id: card.id,
        text: card.word,
        language: card.wordLang,
        hasCustomAudio: Boolean(card.audioUri),
      })),
      voice: aiVoice,
      hasAIAccess: automaticAIVoiceReady,
      triggerReason: 'bulk-import',
      priority: 'high',
    });
  }, [aiVoice, automaticAIVoiceReady]);

  // Releasing covers the cancellation the delete path always did, and adds the
  // files: same call for one word and for a select-all, since both arrive here.
  const handleCardsDeleted = useCallback((
    removed: readonly WordCard[],
    remaining: readonly WordCard[],
  ) => {
    releaseAIPronunciationCache({
      entryIds: removed.map(card => card.id),
      texts: removed.map(card => card.word),
      retainedTexts: normalizedWordTexts(remaining),
    });
  }, []);

  const {
    flipped, toggleFlip,
    selectionMode, selectedIds,
    enterSelectionMode, exitSelectionMode, toggleSelect, selectAllCards, deleteSelected, deleteCards,
    setNotifCandidateForSelected,
    reorderMode, reorderSortDir,
    enterReorderMode, exitReorderMode, cancelReorderMode, replaceFolderOrder,
    handleRegistrationOrder, handleRandomOrder,
    // Temporarily disabled with the Hide Labels menu control:
    // showLevelLabels, setShowLevelLabels,
    levelCounts,
    allFolderCards, folderCards,
    cardViewMode, setCardViewMode, currentWordId, setCurrentWordId,
    closeOpenCard, handleCardOpen,
    wordModalVisible, setWordModalVisible,
    editingCard,
    word, setWord,
    meaning, setMeaning,
    note, setNote,
    wordFieldLang, setWordFieldLang,
    meaningFieldLang, setMeaningFieldLang,
    wordHideWord, setWordHideWord,
    wordAudioUri, setWordAudioUri,
    wordAudioSpeed, setWordAudioSpeed,
    wordAudioVolume, setWordAudioVolume,
    reviewHistory, testClearPending, resetWordReview,
    openAdd, openEdit, saveCard, bulkImportCards, deleteCard, toggleCardNotif, toggleCardHideWord,
    testModeVisible, setTestModeVisible,
  } = useCards({
    cards,
    setCards,
    currentFolderId,
    language,
    setMenuVisible,
    onCardRegistered: handleCardRegistered,
    onCardEdited: handleCardEdited,
    onCardsImported: handleCardsImported,
    onCardsDeleted: handleCardsDeleted,
  });

  const currentFolder = folders.find(f => f.id === currentFolderId) ?? null;

  const openTestModeAnalytics = useCallback(() => {
    setTestModeAnalyticsVisible(true);
  }, []);
  const closeTestModeAnalytics = useCallback(() => {
    setTestModeAnalyticsVisible(false);
  }, []);
  const quitTestMode = useCallback(() => {
    // Exiting changes only Test Mode presentation state. Each answer has already
    // been written at selection time, so there is no completion path to run.
    setTestModeAnalyticsVisible(false);
    setTestModeVisible(false);
  }, [setTestModeVisible]);
  const toggleTestMode = useCallback(() => {
    setTestModeAnalyticsVisible(false);
    setTestModeVisible(open => !open);
  }, [setTestModeVisible]);

  /**
   * The Test introduction step currently on screen, published by the test.
   *
   * Only the presentation lives up here — the sequencing, the stored flags and
   * the dismissal all stay with `TestModeScreen`, which is the only place that
   * can see whether a card has been turned over or answered. What this buys is
   * a host outside the SafeAreaView, which is the only way a plain view can dim
   * the status bar and the bottom strip.
   */
  const [testIntro, setTestIntro] = useState<{
    message: string;
    onDismiss: () => void;
    spotlight: SpotlightTarget | null;
  } | null>(null);
  /**
   * Where the things a step points at actually are.
   *
   * Two screens own the two targets — the card is the test's, the colour
   * filters are the word list's — and each reports its own measurement as it
   * lays out. Collected here because this is where the overlay is drawn, and
   * kept as a rect rather than a constant so the bright area lands on the real
   * control at any size, language or device.
   */
  const [spotlightRects, setSpotlightRects] = useState<Partial<Record<SpotlightTarget, SpotlightRect>>>({});
  const setSpotlightRect = useCallback((target: SpotlightTarget, rect: SpotlightRect | null) => {
    setSpotlightRects(current => {
      if (rect === null) {
        if (!(target in current)) return current;
        const next = { ...current };
        delete next[target];
        return next;
      }
      const previous = current[target];
      // Layout fires on every pass; only a real move is worth a render.
      if (previous
        && previous.x === rect.x && previous.y === rect.y
        && previous.width === rect.width && previous.height === rect.height
        && previous.radius === rect.radius) {
        return current;
      }
      return { ...current, [target]: rect };
    });
  }, []);
  const setCardSpotlight = useCallback(
    (rect: SpotlightRect | null) => setSpotlightRect('card', rect),
    [setSpotlightRect],
  );
  const setResultFiltersSpotlight = useCallback(
    (rect: SpotlightRect | null) => setSpotlightRect('resultFilters', rect),
    [setSpotlightRect],
  );

  // ── The Word List header's two markers, in sequence ───────────────────────
  // Resolved here rather than in the screen: the second one's condition spans
  // two screens and a whole session, which is not something a header can see.
  const showTestMarker = shouldShowTestMarker({ plan, isSubscriptionLoaded, seen: discovery.seen });
  const showNotificationMarker = shouldShowNotificationMarker({
    plan, isSubscriptionLoaded, seen: discovery.seen,
  });

  // The milestone between the two: the first test has been opened, and is no
  // longer open. Recorded from this condition rather than from the exit handler
  // because that also covers a force-quit inside the first session — on the
  // next launch the test is closed and the icon is already marked as tapped, so
  // the Notification marker is waiting where it would have been.
  //
  // The opening tap cannot trip it: dismissing the Test marker and opening the
  // mode are two updates from one handler, so they land in a single render and
  // there is no commit in which the icon is marked but the test is not yet open.
  //
  // `dismiss` is idempotent and writes only on a change, so this may run on
  // every render, on every close, and twice under Strict Mode without recording
  // anything twice.
  useEffect(() => {
    if (!hasExitedFirstTest(discovery.seen, testModeVisible)) return;
    discovery.dismiss(FEATURE_MARKERS.firstTestExited);
    // The set and the stable dismisser, not the hook's return object — which is
    // new on every render and would run this on every render for nothing.
  }, [discovery.seen, discovery.dismiss, testModeVisible]);

  const {
    folderNotifSettings,
    notificationsEnabled,
    updateFolderNotif,
    handlePickInterval,
    toggleNotifyAllWords,
    noNotifiableWords,
    sendTestForCurrentFolder,
  } = useFolderNotifications({
    folders,
    setFolders,
    currentFolderId,
    notificationGranted,
    setNotificationGranted,
    allFolderCards,
    t,
  });

  // The only remaining metered feature is AI voice playback. Words and folders are
  // unlimited on every plan, so nothing recommends Pro on registration any more.
  // Read off the live card rather than the `editingCard` snapshot the sheet was
  // opened with: the sheet's notification action writes through immediately, so
  // the snapshot goes stale the moment it is tapped.
  const editingCardNotifCandidate = editingCard !== null
    && cards.find(c => c.id === editingCard.id)?.notifCandidate === true;

  const openVoicePaywall = () => setPaywallVisible(true);

  const openBulkImport = () => {
    const destinationFolderId = resolveBulkImportDestination(currentFolderId);
    if (!destinationFolderId) return;
    setBulkImportFolderId(destinationFolderId);
    setBulkImportVisible(true);
    setMenuVisible(false);
  };

  const openMenu = () => {
    menuBtnRef.current?.measureInWindow((x, y, w, h) => {
      setMenuAnchor({ top: y + h + 4, right: Dimensions.get('window').width - x - w });
      setMenuContext('cards');
      setMenuVisible(true);
    });
  };

  const openFolderMenu = () => {
    folderMenuBtnRef.current?.measureInWindow((x, y, w, h) => {
      setMenuAnchor({ top: y + h + 4, right: Dimensions.get('window').width - x - w });
      setMenuContext('folders');
      setMenuVisible(true);
    });
  };


  // Anything that owns the screen and must not be interrupted by a tutorial.
  const screenBusy = showOnboarding || wordModalVisible || bulkImportVisible
    || settingsModalVisible || notificationModalVisible
    || menuVisible || paywallVisible || proSheetVisible
    || selectionMode || reorderMode;

  // Offered once, after a verified purchase, and only once the Upgrade sheet
  // has gone. `InteractionManager` waits for the sheet's dismissal animation to
  // finish rather than guessing at a duration, so the dialog cannot appear
  // underneath it or during the transition.
  useEffect(() => {
    if (!shouldPromptConsentAfterSubscription({
      plan,
      isSubscriptionLoaded,
      entitlementSource,
      consent: getAIConsent(),
      alreadyPrompted: consentPromptShown,
      isUpgradeSheetClosed: !proSheetVisible && !settingsModalVisible,
      isScreenBusy: screenBusy,
    })) return;

    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      // Recorded before the dialog opens: whatever the user answers, and even
      // if they dismiss it, the one-time offer has been made.
      setConsentPromptShown(true);
      AsyncStorage.setItem(SUBSCRIPTION_CONSENT_PROMPT_KEY, serializeConsentPromptShown(true))
        .catch(e => reportSideEffectFailure('setSubscriptionConsentPrompt', e));
      // The same prompt every AI surface uses. It sends nothing by itself.
      void loadAIConsent().then(() => ensureAIConsentForUserAction());
    });
    return () => { cancelled = true; handle.cancel(); };
  }, [
    consentPromptShown, entitlementSource, isSubscriptionLoaded, plan,
    proSheetVisible, screenBusy, settingsModalVisible,
  ]);

  // Nothing is raised by leaving Test Mode any more. The three introduction
  // popups live inside the test itself — opening it, uncovering the answers, and
  // the first answer — and are owned there, by `useTestIntro`. Closing the test,
  // the X button and navigating away therefore show nothing at all.

  // Tracks word-list scroll position for the Deep Sea skin gradient effect.
  const scrollY = useRef(new Animated.Value(0)).current;

  const { activeSkin, isDark, pal, activeThemeColor } = useThemeController({
    skinId,
    themeColor,
    appearance,
    isSubscribed,
    ownedEntitlementIds: ownedThemeEntitlementIds,
  });

  useAppPersistence({
    cards, folders, foldersRef,
    themeColor, appearance, skinId, language, aiVoice,
    showFullCard, verticalFlip, hideAiTools, preferDeviceVoice,
    syncTestResults: savedSyncTestResults,
    studyLog,
    resultFilterTutorialSeen, firstTestAnswerRecorded,
    hasLoaded, cardsLoaded,
  });

  useNotificationRescheduling({ cards, folders, notificationGranted, hasLoaded });

  useEffect(() => {
    setAIVoicePreference(aiVoice);
  }, [aiVoice]);

  // ── Theme ────────────────────────────────────────────────────────────────────

  // Enforce free-plan color constraint. Runs after both settings AND subscription
  // status have loaded (to avoid a race where isSubscribed is still the initial
  // false before AsyncStorage resolves). Also re-runs on every subsequent change
  // to isSubscribed or themeColor — covers the downgrade case at runtime.
  useEffect(() => {
    if (!settingsLoaded || !isSubscriptionLoaded) return;
    // Ownership has to be known before anything is reset. At launch the owned
    // set is empty until RevenueCat answers, and acting on that emptiness
    // would reset a purchased theme to blue *and persist it* — destroying the
    // user's choice on every cold start.
    if (!themePurchases.ownershipLoaded) return;
    if (!isSubscribed) {
      // Reset a paid skin to the default free theme — unless this exact theme
      // was bought outright, which survives the subscription ending.
      if (
        skinId
        && !FREE_SKIN_IDS.has(skinId)
        && !isThemeOwnedIndividually(skinId, ownedThemeEntitlementIds)
      ) {
        setSkinId('solid_blue');
      }
      // Legacy: if no skin is active and themeColor drifted to a paid color, reset it.
      if (!skinId && themeColor !== FREE_THEME_COLOR) {
        setThemeColor(FREE_THEME_COLOR);
      }
    }
  }, [
    isSubscribed, isSubscriptionLoaded, ownedThemeEntitlementIds,
    themePurchases.ownershipLoaded, settingsLoaded, skinId, themeColor,
  ]);

  const pickAppearance = (mode: Appearance) => setAppearance(mode);
  const pickLanguage = (code: string) => setLanguage(code);

  const handleFolderOpen = useCallback((close: () => void) => {
    if (closeOpenFolder.current !== close) closeOpenFolder.current?.();
    closeOpenFolder.current = close;
  }, []);
  const handleCardViewModeChange = useCallback((mode: 'list' | 'flip') => {
    const changeFromWordList = wordListViewModeChangeRef.current;
    if (changeFromWordList) {
      changeFromWordList(mode);
      return;
    }
    setCardViewMode(mode);
  }, [setCardViewMode]);

  const openFolder = (id: string) => {
    closeOpenFolder.current?.();
    exitSelectionMode();
    cancelReorderMode();
    exitFolderSelectionMode();
    exitFolderReorderMode();
    // Test Mode belongs to the folder it was started in, and its queue is that
    // folder's words. Leaving the folder ends it rather than carrying it over.
    setTestModeAnalyticsVisible(false);
    setTestModeVisible(false);
    setCurrentFolderId(id);
    scrollY.setValue(0);
  };

  const goBackToFolders = () => {
    exitSelectionMode();
    cancelReorderMode();
    setTestModeAnalyticsVisible(false);
    setTestModeVisible(false);
    setCurrentFolderId(null);
    // Reset depth gradient to ocean surface when navigating away from word list.
    scrollY.setValue(0);
  };

  // Test Mode is a card-area mode of the word-list screen, like List and Flip —
  // never a sheet. Mounted only while it is running, so entering takes a fresh
  // queue; kept mounted for the whole session, so no re-render, filter change or
  // card update can restart it.
  const testModeContent = testModeVisible ? (
    <TestModeScreen
      cards={folderCards}
      resetCards={allFolderCards}
      onUpdateCard={(id, patch) => setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))}
      onDeleteCard={deleteCard}
      // Recorded on the answer itself rather than at the end of the test, so
      // it survives a force-quit straight afterwards. Setting it does not
      // interrupt the test — it only makes the tutorial eligible for later.
      onFirstAnswer={() => setFirstTestAnswerRecorded(true)}
      // Every graded card, counted on the day it was answered. Written with the
      // real clock, like every other persisted timestamp, so the development
      // time offset can never end up in the record.
      onAnswerRecorded={answeredAt => setStudyLog(log => recordAnswer(log, answeredAt))}
      studyLog={studyLog}
      analyticsOpen={testModeAnalyticsVisible}
      onCloseAnalytics={closeTestModeAnalytics}
      onOpenAnalytics={openTestModeAnalytics}
      onProgressChange={setTestModeProgress}
      // Publishes the introduction step so it can be drawn full-screen. The
      // test reports null when it unmounts, so quitting takes the overlay with
      // it — and reporting nothing at all would only mean no popup, never a
      // stuck one.
      onIntroChange={setTestIntro}
      onCardSpotlightChange={setCardSpotlight}
      pal={pal}
      themeColor={activeThemeColor}
      canUseAIVoice={canUseAIVoice}
      onVoiceCreditsExhausted={handleVoiceCreditsExhausted}
      explanationLang={nativeLang}
      verticalFlip={verticalFlip}
    />
  ) : null;


  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <LangContext.Provider value={t}>
    {/* The window itself. Everything the app draws lives inside the SafeAreaView
        below; this outer view exists only so the Test introduction overlay can
        be laid out against the whole screen rather than the inset area — an
        absolutely-filled child is positioned inside its parent's padding, so
        nothing rendered under the SafeAreaView can reach the status bar or the
        home-indicator strip. It carries the background colour for the same
        reason: those two regions are now its to paint. */}
    <View style={[s.root, { backgroundColor: pal.bg }]}>
    <SafeAreaView style={s.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppOverlays activeSkin={activeSkin} scrollY={scrollY} />

      {currentFolderId === null ? (
        <FolderListScreen
          pal={pal}
          themeColor={activeThemeColor}
          isSubscribed={isSubscribed}
          showLevelLabels={SHOW_LEVEL_LABELS}
          folders={folders}
          cards={cards}
          selection={{
            active: folderSelectionMode,
            selectedIds: selectedFolderIds,
            onToggle: toggleFolderSelect,
            onSelectAll: selectAllFolders,
            onExit: exitFolderSelectionMode,
            onDelete: deleteSelectedFolders,
          }}
          reorder={{
            active: folderReorderMode,
            onExit: exitFolderReorderMode,
            onReorder: (orderedIds) =>
              setFolders(prev => orderedIds.map(id => prev.find(f => f.id === id)!)),
          }}
          actions={{
            onOpenFolder: openFolder,
            onAddFolder: () => setAddingFolder(true),
            onEditFolder: setEditingFolder,
            onDeleteFolder: deleteFolder,
            onOpenMenu: openFolderMenu,
          }}
          menuBtnRef={folderMenuBtnRef}
          onFolderOpen={handleFolderOpen}
        />
      ) : (
        <WordListScreen
          pal={pal}
          themeColor={activeThemeColor}
          isSubscribed={isSubscribed}
          isPremium={isPremium}
          canUseAIVoice={canUseAIVoice}
          onVoiceCreditsExhausted={handleVoiceCreditsExhausted}
          hasTextToSpeechHistory={TEXT_TO_SPEECH_ENABLED && hasTextToSpeechHistory}
          showTestMarker={showTestMarker}
          showNotificationMarker={showNotificationMarker}
          onResultFiltersLayout={setResultFiltersSpotlight}
          scrollY={scrollY}
          deepSeaSkin={activeSkin?.id === 'skin_deep_sea'}
          currentFolder={currentFolder}
          allFolderCards={allFolderCards}
          visibleFolderCards={folderCards}
          levelCounts={levelCounts}
          showFullCard={showFullCard}
          verticalFlip={verticalFlip}
          notificationsEnabled={notificationsEnabled}
          cardViewMode={cardViewMode}
          onChangeViewMode={setCardViewMode}
          viewModeChangeRef={wordListViewModeChangeRef}
          currentWordId={currentWordId}
          onCurrentWordChange={setCurrentWordId}
          // Hidden until the user has a reason to understand them — see
          // shouldShowResultFilters. Existing users with results keep them.
          showResultFilters={showResultFilters}
          showLevelLabels={SHOW_LEVEL_LABELS}
          flipped={flipped}
          closeOpenCard={closeOpenCard}
          onCardOpen={handleCardOpen}
          selection={{
            active: selectionMode,
            selectedIds,
            onToggle: toggleSelect,
            onSelectAll: selectAllCards,
            onExit: exitSelectionMode,
            onSetNotifCandidate: setNotifCandidateForSelected,
            onMoveSelected: () => openMovePicker([...selectedIds]),
            onDelete: deleteSelected,
          }}
          reorder={{
            active: reorderMode,
            sortDir: reorderSortDir,
            onRegistrationOrder: handleRegistrationOrder,
            onRandomOrder: handleRandomOrder,
            // Dragging updates the pending full-folder order; Save commits it.
            onReorder: replaceFolderOrder,
            onExit: exitReorderMode,
            onCancel: cancelReorderMode,
          }}
          actions={{
            onGoBack: goBackToFolders,
            onOpenTextToSpeech: () => {
              if (!TEXT_TO_SPEECH_ENABLED) return;
              if (isPremium || hasTextToSpeechHistory) setTextToSpeechVisible(true);
              else setProSheetVisible(true);
            },
            // Navigate first, record second — in both of these. The marker is
            // a note about what the user has seen; it has no say in whether the
            // control works, and putting it second means it cannot come between
            // the tap and the thing the tap is for.
            onOpenNotifications: () => {
              setNotificationModalVisible(true);
              discovery.dismiss(FEATURE_MARKERS.notificationIcon);
            },
            onOpenMenu: openMenu,
            // One control, both directions: the Test button switches the card
            // area into Test Mode and back out again, in place. The marker is
            // spent on the way in — the same tap that opens the test — so the
            // count is back the moment the user returns to the list. Toggling
            // is unconditional: this is also the way *out*, and a marker that
            // has already been recorded must not change that.
            onOpenTestMode: () => {
              toggleTestMode();
              discovery.dismiss(FEATURE_MARKERS.testIcon);
            },
            onFlip: toggleFlip,
            onEdit: openEdit,
            onDelete: deleteCard,
            onDeleteWords: deleteCards,
            onMove: openMovePicker,
            onToggleNotif: toggleCardNotif,
            onToggleHideWord: toggleCardHideWord,
            onVoiceLocked: openVoicePaywall,
            onOpenAdd: openAdd,
          }}
          testMode={{
            active: testModeVisible,
            content: testModeContent,
            onQuit: quitTestMode,
            progress: testModeProgress,
          }}
          menuBtnRef={menuBtnRef}
        />
      )}

      {!isSubscribed && <AdBannerPlaceholder pal={pal} />}

      {/* Raised only by a refused generation, so it cannot appear while
          credits remain and never appears for cached playback. */}
      <VoiceCreditsExhaustedDialog
        visible={voiceCreditsFallback !== null}
        onUpgrade={handleUpgradeFromVoiceCredits}
        onUseFreeVoice={handleUseFreeVoice}
        pal={pal}
        themeColor={activeThemeColor}
      />

      <AppModals
        pal={pal}
        themeColor={activeThemeColor}
        rawThemeColor={themeColor}
        isSubscribed={isSubscribed}
        isPremium={isPremium}
        subscriptionExpirationDate={subscriptionExpirationDate}
        isSubscriptionLoaded={isSubscriptionLoaded}
        subscribe={subscribe}
        subscribePremium={subscribePremium}
        restore={restore}
        onManageSubscription={__DEV__ ? unsubscribe : undefined}
        wordModal={{
          visible: wordModalVisible,
          onClose: () => setWordModalVisible(false),
          onBulkImport: () => {
            setWordModalVisible(false);
            openBulkImport();
          },
          editingCard,
          word,
          onChangeWord: setWord,
          meaning,
          onChangeMeaning: setMeaning,
          note,
          onChangeNote: setNote,
          onSave: saveCard,
          wordLang: wordFieldLang,
          onChangeWordLang: setWordFieldLang,
          meaningLang: meaningFieldLang,
          onChangeMeaningLang: setMeaningFieldLang,
          hideWord: wordHideWord,
          onChangeHideWord: setWordHideWord,
          notifCandidate: editingCardNotifCandidate,
          onToggleNotifCandidate: () => { if (editingCard) toggleCardNotif(editingCard.id); },
          // The same picker the list rows open, aimed at this one word. The
          // sheet closes first: the move is a navigation away from the word, and
          // leaving the editor open over it would offer to save into a folder
          // the word had just left.
          onMove: () => {
            if (!editingCard) return;
            setWordModalVisible(false);
            openMovePicker([editingCard.id]);
          },
          audioUri: wordAudioUri,
          onChangeAudioUri: setWordAudioUri,
          audioSpeed: wordAudioSpeed,
          onChangeAudioSpeed: setWordAudioSpeed,
          audioVolume: wordAudioVolume,
          onChangeAudioVolume: setWordAudioVolume,
          hideAiTools,
          reviewHistory,
          testClearPending,
          onResetAll: resetWordReview,
        }}
        bulkImport={{
          visible: bulkImportVisible,
          onClose: () => setBulkImportVisible(false),
          existingTexts: cards
            .filter(card => card.folderId === bulkImportFolderId)
            .map(card => card.word),
          existingCards: cards,
          folders,
          destinationFolderId: bulkImportFolderId,
          onImport: drafts => bulkImportCards(drafts, bulkImportFolderId ?? ''),
        }}
        notifModal={{
          visible: notificationModalVisible,
          onClose: () => setNotificationModalVisible(false),
          intervalSeconds: folderNotifSettings.intervalSeconds,
          onPickInterval: handlePickInterval,
          displayOnlyWord: folderNotifSettings.displayOnlyWord,
          onToggleDisplayOnlyWord: (value) => updateFolderNotif({ displayOnlyWord: value }),
          notifyAllWords: folderNotifSettings.notifyAllWords === true,
          onToggleNotifyAllWords: toggleNotifyAllWords,
          noNotifiableWords,
          onTest: sendTestForCurrentFolder,
          showSendTestBadge: discovery.isNew(FEATURE_MARKERS.sendTest),
          onSendTestSeen: () => discovery.dismiss(FEATURE_MARKERS.sendTest),
        }}
        textToSpeech={{
          visible: TEXT_TO_SPEECH_ENABLED && textToSpeechVisible,
          onClose: () => setTextToSpeechVisible(false),
          voice: aiVoice,
          isPremium,
          onUpgrade: () => {
            setTextToSpeechVisible(false);
            setProSheetVisible(true);
          },
          onHistoryAvailabilityChange: setHasTextToSpeechHistory,
        }}
        settingsModal={{
          visible: settingsModalVisible,
          onClose: () => setSettingsModalVisible(false),
          appearance,
          onPickAppearance: pickAppearance,
          skinId,
          onPickSkin: setSkinId,
          onUpgrade: () => { setSettingsModalVisible(false); setProSheetVisible(true); },
          language,
          onPickLanguage: pickLanguage,
          aiVoice,
          onPickAIVoice: handlePickAIVoice,
          cardViewMode,
          onChangeCardViewMode: handleCardViewModeChange,
          showFullCard,
          onToggleShowFullCard: setShowFullCard,
          verticalFlip,
          onToggleVerticalFlip: setVerticalFlip,
          hideAiTools,
          onToggleHideAiTools: setHideAiTools,
          canUseAI,
          discovery,
          onDataReplaced: reloadAfterImport,
          themePurchases,
          planProducts,
        }}
        paywallModal={{
          visible: paywallVisible,
          onClose: () => setPaywallVisible(false),
        }}
        proSheet={{
          visible: proSheetVisible,
          onClose: () => setProSheetVisible(false),
          learningLang: learnLang ?? undefined,
          nativeLang,
          skinId,
          onPickSkin: setSkinId,
        }}
        folderAdd={{
          visible: addingFolder,
          onClose: () => setAddingFolder(false),
          onCreate: createFolder,
        }}
        folderEdit={{
          folder: editingFolder,
          onClose: () => setEditingFolder(null),
          onSave: (name, icon) => { if (editingFolder) renameFolder(editingFolder.id, name, icon); },
        }}
        movePicker={{
          visible: movePickerVisible,
          onClose: () => setMovePickerVisible(false),
          folders,
          currentFolderId,
          onSelect: (folderId) => {
            moveCardsToFolder(folderId);
            if (selectionMode) exitSelectionMode();
          },
        }}
        onboarding={{
          visible: showOnboarding,
          onComplete: async (choices) => {
            await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(choices));
            if (choices.learningLang && choices.learningLang !== 'other') setLearnLang(choices.learningLang);
            if (choices.nativeLang && choices.nativeLang !== 'other') setNativeLang(choices.nativeLang);
            const uiLang = BCP47_TO_UI_LANG[choices.nativeLang];
            if (uiLang) setLanguage(uiLang);
            setCards(prev => {
              const withoutPlaceholders = prev.filter(c => !WELCOME_CARD_IDS.includes(c.id));
              return [...buildWelcomeCards(choices), ...withoutPlaceholders];
            });
            // The two seeded folders take the language the user just chose.
            // Only these two ids are touched, and only by renaming — nothing is
            // created here, so an existing folder list is left exactly as it is.
            const localizedNames: Record<string, string> = {
              [WELCOME_FOLDER_ID]: WELCOME_FOLDER_NAMES[choices.nativeLang] ?? WELCOME_FOLDER_NAMES['en-US'],
              [TIPS_FOLDER_ID]:    TIPS_FOLDER_NAMES[choices.nativeLang]    ?? TIPS_FOLDER_NAMES['en-US'],
            };
            setFolders(prev => prev.map(f =>
              localizedNames[f.id] ? { ...f, name: localizedNames[f.id] } : f
            ));
            setCurrentFolderId(WELCOME_FOLDER_ID);
            setShowOnboarding(false);
          },
        }}
      />

      {/* Hide Labels is temporarily disabled. Restore these AppContextMenu props
          together with its commented menu row when the feature returns:
          context={menuContext}
          showLevelLabels={showLevelLabels}
          onToggleLevelLabels={() => { setShowLevelLabels(v => !v); setMenuVisible(false); }} */}
      <AppContextMenu
        visible={menuVisible}
        anchor={menuAnchor}
        pal={pal}
        onDismiss={() => setMenuVisible(false)}
        onSelectEntries={menuContext === 'folders' ? enterFolderSelectionMode : enterSelectionMode}
        onReorder={menuContext === 'folders' ? enterFolderReorderMode : enterReorderMode}
        onOpenSettings={() => { setSettingsModalVisible(true); setMenuVisible(false); }}
      />

      {/* AI data-sharing consent — the root host, covering word-card voice and
          anything else asked for outside a presented modal. Settings, the word
          editor and the Text-to-Speech screen each mount their own while they
          are on top, because a modal presents its own native controller. */}
      <AIConsentDialog active pal={pal} themeColor={activeThemeColor} />

      {/* AI Voice usage limits — non-blocking, replaces the old native alert */}
      <TopBanner pal={pal} />

    </SafeAreaView>

    {/* The Test introduction's first and third steps.

        Hosted here, outside the SafeAreaView, so its backdrop covers the whole
        window — status bar, header, card, answers and the bottom strip — as one
        continuous dim, while the popup is anchored beneath the real measured
        control it explains.

        Still an ordinary view, never a `Modal`: Test Mode already mounts one,
        and a second one — or any native modal unmounted by the X button that
        ends the session — is what left a presented window swallowing every
        touch. `TestModeScreen` publishes the step and takes it back when it
        unmounts, so nothing here can outlive the test it belongs to. */}
    <TestIntroDialog
      visible={testIntro !== null}
      message={testIntro?.message ?? ''}
      onDismiss={() => testIntro?.onDismiss()}
      // Null until the target has been laid out. The dialog deliberately draws
      // nothing in that brief interval rather than flashing at screen centre.
      spotlight={testIntro?.spotlight ? spotlightRects[testIntro.spotlight] ?? null : null}
      pal={pal}
      themeColor={activeThemeColor}
    />
    </View>
    </LangContext.Provider>
  );
}
