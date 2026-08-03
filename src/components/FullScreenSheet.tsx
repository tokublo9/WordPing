import type { PropsWithChildren } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../types';

type Props = PropsWithChildren<{
  visible: boolean;
  pal: Palette;
  onRequestClose(): void;
}>;

/**
 * Presentation shared with the standalone Text-to-Speech screen. There is no
 * snap-point configuration in that screen: it is a full-screen slide modal
 * whose interactive content begins below the device safe area.
 */
export function FullScreenSheet({ visible, pal, onRequestClose, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onRequestClose}
    >
      <View
        style={[
          styles.screen,
          {
            backgroundColor: pal.bg,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {children}
      </View>
    </Modal>
  );
}

export const FULL_SCREEN_SHEET_HEADER = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: 8,
  paddingTop: 8,
  paddingBottom: 4,
  borderBottomWidth: StyleSheet.hairlineWidth,
};

export const FULL_SCREEN_SHEET_HEADER_ACTION = {
  width: 44,
  height: 40,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export const FULL_SCREEN_SHEET_TITLE = {
  flex: 1,
  textAlign: 'center' as const,
  fontSize: 17,
  fontWeight: '600' as const,
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
