import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Folder, WordCard } from '../../types';

export interface UseFoldersParams {
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

export function useFolders({ setFolders, setCards, setMenuVisible }: UseFoldersParams): UseFoldersReturn {
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

  const deleteSelectedFolders = () => {
    setFolders(prev => prev.filter(f => !selectedFolderIds.has(f.id)));
    exitFolderSelectionMode();
  };

  const createFolder = (name: string, icon = 'folder-outline') => {
    const folder: Folder = { id: Date.now().toString(), name, icon, createdAt: Date.now() };
    setFolders(prev => [...prev, folder]);
  };

  const deleteFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
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
