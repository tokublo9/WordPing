import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Alert } from 'react-native';
import type { ReviewEntry, WordCard } from '../../types';
import { translate } from '../../i18n';
import { ALL_LEVEL_KEYS, LEVEL_ORDER } from './levels';
import { FREE_WORD_LIMIT } from '../../constants';

export interface UseCardsParams {
  cards: WordCard[];
  setCards: Dispatch<SetStateAction<WordCard[]>>;
  currentFolderId: string | null;
  isSubscribed: boolean;
  language: string;
  setMenuVisible: Dispatch<SetStateAction<boolean>>;
  onWordLimitReached(): void;
}

export interface UseCardsReturn {
  // Flip
  flipped: Set<string>;
  toggleFlip(id: string): void;
  // Selection
  selectionMode: boolean;
  selectedIds: Set<string>;
  enterSelectionMode(): void;
  exitSelectionMode(): void;
  toggleSelect(id: string): void;
  deleteSelected(): void;
  setNotifForSelected(notifOff: boolean): void;
  // Reorder
  reorderMode: boolean;
  reorderSortDir: 'asc' | 'desc' | null;
  enterReorderMode(): void;
  exitReorderMode(): void;
  cancelReorderMode(): void;
  handleSortByLevel(dir: 'asc' | 'desc'): void;
  handleResetOrder(): void;
  // Level filter
  levelFilter: Set<string>;
  isFilterActive: boolean;
  toggleLevelFilter(level: string): void;
  resetLevelFilter(): void;
  // Labels
  showLevelLabels: boolean;
  setShowLevelLabels: Dispatch<SetStateAction<boolean>>;
  // Derived card lists (computed from injected cards + currentFolderId)
  folderCards: WordCard[];
  filteredFolderCards: WordCard[];
  // View
  cardViewMode: 'list' | 'flip';
  setCardViewMode: Dispatch<SetStateAction<'list' | 'flip'>>;
  cardScrollEnabled: boolean;
  setCardScrollEnabled: Dispatch<SetStateAction<boolean>>;
  // Card-open tracking ref (returned so App.tsx can pass it to SwipeableCard)
  closeOpenCard: MutableRefObject<(() => void) | null>;
  handleCardOpen(close: () => void): void;
  // Word modal form
  wordModalVisible: boolean;
  setWordModalVisible: Dispatch<SetStateAction<boolean>>;
  editingCard: WordCard | null;
  word: string;
  setWord: Dispatch<SetStateAction<string>>;
  meaning: string;
  setMeaning: Dispatch<SetStateAction<string>>;
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  wordFieldLang: string | undefined;
  setWordFieldLang: Dispatch<SetStateAction<string | undefined>>;
  meaningFieldLang: string | undefined;
  setMeaningFieldLang: Dispatch<SetStateAction<string | undefined>>;
  wordAudioUri: string | undefined;
  setWordAudioUri: Dispatch<SetStateAction<string | undefined>>;
  wordAudioSpeed: number;
  setWordAudioSpeed: Dispatch<SetStateAction<number>>;
  wordAudioVolume: number;
  setWordAudioVolume: Dispatch<SetStateAction<number>>;
  // Review history (pending local state for the edit sheet)
  reviewHistory: ReviewEntry[];
  testClearPending: boolean;
  resetWordReview(): void;
  // CRUD actions
  openAdd(): void;
  openEdit(card: WordCard): void;
  saveCard(): void;
  deleteCard(id: string): void;
  toggleCardNotif(id: string): void;
  // Test mode
  testModeVisible: boolean;
  setTestModeVisible: Dispatch<SetStateAction<boolean>>;
}

export function useCards({
  cards,
  setCards,
  currentFolderId,
  isSubscribed,
  language,
  setMenuVisible,
  onWordLimitReached,
}: UseCardsParams): UseCardsReturn {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderSortDir, setReorderSortDir] = useState<'asc' | 'desc' | null>(null);
  const originalFolderCards = useRef<WordCard[]>([]);
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set(ALL_LEVEL_KEYS));
  const [showLevelLabels, setShowLevelLabels] = useState(true);
  const [cardScrollEnabled, setCardScrollEnabled] = useState(true);
  const closeOpenCard = useRef<(() => void) | null>(null);
  const [editingCard, setEditingCard] = useState<WordCard | null>(null);
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [note, setNote] = useState('');
  const [wordFieldLang, setWordFieldLang] = useState<string | undefined>(undefined);
  const [meaningFieldLang, setMeaningFieldLang] = useState<string | undefined>(undefined);
  const [wordAudioUri, setWordAudioUri] = useState<string | undefined>(undefined);
  const [wordAudioSpeed, setWordAudioSpeed] = useState(1.0);
  const [wordAudioVolume, setWordAudioVolume] = useState(1.0);
  const [reviewHistory, setReviewHistory] = useState<ReviewEntry[]>([]);
  const [testClearPending, setTestClearPending] = useState(false);
  const [wordModalVisible, setWordModalVisible] = useState(false);
  const [testModeVisible, setTestModeVisible] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<'list' | 'flip'>('list');

  // ── Derived ──────────────────────────────────────────────────────────────────
  const folderCards = currentFolderId
    ? cards.filter(c => c.folderId === currentFolderId)
    : [];
  const isFilterActive = levelFilter.size < ALL_LEVEL_KEYS.length;
  const filteredFolderCards = isFilterActive
    ? folderCards.filter(c => levelFilter.has(c.testLevel ?? 'none'))
    : folderCards;

  // ── Flip ─────────────────────────────────────────────────────────────────────
  const toggleFlip = (id: string) => {
    setFlipped(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Selection ─────────────────────────────────────────────────────────────────
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const enterSelectionMode = () => {
    setSelectedIds(new Set());
    setSelectionMode(true);
    setReorderMode(false);
    setMenuVisible(false);
    setCardViewMode('list');
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

  // ── Reorder ──────────────────────────────────────────────────────────────────
  const exitReorderMode = () => {
    setReorderMode(false);
    setReorderSortDir(null);
  };

  // Cancel: discard any reordering done this session, restoring the order captured
  // when reorder mode was entered, then exit.
  const cancelReorderMode = () => {
    const orig = originalFolderCards.current;
    if (orig.length) {
      setCards(prev => [
        ...orig,
        ...prev.filter(c => c.folderId !== currentFolderId),
      ]);
    }
    setReorderMode(false);
    setReorderSortDir(null);
  };

  const enterReorderMode = () => {
    setReorderMode(true);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setMenuVisible(false);
    setCardViewMode('list');
    originalFolderCards.current = folderCards;
  };

  const handleSortByLevel = (dir: 'asc' | 'desc') => {
    setReorderSortDir(dir);
    const sorted = [...folderCards].sort((a, b) => {
      const la = a.testLevel != null ? (LEVEL_ORDER[a.testLevel] ?? 4) : 4;
      const lb = b.testLevel != null ? (LEVEL_ORDER[b.testLevel] ?? 4) : 4;
      return dir === 'asc' ? la - lb : lb - la;
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

  // ── Level filter ──────────────────────────────────────────────────────────────
  const toggleLevelFilter = (level: string) => {
    setLevelFilter(prev => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });
  };

  const resetLevelFilter = () => setLevelFilter(new Set(ALL_LEVEL_KEYS));

  // ── Card-open tracking ────────────────────────────────────────────────────────
  // useCallback with empty deps: closeOpenCard is a ref (stable reference).
  const handleCardOpen = useCallback((close: () => void) => {
    if (closeOpenCard.current !== close) closeOpenCard.current?.();
    closeOpenCard.current = close;
  }, []);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const openAdd = () => {
    closeOpenCard.current?.();
    setEditingCard(null);
    setWord('');
    setMeaning('');
    setNote('');
    setWordFieldLang(undefined);
    setMeaningFieldLang(undefined);
    setWordAudioUri(undefined);
    setWordAudioSpeed(1.0);
    setWordAudioVolume(1.0);
    setReviewHistory([]);
    setTestClearPending(false);
    setWordModalVisible(true);
  };

  const openEdit = (card: WordCard) => {
    setEditingCard(card);
    setWord(card.word);
    setMeaning(card.meaning);
    setNote(card.note ?? '');
    setWordFieldLang(card.wordLang);
    setMeaningFieldLang(card.meaningLang);
    setWordAudioUri(card.audioUri);
    setWordAudioSpeed(card.audioSpeed ?? 1.0);
    setWordAudioVolume(card.audioVolume ?? 1.0);
    setReviewHistory(card.reviewHistory ?? []);
    setTestClearPending(false);
    setWordModalVisible(true);
  };

  const resetWordReview = useCallback(() => {
    setReviewHistory([]);
    setTestClearPending(true);
  }, []);

  const saveCard = () => {
    if (!word.trim()) {
      Alert.alert(translate(language, 'alert_enter_word'));
      return;
    }
    if (!editingCard && !isSubscribed && cards.length >= FREE_WORD_LIMIT) {
      setWordModalVisible(false);
      onWordLimitReached();
      return;
    }
    if (editingCard) {
      setCards(prev => prev.map(c =>
        c.id === editingCard.id
          ? {
              ...c,
              word: word.trim(),
              meaning: meaning.trim(),
              note: note.trim(),
              wordLang: wordFieldLang,
              meaningLang: meaningFieldLang,
              audioUri: wordAudioUri,
              audioSpeed: wordAudioSpeed,
              audioVolume: wordAudioVolume,
              reviewHistory,
              ...(testClearPending ? {
                testLevel: undefined,
                testNextReview: undefined,
                testMastered: undefined,
              } : {}),
            }
          : c
      ));
    } else {
      setCards(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          word: word.trim(),
          meaning: meaning.trim(),
          note: note.trim(),
          folderId: currentFolderId ?? undefined,
          wordLang: wordFieldLang,
          meaningLang: meaningFieldLang,
          audioUri: wordAudioUri,
          audioSpeed: wordAudioSpeed,
          audioVolume: wordAudioVolume,
        },
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

  return {
    flipped, toggleFlip,
    selectionMode, selectedIds,
    enterSelectionMode, exitSelectionMode, toggleSelect, deleteSelected, setNotifForSelected,
    reorderMode, reorderSortDir,
    enterReorderMode, exitReorderMode, cancelReorderMode, handleSortByLevel, handleResetOrder,
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
    reviewHistory, testClearPending, resetWordReview,
    openAdd, openEdit, saveCard, deleteCard, toggleCardNotif,
    testModeVisible, setTestModeVisible,
  };
}
