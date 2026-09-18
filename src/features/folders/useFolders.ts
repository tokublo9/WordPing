import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Dispatch, SetStateAction } from 'react';
import type { Folder, WordCard } from '../../types';
import { planFolderMove } from '../cards/duplicates';
import { createId } from '../../utils/createId';
import { createDefaultFolderNotifSettings } from '../notifications/defaultSettings';
import { posthog } from '../../config/posthog';
import { planFolderDeletion } from './folderDeletion';

export const EMPTY_FOLDERS_KEY = 'wordping_empty_folders_intentional_v1';

export interface UseFoldersParams {
  folders: Folder[];
  cards: WordCard[];
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  setCards: Dispatch<SetStateAction<WordCard[]>>;
  setMenuVisible: Dispatch<SetStateAction<boolean>>;
  /** Told how many words a move left behind because the target already had them. */
  onDuplicatesSkipped?(count: number): void;
  onCardsDeleted?(removed: readonly WordCard[], remaining: readonly WordCard[]): void;
}

export interface UseFoldersReturn {
  // State
  folderSelectionMode: boolean;
  selectedFolderIds: Set<string>;
  folderReorderMode: boolean;
  movePickerVisible: boolean;
  setMovePickerVisible: Dispatch<SetStateAction<boolean>>;
  // Folder selection
  enterFolderSelectionMode(): void;
  exitFolderSelectionMode(): void;
  toggleFolderSelect(id: string): void;
  selectAllFolders(): void;
  deleteSelectedFolders(): void;
  // Folder reorder
  enterFolderReorderMode(): void;
  exitFolderReorderMode(): void;
  // CRUD
  createFolder(name: string, icon?: string): void;
  deleteFolder(id: string): void;
  renameFolder(id: string, name: string, icon: string): void;
  // Move-card-to-folder
  openMovePicker(ids: string[]): void;
  moveCardsToFolder(targetFolderId: string): void;
}

export function useFolders({
  folders, cards, setFolders, setCards, setMenuVisible, onDuplicatesSkipped, onCardsDeleted,
}: UseFoldersParams): UseFoldersReturn {
  const [folderSelectionMode, setFolderSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [folderReorderMode, setFolderReorderMode] = useState(false);
  const [movePickerVisible, setMovePickerVisible] = useState(false);
  const [pendingMoveIds, setPendingMoveIds] = useState<string[]>([]);

  const exitFolderSelectionMode = () => {
    setFolderSelectionMode(false);
    setSelectedFolderIds(new Set());
  };

  const exitFolderReorderMode = () => setFolderReorderMode(false);

  const enterFolderSelectionMode = () => {
    setSelectedFolderIds(new Set());
    setFolderSelectionMode(true);
    setFolderReorderMode(false);
    setMenuVisible(false);
  };

  const enterFolderReorderMode = () => {
    setFolderReorderMode(true);
    setFolderSelectionMode(false);
    setSelectedFolderIds(new Set());
    setMenuVisible(false);
  };

  const toggleFolderSelect = (id: string) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllFolders = () => {
    setSelectedFolderIds(prev => {
      const allSelected = folders.length > 0 && folders.every(folder => prev.has(folder.id));
      return allSelected ? new Set() : new Set(folders.map(folder => folder.id));
    });
  };

  const deleteSelectedFolders = () => {
    const plan = planFolderDeletion(folders, cards, selectedFolderIds);
    if (!plan) return;
    setFolders(plan.folders);
    if (plan.folders.length === 0) void AsyncStorage.setItem(EMPTY_FOLDERS_KEY, 'true');
    setCards(plan.cards);
    if (plan.deletedCards.length > 0) onCardsDeleted?.(plan.deletedCards, plan.cards);
    exitFolderSelectionMode();
  };

  const createFolder = (name: string, icon = 'folder-outline') => {
    const folder: Folder = {
      id: createId('folder'),
      name,
      icon,
      createdAt: Date.now(),
      notifSettings: createDefaultFolderNotifSettings(),
    };
    setFolders(prev => [...prev, folder]);
    void AsyncStorage.removeItem(EMPTY_FOLDERS_KEY);
    posthog?.capture('folder_created');
  };

  const deleteFolder = (id: string) => {
    const plan = planFolderDeletion(folders, cards, new Set([id]));
    if (!plan) return;
    setFolders(plan.folders);
    if (plan.folders.length === 0) void AsyncStorage.setItem(EMPTY_FOLDERS_KEY, 'true');
    setCards(plan.cards);
    if (plan.deletedCards.length > 0) onCardsDeleted?.(plan.deletedCards, plan.cards);
    posthog?.capture('folder_deleted');
  };

  const renameFolder = (id: string, name: string, icon: string) => {
    if (!folders.some(folder => folder.id === id)) return;
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name, icon } : f));
    posthog?.capture('folder_renamed');
  };

  const openMovePicker = (ids: string[]) => {
    setPendingMoveIds(ids);
    setMovePickerVisible(true);
  };

  // Moves the pending cards to the target folder. Does NOT exit card-selection
  // mode — the call site in App.tsx composes that concern.
  /**
   * Moves the selected words, leaving behind any that would duplicate a word
   * already in the target folder.
   *
   * The plan is computed against the same card array being updated, so the
   * decision and the write see identical data. A blocked word is not deleted or
   * merged — it simply stays in the folder it is in, and the user is told how
   * many did.
   */
  const moveCardsToFolder = (targetFolderId: string) => {
    const { movableIds, blockedIds } = planFolderMove(cards, pendingMoveIds, targetFolderId);
    if (blockedIds.length > 0) onDuplicatesSkipped?.(blockedIds.length);
    if (movableIds.length === 0) return;
    const moving = new Set(movableIds);
    setCards(prev => prev.map(c => moving.has(c.id) ? { ...c, folderId: targetFolderId } : c));
    posthog?.capture('cards_moved_to_folder', {
      moved_count: movableIds.length,
      duplicates_skipped: blockedIds.length,
    });
  };

  return {
    folderSelectionMode,
    selectedFolderIds,
    folderReorderMode,
    movePickerVisible,
    setMovePickerVisible,
    enterFolderSelectionMode,
    exitFolderSelectionMode,
    toggleFolderSelect,
    selectAllFolders,
    deleteSelectedFolders,
    enterFolderReorderMode,
    exitFolderReorderMode,
    createFolder,
    deleteFolder,
    renameFolder,
    openMovePicker,
    moveCardsToFolder,
  };
}
