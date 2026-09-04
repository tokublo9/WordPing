import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Folder, WordCard } from '../../types';
import { planFolderMove } from '../cards/duplicates';
import { createId } from '../../utils/createId';
import { createDefaultFolderNotifSettings } from '../notifications/defaultSettings';

export interface UseFoldersParams {
  folders: Folder[];
  fallbackFolderName: string;
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  setCards: Dispatch<SetStateAction<WordCard[]>>;
  setMenuVisible: Dispatch<SetStateAction<boolean>>;
  /** Told how many words a move left behind because the target already had them. */
  onDuplicatesSkipped?(count: number): void;
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
  folders, fallbackFolderName, setFolders, setCards, setMenuVisible, onDuplicatesSkipped,
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
    const surviving = folders.filter(f => !selectedFolderIds.has(f.id));
    if (surviving.length > 0) {
      setFolders(surviving);
      setCards(prev => prev.map(c =>
        c.folderId && selectedFolderIds.has(c.folderId) ? { ...c, folderId: surviving[0].id } : c
      ));
    } else {
      const fallback: Folder = {
        id: createId('folder'),
        name: fallbackFolderName,
        createdAt: Date.now(),
        notifSettings: createDefaultFolderNotifSettings(),
      };
      setFolders([fallback]);
      setCards(prev => prev.map(c =>
        c.folderId && selectedFolderIds.has(c.folderId) ? { ...c, folderId: fallback.id } : c
      ));
    }
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
  };

  const deleteFolder = (id: string) => {
    const remaining = folders.filter(f => f.id !== id);
    if (remaining.length > 0) {
      setFolders(remaining);
      setCards(prev => prev.map(c => c.folderId === id ? { ...c, folderId: remaining[0].id } : c));
    } else {
      const fallback: Folder = {
        id: createId('folder'),
        name: fallbackFolderName,
        createdAt: Date.now(),
        notifSettings: createDefaultFolderNotifSettings(),
      };
      setFolders([fallback]);
      setCards(prev => prev.map(c => c.folderId === id ? { ...c, folderId: fallback.id } : c));
    }
  };

  const renameFolder = (id: string, name: string, icon: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name, icon } : f));
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
    setCards(prev => {
      const { movableIds, blockedIds } = planFolderMove(prev, pendingMoveIds, targetFolderId);
      if (blockedIds.length > 0) onDuplicatesSkipped?.(blockedIds.length);
      if (movableIds.length === 0) return prev;
      const moving = new Set(movableIds);
      return prev.map(c => moving.has(c.id) ? { ...c, folderId: targetFolderId } : c);
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
