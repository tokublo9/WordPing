import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persist, persistFolders, WELCOME_FOLDER_ID } from './src/lib/db';
import { BCP47_TO_UI_LANG, LangContext, translate } from './src/i18n';

import type { Appearance, Folder, FolderNotifSettings, OnboardingChoices, WordCard } from './src/types';
import {
  DARK, FREE_SKIN_IDS, FREE_THEME_COLOR, LIGHT, ONBOARDING_KEY, SKINS,
  SHOW_FULL_CARD_KEY, VERTICAL_FLIP_KEY,
} from './src/constants';
import { requestPermission, rescheduleAllNotifications, sendTestNotification } from './src/notifications';
import { appStyles as s } from './src/styles';
import { useSubscription } from './src/hooks/useSubscription';
import { WordModal } from './src/components/WordModal';
import { NotificationModal } from './src/components/NotificationModal';
import { PaywallModal } from './src/components/PaywallModal';
import { ProSheet } from './src/components/ProSheet';
import { SettingsModal } from './src/components/SettingsModal';
import { FolderCustomizeModal } from './src/components/FolderCustomizeModal';
import { AdBannerPlaceholder, AD_BANNER_HEIGHT } from './src/components/AdBannerPlaceholder';
import { TestModeScreen } from './src/components/TestModeScreen';
import { FolderPickerSheet } from './src/components/FolderPickerSheet';
import { OnboardingModal } from './src/components/OnboardingModal';
import { SkinPatternOverlay } from './src/components/SkinPatternOverlay';
import { SkinWallpaperOverlay } from './src/components/SkinWallpaperOverlay';
import { DeepSeaOverlay } from './src/components/DeepSeaOverlay';
import {
  AnimalOverlay,
  AuroraOverlay,
  BeautifulWoodsOverlay,
  CoffeeHouseOverlay,
  CyberNeonOverlay,
  GalaxyOverlay,
  GreenNatureOverlay,
  RainyWindowOverlay,
  RosesOverlay,
  SakuraOverlay,
  SnowMountainOverlay,
  SunsetOverlay,
} from './src/components/SkinOverlays';
import { useCards } from './src/features/cards/useCards';
import { FolderListScreen } from './src/screens/FolderListScreen/FolderListScreen';
import { WordListScreen } from './src/screens/WordListScreen/WordListScreen';
import { WELCOME_FOLDER_NAMES, WELCOME_CARD_IDS, buildWelcomeCards } from './src/features/onboarding/welcomeContent';
import { useAppBootstrap } from './src/app/useAppBootstrap';
import { useFolders } from './src/features/folders/useFolders';

export default function App() {
  const systemScheme = useColorScheme();
  const { isSubscribed, isLoaded: isSubscriptionLoaded, subscribe, restore, unsubscribe } = useSubscription();

  const {
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
  } = useAppBootstrap();

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
  } = useFolders({ setFolders, setCards, setMenuVisible });

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

  const currentFolder      = folders.find(f => f.id === currentFolderId) ?? null;
  const folderNotifSettings: FolderNotifSettings = currentFolder?.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
  const notificationsEnabled = folderNotifSettings.intervalSeconds > 0;

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

  // Free users may activate solid_blue and solid_gray; all other skins require a subscription.
  const activeSkin = SKINS.find(s => s.id === skinId && (isSubscribed || FREE_SKIN_IDS.has(s.id))) ?? null;
  // Solid-color skins are simple color themes — the user's Appearance (Light/Dark/System) still
  // applies. Only premium image/wallpaper skins force their own fixed palette and dark-bar setting.
  const isSolidSkin = !!activeSkin?.id.startsWith('solid_');
  const isDark = (activeSkin && !isSolidSkin)
    ? activeSkin.darkStatusBar
    : appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';
  const pal = (activeSkin && !isSolidSkin) ? activeSkin.palette : isDark ? DARK : LIGHT;
  const activeThemeColor = activeSkin ? activeSkin.themeColor : themeColor;

  useEffect(() => {
    if (!hasLoaded.current) return;
    persist({ cards, settings: { themeColor, appearance, skinId, language } });
    if (notificationGranted) rescheduleAllNotifications(cards, folders);
  }, [cards, notificationGranted, themeColor, appearance, skinId, language, folders]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    foldersRef.current = folders;
    persistFolders(folders);
  }, [folders]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(SHOW_FULL_CARD_KEY, showFullCard ? 'true' : 'false');
  }, [showFullCard]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(VERTICAL_FLIP_KEY, verticalFlip ? 'true' : 'false');
  }, [verticalFlip]);

  // ── Notifications ───────────────────────────────────────────────────────────
  const updateFolderNotif = (patch: Partial<FolderNotifSettings>) => {
    if (!currentFolderId) return;
    setFolders(prev => prev.map(f => {
      if (f.id !== currentFolderId) return f;
      const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
      return { ...f, notifSettings: { ...cur, ...patch } };
    }));
  };

  const handlePickInterval = (seconds: number) => {
    if (seconds === 0) {
      updateFolderNotif({ intervalSeconds: 0 });
      return;
    }
    if (!notificationGranted) {
      requestPermission().then(granted => {
        setNotificationGranted(granted);
        if (!granted) return;
        updateFolderNotif({ intervalSeconds: seconds });
      });
      return;
    }
    const conflicting = folders.find(
      f => f.id !== currentFolderId && (f.notifSettings?.intervalSeconds ?? 0) > 0
    );
    if (!conflicting) {
      updateFolderNotif({ intervalSeconds: seconds });
      return;
    }
    const targetName   = currentFolder?.name ?? '';
    const conflictName = conflicting.name;
    const conflictId   = conflicting.id;
    Alert.alert(
      t('notifications'),
      `Notifications are already enabled for "${conflictName}". Enable for "${targetName}" instead?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: 'Enable',
          onPress: () => {
            setFolders(prev => prev.map(f => {
              if (f.id === currentFolderId) {
                const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
                return { ...f, notifSettings: { ...cur, intervalSeconds: seconds } };
              }
              if (f.id === conflictId) {
                const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
                return { ...f, notifSettings: { ...cur, intervalSeconds: 0 } };
              }
              return f;
            }));
          },
        },
      ]
    );
  };

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

  const pickTheme = (color: string) => setThemeColor(color);
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
      {activeSkin?.patternType && (
        <SkinPatternOverlay patternType={activeSkin.patternType} />
      )}
      {activeSkin?.wallpaperImage && (
        <SkinWallpaperOverlay
          image={activeSkin.wallpaperImage}
          blurIntensity={activeSkin.wallpaperBlur}
          overlayColor={activeSkin.wallpaperOverlayColor}
        />
      )}
      {activeSkin?.id === 'skin_deep_sea'  && <DeepSeaOverlay scrollY={scrollY} />}
      {activeSkin?.id === 'skin_leaf_blur' && <GreenNatureOverlay />}
      {activeSkin?.id === 'shop_woods'     && <BeautifulWoodsOverlay />}
      {activeSkin?.id === 'shop_roses'     && <RosesOverlay />}
      {activeSkin?.id === 'skin_sunset'    && <SunsetOverlay />}
      {activeSkin?.id === 'skin_sakura'    && <SakuraOverlay />}
      {activeSkin?.id === 'skin_galaxy'    && <GalaxyOverlay />}
      {activeSkin?.id === 'skin_snow'      && <SnowMountainOverlay />}
      {activeSkin?.id === 'skin_cyber'     && <CyberNeonOverlay />}
      {activeSkin?.id === 'skin_coffee'    && <CoffeeHouseOverlay />}
      {activeSkin?.id === 'skin_aurora'    && <AuroraOverlay />}
      {activeSkin?.id === 'skin_rain'      && <RainyWindowOverlay />}
      {activeSkin?.id === 'skin_paw'       && <AnimalOverlay />}

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

      <WordModal
        visible={wordModalVisible}
        onClose={() => setWordModalVisible(false)}
        editingCard={editingCard}
        word={word}
        onChangeWord={setWord}
        meaning={meaning}
        onChangeMeaning={setMeaning}
        note={note}
        onChangeNote={setNote}
        onSave={saveCard}
        pal={pal}
        themeColor={activeThemeColor}
        isSubscribed={isSubscribed}
        wordLang={wordFieldLang}
        onChangeWordLang={setWordFieldLang}
        meaningLang={meaningFieldLang}
        onChangeMeaningLang={setMeaningFieldLang}
        audioUri={wordAudioUri}
        onChangeAudioUri={setWordAudioUri}
        audioSpeed={wordAudioSpeed}
        onChangeAudioSpeed={setWordAudioSpeed}
        audioVolume={wordAudioVolume}
        onChangeAudioVolume={setWordAudioVolume}
      />

      <NotificationModal
        visible={notificationModalVisible}
        onClose={() => setNotificationModalVisible(false)}
        intervalSeconds={folderNotifSettings.intervalSeconds}
        onPickInterval={handlePickInterval}
        displayOnlyWord={folderNotifSettings.displayOnlyWord}
        onToggleDisplayOnlyWord={(value) => updateFolderNotif({ displayOnlyWord: value })}
        pal={pal}
        themeColor={activeThemeColor}
        onTest={() => {
          const eligible = folderCards.filter(c => !c.notifOff);
          if (eligible.length === 0) return;
          const card = eligible[Math.floor(Math.random() * eligible.length)];
          sendTestNotification(card, folderNotifSettings.displayOnlyWord);
        }}
      />

      <SettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        themeColor={activeThemeColor}
        appearance={appearance}
        onPickAppearance={pickAppearance}
        skinId={skinId}
        onPickSkin={setSkinId}
        isSubscribed={isSubscribed}
        onUpgrade={() => { setSettingsModalVisible(false); openPaywall('words'); }}
        onSubscribe={subscribe}
        onRestore={restore}
        // DEV ONLY: Temporary subscription downgrade for testing. Remove before release.
        onManageSubscription={__DEV__ ? unsubscribe : undefined}
        pal={pal}
        language={language}
        onPickLanguage={pickLanguage}
        showFullCard={showFullCard}
        onToggleShowFullCard={setShowFullCard}
        verticalFlip={verticalFlip}
        onToggleVerticalFlip={setVerticalFlip}
      />

      <PaywallModal
        visible={paywallVisible}
        reason={paywallReason}
        onClose={() => setPaywallVisible(false)}
        onSubscribe={subscribe}
        onRestore={restore}
        pal={pal}
        themeColor={themeColor}
      />

      <ProSheet
        visible={proSheetVisible}
        onClose={() => setProSheetVisible(false)}
        onSubscribe={subscribe}
        onRestore={restore}
        // DEV ONLY: Temporary subscription downgrade for testing. Remove before release.
        onManageSubscription={__DEV__ ? unsubscribe : undefined}
        themeColor={activeThemeColor}
        pal={pal}
        isSubscribed={isSubscribed}
        learningLang={learnLang ?? undefined}
        nativeLang={nativeLang}
      />

      {/* Three-dot popup menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={0}
          onPress={() => setMenuVisible(false)}
        />
        <View style={[
          menuStyles.card,
          { top: menuAnchor.top, right: menuAnchor.right, backgroundColor: pal.dialog, borderWidth: 1, borderColor: pal.border },
        ]}>
          {/* Group 1: Management actions */}
          <TouchableOpacity
            style={menuStyles.item}
            onPress={menuContext === 'folders' ? enterFolderSelectionMode : enterSelectionMode}
          >
            <Ionicons name="checkmark-circle-outline" size={17} color={pal.text} />
            <Text style={[menuStyles.itemText, { color: pal.text }]}>{t('select_entries')}</Text>
          </TouchableOpacity>
          <View style={[menuStyles.sep, { backgroundColor: pal.border }]} />
          <TouchableOpacity
            style={menuStyles.item}
            onPress={menuContext === 'folders' ? enterFolderReorderMode : enterReorderMode}
          >
            <Ionicons name="swap-vertical-outline" size={17} color={pal.text} />
            <Text style={[menuStyles.itemText, { color: pal.text }]}>{t('reorder_cards')}</Text>
          </TouchableOpacity>
          {menuContext === 'cards' && (
            <>
              <View style={[menuStyles.sep, { backgroundColor: pal.border }]} />
              <TouchableOpacity
                style={menuStyles.item}
                onPress={() => { setShowLevelLabels(v => !v); setMenuVisible(false); }}
              >
                <Ionicons
                  name={showLevelLabels ? 'eye-off-outline' : 'eye-outline'}
                  size={17}
                  color={pal.text}
                />
                <Text style={[menuStyles.itemText, { color: pal.text }]}>
                  {t(showLevelLabels ? 'hide_level_labels' : 'show_level_labels')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Thicker divider before settings group */}
          <View style={[menuStyles.groupSep, { backgroundColor: pal.border }]} />

          <TouchableOpacity
            style={menuStyles.item}
            onPress={() => { setSettingsModalVisible(true); setMenuVisible(false); }}
          >
            <Ionicons name="settings-outline" size={17} color={pal.text} />
            <Text style={[menuStyles.itemText, { color: pal.text }]}>{t('settings')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <FolderCustomizeModal
        visible={addingFolder}
        mode="edit"
        isNew
        currentValue="folder-outline"
        folderName=""
        onSelect={() => {}}
        onSaveEdit={(name, icon) => { createFolder(name, icon); }}
        onClose={() => setAddingFolder(false)}
        pal={pal}
        themeColor={activeThemeColor}
        isSubscribed={isSubscribed}
      />

      <FolderCustomizeModal
        visible={editingFolder !== null}
        mode="edit"
        currentValue={editingFolder?.icon ?? 'folder-outline'}
        folderName={editingFolder?.name ?? ''}
        onSelect={() => {}}
        onSaveEdit={(name, icon) => {
          if (!editingFolder) return;
          renameFolder(editingFolder.id, name, icon);
        }}
        onClose={() => setEditingFolder(null)}
        pal={pal}
        themeColor={activeThemeColor}
        isSubscribed={isSubscribed}
      />

      {testModeVisible && (
        <TestModeScreen
          cards={filteredFolderCards}
          onUpdateCard={(id, patch) =>
            setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
          }
          onClose={() => setTestModeVisible(false)}
          pal={pal}
          themeColor={activeThemeColor}
          isSubscribed={isSubscribed}
        />
      )}

      <FolderPickerSheet
        visible={movePickerVisible}
        onClose={() => setMovePickerVisible(false)}
        folders={folders}
        currentFolderId={currentFolderId}
        pal={pal}
        themeColor={activeThemeColor}
        onSelect={(folderId) => {
          moveCardsToFolder(folderId);
          if (selectionMode) exitSelectionMode();
        }}
        isSubscribed={isSubscribed}
      />

      <OnboardingModal
        visible={showOnboarding}
        pal={pal}
        themeColor={activeThemeColor}
        onComplete={async (choices) => {
          await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(choices));
          if (choices.learningLang && choices.learningLang !== 'other') setLearnLang(choices.learningLang);
          if (choices.nativeLang && choices.nativeLang !== 'other') setNativeLang(choices.nativeLang);
          // Default UI language to the user's chosen explanation language.
          const uiLang = BCP47_TO_UI_LANG[choices.nativeLang];
          if (uiLang) setLanguage(uiLang);
          // Replace placeholder welcome cards with localized versions,
          // then batch everything so the modal close has no intermediate flash.
          setCards(prev => {
            const withoutPlaceholders = prev.filter(c => !WELCOME_CARD_IDS.includes(c.id));
            return [...buildWelcomeCards(choices), ...withoutPlaceholders];
          });
          // Rename the Welcome folder to the user's native language.
          const localizedFolderName = WELCOME_FOLDER_NAMES[choices.nativeLang] ?? WELCOME_FOLDER_NAMES['en-US'];
          setFolders(prev => prev.map(f =>
            f.id === WELCOME_FOLDER_ID ? { ...f, name: localizedFolderName } : f
          ));
          setCurrentFolderId(WELCOME_FOLDER_ID);
          setShowOnboarding(false);
        }}
      />
    </SafeAreaView>
    </SafeAreaProvider>
    </LangContext.Provider>
  );
}

const menuStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    minWidth: 190,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  itemText: { fontSize: 15 },
  sep:      { height: StyleSheet.hairlineWidth },
  groupSep: { height: 3 },
});

