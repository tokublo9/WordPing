import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { bootstrapData, persist, readFolders, persistFolders, DEFAULT_FOLDER_ID } from './src/lib/db';
import { LangContext, translate } from './src/i18n';

import type { Appearance, Folder, FolderNotifSettings, WordCard } from './src/types';
import {
  DARK, DEFAULT_LANGUAGE,
  DEFAULT_THEME, FREE_VOICE_LIMIT, FREE_WORD_LIMIT, LIGHT, SKINS,
} from './src/constants';
import { requestPermission, rescheduleAllNotifications, sendTestNotification } from './src/notifications';
import { appStyles as s } from './src/styles';
import { useSubscription } from './src/hooks/useSubscription';
import { SwipeableCard } from './src/components/SwipeableCard';
import { WordModal } from './src/components/WordModal';
import { NotificationModal } from './src/components/NotificationModal';
import { PaywallModal } from './src/components/PaywallModal';
import { SettingsModal } from './src/components/SettingsModal';
import { ReorderableList } from './src/components/ReorderableList';
import { AddFolderModal } from './src/components/AddFolderModal';
import { SwipeableFolder } from './src/components/SwipeableFolder';
import { FolderCustomizeModal } from './src/components/FolderCustomizeModal';
import { AdBannerPlaceholder, AD_BANNER_HEIGHT } from './src/components/AdBannerPlaceholder';
import { TestModeScreen } from './src/components/TestModeScreen';
import { FlipCardBrowser } from './src/components/FlipCardBrowser';

const ALL_LEVEL_KEYS = ['perfect', 'good', 'slightly', 'unknown', 'none'] as const;


const LEVEL_FILTER_OPTIONS: Array<{ level: string; icon: string | null; color: string }> = [
  { level: 'perfect',  icon: '◎',               color: '#5EBF84' },
  { level: 'good',     icon: 'ellipse-outline',  color: '#6BA4F0' },
  { level: 'slightly', icon: 'triangle-outline', color: '#F2B445' },
  { level: 'unknown',  icon: 'close-outline',    color: '#ED7373' },
  { level: 'none',     icon: null,               color: '#AEB6C0' },
];

export default function App() {
  const systemScheme = useColorScheme();
  const { isSubscribed, subscribe, restore } = useSubscription();

  const [cards, setCards] = useState<WordCard[]>([]);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME);
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [skinId, setSkinId] = useState<string | null>(null);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(language, key), [language]);

  const [wordModalVisible, setWordModalVisible] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [testModeVisible, setTestModeVisible] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<'list' | 'flip'>('list');
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef<View>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderSortDir, setReorderSortDir] = useState<'asc' | 'desc' | null>(null);
  const originalFolderCards = useRef<WordCard[]>([]);
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set(ALL_LEVEL_KEYS));
  const [showLevelLabels, setShowLevelLabels] = useState(true);
  const [paywallReason, setPaywallReason] = useState<'words' | 'voice'>('words');
  const [paywallVisible, setPaywallVisible] = useState(false);

  // ── Folder navigation ────────────────────────────────────────────────────────
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [addFolderVisible, setAddFolderVisible] = useState(false);
  const [folderSelectionMode, setFolderSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [folderReorderMode, setFolderReorderMode] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [customizingFolder, setCustomizingFolder] = useState<Folder | null>(null);
  const folderMenuBtnRef = useRef<View>(null);
  const closeOpenFolder = useRef<(() => void) | null>(null);
  const [menuContext, setMenuContext] = useState<'cards' | 'folders'>('cards');

  const currentFolder      = folders.find(f => f.id === currentFolderId) ?? null;
  const folderCards        = currentFolderId ? cards.filter(c => c.folderId === currentFolderId) : [];
  const folderNotifSettings: FolderNotifSettings = currentFolder?.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
  const notificationsEnabled = folderNotifSettings.intervalSeconds > 0;

  const isFilterActive        = levelFilter.size < ALL_LEVEL_KEYS.length;
  const filteredFolderCards   = isFilterActive
    ? folderCards.filter(c => levelFilter.has(c.testLevel ?? 'none'))
    : folderCards;

  const toggleLevelFilter = (level: string) => {
    setLevelFilter(prev => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });
  };

  const openPaywall = (reason: 'words' | 'voice') => {
    setPaywallReason(reason);
    setPaywallVisible(true);
  };

  const enterSelectionMode = () => {
    setSelectedIds(new Set());
    setSelectionMode(true);
    setReorderMode(false);
    setMenuVisible(false);
    setCardViewMode('list');
  };

  const enterReorderMode = () => {
    setReorderMode(true);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setMenuVisible(false);
    setCardViewMode('list');
    originalFolderCards.current = folderCards;
  };

  const exitReorderMode = () => {
    setReorderMode(false);
    setReorderSortDir(null);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const LEVEL_ORDER: Record<string, number> = { perfect: 0, good: 1, slightly: 2, unknown: 3 };

  const handleSortByLevel = () => {
    const nextDir = reorderSortDir === 'asc' ? 'desc' : 'asc';
    setReorderSortDir(nextDir);
    const sorted = [...folderCards].sort((a, b) => {
      const la = a.testLevel != null ? (LEVEL_ORDER[a.testLevel] ?? 4) : 4;
      const lb = b.testLevel != null ? (LEVEL_ORDER[b.testLevel] ?? 4) : 4;
      return nextDir === 'asc' ? la - lb : lb - la;
    });
    setCards(prev => [
      ...sorted,
      ...prev.filter(c => c.folderId !== currentFolderId),
    ]);
  };

  const handleResetOrder = () => {
    const orig = originalFolderCards.current;
    if (!orig.length) return;
    setCards(prev => [
      ...orig,
      ...prev.filter(c => c.folderId !== currentFolderId),
    ]);
    setReorderSortDir(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    setCards(prev => prev.filter(c => !selectedIds.has(c.id)));
    setFlipped(prev => {
      const next = new Set(prev);
      selectedIds.forEach(id => next.delete(id));
      return next;
    });
    exitSelectionMode();
  };

  const setNotifForSelected = (notifOff: boolean) => {
    setCards(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, notifOff } : c));
    exitSelectionMode();
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

  const enterFolderSelectionMode = () => {
    setSelectedFolderIds(new Set());
    setFolderSelectionMode(true);
    setFolderReorderMode(false);
    setMenuVisible(false);
  };

  const exitFolderSelectionMode = () => {
    setFolderSelectionMode(false);
    setSelectedFolderIds(new Set());
  };

  const toggleFolderSelect = (id: string) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const deleteSelectedFolders = () => {
    setFolders(prev => prev.filter(f => !selectedFolderIds.has(f.id)));
    exitFolderSelectionMode();
  };

  const enterFolderReorderMode = () => {
    setFolderReorderMode(true);
    setFolderSelectionMode(false);
    setSelectedFolderIds(new Set());
    setMenuVisible(false);
  };

  const exitFolderReorderMode = () => setFolderReorderMode(false);

  const [editingCard, setEditingCard] = useState<WordCard | null>(null);
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [note, setNote] = useState('');

  const closeOpenCard = useRef<(() => void) | null>(null);
  const hasLoaded = useRef(false);

  const activeSkin = SKINS.find(s => s.id === skinId) ?? null;
  const isDark = activeSkin
    ? activeSkin.darkStatusBar
    : appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';
  const pal = activeSkin ? activeSkin.palette : isDark ? DARK : LIGHT;
  const activeThemeColor = activeSkin ? activeSkin.themeColor : themeColor;
  // ── Persist & load ──────────────────────────────────────────────────────────
  // Ref so the Supabase remote callback can access up-to-date folders
  const foldersRef = useRef<Folder[]>([]);

  useEffect(() => {
    const applySettings = (s: { themeColor: string; appearance: Appearance; skinId: string | null; language: string }) => {
      setThemeColor(s.themeColor);
      setAppearance(s.appearance);
      setSkinId(s.skinId ?? null);
      setLanguage(s.language ?? DEFAULT_LANGUAGE);
    };

    // Migration helper for existing users upgrading from pre-folder versions:
    // any card that still lacks a folderId is assigned to the first available folder.
    const migrate = (rawCards: WordCard[], existingFolders: Folder[]): { cards: WordCard[]; folders: Folder[] } => {
      if (!rawCards.some(c => !c.folderId)) return { cards: rawCards, folders: existingFolders };
      let finalFolders = existingFolders;
      if (finalFolders.length === 0) {
        finalFolders = [{ id: DEFAULT_FOLDER_ID, name: 'My Words', createdAt: Date.now() }];
        persistFolders(finalFolders);
      }
      const firstId = finalFolders[0].id;
      return { cards: rawCards.map(c => c.folderId ? c : { ...c, folderId: firstId }), folders: finalFolders };
    };

    // Sequential: bootstrapData writes the default folder before readFolders() runs,
    // so on first launch readFolders() returns the seeded "My Words" folder.
    (async () => {
      const local = await bootstrapData((remote) => {
        applySettings(remote.settings);
        const { cards: migratedCards } = migrate(remote.cards, foldersRef.current);
        setCards(migratedCards);
      });
      const storedFolders = await readFolders();

      const { cards: migratedCards, folders: migratedFolders } = migrate(local.cards, storedFolders);
      foldersRef.current = migratedFolders;
      setCards(migratedCards);
      setFolders(migratedFolders);
      applySettings(local.settings);
      if (local.isFirstLaunch) setCurrentFolderId(DEFAULT_FOLDER_ID);
      hasLoaded.current = true;
    })();

    requestPermission().then(setNotificationGranted);
  }, []);

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
  const pickTheme = (color: string) => setThemeColor(color);
  const pickAppearance = (mode: Appearance) => setAppearance(mode);
  const pickLanguage = (code: string) => setLanguage(code);

  // ── Cards ────────────────────────────────────────────────────────────────────
  const openAdd = () => {
    closeOpenCard.current?.();
    setEditingCard(null);
    setWord('');
    setMeaning('');
    setNote('');
    setWordModalVisible(true);
  };

  const openEdit = (card: WordCard) => {
    setEditingCard(card);
    setWord(card.word);
    setMeaning(card.meaning);
    setNote(card.note ?? '');
    setWordModalVisible(true);
  };

  const saveCard = () => {
    if (!word.trim()) { Alert.alert(t('alert_enter_word')); return; }
    if (!editingCard && !isSubscribed && cards.length >= FREE_WORD_LIMIT) {
      setWordModalVisible(false);
      openPaywall('words');
      return;
    }
    if (editingCard) {
      setCards(prev => prev.map(c =>
        c.id === editingCard.id
          ? { ...c, word: word.trim(), meaning: meaning.trim(), note: note.trim() }
          : c
      ));
    } else {
      setCards(prev => [
        ...prev,
        { id: Date.now().toString(), word: word.trim(), meaning: meaning.trim(), note: note.trim(), folderId: currentFolderId ?? undefined },
      ]);
    }
    setWordModalVisible(false);
  };

  const deleteCard = (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
    setFlipped(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleCardNotif = (id: string) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, notifOff: !c.notifOff } : c));
  };

  const toggleFlip = (id: string) => {
    setFlipped(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCardOpen = useCallback((close: () => void) => {
    if (closeOpenCard.current !== close) closeOpenCard.current?.();
    closeOpenCard.current = close;
  }, []);

  const handleFolderOpen = useCallback((close: () => void) => {
    if (closeOpenFolder.current !== close) closeOpenFolder.current?.();
    closeOpenFolder.current = close;
  }, []);

  const createFolder = (name: string) => {
    const folder: Folder = { id: Date.now().toString(), name, createdAt: Date.now() };
    setFolders(prev => [...prev, folder]);
  };

  const openFolder = (id: string) => {
    closeOpenFolder.current?.();
    exitSelectionMode();
    exitReorderMode();
    exitFolderSelectionMode();
    exitFolderReorderMode();
    setCurrentFolderId(id);
  };

  const goBackToFolders = () => {
    exitSelectionMode();
    exitReorderMode();
    setCurrentFolderId(null);
    setLevelFilter(new Set(ALL_LEVEL_KEYS));
  };

  const SEL_BAR_H = 68;

  const renderCard = ({ item, index }: { item: WordCard; index: number }) => (
    <SwipeableCard
      item={item}
      isFlipped={flipped.has(item.id)}
      themeColor={activeThemeColor}
      pal={pal}
      voiceLocked={!isSubscribed && index >= FREE_VOICE_LIMIT}
      onFlip={() => toggleFlip(item.id)}
      onEdit={() => openEdit(item)}
      onDelete={() => deleteCard(item.id)}
      onToggleNotif={() => toggleCardNotif(item.id)}
      onVoiceLocked={() => openPaywall('voice')}
      onOpen={handleCardOpen}
      selectionMode={selectionMode}
      selected={selectedIds.has(item.id)}
      onToggleSelect={() => toggleSelect(item.id)}
      showLevelLabel={showLevelLabels}
    />
  );

  const renderFolderItem = ({ item }: { item: Folder }) => {
    const count       = cards.filter(c => c.folderId === item.id).length;
    const folderColor = activeThemeColor;
    const folderIcon  = item.icon ?? 'folder-outline';
    return (
      <SwipeableFolder
        folder={item}
        cardCount={count}
        pal={pal}
        themeColor={activeThemeColor}
        folderColor={folderColor}
        folderIcon={folderIcon}
        onOpen={handleFolderOpen}
        onPress={() => openFolder(item.id)}
        onRename={() => setRenamingFolder(item)}
        onChangeIcon={() => setCustomizingFolder(item)}
        onDelete={() => setFolders(prev => prev.filter(f => f.id !== item.id))}
        selectionMode={folderSelectionMode}
        selected={selectedFolderIds.has(item.id)}
        onToggleSelect={() => toggleFolderSelect(item.id)}
      />
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <LangContext.Provider value={t}>
    <SafeAreaProvider>
    <SafeAreaView style={[s.root, { backgroundColor: pal.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      {currentFolderId === null ? (
        /* Folder list header — 3 modes */
        folderSelectionMode ? (
          <View style={s.header}>
            <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
              {selectedFolderIds.size} {t('selected')}
            </Text>
            <TouchableOpacity style={s.iconBtn} onPress={exitFolderSelectionMode}>
              <Text style={{ color: activeThemeColor, fontSize: 16, fontWeight: '600' }}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : folderReorderMode ? (
          <View style={s.header}>
            <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
              {t('reorder_cards')}
            </Text>
            <TouchableOpacity style={s.iconBtn} onPress={exitFolderReorderMode}>
              <Text style={{ color: activeThemeColor, fontSize: 16, fontWeight: '600' }}>
                {t('done')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.header}>
            <Text style={[s.title, { color: pal.text }]}>WordPing</Text>
            <View style={s.headerIcons}>
              <TouchableOpacity style={s.iconBtn} onPress={() => setAddFolderVisible(true)}>
                <MaterialCommunityIcons name="folder-plus-outline" size={22} color={pal.sub} />
              </TouchableOpacity>
              <View ref={folderMenuBtnRef}>
                <TouchableOpacity style={s.iconBtn} onPress={openFolderMenu}>
                  <Ionicons name="ellipsis-vertical" size={22} color={pal.sub} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )
      ) : (
        /* Inside-folder header */
        <View style={s.header}>
          {selectionMode ? (
            <>
              <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
                {selectedIds.size} {t('selected')}
              </Text>
              <TouchableOpacity style={s.iconBtn} onPress={exitSelectionMode}>
                <Text style={{ color: activeThemeColor, fontSize: 16, fontWeight: '600' }}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
            </>
          ) : reorderMode ? (
            <>
              <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
                {t('reorder_cards')}
              </Text>
              <TouchableOpacity style={s.iconBtn} onPress={exitReorderMode}>
                <Text style={{ color: activeThemeColor, fontSize: 16, fontWeight: '600' }}>
                  {t('done')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: -4 }}>
                <TouchableOpacity
                  style={{ paddingRight: 4, paddingVertical: 0 }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
                  onPress={goBackToFolders}
                >
                  <Ionicons name="chevron-back" size={24} color={pal.text} />
                </TouchableOpacity>
                <Text style={[s.title, { color: pal.text, flex: 1 }]} numberOfLines={1}>
                  {currentFolder?.name ?? ''}
                </Text>
              </View>
              <View style={s.headerIcons}>
                <TouchableOpacity style={s.iconBtn} onPress={() => setTestModeVisible(true)}>
                  <Ionicons name="school-outline" size={22} color={pal.sub} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={() => setCardViewMode(m => m === 'list' ? 'flip' : 'list')}
                >
                  <Ionicons
                    name={cardViewMode === 'flip' ? 'list-outline' : 'albums-outline'}
                    size={22}
                    color={pal.sub}
                  />
                </TouchableOpacity>
                <View ref={menuBtnRef}>
                  <TouchableOpacity style={s.iconBtn} onPress={openMenu}>
                    <Ionicons name="ellipsis-vertical" size={22} color={pal.sub} />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────────── */}
      {currentFolderId === null ? (
        /* Folder list */
        <>
          {/* Folder count — mirrors the wordCount row on the card screen for visual alignment */}
          <Text style={[s.wordCount, { color: pal.sub }]}>
            {folders.length} {t(folders.length === 1 ? 'folders_singular' : 'folders_plural')}
          </Text>

          {folders.length === 0 ? (
          <View style={s.empty}>
            <View style={[emptyIconWrap, { backgroundColor: activeThemeColor + '18' }]}>
              <Ionicons name="folder-outline" size={40} color={activeThemeColor} />
            </View>
            <Text style={[s.emptyTitle, { color: pal.text }]}>{t('no_folders_title')}</Text>
            <Text style={[s.emptyHint,  { color: pal.sub  }]}>{t('no_folders_hint')}</Text>
          </View>
        ) : folderReorderMode ? (
          <ReorderableList
            cards={folders.map(f => ({ id: f.id, word: f.name, meaning: '', note: '' }))}
            onReorder={reordered =>
              setFolders(prev => reordered.map(c => prev.find(f => f.id === c.id)!))
            }
            pal={pal}
            themeColor={activeThemeColor}
            extraPaddingBottom={AD_BANNER_HEIGHT}
          />
        ) : (
          <>
            <FlatList
              data={folders}
              keyExtractor={f => f.id}
              renderItem={renderFolderItem}
              contentContainerStyle={[
                s.list,
                { paddingBottom: s.list.paddingBottom + AD_BANNER_HEIGHT + (folderSelectionMode ? SEL_BAR_H : 0) },
              ]}
              showsVerticalScrollIndicator={false}
            />
            {/* Folder selection bar */}
            {folderSelectionMode && (
              <View style={[selStyles.bar, { backgroundColor: pal.dialog, borderTopColor: pal.border }]}>
                <TouchableOpacity
                  style={selStyles.barBtn}
                  onPress={deleteSelectedFolders}
                  disabled={selectedFolderIds.size === 0}
                >
                  <Ionicons name="trash-outline" size={20} color={selectedFolderIds.size === 0 ? pal.sub : '#E05C5C'} />
                  <Text style={[selStyles.barLabel, { color: selectedFolderIds.size === 0 ? pal.sub : '#E05C5C' }]}>
                    {t('delete')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )
        }
      </>
      ) : (
        /* Card list inside folder */
        <>
          <Text style={[s.wordCount, { color: pal.sub }]}>
            {isFilterActive
              ? `${filteredFolderCards.length} / ${folderCards.length}`
              : folderCards.length}{' '}
            {t(folderCards.length === 1 ? 'words_singular' : 'words_plural')}
            {isSubscribed ? '  ★ Pro' : ''}
          </Text>

          {/* Level filter chips */}
          {folderCards.length > 0 && !selectionMode && !reorderMode && showLevelLabels && (
            <View style={filterStyles.bar}>
              {LEVEL_FILTER_OPTIONS.map(({ level, icon, color }) => {
                const count = folderCards.filter(c => (c.testLevel ?? 'none') === level).length;
                const on = levelFilter.has(level);
                return (
                  <TouchableOpacity
                    key={level}
                    style={[filterStyles.chip, {
                      borderColor: on ? color : pal.border,
                    }]}
                    onPress={() => toggleLevelFilter(level)}
                  >
                    {icon === '◎'
                      ? <Text style={{ fontSize: 14, color: on ? color : '#9CA3AF', lineHeight: 15 }}>◎</Text>
                      : icon != null
                      ? <Ionicons name={icon as any} size={13} color={on ? color : '#9CA3AF'} />
                      : null
                    }
                    <Text style={[filterStyles.chipCount, { color: on ? color : '#9CA3AF' }]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {folderCards.length === 0 ? (
            <View style={s.empty}>
              <View style={[emptyIconWrap, { backgroundColor: activeThemeColor + '18' }]}>
                <Ionicons name="book-outline" size={40} color={activeThemeColor} />
              </View>
              <Text style={[s.emptyTitle, { color: pal.text }]}>{t('no_words_title')}</Text>
              <Text style={[s.emptyHint,  { color: pal.sub  }]}>{t('no_words_hint')}</Text>
            </View>
          ) : reorderMode ? (
            <>
              <View style={reorderToolStyles.toolbar}>
                <TouchableOpacity
                  style={[reorderToolStyles.btn, { backgroundColor: pal.card, borderColor: pal.border }]}
                  onPress={handleSortByLevel}
                >
                  <Text style={[reorderToolStyles.btnText, { color: reorderSortDir != null ? activeThemeColor : pal.text }]}>
                    {t(reorderSortDir === 'asc' ? 'reorder_sort_least_first' : 'reorder_sort_best_first')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[reorderToolStyles.btn, { backgroundColor: pal.card, borderColor: pal.border }]}
                  onPress={handleResetOrder}
                >
                  <Ionicons name="refresh-outline" size={15} color={pal.sub} />
                  <Text style={[reorderToolStyles.btnText, { color: pal.sub }]}>{t('reorder_original')}</Text>
                </TouchableOpacity>
              </View>
              <ReorderableList
                cards={folderCards}
                onReorder={reorderedFolderCards => {
                  setCards(prev => [
                    ...reorderedFolderCards,
                    ...prev.filter(c => c.folderId !== currentFolderId),
                  ]);
                }}
                pal={pal}
                themeColor={activeThemeColor}
                extraPaddingBottom={AD_BANNER_HEIGHT}
                showLevelLabel={showLevelLabels}
              />
            </>
          ) : cardViewMode === 'flip' ? (
            <FlipCardBrowser
              cards={filteredFolderCards}
              pal={pal}
              themeColor={activeThemeColor}
              onEdit={openEdit}
              onDelete={deleteCard}
              onToggleNotif={toggleCardNotif}
              showLevelLabel={showLevelLabels}
            />
          ) : (
            <FlatList
              data={filteredFolderCards}
              keyExtractor={c => c.id}
              renderItem={renderCard}
              contentContainerStyle={[
                s.list,
                { paddingBottom: s.list.paddingBottom + AD_BANNER_HEIGHT + (selectionMode ? SEL_BAR_H : 0) },
              ]}
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={() => closeOpenCard.current?.()}
            />
          )}

          {/* Selection action bar */}
          {selectionMode && (
            <View style={[selStyles.bar, { backgroundColor: pal.dialog, borderTopColor: pal.border }]}>
              <TouchableOpacity
                style={selStyles.barBtn}
                onPress={deleteSelected}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="trash-outline" size={20} color={selectedIds.size === 0 ? pal.sub : '#E05C5C'} />
                <Text style={[selStyles.barLabel, { color: selectedIds.size === 0 ? pal.sub : '#E05C5C' }]}>
                  {t('delete')}
                </Text>
              </TouchableOpacity>
              <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
              <TouchableOpacity
                style={selStyles.barBtn}
                onPress={() => setNotifForSelected(false)}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="notifications-outline" size={20} color={selectedIds.size === 0 ? pal.sub : activeThemeColor} />
                <Text style={[selStyles.barLabel, { color: selectedIds.size === 0 ? pal.sub : activeThemeColor }]}>
                  {t('notif_on')}
                </Text>
              </TouchableOpacity>
              <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
              <TouchableOpacity
                style={selStyles.barBtn}
                onPress={() => setNotifForSelected(true)}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="notifications-off-outline" size={20} color={pal.sub} />
                <Text style={[selStyles.barLabel, { color: pal.sub }]}>{t('notif_off_action')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {!selectionMode && !reorderMode && (
            <TouchableOpacity
              style={[s.fab, { bottom: AD_BANNER_HEIGHT + 48, backgroundColor: activeThemeColor, shadowColor: activeThemeColor }]}
              onPress={openAdd}
            >
              <Text style={s.fabText}>+</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <AdBannerPlaceholder pal={pal} />

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
        themeColor={themeColor}
        onPickTheme={pickTheme}
        appearance={appearance}
        onPickAppearance={pickAppearance}
        skinId={skinId}
        onPickSkin={setSkinId}
        isSubscribed={isSubscribed}
        onUpgrade={() => { setSettingsModalVisible(false); openPaywall('words'); }}
        onSubscribe={subscribe}
        onRestore={restore}
        pal={pal}
        language={language}
        onPickLanguage={pickLanguage}
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

          {/* Group 2: Settings — notification shown only in cards context */}
          {menuContext === 'cards' && notificationGranted && (
            <>
              <TouchableOpacity
                style={menuStyles.item}
                onPress={() => { setNotificationModalVisible(true); setMenuVisible(false); }}
              >
                <Ionicons
                  name={notificationsEnabled ? 'notifications-outline' : 'notifications-off-outline'}
                  size={17}
                  color={pal.text}
                />
                <Text style={[menuStyles.itemText, { color: pal.text }]}>{t('notifications')}</Text>
              </TouchableOpacity>
              <View style={[menuStyles.sep, { backgroundColor: pal.border }]} />
            </>
          )}
          <TouchableOpacity
            style={menuStyles.item}
            onPress={() => { setSettingsModalVisible(true); setMenuVisible(false); }}
          >
            <Ionicons name="settings-outline" size={17} color={pal.text} />
            <Text style={[menuStyles.itemText, { color: pal.text }]}>{t('settings')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <AddFolderModal
        visible={addFolderVisible}
        onClose={() => setAddFolderVisible(false)}
        onCreate={createFolder}
        pal={pal}
        themeColor={activeThemeColor}
      />

      <AddFolderModal
        visible={renamingFolder !== null}
        onClose={() => setRenamingFolder(null)}
        onCreate={(name) => {
          if (!renamingFolder) return;
          setFolders(prev => prev.map(f => f.id === renamingFolder.id ? { ...f, name } : f));
        }}
        initialName={renamingFolder?.name ?? ''}
        mode="rename"
        pal={pal}
        themeColor={activeThemeColor}
      />

      <FolderCustomizeModal
        visible={customizingFolder !== null}
        mode="icon"
        currentValue={customizingFolder?.icon ?? 'folder-outline'}
        folderName={customizingFolder?.name ?? ''}
        onSelect={(value) => {
          if (!customizingFolder) return;
          setFolders(prev => prev.map(f =>
            f.id === customizingFolder.id ? { ...f, icon: value } : f
          ));
        }}
        onClose={() => setCustomizingFolder(null)}
        pal={pal}
        themeColor={activeThemeColor}
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
        />
      )}
    </SafeAreaView>
    </SafeAreaProvider>
    </LangContext.Provider>
  );
}

const emptyIconWrap = {
  width: 80, height: 80, borderRadius: 24,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  marginBottom: 20,
};

const selStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 68,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  barLabel: { fontSize: 11, fontWeight: '600' },
  barDivider: { width: StyleSheet.hairlineWidth },
});

const filterStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipCount: {
    fontSize: 12,
    fontWeight: '600',
  },
});

const reorderToolStyles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

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

