import { useCallback, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Modal,
  PanResponder, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { Folder, Palette } from '../types';
import { useLang } from '../i18n';

const REVEAL_W  = 130;
const SCREEN_H  = Dimensions.get('window').height;
const MENU_H    = 52 * 2 + 1; // 2 rows × ~52px + 1 hairline divider

interface LiftedLayout { pageX: number; pageY: number; width: number; height: number }

interface Props {
  folder: Folder;
  cardCount: number;
  pal: Palette;
  themeColor: string;
  folderColor: string;
  folderIcon: string;
  onOpen: (close: () => void) => void;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  untestedCount: number;
  showLevelLabels?: boolean;
}

export function SwipeableFolder({
  folder, cardCount, pal, themeColor, folderColor, folderIcon,
  onOpen, onPress, onEdit, onDelete,
  selectionMode, selected, onToggleSelect,
  untestedCount = 0,
  showLevelLabels = true,
}: Props) {
  const t          = useLang();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen     = useRef(false);
  const startX     = useRef(0);
  const rowRef     = useRef<View>(null);
  const closeRef   = useRef<() => void>(() => {});
  const openRef    = useRef<() => void>(() => {});

  const close = useCallback(() => {
    isOpen.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: false, tension: 80, friction: 12 }).start();
  }, [translateX]);

  const open = useCallback(() => {
    isOpen.current = true;
    onOpen(close);
    Animated.spring(translateX, { toValue: -REVEAL_W, useNativeDriver: false, tension: 80, friction: 12 }).start();
  }, [translateX, close, onOpen]);

  closeRef.current = close;
  openRef.current  = open;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 8,
      onPanResponderGrant: () => { startX.current = isOpen.current ? -REVEAL_W : 0; },
      onPanResponderMove:  (_, { dx }) => {
        translateX.setValue(Math.min(0, Math.max(-REVEAL_W, startX.current + dx)));
      },
      onPanResponderRelease: (_, { dx }) => {
        if (startX.current === 0) dx < -5 ? openRef.current() : closeRef.current();
        else                       dx < -30 ? openRef.current() : closeRef.current();
      },
      onPanResponderTerminate:        () => { closeRef.current(); },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  // ── Long-press lift ──────────────────────────────────────────────────────────
  const [lifted, setLifted] = useState<LiftedLayout | null>(null);
  const liftScale = useRef(new Animated.Value(1)).current;

  const handleLongPress = () => {
    if (isOpen.current) return;
    rowRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      liftScale.setValue(0.97);
      setLifted({ pageX, pageY, width, height });
      Animated.spring(liftScale, {
        toValue: 1.03,
        useNativeDriver: true,
        tension: 180,
        friction: 7,
      }).start();
    });
  };

  const dismissLifted = () => {
    setLifted(null);
    liftScale.setValue(1);
  };

  const menuBelow = lifted ? lifted.pageY + lifted.height + MENU_H + 16 < SCREEN_H : true;
  const menuTop   = lifted
    ? menuBelow ? lifted.pageY + lifted.height + 10 : lifted.pageY - MENU_H - 10
    : 0;

  const handleEdit = () => { dismissLifted(); onEdit(); };
  const handleDelete = () => {
    dismissLifted();
    Alert.alert(t('delete_folder'), folder.name, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: onDelete },
    ]);
  };

  const handleTap = () => { isOpen.current ? close() : onPress(); };

  const deleteWithConfirm = () => {
    Alert.alert(t('delete_folder'), folder.name, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: onDelete },
    ]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View ref={rowRef} style={[styles.row, selectionMode && styles.rowSelect]}>

      {/* Selection circle */}
      {selectionMode && (
        <TouchableOpacity
          style={styles.selCircleWrap}
          onPress={onToggleSelect}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={[styles.selCircle, { borderColor: folderColor }, selected && { backgroundColor: folderColor }]}>
            {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        </TouchableOpacity>
      )}

      {/* Swipe-reveal action buttons */}
      {!selectionMode && (
        <View style={styles.actionBg}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#A0A0A0' }]}
            onPress={() => { close(); setTimeout(onEdit, 220); }}
          >
            <Ionicons name="pencil-outline" size={17} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#E05C5C' }]}
            onPress={() => { close(); setTimeout(deleteWithConfirm, 220); }}
          >
            <Ionicons name="trash-outline" size={17} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Folder row */}
      <Animated.View
        style={[
          styles.itemOuter,
          selectionMode
            ? { flex: 1, transform: [{ translateX: 0 }] }
            : { transform: [{ translateX }] },
        ]}
        {...(selectionMode ? {} : panResponder.panHandlers)}
      >
        <TouchableOpacity
          style={[
            styles.item, { backgroundColor: pal.card },
            selected && { backgroundColor: folderColor + '18' },
          ]}
          onPress={selectionMode ? onToggleSelect : handleTap}
          onLongPress={selectionMode ? undefined : handleLongPress}
          delayLongPress={380}
          activeOpacity={selectionMode ? 0.7 : 1}
        >
          {selectionMode ? (
            <View style={[styles.iconWrap, { backgroundColor: folderColor + '22' }]}>
              <Ionicons name={folderIcon as any} size={22} color={folderColor} />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { isOpen.current ? close() : onEdit(); }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            >
              <View style={[styles.iconWrap, { backgroundColor: folderColor + '22' }]}>
                <Ionicons name={folderIcon as any} size={22} color={folderColor} />
              </View>
            </TouchableOpacity>
          )}
          <View style={styles.textBlock}>
            <Text style={[styles.name, { color: pal.text }]} numberOfLines={1}>{folder.name}</Text>
            <Text style={[styles.count, { color: pal.sub }]}>
              {cardCount} {t(cardCount === 1 ? 'words_singular' : 'words_plural')}
            </Text>
          </View>
          {((folder.notifSettings?.intervalSeconds ?? 0) > 0 || (showLevelLabels && cardCount > 0)) && (
            <View style={styles.trailingIcons}>
              {(folder.notifSettings?.intervalSeconds ?? 0) > 0 && (
                <Ionicons name="notifications" size={19} color={themeColor} />
              )}
              {showLevelLabels && (
                <FolderTestBadge
                  cardCount={cardCount}
                  untestedCount={untestedCount}
                  themeColor={themeColor}
                  pal={pal}
                />
              )}
            </View>
          )}
          {!selectionMode && <Ionicons name="chevron-forward" size={16} color={pal.sub} />}
        </TouchableOpacity>
      </Animated.View>

      {/* Long-press overlay */}
      {!selectionMode && lifted && (
        <Modal visible transparent animationType="fade" onRequestClose={dismissLifted}>
          <View style={StyleSheet.absoluteFill}>
            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />

            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={dismissLifted} activeOpacity={1} />

            {/* Lifted folder row clone */}
            <Animated.View
              style={[
                styles.liftedRow,
                {
                  left: lifted.pageX,
                  top: lifted.pageY,
                  width: lifted.width,
                  backgroundColor: pal.card,
                  transform: [{ scale: liftScale }],
                },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: folderColor + '22' }]}>
                <Ionicons name={folderIcon as any} size={22} color={folderColor} />
              </View>
              <View style={styles.textBlock}>
                <Text style={[styles.name, { color: pal.text }]} numberOfLines={1}>{folder.name}</Text>
                <Text style={[styles.count, { color: pal.sub }]}>
                  {cardCount} {t(cardCount === 1 ? 'words_singular' : 'words_plural')}
                </Text>
              </View>
              {((folder.notifSettings?.intervalSeconds ?? 0) > 0 || (showLevelLabels && cardCount > 0)) && (
                <View style={styles.trailingIcons}>
                  {(folder.notifSettings?.intervalSeconds ?? 0) > 0 && (
                    <Ionicons name="notifications" size={19} color={themeColor} />
                  )}
                  {showLevelLabels && (
                    <FolderTestBadge
                      cardCount={cardCount}
                      untestedCount={untestedCount}
                      themeColor={themeColor}
                      pal={pal}
                    />
                  )}
                </View>
              )}
            </Animated.View>

            {/* Action menu */}
            <View style={[
              styles.menu,
              { backgroundColor: pal.dialog, left: lifted.pageX, top: menuTop, width: lifted.width },
            ]}>
              <MenuRow icon="pencil-outline" label={t('edit')}   pal={pal} onPress={handleEdit} />
              <Sep pal={pal} />
              <MenuRow icon="trash-outline"  label={t('delete')} pal={pal} color="#E05C5C" onPress={handleDelete} />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ── Folder test-status badge ─────────────────────────────────────────────────
// Simpler than TestStatusIcon: no graduation cap — just a checkmark or count.
function FolderTestBadge({ cardCount, untestedCount, themeColor, pal }: {
  cardCount: number;
  untestedCount: number;
  themeColor: string;
  pal: Palette;
}) {
  if (cardCount === 0) return null;
  if (untestedCount === 0) {
    return <Ionicons name="checkmark-circle" size={21} color={themeColor} />;
  }
  const over99 = untestedCount > 99;
  const label  = over99 ? '99+' : String(untestedCount);
  const twoDigit = !over99 && untestedCount >= 10;
  return (
    <View style={[
      badgeStyles.circle,
      over99 && badgeStyles.pill,
      { backgroundColor: pal.card, borderColor: themeColor, borderWidth: 1 },
    ]}>
      <Text style={[badgeStyles.text, twoDigit && badgeStyles.textSm, { color: themeColor }]}>
        {label}
      </Text>
    </View>
  );
}

function MenuRow({ icon, label, pal, color, onPress }: {
  icon: string; label: string; pal: Palette; color?: string; onPress: () => void;
}) {
  const c = color ?? pal.text;
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      <Ionicons name={icon as any} size={18} color={c} />
      <Text style={[styles.menuLabel, { color: c }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Sep({ pal }: { pal: Palette }) {
  return <View style={[styles.sep, { backgroundColor: pal.border }]} />;
}

const styles = StyleSheet.create({
  row:       { marginBottom: 10 },
  rowSelect: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  selCircleWrap: { paddingHorizontal: 4 },
  selCircle: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },

  actionBg: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: REVEAL_W, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-evenly',
  },
  actionBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },

  itemOuter: {
    borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  name:  { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  count: { fontSize: 13 },
  trailingIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Long-press overlay
  liftedRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  menu: {
    position: 'absolute', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 15, paddingHorizontal: 16,
  },
  menuLabel: { fontSize: 15 },
  sep: { height: StyleSheet.hairlineWidth },
});

const badgeStyles = StyleSheet.create({
  // Fixed square → perfect circle for counts 1–99.
  circle: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  // Wider pill only for "99+" so the text stays readable.
  pill: {
    width: undefined, paddingHorizontal: 5,
  },
  text:   { fontSize: 11, fontWeight: '700', lineHeight: 13 },
  textSm: { fontSize: 9 },
});
