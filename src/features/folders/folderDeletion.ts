import type { Folder, WordCard } from '../../types';

export interface FolderDeletionPlan {
  folders: Folder[];
  cards: WordCard[];
  deletedCards: WordCard[];
}

/** Deleting a folder also deletes its cards; no cards move to another folder. */
export function planFolderDeletion(
  folders: readonly Folder[],
  cards: readonly WordCard[],
  deletedIds: ReadonlySet<string>,
): FolderDeletionPlan | null {
  const surviving = folders.filter(folder => !deletedIds.has(folder.id));
  if (surviving.length === folders.length) return null;
  if (surviving.length === 0) {
    return { folders: [], cards: [], deletedCards: [...cards] };
  }
  const deletedCards = cards.filter(card => Boolean(card.folderId && deletedIds.has(card.folderId)));
  return {
    folders: surviving,
    cards: cards.filter(card => !card.folderId || !deletedIds.has(card.folderId)),
    deletedCards,
  };
}
