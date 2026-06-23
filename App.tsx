import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,  // kept for word-limit alert
  FlatList,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { bootstrapData, persist } from './src/lib/db';

import type { Appearance, WordCard } from './src/types';
import {
  DARK, DEFAULT_DISPLAY_ONLY_WORD, DEFAULT_INTERVAL, DEFAULT_THEME, LIGHT,
} from './src/constants';
import { requestPermission, rescheduleNotifications } from './src/notifications';
import { appStyles as s } from './src/styles';
import { SwipeableCard } from './src/components/SwipeableCard';
import { WordModal } from './src/components/WordModal';
import { NotificationModal } from './src/components/NotificationModal';
import { SettingsModal } from './src/components/SettingsModal';
import { TutorialModal } from './src/components/TutorialModal';

export default function App() {
  const systemScheme = useColorScheme();

  const [cards, setCards] = useState<WordCard[]>([]);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(DEFAULT_INTERVAL);
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME);
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [displayOnlyWord, setDisplayOnlyWord] = useState(DEFAULT_DISPLAY_ONLY_WORD);

  const [wordModalVisible, setWordModalVisible] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);

  const [editingCard, setEditingCard] = useState<WordCard | null>(null);
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [note, setNote] = useState('');

  const closeOpenCard = useRef<(() => void) | null>(null);
  const hasLoaded = useRef(false);

  const isDark = appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';
  const pal = isDark ? DARK : LIGHT;
  const notificationsEnabled = intervalSeconds > 0;

  // ── Persist & load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const applyData = (d: { cards: WordCard[]; settings: { intervalSeconds: number; themeColor: string; appearance: Appearance; displayOnlyWord: boolean } }) => {
      setCards(d.cards);
      setIntervalSeconds(d.settings.intervalSeconds);
      setThemeColor(d.settings.themeColor);
      setAppearance(d.settings.appearance);
      setDisplayOnlyWord(d.settings.displayOnlyWord);
    };

    bootstrapData((remote) => applyData(remote)).then((local) => {
      applyData(local);
      hasLoaded.current = true;
    });
    requestPermission().then(setNotificationGranted);
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    persist({ cards, settings: { intervalSeconds, themeColor, appearance, displayOnlyWord } });
    if (notificationGranted) rescheduleNotifications(cards, intervalSeconds, displayOnlyWord);
  }, [cards, intervalSeconds, notificationGranted, displayOnlyWord, themeColor, appearance]);

  // ── Notifications ───────────────────────────────────────────────────────────
  const pickInterval = (seconds: number) => setIntervalSeconds(seconds);
  const pickDisplayOnlyWord = (value: boolean) => setDisplayOnlyWord(value);

  // ── Theme ────────────────────────────────────────────────────────────────────
  const pickTheme = (color: string) => setThemeColor(color);
  const pickAppearance = (mode: Appearance) => setAppearance(mode);

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
    if (!word.trim()) { Alert.alert('Enter a word'); return; }
    if (!editingCard && cards.length >= 20) {
      Alert.alert('Word limit reached', 'You can register up to 20 words.');
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
        { id: Date.now().toString(), word: word.trim(), meaning: meaning.trim(), note: note.trim() },
        ...prev,
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
    // Only close the previous card if it's a different one; skip if same card
    // re-registers (e.g. user swipes an already-open card further left)
    if (closeOpenCard.current !== close) closeOpenCard.current?.();
    closeOpenCard.current = close;
  }, []);

  const renderCard = ({ item }: { item: WordCard }) => (
    <SwipeableCard
      item={item}
      isFlipped={flipped.has(item.id)}
      themeColor={themeColor}
      pal={pal}
      onFlip={() => toggleFlip(item.id)}
      onEdit={() => openEdit(item)}
      onDelete={() => deleteCard(item.id)}
      onToggleNotif={() => toggleCardNotif(item.id)}
      onOpen={handleCardOpen}
    />
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
    <SafeAreaView style={[s.root, { backgroundColor: pal.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={s.header}>
        <Text style={[s.title, { color: pal.text }]}>WordPing</Text>
        <View style={s.headerIcons}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setTutorialVisible(true)}>
            <Ionicons name="help-circle-outline" size={22} color={pal.sub} />
          </TouchableOpacity>
          {notificationGranted && (
            <TouchableOpacity style={s.iconBtn} onPress={() => setNotificationModalVisible(true)}>
              <Ionicons
                name={notificationsEnabled ? 'notifications' : 'notifications-off-outline'}
                size={22}
                color={notificationsEnabled ? themeColor : pal.sub}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.iconBtn} onPress={() => setSettingsModalVisible(true)}>
            <Ionicons name="settings-outline" size={22} color={pal.sub} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[s.wordCount, { color: pal.sub }]}>
        {cards.length} {cards.length === 1 ? 'word' : 'words'}
      </Text>

      {cards.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📖</Text>
          <Text style={[s.emptyTitle, { color: pal.text }]}>No words yet</Text>
          <Text style={[s.emptyHint, { color: pal.sub }]}>Tap + to add your first word</Text>
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={c => c.id}
          renderItem={renderCard}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => closeOpenCard.current?.()}
        />
      )}

      <TouchableOpacity
        style={[s.fab, { backgroundColor: themeColor, shadowColor: themeColor }]}
        onPress={openAdd}
      >
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

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
        themeColor={themeColor}
      />

      <NotificationModal
        visible={notificationModalVisible}
        onClose={() => setNotificationModalVisible(false)}
        intervalSeconds={intervalSeconds}
        onPickInterval={pickInterval}
        displayOnlyWord={displayOnlyWord}
        onToggleDisplayOnlyWord={pickDisplayOnlyWord}
        pal={pal}
        themeColor={themeColor}
      />

      <SettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        themeColor={themeColor}
        onPickTheme={pickTheme}
        appearance={appearance}
        onPickAppearance={pickAppearance}
        pal={pal}
      />

      <TutorialModal
        visible={tutorialVisible}
        onClose={() => setTutorialVisible(false)}
        pal={pal}
        themeColor={themeColor}
      />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
