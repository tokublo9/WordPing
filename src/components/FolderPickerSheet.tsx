import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AdBannerPlaceholder, AD_BANNER_HEIGHT } from './AdBannerPlaceholder';

import type { Folder, Palette } from '../types';
import { useLang } from '../i18n';

const SCREEN_H  = Dimensions.get('window').height;
const SHEET_H   = Math.round(SCREEN_H * 0.85);

interface Props {
  visible: boolean;
  onClose: () => void;
  folders: Folder[];
  /** Cards being moved are already in this folder — exclude it from the list. */
  currentFolderId: string | null;
  pal: Palette;
  themeColor: string;
  onSelect: (targetFolderId: string) => void;
  isSubscribed?: boolean;
}

export function FolderPickerSheet({
  visible, onClose, folders, currentFolderId, pal, themeColor, onSelect, isSubscribed,
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();

  const slideY          = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideY.setValue(SCREEN_H);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(slideY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  const close = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideY, { toValue: SCREEN_H, duration: 220, useNativeDriver: false }),
    ]).start(() => onClose());
  };

  const handleSelect = (folderId: string) => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: false }),
      Animated.timing(slideY, { toValue: SCREEN_H, duration: 200, useNativeDriver: false }),
    ]).start(() => {
      onClose();
      onSelect(folderId);
    });
  };

  const targets = folders.filter(f => f.id !== currentFolderId);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={close}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <View style={styles.sheetOuter} pointerEvents="box-none">
        <View style={styles.sheetFill} pointerEvents="box-none">
          <Animated.View style={{ transform: [{ translateY: slideY }] }}>
            {/* Rounded content sheet */}
            <View style={[styles.sheet, { backgroundColor: pal.dialog, height: SHEET_H - (isSubscribed ? 0 : AD_BANNER_HEIGHT) - insets.bottom }]}>
              {/* Header */}
              <View style={[styles.header, { borderBottomColor: pal.border }]}>
                <Text style={[styles.title, { color: pal.text }]}>{t('move_to_folder')}</Text>
                <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={pal.sub} />
                </TouchableOpacity>
              </View>

              {/* Folder list */}
              <ScrollView
                style={{ flex: 1 }}
                bounces={false}
                showsVerticalScrollIndicator={false}
              >
                {targets.map(folder => (
                  <TouchableOpacity
                    key={folder.id}
                    style={[styles.row, { borderBottomColor: pal.border }]}
                    onPress={() => handleSelect(folder.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: (folder.color ?? themeColor) + '22' }]}>
                      <Ionicons
                        name={(folder.icon ?? 'folder-outline') as any}
                        size={20}
                        color={folder.color ?? themeColor}
                      />
                    </View>
                    <Text style={[styles.folderName, { color: pal.text }]} numberOfLines={1}>
                      {folder.name}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={pal.sub} />
                  </TouchableOpacity>
                ))}
                {targets.length === 0 && (
                  <Text style={[styles.empty, { color: pal.sub }]}>No other folders</Text>
                )}
              </ScrollView>
            </View>

            {/* Banner — outside the rounded sheet, matching main-screen ad position */}
            {!isSubscribed && <AdBannerPlaceholder pal={pal} />}

            {/* Safe-area spacer */}
            {insets.bottom > 0 && (
              <View style={{ height: insets.bottom, backgroundColor: pal.chip }} />
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:   { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetOuter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetFill:  { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: { flex: 1, fontSize: 16 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 14 },
});
