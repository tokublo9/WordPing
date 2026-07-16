import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WELCOME_FOLDER_ID } from './src/lib/db';
import { BCP47_TO_UI_LANG, LangContext, translate } from './src/i18n';

import type { Appearance, Folder } from './src/types';
import {
  FREE_SKIN_IDS, FREE_THEME_COLOR, ONBOARDING_KEY,
} from './src/constants';
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

export default function App() {
  const { isSubscribed, isLoaded: isSubscriptionLoaded, subscribe, restore, unsubscribe } = useSubscription();

  const {
    themeColor, setThemeColor,
    appearance, setAppearance,
    skinId, setSkinId,
    language, setLanguage,
    showFullCard, setShowFullCard,
    verticalFlip, setVerticalFlip,
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
  } = useAppBootstrap({ applySettings, markSettingsLoaded, setShowFullCard, setVerticalFlip });

  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(language, key), [language]);

  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef<View>(null);
  const [paywallReason, setPaywallReason] = useState<'words' | 'voice'>('words');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [proSheetVisible, setProSheetVisible] = useState(false);

  // ── Folder navigation ────────────────────────────────────────────────────────
  const [addingFolder, setAddingFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const folderMenuBtnRef = useRef<View>(null);
  const closeOpenFolder = useRef<(() => void) | null>(null);
  const [menuContext, setMenuContext] = useState<'cards' | 'folders'>('cards');
  const {
    folderSelectionMode, selectedFolderIds, folderReorderMode,
    movePickerVisible, setMovePickerVisible,
    enterFolderSelectionMode, exitFolderSelectionMode, toggleFolderSelect,
    deleteSelectedFolders, enterFolderReorderMode, exitFolderReorderMode,
    createFolder, deleteFolder, renameFolder, openMovePicker, moveCardsToFolder,
  } = useFolders({ folders, setFolders, setCards, setMenuVisible });

  const {
    flipped, toggleFlip,
    selectionMode, selectedIds,
    enterSelectionMode, exitSelectionMode, toggleSelect, deleteSelected, setNotifForSelected,
    reorderMode, reorderSortDir,
    enterReorderMode, exitReorderMode, handleSortByLevel, handleResetOrder,
    levelFilter, isFilterActive, toggleLevelFilter, resetLevelFilter,
    showLevelLabels, setShowLevelLabels,
    folderCards, filteredFolderCards,
    cardViewMode, setCardViewMode,
    cardScrollEnabled, setCardScrollEnabled,
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
    themeColor, appearance, skinId, language,
    showFullCard, verticalFlip,
    hasLoaded,
  });

  useNotificationRescheduling({ cards, folders, notificationGranted, hasLoaded });

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
    <SafeAreaProvider>
    <SafeAreaView style={[s.root, { backgroundColor: pal.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppOverlays activeSkin={activeSkin} scrollY={scrollY} />

      {currentFolderId === null ? (
        <FolderListScreen
          pal={pal}
          themeColor={activeThemeColor}
          isSubscribed={isSubscribed}
          folders={folders}
          cards={cards}
          selection={{
            active: folderSelectionMode,
            selectedIds: selectedFolderIds,
            onToggle: toggleFolderSelect,
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
          closeOpenFolder={closeOpenFolder}
          onFolderOpen={handleFolderOpen}
        />
      ) : (
        <WordListScreen
          pal={pal}
          themeColor={activeThemeColor}
          isSubscribed={isSubscribed}
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
          cardScrollEnabled={cardScrollEnabled}
          closeOpenCard={closeOpenCard}
          onCardOpen={handleCardOpen}
          onSwiping={(active) => setCardScrollEnabled(!active)}
          selection={{
            active: selectionMode,
            selectedIds,
            onToggle: toggleSelect,
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
          }}
          actions={{
            onGoBack: goBackToFolders,
            onOpenNotifications: () => setNotificationModalVisible(true),
            onOpenMenu: openMenu,
            onOpenTestMode: () => setTestModeVisible(true),
            onFlip: toggleFlip,
            onEdit: openEdit,
            onDelete: deleteCard,
            onMove: openMovePicker,
            onToggleNotif: toggleCardNotif,
            onVoiceLocked: () => openPaywall('voice'),
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
        subscribe={subscribe}
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
          showFullCard,
          onToggleShowFullCard: setShowFullCard,
          verticalFlip,
          onToggleVerticalFlip: setVerticalFlip,
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
          cards: filteredFolderCards,
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

    </SafeAreaView>
    </SafeAreaProvider>
    </LangContext.Provider>
  );
}


