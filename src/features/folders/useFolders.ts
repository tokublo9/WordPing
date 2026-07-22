import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Folder, WordCard } from '../../types';

export interface UseFoldersParams {
  folders: Folder[];
  fallbackFolderName: string;
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  setCards: Dispatch<SetStateAction<WordCard[]>>;
  setMenuVisible: Dispatch<SetStateAction<boolean>>;
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

export function useFolders({ folders, fallbackFolderName, setFolders, setCards, setMenuVisible }: UseFoldersParams): UseFoldersReturn {
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
      const fallback: Folder = { id: Date.now().toString(), name: fallbackFolderName, createdAt: Date.now() };
      setFolders([fallback]);
      setCards(prev => prev.map(c =>
        c.folderId && selectedFolderIds.has(c.folderId) ? { ...c, folderId: fallback.id } : c
      ));
    }
    exitFolderSelectionMode();
  };

  const createFolder = (name: string, icon = 'folder-outline') => {
    const folder: Folder = { id: Date.now().toString(), name, icon, createdAt: Date.now() };
    setFolders(prev => [...prev, folder]);
  };

  const deleteFolder = (id: string) => {
    const remaining = folders.filter(f => f.id !== id);
    if (remaining.length > 0) {
      setFolders(remaining);
      setCards(prev => prev.map(c => c.folderId === id ? { ...c, folderId: remaining[0].id } : c));
    } else {
      const fallback: Folder = { id: Date.now().toString(), name: fallbackFolderName, createdAt: Date.now() };
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
  const moveCardsToFolder = (targetFolderId: string) => {
    setCards(prev => prev.map(c => pendingMoveIds.includes(c.id) ? { ...c, folderId: targetFolderId } : c));
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
