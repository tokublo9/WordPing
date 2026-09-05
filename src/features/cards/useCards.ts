import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Alert } from 'react-native';
import type { ReviewEntry, WordCard } from '../../types';
import { appNow } from '../../lib/appClock';
import { CLEAR_HIDE, cardsForVisibility, nextHideExpiry } from './visibility';
import { translate } from '../../i18n';
import {
  countCardsByResult,
  type LevelFilterKey,
} from './levels';
import { nextTestDueAt } from './testSchedule';
import { findDuplicateCard } from './duplicates';
import { FLIP_MODE_ENABLED } from '../flags';
import { createId } from '../../utils/createId';
import { reportSideEffectFailure } from '../../utils/reportSideEffectFailure';
import {
  mergeVisibleCardOrder,
  nextRegistrationTimestamp,
  shuffleCards,
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
  onCardRegistered?(card: WordCard, remaining: readonly WordCard[]): void | Promise<void>;
  /**
   * An existing word was saved. Carries what it used to say and the library as
   * it now stands, which is what the AI-voice cache needs to decide whether the
   * old clip is still reachable from any other card.
   */
  onCardEdited?(change: {
    card: WordCard;
    previousCard: WordCard;
    remaining: readonly WordCard[];
  }): void | Promise<void>;
  onCardsImported?(cards: readonly WordCard[], remaining: readonly WordCard[]): void | Promise<void>;
  /** The removed cards themselves, and what is left — not just the ids. */
  onCardsDeleted?(removed: readonly WordCard[], remaining: readonly WordCard[]): void;
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
  /** Deletes a set of words outright. The one delete path every surface uses. */
  deleteCards(ids: readonly string[]): void;
  /** Adds or removes every selected word from the notification list. */
  setNotifCandidateForSelected(candidate: boolean): void;
  // Reorder
  reorderMode: boolean;
  reorderSortDir: 'registration' | 'random' | null;
  enterReorderMode(): void;
  exitReorderMode(): void;
  cancelReorderMode(): void;
  /** Update the pending order without discarding hidden cards. */
  replaceFolderOrder(orderedVisible: readonly WordCard[]): void;
  handleRegistrationOrder(): void;
  handleRandomOrder(): void;
  // Labels
  showLevelLabels: boolean;
  setShowLevelLabels: Dispatch<SetStateAction<boolean>>;
  /**
   * How many words sit under each chip at this moment. Computed here rather
   * than in the screen because this is where the clock signal lives: the same
   * wake-up that brings a rested word back to the list also moves it out of its
   * colour and into grey.
   */
  levelCounts: Record<LevelFilterKey, number>;
  // Derived card lists (computed from injected cards + currentFolderId)
  allFolderCards: WordCard[];
  /**
   * The words the list and Flip Mode show: the folder, minus whatever is inside
   * the hide its grade gave it. There is no second, narrower list — nothing
   * filters — so this is the one visible set.
   */
  folderCards: WordCard[];
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
  wordHideWord: boolean;
  setWordHideWord: Dispatch<SetStateAction<boolean>>;
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
  /** Flips one word's place on its folder's notification list. */
  toggleCardNotif(id: string): void;
  toggleCardHideWord(id: string): void;
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
  onCardRegistered,
  onCardEdited,
  onCardsImported,
  onCardsDeleted,
}: UseCardsParams): UseCardsReturn {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderSortDir, setReorderSortDir] = useState<'registration' | 'random' | null>(null);
  const [pendingFolderCards, setPendingFolderCards] = useState<WordCard[] | null>(null);
  const [showLevelLabels, setShowLevelLabels] = useState(true);
  const closeOpenCard = useRef<(() => void) | null>(null);
  const [editingCard, setEditingCard] = useState<WordCard | null>(null);
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [note, setNote] = useState('');
  const [wordFieldLang, setWordFieldLang] = useState<string | undefined>(undefined);
  const [meaningFieldLang, setMeaningFieldLang] = useState<string | undefined>(undefined);
  const [wordHideWord, setWordHideWord] = useState(false);
  const [wordAudioUri, setWordAudioUri] = useState<string | undefined>(undefined);
  const [wordAudioSpeed, setWordAudioSpeed] = useState(1.0);
  const [wordAudioVolume, setWordAudioVolume] = useState(1.0);
  const [reviewHistory, setReviewHistory] = useState<ReviewEntry[]>([]);
  const [testClearPending, setTestClearPending] = useState(false);
  const [wordModalVisible, setWordModalVisible] = useState(false);
  const [testModeVisible, setTestModeVisible] = useState(false);
  const [cardViewMode, setSelectedCardViewMode] = useState<'list' | 'flip'>('list');
  // The single gate for Word Flip. Every route into the mode — the Settings
  // toggle, the word list's own position-preserving change, and the internal
  // calls that force 'list' — ends here, so refusing 'flip' in one place is
  // enough and no caller has to know the feature is off.
  const setCardViewMode = useCallback<Dispatch<SetStateAction<'list' | 'flip'>>>(action => {
    if (!FLIP_MODE_ENABLED) {
      setSelectedCardViewMode('list');
      return;
    }
    setSelectedCardViewMode(action);
  }, []);
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
  // Sync-hidden cards drop out of ordinary learning views. A selected result
  // filter can reveal matching cards; all remain in SQLite and backups.
  //
  // A hide ends by wall-clock time, and nothing in `cards` changes at that
  // instant, so on its own this memo would keep serving the filtered array
  // until some unrelated state change happened to rebuild it — a screen left
  // open never got the card back. `hideEpoch` is the wake-up: the effect below
  // schedules one timeout at the next expiry and bumps it, which is the only
  // reason it is a dependency here.
  const [hideEpoch, setHideEpoch] = useState(0);
  const allFolderCards = useMemo(
    () => currentFolderId ? cards.filter(c => c.folderId === currentFolderId) : [],
    [cards, currentFolderId],
  );
  const displayedAllFolderCards = reorderMode && pendingFolderCards
    ? pendingFolderCards
    : allFolderCards;
  const folderCards = useMemo(
    () => cardsForVisibility(displayedAllFolderCards, appNow()) as WordCard[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hideEpoch is a clock signal, not a value read here
    [displayedAllFolderCards, hideEpoch],
  );

  // One timer for the soonest moment anything changes by itself, re-armed
  // whenever it fires or the cards change. No polling, and nothing is written:
  // every selector re-reads the stored timestamps, so a timer that fires late
  // (the OS suspends them while backgrounded) still produces the correct result.
  //
  // Two kinds of instant matter and they are not always the same one: a hide
  // ending puts a card back in the list, and a waiting interval ending moves a
  // card out of its colour chip and into grey. The earlier of the two is the
  // wake-up, so neither can be missed.
  useEffect(() => {
    const now = appNow();
    const hideExpiry = nextHideExpiry(cards, now);
    const dueAt = nextTestDueAt(cards, now);
    const expiry = hideExpiry === null
      ? dueAt
      : dueAt === null ? hideExpiry : Math.min(hideExpiry, dueAt);
    if (expiry === null) return;
    // A delay past setTimeout's 32-bit range fires immediately, which would
    // re-arm in a loop. A hide is 24 h, but an imported backup can carry any
    // timestamp, so clamp and let the effect re-arm from the shorter remainder.
    const delay = Math.min(Math.max(0, expiry - now), 2_147_483_647);
    const timer = setTimeout(() => setHideEpoch(epoch => epoch + 1), delay);
    return () => clearTimeout(timer);
  }, [cards, hideEpoch]);
  // One pass over the folder produces every chip count, and it is taken at the
  // same instant as the lists above so a chip can never disagree with what
  // tapping it shows. `hideEpoch` is the same clock signal the lists use.
  const levelCounts = useMemo(
    () => countCardsByResult(displayedAllFolderCards, appNow()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hideEpoch is a clock signal, not a value read here
    [displayedAllFolderCards, hideEpoch],
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
    setPendingFolderCards(null);
    setReorderSortDir(null);
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
      const allSelected = folderCards.length > 0
        && folderCards.every(card => prev.has(card.id));
      return allSelected ? new Set() : new Set(folderCards.map(card => card.id));
    });
  };

  // One delete, wherever it is asked for: the selection bar, a card's own
  // delete, and the result sheet all land here, so the audio cache, the
  // notification schedule and the flip state are cleaned up the same way each
  // time rather than three times over.
  const deleteCards = (ids: readonly string[]) => {
    if (ids.length === 0) return;
    const doomed = new Set(ids);
    // Split before the state update so the listener is told exactly which words
    // went and which remain — a word still holding the same text keeps its audio.
    const removed = cards.filter(c => doomed.has(c.id));
    const remaining = cards.filter(c => !doomed.has(c.id));
    setCards(prev => prev.filter(c => !doomed.has(c.id)));
    setFlipped(prev => {
      const next = new Set(prev);
      doomed.forEach(id => next.delete(id));
      return next;
    });
    onCardsDeleted?.(removed, remaining);
  };

  const deleteSelected = () => {
    deleteCards([...selectedIds]);
    exitSelectionMode();
  };

  const setNotifCandidateForSelected = (candidate: boolean) => {
    setCards(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, notifCandidate: candidate } : c));
    exitSelectionMode();
  };

  // ── Reorder ──────────────────────────────────────────────────────────────────

  // Dragging and presets only update this pending snapshot. Hidden cards retain
  // their slots, and shared/persisted card state is untouched until Save.
  const replaceFolderOrder = useCallback((orderedVisible: readonly WordCard[]) => {
    setPendingFolderCards(previous => mergeVisibleCardOrder(
      previous ?? allFolderCards,
      orderedVisible,
    ));
    setReorderSortDir(null);
  }, [allFolderCards]);

  // Save: publish the pending folder order through the existing persistence path.
  const exitReorderMode = () => {
    if (currentFolderId && pendingFolderCards) {
      setCards(previous => {
        const currentFolderCards = previous.filter(card => card.folderId === currentFolderId);
        return [
          ...mergeVisibleCardOrder(currentFolderCards, pendingFolderCards),
          ...previous.filter(card => card.folderId !== currentFolderId),
        ];
      });
    }
    setReorderMode(false);
    setPendingFolderCards(null);
    setReorderSortDir(null);
  };

  // Cancel: discard the local snapshot. Persisted cards were never modified.
  const cancelReorderMode = () => {
    setReorderMode(false);
    setPendingFolderCards(null);
    setReorderSortDir(null);
  };

  const enterReorderMode = () => {
    setReorderMode(true);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setMenuVisible(false);
    setCardViewMode('list');
    setPendingFolderCards(allFolderCards);
  };

  const handleRegistrationOrder = () => {
    setPendingFolderCards(previous => mergeVisibleCardOrder(
      previous ?? allFolderCards,
      sortByRegistrationOrder(folderCards),
    ));
    setReorderSortDir('registration');
  };

  const handleRandomOrder = () => {
    setPendingFolderCards(previous => mergeVisibleCardOrder(
      previous ?? allFolderCards,
      shuffleCards(folderCards),
    ));
    setReorderSortDir('random');
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
    setWordHideWord(false);
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
    // Absent on every card saved before the toggle existed, which reads as off.
    setWordHideWord(card.hideWord === true);
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

    // One word per folder. Checked against the folder the card is in — the same
    // term in two folders is legitimate — and the card being edited is excluded
    // so simply re-saving it is never a collision.
    const targetFolderId = editingCard ? editingCard.folderId : currentFolderId ?? undefined;
    const duplicate = findDuplicateCard(cards, word, targetFolderId, editingCard?.id);
    if (duplicate) {
      Alert.alert(
        translate(language, 'duplicate_word_title'),
        translate(language, 'duplicate_word_message'),
        [
          { text: translate(language, 'cancel'), style: 'cancel' },
          // Nothing new is created either way; this just takes the user to the
          // word they already have, which is what they usually wanted.
          {
            text: translate(language, 'duplicate_word_open'),
            onPress: () => { setWordModalVisible(false); openEdit(duplicate); },
          },
        ],
      );
      return;
    }

    // Words are unlimited on every plan — no count check gates registration.
    if (editingCard) {
      // Spread onto the card as the state holds it, never onto `editingCard`:
      // the sheet's own notification action writes through while it is open, and
      // rebuilding from the opening snapshot would undo it.
      const edits = {
        word: word.trim(),
        meaning: meaning.trim(),
        note: note.trim(),
        wordLang: wordFieldLang,
        meaningLang: meaningFieldLang,
        hideWord: wordHideWord,
        audioUri: wordAudioUri,
        audioSpeed: wordAudioSpeed,
        audioVolume: wordAudioVolume,
        reviewHistory,
        ...(testClearPending ? {
          testLevel: undefined,
          testNextReview: undefined,
          testMastered: undefined,
          // Clearing the grade has to clear the hide it produced.
          ...CLEAR_HIDE,
        } : {}),
      };
      const applyEdits = (c: WordCard): WordCard =>
        c.id === editingCard.id ? { ...c, ...edits } : c;
      const remaining = cards.map(applyEdits);
      setCards(remaining);
      // After the save and never awaited, exactly like registration: whatever
      // this triggers must not delay the write or hold the sheet open.
      void Promise.resolve()
        .then(() => onCardEdited?.({
          card: { ...editingCard, ...edits },
          previousCard: editingCard,
          remaining,
        }))
        .catch(error => reportSideEffectFailure('post-edit AI Voice preload', error));
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
        hideWord: wordHideWord,
        audioUri: wordAudioUri,
        audioSpeed: wordAudioSpeed,
        audioVolume: wordAudioVolume,
      };
      const remaining = [...cards, registeredCard];
      setCards(remaining);
      // The callback commits this snapshot before queueing generation, but is
      // deliberately not awaited so saving never blocks closing the sheet.
      void Promise.resolve()
        .then(() => onCardRegistered?.(registeredCard, remaining))
        .catch(error => reportSideEffectFailure('post-registration AI Voice preload', error));
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
      // One state update feeds the existing snapshot persistence path.
      const remaining = [...cards, ...batch.cards];
      setCards(remaining);
      // Queued after the import is accepted, and only for the words it actually
      // created — duplicates were skipped and already have whatever audio they
      // had. The listener hands these to the same bounded preload queue a
      // single registration uses, so an import cannot burst the API.
      if (batch.cards.length > 0) {
        void Promise.resolve()
          .then(() => onCardsImported?.(batch.cards, remaining))
          .catch(error => reportSideEffectFailure('post-import AI Voice preload', error));
      }
      return {
        added: batch.cards.length,
        duplicatesSkipped: batch.duplicatesSkipped,
        failed: batch.invalidCount,
      };
    } catch (error) {
      // Without this the preview only ever showed the generic failure string, leaving
      // no trace of what actually broke while preparing the batch.
      reportSideEffectFailure('bulk import', error);
      return {
        added: 0,
        duplicatesSkipped: 0,
        failed: drafts.length,
        error: 'unknown',
      };
    }
  };

  const deleteCard = (id: string) => deleteCards([id]);

  /**
   * Adds the word to its folder's notification list, or takes it off.
   *
   * Writes `notifCandidate` and nothing else, so eligibility never disturbs a
   * grade, a review interval or Hide Front Word. Applied to the live card
   * immediately — the Add/Edit sheet's action is not staged behind Save.
   */
  const toggleCardNotif = (id: string) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, notifCandidate: !c.notifCandidate } : c));
  };

  /**
   * Flips one word's Hide Front Word setting.
   *
   * The same stored `hideWord` flag the editor writes, so List, Flip and Test
   * all follow from the one card update and persist through the ordinary
   * snapshot — there is no second state to keep in step.
   */
  const toggleCardHideWord = (id: string) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, hideWord: !c.hideWord } : c));
  };

  return {
    flipped, toggleFlip,
    selectionMode, selectedIds,
    enterSelectionMode, exitSelectionMode, toggleSelect, selectAllCards, deleteSelected, deleteCards,
    setNotifCandidateForSelected,
    reorderMode, reorderSortDir,
    enterReorderMode, exitReorderMode, cancelReorderMode, replaceFolderOrder,
    handleRegistrationOrder, handleRandomOrder,
    showLevelLabels, setShowLevelLabels,
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
  };
}
