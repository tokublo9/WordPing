import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WELCOME_FOLDER_ID } from './src/lib/db';
import { BCP47_TO_UI_LANG, LangContext, translate } from './src/i18n';

import type { Appearance, Folder } from './src/types';
import { FREE_SKIN_IDS, FREE_THEME_COLOR, ONBOARDING_KEY } from './src/constants';
import { appStyles as s } from './src/styles';
import { useSubscription } from './src/hooks/useSubscription';
import { AdBannerPlaceholder } from './src/components/AdBannerPlaceholder';
import { AppOverlays } from './src/app/AppOverlays';
import { useCards } from './src/features/cards/useCards';
import { FolderListScreen } from './src/screens/FolderListScreen/FolderListScreen';
import { WordListScreen } from './src/screens/WordListScreen/WordListScreen';
import { WELCOME_FOLDER_NAMES, WELCOME_CARD_IDS, buildWelcomeCards } from './src/features/onboarding/welcomeContent';
import { useAppBootstrap } from './src/app/useAppBootstrap';
import { useAppSettings } from './src/app/useAppSettings';
import { AppModals } from './src/app/AppModals';
import { AppContextMenu } from './src/app/AppContextMenu';
import { useFolders } from './src/features/folders/useFolders';
import { useThemeController } from './src/features/themes/useThemeController';
import { useFolderNotifications } from './src/features/notifications/useFolderNotifications';
import { useNotificationRescheduling } from './src/features/notifications/useNotificationRescheduling';
import { useAppPersistence } from './src/app/useAppPersistence';
import { setAIVoicePreference } from './src/lib/tts';
import { loadPrototypeSpeechHistory } from './src/lib/prototypeTextToSpeech';

export default function App() {
  const { isSubscribed, isPremium, isLoaded: isSubscriptionLoaded, subscribe, subscribePremium, restore, unsubscribe } = useSubscription();

  const {
    themeColor, setThemeColor,
    appearance, setAppearance,
    skinId, setSkinId,
    language, setLanguage,
    aiVoice, setAIVoice,
    showFullCard, setShowFullCard,
    verticalFlip, setVerticalFlip,
    hideAiTools, setHideAiTools,
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
    hasLoaded,
  } = useAppBootstrap({ applySettings, markSettingsLoaded, setShowFullCard, setVerticalFlip, setHideAiTools });

  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(language, key), [language]);

  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [textToSpeechVisible, setTextToSpeechVisible] = useState(false);
  const [hasTextToSpeechHistory, setHasTextToSpeechHistory] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef<View>(null);
  const [paywallReason, setPaywallReason] = useState<'words' | 'voice'>('words');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [proSheetVisible, setProSheetVisible] = useState(false);

  useEffect(() => {
    let active = true;
    loadPrototypeSpeechHistory()
      .then(items => { if (active) setHasTextToSpeechHistory(items.length > 0); })
      .catch(() => { if (active) setHasTextToSpeechHistory(false); });
    return () => { active = false; };
  }, []);

  // ── Custom voice locked banner ────────────────────────────────────────────────
  const insets = useSafeAreaInsets();
  const [voiceBannerShowing, setVoiceBannerShowing] = useState(false);
  const voiceBannerAnim = useRef(new Animated.Value(0)).current;
  const voiceBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissVoiceBanner = useCallback(() => {
    if (voiceBannerTimer.current) { clearTimeout(voiceBannerTimer.current); voiceBannerTimer.current = null; }
    Animated.timing(voiceBannerAnim, { toValue: 0, duration: 220, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setVoiceBannerShowing(false); });
  }, [voiceBannerAnim]);

  const showVoiceLockBanner = useCallback(() => {
    if (voiceBannerTimer.current) clearTimeout(voiceBannerTimer.current);
    setVoiceBannerShowing(true);
    Animated.spring(voiceBannerAnim, { toValue: 1, tension: 90, friction: 9, useNativeDriver: true }).start();
    voiceBannerTimer.current = setTimeout(dismissVoiceBanner, 4000);
  }, [voiceBannerAnim, dismissVoiceBanner]);

  useEffect(() => () => {
    if (voiceBannerTimer.current) clearTimeout(voiceBannerTimer.current);
    voiceBannerAnim.stopAnimation();
  }, [voiceBannerAnim]);

  // Swipe the banner upward to dismiss it (tap-to-dismiss is on the banner itself).
  const voiceBannerPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
    onPanResponderRelease: (_, g) => { if (g.dy < -20) dismissVoiceBanner(); },
  })).current;

  // ── Folder navigation ────────────────────────────────────────────────────────
  const [addingFolder, setAddingFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const folderMenuBtnRef = useRef<View>(null);
  const closeOpenFolder = useRef<(() => void) | null>(null);
  const [menuContext, setMenuContext] = useState<'cards' | 'folders'>('cards');
  const {
    folderSelectionMode, selectedFolderIds, folderReorderMode,
    movePickerVisible, setMovePickerVisible,
    enterFolderSelectionMode, exitFolderSelectionMode, toggleFolderSelect, selectAllFolders,
    deleteSelectedFolders, enterFolderReorderMode, exitFolderReorderMode,
    createFolder, deleteFolder, renameFolder, openMovePicker, moveCardsToFolder,
  } = useFolders({ folders, fallbackFolderName: t('default_folder_name'), setFolders, setCards, setMenuVisible });

  const {
    flipped, toggleFlip,
    selectionMode, selectedIds,
    enterSelectionMode, exitSelectionMode, toggleSelect, selectAllCards, deleteSelected, setNotifForSelected,
    reorderMode, reorderSortDir,
    enterReorderMode, exitReorderMode, cancelReorderMode, handleSortByLevel, handleResetOrder,
    levelFilter, isFilterActive, toggleLevelFilter, resetLevelFilter,
    showLevelLabels, setShowLevelLabels,
    folderCards, filteredFolderCards,
    cardViewMode, setCardViewMode,
    closeOpenCard, handleCardOpen,
    wordModalVisible, setWordModalVisible,
    editingCard,
    word, setWord,
    meaning, setMeaning,
    note, setNote,
    wordFieldLang, setWordFieldLang,
    meaningFieldLang, setMeaningFieldLang,
    wordAudioUri, setWordAudioUri,
    wordAudioSpeed, setWordAudioSpeed,
    wordAudioVolume, setWordAudioVolume,
    reviewHistory, testClearPending, resetWordReview,
    openAdd, openEdit, saveCard, deleteCard, toggleCardNotif,
    testModeVisible, setTestModeVisible,
  } = useCards({
    cards,
    setCards,
    currentFolderId,
    isSubscribed,
    language,
    setMenuVisible,
    onWordLimitReached: () => { setPaywallReason('words'); setPaywallVisible(true); },
  });

  const currentFolder = folders.find(f => f.id === currentFolderId) ?? null;

  const {
    folderNotifSettings,
    notificationsEnabled,
    updateFolderNotif,
    handlePickInterval,
    sendTestForCurrentFolder,
  } = useFolderNotifications({
    folders,
    setFolders,
    currentFolderId,
    notificationGranted,
    setNotificationGranted,
    folderCards,
    t,
  });

  const openPaywall = (reason: 'words' | 'voice') => {
    setPaywallReason(reason);
    setPaywallVisible(true);
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


  // Tracks word-list scroll position for the Deep Sea skin gradient effect.
  const scrollY = useRef(new Animated.Value(0)).current;

  const { activeSkin, isDark, pal, activeThemeColor } = useThemeController({
    skinId,
    themeColor,
    appearance,
    isSubscribed,
  });

  useAppPersistence({
    cards, folders, foldersRef,
    themeColor, appearance, skinId, language, aiVoice,
    showFullCard, verticalFlip, hideAiTools,
    hasLoaded,
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
    if (!isSubscribed) {
      // On downgrade: reset any premium skin back to blue.
      if (skinId && !FREE_SKIN_IDS.has(skinId)) {
        setSkinId('solid_blue');
      }
      // Legacy: if no skin is active and themeColor drifted to a paid color, reset it.
      if (!skinId && themeColor !== FREE_THEME_COLOR) {
        setThemeColor(FREE_THEME_COLOR);
      }
    }
  }, [isSubscribed, isSubscriptionLoaded, settingsLoaded, skinId, themeColor]);

  const pickAppearance = (mode: Appearance) => setAppearance(mode);
  const pickLanguage = (code: string) => setLanguage(code);

  const handleFolderOpen = useCallback((close: () => void) => {
    if (closeOpenFolder.current !== close) closeOpenFolder.current?.();
    closeOpenFolder.current = close;
  }, []);

  const openFolder = (id: string) => {
    closeOpenFolder.current?.();
    exitSelectionMode();
    exitReorderMode();
    exitFolderSelectionMode();
    exitFolderReorderMode();
    setCurrentFolderId(id);
    scrollY.setValue(0);
  };

  const goBackToFolders = () => {
    exitSelectionMode();
    exitReorderMode();
    setCurrentFolderId(null);
    resetLevelFilter();
    // Reset depth gradient to ocean surface when navigating away from word list.
    scrollY.setValue(0);
  };


  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <LangContext.Provider value={t}>
    <SafeAreaView style={[s.root, { backgroundColor: pal.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppOverlays activeSkin={activeSkin} scrollY={scrollY} />

      {currentFolderId === null ? (
        <FolderListScreen
          pal={pal}
          themeColor={activeThemeColor}
          isSubscribed={isSubscribed}
          showLevelLabels={showLevelLabels}
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
          hasTextToSpeechHistory={hasTextToSpeechHistory}
          scrollY={scrollY}
          deepSeaSkin={activeSkin?.id === 'skin_deep_sea'}
          currentFolder={currentFolder}
          folderCards={folderCards}
          filteredFolderCards={filteredFolderCards}
          showFullCard={showFullCard}
          verticalFlip={verticalFlip}
          notificationsEnabled={notificationsEnabled}
          cardViewMode={cardViewMode}
          onToggleViewMode={() => setCardViewMode(m => m === 'list' ? 'flip' : 'list')}
          levelFilter={levelFilter}
          isFilterActive={isFilterActive}
          showLevelLabels={showLevelLabels}
          onToggleLevelFilter={toggleLevelFilter}
          flipped={flipped}
          closeOpenCard={closeOpenCard}
          onCardOpen={handleCardOpen}
          selection={{
            active: selectionMode,
            selectedIds,
            onToggle: toggleSelect,
            onSelectAll: selectAllCards,
            onExit: exitSelectionMode,
            onSetNotif: setNotifForSelected,
            onMoveSelected: () => openMovePicker([...selectedIds]),
            onDelete: deleteSelected,
          }}
          reorder={{
            active: reorderMode,
            sortDir: reorderSortDir,
            onSortByLevel: handleSortByLevel,
            onResetOrder: handleResetOrder,
            onReorder: (reorderedCards) =>
              setCards(prev => [
                ...reorderedCards,
                ...prev.filter(c => c.folderId !== currentFolderId),
              ]),
            onExit: exitReorderMode,
            onCancel: cancelReorderMode,
          }}
          actions={{
            onGoBack: goBackToFolders,
            onOpenTextToSpeech: () => {
              if (isPremium || hasTextToSpeechHistory) setTextToSpeechVisible(true);
              else setProSheetVisible(true);
            },
            onOpenNotifications: () => setNotificationModalVisible(true),
            onOpenMenu: openMenu,
            onOpenTestMode: () => setTestModeVisible(true),
            onFlip: toggleFlip,
            onEdit: openEdit,
            onDelete: deleteCard,
            onMove: openMovePicker,
            onToggleNotif: toggleCardNotif,
            onVoiceLocked: () => openPaywall('voice'),
            onCustomVoiceLocked: showVoiceLockBanner,
            onOpenAdd: openAdd,
          }}
          menuBtnRef={menuBtnRef}
        />
      )}

      {!isSubscribed && <AdBannerPlaceholder pal={pal} />}

      <AppModals
        pal={pal}
        themeColor={activeThemeColor}
        rawThemeColor={themeColor}
        isSubscribed={isSubscribed}
        isPremium={isPremium}
        subscribe={subscribe}
        subscribePremium={subscribePremium}
        restore={restore}
        onManageSubscription={__DEV__ ? unsubscribe : undefined}
        wordModal={{
          visible: wordModalVisible,
          onClose: () => setWordModalVisible(false),
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
        notifModal={{
          visible: notificationModalVisible,
          onClose: () => setNotificationModalVisible(false),
          intervalSeconds: folderNotifSettings.intervalSeconds,
          onPickInterval: handlePickInterval,
          displayOnlyWord: folderNotifSettings.displayOnlyWord,
          onToggleDisplayOnlyWord: (value) => updateFolderNotif({ displayOnlyWord: value }),
          onTest: sendTestForCurrentFolder,
        }}
        textToSpeech={{
          visible: textToSpeechVisible,
          onClose: () => setTextToSpeechVisible(false),
          voice: aiVoice,
          isPremium,
          onHistoryAvailabilityChange: setHasTextToSpeechHistory,
        }}
        settingsModal={{
          visible: settingsModalVisible,
          onClose: () => setSettingsModalVisible(false),
          appearance,
          onPickAppearance: pickAppearance,
          skinId,
          onPickSkin: setSkinId,
          onUpgrade: () => { setSettingsModalVisible(false); openPaywall('words'); },
          language,
          onPickLanguage: pickLanguage,
          aiVoice,
          onPickAIVoice: setAIVoice,
          showFullCard,
          onToggleShowFullCard: setShowFullCard,
          verticalFlip,
          onToggleVerticalFlip: setVerticalFlip,
          hideAiTools,
          onToggleHideAiTools: setHideAiTools,
        }}
        paywallModal={{
          visible: paywallVisible,
          reason: paywallReason,
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
        testMode={{
          visible: testModeVisible,
          cards: folderCards,
          explanationLang: nativeLang,
          verticalFlip,
          onUpdateCard: (id, patch) => setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c)),
          onClose: () => setTestModeVisible(false),
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
            const localizedFolderName = WELCOME_FOLDER_NAMES[choices.nativeLang] ?? WELCOME_FOLDER_NAMES['en-US'];
            setFolders(prev => prev.map(f =>
              f.id === WELCOME_FOLDER_ID ? { ...f, name: localizedFolderName } : f
            ));
            setCurrentFolderId(WELCOME_FOLDER_ID);
            setShowOnboarding(false);
          },
        }}
      />

      <AppContextMenu
        visible={menuVisible}
        anchor={menuAnchor}
        context={menuContext}
        pal={pal}
        showLevelLabels={showLevelLabels}
        onDismiss={() => setMenuVisible(false)}
        onSelectEntries={menuContext === 'folders' ? enterFolderSelectionMode : enterSelectionMode}
        onReorder={menuContext === 'folders' ? enterFolderReorderMode : enterReorderMode}
        onToggleLevelLabels={() => { setShowLevelLabels(v => !v); setMenuVisible(false); }}
        onOpenSettings={() => { setSettingsModalVisible(true); setMenuVisible(false); }}
      />

      {/* Custom voice locked banner — tap or swipe up to dismiss */}
      {voiceBannerShowing && (
        <Animated.View
          style={[
            bannerStyles.banner,
            {
              top: insets.top + 8,
              backgroundColor: pal.dialog,
              borderColor: pal.border,
              opacity: voiceBannerAnim,
              transform: [{ translateY: voiceBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-56, 0] }) }],
            },
          ]}
          {...voiceBannerPan.panHandlers}
        >
          <TouchableOpacity activeOpacity={0.85} onPress={dismissVoiceBanner} style={bannerStyles.touch}>
            <Ionicons name="warning" size={18} color="#f59e0b" style={{ marginRight: 8 }} />
            <Text style={[bannerStyles.text, { color: pal.text }]}>{t('custom_voice_locked_msg')}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

    </SafeAreaView>
    </LangContext.Provider>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 8,
  },
  touch: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
