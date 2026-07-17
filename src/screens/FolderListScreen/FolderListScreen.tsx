import { useCallback } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Folder, Palette, WordCard } from '../../types';
import { appStyles as s } from '../../styles';
import { useLang } from '../../i18n';
import { AD_BANNER_HEIGHT } from '../../components/AdBannerPlaceholder';
import { SwipeableFolder } from '../../components/SwipeableFolder';
import { ReorderableList } from '../../components/ReorderableList';

const SEL_BAR_H = 68;

const emptyIconWrap = {
  width: 80, height: 80, borderRadius: 24,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  marginBottom: 20,
};

export interface FolderListScreenProps {
  pal: Palette;
  themeColor: string;
  isSubscribed: boolean;

  folders: Folder[];
  cards: WordCard[];

  selection: {
    active: boolean;
    selectedIds: Set<string>;
    onToggle(id: string): void;
    onExit(): void;
    onDelete(): void;
  };

  reorder: {
    active: boolean;
    onExit(): void;
    onReorder(orderedIds: string[]): void;
  };

  actions: {
    onOpenFolder(id: string): void;
    onAddFolder(): void;
    onEditFolder(folder: Folder): void;
    onDeleteFolder(id: string): void;
    onOpenMenu(): void;
  };

  menuBtnRef: React.RefObject<View | null>;
  closeOpenFolder: React.RefObject<(() => void) | null>;
  onFolderOpen(close: () => void): void;
}

export function FolderListScreen({
  pal, themeColor, isSubscribed,
  folders, cards,
  selection, reorder, actions,
  menuBtnRef, closeOpenFolder, onFolderOpen,
}: FolderListScreenProps) {
  const t = useLang();

  const renderFolderItem = useCallback(({ item }: { item: Folder }) => {
    const count      = cards.filter(c => c.folderId === item.id).length;
    const folderIcon = item.icon ?? 'folder-outline';
    return (
      <SwipeableFolder
        folder={item}
        cardCount={count}
        pal={pal}
        themeColor={themeColor}
        folderColor={themeColor}
        folderIcon={folderIcon}
        onOpen={onFolderOpen}
        onPress={() => actions.onOpenFolder(item.id)}
        onEdit={() => actions.onEditFolder(item)}
        onDelete={() => actions.onDeleteFolder(item.id)}
        selectionMode={selection.active}
        selected={selection.selectedIds.has(item.id)}
        onToggleSelect={() => selection.onToggle(item.id)}
      />
    );
  // Stable deps: callbacks and primitives only. cards/folders trigger re-renders via FlatList data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal, themeColor, selection.active, selection.selectedIds, onFolderOpen, actions]);

  // ── Header ───────────────────────────────────────────────────────────────────
  const header = selection.active ? (
    <View style={s.header}>
      <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
        {selection.selectedIds.size} {t('selected')}
      </Text>
      <TouchableOpacity style={s.iconBtn} onPress={selection.onExit}>
        <Text style={{ color: themeColor, fontSize: 16, fontWeight: '600' }}>
          {t('cancel')}
        </Text>
      </TouchableOpacity>
    </View>
  ) : reorder.active ? (
    <View style={s.header}>
      <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
        {t('reorder_cards')}
      </Text>
      <TouchableOpacity style={s.iconBtn} onPress={reorder.onExit}>
        <Text style={{ color: themeColor, fontSize: 16, fontWeight: '600' }}>
          {t('done')}
        </Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={s.header}>
      <Text style={[s.title, { color: pal.text }]}>WordPing</Text>
      <View style={s.headerIcons}>
        <TouchableOpacity style={s.iconBtn} onPress={actions.onAddFolder}>
          <MaterialCommunityIcons name="folder-plus-outline" size={22} color={pal.sub} />
        </TouchableOpacity>
        <View ref={menuBtnRef}>
          <TouchableOpacity style={s.iconBtn} onPress={actions.onOpenMenu}>
            <Ionicons name="ellipsis-vertical" size={22} color={pal.sub} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── Content ──────────────────────────────────────────────────────────────────
  const folderData = Object.fromEntries(
    folders.map(f => [
      f.id,
      {
        icon:      f.icon ?? 'folder-outline',
        color:     themeColor,
        cardCount: cards.filter(c => c.folderId === f.id).length,
      },
    ])
  );

  const content = folders.length === 0 ? (
    <View style={s.empty}>
      <View style={[emptyIconWrap, { backgroundColor: themeColor + '18' }]}>
        <Ionicons name="folder-outline" size={40} color={themeColor} />
      </View>
      <Text style={[s.emptyTitle, { color: pal.text }]}>{t('no_folders_title')}</Text>
      <Text style={[s.emptyHint,  { color: pal.sub  }]}>{t('no_folders_hint')}</Text>
    </View>
  ) : reorder.active ? (
    <ReorderableList
      cards={folders.map(f => ({ id: f.id, word: f.name, meaning: '', note: '' }))}
      onReorder={reordered => reorder.onReorder(reordered.map(c => c.id))}
      pal={pal}
      themeColor={themeColor}
      extraPaddingBottom={isSubscribed ? 0 : AD_BANNER_HEIGHT}
      folderData={folderData}
    />
  ) : (
    <>
      <FlatList
        data={folders}
        keyExtractor={f => f.id}
        renderItem={renderFolderItem}
        ListFooterComponent={undefined}
        contentContainerStyle={[
          s.list,
          { paddingBottom: s.list.paddingBottom + (isSubscribed ? 0 : AD_BANNER_HEIGHT) + (selection.active ? SEL_BAR_H : 0) },
        ]}
        showsVerticalScrollIndicator={false}
      />
      {selection.active && (
        <View style={[selStyles.bar, { backgroundColor: pal.dialog, borderTopColor: pal.border }]}>
          <TouchableOpacity
            style={selStyles.barBtn}
            onPress={selection.onDelete}
            disabled={selection.selectedIds.size === 0}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={selection.selectedIds.size === 0 ? pal.sub : '#E05C5C'}
            />
            <Text style={[selStyles.barLabel, { color: selection.selectedIds.size === 0 ? pal.sub : '#E05C5C' }]}>
              {t('delete')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <>
      {header}
      <Text style={[s.wordCount, { color: pal.sub }]}>
        {folders.length} {t(folders.length === 1 ? 'folders_singular' : 'folders_plural')}
      </Text>
      {content}
    </>
  );
}

const selStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: SEL_BAR_H,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  barLabel: { fontSize: 11, fontWeight: '600' },
});
