import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Alert } from 'react-native';
import type { ReviewEntry, WordCard } from '../../types';
import { translate } from '../../i18n';
import {
  ALL_LEVEL_KEYS,
  isLevelFilterKey,
  type LevelFiltersByFolder,
} from './levels';
import { createId } from '../../utils/createId';
import {
  nextRegistrationTimestamp,
  sortByRating,
  sortByRegistrationOrder,
} from './cardSorting';
import {
  createBulkImportBatch,
  type BulkImportDraft,
  type BulkImportResult,
} from './bulkImport';

export interface UseCardsParams {
  cards: WordCard[];
  setCards: Dispatch<SetStateAction<WordCard[]>>;
  currentFolderId: string | null;
  language: string;
  setMenuVisible: Dispatch<SetStateAction<boolean>>;
  levelFiltersByFolder: LevelFiltersByFolder;
  setLevelFiltersByFolder: Dispatch<SetStateAction<LevelFiltersByFolder>>;
  onCardRegistered?(card: WordCard): void;
  onCardsDeleted?(ids: string[]): void;
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
  selectAllCards(): void;
  deleteSelected(): void;
  setNotifForSelected(notifOff: boolean): void;
  // Reorder
  reorderMode: boolean;
  reorderSortDir: 'asc' | 'desc' | 'registration' | null;
  enterReorderMode(): void;
  exitReorderMode(): void;
  cancelReorderMode(): void;
  handleSortByLevel(dir: 'asc' | 'desc'): void;
  handleRegistrationOrder(): void;
  // Level filter
  levelFilter: Set<string>;
  isFilterActive: boolean;
  toggleLevelFilter(level: string): void;
  // Labels
  showLevelLabels: boolean;
  setShowLevelLabels: Dispatch<SetStateAction<boolean>>;
  // Derived card lists (computed from injected cards + currentFolderId)
  folderCards: WordCard[];
  filteredFolderCards: WordCard[];
  // View
  cardViewMode: 'list' | 'flip';
  setCardViewMode: Dispatch<SetStateAction<'list' | 'flip'>>;
  currentWordId: string | null;
  setCurrentWordId(id: string | null): void;
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
  bulkImportCards(drafts: readonly BulkImportDraft[], destinationFolderId: string): BulkImportResult;
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
  language,
  setMenuVisible,
  levelFiltersByFolder,
  setLevelFiltersByFolder,
  onCardRegistered,
  onCardsDeleted,
}: UseCardsParams): UseCardsReturn {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderSortDir, setReorderSortDir] = useState<'asc' | 'desc' | 'registration' | null>(null);
  const originalFolderCards = useRef<WordCard[]>([]);
  const [showLevelLabels, setShowLevelLabels] = useState(true);
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
  const [currentWordIdsByFolder, setCurrentWordIdsByFolder] = useState<Record<string, string>>({});

  // Position is retained per folder so leaving the Word List temporarily—or opening a
  // different folder—does not discard the last word the user was reading.
  const currentWordId = currentFolderId
    ? currentWordIdsByFolder[currentFolderId] ?? null
    : null;
  const setCurrentWordId = useCallback((id: string | null) => {
    if (!currentFolderId) return;
    setCurrentWordIdsByFolder(previous => {
      if (id === null) {
        if (!(currentFolderId in previous)) return previous;
        const next = { ...previous };
        delete next[currentFolderId];
        return next;
      }
      if (previous[currentFolderId] === id) return previous;
      return { ...previous, [currentFolderId]: id };
    });
  }, [currentFolderId]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  // Memoized because these arrays are the list's `data`. Rebuilding them on every
  // App render handed the list a new identity for unrelated state changes (a modal
  // opening, a banner, a subscription refresh), which re-ran the filter over every
  // card and made the virtualized list re-evaluate its cells.
  const folderCards = useMemo(
    () => currentFolderId ? cards.filter(c => c.folderId === currentFolderId) : [],
    [cards, currentFolderId],
  );
  const levelFilter = useMemo<Set<string>>(
    () => new Set(
      currentFolderId
        ? (levelFiltersByFolder[currentFolderId] ?? ALL_LEVEL_KEYS)
        : ALL_LEVEL_KEYS,
    ),
    [currentFolderId, levelFiltersByFolder],
  );
  const isFilterActive = levelFilter.size < ALL_LEVEL_KEYS.length;
  const filteredFolderCards = useMemo(
    () => isFilterActive
      ? folderCards.filter(c => levelFilter.has(c.testLevel ?? 'none'))
      : folderCards,
    [folderCards, isFilterActive, levelFilter],
  );

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

  const selectAllCards = () => {
    setSelectedIds(prev => {
      const allSelected = filteredFolderCards.length > 0
        && filteredFolderCards.every(card => prev.has(card.id));
      return allSelected ? new Set() : new Set(filteredFolderCards.map(card => card.id));
    });
  };

  const deleteSelected = () => {
    const deletedIds = [...selectedIds];
    setCards(prev => prev.filter(c => !selectedIds.has(c.id)));
    setFlipped(prev => {
      const next = new Set(prev);
      selectedIds.forEach(id => next.delete(id));
      return next;
    });
    onCardsDeleted?.(deletedIds);
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
    const sorted = sortByRating(folderCards, dir === 'asc' ? 'highest' : 'lowest');
    setCards(prev => [
      ...sorted,
      ...prev.filter(c => c.folderId !== currentFolderId),
    ]);
  };

  const handleRegistrationOrder = () => {
    setReorderSortDir('registration');
    const sorted = sortByRegistrationOrder(folderCards);
    setCards(prev => [
      ...sorted,
      ...prev.filter(c => c.folderId !== currentFolderId),
    ]);
  };

  // ── Level filter ──────────────────────────────────────────────────────────────
  const toggleLevelFilter = (level: string) => {
    if (!currentFolderId || !isLevelFilterKey(level)) return;
    setLevelFiltersByFolder(prev => {
      const current = prev[currentFolderId] ?? ALL_LEVEL_KEYS;
      const next = new Set(current);
      next.has(level) ? next.delete(level) : next.add(level);
      return {
        ...prev,
        [currentFolderId]: ALL_LEVEL_KEYS.filter(key => next.has(key)),
      };
    });
  };

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
    // Words are unlimited on every plan — no count check gates registration.
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
      const registeredCard: WordCard = {
        id: createId('card'),
        createdAt: nextRegistrationTimestamp(cards),
        word: word.trim(),
        meaning: meaning.trim(),
        note: note.trim(),
        folderId: currentFolderId ?? undefined,
        wordLang: wordFieldLang,
        meaningLang: meaningFieldLang,
        audioUri: wordAudioUri,
        audioSpeed: wordAudioSpeed,
        audioVolume: wordAudioVolume,
      };
      setCards(prev => [...prev, registeredCard]);
      // Queue only after the registration state update has been accepted. The
      // callback is synchronous and must never await generation or block close.
      onCardRegistered?.(registeredCard);
    }
    setWordModalVisible(false);
  };

  const bulkImportCards = (
    drafts: readonly BulkImportDraft[],
    destinationFolderId: string,
  ): BulkImportResult => {
    if (!destinationFolderId) {
      return { added: 0, duplicatesSkipped: 0, failed: drafts.length, error: 'destination_missing' };
    }
    try {
      const batch = createBulkImportBatch({
        drafts,
        existingCards: cards,
        destinationFolderId,
        firstCreatedAt: nextRegistrationTimestamp(cards),
        createId: () => createId('card'),
      });
      // One state update feeds the existing AsyncStorage and Supabase snapshot
      // persistence path. Bulk imports intentionally do not auto-preload AI audio.
      setCards(prev => [...prev, ...batch.cards]);
      return {
        added: batch.cards.length,
        duplicatesSkipped: batch.duplicatesSkipped,
        failed: batch.invalidCount,
      };
    } catch (error) {
      return {
        added: 0,
        duplicatesSkipped: 0,
        failed: drafts.length,
        error: 'unknown',
      };
    }
  };

  const deleteCard = (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
    setFlipped(prev => { const n = new Set(prev); n.delete(id); return n; });
    onCardsDeleted?.([id]);
  };

  const toggleCardNotif = (id: string) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, notifOff: !c.notifOff } : c));
  };

  return {
    flipped, toggleFlip,
    selectionMode, selectedIds,
    enterSelectionMode, exitSelectionMode, toggleSelect, selectAllCards, deleteSelected, setNotifForSelected,
    reorderMode, reorderSortDir,
    enterReorderMode, exitReorderMode, cancelReorderMode, handleSortByLevel, handleRegistrationOrder,
    levelFilter, isFilterActive, toggleLevelFilter,
    showLevelLabels, setShowLevelLabels,
    folderCards, filteredFolderCards,
    cardViewMode, setCardViewMode, currentWordId, setCurrentWordId,
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
    openAdd, openEdit, saveCard, bulkImportCards, deleteCard, toggleCardNotif,
    testModeVisible, setTestModeVisible,
  };
}
